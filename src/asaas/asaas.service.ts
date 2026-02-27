import { Injectable, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import axios from 'axios';
import { MailService } from 'src/mail/mail.service';
import { buildBoletoEmail } from '../mail/templates/boleto.template';

@Injectable()
export class AsaasService {
  private readonly logger = new Logger(AsaasService.name);

  // A chave MASTER serve APENAS para criar as subcontas
  private readonly masterApiKey = process.env.ASAAS_MASTER_API_KEY;

  // O ID da carteira MASTER serve para assumir as taxas das subcontas no Split
  private readonly masterWalletId = process.env.ASAAS_MASTER_WALLET_ID;

  private readonly baseURL =
    process.env.ASAAS_API_URL || 'https://sandbox.asaas.com/api/v3';

  constructor(
    private prisma: PrismaService,
    private mailService: MailService,
  ) {}

  // ==========================================================================
  // 1. CRIAR SUBCONTA (White Label)
  // ==========================================================================
  async createSubaccount(tenantId: string) {
    try {
      // 1. Busca os dados da empresa no banco
      const tenant = await this.prisma.tenant.findUnique({
        where: { id: tenantId },
        include: { billingProfile: true },
      });

      if (!tenant) {
        throw new HttpException('Tenant não encontrado.', HttpStatus.NOT_FOUND);
      }

      if (tenant.asaasWalletId) {
        throw new HttpException(
          'A conta digital já está ativada.',
          HttpStatus.BAD_REQUEST,
        );
      }

      // 2. Extrai e valida os dados obrigatórios
      const document = tenant.billingProfile?.document;
      const phone = tenant.billingProfile?.phone;
      const email = tenant.billingProfile?.email;
      const birthDate = tenant.billingProfile?.birthDate;
      const name = tenant.name;

      // O Asaas exige Nome, CPF/CNPJ, Email e Telefone
      if (!document || !phone || !email || !name) {
        throw new HttpException(
          'Dados da empresa incompletos. Preencha a Razão Social, CNPJ/CPF, Email e Telefone no seu perfil financeiro antes de ativar a conta.',
          HttpStatus.BAD_REQUEST,
        );
      }

      // 3. Cria a conta no Asaas
      const response = await axios.post(
        `${this.baseURL}/accounts`,
        {
          name: name,
          email: email,
          cpfCnpj: document,
          birthDate: birthDate,
          incomeValue: 1000, // O Asaas exige um valor, mas como é só para receber pagamentos, colocamos 0 (ou 1000 de fallback)
          mobilePhone: phone,
          postalCode: tenant.billingProfile?.zipCode || '01001000',
          addressNumber: tenant.billingProfile?.number || 'S/N',
        },
        { headers: { access_token: this.masterApiKey } },
      );

      const asaasAccount = response.data;

      // 4. Salva os dados no Tenant
      await this.prisma.tenant.update({
        where: { id: tenantId },
        data: {
          asaasApiKey: asaasAccount.apiKey,
          asaasWalletId: asaasAccount.walletId,
        },
      });

      return { success: true, message: 'Conta digital criada com sucesso!' };
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }

      this.logger.error(
        'Erro na criação de subconta:',
        error.response?.data || error.message,
      );
      throw new HttpException(
        error.response?.data?.errors?.[0]?.description ||
          'Erro ao criar subconta no Asaas',
        HttpStatus.BAD_GATEWAY,
      );
    }
  }

  // ==========================================================================
  // 2. REGRA DE NEGÓCIO: VALIDAÇÃO DOS DOIS BALDES
  // ==========================================================================
  private async validateBoletoLimit(tenantId: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: {
        asaasApiKey: true,
        monthlyBoletoBalance: true,
        extraBoletoBalance: true,
      },
    });

    if (!tenant?.asaasApiKey) {
      throw new HttpException(
        'Conta digital (Asaas) não configurada.',
        HttpStatus.BAD_REQUEST,
      );
    }

    const totalAvailable =
      tenant.monthlyBoletoBalance + tenant.extraBoletoBalance;

    if (totalAvailable <= 0) {
      throw new HttpException(
        'Sua cota de boletos acabou. Faça um upgrade de plano ou compre um pacote avulso.',
        HttpStatus.PAYMENT_REQUIRED,
      );
    }

    // Retorna de qual "balde" o crédito será descontado
    return {
      apiKey: tenant.asaasApiKey,
      consumeFrom: tenant.monthlyBoletoBalance > 0 ? 'MONTHLY' : 'EXTRA',
    };
  }

  // ==========================================================================
  // 3. GERAR O BOLETO AVULSO
  // ==========================================================================
  async generateBoleto(
    tenantId: string,
    orderId: string,
    customerData: any,
    amount: number,
    dueDate: Date,
  ) {
    const { apiKey, consumeFrom } = await this.validateBoletoLimit(tenantId);

    try {
      // 1. Cliente no Asaas
      let asaasCustomerId = customerData.asaasId;
      if (!asaasCustomerId) {
        const customerResponse = await axios.post(
          `${this.baseURL}/customers`,
          { name: customerData.name, cpfCnpj: customerData.document },
          { headers: { access_token: apiKey } },
        );
        asaasCustomerId = customerResponse.data.id;
      }

      // 2. Cria a cobrança com Split para a Master assumir a taxa
      const paymentResponse = await axios.post(
        `${this.baseURL}/payments`,
        {
          customer: asaasCustomerId,
          billingType: 'BOLETO',
          value: amount,
          dueDate: dueDate.toISOString().split('T')[0],
          description: `Pedido #${orderId}`,
          externalReference: orderId,
          split: [
            {
              walletId: this.masterWalletId,
              fixedValue: 0.01,
              assumeFee: true,
            },
          ],
        },
        { headers: { access_token: apiKey } },
      );

      // 3. Desconta os créditos do balde correto
      const decrementData =
        consumeFrom === 'MONTHLY'
          ? { monthlyBoletoBalance: { decrement: 1 } }
          : { extraBoletoBalance: { decrement: 1 } };

      await this.prisma.tenant.update({
        where: { id: tenantId },
        data: decrementData,
      });

      const boletoUrl = paymentResponse.data.bankSlipUrl;

      // 4. Envia e-mail
      if (customerData.email) {
        const emailHtml = buildBoletoEmail({
          customerName: customerData.name,
          orderId: orderId,
          amount: amount,
          dueDate: dueDate,
          boletoUrl: boletoUrl,
        });

        this.mailService.sendMail(
          customerData.email,
          `Sua Fatura do Pedido #${orderId} está disponível`,
          emailHtml,
        );
      }

      return {
        asaasPaymentId: paymentResponse.data.id,
        bankSlipUrl: boletoUrl,
        invoiceUrl: paymentResponse.data.invoiceUrl,
      };
    } catch (error) {
      throw new HttpException(
        error.response?.data?.errors?.[0]?.description ||
          'Erro ao gerar cobrança no banco.',
        HttpStatus.BAD_GATEWAY,
      );
    }
  }

  // ==========================================================================
  // 4. EMISSÃO DE BOLETO PARA TÍTULO EXISTENTE (O mais usado no ERP)
  // ==========================================================================
  async emitBoletoForExistingTitle(tenantId: string, titleId: string) {
    const title = await this.prisma.financialTitle.findUnique({
      where: { id: titleId, tenantId },
      include: {
        customer: true,
        order: true,
      },
    });

    if (!title)
      throw new HttpException(
        'Título financeiro não encontrado.',
        HttpStatus.NOT_FOUND,
      );
    if (title.asaasPaymentId)
      throw new HttpException(
        'Este título já possui um boleto emitido.',
        HttpStatus.BAD_REQUEST,
      );
    if (title.status === 'PAID')
      throw new HttpException(
        'Não é possível emitir boleto para um título já pago.',
        HttpStatus.BAD_REQUEST,
      );

    // 1. Valida o limite e descobre o balde
    const { apiKey, consumeFrom } = await this.validateBoletoLimit(tenantId);

    try {
      // 2. Garante Cliente no Asaas
      let asaasCustomerId = title.customer?.asaasId;
      if (!asaasCustomerId) {
        if (!title.customer?.document) {
          throw new HttpException(
            'O cliente precisa ter CPF/CNPJ cadastrado para gerar boleto.',
            HttpStatus.BAD_REQUEST,
          );
        }

        const customerResponse = await axios.post(
          `${this.baseURL}/customers`,
          { name: title.customer.name, cpfCnpj: title.customer.document },
          { headers: { access_token: apiKey } },
        );
        asaasCustomerId = customerResponse.data.id;

        if (title.customerId) {
          await this.prisma.customer.update({
            where: { id: title.customerId },
            data: { asaasId: asaasCustomerId },
          });
        }
      }

      // 3. Cria a cobrança no Asaas com Split para a Master assumir a taxa
      const paymentResponse = await axios.post(
        `${this.baseURL}/payments`,
        {
          customer: asaasCustomerId,
          billingType: 'BOLETO',
          value: Number(title.balance),
          dueDate: title.dueDate.toISOString().split('T')[0],
          description: `Parcela ${title.installmentNumber || 1} - Pedido #${title.orderId?.substring(0, 8)}`,
          externalReference: title.id,
          split: [
            {
              walletId: this.masterWalletId,
              fixedValue: 0.01,
              assumeFee: true,
            },
          ],
        },
        { headers: { access_token: apiKey } },
      );

      const boletoUrl = paymentResponse.data.bankSlipUrl;

      // 4. Desconta o crédito E atualiza o título na mesma Transação
      const decrementData =
        consumeFrom === 'MONTHLY'
          ? { monthlyBoletoBalance: { decrement: 1 } }
          : { extraBoletoBalance: { decrement: 1 } };

      await this.prisma.$transaction([
        this.prisma.tenant.update({
          where: { id: tenantId },
          data: decrementData,
        }),
        this.prisma.financialTitle.update({
          where: { id: title.id },
          data: {
            asaasPaymentId: paymentResponse.data.id,
            boletoUrl: boletoUrl,
            invoiceUrl: paymentResponse.data.invoiceUrl,
          },
        }),
      ]);

      // 5. Envia o e-mail
      if (title.customer?.email) {
        const emailHtml = buildBoletoEmail({
          customerName: title.customer.name,
          orderId: title.orderId || 'Avulso',
          amount: Number(title.balance),
          dueDate: title.dueDate,
          boletoUrl: boletoUrl,
        });

        this.mailService.sendMail(
          title.customer.email,
          `Seu boleto vence dia ${title.dueDate.toLocaleDateString('pt-BR')}`,
          emailHtml,
        );
      }

      return {
        success: true,
        message: 'Boleto gerado com sucesso e e-mail enviado ao cliente!',
        boletoUrl: boletoUrl,
      };
    } catch (error) {
      throw new HttpException(
        error.response?.data?.errors?.[0]?.description ||
          error.message ||
          'Erro ao comunicar com Asaas.',
        HttpStatus.BAD_GATEWAY,
      );
    }
  }

  // ==========================================================================
  // 5. SOLICITAR SAQUE / TRANSFERÊNCIA
  // ==========================================================================
  async requestTransfer(
    tenantId: string,
    transferData: {
      value: number;
      bankCode: string;
      agency: string;
      account: string;
      accountDigit: string;
      accountName: string;
      cpfCnpj: string;
      bankAccountType: 'CONTA_CORRENTE' | 'CONTA_POUPANCA';
    },
  ) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
    });

    if (!tenant?.asaasApiKey)
      throw new HttpException(
        'Conta digital não configurada.',
        HttpStatus.BAD_REQUEST,
      );

    try {
      const response = await axios.post(
        `${this.baseURL}/transfers`,
        {
          value: transferData.value,
          bankAccount: {
            bank: { code: transferData.bankCode },
            accountName: transferData.accountName,
            ownerName: transferData.accountName,
            cpfCnpj: transferData.cpfCnpj,
            agency: transferData.agency,
            account: transferData.account,
            accountDigit: transferData.accountDigit,
            bankAccountType: transferData.bankAccountType,
          },
          operationType: 'PIX',
        },
        { headers: { access_token: tenant.asaasApiKey } },
      );

      return {
        success: true,
        transferId: response.data.id,
        message:
          'Transferência solicitada com sucesso. O valor cairá na conta informada em breve.',
      };
    } catch (error) {
      throw new HttpException(
        error.response?.data?.errors?.[0]?.description ||
          'Erro ao processar o saque.',
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  // ==========================================================================
  // 6. PROCESSAMENTO DE WEBHOOKS
  // ==========================================================================
  async processWebhook(payload: any) {
    const { event, payment } = payload;

    if (event === 'PAYMENT_RECEIVED' || event === 'PAYMENT_CONFIRMED') {
      const asaasPaymentId = payment.id;

      const title = await this.prisma.financialTitle.findFirst({
        where: { asaasPaymentId },
        include: { order: true },
      });

      if (!title || title.status === 'PAID') {
        return;
      }

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

      if (title.orderId) {
        await this.prisma.commissionRecord.updateMany({
          where: {
            orderId: title.orderId,
            status: 'PENDING',
          },
          data: { status: 'APPROVED' },
        });
      }
    }

    if (event === 'PAYMENT_OVERDUE') {
      await this.prisma.financialTitle.updateMany({
        where: { asaasPaymentId: payment.id, status: 'OPEN' },
        data: { status: 'OVERDUE' },
      });
    }
  }

  // ==========================================================================
  // 7. CONSULTAR SALDO DA CARTEIRA
  // ==========================================================================
  async getWalletBalance(tenantId: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
    });

    if (!tenant?.asaasApiKey)
      throw new HttpException(
        'Conta digital não configurada.',
        HttpStatus.BAD_REQUEST,
      );

    try {
      const response = await axios.get(`${this.baseURL}/finance/balance`, {
        headers: { access_token: tenant.asaasApiKey },
      });
      return { balance: response.data.balance };
    } catch (error) {
      throw new HttpException(
        'Erro ao buscar saldo no Asaas.',
        HttpStatus.BAD_GATEWAY,
      );
    }
  }
}
