import {
  Injectable,
  BadRequestException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { clerkClient } from '@clerk/clerk-sdk-node';
import Stripe from 'stripe';

@Injectable()
export class PaymentService {
  private stripe: Stripe;
  private readonly logger = new Logger(PaymentService.name);

  constructor(private readonly prisma: PrismaService) {
    this.stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', {
      apiVersion: '2025-11-17.clover' as any, // Ajustado para a versão exigida pelo seu SDK
    });
  }

  private getFrontendUrl() {
    let url = process.env.FRONTEND_URL || 'http://localhost:3005';
    // Remove barra no final se houver
    url = url.replace(/\/$/, '');

    // Adiciona protocolo se não houver
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      url = `http://${url}`;
    }
    return url;
  }

  // --- 1. CRIAR SESSÃO DE CHECKOUT ---
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

    const priceId =
      cycle === 'yearly' ? plan.stripeYearlyPriceId : plan.stripeMonthlyPriceId;

    if (!priceId) {
      throw new BadRequestException(
        'ID do preço na Stripe não configurado para este plano/ciclo.',
      );
    }

    const baseUrl = this.getFrontendUrl();

    const session = await this.stripe.checkout.sessions.create({
      payment_method_types: ['card', 'boleto'],
      ui_mode: 'embedded',
      mode: 'subscription',
      customer_email: userEmail,
      line_items: [{ price: priceId, quantity: 1 }],
      metadata: {
        tenantId,
        planSlug,
      },
      // success_url: `${baseUrl}/dashboard?success=true`,
      // cancel_url: `${baseUrl}/billing?canceled=true`,
      return_url: `${baseUrl}/checkout/return?session_id={CHECKOUT_SESSION_ID}`,
      allow_promotion_codes: true,
    });

    return {
      clientSecret: session.client_secret,
    };
  }

  // --- 2. PORTAL DO CLIENTE ---
  async createPortalSession(tenantId: string) {
    const sub = await this.prisma.subscription.findFirst({
      where: {
        tenantId,
        // Garante que pega uma assinatura válida ou recente
        status: { in: ['active', 'trialing', 'past_due', 'incomplete'] },
      },
      orderBy: { createdAt: 'desc' },
      select: { customerId: true },
    });

    if (!sub?.customerId) {
      throw new BadRequestException(
        'Nenhuma assinatura encontrada para gerenciar.',
      );
    }

    const baseUrl = this.getFrontendUrl();

    const session = await this.stripe.billingPortal.sessions.create({
      customer: sub.customerId,
      return_url: `${baseUrl}/billing`,
    });

    return { url: session.url };
  }

  // --- 3. WEBHOOKS ---
  async handleStripeWebhook(signature: string, rawBody: Buffer) {
    let event: Stripe.Event;

    try {
      event = this.stripe.webhooks.constructEvent(
        rawBody,
        signature,
        process.env.STRIPE_WEBHOOK_SECRET || '',
      );
    } catch (err) {
      this.logger.error(`Webhook Signature Error: ${err.message}`);
      throw new BadRequestException('Webhook Inválido');
    }

    // Casting explicito para evitar erros de tipo genéricos
    const object = event.data.object;

    switch (event.type) {
      case 'checkout.session.completed':
        await this.handleCheckoutCompleted(object as Stripe.Checkout.Session);
        break;

      case 'invoice.payment_succeeded':
        await this.handleInvoiceSucceeded(object as Stripe.Invoice);
        break;

      case 'invoice.payment_failed':
        await this.handlePaymentFailed(object as Stripe.Invoice);
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

    return { received: true };
  }

  // --- HANDLERS INTERNOS ---

  private async handleCheckoutCompleted(session: Stripe.Checkout.Session) {
    const tenantId = session.metadata?.tenantId;
    const planSlug = session.metadata?.planSlug;

    if (!tenantId || !planSlug) return;

    const plan = await this.prisma.plan.findUnique({
      where: { slug: planSlug },
    });
    if (!plan) return;

    const subscriptionId = session.subscription as string;

    await this.prisma.subscription.upsert({
      where: { externalId: subscriptionId },
      create: {
        tenantId,
        planId: plan.id,
        externalId: subscriptionId,
        customerId: session.customer as string,
        status: 'active',
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      },
      update: {
        customerId: session.customer as string,
        planId: plan.id,
        status: 'active',
      },
    });

    await this.syncTenantStatus(tenantId, 'active', plan, plan.maxUsers);
  }

  private async handleInvoiceSucceeded(invoice: Stripe.Invoice) {
    const subscriptionId = (invoice as any).subscription as string | undefined;
    if (!subscriptionId) return;

    const retrieved = await this.stripe.subscriptions.retrieve(subscriptionId);
    const subStripe = retrieved as any;

    const existingSub = await this.prisma.subscription.findUnique({
      where: { externalId: subscriptionId },
      include: { plan: true },
    });

    if (!existingSub) return;

    await this.prisma.subscription.update({
      where: { id: existingSub.id },
      data: {
        status: subStripe.status,
        currentPeriodStart: new Date(subStripe.current_period_start * 1000),
        currentPeriodEnd: new Date(subStripe.current_period_end * 1000),
      },
    });

    await this.syncTenantStatus(
      existingSub.tenantId,
      'active',
      existingSub.plan,
      existingSub.plan.maxUsers,
    );
  }

  private async handlePaymentFailed(invoice: Stripe.Invoice) {
    const inv = invoice as any;
    if (!inv.subscription) return;

    const subId =
      typeof inv.subscription === 'string'
        ? inv.subscription
        : (inv.subscription as Stripe.Subscription).id;

    await this.prisma.subscription.updateMany({
      where: { externalId: subId },
      data: { status: 'past_due' },
    });
  }

  private async handleSubscriptionDeleted(subscription: Stripe.Subscription) {
    const dbSub = await this.prisma.subscription.findUnique({
      where: { externalId: subscription.id },
      include: { plan: true },
    });

    if (dbSub) {
      await this.prisma.subscription.update({
        where: { id: dbSub.id },
        data: { status: 'canceled' },
      });

      await this.syncTenantStatus(
        dbSub.tenantId,
        'inactive',
        dbSub.plan,
        dbSub.plan.maxUsers,
      );
    }
  }

  // Helper para atualizar Banco Local + Clerk
  private async syncTenantStatus(
    tenantId: string,
    status: string,
    plan: any,
    maxUsers: number,
  ) {
    const isActive = status === 'active' || status === 'trialing';

    const tenant = await this.prisma.tenant.update({
      where: { id: tenantId },
      data: {
        isActive: isActive,
        trialEndsAt: null,
      },
    });

    if (tenant.clerkId) {
      try {
        await clerkClient.organizations.updateOrganizationMetadata(
          tenant.clerkId,
          {
            publicMetadata: {
              plan: plan.slug,
              status: status,
              maxUsers: maxUsers,
            },
          },
        );
        this.logger.log(
          `Tenant ${tenantId} sincronizado com Clerk. Status: ${status}`,
        );
      } catch (e) {
        this.logger.error(`Erro ao atualizar Clerk: ${e.message}`);
      }
    }
  }

  private async handleProductSync(product: Stripe.Product) {
    const slug = product.metadata.slug || this.generateSlug(product.name);
    const maxUsers = product.metadata.maxUsers
      ? parseInt(product.metadata.maxUsers)
      : 1;

    // Mapeia os dados básicos
    const data = {
      name: product.name,
      description: product.description,
      active: product.active,
      stripeProductId: product.id, // Certifique-se de ter este campo no Prisma
      slug: slug,
      maxUsers: maxUsers,
      price: 0, // Default price, will be updated by handlePriceSync
      // Se tiver imagem, pega a primeira
      // imageUrl: product.images?.[0] || null,
    };

    await this.prisma.plan.upsert({
      where: { stripeProductId: product.id }, // Busca pelo ID do Stripe (mais seguro que slug)
      create: {
        stripeProductId: product.id,
        name: product.name,
        slug: slug,
        isActive: product.active, // <--- ATENÇÃO: Use 'isActive' (seu schema), não 'active'
        maxUsers: maxUsers,
        price: data.price,
      },
      update: {
        name: data.name,
        isActive: data.active,
        maxUsers: data.maxUsers,
      },
    });

    this.logger.log(`Plano sincronizado: ${product.name}`);
  }

  private async handlePriceSync(price: Stripe.Price) {
    if (typeof price.product !== 'string') return; // Se vier expandido, ignoramos por segurança ou tratamos

    const product = await this.prisma.plan.findUnique({
      where: { stripeProductId: price.product },
    });

    if (!product) {
      this.logger.warn(
        `Preço criado para produto desconhecido: ${price.product}`,
      );
      return;
    }

    // Identifica se é mensal ou anual
    const updateData: any = {};

    if (price.type === 'recurring') {
      if (price.recurring?.interval === 'month') {
        updateData.stripeMonthlyPriceId = price.id;
        updateData.priceMonthly = price.unit_amount
          ? price.unit_amount / 100
          : 0; // Se salvar valor no banco
      } else if (price.recurring?.interval === 'year') {
        updateData.stripeYearlyPriceId = price.id;
        updateData.priceYearly = price.unit_amount
          ? price.unit_amount / 100
          : 0;
      }
    }

    if (Object.keys(updateData).length > 0) {
      await this.prisma.plan.update({
        where: { id: product.id },
        data: updateData,
      });
      this.logger.log(`Preço atualizado para o plano ${product.name}`);
    }
  }

  private generateSlug(text: string): string {
    return text
      .toString()
      .toLowerCase()
      .trim()
      .replace(/\s+/g, '-') // Substitui espaços por -
      .replace(/[^\w\-]+/g, '') // Remove caracteres não alfanuméricos
      .replace(/\-\-+/g, '-'); // Remove múltiplos hifens
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
      amount: sub.plan.price, // ou use price/yearlyPrice dependendo da lógica
      cycle: 'mensal', // Você pode inferir isso comparando currentPeriodStart/End
      nextBillingDate: sub.currentPeriodEnd,
      cancelAtPeriodEnd: false, // Se tiver esse campo no banco, retorne
    };
  }
}
