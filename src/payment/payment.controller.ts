import {
  Controller,
  Post,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
  Headers,
} from '@nestjs/common';
import { PaymentService } from './payment.service';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import * as currentUserDecorator from 'src/auth/decorators/current-user.decorator';

class SubscribeDto {
  planSlug: string;
  cardToken: string; // Token vindo do Pagar.me JS no frontend
}

@Controller('payment')
// @UseGuards(JwtAuthGuard)
export class PaymentController {
  constructor(private readonly paymentService: PaymentService) {}

  @UseGuards(JwtAuthGuard)
  @Post('subscribe')
  async subscribe(
    @Body() dto: SubscribeDto,
    @currentUserDecorator.CurrentUser() user: currentUserDecorator.UserPayload,
  ) {
    // Importante: O usuário só pode assinar pro PRÓPRIO tenant
    if (!user.tenantId) throw new Error('Usuário sem tenant não pode assinar.');

    return this.paymentService.createSubscription(
      user.tenantId,
      dto.planSlug,
      dto.cardToken,
      user,
    );
  }

  @Post('webhook')
  @HttpCode(HttpStatus.OK) // Retornar 200 é vital, senão a Pagar.me tenta enviar de novo
  async handleWebhook(@Headers() headers: any, @Body() body: any) {
    // Não usamos @CurrentUser() aqui porque não tem usuário logado!
    return this.paymentService.handleWebhook(headers, body);
  }
}
