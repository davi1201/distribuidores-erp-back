import { Module } from '@nestjs/common';
import { BankReconciliationService } from './bank-reconciliation.service';
import { BankReconciliationController } from './bank-reconciliation.controller';
import { PrismaService } from 'src/prisma/prisma.service';
import { MatchingEngineService } from './matching-engine.service';
import { FinancialService } from 'src/financial/financial.service';
import { OfxParserService } from './ofx-parser.service';

@Module({
  controllers: [BankReconciliationController],
  providers: [
    BankReconciliationService,
    MatchingEngineService,
    PrismaService,
    FinancialService,
    OfxParserService,
  ],
})
export class BankReconciliationModule {}
