import { Injectable } from '@nestjs/common';
import { createLogger } from '../core/logging';
import { PrismaService } from '../prisma/prisma.service';
import { addDays } from 'date-fns';

// Core imports
import { ERROR_MESSAGES, ENTITY_NAMES } from '../core/constants';

@Injectable()
export class WebhooksService {
  private readonly logger = createLogger(WebhooksService.name);

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
      where: { OR: [{ clerkId }, { email }] },
    });

    if (existingUser) {
      await this.prisma.user.update({
        where: { id: existingUser.id },
        data: {
          clerkId,
          email,
          name,
          avatarUrl: image,
          // 🔥 NUNCA sobrescreve role aqui — o linkUserToTenant é o responsável
        },
      });
    } else {
      await this.prisma.user.create({
        data: {
          clerkId,
          email,
          name,
          avatarUrl: image,
          password: '',
          role: 'SELLER', // Nasce neutro — o membership vai definir a role correta
        },
      });
      this.logger.log(
        `✅ Usuário criado (role pendente de membership): ${email}`,
      );
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
    const clerkUserId =
      data.public_user_data?.user_id || data.public_user_data?.id;
    const clerkOrgId = data.organization?.id;
    const clerkRole = data.role; // 'org:owner', 'org:admin', 'org:seller'

    if (!clerkUserId || !clerkOrgId) {
      this.logger.warn(
        `⚠️ Dados inválidos no evento de membership. Ignorando.`,
      );
      return;
    }

    const tenant = await this.prisma.tenant.findUnique({
      where: { clerkId: clerkOrgId },
    });
    if (!tenant) throw new Error(ERROR_MESSAGES.NOT_FOUND(ENTITY_NAMES.TENANT)); // Clerk vai retentar

    const user = await this.prisma.user.findUnique({
      where: { clerkId: clerkUserId },
    });
    if (!user) throw new Error(ERROR_MESSAGES.NOT_FOUND(ENTITY_NAMES.USER)); // Clerk vai retentar

    // Trava contra sequestro de Tenant
    if (user.tenantId && user.tenantId !== tenant.id) {
      this.logger.warn(
        `🛡️ BLOQUEADO: Usuário ${user.email} já pertence à org [${user.tenantId}].`,
      );
      return;
    }

    // 🔥 FONTE DA VERDADE: sempre o Clerk decide a role
    const roleMap: Record<string, string> = {
      'org:owner': 'OWNER',
      'org:admin': 'ADMIN',
      'org:seller': 'SELLER',
    };

    const appRole = roleMap[clerkRole] ?? 'SELLER';

    // 🛡️ Proteção extra: OWNER nunca pode ser rebaixado por um evento posterior
    const finalRole =
      user.tenantId === tenant.id &&
      user.role === 'OWNER' &&
      appRole !== 'OWNER'
        ? 'OWNER'
        : appRole;

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        tenantId: tenant.id,
        role: finalRole as any,
        isActive: true,
      },
    });

    this.logger.log(
      `✅ ${user.email} → ${tenant.name} | Clerk: ${clerkRole} → App: ${finalRole}`,
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
