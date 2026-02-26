import {
  Controller,
  Post,
  Body,
  Headers,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { AsaasService } from './asaas.service';

@Controller('webhooks/asaas')
export class AsaasWebhookController {
  constructor(private readonly asaasService: AsaasService) {}

  // 💡 O Asaas sempre envia POST para o Webhook
  @Post()
  @HttpCode(HttpStatus.OK) // 💡 O Asaas exige que você responda com 200 OK rapidamente
  async handleWebhook(
    @Body() payload: any,
    @Headers('asaas-access-token') webhookToken: string,
  ) {
    // 🛡️ SEGURANÇA: Opcional, mas muito recomendado.

    if (webhookToken !== process.env.ASAAS_WEBHOOK_SECRET) {
      return { error: 'Token inválido' };
    }

    // Envia o payload para o Service processar em background
    await this.asaasService.processWebhook(payload);

    // Responde pro Asaas: "Recebido, obrigado!"
    return { received: true };
  }
}
