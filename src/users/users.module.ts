import { Module } from '@nestjs/common';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { TenantsService } from '../tenants/tenants.service';

@Module({
  providers: [UsersService, TenantsService],
  controllers: [UsersController],
})
export class UsersModule {}
