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
        apiVersion: '2025-11-17.clover' as any,
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
      payment_method_types: ['card'],
      ui_mode: 'embedded',
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
    // 💡 NOVO: Tratamento para compra de pacotes avulsos (Pagamento Único)
    if (session.mode === 'payment') {
      const tenantId = session.metadata?.tenantId;
      const type = session.metadata?.type;

      // Se for a compra de um pacote de boletos extras
      if (tenantId && type === 'extra_boletos') {
        const amount = parseInt(session.metadata?.amount || '0', 10);

        if (amount > 0) {
          await this.prisma.tenant.update({
            where: { id: tenantId },
            data: { extraBoletoBalance: { increment: amount } }, // 👈 Injeta no balde que NÃO expira
          });
          this.logger.log(
            `Adicionado ${amount} boletos extras ao Tenant: ${tenantId}`,
          );
        }
      }
      return; // Interrompe pois não é uma assinatura
    }

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

    await this.prisma.$transaction(async (tx) => {
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

      await tx.tenant.update({
        where: { id: tenantId },
        data: {
          isActive: true,
          planId: plan.id,
          monthlyBoletoBalance: plan.maxBoletos, // 👈 CORREÇÃO: Preenche apenas o balde mensal
        },
      });
    });

    await this.cancelOldSubscriptions(tenantId, subscriptionId);
    await this.syncClerkMetadata(tenantId, 'active', plan);

    this.logger.log(`Checkout processado com sucesso para Tenant: ${tenantId}`);
  }

  private async handleSubscriptionUpdated(stripeSub: any) {
    const subscriptionId = stripeSub.id;

    const existingSub = await this.prisma.subscription.findUnique({
      where: { externalId: subscriptionId },
    });

    if (!existingSub) {
      this.logger.warn(`Sub ${subscriptionId} não encontrada para update.`);
      return;
    }

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
        `CRÍTICO: Plano não encontrado no DB para o Price ID ${priceId}.`,
      );
      return;
    }

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

    await this.prisma.$transaction(async (tx) => {
      await tx.subscription.update({
        where: { id: existingSub.id },
        data: {
          status: stripeSub.status ?? 'active',
          planId: newPlan.id,
          currentPeriodStart: validStart,
          currentPeriodEnd: validEnd,
        },
      });

      await tx.tenant.update({
        where: { id: existingSub.tenantId },
        data: {
          planId: newPlan.id,
          isActive: ['active', 'trialing'].includes(stripeSub.status),
          monthlyBoletoBalance: newPlan.maxBoletos, // 👈 CORREÇÃO: Preenche o balde mensal ao trocar de plano
        },
      });
    });

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

    await this.prisma.$transaction(async (tx) => {
      await tx.subscription.update({
        where: { id: subscription.id },
        data: {
          status: 'active',
          currentPeriodStart: periodStart,
          currentPeriodEnd: periodEnd,
        },
      });

      // 👈 CORREÇÃO: Renova apenas o balde mensal a cada pagamento de fatura.
      // O balde extra (extraBoletoBalance) permanece intocado!
      await tx.tenant.update({
        where: { id: subscription.tenantId },
        data: {
          monthlyBoletoBalance: subscription.plan.maxBoletos,
        },
      });
    });
  }

  private async handleInvoicePaymentFailed(invoice: Stripe.Invoice) {
    const subscriptionId =
      typeof (invoice as any).subscription === 'string'
        ? (invoice as any).subscription
        : (invoice as any).subscription?.id;

    if (!subscriptionId) return;

    await this.prisma.subscription.updateMany({
      where: { externalId: subscriptionId },
      data: { status: 'past_due' },
    });
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

  private async syncClerkMetadata(tenantId: string, status: string, plan: any) {
    // 👈 Atualizado para buscar os DOIS baldes
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: {
        clerkId: true,
        monthlyBoletoBalance: true,
        extraBoletoBalance: true,
      },
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
              maxBoletos: plan.maxBoletos,
              monthlyBoletoBalance: tenant.monthlyBoletoBalance, // 👈 Sincroniza o saldo do plano
              extraBoletoBalance: tenant.extraBoletoBalance, // 👈 Sincroniza o pacote extra
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
    const maxBoletos = product.metadata.maxBoletos
      ? parseInt(product.metadata.maxBoletos)
      : 0;

    await this.prisma.plan.upsert({
      where: { stripeProductId: product.id },
      create: {
        stripeProductId: product.id,
        name: product.name,
        slug,
        isActive: product.active,
        maxUsers,
        maxBoletos,
        price: 0,
      },
      update: {
        name: product.name,
        description: product.description,
        isActive: product.active,
        maxUsers,
        maxBoletos,
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
