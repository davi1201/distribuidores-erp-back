import { Body, Controller, Get, Patch, Post, UseGuards } from '@nestjs/common';
import { Role, type User } from '@prisma/client';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { TenantsService } from './tenants.service';
import { UpdateBillingProfileDto } from '../users/dto/update-billing-profile.dto';
import { Roles } from 'src/auth/decorators/roles.decorator';
import { SaveNfeEmailConfigDto } from './dto/create-nfe-email-config.dto';
import { ClerkAuthGuard } from 'src/auth/guards/clerk-auth.guard';

@Controller('tenants')
@UseGuards(ClerkAuthGuard)
export class TenantsController {
  constructor(private tenantsService: TenantsService) {}

  @Get('check')
  check(@CurrentUser() user: User) {
    return this.tenantsService.checkBillingProfile(user.tenantId || '');
  }

  @Patch('update')
  update(@CurrentUser() user: User, @Body() data: UpdateBillingProfileDto) {
    return this.tenantsService.updateBillingProfile(user || '', data);
  }

  @Post('email-config')
  @Roles(Role.OWNER, Role.ADMIN)
  async saveEmailConfig(
    @CurrentUser() user: any,
    @Body() dto: SaveNfeEmailConfigDto,
  ) {
    return this.tenantsService.saveEmailConfig(user.tenantId, dto);
  }

  @Get('email-config')
  @Roles(Role.OWNER, Role.ADMIN)
  async getEmailConfig(@CurrentUser() user: any) {
    return this.tenantsService.getEmailConfig(user.tenantId);
  }

  @Post('email-test-connection')
  @Roles(Role.OWNER, Role.ADMIN)
  async testConnection(@CurrentUser() user: any) {
    return this.tenantsService.testEmailConnection(user.tenantId);
  }
}
