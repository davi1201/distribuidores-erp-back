import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
  UnauthorizedException,
  ForbiddenException,
} from '@nestjs/common';
import { clerkClient } from '@clerk/clerk-sdk-node';
import { PrismaService } from 'src/prisma/prisma.service';

@Injectable()
export class ClerkAuthGuard implements CanActivate {
  private readonly logger = new Logger(ClerkAuthGuard.name);

  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const token = request.headers.authorization?.split(' ')[1];

    if (!token) throw new UnauthorizedException('Token não fornecido');

    try {
      // 1. Validação do Token no Clerk (Autenticidade)
      const decodedSession = await clerkClient.verifyToken(token);
      const clerkUserId = decodedSession.sub;

      // 2. Validação de Existência no Banco Local (Autorização)
      // Buscamos apenas para ler. Não criamos nada aqui.
      const user = await this.prisma.user.findUnique({
        where: { clerkId: clerkUserId },
        include: { tenant: true },
      });

      // 3. Regra de Bloqueio (Sync Lag)
      // Se o token é válido, mas o usuário não está no banco, significa
      // que o Webhook ainda não chegou ou falhou.
      // O Guard DEVE bloquear para evitar inconsistência.
      if (!user) {
        this.logger.warn(
          `Guard: Usuário ${clerkUserId} autenticado no Clerk mas não encontrado no banco. Aguardando Webhook.`,
        );
        throw new UnauthorizedException(
          'Sua conta está sendo sincronizada. Tente novamente em alguns segundos.',
        );
      }

      // 4. Injeção de Contexto
      // O usuário existe, então injetamos no request para os Controllers usarem.
      request.user = {
        userId: user.id,
        clerkId: user.clerkId,
        email: user.email,
        role: user.role,
        tenantId: user.tenantId, // Pode ser null se ele ainda não tiver empresa
        permissions: (user as any).permissions,
        name: user.name,
      };

      return true;
    } catch (error) {
      // Diferencia erro de "não encontrado" de erros de token inválido
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
}
