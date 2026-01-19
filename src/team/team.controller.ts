import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { TeamService } from './team.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { User } from '@prisma/client';
import { InviteMemberDto } from './dto/invite-member.dto';
import { ClerkAuthGuard } from 'src/auth/guards/clerk-auth.guard';

@Controller('team')
export class TeamController {
  constructor(private readonly teamService: TeamService) {}

  // ==================================================================
  // ROTAS PROTEGIDAS (Apenas Dono/Admin logados)
  // ==================================================================

  @UseGuards(ClerkAuthGuard)
  @Get()
  getMembers(@CurrentUser() user: User) {
    return this.teamService.getMembers(user.tenantId ?? '');
  }

  @UseGuards(ClerkAuthGuard)
  @Post('invite')
  inviteMember(@CurrentUser() user: User, @Body() dto: InviteMemberDto) {
    // Agora só precisamos passar tenantId e o userId do admin
    // O service busca o clerkOrgId automaticamente
    return this.teamService.inviteMember(
      user.tenantId ?? '',
      user.clerkId ?? '', // Inviter User ID
      dto,
    );
  }

  @UseGuards(ClerkAuthGuard)
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

  @UseGuards(ClerkAuthGuard)
  @Delete(':id')
  removeMember(@CurrentUser() user: User, @Param('id') id: string) {
    return this.teamService.removeMember(user.tenantId ?? '', id, user);
  }
}
