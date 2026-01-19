import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  Req,
  UseGuards,
  ParseIntPipe,
  ForbiddenException,
} from '@nestjs/common';
import { CommissionsService } from './commissions.service';
import { CreateCommissionRuleDto } from './dto/create-rule.dto';
import { ClerkAuthGuard } from 'src/auth/guards/clerk-auth.guard';
import { Roles } from 'src/auth/decorators/roles.decorator';
import { Role } from '@prisma/client';
import { CurrentUser } from 'src/auth/decorators/current-user.decorator';
// Importe seus Guards de Autenticação e Role
// import { AuthGuard } from '@/auth/auth.guard';
// import { RolesGuard } from '@/auth/roles.guard';

@Controller('commissions')
@UseGuards(ClerkAuthGuard) // Assumindo proteção global ou por controller
export class CommissionsController {
  constructor(private readonly commissionsService: CommissionsService) {}

  // ==================================================================
  // ÁREA DE ADMINISTRAÇÃO (Configuração de Regras)
  // ==================================================================

  @Post('rules')
  @Roles(Role.OWNER, Role.ADMIN)
  async createRule(@Req() req, @Body() dto: CreateCommissionRuleDto) {
    const tenantId = req.user.tenantId;
    return this.commissionsService.createRule(tenantId, dto);
  }

  @Get('rules')
  // @Roles('ADMIN', 'OWNER')
  async listRules(@Req() req) {
    const tenantId = req.user.tenantId;
    return this.commissionsService.listRules(tenantId);
  }

  // ==================================================================
  // DASHBOARD DO VENDEDOR (Auto-atendimento)
  // ==================================================================

  @Get('my-metrics')
  async getMyMetrics(@Req() req) {
    const tenantId = req.user.tenantId;
    const sellerId = req.user.id; // O ID do usuário logado

    return this.commissionsService.getSellerMetrics(tenantId, sellerId);
  }

  @Get('my-statement')
  async getMyStatement(
    @Req() req,
    @Query('page', new ParseIntPipe({ optional: true })) page = 1,
  ) {
    const tenantId = req.user.tenantId;
    const sellerId = req.user.id;

    return this.commissionsService.getStatement(tenantId, sellerId, page);
  }

  // ==================================================================
  // DASHBOARD DO DONO (Visão Gerencial)
  // ==================================================================

  @Get('admin/seller/:sellerId/metrics')
  // @Roles('ADMIN', 'OWNER')
  async getSellerMetricsAsAdmin(
    @Req() req,
    @Param('sellerId') sellerId: string,
  ) {
    const tenantId = req.user.tenantId;
    // Aqui você vê as métricas de QUALQUER vendedor
    return this.commissionsService.getSellerMetrics(tenantId, sellerId);
  }

  @Get('admin/seller/:sellerId/statement')
  // @Roles('ADMIN', 'OWNER')
  async getStatementAsAdmin(
    @Req() req,
    @Param('sellerId') sellerId: string,
    @Query('page', new ParseIntPipe({ optional: true })) page = 1,
  ) {
    const tenantId = req.user.tenantId;
    return this.commissionsService.getStatement(tenantId, sellerId, page);
  }

  @Get('admin/ready-to-pay')
  @Roles(Role.OWNER, Role.ADMIN)
  async getReadyToPay(@CurrentUser() user: any) {
    return this.commissionsService.getReadyToPay(user.tenantId);
  }

  @Get('admin/payouts')
  @Roles(Role.OWNER, Role.ADMIN)
  async getPayouts(@CurrentUser() user: any) {
    return this.commissionsService.getPayoutsHistory(user.tenantId);
  }

  @Get('admin/pending')
  @Roles(Role.OWNER, Role.ADMIN)
  async getPendingCommissions(@CurrentUser() user: any) {
    return this.commissionsService.getCommissionsPendingApproval(user.tenantId);
  }
  @Post('approve')
  @Roles(Role.OWNER, Role.ADMIN)
  async approveCommissionsPayout(@Body('ids') ids: string[]) {
    return this.commissionsService.approveCommission(ids);
  }
}
