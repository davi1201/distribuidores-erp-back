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

    // 1. Skip / Super Admin
    const skipBilling = this.reflector.get<boolean>(
      'skipBilling',
      context.getHandler(),
    );
    if (skipBilling || !user || user.role === 'SUPER_ADMIN') return true;
    if (!user.tenantId) return false;

    // 2. Busca tenant
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
    const isTrialActive =
      tenant.isActive && !!tenant.trialEndsAt && tenant.trialEndsAt > now;
    const isActivateRoute = request.url === '/api/v1/asaas/onboarding/activate';
    const hasActivePlan =
      !!latestSub &&
      ['ACTIVE', 'TRIALING', 'PAST_DUE'].includes(
        latestSub.status.toUpperCase(),
      );

    // 3. Rota de ativação de conta digital → exige plano pago
    if (isActivateRoute) {
      if (!hasActivePlan) {
        throw new ForbiddenException({
          message:
            'Você precisa de um plano ativo para ativar sua conta digital.',
          code: 'PLAN_REQUIRED',
          details: {
            trialEndsAt: tenant.trialEndsAt,
          },
          action: 'REDIRECT_TO_PLANS',
        });
      }
      return true;
    }

    // 4. Trial interno ainda válido → acesso geral liberado
    if (isTrialActive) return true;

    // 5. Verifica assinatura para acesso geral
    if (hasActivePlan) return true;

    // CANCELED mas ainda no período pago
    if (
      latestSub?.status.toUpperCase() === 'CANCELED' &&
      latestSub.currentPeriodEnd > now
    ) {
      return true;
    }

    // 6. Sem trial e sem plano → bloqueio geral
    throw new ForbiddenException({
      message: 'Seu período gratuito expirou. Assine um plano para continuar.',
      code: 'BILLING_REQUIRED',
      details: {
        status: latestSub?.status || 'none',
        trialEndsAt: tenant.trialEndsAt,
      },
      action: 'REDIRECT_TO_PLANS',
    });
  }
}
