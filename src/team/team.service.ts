import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Role, User } from '@prisma/client';
import { v4 as uuidv4 } from 'uuid';
import { addDays } from 'date-fns';
import * as bcrypt from 'bcrypt';
import { AcceptInviteDto } from './dto/accept-invite.dto';
import { InviteMemberDto } from './dto/invite-member.dto';

@Injectable()
export class TeamService {
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
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  // --- 1. ADMIN PREENCHE TUDO E ENVIA ---
  async inviteMember(tenantId: string, dto: InviteMemberDto) {
    const { email, role, name } = dto;

    // A. Valida Limites do Plano
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      include: {
        plan: true,
        _count: { select: { users: true } },
      },
    });

    if (!tenant) throw new NotFoundException('Tenant não encontrado.');

    // (Lógica de limite de usuários aqui...)

    // B. Verifica se usuário já existe
    const userExists = await this.prisma.user.findFirst({ where: { email } });
    if (userExists) {
      throw new BadRequestException('Este e-mail já possui uma conta.');
    }

    // C. Prepara o Metadata se for Vendedor
    let metadata:
      | { whatsapp?: string; commissionRate: number; maxDiscount: number }
      | undefined = undefined;
    if (role === Role.SELLER) {
      metadata = {
        whatsapp: dto.whatsapp,
        commissionRate: dto.commissionRate || 0,
        maxDiscount: dto.maxDiscount || 0,
      };
    }

    // D. Cria o Convite "Gordo" (Com nome e configs)
    const token = uuidv4();
    const invite = await this.prisma.invite.create({
      data: {
        tenantId,
        email,
        name, // Salvamos o nome fornecido pelo Admin
        role,
        token,
        metadata: metadata || undefined,
        expiresAt: addDays(new Date(), 3),
      },
    });

    // E. Envia Email
    // No email, você pode dizer: "Olá [Nome], sua conta de Vendedor foi pré-criada..."
    console.log(`📧 Convite enviado para ${name} <${email}>`);

    return invite;
  }

  // --- 2. USUÁRIO VALIDA TOKEN (Frontend checa dados) ---
  async validateInviteToken(token: string) {
    const invite = await this.prisma.invite.findUnique({
      where: { token },
      include: { tenant: { select: { name: true } } },
    });

    if (!invite || invite.expiresAt < new Date()) {
      throw new BadRequestException('Convite inválido ou expirado.');
    }

    return {
      valid: true,
      email: invite.email,
      name: invite.name, // Retornamos o nome para mostrar na tela: "Olá, João!"
      companyName: invite.tenant.name,
      role: invite.role,
    };
  }

  // --- 3. USUÁRIO ACEITA E CRIA SENHA ---
  async acceptInvite(dto: AcceptInviteDto) {
    const invite = await this.prisma.invite.findUnique({
      where: { token: dto.token },
    });

    if (!invite || invite.expiresAt < new Date()) {
      throw new BadRequestException('Convite inválido ou expirado.');
    }

    // Verifica duplicação de novo (safety check)
    const userExists = await this.prisma.user.findUnique({
      where: { email: invite.email },
    });

    if (userExists) {
      await this.prisma.invite.delete({ where: { id: invite.id } });
      throw new BadRequestException('Usuário já cadastrado.');
    }

    const hashedPassword = await this.hashPassword(dto.password);

    // Transação para criar tudo com os dados do INVITE
    const result = await this.prisma.$transaction(async (tx) => {
      // A. Cria Usuário (Usando o NOME e EMAIL do Invite)
      const newUser = await tx.user.create({
        data: {
          name: invite.name, // O Admin definiu, o user herda
          email: invite.email,
          password: hashedPassword, // O User definiu agora
          role: invite.role,
          tenantId: invite.tenantId,
          isActive: true,
        },
      });

      // B. Cria Depósito Pessoal
      await tx.warehouse.create({
        data: {
          name: `Depósito ${invite.name}`,
          tenantId: invite.tenantId,
          responsibleUserId: newUser.id,
          isDefault: false,
        },
      });

      // C. Se for Seller, aplica as configs salvas no Metadata
      if (invite.role === Role.SELLER && invite.metadata) {
        const meta = invite.metadata as any;

        await tx.sellerProfile.create({
          data: {
            userId: newUser.id,
            whatsapp: meta.whatsapp,
            commissionRate: meta.commissionRate,
            maxDiscount: meta.maxDiscount,
          },
        });
      }

      // D. Limpa o convite
      await tx.invite.delete({ where: { id: invite.id } });

      return newUser;
    });

    return {
      message: 'Conta ativada com sucesso!',
      userId: result.id,
    };
  }

  async updateMemberRole(
    tenantId: string,
    userId: string,
    newRole: Role,
    actingUser: User,
  ) {
    // A. Verifica se o usuário a ser alterado pertence ao tenant
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || user.tenantId !== tenantId) {
      throw new NotFoundException('Usuário não encontrado.');
    }

    // B. Impede que um usuário altere seu próprio papel
    if (user.id === actingUser.id) {
      throw new ForbiddenException('Você não pode alterar seu próprio papel.');
    }

    // C. Atualiza o papel
    return this.prisma.user.update({
      where: { id: userId },
      data: { role: newRole },
    });
  }

  async removeMember(tenantId: string, userId: string, actingUser: User) {
    // A. Verifica se o usuário a ser removido pertence ao tenant
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || user.tenantId !== tenantId) {
      throw new NotFoundException('Usuário não encontrado.');
    }

    // B. Impede que um usuário remova a si mesmo
    if (user.id === actingUser.id) {
      throw new ForbiddenException('Você não pode remover sua própria conta.');
    }

    // C. Remove o usuário
    return this.prisma.user.delete({ where: { id: userId } });
  }

  private async hashPassword(pass: string) {
    return bcrypt.hash(pass, 10);
  }
}
