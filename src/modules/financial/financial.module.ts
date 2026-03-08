import { Module } from '@nestjs/common';

// Use Cases
import { CreateTitleUseCase } from './application/use-cases/create-title.use-case';
import { RegisterPaymentUseCase } from './application/use-cases/register-payment.use-case';
import { ListTitlesUseCase } from './application/use-cases/list-titles.use-case';

// Controllers
import { FinancialTitlesController } from './infrastructure/controllers/financial-titles.controller';

@Module({
  controllers: [FinancialTitlesController],
  providers: [
    // Use Cases
    CreateTitleUseCase,
    RegisterPaymentUseCase,
    ListTitlesUseCase,
  ],
  exports: [CreateTitleUseCase, RegisterPaymentUseCase, ListTitlesUseCase],
})
export class FinancialModuleV2 {}
