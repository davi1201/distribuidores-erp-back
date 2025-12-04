import { Controller, Get, Body, Patch, UseGuards } from '@nestjs/common';
import { UsersService } from './users.service';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { CurrentUser } from 'src/auth/decorators/current-user.decorator';

@Controller('users')
@UseGuards(JwtAuthGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('me')
  getProfile(@CurrentUser() user: any) {
    return this.usersService.getProfile(user.userId);
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
