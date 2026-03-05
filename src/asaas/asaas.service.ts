import { Injectable, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import axios from 'axios';
import { MailService } from 'src/mail/mail.service';
import { buildBoletoEmail } from '../mail/templates/boleto.template';
import { NotificationsService } from 'src/notifications/notifications.service';
import { OnEvent } from '@nestjs/event-emitter';

@Injectable()
export class AsaasService {
  private readonly logger = new Logger(AsaasService.name);

  private readonly masterApiKey = process.env.ASAAS_MASTER_API_KEY;
  private readonly baseURL =
    process.env.ASAAS_API_URL || 'https://sandbox.asaas.com/api/v3';

  constructor(
    private prisma: PrismaService,
    private mailService: MailService,
    private notificationsService: NotificationsService,
  ) {}

  // ==========================================================================
  // 1. PROCESSAMENTO DE WEBHOOKS (Entrada de Dados)
  // ==========================================================================
  @OnEvent('asaas.PAYMENT_RECEIVED')
  @OnEvent('asaas.PAYMENT_CONFIRMED')
  @OnEvent('asaas.PAYMENT_OVERDUE')
  async processWebhook(payload: any) {
    const { event, payment } = payload;
    this.logger.log(`Webhook recebido: ${event}`);

    switch (event) {
      case 'PAYMENT_RECEIVED':
      case 'PAYMENT_CONFIRMED':
        await this.handlePaymentSuccess(payment);
        break;

      case 'PAYMENT_OVERDUE':
        await this.handlePaymentOverdue(payment);
        break;

      default:
        this.logger.debug(`Evento ignorado: ${event}`);
    }
  }

  private async handlePaymentSuccess(payment: any) {
    const asaasPaymentId = payment.id;
    const externalRef = payment.externalReference || '';

    // Caso 1: Pagamento via PDV (Real-time com Pusher)
    if (externalRef.startsWith('PDV_INTENT_')) {
      const tenantId = externalRef.replace('PDV_INTENT_', '');
      await this.notificationsService.notifyTenant(
        tenantId,
        `pix-paid-${asaasPaymentId}`,
        {
          status: 'PAID',
          asaasPaymentId,
          amount: payment.value,
        },
      );
      return;
    }

    // Caso 2: Títulos Financeiros (Boleto/Pix de faturas)
    const title = await this.prisma.financialTitle.findFirst({
      where: { asaasPaymentId },
      include: { order: true },
    });

    if (!title || title.status === 'PAID') return;

    await this.prisma.financialTitle.update({
      where: { id: title.id },
      data: {
        status: 'PAID',
        paidAmount: payment.value,
        balance: 0,
        paidAt: payment.paymentDate
          ? new Date(payment.paymentDate)
          : new Date(),
      },
    });

    // Aprova comissões se houver pedido vinculado
    if (title.orderId) {
      await this.prisma.commissionRecord.updateMany({
        where: { orderId: title.orderId, status: 'PENDING' },
        data: { status: 'APPROVED' },
      });
    }
  }

  private async handlePaymentOverdue(payment: any) {
    await this.prisma.financialTitle.updateMany({
      where: { asaasPaymentId: payment.id, status: 'OPEN' },
      data: { status: 'OVERDUE' },
    });
  }

  // ==========================================================================
  // 2. GERAÇÃO DE COBRANÇAS (Boleto & Pix)
  // ==========================================================================

  async emitBoletoForExistingTitle(tenantId: string, titleId: string) {
    const title = await this.prisma.financialTitle.findUnique({
      where: { id: titleId, tenantId },
      include: { customer: true, order: true },
    });

    if (!title)
      throw new HttpException('Título não encontrado.', HttpStatus.NOT_FOUND);
    if (title.asaasPaymentId)
      throw new HttpException('Boleto já emitido.', HttpStatus.BAD_REQUEST);

    const { apiKey, consumeFrom } = await this.validateBoletoLimit(tenantId);

    try {
      const asaasCustomerId = await this.getOrCreateAsaasCustomer(
        apiKey,
        title.customer,
      );

      const paymentResponse = await axios.post(
        `${this.baseURL}/payments`,
        {
          customer: asaasCustomerId,
          billingType: 'BOLETO',
          value: Number(title.balance),
          dueDate: title.dueDate.toISOString().split('T')[0],
          description: `Parcela ${title.installmentNumber || 1} - Pedido #${title.orderId?.substring(0, 8)}`,
          externalReference: title.id,
        },
        { headers: { access_token: apiKey } },
      );

      const qrCodeResponse = await axios.get(
        `${this.baseURL}/payments/${paymentResponse.data.id}/pixQrCode`,
        { headers: { access_token: apiKey } },
      );

      await this.updateTitleAndBalance(
        tenantId,
        title.id,
        paymentResponse.data,
        consumeFrom,
      );
      await this.sendBoletoEmail(title, paymentResponse.data.bankSlipUrl);

      return {
        success: true,
        boletoUrl: paymentResponse.data.bankSlipUrl,
        pixQrCodeImage: qrCodeResponse.data.encodedImage,
        pixCopyPaste: qrCodeResponse.data.payload,
      };
    } catch (error) {
      this.handleAsaasError(error);
    }
  }

  // ==========================================================================
  // 3. PONTO DE VENDA (PDV) - QR CODE DINÂMICO
  // ==========================================================================

  async generatePixIntentForPDV(tenantId: string, amount: number) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { asaasApiKey: true, billingProfile: true },
    });

    if (!tenant?.asaasApiKey || !tenant.billingProfile?.document) {
      throw new HttpException(
        'Configuração financeira incompleta.',
        HttpStatus.BAD_REQUEST,
      );
    }

    try {
      const activeApiKey = tenant.asaasApiKey;

      const asaasCustomerId = await this.getOrCreateAsaasCustomer(
        activeApiKey,
        {
          name: 'Cliente PDV (Balcão)',
          document: tenant.billingProfile.document,
        },
      );

      const paymentPayload: any = {
        customer: asaasCustomerId,
        billingType: 'PIX',
        value: amount,
        dueDate: new Date().toISOString().split('T')[0],
        externalReference: `PDV_INTENT_${tenantId}`,
      };

      const { data: payment } = await axios.post(
        `${this.baseURL}/payments`,
        paymentPayload,
        {
          headers: { access_token: activeApiKey },
        },
      );

      const { data: qrCode } = await axios.get(
        `${this.baseURL}/payments/${payment.id}/pixQrCode`,
        {
          headers: { access_token: activeApiKey },
        },
      );

      return {
        asaasPaymentId: payment.id,
        encodedImage: qrCode.encodedImage,
        payload: qrCode.payload,
      };
    } catch (error) {
      this.handleAsaasError(error);
    }
  }

  // ==========================================================================
  // 4. FINANCEIRO (Saldo & Transferência)
  // ==========================================================================

  async getWalletBalance(tenantId: string) {
    const tenant = await this.getTenantOrThrow(tenantId);
    try {
      const { data } = await axios.get(`${this.baseURL}/finance/balance`, {
        headers: { access_token: tenant.asaasApiKey },
      });
      return { balance: data.balance };
    } catch (error) {
      throw new HttpException('Erro ao buscar saldo.', HttpStatus.BAD_GATEWAY);
    }
  }

  // ==========================================================================
  // EXTRATO FINANCEIRO (Financial Transactions)
  // ==========================================================================

  async getFinancialStatement(
    tenantId: string,
    filters: {
      startDate?: string;
      endDate?: string;
      offset?: number;
      limit?: number;
    },
  ) {
    const tenant = await this.getTenantOrThrow(tenantId);

    try {
      // Constrói a query string com os filtros opcionais
      const queryParams = new URLSearchParams();

      if (filters.startDate) queryParams.append('startDate', filters.startDate);
      if (filters.endDate) queryParams.append('endDate', filters.endDate);
      if (filters.offset)
        queryParams.append('offset', filters.offset.toString());

      // Define um limite padrão de 20 itens por página se não for informado
      queryParams.append('limit', (filters.limit || 20).toString());

      const { data } = await axios.get(
        `${this.baseURL}/financialTransactions?${queryParams.toString()}`,
        {
          headers: { access_token: tenant.asaasApiKey },
        },
      );

      // O Asaas retorna: { object: "list", hasMore: boolean, totalCount: number, data: [...] }
      return data;
    } catch (error) {
      this.handleAsaasError(error);
    }
  }

  async requestTransfer(tenantId: string, transferData: any) {
    const tenant = await this.getTenantOrThrow(tenantId);
    try {
      const { data } = await axios.post(
        `${this.baseURL}/transfers`,
        {
          value: transferData.value,
          operationType: 'PIX',
          pixAddressKey: transferData.pixAddressKey,
          pixAddressKeyType: transferData.pixAddressKeyType,
        },
        { headers: { access_token: tenant.asaasApiKey } },
      );
      return {
        success: true,
        transferId: data.id,
        message: 'Transferência solicitada com sucesso.',
      };
    } catch (error) {
      this.handleAsaasError(error);
    }
  }

  // ==========================================================================
  // HELPERS PRIVADOS
  // ==========================================================================

  private async getTenantOrThrow(tenantId: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
    });
    if (!tenant?.asaasApiKey)
      throw new HttpException(
        'Conta Asaas não configurada.',
        HttpStatus.BAD_REQUEST,
      );
    return tenant;
  }

  private async validateBoletoLimit(tenantId: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: {
        asaasApiKey: true,
        monthlyBoletoBalance: true,
        extraBoletoBalance: true,
      },
    });

    if (!tenant?.asaasApiKey)
      throw new HttpException('Conta não configurada.', HttpStatus.BAD_REQUEST);

    const total = tenant.monthlyBoletoBalance + tenant.extraBoletoBalance;
    if (total <= 0)
      throw new HttpException(
        'Cota de boletos esgotada.',
        HttpStatus.PAYMENT_REQUIRED,
      );

    return {
      apiKey: tenant.asaasApiKey,
      consumeFrom: tenant.monthlyBoletoBalance > 0 ? 'MONTHLY' : 'EXTRA',
    };
  }

  private async getOrCreateAsaasCustomer(apiKey: string, customerData: any) {
    if (customerData.asaasId) return customerData.asaasId;

    const { data: search } = await axios.get(
      `${this.baseURL}/customers?cpfCnpj=${customerData.document}`,
      {
        headers: { access_token: apiKey },
      },
    );

    if (search.data?.length > 0) return search.data[0].id;

    const { data: created } = await axios.post(
      `${this.baseURL}/customers`,
      { name: customerData.name, cpfCnpj: customerData.document },
      { headers: { access_token: apiKey } },
    );
    return created.id;
  }

  private async updateTitleAndBalance(
    tenantId: string,
    titleId: string,
    asaasData: any,
    bucket: string,
  ) {
    const decrement =
      bucket === 'MONTHLY'
        ? { monthlyBoletoBalance: { decrement: 1 } }
        : { extraBoletoBalance: { decrement: 1 } };

    await this.prisma.$transaction([
      this.prisma.tenant.update({ where: { id: tenantId }, data: decrement }),
      this.prisma.financialTitle.update({
        where: { id: titleId },
        data: {
          asaasPaymentId: asaasData.id,
          boletoUrl: asaasData.bankSlipUrl,
          invoiceUrl: asaasData.invoiceUrl,
        },
      }),
    ]);
  }

  private async sendBoletoEmail(title: any, url: string) {
    if (!title.customer?.email) return;
    const html = buildBoletoEmail({
      customerName: title.customer.name,
      orderId: title.orderId || 'Avulso',
      amount: Number(title.balance),
      dueDate: title.dueDate,
      boletoUrl: url,
    });
    this.mailService.sendMail(
      title.customer.email,
      `Seu boleto vence dia ${title.dueDate.toLocaleDateString('pt-BR')}`,
      html,
    );
  }

  private handleAsaasError(error: any) {
    const message =
      error.response?.data?.errors?.[0]?.description || error.message;
    throw new HttpException(message, HttpStatus.BAD_GATEWAY);
  }
}
