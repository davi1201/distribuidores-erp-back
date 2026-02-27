import { Module } from '@nestjs/common';
import { WebhooksController } from './webhooks.controller';
import { PrismaService } from 'src/prisma/prisma.service';
import { WebhooksService } from './webhooks.service';

@Module({
  controllers: [WebhooksController],
  providers: [PrismaService, WebhooksService],
})
export class WebhooksModule {}
