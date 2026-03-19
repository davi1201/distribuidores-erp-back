import {
  Controller,
  Post,
  Body,
  UseGuards,
  Request,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
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
import { AsaasPixCheckoutDto } from '../dto/asaas-pix-checkout.dto';
import { Role } from '@prisma/client';

@ApiTags('Billing Asaas')
@ApiBearerAuth()
@Controller('billing/asaas')
@UseGuards(ClerkAuthGuard, RolesGuard)
export class AsaasBillingController {
  constructor(private readonly asaasBillingService: AsaasBillingService) {}

  @Post('checkout')
  @Roles(Role.ADMIN, Role.OWNER)
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

  @Post('checkout-pix')
  @Roles(Role.ADMIN, Role.OWNER, Role.SUPER_ADMIN)
  @ApiOperation({
    summary: 'Gera um QR Code PIX para pagamento da assinatura via Asaas',
  })
  async processPixCheckout(
    @CurrentUser() user: any,
    @Body() body: AsaasPixCheckoutDto,
  ) {
    // Se for SUPER_ADMIN, permite passar o tenantId no body.
    // Caso contrário, usa o tenantId do usuário logado.
    let tenantId = user.tenantId;

    if (user.role === Role.SUPER_ADMIN) {
      tenantId = tenantId;
    }

    if (!tenantId) {
      throw new HttpException(
        'O tenantId é obrigatório para esta operação.',
        HttpStatus.BAD_REQUEST,
      );
    }

    return this.asaasBillingService.processPixCheckout(
      tenantId,
      body.planId,
      body.cycle,
    );
  }

  @Post('upgrade-1-click')
  @Roles(Role.ADMIN, Role.OWNER)
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
