import { Module } from '@nestjs/common';
import { PlansService } from './plans.service';
import { PlansController } from './plans.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { PlansBackofficeController } from './plans-backoffice.controller';

@Module({
  imports: [PrismaModule],
  controllers: [PlansController, PlansBackofficeController],
  providers: [PlansService],
})
export class PlansModule {}
