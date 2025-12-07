import {
  Injectable,
  BadRequestException,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import axios from 'axios';
import { AuditService } from '../audit/audit.service';
import { UpgradeSubscriptionDto } from './dto/upgrade-subscription';

@Injectable()
export class PaymentService {
  private logger = new Logger(PaymentService.name);
  private api = axios.create({
    baseURL: process.env.PAGARME_API_URL,
    auth: {
      username: process.env.PAGARME_API_KEY || '',
      password: '',
    },
  });

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  getPaymentConfig() {
    return {
      publicKey: process.env.PAGARME_PUBLIC_KEY || '',
    };
  }

  async createPagarmeSubscription(
    customerData: any,
    plan: any,
    cardToken: string,
    cycle: 'monthly' | 'yearly' = 'monthly',
  ) {
    let amount = Number(plan.price);
    let interval = 'month';
    let intervalCount = 1;

    if (cycle === 'yearly') {
      if (!plan.yearlyPrice) {
        throw new BadRequestException('Este plano não aceita pagamento anual.');
      }
      amount = Number(plan.yearlyPrice);
      interval = 'year';
      intervalCount = 1;
    }

    const rawPhone = customerData.phone
      ? customerData.phone.replace(/\D/g, '')
      : '11999999999';
    const areaCode = rawPhone.substring(0, 2);
    const phoneNumber = rawPhone.substring(2);

    const payload: any = {
      payment_method: 'credit_card',
      currency: 'BRL',
      interval: interval,
      interval_count: intervalCount,
      billing_type: 'prepaid',
      card_token: cardToken,
      customer: {
        name: customerData.name,
        email: customerData.email,
        document: customerData.document.replace(/\D/g, ''),
        type:
          customerData.document.replace(/\D/g, '').length > 11
            ? 'company'
            : 'individual',
        phones: {
          mobile_phone: {
            country_code: '55',
            area_code: areaCode,
            number: phoneNumber,
          },
        },
      },
      items: [
        {
          pricing_scheme: {
            price: Math.round(amount * 100),
          },
          quantity: 1,
          description: `Plano ${plan.name} (${cycle === 'yearly' ? 'Anual' : 'Mensal'})`,
        },
      ],
    };

    if (customerData.address) {
      payload.customer.address = {
        line_1: `${customerData.address.number}, ${customerData.address.street}, ${customerData.address.neighborhood}`,
        line_2: customerData.address.complement || '',
        zip_code: customerData.address.zipCode.replace(/\D/g, ''),
        city: customerData.address.city,
        state: customerData.address.state,
        country: 'BR',
      };
    }

    try {
      const { data } = await this.api.post('/subscriptions', payload);
      return data;
    } catch (error) {
      this.logger.error(
        'Erro Pagar.me create:',
        JSON.stringify(error.response?.data || error.message),
      );
      throw new BadRequestException(
        'Falha ao processar pagamento. Verifique os dados do cartão.',
      );
    }
  }

  async cancelPagarmeSubscription(externalId: string) {
    try {
      await this.api.delete(`/subscriptions/${externalId}`);
      return true;
    } catch (error) {
      this.logger.error(
        `Erro ao cancelar sub ${externalId}`,
        JSON.stringify(error.response?.data),
      );
      return false;
    }
  }

  async createSubscription(
    tenantId: string,
    planSlug: string,
    cardToken: string,
    user: any,
    cycle: 'monthly' | 'yearly' = 'monthly',
  ) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      include: { billingProfile: true },
    });

    const plan = await this.prisma.plan.findUnique({
      where: { slug: planSlug },
    });

    if (!tenant || !plan)
      throw new BadRequestException('Dados inválidos (Tenant ou Plano).');

    const billing = tenant.billingProfile;
    if (!billing || !billing.document) {
      throw new BadRequestException(
        'Perfil de faturamento incompleto. Atualize seus dados antes de assinar.',
      );
    }

    try {
      const pagarmeSub = await this.createPagarmeSubscription(
        {
          name: tenant.name,
          email: billing.email || user.email,
          document: billing.document,
          phone: billing.phone,
          address: {
            street: billing.street,
            number: billing.number,
            zipCode: billing.zipCode,
            neighborhood: billing.neighborhood,
            city: billing.cityName,
            state: billing.stateUf,
            complement: billing.complement,
          },
        },
        plan,
        cardToken,
        cycle,
      );

      const subscription = await this.prisma.subscription.create({
        data: {
          externalId: pagarmeSub.id,
          customerId: pagarmeSub.customer.id,
          status: 'ACTIVE',
          currentPeriodStart: new Date(pagarmeSub.current_cycle.start_at),
          currentPeriodEnd: new Date(pagarmeSub.current_cycle.end_at),
          tenantId: tenant.id,
          planId: plan.id,
        },
      });

      await this.prisma.tenant.update({
        where: { id: tenantId },
        data: {
          isActive: true,
          planId: plan.id,
          trialEndsAt: null,
        },
      });

      await this.auditService.log({
        action: 'SUBSCRIBE',
        entity: 'Subscription',
        entityId: subscription.id,
        userId: user.id || user.userId,
        details: {
          plan: plan.name,
          amount: cycle === 'yearly' ? plan.yearlyPrice : plan.price,
        },
      });

      return subscription;
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      this.logger.error('Erro ao salvar assinatura no banco', error);
      throw new InternalServerErrorException('Erro ao processar assinatura.');
    }
  }

  async upgradeSubscription(
    tenantId: string,
    dto: UpgradeSubscriptionDto,
    user: any,
  ) {
    this.logger.log(
      `Iniciando upgrade para Tenant ${tenantId} -> Plano ${dto.planSlug}`,
    );

    const currentSubscription = await this.prisma.subscription.findFirst({
      where: {
        tenantId,
        status: { in: ['ACTIVE'] },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (currentSubscription) {
      this.logger.log(
        `Cancelando assinatura antiga: ${currentSubscription.externalId}`,
      );

      await this.cancelPagarmeSubscription(currentSubscription.externalId);

      await this.prisma.subscription.update({
        where: { id: currentSubscription.id },
        data: {
          status: 'CANCELED',
          canceledAt: new Date(),
        },
      });
    }

    return this.createSubscription(
      tenantId,
      dto.planSlug,
      dto.cardToken,
      user,
      dto.cycle || 'monthly',
    );
  }

  async handleWebhook(headers: any, body: any) {
    const signature = headers['x-hub-signature'];
    if (!this.isValidSignature(signature, JSON.stringify(body))) {
      throw new BadRequestException('Assinatura de webhook inválida.');
    }

    const eventType = body.type;
    const data = body.data;

    await this.auditService.log({
      action: 'WEBHOOK_RECEIVED',
      entity: 'Payment',
      userId: 'system',
      details: { type: eventType, subscriptionId: data.subscription?.id },
    });

    switch (eventType) {
      case 'invoice.paid':
        await this.handleInvoicePaid(data);
        break;
      case 'invoice.payment_failed':
        await this.handlePaymentFailed(data);
        break;
      case 'subscription.canceled':
        await this.handleSubscriptionCanceled(data);
        break;
      default:
        console.log(`Evento ${eventType} ignorado.`);
    }

    return { received: true };
  }

  private isValidSignature(signature: string, payload: string): boolean {
    return true;
  }

  private async handleInvoicePaid(data: any) {
    const subExists = await this.prisma.subscription.findUnique({
      where: { externalId: data.subscription.id },
    });

    if (!subExists) return;

    await this.prisma.subscription.update({
      where: { externalId: data.subscription.id },
      data: {
        status: 'ACTIVE',
        currentPeriodStart: new Date(data.period.start_at),
        currentPeriodEnd: new Date(data.period.end_at),
      },
    });

    await this.prisma.tenant.update({
      where: { id: subExists.tenantId },
      data: { isActive: true, trialEndsAt: null },
    });
  }

  private async handlePaymentFailed(data: any) {
    const subExists = await this.prisma.subscription.findUnique({
      where: { externalId: data.subscription.id },
    });
    if (!subExists) return;

    await this.prisma.subscription.update({
      where: { externalId: data.subscription.id },
      data: { status: 'PENDING_PAYMENT' },
    });
  }

  private async handleSubscriptionCanceled(data: any) {
    const externalId = data.subscription?.id || data.id;
    const subExists = await this.prisma.subscription.findUnique({
      where: { externalId: externalId },
    });
    if (!subExists) return;

    const sub = await this.prisma.subscription.update({
      where: { externalId: externalId },
      data: { status: 'CANCELED', canceledAt: new Date() },
    });

    await this.prisma.tenant.update({
      where: { id: sub.tenantId },
      data: { isActive: false },
    });
  }
}
