import { Module } from '@nestjs/common';
import { FinancialService } from './financial.service';
import { FinancialController } from './financial.controller';
import { FinancialCategoryController } from './financial-category.controller';
import { FinancialCategoryService } from './financial-category.service';

@Module({
  controllers: [FinancialController, FinancialCategoryController],
  providers: [FinancialService, FinancialCategoryService],
  exports: [FinancialService],
})
export class FinancialModule {}
