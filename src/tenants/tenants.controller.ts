import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import type { User } from '@prisma/client';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { TenantsService } from './tenants.service';
import { UpdateBillingProfileDto } from '../users/dto/update-billing-profile.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('tenants')
@UseGuards(JwtAuthGuard)
export class TenantsController {
  constructor(private tenantsService: TenantsService) {}

  @Get('check')
  check(@CurrentUser() user: User) {
    return this.tenantsService.checkBillingProfile(user.tenantId || '');
  }

  @Patch('update')
  update(@CurrentUser() user: User, @Body() data: UpdateBillingProfileDto) {
    console.log(user);

    return this.tenantsService.updateBillingProfile(user || '', data);
  }
}
