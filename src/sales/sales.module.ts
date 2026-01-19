import { Module } from '@nestjs/common';
import { SalesService } from './sales.service';
import { SalesController } from './sales.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { FinancialService } from '../financial/financial.service';
import { CommissionsModule } from 'src/commissions/commissions.module';

@Module({
  imports: [PrismaModule, CommissionsModule],
  controllers: [SalesController],
  providers: [SalesService, FinancialService],
})
export class SalesModule {}
