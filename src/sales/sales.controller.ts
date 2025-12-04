import { Controller, Get, Post, Body, Param, UseGuards } from '@nestjs/common';
import { SalesService } from './sales.service';

import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { CurrentUser } from 'src/auth/decorators/current-user.decorator';
import type { User } from '@prisma/client';
import { CreateOrderDto } from './dto/create-sale.dto';

@Controller('sales')
@UseGuards(JwtAuthGuard)
export class SalesController {
  constructor(private readonly salesService: SalesService) {}

  @Post()
  create(@Body() createDto: CreateOrderDto, @CurrentUser() user: User) {
    return this.salesService.create(createDto, user.tenantId || '', user);
  }

  @Get()
  findAll(@CurrentUser() user: User) {
    return this.salesService.findAll(user.tenantId || '');
  }

  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUser() user: User) {
    return this.salesService.findOne(id, user.tenantId || '');
  }
}
