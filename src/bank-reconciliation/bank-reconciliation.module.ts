import { Module } from '@nestjs/common';
import { BankReconciliationService } from './bank-reconciliation.service';
import { BankReconciliationController } from './bank-reconciliation.controller';
import { MatchingEngineService } from './matching-engine.service';
import { FinancialModule } from '../financial/financial.module';
import { OfxParserService } from './ofx-parser.service';

@Module({
  imports: [FinancialModule],
  controllers: [BankReconciliationController],
  providers: [
    BankReconciliationService,
    MatchingEngineService,
    OfxParserService,
  ],
})
export class BankReconciliationModule {}
