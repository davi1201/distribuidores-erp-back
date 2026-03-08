import { Module } from '@nestjs/common';
import { TaxProfilesService } from './tax-profiles.service';
import { TaxProfilesController } from './tax-profiles.controller';

@Module({
  controllers: [TaxProfilesController],
  providers: [TaxProfilesService],
})
export class TaxProfilesModule {}
