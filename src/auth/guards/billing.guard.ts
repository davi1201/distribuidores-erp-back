import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class BillingGuard implements CanActivate {
  private readonly logger = new Logger(BillingGuard.name);

  constructor(
    private prisma: PrismaService,
    private reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const user = request.user;

    // 1. Pular verificação (Decorators ou Super Admin)
    const skipBilling = this.reflector.get<boolean>(
      'skipBilling',
      context.getHandler(),
    );
    if (skipBilling) return true;

    if (!user || user.role === 'SUPER_ADMIN') return true;
    if (!user.tenantId) return false;

    // 2. Busca Tenant e a Assinatura (Sincronizada via Webhook)
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: user.tenantId },
      include: {
        subscriptions: {
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });

    if (!tenant) return false;

    const now = new Date();
    const latestSub = tenant.subscriptions[0];

    // --- CHECK 1: TRIAL DO SISTEMA (Interno) ---
    // Se você deu 7 dias de graça via banco de dados (sem pedir cartão no Stripe ainda)
    if (tenant.isActive && tenant.trialEndsAt && tenant.trialEndsAt > now) {
      return true;
    }

    // --- CHECK 2: ASSINATURA STRIPE ---
    if (latestSub) {
      // Mapeamento dos Status do Stripe (Geralmente salvamos em UPPERCASE no banco)
      const status = latestSub.status.toUpperCase(); // active -> ACTIVE

      // A. Status que LIBERAM acesso total
      // ACTIVE: Pagamento em dia (mesmo que tenha cancelado para o fim do mês)
      // TRIALING: Período de teste do Stripe
      if (['ACTIVE', 'TRIALING'].includes(status)) {
        return true;
      }

      // B. Status de Atraso (Grace Period)
      // PAST_DUE: O Stripe está tentando cobrar o cartão novamente.
      // Permitimos acesso, mas o front deve mostrar um banner "Atualize seu pagamento"
      if (status === 'PAST_DUE') {
        // Opcional: Você pode limitar o tempo de past_due se quiser ser rígido
        return true;
      }

      // C. Status Cancelado, mas com tempo sobrando
      // No Stripe, se status virou 'CANCELED', geralmente acabou mesmo.
      // Mas por segurança, checamos a data.
      if (status === 'CANCELED' && latestSub.currentPeriodEnd > now) {
        return true;
      }
    }

    // --- BLOQUEIO ---

    // Permite GET (Read-only) se desejar
    if (request.method === 'GET') {
      // return true; // Descomente se quiser permitir leitura
    }

    throw new ForbiddenException({
      message: 'Sua assinatura expirou ou o pagamento falhou.',
      code: 'BILLING_REQUIRED',
      details: {
        stripeStatus: latestSub?.status || 'none',
      },
      action: 'REDIRECT_TO_BILLING',
    });
  }
}
