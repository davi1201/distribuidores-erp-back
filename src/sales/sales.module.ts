import { Module } from '@nestjs/common';
import { SalesService } from './sales.service';
import { SalesController } from './sales.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { FinancialService } from '../financial/financial.service';

@Module({
  imports: [PrismaModule],
  controllers: [SalesController],
  providers: [SalesService, FinancialService],
})
export class SalesModule {}
