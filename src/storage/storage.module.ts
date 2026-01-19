import { Module } from '@nestjs/common';
import { StorageService } from './storage.service';
import { StorageController } from './storage.controller';
import { PrismaService } from 'src/prisma/prisma.service';

@Module({
  controllers: [StorageController],
  providers: [StorageService, PrismaService],
  exports: [StorageService], // Exporte caso queira usar em outros services
})
export class StorageModule {}
