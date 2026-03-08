import { Controller, Post, Body, UseGuards, Request } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';

import { RolesGuard } from '../../auth/guards/roles.guard';
import { ClerkAuthGuard } from '../../auth/guards/clerk-auth.guard';
import { Roles } from '../../auth/decorators/roles.decorator';

import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { AsaasBillingService } from './asaas-billing.service';
import { AsaasCheckoutDto } from '../dto/asaas-checkout.dto';

@ApiTags('Billing Asaas')
@ApiBearerAuth()
@Controller('billing/asaas')
@UseGuards(ClerkAuthGuard, RolesGuard)
export class AsaasBillingController {
  constructor(private readonly asaasBillingService: AsaasBillingService) {}

  @Post('checkout')
  @Roles('ADMIN', 'OWNER')
  @ApiOperation({
    summary: 'Processa o pagamento da assinatura via Asaas (Cartão de Crédito)',
  })
  @ApiResponse({
    status: 201,
    description: 'Pagamento aprovado e assinatura criada.',
  })
  @ApiResponse({
    status: 402,
    description: 'Pagamento recusado pelo banco emissor.',
  })
  async processCheckout(@Request() req, @Body() body: AsaasCheckoutDto) {
    const tenantId = req.user.tenantId;
    const clientIp =
      req.headers['x-forwarded-for'] || req.socket.remoteAddress || '127.0.0.1';

    return this.asaasBillingService.processCreditCardCheckout(
      tenantId,
      body.planId,
      body.cycle,
      body.installments || 1,
      body.cardData,
      clientIp, // Repassando o IP para a Tokenização
    );
  }

  @Post('upgrade-1-click')
  @Roles('ADMIN', 'OWNER')
  @ApiOperation({
    summary: 'Faz upgrade de plano usando o cartão guardado (Token)',
  })
  async processOneClickUpgrade(
    @CurrentUser() user: any,
    @Body()
    body: {
      planId: string;
      cycle: 'MONTHLY' | 'YEARLY';
      installments?: number;
    },
  ) {
    const tenantId = user.tenantId;

    return this.asaasBillingService.processOneClickUpgrade(
      tenantId,
      body.planId,
      body.cycle,
      body.installments || 1,
    );
  }
}
