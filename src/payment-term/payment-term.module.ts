import { Module } from '@nestjs/common';
import { PaymentTermsController } from './payment-term.controller';
import { PaymentTermsService } from './payment-term.service';

@Module({
  controllers: [PaymentTermsController],
  providers: [PaymentTermsService],
})
export class PaymentTermModule {}
