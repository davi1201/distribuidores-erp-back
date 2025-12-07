import { Module } from '@nestjs/common';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { TenantsService } from '../tenants/tenants.service';
import { PrismaService } from '../prisma/prisma.service';

@Module({
  providers: [UsersService, TenantsService, PrismaService],
  controllers: [UsersController],
})
export class UsersModule {}
