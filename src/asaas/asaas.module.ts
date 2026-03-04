import { Module } from '@nestjs/common';
import { AsaasWebhookController } from './asaas-webhook.controller';
import { AsaasService } from './asaas.service';
import { PrismaService } from 'src/prisma/prisma.service'; // Pode manter se não estiver usando o PrismaModule globalmente
import { AsaasController } from './asaas.controller';
import { MailService } from 'src/mail/mail.service';
import { NotificationsService } from 'src/notifications/notifications.service';
import { AsaasOnboardingService } from './onboarding/asaas-onboarding.service';
import { AsaasOnboardingController } from './onboarding/asaas-onboarding.controller';
import { AsaasBillingService } from './billing/asaas-billing.service';
import { AsaasBillingController } from './billing/asaas-billing.controller';

@Module({
  controllers: [
    AsaasWebhookController,
    AsaasController,
    AsaasOnboardingController,
    AsaasBillingController,
  ],
  providers: [
    AsaasService,
    PrismaService,
    MailService,
    NotificationsService,
    AsaasOnboardingService,
    AsaasBillingService,
  ],
})
export class AsaasModule {}
