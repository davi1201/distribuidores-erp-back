import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { SystemService } from './system.service';
import { ClerkAuthGuard } from 'src/auth/guards/clerk-auth.guard';

@Controller('system')
@UseGuards(ClerkAuthGuard)
export class SystemController {
  constructor(private readonly systemService: SystemService) {}

  @Get('readiness')
  async getSystemReadiness(@Req() req: any) {
    const tenantId = req.user.tenantId;

    const readinessStatus =
      await this.systemService.checkSystemHealth(tenantId);

    return {
      success: true,
      data: readinessStatus,
    };
  }
}
