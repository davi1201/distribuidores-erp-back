import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { Role, User } from '@prisma/client';
import { v4 as uuidv4 } from 'uuid';
import { addDays } from 'date-fns';
import * as bcrypt from 'bcrypt';
import { AcceptInviteDto } from './dto/accept-invite.dto';

@Injectable()
export class TeamService {
  constructor(private readonly prisma: PrismaService) {}

  // --- LISTAR MEMBROS ---
  async getMembers(tenantId: string) {
    return this.prisma.user.findMany({
      where: { tenantId },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        isActive: true,
        permissions: true,
      },
    });
  }

  // --- CONVIDAR MEMBRO ---
  async inviteMember(tenantId: string, email: string, role: Role) {
    // 1. Verifica Limites do Plano
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      include: {
        plan: true,
        _count: { select: { users: true } },
      },
    });

    if (!tenant) {
      throw new NotFoundException('Tenant não encontrado.');
    }

    const currentUsers = tenant._count.users;
    const maxUsers = tenant.plan.maxUsers;

    // Se maxUsers for -1 ou 0, consideramos ilimitado (lógica opcional)
    if (maxUsers > 0 && currentUsers >= maxUsers) {
      throw new ForbiddenException(
        `Seu plano atual permite apenas ${maxUsers} usuários. Faça um upgrade para adicionar mais.`,
      );
    }

    // 2. Verifica se já é membro
    const userExists = await this.prisma.user.findFirst({
      where: { email },
    });

    if (userExists) {
      throw new BadRequestException(
        'Este usuário já possui uma conta no sistema.',
      );
    }

    // 3. Cria o Convite
    const token = uuidv4();
    const invite = await this.prisma.invite.create({
      data: {
        tenantId,
        email,
        role,
        token,
        expiresAt: addDays(new Date(), 3), // Expira em 3 dias
      },
    });

    // 4. Disparar E-mail (Simulação)
    console.log(`
      📧 EMAIL ENVIADO PARA: ${email}
      🔗 Link: http://localhost:3000/register/invite?token=${token}
    `);

    return invite;
  }

  // --- VALIDAR TOKEN (GET) ---
  // Usado pelo frontend para checar se o link ainda é válido
  async validateInviteToken(token: string) {
    const invite = await this.prisma.invite.findUnique({
      where: { token },
      include: { tenant: { select: { name: true } } },
    });

    if (!invite) {
      throw new NotFoundException('Convite não encontrado.');
    }

    if (invite.expiresAt < new Date()) {
      throw new BadRequestException(
        'Este convite expirou. Peça um novo ao administrador.',
      );
    }

    return {
      valid: true,
      email: invite.email,
      companyName: invite.tenant.name,
      role: invite.role,
    };
  }

  // --- ACEITAR CONVITE (POST) ---
  async acceptInvite(dto: AcceptInviteDto) {
    const invite = await this.prisma.invite.findUnique({
      where: { token: dto.token },
    });

    if (!invite || invite.expiresAt < new Date()) {
      throw new BadRequestException('Convite inválido ou expirado.');
    }

    // B. Verifica se o email já não foi cadastrado nesse meio tempo
    const userExists = await this.prisma.user.findUnique({
      where: { email: invite.email },
    });

    if (userExists) {
      await this.prisma.invite.delete({ where: { id: invite.id } });
      throw new BadRequestException(
        'Este e-mail já possui uma conta cadastrada.',
      );
    }

    // C. Cria o Usuário
    const hashedPassword = await this.hashPassword(dto.password);

    const newUser = await this.prisma.user.create({
      data: {
        name: dto.name,
        email: invite.email, // O email vem do convite (segurança)
        password: hashedPassword,
        role: invite.role, // O cargo vem do convite
        tenantId: invite.tenantId, // A empresa vem do convite
        isActive: true,
      },
    });

    await this.prisma.warehouse.create({
      data: {
        name: `Depósito ${dto.name}`,
        tenantId: invite.tenantId,
        responsibleUserId: newUser.id,
        isDefault: false,
      },
    });

    // D. "Queima" o convite (Deleta)
    await this.prisma.invite.delete({ where: { id: invite.id } });

    return {
      message: 'Conta criada com sucesso!',
      userId: newUser.id,
      email: newUser.email,
    };
  }

  async updateMemberRole(
    tenantId: string,
    memberId: string,
    newRole: Role,
    currentUser: User, // Precisamos saber quem está tentando alterar
  ) {
    // 1. Busca o membro alvo
    const member = await this.prisma.user.findUnique({
      where: { id: memberId },
    });

    if (!member) {
      throw new NotFoundException('Membro não encontrado.');
    }

    // 2. Segurança: Garante que é do mesmo time
    if (member.tenantId !== tenantId) {
      throw new ForbiddenException(
        'Acesso negado: Usuário de outra organização.',
      );
    }

    // 3. Regra: Ninguém altera o papel do Dono (Owner)
    if (member.role === Role.OWNER) {
      throw new ForbiddenException(
        'Não é possível alterar o papel do Dono da empresa.',
      );
    }

    // 4. Regra: Apenas o Dono pode transferir a propriedade (criar outro Owner)
    // Se um Admin tentar virar Owner ou promover alguém a Owner, barra.
    if (newRole === Role.OWNER && currentUser.role !== Role.OWNER) {
      throw new ForbiddenException(
        'Apenas o Dono atual pode transferir a propriedade.',
      );
    }

    // 5. Regra: Prevenir auto-rebaixamento acidental de Admin (opcional, mas boa prática)
    // if (member.id === currentUser.id && newRole !== Role.ADMIN) ...

    return this.prisma.user.update({
      where: { id: memberId },
      data: { role: newRole },
      select: { id: true, name: true, role: true },
    });
  }

  // --- REMOVER MEMBRO ---
  async removeMember(
    tenantId: string,
    userIdToRemove: string,
    currentUser: User,
  ) {
    // Regra: Não pode se remover
    if (userIdToRemove === currentUser.id) {
      throw new BadRequestException('Você não pode remover a si mesmo.');
    }

    const userToRemove = await this.prisma.user.findUnique({
      where: { id: userIdToRemove },
    });

    if (!userToRemove || userToRemove.tenantId !== tenantId) {
      throw new NotFoundException('Usuário não encontrado.');
    }

    // Regra: Só OWNER pode remover (ou SUPER_ADMIN)
    if (currentUser.role !== 'OWNER' && currentUser.role !== 'SUPER_ADMIN') {
      throw new ForbiddenException('Sem permissão.');
    }

    return this.prisma.user.delete({
      where: { id: userIdToRemove },
    });
  }

  private async hashPassword(pass: string) {
    return bcrypt.hash(pass, 10);
  }
}
