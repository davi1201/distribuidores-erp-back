import { Injectable, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { PrismaService } from 'src/prisma/prisma.service';
import axios from 'axios';

@Injectable()
export class AsaasOnboardingService {
  private readonly logger = new Logger(AsaasOnboardingService.name);

  private readonly masterApiKey = process.env.ASAAS_MASTER_API_KEY;
  private readonly baseURL =
    process.env.ASAAS_API_URL || 'https://sandbox.asaas.com/api/v3';
  private readonly baseWebhookUrl =
    process.env.APP_WEBHOOK_ASAAS_URL ||
    'https://seu-ngrok.app/api/v1/webhooks/asaas';

  constructor(private readonly prisma: PrismaService) {}

  // ==========================================================================
  // 1. ORQUESTRADOR PRINCIPAL DO ONBOARDING
  // ==========================================================================
  public async setupNewTenant(tenantId: string) {
    this.logger.log(
      `🚀 Iniciando esteira de onboarding Asaas para o Tenant: ${tenantId}`,
    );

    const tenant = await this.validateTenantContext(tenantId);
    let { asaasApiKey, asaasWalletId, asaasAccountId } = tenant;

    // Se ainda não tem conta no Asaas, cria uma agora
    if (!asaasApiKey) {
      const accountData = await this.createAsaasAccount(tenant);
      asaasApiKey = accountData.apiKey;
      asaasWalletId = accountData.walletId;
      asaasAccountId = accountData.id; // 🔥 CORREÇÃO: Pegando o Account ID (acc_...)

      await this.prisma.tenant.update({
        where: { id: tenantId },
        data: {
          asaasApiKey,
          asaasWalletId,
          asaasAccountId, // 🔥 CORREÇÃO: Salvando no banco
          asaasAccountStatus: 'PENDING',
        },
      });
      this.logger.log(
        `✅ Conta Asaas criada. AccountID: ${asaasAccountId} | WalletID: ${asaasWalletId}`,
      );
    }

    // Configura o Webhook na subconta
    await this.configureWebhook(asaasApiKey!, tenant.billingProfile?.email!);

    // Busca a URL de envio de documentos
    const onboardingUrl = await this.fetchOnboardingUrl(asaasApiKey!);

    await this.prisma.tenant.update({
      where: { id: tenantId },
      data: { asaasOnboardingUrl: onboardingUrl },
    });

    this.logger.log(
      `🎉 Onboarding do Tenant concluído. Aguardando envio de documentos.`,
    );

    return {
      success: true,
      message:
        'Conta digital provisionada! Acesse o link de envio de documentos.',
      onboardingUrl: onboardingUrl,
    };
  }

  // ==========================================================================
  // 2. ESCUTA DE EVENTOS (Onde a mágica da aprovação acontece)
  // ==========================================================================

  @OnEvent('asaas.ACCOUNT_STATUS_GENERAL_APPROVAL_APPROVED')
  @OnEvent('asaas.ACCOUNT_STATUS_UPDATED')
  async handleAccountApproved(payload: any) {
    const { event, account } = payload;
    const webhookAccountId = account?.id; // 🔥 Isso vem como 'acc_...' do Asaas
    const status = account?.status;

    if (!webhookAccountId) return;

    if (event === 'ACCOUNT_STATUS_UPDATED' && status !== 'APPROVED') {
      return;
    }

    this.logger.log(
      `🎉 Recebido aviso de APROVAÇÃO para o Account ID: ${webhookAccountId}`,
    );

    try {
      // 🔥 CORREÇÃO: Buscando pelo asaasAccountId em vez da Wallet
      const tenant = await this.prisma.tenant.findFirst({
        where: { asaasAccountId: webhookAccountId },
      });

      if (!tenant) {
        this.logger.error(
          `❌ FALHA CRÍTICA: Nenhum Tenant encontrado no banco com asaasAccountId = ${webhookAccountId}`,
        );
        return;
      }

      if (tenant.asaasAccountStatus === 'APPROVED') {
        this.logger.warn(
          `⚠️ O Tenant ${tenant.id} já estava como APPROVED no banco.`,
        );
        return;
      }

      this.logger.log(`🔄 Atualizando Tenant ${tenant.id} para APPROVED...`);

      let pixKeySalva: string | null = null;

      if (tenant.asaasApiKey) {
        this.logger.log(`🔑 Solicitando criação da Chave Pix EVP...`);
        pixKeySalva = await this.createPixKeyEVP(tenant.asaasApiKey);
      }

      await this.prisma.tenant.update({
        where: { id: tenant.id },
        data: {
          asaasAccountStatus: 'APPROVED',
          asaasPixKey: pixKeySalva,
        },
      });

      this.logger.log(
        `✅ SUCESSO! Tenant atualizado e Chave PIX vinculada: ${pixKeySalva || 'Nenhuma'}`,
      );
    } catch (error) {
      this.logger.error(
        `❌ Erro interno ao aprovar conta no banco: ${error.message}`,
      );
    }
  }

  @OnEvent('asaas.ACCOUNT_STATUS_GENERAL_APPROVAL_REJECTED')
  async handleAccountRejected(payload: any) {
    const webhookAccountId = payload.account?.id;
    const rejectReason =
      payload.account?.rejectReasons || 'Motivo não especificado';

    if (!webhookAccountId) return;

    this.logger.warn(
      `⚠️ REJEITADO: A conta ${webhookAccountId} foi rejeitada. Motivo: ${rejectReason}`,
    );

    try {
      // 🔥 CORREÇÃO: Buscando pelo asaasAccountId
      const tenant = await this.prisma.tenant.findFirst({
        where: { asaasAccountId: webhookAccountId },
      });

      if (tenant) {
        await this.prisma.tenant.update({
          where: { id: tenant.id },
          data: { asaasAccountStatus: 'REJECTED' },
        });
        this.logger.log(`✅ Tenant ${tenant.id} marcado como REJECTED.`);
      }
    } catch (error) {
      this.logger.error(`Erro ao rejeitar conta no banco: ${error.message}`);
    }
  }

  // ==========================================================================
  // 3. MÉTODOS PRIVADOS AUXILIARES
  // ==========================================================================

  private async createPixKeyEVP(apiKey: string): Promise<string | null> {
    try {
      const response = await axios.post(
        `${this.baseURL}/pix/addressKeys`,
        { type: 'EVP' },
        { headers: { access_token: apiKey } },
      );

      const chaveGerada = response.data?.key;
      this.logger.log(`✅ Chave PIX EVP gerada com sucesso: ${chaveGerada}`);

      return chaveGerada;
    } catch (error) {
      const errorMsg =
        error.response?.data?.errors?.[0]?.description || error.message;
      this.logger.warn(`⚠️ Aviso ao tentar gerar chave PIX: ${errorMsg}`);
      return null;
    }
  }

  private async validateTenantContext(tenantId: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      include: { billingProfile: true },
    });

    if (!tenant)
      throw new HttpException('Tenant não encontrado.', HttpStatus.NOT_FOUND);

    const profile = tenant.billingProfile;
    if (!profile?.document || !profile?.phone || !profile?.email) {
      throw new HttpException(
        'Perfil financeiro incompleto.',
        HttpStatus.BAD_REQUEST,
      );
    }
    return tenant;
  }

  private async createAsaasAccount(tenant: any) {
    try {
      const response = await axios.post(
        `${this.baseURL}/accounts`,
        {
          name: tenant.name,
          email: tenant.billingProfile.email,
          cpfCnpj: tenant.billingProfile.document,
          mobilePhone: tenant.billingProfile.phone,
          incomeValue: 5000,
          birthDate: tenant.billingProfile.birthDate || '1990-01-01',
          postalCode: tenant.billingProfile.zipCode || '01001000',
          addressNumber: tenant.billingProfile.number || 'S/N',
        },
        { headers: { access_token: this.masterApiKey } },
      );
      return response.data;
    } catch (error) {
      this.handleAsaasError(error, 'Erro ao criar subconta no Asaas');
    }
  }

  private async configureWebhook(apiKey: string, email: string) {
    try {
      await axios.post(
        `${this.baseURL}/webhooks`,
        {
          name: 'Vendus-pro Webhook',
          url: this.baseWebhookUrl,
          email: email,
          enabled: true,
          interrupted: false,
          apiVersion: 3,
          sendType: 'SEQUENTIALLY',
          events: [
            'PAYMENT_RECEIVED',
            'PAYMENT_CONFIRMED',
            'PAYMENT_OVERDUE',
            'PAYMENT_REFUNDED',
            'ACCOUNT_STATUS_GENERAL_APPROVAL_APPROVED',
            'ACCOUNT_STATUS_GENERAL_APPROVAL_REJECTED',
          ],
        },
        { headers: { access_token: apiKey } },
      );
      this.logger.log(`✅ Webhook configurado com sucesso (URL Limpa).`);
    } catch (error) {
      this.logger.warn(`Aviso ao configurar webhook: ${error.message}`);
    }
  }

  private async fetchOnboardingUrl(apiKey: string): Promise<string> {
    const isSandbox = this.baseURL.includes('sandbox');
    try {
      this.logger.log('⏳ Aguardando 15s obrigatórios do Asaas...');
      await new Promise((resolve) => setTimeout(resolve, 15000));

      for (let i = 0; i < 5; i++) {
        const response = await axios.get(
          `${this.baseURL}/myAccount/documents`,
          {
            headers: { access_token: apiKey },
          },
        );

        const docComLink = (response.data?.data || []).find(
          (doc: any) => doc.onboardingUrl,
        );

        if (docComLink && docComLink.onboardingUrl) {
          this.logger.log('✅ URL de Onboarding recuperada!');
          return docComLink.onboardingUrl;
        }
        await new Promise((resolve) => setTimeout(resolve, 5000));
      }
      return isSandbox ? 'https://sandbox.asaas.com/onboarding/mock-url' : '';
    } catch (error) {
      return isSandbox ? 'https://sandbox.asaas.com/onboarding/mock-url' : '';
    }
  }

  private handleAsaasError(error: any, defaultMessage: string): never {
    const asaasError =
      error.response?.data?.errors?.[0]?.description || error.message;
    this.logger.error(`${defaultMessage}: ${asaasError}`, error.response?.data);
    throw new HttpException(`Asaas: ${asaasError}`, HttpStatus.BAD_GATEWAY);
  }
}
