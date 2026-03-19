import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { createLogger } from '../../core/logging';

import axios from 'axios';
import { PrismaService } from '../../prisma/prisma.service';
import { OnEvent } from '@nestjs/event-emitter';

// Core imports
import { ERROR_MESSAGES, ENTITY_NAMES } from '../../core/constants';
import { toNumber } from '../../core/utils';

@Injectable()
export class AsaasBillingService {
  private readonly logger = createLogger(AsaasBillingService.name);
  private readonly masterApiKey = process.env.ASAAS_MASTER_API_KEY;
  private readonly baseURL =
    process.env.ASAAS_API_URL || 'https://sandbox.asaas.com/api/v3';

  constructor(private prisma: PrismaService) {}

  // ==========================================================================
  // 1. PROCESSAMENTO DE WEBHOOKS (Ativação de Assinaturas)
  // ==========================================================================
  @OnEvent('asaas.PAYMENT_RECEIVED')
  @OnEvent('asaas.PAYMENT_CONFIRMED')
  async handleSubscriptionPayment(payload: any) {
    const { event, payment } = payload;
    const paymentId = payment.id;
    const subscriptionId = payment.subscription;

    this.logger.log(
      `Processando pagamento de assinatura no Asaas: ${paymentId}`,
    );

    // 1. Busca se este pagamento ou assinatura pertence a uma Subscription no nosso banco
    // Pode ser o externalId da assinatura (sub_...) ou do pagamento (pay_...)
    const dbSub = await this.prisma.subscription.findFirst({
      where: {
        OR: [{ externalId: subscriptionId }, { externalId: paymentId }],
        gateway: 'ASAAS',
      },
      include: { plan: true },
    });

    if (!dbSub) {
      this.logger.debug(
        `Pagamento ${paymentId} não pertence a nenhuma assinatura da plataforma.`,
      );
      return;
    }

    // 2. Se a assinatura está pendente ou atrasada, ativa ela
    if (dbSub.status !== 'active') {
      await this.prisma.$transaction([
        this.prisma.subscription.update({
          where: { id: dbSub.id },
          data: {
            status: 'active',
            currentPeriodStart: new Date(),
            // Calcula o fim do período baseado no ciclo original se disponível, ou assume 30 dias
            currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          },
        }),
        this.prisma.tenant.update({
          where: { id: dbSub.tenantId },
          data: {
            isActive: true,
            planId: dbSub.planId,
            monthlyBoletoBalance: dbSub.plan.maxBoletos,
          },
        }),
      ]);

      this.logger.log(`Assinatura ativada para o Tenant: ${dbSub.tenantId}`);
    }
  }

