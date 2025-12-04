import { Module } from '@nestjs/common';
import { StockService } from './stock.service';
import { StockController } from './stock.controller';
import { PrismaModule } from 'src/prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [StockController],
  providers: [StockService],
  exports: [StockService], // Exporta para usar em Vendas (quando vender, chama o service de stock)
})
export class StockModule {}
