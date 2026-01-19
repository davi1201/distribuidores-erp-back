import { Module } from '@nestjs/common';
import { NfeService } from './nfe.service';
import { NfeController } from './nfe.controller';
import { PrismaService } from '../prisma/prisma.service';
import { ProductsService } from '../products/products.service';
import { StockService } from '../stock/stock.service';
import { MailWatcherService } from './nfe-watcher.service';
import { FinancialService } from 'src/financial/financial.service';

@Module({
  controllers: [NfeController],
  providers: [
    NfeService,
    PrismaService,
    ProductsService,
    StockService,
    MailWatcherService,
    FinancialService,
  ],
})
export class NfeModule {}
