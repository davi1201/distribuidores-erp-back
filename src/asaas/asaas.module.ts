import { Module } from '@nestjs/common';
import { AsaasWebhookController } from './asaas-webhook.controller';
import { AsaasService } from './asaas.service';
import { PrismaService } from 'src/prisma/prisma.service'; // Pode manter se não estiver usando o PrismaModule globalmente
import { AsaasController } from './asaas.controller';
import { MailService } from 'src/mail/mail.service';

@Module({
  controllers: [AsaasWebhookController, AsaasController],
  providers: [AsaasService, PrismaService, MailService],
})
export class AsaasModule {}
