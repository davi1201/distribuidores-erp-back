import {
  Injectable,
  BadRequestException,
  Logger,
  NotFoundException,
  InternalServerErrorException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from 'src/prisma/prisma.service';
import { clerkClient } from '@clerk/clerk-sdk-node';
import Stripe from 'stripe';

@Injectable()
export class PaymentService {
  private stripe: Stripe;
  private readonly logger = new Logger(PaymentService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {
    this.stripe = new Stripe(
      this.configService.getOrThrow<string>('STRIPE_SECRET_KEY'),
      {
        apiVersion: '2025-11-17.clover' as any, // Ajuste de versão se necessário
      },
    );
  }

  // ... (createCheckoutSession e createPortalSession mantidos iguais) ...

  async createCheckoutSession(
    tenantId: string,
    planSlug: string,
    userEmail: string,
    cycle: 'monthly' | 'yearly',
  ) {
    const plan = await this.prisma.plan.findUnique({
      where: { slug: planSlug },
    });

    if (!plan) throw new NotFoundException('Plano não encontrado.');

    const isYearly = cycle === 'yearly';
    const priceId = isYearly
      ? plan.stripeYearlyPriceId
      : plan.stripeMonthlyPriceId;

    if (!priceId) {
      throw new BadRequestException('Preço não configurado para este ciclo.');
    }

    const sessionConfig: Stripe.Checkout.SessionCreateParams = {
      payment_method_types: ['card', 'pix'],
      ui_mode: 'embedded', // 👈 obrigatório para parcelamento aparecer
      customer_email: userEmail,
      line_items: [{ price: priceId, quantity: 1 }],
      metadata: { tenantId, planSlug },
      return_url: `${this.getFrontendUrl()}?session_id={CHECKOUT_SESSION_ID}`,
      allow_promotion_codes: true,
      mode: isYearly ? 'payment' : 'subscription',
      currency: 'brl',
      ...(isYearly && {
        payment_method_options: {
          card: {
            installments: {
              enabled: true,
            },
          },
        },
      }),
    };

    const session = await this.stripe.checkout.sessions.create(sessionConfig);

    // Adicione isso temporariamente para debug
    console.log(
      'Session payment_method_options:',
      JSON.stringify(session.payment_method_options, null, 2),
    );

    // No modo embedded, retorna o clientSecret (não a URL)
    return { clientSecret: session.client_secret };
  }

  async createPortalSession(tenantId: string) {
    const sub = await this.prisma.subscription.findFirst({
      where: {
        tenantId,
        status: { in: ['active', 'trialing', 'past_due'] },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!sub?.customerId) {
      throw new BadRequestException('Nenhuma assinatura ativa encontrada.');
    }

    const session = await this.stripe.billingPortal.sessions.create({
      customer: sub.customerId,
      return_url: `${this.getFrontendUrl()}/billing`,
    });

    return { url: session.url };
  }

  // --- WEBHOOK ENTRY POINT ---
  async handleStripeWebhook(signature: string, rawBody: Buffer) {
    let event: Stripe.Event;

    try {
      event = this.stripe.webhooks.constructEvent(
        rawBody,
        signature,
        this.configService.getOrThrow<string>('STRIPE_WEBHOOK_SECRET'),
      );
    } catch (err) {
      this.logger.error(`Webhook Signature Error: ${err.message}`);
      throw new BadRequestException('Webhook Inválido');
    }

    const object = event.data.object as any;

    try {
      switch (event.type) {
        case 'checkout.session.completed':
          await this.handleCheckoutCompleted(object as Stripe.Checkout.Session);
          break;

        case 'invoice.payment_succeeded':
          await this.handleInvoiceSucceeded(object as Stripe.Invoice);
          break;

        case 'customer.subscription.created':
        case 'customer.subscription.updated':
          // Lógica vital para troca de plano
          await this.handleSubscriptionUpdated(object as Stripe.Subscription);
          break;

        case 'invoice.payment_failed':
          await this.handleInvoicePaymentFailed(object as Stripe.Invoice);
          break;

        case 'customer.subscription.deleted':
          await this.handleSubscriptionDeleted(object as Stripe.Subscription);
          break;

        case 'product.created':
        case 'product.updated':
          await this.handleProductSync(object as Stripe.Product);
          break;

        case 'price.created':
        case 'price.updated':
          await this.handlePriceSync(object as Stripe.Price);
          break;
      }
    } catch (error) {
      this.logger.error(
        `Erro processando evento ${event.type}: ${error.message}`,
      );
      throw new InternalServerErrorException(error.message);
    }

    return { received: true };
  }

  // --- HANDLERS ---

  private async handleCheckoutCompleted(session: Stripe.Checkout.Session) {
    if (session.mode !== 'subscription') return;

    const tenantId = session.metadata?.tenantId;
    const planSlug = session.metadata?.planSlug;
    const subscriptionId = session.subscription as string;
    const customerId = session.customer as string;

    if (!tenantId || !planSlug || !subscriptionId) return;

    const plan = await this.prisma.plan.findUnique({
      where: { slug: planSlug },
    });

    if (!plan) return;

    const stripeSub = (await this.stripe.subscriptions.retrieve(
      subscriptionId,
    )) as any;

    // Calculo seguro de datas
    const now = new Date();
    const startDate = stripeSub.current_period_start
      ? new Date(stripeSub.current_period_start * 1000)
      : now;
    const endDate = stripeSub.current_period_end
      ? new Date(stripeSub.current_period_end * 1000)
      : new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

    const validStart = !isNaN(startDate.getTime()) ? startDate : now;
    const validEnd = !isNaN(endDate.getTime())
      ? endDate
      : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

    // Transaction para garantir consistência
    await this.prisma.$transaction(async (tx) => {
      // 1. Atualiza Assinatura
      await tx.subscription.upsert({
        where: { externalId: subscriptionId },
        create: {
          tenantId,
          planId: plan.id,
          externalId: subscriptionId,
          customerId: customerId,
          status: stripeSub.status || 'active',
          currentPeriodStart: validStart,
          currentPeriodEnd: validEnd,
        },
        update: {
          status: stripeSub.status || 'active',
          planId: plan.id,
          currentPeriodStart: validStart,
          currentPeriodEnd: validEnd,
        },
      });

      // 2. Atualiza Tenant
      await tx.tenant.update({
        where: { id: tenantId },
        data: {
          isActive: true, // Checkout completado = ativo
          planId: plan.id,
        },
      });
    });

    // Operações externas (fora da transaction do banco)
    await this.cancelOldSubscriptions(tenantId, subscriptionId);
    await this.syncClerkMetadata(tenantId, 'active', plan); // Método extraído

    this.logger.log(`Checkout processado com sucesso para Tenant: ${tenantId}`);
  }

  /**
   * CORREÇÃO PRINCIPAL: handleSubscriptionUpdated
   * Garante atualização do Tenant quando o plano muda.
   */
  private async handleSubscriptionUpdated(stripeSub: any) {
    const subscriptionId = stripeSub.id;

    // 1. Busca assinatura atual
    const existingSub = await this.prisma.subscription.findUnique({
      where: { externalId: subscriptionId },
    });

    if (!existingSub) {
      this.logger.warn(`Sub ${subscriptionId} não encontrada para update.`);
      return;
    }

    // 2. Identifica o NOVO plano pelo Price ID
    const priceId = stripeSub.items?.data?.[0]?.price?.id;
    if (!priceId) return;

    const newPlan = await this.prisma.plan.findFirst({
      where: {
        OR: [
          { stripeMonthlyPriceId: priceId },
          { stripeYearlyPriceId: priceId },
        ],
      },
    });

    if (!newPlan) {
      this.logger.error(
        `CRÍTICO: Plano não encontrado no DB para o Price ID ${priceId}. O Tenant não será atualizado.`,
      );
      return;
    }

    // 3. Verifica datas
    const now = new Date();
    const startDate = stripeSub.current_period_start
      ? new Date(stripeSub.current_period_start * 1000)
      : now;
    const endDate = stripeSub.current_period_end
      ? new Date(stripeSub.current_period_end * 1000)
      : new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

    const validStart = !isNaN(startDate.getTime()) ? startDate : now;
    const validEnd = !isNaN(endDate.getTime())
      ? endDate
      : new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

    // 4. TRANSACTION: Atualiza Subscription E Tenant juntos
    await this.prisma.$transaction(async (tx) => {
      // Atualiza a tabela de Subscription
      await tx.subscription.update({
        where: { id: existingSub.id },
        data: {
          status: stripeSub.status ?? 'active',
          planId: newPlan.id, // <--- O Pulo do gato: ID do novo plano
          currentPeriodStart: validStart,
          currentPeriodEnd: validEnd,
        },
      });

      // Atualiza a tabela de Tenant IMEDIATAMENTE
      await tx.tenant.update({
        where: { id: existingSub.tenantId },
        data: {
          planId: newPlan.id, // <--- Garante que o Tenant tenha o novo plano
          isActive: ['active', 'trialing'].includes(stripeSub.status),
        },
      });
    });

    // 5. Sincroniza Clerk (Fora da transaction pois é chamada de API)
    await this.syncClerkMetadata(
      existingSub.tenantId,
      stripeSub.status,
      newPlan,
    );

    this.logger.log(
      `Assinatura ${subscriptionId} atualizada. Novo Plano: ${newPlan.slug}`,
    );
  }

  private async handleInvoiceSucceeded(invoice: Stripe.Invoice) {
    if (invoice.billing_reason === 'subscription_create') return;

    const subscriptionId =
      typeof (invoice as any).subscription === 'string'
        ? (invoice as any).subscription
        : (invoice as any).subscription?.id;

    if (!subscriptionId) return;

    const subscription = await this.prisma.subscription.findUnique({
      where: { externalId: subscriptionId },
      include: { plan: true },
    });

    if (!subscription) return;

    const periodStart = new Date(invoice.lines.data[0].period.start * 1000);
    const periodEnd = new Date(invoice.lines.data[0].period.end * 1000);

    // Aqui só atualizamos datas, pois o webhook 'updated' cuida da troca de plano
    await this.prisma.subscription.update({
      where: { id: subscription.id },
      data: {
        status: 'active',
        currentPeriodStart: periodStart,
        currentPeriodEnd: periodEnd,
      },
    });
  }

  private async handleInvoicePaymentFailed(invoice: Stripe.Invoice) {
    const subscriptionId =
      typeof (invoice as any).subscription === 'string'
        ? (invoice as any).subscription
        : (invoice as any).subscription?.id;

    if (!subscriptionId) return;

    // Marca como past_due na subscription
    await this.prisma.subscription.updateMany({
      where: { externalId: subscriptionId },
      data: { status: 'past_due' },
    });

    // Opcional: Desativar tenant imediatamente ou esperar cancelamento
  }

  private async handleSubscriptionDeleted(subscription: Stripe.Subscription) {
    const dbSub = await this.prisma.subscription.findUnique({
      where: { externalId: subscription.id },
      include: { plan: true },
    });

    if (dbSub) {
      await this.prisma.$transaction(async (tx) => {
        await tx.subscription.update({
          where: { id: dbSub.id },
          data: { status: 'canceled' },
        });

        await tx.tenant.update({
          where: { id: dbSub.tenantId },
          data: { isActive: false },
        });
      });

      await this.syncClerkMetadata(dbSub.tenantId, 'canceled', dbSub.plan);
    }
  }

  // --- HELPERS ---

  // Refatorado para lidar APENAS com Clerk, já que o banco é tratado na transaction
  private async syncClerkMetadata(tenantId: string, status: string, plan: any) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { clerkId: true },
    });

    if (tenant?.clerkId) {
      try {
        await clerkClient.organizations.updateOrganizationMetadata(
          tenant.clerkId,
          {
            publicMetadata: {
              plan: plan.slug,
              status,
              maxUsers: plan.maxUsers,
            },
          },
        );
      } catch (error) {
        this.logger.error(`Erro ao sincronizar Clerk: ${error.message}`);
      }
    }
  }

  private async cancelOldSubscriptions(
    tenantId: string,
    currentSubscriptionId: string,
  ) {
    const oldSubs = await this.prisma.subscription.findMany({
      where: {
        tenantId,
        externalId: { not: currentSubscriptionId },
        status: { in: ['active', 'trialing', 'past_due'] },
      },
    });

    for (const sub of oldSubs) {
      try {
        await this.stripe.subscriptions.cancel(sub.externalId);
        await this.prisma.subscription.update({
          where: { id: sub.id },
          data: { status: 'canceled' },
        });
      } catch (e) {
        this.logger.error(`Erro cancelando sub antiga: ${e.message}`);
      }
    }
  }

  private async handleProductSync(product: Stripe.Product) {
    const slug = product.metadata.slug || this.generateSlug(product.name);
    const maxUsers = product.metadata.maxUsers
      ? parseInt(product.metadata.maxUsers)
      : 1;

    await this.prisma.plan.upsert({
      where: { stripeProductId: product.id },
      create: {
        stripeProductId: product.id,
        name: product.name,
        slug,
        isActive: product.active,
        maxUsers,
        price: 0,
      },
      update: {
        name: product.name,
        description: product.description,
        isActive: product.active,
        maxUsers,
      },
    });
  }

  private async handlePriceSync(price: Stripe.Price) {
    if (typeof price.product !== 'string') return;

    const plan = await this.prisma.plan.findUnique({
      where: { stripeProductId: price.product },
    });

    if (!plan) return;

    const updateData: any = {};
    const amount = price.unit_amount ? price.unit_amount / 100 : 0;

    if (price.type === 'recurring') {
      if (price.recurring?.interval === 'month') {
        updateData.stripeMonthlyPriceId = price.id;
        updateData.price = amount;
      } else if (price.recurring?.interval === 'year') {
        updateData.stripeYearlyPriceId = price.id;
        updateData.yearlyPrice = amount;
      }
    }

    if (Object.keys(updateData).length > 0) {
      await this.prisma.plan.update({
        where: { id: plan.id },
        data: updateData,
      });
    }
  }

  private getFrontendUrl(): string {
    const url =
      this.configService.get<string>('FRONTEND_URL') || 'http://localhost:3005';
    return url.replace(/\/$/, '');
  }

  private generateSlug(text: string): string {
    return text
      .toLowerCase()
      .trim()
      .replace(/\s+/g, '-')
      .replace(/[^\w\-]+/g, '')
      .replace(/\-\-+/g, '-');
  }

  // ... (getCurrentSubscription mantido igual) ...
  async getCurrentSubscription(tenantId: string) {
    const sub = await this.prisma.subscription.findFirst({
      where: {
        tenantId,
        status: { in: ['active', 'trialing', 'past_due'] },
      },
      include: { plan: true },
      orderBy: { createdAt: 'desc' },
    });

    if (!sub) return null;

    return {
      planName: sub.plan.name,
      status: sub.status,
      amount: sub.plan.price,
      cycle: 'mensal',
      nextBillingDate: sub.currentPeriodEnd,
    };
  }
}
