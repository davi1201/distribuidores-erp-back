import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Role, User } from '@prisma/client';
import { clerkClient } from '@clerk/clerk-sdk-node';
import { InviteMemberDto } from './dto/invite-member.dto';

@Injectable()
export class TeamService {
  private readonly logger = new Logger(TeamService.name);

  constructor(private readonly prisma: PrismaService) {}

  async getMembers(tenantId: string) {
    return this.prisma.user.findMany({
      where: { tenantId },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        isActive: true,
        clerkId: true,
        createdAt: true,
        SellerProfile: {
          select: {
            whatsapp: true,
            commissionRate: true,
            maxDiscount: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  // --- 1. ADMIN CADASTRA MEMBRO ---
  async inviteMember(
    tenantId: string,
    inviterUserId: string,
    dto: InviteMemberDto,
  ) {
    const { email, name } = dto;
    // REGRA DE NEGÓCIO: Todo convidado entra inicialmente como SELLER
    const initialRole = Role.SELLER;
    const clerkRole = 'org:seller';

    // A. Valida Limites do Plano e Busca Tenant
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      include: {
        plan: true,
        _count: { select: { users: true } },
      },
    });

    if (!tenant) throw new NotFoundException('Tenant não encontrado.');

    if (!tenant.clerkId) {
      throw new BadRequestException(
        'Este tenant não possui uma organização vinculada no Clerk.',
      );
    }
    const clerkOrgId = tenant.clerkId;

    if (tenant._count.users >= tenant.plan.maxUsers) {
      throw new ForbiddenException(
        `Limite de usuários atingido (${tenant._count.users}/${tenant.plan.maxUsers}). Faça upgrade do plano.`,
      );
    }

    // B. Verifica duplicidade local
    const userExists = await this.prisma.user.findFirst({ where: { email } });
    if (userExists) {
      throw new BadRequestException(
        'Este e-mail já está vinculado a uma conta no sistema.',
      );
    }

    try {
      // D. Cria o Convite no Clerk com a role 'org:seller'
      const invitation =
        await clerkClient.organizations.createOrganizationInvitation({
          organizationId: clerkOrgId,
          emailAddress: email,
          role: clerkRole, // Sempre org:seller
          inviterUserId: inviterUserId,
        });

      // E. Cria o Usuário no Banco LOCAL (Transação)
      const newUser = await this.prisma.$transaction(async (tx) => {
        // 1. Cria Usuário como SELLER
        const createdUser = await tx.user.create({
          data: {
            name: name,
            email: email,
            role: initialRole, // Sempre SELLER
            tenantId: tenantId,
            clerkId: `invitation_${invitation.id}`,
            isActive: false,
          },
        });

        // 2. Cria Depósito Pessoal
        await tx.warehouse.create({
          data: {
            name: `Depósito ${name}`,
            tenantId: tenantId,
            responsibleUserId: createdUser.id,
            isDefault: false,
          },
        });

        // 3. Cria SellerProfile (Sempre, pois é seller)
        await tx.sellerProfile.create({
          data: {
            userId: createdUser.id,
            whatsapp: dto.whatsapp,
            commissionRate: dto.commissionRate || 0,
            maxDiscount: dto.maxDiscount || 0,
          },
        });

        return createdUser;
      });

      this.logger.log(
        `✅ Convite Clerk (org:seller) enviado e Usuário criado: ${email}`,
      );
      return newUser;
    } catch (error: any) {
      this.logger.error('Erro ao convidar membro:', error);

      if (error.errors && error.errors[0]?.code === 'resource_conflict') {
        throw new BadRequestException(
          'Este usuário já foi convidado ou faz parte da organização.',
        );
      }

      // Log detalhado para debug de roles
      if (error.errors && error.errors[0]?.code === 'resource_not_found') {
        this.logger.error(
          `Role não encontrada no Clerk. Verifique se 'org:seller' existe nas configurações da Organização.`,
        );
      }

      throw new BadRequestException(
        'Erro ao processar convite no provedor de identidade.',
      );
    }
  }

  // --- 2. ATUALIZAR FUNÇÃO ---
  async updateMemberRole(
    tenantId: string,
    userId: string,
    newRole: Role,
    actingUser: User,
  ) {
    const targetUser = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!targetUser || targetUser.tenantId !== tenantId) {
      throw new NotFoundException('Usuário não encontrado.');
    }

    if (targetUser.id === actingUser.id) {
      throw new ForbiddenException('Você não pode alterar seu próprio papel.');
    }

    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
    });
    if (!tenant || !tenant.clerkId) {
      throw new BadRequestException(
        'Organização Clerk não vinculada ao Tenant.',
      );
    }
    const clerkOrgId = tenant.clerkId;

    // Mapeamento correto das roles customizadas
    const clerkRole = newRole === Role.ADMIN ? 'org:admin' : 'org:seller';

    try {
      const response =
        await clerkClient.organizations.getOrganizationMembershipList({
          organizationId: clerkOrgId,
        });

      const memberships = response.data;
      const member = memberships.find(
        (m) => m.publicUserData?.userId === targetUser.clerkId,
      );

      if (member && member.publicUserData) {
        await clerkClient.organizations.updateOrganizationMembership({
          organizationId: member.organization.id,
          userId: member.publicUserData.userId,
          role: clerkRole,
        });
      } else {
        this.logger.warn(
          `Usuário ${userId} não encontrado no Clerk. Atualizando apenas DB local.`,
        );
      }

      return this.prisma.user.update({
        where: { id: userId },
        data: { role: newRole },
      });
    } catch (error) {
      this.logger.error(error);
      throw new BadRequestException('Erro ao atualizar permissão no Clerk.');
    }
  }

  // --- 3. REMOVER MEMBRO ---
  async removeMember(tenantId: string, userId: string, actingUser: User) {
    const targetUser = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!targetUser || targetUser.tenantId !== tenantId) {
      throw new NotFoundException('Usuário não encontrado.');
    }

    if (targetUser.id === actingUser.id) {
      throw new ForbiddenException('Você não pode remover sua própria conta.');
    }

    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
    });
    if (!tenant || !tenant.clerkId) {
      throw new BadRequestException(
        'Organização Clerk não vinculada ao Tenant.',
      );
    }
    const clerkOrgId = tenant.clerkId;

    try {
      if (targetUser.clerkId && targetUser.clerkId.startsWith('invitation_')) {
        const inviteId = targetUser.clerkId.replace('invitation_', '');
        try {
          await clerkClient.organizations.revokeOrganizationInvitation({
            organizationId: clerkOrgId,
            invitationId: inviteId,
            requestingUserId: actingUser.clerkId!,
          });
        } catch (e) {
          this.logger.warn('Convite Clerk já inexistente ou erro ao revogar.');
        }
      } else if (targetUser.clerkId) {
        try {
          await clerkClient.organizations.deleteOrganizationMembership({
            organizationId: clerkOrgId,
            userId: targetUser.clerkId,
          });
        } catch (e) {
          this.logger.warn('Membro Clerk já inexistente ou erro ao remover.');
        }
      }

      return this.prisma.user.delete({ where: { id: userId } });
    } catch (error) {
      this.logger.error(error);
      throw new BadRequestException('Erro ao remover usuário.');
    }
  }
}
