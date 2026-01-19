import {
  Controller,
  Post,
  Body,
  Req,
  UseGuards,
  Headers,
  RawBodyRequest,
  Get,
} from '@nestjs/common';
import { PaymentService } from './payment.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'; // Ou ClerkAuthGuard
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Request } from 'express';
import { ClerkAuthGuard } from 'src/auth/guards/clerk-auth.guard';

@Controller('payment')
export class PaymentController {
  constructor(private readonly paymentService: PaymentService) {}

  @Get('subscription')
  @UseGuards(ClerkAuthGuard)
  async getSubscription(@CurrentUser() user: any) {
    return this.paymentService.getCurrentSubscription(user.tenantId);
  }

  // 1. Criar Sessão de Checkout (Protegido)
  @Post('checkout')
  @UseGuards(ClerkAuthGuard) // Use seu ClerkAuthGuard aqui
  async createCheckoutSession(
    @CurrentUser() user: any,
    @Body() body: { planSlug: string; cycle: 'monthly' | 'yearly' },
  ) {
    return this.paymentService.createCheckoutSession(
      user.tenantId,
      body.planSlug,
      user.email,
      body.cycle,
    );
  }

  // 2. Portal do Cliente (Gerenciar Assinatura)
  @Post('portal')
  @UseGuards(ClerkAuthGuard)
  async createPortalSession(@CurrentUser() user: any) {
    return this.paymentService.createPortalSession(user.tenantId);
  }

  // 3. Webhook (Público)
  @Post('webhook')
  async handleWebhook(
    @Headers('stripe-signature') signature: string,
    @Req() req: RawBodyRequest<Request>, // NestJS v9+ suporta rawBody nativo
  ) {
    if (!req.rawBody) {
      throw new Error('RawBody não habilitado no NestJS. Configure no main.ts');
    }

    return this.paymentService.handleStripeWebhook(signature, req.rawBody);
  }
}
