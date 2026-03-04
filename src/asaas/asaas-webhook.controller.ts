import {
  Controller,
  Post,
  Body,
  Headers,
  HttpCode,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from 'src/prisma/prisma.service';

@Controller('webhooks/asaas')
export class AsaasWebhookController {
  private readonly logger = new Logger(AsaasWebhookController.name);

  constructor(
    private eventEmitter: EventEmitter2,
    private prisma: PrismaService,
  ) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  async handleWebhook(
    @Body() payload: any,
    @Headers('asaas-access-token') webhookToken: string,
  ) {
    // 1. LOG IMEDIATO: Se o Asaas bater aqui, o console VAI gritar.
    this.logger.log(
      `🕵️ Webhook recebido direto do Asaas! Evento: ${payload.event}`,
    );

    const { event } = payload;

    // O Asaas manda o ID da cobrança em payment.id, ou o ID da carteira em account.id
    const externalId = payload.payment?.id || payload.account?.id;

    // 2. SALVA NA CAIXA DE ENTRADA (Segurança total contra perda de dados)
    const webhookLog = await this.prisma.webhookEvent.create({
      data: {
        provider: 'ASAAS',
        eventType: event || 'UNKNOWN',
        payload: payload,
        externalId: externalId || null,
        status: 'PENDING',
      },
    });

    // Embutimos o ID do log no payload caso algum serviço precise atualizar algo específico
    payload.webhookLogId = webhookLog.id;

    // 3. TENTA PROCESSAR OS EVENTOS
    try {
      await this.eventEmitter.emitAsync(`asaas.${event}`, payload);

      // Se todos os listeners (@OnEvent) terminarem sem erro, marca como sucesso
      await this.prisma.webhookEvent.update({
        where: { id: webhookLog.id },
        data: { status: 'PROCESSED', processedAt: new Date() },
      });
    } catch (error) {
      this.logger.error(
        `❌ Falha ao processar Webhook ${webhookLog.id}: ${error.message}`,
      );

      // Se der erro no seu código (ex: variável nula), salva o erro no banco para você ver depois
      await this.prisma.webhookEvent.update({
        where: { id: webhookLog.id },
        data: { status: 'FAILED', errorMessage: error.stack || error.message },
      });
    }

    // Retorna 200 OK para o Asaas dar o serviço como entregue
    return { received: true };
  }
}
