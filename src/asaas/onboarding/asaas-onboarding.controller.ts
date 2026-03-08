import { Controller, Post, UseGuards, Request } from '@nestjs/common';
import { createLogger } from '../../core/logging';
import { AsaasOnboardingService } from './asaas-onboarding.service';
import { ClerkAuthGuard } from '../../auth/guards/clerk-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { BillingGuard } from '../../auth/guards/billing.guard';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';

@Controller('asaas/onboarding')
@UseGuards(ClerkAuthGuard, RolesGuard, BillingGuard) // Protege a rota para usuários logados
export class AsaasOnboardingController {
  private readonly logger = createLogger(AsaasOnboardingController.name);

  constructor(
    private readonly asaasOnboardingService: AsaasOnboardingService,
  ) {}

  /**
   * Rota: POST /asaas/onboarding/activate
   * Descrição: Inicia a esteira de criação da Subconta (White Label) e retorna a URL do KYC.
   */
  @Post('activate')
  @Roles('ADMIN', 'OWNER')
  async activateDigitalAccount(@CurrentUser() user: any) {
    const tenantId = user.tenantId;
    const userId = user.id;

    this.logger.log(
      `Usuário Admin [${userId}] solicitou ativação da conta digital para o Tenant [${tenantId}]`,
    );

    return this.asaasOnboardingService.setupNewTenant(tenantId);
  }
}
