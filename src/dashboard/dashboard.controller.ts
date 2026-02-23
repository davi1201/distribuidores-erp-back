import { Controller, Get, UseGuards } from '@nestjs/common';
import { DashboardService } from './dashboard.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { User } from '@prisma/client';
import { ClerkAuthGuard } from 'src/auth/guards/clerk-auth.guard';

@Controller('dashboard')
@UseGuards(ClerkAuthGuard)
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('overview')
  async getOverview(@CurrentUser() user: User) {
    return this.dashboardService.getOverview({
      tenantId: user.tenantId || '',
      userId: user.id,
      role: user.role,
    });
  }
}
