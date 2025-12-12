import {
  Injectable,
  NotFoundException,
  Logger,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateBillingProfileDto } from '../users/dto/update-billing-profile.dto';
import { User } from '@prisma/client';
import { SaveNfeEmailConfigDto } from './dto/create-nfe-email-config.dto';
import * as imap from 'imap-simple';

@Injectable()
export class TenantsService {
  private readonly logger = new Logger(TenantsService.name);

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
        phone: data.phone.replace(/\D/g, ''),
        email: user.email,
        zipCode: data.zipCode,
        street: data.street,
        number: data.number,
        complement: data.complement,
        neighborhood: data.neighborhood,
        cityName: finalCityName,
        stateUf: finalStateUf,
        stateId: stateConnectId,
        cityId: cityConnectId,
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
    if (!tenant) throw new NotFoundException('Tenant não encontrado.');

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
}
