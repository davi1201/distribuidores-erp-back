import { Module } from '@nestjs/common';
import { FinancialService } from './financial.service';
import { FinancialController } from './financial.controller';
import { PrismaService } from 'src/prisma/prisma.service';

@Module({
  controllers: [FinancialController],
  providers: [FinancialService, PrismaService],
})
export class FinancialModule {}
