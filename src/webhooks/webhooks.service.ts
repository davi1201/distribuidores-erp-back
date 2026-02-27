import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { addDays } from 'date-fns';

@Injectable()
export class WebhooksService {
  private readonly logger = new Logger(WebhooksService.name);

  constructor(private readonly prisma: PrismaService) {}

  async processClerkEvent(eventType: string, data: any) {
    this.logger.log(`📥 Processando evento Clerk: ${eventType}`);

    // NOTA: Não usamos try/catch global aqui!
    // Se ocorrer um erro (ex: usuário não encontrado), queremos que a exceção suba
    // para o Controller retornar 500, forçando o Clerk a fazer o RETRY automático.

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
      case 'organizationMembership.updated': // Importante caso mude o cargo no painel do Clerk
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
          role: 'SELLER', // 💡 PADRÃO SEGURO: Nasce como seller. Será atualizado no membership.
        },
      });
    }
  }

  private async deleteUser(clerkId: string) {
    this.logger.warn(`🗑️ Soft delete para user Clerk ${clerkId}`);
    // await this.prisma.user.update({ where: { clerkId }, data: { isActive: false } });
  }

  private async syncTenant(data: any) {
    const defaultPlan = await this.prisma.plan.findFirst();
    if (!defaultPlan) {
      throw new Error(
        'Tentativa de criar Tenant sem Planos cadastrados no banco.',
      );
    }

    const tenant = await this.prisma.tenant.upsert({
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

    // 💡 OTIMIZAÇÃO: Não precisamos vincular o usuário aqui.
    // O evento 'organizationMembership.created' do criador vai chegar logo em seguida e fará isso perfeitamente.
  }

  private async linkUserToTenant(data: any) {
    const clerkUserId = data.public_user_data.user_id;
    const clerkOrgId = data.organization.id;
    const clerkRole = data.role; // Padrão do Clerk: 'org:admin' ou 'org:member'

    // 💡 REGRA DE NEGÓCIO CLARA
    const appRole = clerkRole === 'org:admin' ? 'OWNER' : 'SELLER';

    const tenant = await this.prisma.tenant.findUnique({
      where: { clerkId: clerkOrgId },
    });

    // 💡 SEGREDO DO RETRY: Se não achar, estoure um erro!
    // O Clerk vai receber o erro e tentar mandar esse webhook de novo em 5 minutos.
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

    // Aplica o papel (OWNER ou SELLER) e o vínculo na mesma operação
    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        tenantId: tenant.id,
        role: appRole as any,
        isActive: true,
      },
    });

    this.logger.log(
      `✅ Vínculo realizado: User ${user.email} -> Org ${tenant.name} como ${appRole}`,
    );
  }

  private async unlinkUserFromTenant(data: any) {
    const clerkUserId = data.public_user_data.user_id;

    const user = await this.prisma.user.findUnique({
      where: { clerkId: clerkUserId },
    });
    if (!user) return; // Se o usuário não existe, não há o que desvincular

    await this.prisma.user.update({
      where: { id: user.id },
      data: { tenantId: null, role: 'SELLER' }, // Tira da org e rebaixa permissões por segurança
    });
  }
}
