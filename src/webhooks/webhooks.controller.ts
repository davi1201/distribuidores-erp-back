import {
  Controller,
  Post,
  Headers,
  Body,
  BadRequestException,
} from '@nestjs/common';
import { createLogger } from '../core/logging';
import { Webhook } from 'svix';
import { PrismaService } from '../prisma/prisma.service';
import { addDays } from 'date-fns';

@Controller('webhooks')
export class WebhooksController {
  private readonly logger = createLogger(WebhooksController.name);

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

    this.logger.log(
      `📥 Webhook recebido: type=${eventType} id=${data?.id ?? 'N/A'} email=${data?.email_addresses?.[0]?.email_address ?? 'N/A'}`,
    );

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

    this.logger.log(
      `🔄 SyncUser: email=${email} clerkId=${clerkId} name="${name}"`,
    );

    const existingUser = await this.prisma.user.findFirst({
      where: {
        OR: [{ clerkId: clerkId }, { email: email }],
      },
    });

    if (existingUser) {
      this.logger.log(
        `✅ Usuário já existe: id=${existingUser.id} tenantId=${existingUser.tenantId ?? 'NULL'} role=${existingUser.role}. Atualizando dados...`,
      );
      await this.prisma.user.update({
        where: { id: existingUser.id },
        data: {
          clerkId: clerkId,
          email,
          name,
          avatarUrl: image,
        },
      });
    } else {
      this.logger.log(
        `✨ Usuário novo (${email}). Provisionando User + Tenant + Warehouse em transação...`,
      );

      const defaultPlan = await this.prisma.plan.findFirst();
      if (!defaultPlan) {
        this.logger.error(
          '❌ ERRO CRÍTICO: Nenhum plano cadastrado no banco. Impossível criar tenant para novo usuário.',
        );
        throw new Error(
          'Nenhum plano cadastrado. Impossível provisionar tenant.',
        );
      }

      const tempSlug = `tenant-${Date.now()}`;
      const firstName = name.split(' ')[0] || 'Novo Usuário';

      await this.prisma.$transaction(async (tx) => {
        const tenant = await tx.tenant.create({
          data: {
            name: `Empresa de ${firstName}`,
            slug: tempSlug,
            isActive: true,
            trialEndsAt: addDays(new Date(), 7),
            planId: defaultPlan.id,
          },
        });

        const user = await tx.user.create({
          data: {
            clerkId,
            email,
            name,
            avatarUrl: image,
            password: '',
            role: 'OWNER',
            tenantId: tenant.id,
          },
        });

        await tx.warehouse.create({
          data: {
            name: 'Depósito Principal',
            tenantId: tenant.id,
            responsibleUserId: user.id,
            isDefault: true,
          },
        });

        this.logger.log(
          `✅ Provisão completa: user=${user.id} tenant=${tenant.id} (${tenant.name}) warehouse=default`,
        );
      });
    }
  }

  private async deleteUser(clerkId: string) {
    this.logger.warn(`🗑️ Solicitação de delete para user Clerk ${clerkId}`);
    // Implementar soft delete se necessário
  }

  private async syncTenant(data: any) {
    const clerkOrgId = data.id;
    const orgName = data.name;
    const orgSlug = data.slug;
    const creatorClerkId = data.created_by;

    this.logger.log(
      `🏢 SyncTenant: name="${orgName}" clerkOrgId=${clerkOrgId} createdBy=${creatorClerkId ?? 'N/A'}`,
    );

    // 1. Já existe um Tenant com esse clerkId? Apenas atualiza.
    const existingTenantByClerk = await this.prisma.tenant.findUnique({
      where: { clerkId: clerkOrgId },
    });

    if (existingTenantByClerk) {
      this.logger.log(
        `🏢 Tenant já vinculado ao clerkId ${clerkOrgId} (id=${existingTenantByClerk.id}). Atualizando nome/slug.`,
      );
      await this.prisma.tenant.update({
        where: { id: existingTenantByClerk.id },
        data: {
          name: orgName,
          slug: orgSlug || existingTenantByClerk.slug,
        },
      });
      return;
    }

    // 2. Se o criador já tem um Tenant (auto-provisionado pelo syncUser),
    //    vincula o clerkId da org a esse Tenant existente.
    if (creatorClerkId) {
      const creator = await this.prisma.user.findUnique({
        where: { clerkId: creatorClerkId },
        include: { tenant: true },
      });

      if (creator?.tenant && !creator.tenant.clerkId) {
        this.logger.log(
          `🔗 Criador ${creator.email} já possui Tenant ${creator.tenant.id} (sem clerkId). Vinculando clerkId da org...`,
        );
        await this.prisma.tenant.update({
          where: { id: creator.tenant.id },
          data: {
            clerkId: clerkOrgId,
            name: orgName,
            slug: orgSlug || creator.tenant.slug,
          },
        });
        return;
      }
    }

    // 3. Nenhum Tenant existente — cria um novo.
    this.logger.log(
      `🆕 Nenhum Tenant existente para clerkOrgId=${clerkOrgId}. Criando novo...`,
    );
    const defaultPlan = await this.prisma.plan.findFirst();
    if (!defaultPlan) {
      this.logger.error('❌ ERRO CRÍTICO: Nenhum plano cadastrado no banco.');
      throw new Error('Nenhum plano cadastrado.');
    }

    const tenant = await this.prisma.tenant.create({
      data: {
        clerkId: clerkOrgId,
        name: orgName,
        trialEndsAt: addDays(new Date(), 7),
        slug: orgSlug || `org-${clerkOrgId}`,
        isActive: true,
        planId: defaultPlan.id,
      },
    });

    // Se temos o criador, vincula ele ao novo Tenant.
    if (creatorClerkId) {
      const creator = await this.prisma.user.findUnique({
        where: { clerkId: creatorClerkId },
      });

      if (creator && !creator.tenantId) {
        await this.prisma.user.update({
          where: { id: creator.id },
          data: { tenantId: tenant.id, role: 'OWNER' },
        });
        this.logger.log(
          `✅ Criador ${creator.email} vinculado ao novo Tenant ${tenant.id}`,
        );
      } else if (creator) {
        this.logger.log(
          `ℹ️ Criador ${creator.email} já possui tenantId=${creator.tenantId}. Não vinculado.`,
        );
      } else {
        this.logger.warn(
          `⚠️ Criador clerkId=${creatorClerkId} não encontrado no banco.`,
        );
      }
    }

    this.logger.log(`✅ Tenant criado: id=${tenant.id} name="${tenant.name}"`);
  }

  private async linkUserToTenant(data: any) {
    const clerkUserId = data.public_user_data?.user_id;
    const clerkOrgId = data.organization?.id;
    const clerkRole = data.role;

    this.logger.log(
      `🔗 LinkUser: clerkUserId=${clerkUserId} clerkOrgId=${clerkOrgId} role=${clerkRole}`,
    );

    if (!clerkUserId || !clerkOrgId) {
      this.logger.warn(
        `⚠️ Dados incompletos no membership: userId=${clerkUserId} orgId=${clerkOrgId}. Ignorando.`,
      );
      return;
    }

    // Busca o Tenant pelo clerkId da org
    let tenant = await this.prisma.tenant.findUnique({
      where: { clerkId: clerkOrgId },
    });

    // Se não encontrou, pode ser que o org.created ainda não chegou.
    // Tenta encontrar pelo tenant já vinculado ao user (auto-provisionado).
    if (!tenant) {
      const user = await this.prisma.user.findUnique({
        where: { clerkId: clerkUserId },
        include: { tenant: true },
      });

      if (user?.tenant && !user.tenant.clerkId) {
        this.logger.log(
          `🔗 Tenant ${user.tenant.id} sem clerkId encontrado via user. Vinculando clerkId=${clerkOrgId}...`,
        );
        tenant = await this.prisma.tenant.update({
          where: { id: user.tenant.id },
          data: { clerkId: clerkOrgId },
        });
      } else {
        this.logger.warn(
          `⏳ Tenant clerkId=${clerkOrgId} não encontrado. Aguardando organization.created.`,
        );
        return;
      }
    }

    const user = await this.prisma.user.findUnique({
      where: { clerkId: clerkUserId },
    });

    if (!user) {
      this.logger.warn(
        `⏳ User clerkId=${clerkUserId} não encontrado. Aguardando user.created.`,
      );
      return;
    }

    let appRole = 'SELLER';
    if (clerkRole === 'org:admin') appRole = 'ADMIN';
    if (clerkRole === 'org:owner') appRole = 'OWNER';

    // Se o user já está vinculado a este tenant, apenas atualiza a role
    if (user.tenantId === tenant.id) {
      this.logger.log(
        `ℹ️ User ${user.email} já vinculado ao Tenant ${tenant.id}. Atualizando role para ${appRole}.`,
      );
    }

    await this.prisma.user.update({
      where: { clerkId: clerkUserId },
      data: {
        tenantId: tenant.id,
        role: appRole as any,
        isActive: true,
      },
    });

    this.logger.log(
      `✅ Vínculo: user=${user.email} → tenant=${tenant.name} (${tenant.id}) role=${appRole}`,
    );
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
