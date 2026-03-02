import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { addDays } from 'date-fns';

@Injectable()
export class WebhooksService {
  private readonly logger = new Logger(WebhooksService.name);

  constructor(private readonly prisma: PrismaService) {}

  async processClerkEvent(eventType: string, data: any) {
    this.logger.log(`📥 Processando evento Clerk: ${eventType}`);

    switch (eventType) {
      case 'user.created':
      case 'user.updated':
        await this.syncUser(data);
        break;

      case 'user.deleted':
        await this.deleteUser(data.id);
        break;

      case 'organization.created':
      case 'organization.updated':
        await this.syncTenant(data);
        break;

      case 'organizationMembership.created':
      case 'organizationMembership.updated':
        await this.linkUserToTenant(data);
        break;

      case 'organizationMembership.deleted':
        await this.unlinkUserFromTenant(data);
        break;
    }
  }

  // ==========================================================================
  // HELPERS DB
  // ==========================================================================

  private async syncUser(data: any) {
    const email = data.email_addresses[0]?.email_address;
    const name = `${data.first_name || ''} ${data.last_name || ''}`.trim();
    const image = data.profile_image_url;
    const clerkId = data.id;

    const existingUser = await this.prisma.user.findFirst({
      where: { OR: [{ clerkId: clerkId }, { email: email }] },
    });

    if (existingUser) {
      await this.prisma.user.update({
        where: { id: existingUser.id },
        data: { clerkId, email, name, avatarUrl: image },
      });
    } else {
      await this.prisma.user.create({
        data: {
          clerkId,
          email,
          name,
          avatarUrl: image,
          password: '',
          // 🔥 CORREÇÃO: Todo novo cadastro direto nasce como dono de uma futura empresa
          role: 'OWNER',
        },
      });
      this.logger.log(`✅ Usuário Base criado como OWNER: ${email}`);
    }
  }

  private async deleteUser(clerkId: string) {
    this.logger.warn(`🗑️ Soft delete para user Clerk ${clerkId}`);
    // Opcional: Desativar o usuário no seu banco
    // await this.prisma.user.updateMany({ where: { clerkId }, data: { isActive: false } });
  }

  private async syncTenant(data: any) {
    const defaultPlan = await this.prisma.plan.findFirst();
    if (!defaultPlan) {
      throw new Error(
        'Tentativa de criar Tenant sem Planos cadastrados no banco.',
      );
    }

    // O upsert é seguro contra duplo-disparo do mesmo ID de organização
    await this.prisma.tenant.upsert({
      where: { clerkId: data.id },
      update: { name: data.name, slug: data.slug },
      create: {
        clerkId: data.id,
        name: data.name,
        trialEndsAt: addDays(new Date(), 7),
        slug: data.slug || `org-${data.id}`,
        isActive: true,
        planId: defaultPlan.id,
      },
    });
  }

  private async linkUserToTenant(data: any) {
    const clerkUserId = data.public_user_data.user_id;
    const clerkOrgId = data.organization.id;
    const clerkRole = data.role; // 'org:owner', 'org:admin', 'org:seller'

    const tenant = await this.prisma.tenant.findUnique({
      where: { clerkId: clerkOrgId },
    });

    if (!tenant) {
      throw new Error(
        `[RETRY] Tenant ${clerkOrgId} não existe ainda. Aguardando syncTenant.`,
      );
    }

    const user = await this.prisma.user.findUnique({
      where: { clerkId: clerkUserId },
    });

    if (!user) {
      throw new Error(
        `[RETRY] User ${clerkUserId} não existe ainda. Aguardando syncUser.`,
      );
    }

    // Trava contra sequestro de Tenant
    if (user.tenantId && user.tenantId !== tenant.id) {
      this.logger.warn(
        `🛡️ BLOQUEADO: Usuário ${user.email} já pertence à org ID [${user.tenantId}]. Ignorando evento.`,
      );
      return;
    }

    // ✅ Mapeamento direto e explícito — sem ambiguidade
    const roleMap: Record<string, string> = {
      'org:owner': 'OWNER',
      'org:admin': 'ADMIN',
      'org:seller': 'SELLER',
    };

    const appRole = roleMap[clerkRole];

    if (!appRole) {
      this.logger.warn(
        `⚠️ Role desconhecido recebido do Clerk: "${clerkRole}". Usuário ${user.email} não foi vinculado.`,
      );
      return;
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        tenantId: tenant.id,
        role: appRole as any,
        isActive: true,
      },
    });

    this.logger.log(
      `✅ Vínculo realizado: User ${user.email} -> Org ${tenant.name} com cargo final: ${appRole}`,
    );
  }

  private async unlinkUserFromTenant(data: any) {
    const clerkUserId = data.public_user_data.user_id;
    const clerkOrgId = data.organization.id;

    const user = await this.prisma.user.findUnique({
      where: { clerkId: clerkUserId },
    });

    const tenant = await this.prisma.tenant.findUnique({
      where: { clerkId: clerkOrgId },
    });

    if (!user || !tenant) return;

    if (user.tenantId === tenant.id) {
      await this.prisma.user.update({
        where: { id: user.id },
        data: { tenantId: null, role: 'SELLER' },
      });
      this.logger.log(
        `✅ Desvínculo realizado: Usuário ${user.email} removido da Org ${tenant.name}`,
      );
    } else {
      this.logger.warn(
        `🛡️ IGNORADO: O usuário ${user.email} não pertence à Org ${tenant.name}, portanto o unlink foi ignorado.`,
      );
    }
  }
}
