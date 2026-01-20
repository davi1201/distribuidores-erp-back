import {
  Controller,
  Post,
  Headers,
  Body,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { Webhook } from 'svix';
import { PrismaService } from 'src/prisma/prisma.service';
import { addDays } from 'date-fns';

@Controller('webhooks')
export class WebhooksController {
  private readonly logger = new Logger(WebhooksController.name);

  constructor(private readonly prisma: PrismaService) {}

  @Post('clerk')
  async handleClerkWebhook(
    @Headers('svix-id') svixId: string,
    @Headers('svix-timestamp') svixTimestamp: string,
    @Headers('svix-signature') svixSignature: string,
    @Body() payload: any,
  ) {
    const WEBHOOK_SECRET = process.env.CLERK_WEBHOOK_SECRET;

    if (!WEBHOOK_SECRET) {
      throw new Error('Please add CLERK_WEBHOOK_SECRET to .env');
    }

    if (!svixId || !svixTimestamp || !svixSignature) {
      throw new BadRequestException('Missing svix headers');
    }

    const wh = new Webhook(WEBHOOK_SECRET);
    let evt: any;

    try {
      evt = wh.verify(JSON.stringify(payload), {
        'svix-id': svixId,
        'svix-timestamp': svixTimestamp,
        'svix-signature': svixSignature,
      });
    } catch (err) {
      this.logger.error('Webhook verification failed:', err);
      throw new BadRequestException('Webhook verification failed');
    }

    const eventType = evt.type;
    const data = evt.data;

    this.logger.log(`📥 Webhook recebido: ${eventType}`);

    try {
      switch (eventType) {
        // --- USUÁRIOS ---
        case 'user.created':
        case 'user.updated':
          await this.syncUser(data);
          break;

        case 'user.deleted':
          await this.deleteUser(data.id);
          break;

        // --- ORGANIZAÇÕES (TENANTS) ---
        case 'organization.created':
        case 'organization.updated':
          await this.syncTenant(data);
          break;

        // --- MEMBROS ---
        case 'organizationMembership.created':
          await this.linkUserToTenant(data);
          break;

        case 'organizationMembership.deleted':
          await this.unlinkUserFromTenant(data);
          break;

        case 'organizationInvitation.accepted':
          await this.acceptInvitation(data);
          break;
      }
    } catch (error) {
      this.logger.error(
        `❌ Erro ao processar evento ${eventType}: ${error.message}`,
        error.stack,
      );
      // Não relançamos o erro para o Clerk não ficar tentando reenviar infinitamente
      // se for um erro de lógica interna que não vai se resolver sozinho.
    }

    return { success: true };
  }

  // --- HELPERS DB ---

  private async syncUser(data: any) {
    const email = data.email_addresses[0]?.email_address;
    const name = `${data.first_name || ''} ${data.last_name || ''}`.trim();
    const image = data.profile_image_url;
    const clerkId = data.id;

    this.logger.log(`🔄 SyncUser: Processando ${email} (${clerkId})`);

    // 1. Verificação Dupla (Evita erro P2002 Unique Constraint)
    // Procuramos por ID do Clerk OU por Email
    const existingUser = await this.prisma.user.findFirst({
      where: {
        OR: [{ clerkId: clerkId }, { email: email }],
      },
    });

    if (existingUser) {
      // Se achou, atualiza (mesmo que o ID do clerk tenha mudado, o email manda)
      this.logger.log(
        `✅ Usuário encontrado (ID: ${existingUser.id}). Atualizando...`,
      );
      await this.prisma.user.update({
        where: { id: existingUser.id },
        data: {
          clerkId: clerkId, // Garante que o ID do Clerk esteja atualizado
          email,
          name,
          avatarUrl: image,
        },
      });
    } else {
      // Se não achou nem por ID nem por Email, cria
      this.logger.log(`✨ Criando novo usuário...`);
      await this.prisma.user.create({
        data: {
          clerkId,
          email,
          name,
          avatarUrl: image,
          password: '', // Legado
          role: 'OWNER', // Padrão até ser vinculado a uma org
        },
      });
    }
  }

  private async deleteUser(clerkId: string) {
    this.logger.warn(`🗑️ Solicitação de delete para user Clerk ${clerkId}`);
    // Implementar soft delete se necessário
  }

  private async syncTenant(data: any) {
    this.logger.log(`🏢 SyncTenant: ${data.name} (${data.id})`);
    const defaultPlan = await this.prisma.plan.findFirst();

    if (!defaultPlan) {
      const errorMsg =
        '⚠️ ERRO CRÍTICO: Tentativa de criar Tenant sem Planos cadastrados no banco.';
      this.logger.error(errorMsg);
      throw new Error(errorMsg);
    }

    const tenant = await this.prisma.tenant.upsert({
      where: { clerkId: data.id },
      update: {
        name: data.name,
        slug: data.slug,
      },
      create: {
        clerkId: data.id,
        name: data.name,
        trialEndsAt: addDays(new Date(), 7),
        slug: data.slug || `org-${data.id}`,
        isActive: true,
        plan: {
          connect: { id: defaultPlan.id },
        },
      },
    });

    await this.prisma.user.update({
      where: { clerkId: data.created_by },
      data: { tenantId: tenant.id },
    });
  }

  private async linkUserToTenant(data: any) {
    const clerkUserId = data.public_user_data.user_id;
    const clerkOrgId = data.organization.id;
    const clerkRole = data.role;

    this.logger.log(`🔗 LinkUser: User ${clerkUserId} -> Org ${clerkOrgId}`);

    // Tentativa de Retry Manual Simples (Caso o Tenant ainda não tenha sido salvo pelo outro webhook)
    let tenant = await this.prisma.tenant.findUnique({
      where: { clerkId: clerkOrgId },
    });

    if (!tenant) {
      this.logger.warn(
        `⏳ Tenant ${clerkOrgId} não encontrado localmente. O webhook organization.created pode estar atrasado.`,
      );
      // Em produção, o ideal é deixar falhar e o Clerk tenta de novo,
      // ou criar o Tenant aqui de forma "Stub" (apenas ID e Nome).
      return;
    }

    let appRole = 'SELLER';
    if (clerkRole === 'org:admin') appRole = 'ADMIN';

    // Verifica se o user existe antes de tentar update
    const user = await this.prisma.user.findUnique({
      where: { clerkId: clerkUserId },
    });

    if (!user) {
      this.logger.warn(
        `⏳ User ${clerkUserId} não encontrado para vínculo. Aguardando user.created.`,
      );
      return;
    }

    await this.prisma.user.update({
      where: { clerkId: clerkUserId },
      data: {
        tenantId: tenant.id,
        role: appRole as any,
      },
    });

    this.logger.log(`✅ Vínculo realizado com sucesso.`);
  }

  private async unlinkUserFromTenant(data: any) {
    const clerkUserId = data.public_user_data.user_id;
    await this.prisma.user.update({
      where: { clerkId: clerkUserId },
      data: { tenantId: null },
    });
  }

  private async acceptInvitation(data: any) {
    const user = await this.prisma.user.findUnique({
      where: { clerkId: data.id },
    });

    if (!user) {
      this.logger.warn(
        `⏳ User para invitation ${data.id} não encontrado. Aguardando user.created.`,
      );
      return;
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: { clerkId: data.user_id, isActive: true },
    });

    this.logger.log(`✅ Invitation accepted: User ${data.user_id}`);
  }
}
