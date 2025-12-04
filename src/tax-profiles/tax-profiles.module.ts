import { Module } from '@nestjs/common';
import { TaxProfilesService } from './tax-profiles.service';
import { TaxProfilesController } from './tax-profiles.controller';
import { PrismaService } from 'src/prisma/prisma.service';

@Module({
  controllers: [TaxProfilesController],
  providers: [TaxProfilesService, PrismaService],
})
export class TaxProfilesModule {}
