import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
} from '@nestjs/common';
import { TaxProfilesService } from './tax-profiles.service';
import { CreateTaxProfileDto } from './dto/create-tax-profile.dto';
import { UpdateTaxProfileDto } from './dto/update-tax-profile.dto';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { CurrentUser } from 'src/auth/decorators/current-user.decorator';
import type { User } from '@prisma/client';

@Controller('tax-profiles')
@UseGuards(JwtAuthGuard)
export class TaxProfilesController {
  constructor(private readonly taxProfilesService: TaxProfilesService) {}

  @Post()
  create(@Body() createDto: CreateTaxProfileDto, @CurrentUser() user: User) {
    return this.taxProfilesService.create(createDto, user.tenantId || '');
  }

  @Get()
  findAll(@CurrentUser() user: User) {
    return this.taxProfilesService.findAll(user.tenantId || '');
  }

  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUser() user: User) {
    return this.taxProfilesService.findOne(id, user.tenantId || '');
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() updateDto: UpdateTaxProfileDto,
    @CurrentUser() user: User,
  ) {
    return this.taxProfilesService.update(id, updateDto, user.tenantId || '');
  }

  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUser() user: User) {
    return this.taxProfilesService.remove(id, user.tenantId || '');
  }
}
