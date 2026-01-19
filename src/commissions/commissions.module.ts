import { Module } from '@nestjs/common';
import { CommissionsController } from './commissions.controller';
import { CommissionsService } from './commissions.service';
import { PrismaModule } from 'src/prisma/prisma.module';

@Module({
  imports: [PrismaModule], // Importante: O Service precisa do PrismaService
  controllers: [CommissionsController],
  providers: [CommissionsService],
  exports: [CommissionsService], // Exporte se precisar usar o service em outros lugares (ex: Webhooks)
})
export class CommissionsModule {}
