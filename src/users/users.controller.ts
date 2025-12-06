import { Controller, Get, Body, Patch, UseGuards, Param } from '@nestjs/common';
import { UsersService } from './users.service';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { CurrentUser } from 'src/auth/decorators/current-user.decorator';
import { Roles } from 'src/auth/decorators/roles.decorator';
import { Role } from '@prisma/client';
import { UpdatePermissionsDto } from './dto/update-permissions.dto';
import { RolesGuard } from 'src/auth/guards/roles.guard';

@Controller('users')
@UseGuards(JwtAuthGuard, RolesGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('me')
  getProfile(@CurrentUser() user: any) {
    return this.usersService.getProfile(user.userId);
  }

  @Patch(':id/permissions')
  @Roles(Role.OWNER, Role.ADMIN)
  updatePermissions(
    @Param('id') id: string,
    @Body() dto: UpdatePermissionsDto,
    @CurrentUser() currentUser: any,
  ) {
    return this.usersService.updatePermissions(
      id,
      dto.permissions,
      currentUser,
    );
  }

  @Patch('me')
  updateProfile(@CurrentUser() user: any, @Body() data: any) {
    return this.usersService.updateProfile(user.userId, data);
  }

  @Patch('company') // Nova rota para editar a empresa
  updateCompany(@CurrentUser() user: any, @Body() data: any) {
    return this.usersService.updateCompanyProfile(user.userId, data);
  }
}
