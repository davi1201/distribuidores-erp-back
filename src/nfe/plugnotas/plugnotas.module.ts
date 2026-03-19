import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PlugNotasController } from './plugnotas.controller';
import { PlugNotasNFeService } from './plugnotas-nfe.service';
import { PlugNotasApiService } from './plugnotas-api.service';
import { PrismaModule } from '../../prisma/prisma.module';

@Module({
  imports: [ConfigModule, PrismaModule],
  controllers: [PlugNotasController],
  providers: [PlugNotasNFeService, PlugNotasApiService],
  exports: [PlugNotasNFeService, PlugNotasApiService],
})
export class PlugNotasModule {}
