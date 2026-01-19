import { Controller, Get, Body, Patch, UseGuards, Param } from '@nestjs/common';
import { UsersService } from './users.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '@prisma/client';
import { UpdatePermissionsDto } from './dto/update-permissions.dto';
import { RolesGuard } from '../auth/guards/roles.guard';
import { ClerkAuthGuard } from 'src/auth/guards/clerk-auth.guard';

@Controller('users')
@UseGuards(ClerkAuthGuard, RolesGuard)
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

  @Get('sellers')
  @Roles(Role.OWNER, Role.ADMIN)
  getAllSellers() {
    return this.usersService.getAllSellers();
  }
}
