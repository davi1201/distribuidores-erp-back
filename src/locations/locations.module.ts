import { Module } from '@nestjs/common';
import { LocationsController } from './locations.controller';
import { PrismaService } from '../prisma/prisma.service';
import { LocationsService } from './locations.service';

@Module({
  controllers: [LocationsController],
  providers: [LocationsService, PrismaService],
})
export class LocationsModule {}
