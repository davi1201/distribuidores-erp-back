import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { createLogger } from '../core/logging';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateBillingProfileDto } from '../users/dto/update-billing-profile.dto';
import { User } from '@prisma/client';
import { SaveNfeEmailConfigDto } from '../nfe/dto/create-nfe-email-config.dto';
import * as imap from 'imap-simple';

// Core imports
import { ERROR_MESSAGES, ENTITY_NAMES } from '../core/constants';

@Injectable()
export class TenantsService {
  private readonly logger = createLogger(TenantsService.name);

  constructor(private prisma: PrismaService) {}

  async checkBillingProfile(tenantId: string) {
    const profile = await this.prisma.billingProfile.findUnique({
      where: { tenantId },
      select: {
        document: true,
        zipCode: true,
      },
    });

    const isComplete = !!profile?.document && !!profile?.zipCode;
    return { isComplete };
  }

  async updateBillingProfile(user: User, data: UpdateBillingProfileDto) {
    if (!user.tenantId) throw new NotFoundException('Tenant ID não informado');

    let stateConnectId: number | null = null;
    let cityConnectId: number | null = null;
    let finalStateUf = data.state;
    let finalCityName = data.city;

    if (data.state) {
      const isId = !isNaN(Number(data.state));
      const stateObj = await this.prisma.state.findUnique({
        where: isId
          ? { id: Number(data.state) }
          : { uf: data.state.toUpperCase() },
      });

      if (stateObj) {
        stateConnectId = stateObj.id;
        finalStateUf = stateObj.uf;
      }
    }

    if (data.ibgeCode) {
      const cityObj = await this.prisma.city.findUnique({
        where: { ibgeCode: data.ibgeCode },
        include: { state: true },
      });

      if (cityObj) {
        cityConnectId = cityObj.id;
        finalCityName = cityObj.name;
        stateConnectId = cityObj.stateId;
        finalStateUf = cityObj.state.uf;
      }
    } else if (stateConnectId && data.city) {
      const isId = !isNaN(Number(data.city));
      const cityObj = await this.prisma.city.findFirst({
        where: {
          stateId: stateConnectId,
          ...(isId
            ? { id: Number(data.city) }
            : { name: { equals: data.city, mode: 'insensitive' } }),
        },
      });

      if (cityObj) {
        cityConnectId = cityObj.id;
        finalCityName = cityObj.name;
      }
    }

    this.logger.log(
      `Atualizando BillingProfile do Tenant ${user.tenantId}. CityID: ${cityConnectId}, StateID: ${stateConnectId}`,
    );

    return this.prisma.billingProfile.create({
      data: {
        tenantId: user.tenantId,
        personType: data.personType,
        document: data.document.replace(/\D/g, ''),
        commercialPhone: data.phone.replace(/\D/g, ''),
        billingEmail: user.email,
        zipCode: data.zipCode,
        street: data.street,
        number: data.number,
        complement: data.complement,
        neighborhood: data.neighborhood,
        cityId: cityConnectId,
        stateId: stateConnectId,
      },
    });
  }

  async getEmailConfig(tenantId: string) {
    const config = await this.prisma.tenantEmailConfig.findUnique({
      where: { tenantId },
    });

    if (!config) return null;

    return {
      host: config.host,
      port: config.port,
      user: config.user,
      // Retornamos a senha para preencher o formulário no front.
      // Em produção, o ideal é retornar mascarado (ex: *****) e só atualizar se o usuário enviar uma nova.
      password: config.password,
      isActive: config.isActive,
    };
  }

