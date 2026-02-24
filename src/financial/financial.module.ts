import { Module } from '@nestjs/common';
import { FinancialService } from './financial.service';
import { FinancialController } from './financial.controller';
import { PrismaService } from '../prisma/prisma.service';
import { FinancialCategoryController } from './financial-category.controller';
import { FinancialCategoryService } from './financial-category.service';

@Module({
  controllers: [FinancialController, FinancialCategoryController],
  providers: [FinancialService, PrismaService, FinancialCategoryService],
})
export class FinancialModule {}