  // ==========================================================================
  // 2. GARANTIR CLIENTE NO ASAAS
  // ==========================================================================
  // ==========================================================================
  // 1. GARANTIR CLIENTE NO ASAAS E SALVAR NA BASE
  // ==========================================================================
  private async getOrCreateCustomer(tenantId: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      include: { billingProfile: true },
    });

    if (!tenant?.billingProfile?.document) {
      throw new HttpException(
        'Preencha o CPF/CNPJ no perfil para assinar.',
        HttpStatus.BAD_REQUEST,
      );
    }

    // Se já temos o ID salvo, nem bate na API do Asaas, só retorna
    if (tenant.billingProfile.asaasCustomerId) {
      return tenant.billingProfile.asaasCustomerId;
    }

    try {
      const search = await axios.get(
        `${this.baseURL}/customers?cpfCnpj=${tenant.billingProfile.document}`,
        { headers: { access_token: this.masterApiKey } },
      );

      let customerId = search.data.data?.[0]?.id;

      if (!customerId) {
        const create = await axios.post(
          `${this.baseURL}/customers`,
          {
            name: tenant.name,
            cpfCnpj: tenant.billingProfile.document,
            email: tenant.billingProfile.billingEmail,
            mobilePhone: tenant.billingProfile.commercialPhone,
          },
          { headers: { access_token: this.masterApiKey } },
        );
        customerId = create.data.id;
      }

      // 🔥 O UPDATE QUE FALTAVA: Salva o ID do Asaas na tabela BillingProfile
      await this.prisma.billingProfile.update({
        where: { id: tenant.billingProfile.id }, // Atualiza pelo ID específico do profile
        data: { asaasCustomerId: customerId },
      });

      return customerId;
    } catch (error) {
      this.logger.error('Erro ao gerenciar cliente Asaas:', error.message);
      throw new HttpException(
        'Erro de comunicação com o Asaas.',
        HttpStatus.BAD_GATEWAY,
      );
    }
  }

  // ==========================================================================
  // 2. CHECKOUT CARTÃO DE CRÉDITO (Mensal ou Anual Parcelado)
  // ==========================================================================
  // ==========================================================================
  // 2. CHECKOUT CARTÃO DE CRÉDITO COM TOKENIZAÇÃO
  // ==========================================================================
  async processCreditCardCheckout(
    tenantId: string,
    planId: string,
    cycle: 'MONTHLY' | 'YEARLY',
    installments: number = 1,
    cardData: any,
    clientIp: string = '127.0.0.1', // O Asaas exige um IP para o motor antifraude
  ) {
    const customerId = await this.getOrCreateCustomer(tenantId);

    const plan = await this.prisma.plan.findUnique({ where: { id: planId } });
    if (!plan)
      throw new HttpException(
        ERROR_MESSAGES.NOT_FOUND(ENTITY_NAMES.PLAN),
        HttpStatus.NOT_FOUND,
      );

    const planPrice = cycle === 'YEARLY' ? plan.yearlyPrice : plan.price;
    if (!planPrice)
      throw new HttpException(
        'Preço não configurado para este ciclo.',
        HttpStatus.BAD_REQUEST,
      );

    // 1. Prepara os objetos exigidos pelo Asaas
    const creditCardPayload = {
      holderName: cardData.holderName,
      number: cardData.number.replace(/\D/g, ''),
      expiryMonth: cardData.expiryMonth,
      expiryYear: cardData.expiryYear,
      ccv: cardData.ccv,
    };

    const creditCardHolderInfo = {
      name: cardData.holderName,
      email: cardData.email,
      cpfCnpj: cardData.cpfCnpj.replace(/\D/g, ''),
      postalCode: cardData.postalCode.replace(/\D/g, ''),
      addressNumber: cardData.addressNumber,
      phone: cardData.phone.replace(/\D/g, ''),
    };

    let creditCardToken = '';

    // 2. TOKENIZA O CARTÃO PRIMEIRO
    try {
      this.logger.log(
        `Gerando Token do cartão para o cliente ${customerId}...`,
      );
      const tokenResponse = await axios.post(
        `${this.baseURL}/creditCard/tokenizeCreditCard`,
        {
          customer: customerId,
          creditCard: creditCardPayload,
          creditCardHolderInfo: creditCardHolderInfo,
          remoteIp: clientIp, // O IP de onde a requisição originou
        },
        { headers: { access_token: this.masterApiKey } },
      );

      creditCardToken = tokenResponse.data.creditCardToken;

      const last4 = cardData.number.slice(-4);
      // O Asaas devolve a bandeira do cartão, podemos guardá-la também
      const brand = tokenResponse.data.creditCardBrand || 'Cartão';

      await this.prisma.billingProfile.update({
        where: { tenantId },
        data: {
          asaasCreditCardToken: creditCardToken,
          asaasCardLast4: last4,
          asaasCardBrand: brand,
        },
      });

      // Opcional: Aqui você pode salvar o creditCardToken no banco (tabela BillingProfile)
      // para permitir que o usuário compre upgrades depois sem digitar o cartão.
    } catch (error) {
      this.logger.error('Erro na tokenização do cartão:', error.response?.data);
      throw new HttpException(
        'Não foi possível validar o seu cartão. Verifique os dados inseridos.',
        HttpStatus.PAYMENT_REQUIRED,
      );
    }

    // 3. CRIA A ASSINATURA/COBRANÇA USANDO APENAS O TOKEN
    try {
      let asaasExternalId = '';
      const now = new Date();
      let periodEnd = new Date();

      if (cycle === 'MONTHLY') {
        const response = await axios.post(
          `${this.baseURL}/subscriptions`,
          {
            customer: customerId,
            billingType: 'CREDIT_CARD',
            value: toNumber(planPrice),
            nextDueDate: now.toISOString().split('T')[0],
            cycle: 'MONTHLY',
            description: `Assinatura ${plan.name} - Mensal`,
            creditCardToken: creditCardToken, // 🔥 Usando o TOKEN gerado!
          },
          { headers: { access_token: this.masterApiKey } },
        );

        asaasExternalId = response.data.id;
        periodEnd.setMonth(now.getMonth() + 1);
      } else if (cycle === 'YEARLY') {
        const response = await axios.post(
          `${this.baseURL}/payments`,
          {
            customer: customerId,
            billingType: 'CREDIT_CARD',
            installmentCount: installments,
            installmentValue: toNumber(
              (toNumber(planPrice) / installments).toFixed(2),
            ),
            dueDate: now.toISOString().split('T')[0],
            description: `Assinatura ${plan.name} - Anual (${installments}x)`,
            creditCardToken: creditCardToken, // 🔥 Usando o TOKEN gerado!
          },
          { headers: { access_token: this.masterApiKey } },
        );

        asaasExternalId = response.data.installment;
        periodEnd.setFullYear(now.getFullYear() + 1);
      }

      await this.prisma.subscription.create({
        data: {
          tenantId,
          planId: plan.id,
          gateway: 'ASAAS',
          externalId: asaasExternalId,
          customerId: customerId,
          status: 'active',
          currentPeriodStart: now,
          currentPeriodEnd: periodEnd,
        },
      });

      return {
        success: true,
        message: 'Pagamento aprovado! Bem-vindo ao Vendus-pro.',
      };
    } catch (error) {
      const errorMsg =
        error.response?.data?.errors?.[0]?.description ||
        'O pagamento foi recusado pelo banco emissor.';
      this.logger.error(`Erro ao criar assinatura com token: ${errorMsg}`);
      throw new HttpException(
        { message: 'Pagamento não aprovado.', details: errorMsg },
        HttpStatus.PAYMENT_REQUIRED,
      );
    }
  }

  // ==========================================================================
  // 3. CHECKOUT PIX (QR CODE)
  // ==========================================================================
  async processPixCheckout(
    tenantId: string,
    planId: string,
    cycle: 'MONTHLY' | 'YEARLY',
  ) {
    const customerId = await this.getOrCreateCustomer(tenantId);

    const plan = await this.prisma.plan.findUnique({ where: { id: planId } });
    if (!plan)
      throw new HttpException(
        ERROR_MESSAGES.NOT_FOUND(ENTITY_NAMES.PLAN),
        HttpStatus.NOT_FOUND,
      );

    const planPrice = cycle === 'YEARLY' ? plan.yearlyPrice : plan.price;
    if (!planPrice)
      throw new HttpException(
        'Preço não configurado para este ciclo.',
        HttpStatus.BAD_REQUEST,
      );

    try {
      let asaasExternalId = '';
      const now = new Date();
      let periodEnd = new Date();
      let paymentId = '';

      if (cycle === 'MONTHLY') {
        const response = await axios.post(
          `${this.baseURL}/subscriptions`,
          {
            customer: customerId,
            billingType: 'PIX',
            value: toNumber(planPrice),
            nextDueDate: now.toISOString().split('T')[0],
            cycle: 'MONTHLY',
            description: `Assinatura ${plan.name} - Mensal`,
          },
          { headers: { access_token: this.masterApiKey } },
        );

        asaasExternalId = response.data.id;
        periodEnd.setMonth(now.getMonth() + 1);

        // Busca a primeira cobrança da assinatura para gerar o QR Code
        const paymentsResponse = await axios.get(
          `${this.baseURL}/subscriptions/${asaasExternalId}/payments`,
          { headers: { access_token: this.masterApiKey } },
        );
        paymentId = paymentsResponse.data.data[0].id;
      } else {
        const response = await axios.post(
          `${this.baseURL}/payments`,
          {
            customer: customerId,
            billingType: 'PIX',
            value: toNumber(planPrice),
            dueDate: now.toISOString().split('T')[0],
            description: `Assinatura ${plan.name} - Anual`,
          },
          { headers: { access_token: this.masterApiKey } },
        );

        asaasExternalId = response.data.id;
        paymentId = response.data.id;
        periodEnd.setFullYear(now.getFullYear() + 1);
      }

      // 1. Cria a assinatura no nosso banco como pending_payment
      await this.prisma.subscription.create({
        data: {
          tenantId,
          planId: plan.id,
          gateway: 'ASAAS',
          externalId: asaasExternalId,
          customerId: customerId,
          status: 'pending_payment',
          currentPeriodStart: now,
          currentPeriodEnd: periodEnd,
        },
      });

      // 2. Gera o QR Code do pagamento
      const qrCodeResponse = await axios.get(
        `${this.baseURL}/payments/${paymentId}/pixQrCode`,
        { headers: { access_token: this.masterApiKey } },
      );

      return {
        success: true,
        paymentId,
        encodedImage: qrCodeResponse.data.encodedImage,
        payload: qrCodeResponse.data.payload,
        expirationDate: qrCodeResponse.data.expirationDate,
      };
    } catch (error) {
      this.handleAsaasError(error);
    }
  }

  private handleAsaasError(error: any) {
    const message =
      error.response?.data?.errors?.[0]?.description || error.message;
    throw new HttpException(message, HttpStatus.BAD_GATEWAY);
  }

  // ==========================================================================
  // 4. UPGRADE DE PLANO COM 1 CLIQUE (USANDO TOKEN GUARDADO)
  // ==========================================================================
  async processOneClickUpgrade(
    tenantId: string,
    newPlanId: string,
    cycle: 'MONTHLY' | 'YEARLY',
    installments: number = 1,
  ) {
    // 1. Vai buscar o Tenant e o Token guardado
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      include: {
        billingProfile: true,
        subscriptions: {
          where: { status: 'active' }, // Traz a assinatura atual
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });

    const token = tenant?.billingProfile?.asaasCreditCardToken;
    const customerId = tenant?.billingProfile?.asaasCustomerId; // Supondo que você tenha guardado isso também na BillingProfile

    if (!token || !customerId) {
      throw new HttpException(
        'Nenhum cartão guardado encontrado. Por favor, insira os dados do cartão.',
        HttpStatus.BAD_REQUEST,
      );
    }

    const newPlan = await this.prisma.plan.findUnique({
      where: { id: newPlanId },
    });
    if (!newPlan)
      throw new HttpException(
        'Plano selecionado não existe.',
        HttpStatus.NOT_FOUND,
      );

    const planPrice = cycle === 'YEARLY' ? newPlan.yearlyPrice : newPlan.price;

    try {
      const currentSub = tenant.subscriptions[0];

      // 2. CANCELA A ASSINATURA ATUAL NO ASAAS (Evitar dupla cobrança)
      if (
        currentSub &&
        currentSub.gateway === 'ASAAS' &&
        currentSub.externalId
      ) {
        this.logger.log(
          `Cancelando assinatura antiga: ${currentSub.externalId}`,
        );
        // Se for assinatura mensal (sub_...)
        if (currentSub.externalId.startsWith('sub_')) {
          await axios.delete(
            `${this.baseURL}/subscriptions/${currentSub.externalId}`,
            {
              headers: { access_token: this.masterApiKey },
            },
          );
        }
        // Atualiza no nosso banco para 'canceled'
        await this.prisma.subscription.update({
          where: { id: currentSub.id },
          data: { status: 'canceled' },
        });
      }

      // 3. CRIA A NOVA COBRANÇA COM O TOKEN
      let asaasExternalId = '';
      const now = new Date();
      let periodEnd = new Date();

      if (cycle === 'MONTHLY') {
        const response = await axios.post(
          `${this.baseURL}/subscriptions`,
          {
            customer: customerId,
            billingType: 'CREDIT_CARD',
            value: toNumber(planPrice),
            nextDueDate: now.toISOString().split('T')[0],
            cycle: 'MONTHLY',
            description: `Upgrade para ${newPlan.name} - Mensal`,
            creditCardToken: token, // 🔥 A magia acontece aqui! Usa o token da DB.
          },
          { headers: { access_token: this.masterApiKey } },
        );

        asaasExternalId = response.data.id;
        periodEnd.setMonth(now.getMonth() + 1);
      } else if (cycle === 'YEARLY') {
        const response = await axios.post(
          `${this.baseURL}/payments`,
          {
            customer: customerId,
            billingType: 'CREDIT_CARD',
            installmentCount: installments,
            installmentValue: toNumber(
              (toNumber(planPrice) / installments).toFixed(2),
            ),
            dueDate: now.toISOString().split('T')[0],
            description: `Upgrade para ${newPlan.name} - Anual (${installments}x)`,
            creditCardToken: token, // 🔥 Token da DB.
          },
          { headers: { access_token: this.masterApiKey } },
        );

        asaasExternalId = response.data.installment;
        periodEnd.setFullYear(now.getFullYear() + 1);
      }

      // 4. GUARDA A NOVA ASSINATURA NA DB
      await this.prisma.subscription.create({
        data: {
          tenantId,
          planId: newPlan.id,
          gateway: 'ASAAS',
          externalId: asaasExternalId,
          customerId: customerId,
          status: 'active',
          currentPeriodStart: now,
          currentPeriodEnd: periodEnd,
        },
      });

      return {
        success: true,
        message: 'Upgrade realizado com sucesso!',
      };
    } catch (error) {
      const errorMsg =
        error.response?.data?.errors?.[0]?.description ||
        'Não foi possível processar o novo pagamento.';
      this.logger.error(`Erro no 1-Click Upgrade: ${errorMsg}`);
      throw new HttpException(
        { message: 'Falha no upgrade.', details: errorMsg },
        HttpStatus.PAYMENT_REQUIRED,
      );
    }
  }
}