  async saveEmailConfig(tenantId: string, dto: SaveNfeEmailConfigDto) {
    // Verifica se o tenant existe
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
    });
    if (!tenant)
      throw new NotFoundException(
        ERROR_MESSAGES.NOT_FOUND(ENTITY_NAMES.TENANT),
      );

    // Upsert: Cria se não existe, Atualiza se existe
    return this.prisma.tenantEmailConfig.upsert({
      where: { tenantId },
      create: {
        tenantId,
        host: dto.host,
        port: Number(dto.port),
        user: dto.user,
        password: dto.password, // TODO: Criptografar antes de salvar em produção
        isActive: true,
      },
      update: {
        host: dto.host,
        port: Number(dto.port),
        user: dto.user,
        password: dto.password, // TODO: Criptografar
        isActive: true,
      },
    });
  }

  async testEmailConnection(tenantId: string) {
    // 1. Busca a configuração salva
    const config = await this.prisma.tenantEmailConfig.findUnique({
      where: { tenantId },
    });

    if (!config) {
      throw new BadRequestException(
        'Nenhuma configuração de e-mail encontrada para este tenant. Salve antes de testar.',
      );
    }

    // 2. Configura a conexão IMAP
    const imapConfig = {
      imap: {
        user: config.user,
        password: config.password,
        host: config.host,
        port: config.port,
        tls: true,
        authTimeout: 5000, // Timeout de 5s para não travar
      },
    };

    try {
      // 3. Tenta conectar
      const connection = await imap.connect(imapConfig);

      // 4. Tenta abrir a Inbox (garante que permissões estão ok)
      await connection.openBox('INBOX');

      // 5. Conta mensagens (apenas para dar feedback visual)
      const searchCriteria = ['ALL'];
      const fetchOptions = {
        bodies: ['HEADER'],
        struct: true,
        markSeen: false,
      };
      const messages = await connection.search(searchCriteria, fetchOptions);

      // Fecha conexão
      connection.end();

      return {
        status: 'success',
        message: 'Conexão realizada com sucesso!',
        totalMessages: messages.length,
      };
    } catch (error: any) {
      console.error('Erro no teste de conexão IMAP:', error);

      // Retorna erro amigável
      let errorMessage = 'Falha ao conectar.';
      if (error.code === 'EITIMEDOUT')
        errorMessage = 'Tempo limite esgotado. Verifique Host e Porta.';
      if (error.textCode === 'AUTHENTICATIONFAILED')
        errorMessage = 'Usuário ou Senha incorretos.';

      return {
        status: 'error',
        message: `${errorMessage} Detalhes: ${error.message}`,
      };
    }
  }

  // ========================================================================
  // CONFIGURAÇÃO DE MÉTODOS DE PAGAMENTO (TENANT)
  // ========================================================================

  async savePaymentMethodConfig(
    tenantId: string,
    systemMethodId: string,
    dto: any, // Considere criar uma interface/DTO tipada para isso (ex: UpdatePaymentMethodDto)
  ) {
    // 1. Validar se o método base realmente existe no sistema
    const systemMethod = await this.prisma.systemPaymentMethod.findUnique({
      where: { id: systemMethodId },
    });

    if (!systemMethod) {
      throw new NotFoundException(
        ERROR_MESSAGES.NOT_FOUND(ENTITY_NAMES.PAYMENT_METHOD),
      );
    }

    // 2. Executar a gravação em uma transação para garantir consistência
    return this.prisma.$transaction(async (tx) => {
      // Upsert na configuração do Tenant
      const tenantMethod = await tx.tenantPaymentMethod.upsert({
        where: {
          tenantId_systemPaymentMethodId: {
            tenantId,
            systemPaymentMethodId: systemMethodId,
          },
        },
        create: {
          tenantId,
          systemPaymentMethodId: systemMethodId,
          customName: dto.customName || systemMethod.name,
          isActive: dto.isActive ?? true, // Ajustado para o default do schema
          maxInstallments: dto.maxInstallments || 1,
          minInstallmentValue: dto.minInstallmentValue || 0,
          passFeeToCustomer: dto.passFeeToCustomer ?? false,
          isAnticipated: dto.isAnticipated ?? true,
          isConfigured: true,
          discountPercentage: dto.discountPercentage || 0,
          interestRatePerDay: dto.interestRatePerDay || 0,
          finePercentage: dto.finePercentage || 0,
          dueDays: dto.dueDays || 3,
        },
        update: {
          customName: dto.customName,
          isActive: dto.isActive,
          maxInstallments: dto.maxInstallments,
          minInstallmentValue: dto.minInstallmentValue,
          passFeeToCustomer: dto.passFeeToCustomer,
          isAnticipated: dto.isAnticipated,
          isConfigured: true,

          // Configurações de Boleto / PIX
          discountPercentage: dto.discountPercentage,
          interestRatePerDay: dto.interestRatePerDay,
          finePercentage: dto.finePercentage,
          dueDays: dto.dueDays,
        },
      });

      // 3. Se for um método de maquininha (Cartão), processamos a grade de parcelas
      if (
        systemMethod.isAcquirer &&
        dto.installments &&
        Array.isArray(dto.installments)
      ) {
        // Removemos a grade antiga para evitar duplicidade ou lixo
        await tx.tenantPaymentInstallment.deleteMany({
          where: { tenantPaymentMethodId: tenantMethod.id },
        });

        // Inserimos a nova grade de taxas
        if (dto.installments.length > 0) {
          await tx.tenantPaymentInstallment.createMany({
            data: dto.installments.map((inst: any) => ({
              tenantPaymentMethodId: tenantMethod.id,
              installment: inst.installment,
              feePercentage: inst.feePercentage || 0,
              receiveInDays: inst.receiveInDays || (dto.isAnticipated ? 1 : 30),
            })),
          });
        }
      }

      return tenantMethod;
    });
  }

  async getPaymentMethodConfig(tenantId: string, systemMethodId: string) {
    const systemMethod = await this.prisma.systemPaymentMethod.findUnique({
      where: { id: systemMethodId },
      include: {
        tenantMethods: {
          where: { tenantId },
          include: {
            installments: true,
          },
        },
      },
    });

    if (!systemMethod) {
      throw new NotFoundException(
        ERROR_MESSAGES.NOT_FOUND(ENTITY_NAMES.PAYMENT_METHOD),
      );
    }

    const config = systemMethod.tenantMethods[0]; // Deve haver no máximo 1 config por tenant

    if (!config) {
      return null; // Método existe, mas não está configurado para este tenant
    }

    return {
      customName: config.customName,
      isActive: config.isActive,
      maxInstallments: config.maxInstallments,
      minInstallmentValue: config.minInstallmentValue,
      passFeeToCustomer: config.passFeeToCustomer,
      isAnticipated: config.isAnticipated,
      discountPercentage: config.discountPercentage,
      interestRatePerDay: config.interestRatePerDay,
      finePercentage: config.finePercentage,
      dueDays: config.dueDays,
      installments: config.installments.map((inst) => ({
        installment: inst.installment,
        feePercentage: inst.feePercentage,
        receiveInDays: inst.receiveInDays,
      })),
    };
  }
}
