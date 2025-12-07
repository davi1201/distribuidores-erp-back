import { Module } from '@nestjs/common';
import { PriceListsService } from './price-lists.service';
import { PriceListsController } from './price-lists.controller';
import { PrismaService } from '../prisma/prisma.service';

@Module({
  controllers: [PriceListsController],
  providers: [PriceListsService, PrismaService],
})
export class PriceListsModule {}
