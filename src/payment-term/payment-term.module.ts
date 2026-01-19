import { Module } from '@nestjs/common';
import { PaymentTermsController } from './payment-term.controller';
import { PaymentTermsService } from './payment-term.service';
import { PrismaService } from 'src/prisma/prisma.service';

@Module({
  controllers: [PaymentTermsController],
  providers: [PaymentTermsService, PrismaService],
})
export class PaymentTermModule {}
