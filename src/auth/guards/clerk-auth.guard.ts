import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
  ForbiddenException,
} from '@nestjs/common';
import { createLogger } from '../../core/logging';
import { clerkClient } from '@clerk/clerk-sdk-node';
import { PrismaService } from '../../prisma/prisma.service';
import { addDays } from 'date-fns';

@Injectable()
export class ClerkAuthGuard implements CanActivate {
  private readonly logger = createLogger(ClerkAuthGuard.name);

  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const token = request.headers.authorization?.split(' ')[1];

    if (!token) throw new UnauthorizedException('Token não fornecido');

    try {
      // 1. Validação do Token no Clerk (Autenticidade)
      const decodedSession = await clerkClient.verifyToken(token);
      const clerkUserId = decodedSession.sub;

      // 2. Busca o usuário no banco local
      let user = await this.prisma.user.findUnique({
        where: { clerkId: clerkUserId },
        include: { tenant: true },
      });

      // 3. Auto-provisioning: se o user não existe localmente,
      //    busca dados no Clerk e cria User + Tenant + Warehouse.
      if (!user) {
        this.logger.warn(
          `Guard: Usuário ${clerkUserId} autenticado no Clerk mas não encontrado no banco. Iniciando auto-provisioning...`,
        );

        user = await this.autoProvisionUser(clerkUserId);

        if (!user) {
          this.logger.error(
            `Guard: Falha no auto-provisioning do usuário ${clerkUserId}.`,
          );
          throw new UnauthorizedException(
            'Não foi possível configurar sua conta. Tente novamente.',
          );
        }
      }

      if (!user.tenantId) {
        this.logger.warn(
          `Guard: Usuário ${user.email} (id=${user.id}, clerkId=${clerkUserId}) existe mas NÃO possui tenantId. Possível falha no provisionamento do Tenant.`,
        );
      }

      // 4. Injeção de Contexto
      request.user = {
        userId: user.id,
        clerkId: user.clerkId,
        email: user.email,
        role: user.role,
        tenantId: user.tenantId,
        permissions: (user as any).permissions,
        name: user.name,
      };

      return true;
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }

      this.logger.error('❌ ERRO NO AUTH GUARD:', error);
      throw new UnauthorizedException({
        message: 'Sessão inválida ou expirada',
        details: error.message,
      });
    }
  }

  /**
   * Busca dados do usuário no Clerk e cria User + Tenant + Warehouse
   * numa única transação. Fallback quando o webhook não chegou a tempo.
   */
  private async autoProvisionUser(clerkUserId: string) {
    try {
      // Busca dados completos do user no Clerk
      const clerkUser = await clerkClient.users.getUser(clerkUserId);
      const email = clerkUser.emailAddresses[0]?.emailAddress;
      const name =
        `${clerkUser.firstName || ''} ${clerkUser.lastName || ''}`.trim() ||
        'Novo Usuário';
      const image = clerkUser.imageUrl;

      if (!email) {
        this.logger.error(
          `Guard: Usuário Clerk ${clerkUserId} não possui email. Impossível provisionar.`,
        );
        return null;
      }

      this.logger.log(
        `Guard: Auto-provisionando ${email} (clerkId=${clerkUserId})...`,
      );

      // Verifica se já existe por email (possível duplicata)
      const existingByEmail = await this.prisma.user.findUnique({
        where: { email },
        include: { tenant: true },
      });

      if (existingByEmail) {
        // Vincula o clerkId ao user existente
        this.logger.log(
          `Guard: User ${email} já existe (id=${existingByEmail.id}). Vinculando clerkId...`,
        );
        return this.prisma.user.update({
          where: { id: existingByEmail.id },
          data: { clerkId: clerkUserId, avatarUrl: image },
          include: { tenant: true },
        });
      }

      // Cria tudo numa transação
      const defaultPlan = await this.prisma.plan.findFirst();
      if (!defaultPlan) {
        this.logger.error(
          'Guard: Nenhum plano cadastrado no banco. Impossível provisionar.',
        );
        return null;
      }

      const firstName = name.split(' ')[0];
      const tempSlug = `tenant-${Date.now()}`;

      const newUser = await this.prisma.$transaction(async (tx) => {
        const tenant = await tx.tenant.create({
          data: {
            name: `Empresa de ${firstName}`,
            slug: tempSlug,
            isActive: true,
            trialEndsAt: addDays(new Date(), 7),
            planId: defaultPlan.id,
          },
        });

        const createdUser = await tx.user.create({
          data: {
            clerkId: clerkUserId,
            email,
            name,
            avatarUrl: image,
            password: '',
            role: 'OWNER',
            tenantId: tenant.id,
          },
          include: { tenant: true },
        });

        await tx.warehouse.create({
          data: {
            name: 'Depósito Principal',
            tenantId: tenant.id,
            responsibleUserId: createdUser.id,
            isDefault: true,
          },
        });

        this.logger.log(
          `Guard: ✅ Auto-provisioning completo: user=${createdUser.id} email=${email} tenant=${tenant.id} (${tenant.name})`,
        );

        return createdUser;
      });

      return newUser;
    } catch (error) {
      this.logger.error(
        `Guard: Erro no auto-provisioning do usuário ${clerkUserId}: ${error.message}`,
        error.stack,
      );
      return null;
    }
  }
}
