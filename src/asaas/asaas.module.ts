import { Module } from '@nestjs/common';
import { AsaasWebhookController } from './asaas-webhook.controller';
import { AsaasService } from './asaas.service';
import { AsaasController } from './asaas.controller';
import { MailModule } from '../mail/mail.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { AsaasOnboardingService } from './onboarding/asaas-onboarding.service';
import { AsaasOnboardingController } from './onboarding/asaas-onboarding.controller';
import { AsaasBillingService } from './billing/asaas-billing.service';
import { AsaasBillingController } from './billing/asaas-billing.controller';

@Module({
  imports: [MailModule, NotificationsModule],
  controllers: [
    AsaasWebhookController,
    AsaasController,
    AsaasOnboardingController,
    AsaasBillingController,
  ],
  providers: [AsaasService, AsaasOnboardingService, AsaasBillingService],
})
export class AsaasModule {}
