import { Module } from '@nestjs/common';
import { PlansService } from './plans.service';
import { PlansController } from './plans.controller';
import { PlansBackofficeController } from './plans-backoffice.controller';

@Module({
  controllers: [PlansController, PlansBackofficeController],
  providers: [PlansService],
})
export class PlansModule {}
