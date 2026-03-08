import { Module } from '@nestjs/common';
import { NfeService } from './nfe.service';
import { NfeController } from './nfe.controller';
import { ProductsModule } from '../products/products.module';
import { StockModule } from '../stock/stock.module';
import { MailWatcherService } from './nfe-watcher.service';
import { FinancialModule } from '../financial/financial.module';

@Module({
  imports: [ProductsModule, StockModule, FinancialModule],
  controllers: [NfeController],
  providers: [NfeService, MailWatcherService],
})
export class NfeModule {}
