import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class BillingGuard implements CanActivate {
  constructor(
    private prisma: PrismaService,
    private reflector: Reflector,
  ) {}

  async checkBillingProfile(tenantId: string) {
    const profile = await this.prisma.billingProfile.findUnique({
      where: { tenantId },
    });

    const isComplete = !!profile?.document && !!profile?.zipCode;

    return { isComplete };
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const user = request.user;

    const skipBilling = this.reflector.get<boolean>(
      'skipBilling',
      context.getHandler(),
    );
    if (skipBilling) return true;

    if (!user || user.role === 'SUPER_ADMIN') return true;
    if (!user.tenantId) return false;

    // 1. Busca Tenant e Assinaturas
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: user.tenantId },
      include: {
        subscriptions: {
          orderBy: { createdAt: 'desc' }, // Pega a mais recente primeiro
          take: 1,
        },
      },
    });

    if (!tenant) return false;

    const now = new Date();

    // 2. Verifica Assinatura Ativa (Gateway)
    // Regra: Status ATIVO e Data de fim no futuro (ou null se for vitalício)
    const latestSubscription = tenant.subscriptions[0];
    const hasActiveSubscription =
      latestSubscription &&
      ['ACTIVE', 'TRIALING'].includes(latestSubscription.status) &&
      latestSubscription.currentPeriodEnd !== null &&
      latestSubscription.currentPeriodEnd > now;

    if (hasActiveSubscription) {
      return true; // Assinante em dia.
    }

    // 3. Verifica Trial do Sistema (7 dias internos)
    if (tenant.trialEndsAt && tenant.trialEndsAt > now) {
      return true; // Trial válido.
    }

    // --- BLOQUEIO / RESTRIÇÃO ---

    // 4. Modo "Read-Only" (Opcional)
    // Permite que o usuário inadimplente VEJA os dados, mas não altere.
    // Isso evita que o sistema pareça "quebrado", ele só fica "trancado".
    if (request.method === 'GET') {
      return true;
    }

    // 5. Exceção com Payload rico para o Frontend
    throw new ForbiddenException({
      message: 'Sua assinatura ou período de teste expirou.',
      code: 'BILLING_REQUIRED', // Front usa isso para abrir modal de planos
      planId: tenant.planId, // Front pode sugerir o plano atual
      action: 'REDIRECT_TO_BILLING',
      isProfileComplete: await this.checkBillingProfile(tenant.id).then(
        (res) => res.isComplete,
      ),
    });
  }
}
