import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { TeamService } from './team.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { User } from '@prisma/client';
import { AcceptInviteDto } from './dto/accept-invite.dto';
import { InviteMemberDto } from './dto/invite-member.dto';

@Controller('team')
export class TeamController {
  constructor(private readonly teamService: TeamService) {}

  // ==================================================================
  // ROTAS PROTEGIDAS (Apenas Dono/Admin logados)
  // ==================================================================

  @UseGuards(JwtAuthGuard)
  @Get()
  getMembers(@CurrentUser() user: User) {
    return this.teamService.getMembers(user.tenantId ?? '');
  }

  @UseGuards(JwtAuthGuard)
  @Post('invite')
  inviteMember(@CurrentUser() user: User, @Body() dto: InviteMemberDto) {
    return this.teamService.inviteMember(user.tenantId ?? '', dto);
  }

  @UseGuards(JwtAuthGuard)
  @Patch('update-role/:id')
  updateMemberRole(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body() body: { role: string },
  ) {
    return this.teamService.updateMemberRole(
      user.tenantId ?? '',
      id,
      body.role as any,
      user,
    );
  }

  @UseGuards(JwtAuthGuard)
  @Delete(':id')
  removeMember(@CurrentUser() user: User, @Param('id') id: string) {
    return this.teamService.removeMember(user.tenantId ?? '', id, user);
  }

  // ==================================================================
  // ROTAS PÚBLICAS (Fluxo de Aceite de Convite)
  // ==================================================================

  // GET /team/invite/validate?token=XYZ
  // Chamado pela página de cadastro para verificar se o token é válido
  @Get('invite/validate')
  validateToken(@Query('token') token: string) {
    return this.teamService.validateInviteToken(token);
  }

  // POST /team/invite/accept
  // Chamado pelo formulário para criar a conta efetivamente
  @Post('invite/accept')
  acceptInvite(@Body() dto: AcceptInviteDto) {
    return this.teamService.acceptInvite(dto);
  }
}
