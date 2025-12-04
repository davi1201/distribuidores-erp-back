import { Module } from '@nestjs/common';
import { PrismaModule } from 'src/prisma/prisma.module';
import { TenantsService } from './tenants.service';
import { TenantsController } from './tenants.controller';

@Module({
  imports: [PrismaModule],
  providers: [TenantsService],
  controllers: [TenantsController],
})
export class TenantsModule {}
