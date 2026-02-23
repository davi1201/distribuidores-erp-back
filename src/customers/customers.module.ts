import { Module } from '@nestjs/common';
import { CustomersService } from './customers.service';
import { CustomersController } from './customers.controller';
import { PrismaService } from '../prisma/prisma.service';
import { LocationsService } from 'src/locations/locations.service';

@Module({
  controllers: [CustomersController],
  providers: [CustomersService, PrismaService, LocationsService],
})
export class CustomersModule {}
