import { Module, Global } from '@nestjs/common';
import { PrismaService } from './prisma/prisma.service';
import { PrismaFinancialTitleRepository } from './repositories/prisma-financial-title.repository';
import { PrismaStockRepository } from './repositories/prisma-stock.repository';
import { FinancialTitleRepository } from '../../core/application/ports/repositories/financial-title.repository';
import { StockRepository } from '../../core/application/ports/repositories/stock.repository';

@Global()
@Module({
  providers: [
    PrismaService,
    {
      provide: FinancialTitleRepository,
      useClass: PrismaFinancialTitleRepository,
    },
    {
      provide: StockRepository,
      useClass: PrismaStockRepository,
    },
  ],
  exports: [PrismaService, FinancialTitleRepository, StockRepository],
})
export class DatabaseModule {}
