import { Module } from '@nestjs/common';
import { SalesService } from './sales.service';
import { SalesController } from './sales.controller';
import { FinancialModule } from '../financial/financial.module';
import { CommissionsModule } from '../commissions/commissions.module';

// Services auxiliares (separação de responsabilidades)
import { OrderTaxCalculatorService } from './services/order-tax-calculator.service';
import { OrderPaymentProcessorService } from './services/order-payment-processor.service';

@Module({
  imports: [FinancialModule, CommissionsModule],
  controllers: [SalesController],
  providers: [
    SalesService,
    OrderTaxCalculatorService,
    OrderPaymentProcessorService,
  ],
  exports: [
    SalesService,
    OrderTaxCalculatorService,
    OrderPaymentProcessorService,
  ],
})
export class SalesModule {}
