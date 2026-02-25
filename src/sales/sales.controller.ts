import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  UseGuards,
  Patch,
  Query,
} from '@nestjs/common';
import { SalesService } from './sales.service';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { OrderStatus, User } from '@prisma/client';
import { CreateOrderDto } from './dto/create-sale.dto';
import { ClerkAuthGuard } from 'src/auth/guards/clerk-auth.guard';

@Controller('sales')
@UseGuards(ClerkAuthGuard)
export class SalesController {
  constructor(private readonly salesService: SalesService) {}

  @Post()
  create(@Body() createDto: CreateOrderDto, @CurrentUser() user: User) {
    return this.salesService.create(createDto, user.tenantId || '', user);
  }

  @Get()
  findAll(@CurrentUser() user: User, @Query() query: any) {
    return this.salesService.findAll(user.tenantId || '', user, {
      search: query.search,
      status: query.status,
      startDate: query.startDate,
      endDate: query.endDate,
    });
  }

  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUser() user: User) {
    return this.salesService.findOne(id, user.tenantId || '');
  }

  @Patch('status/:id')
  updateStatus(
    @Param('id') id: string,
    @Body('status') newStatus: OrderStatus,
    @CurrentUser() user: User,
  ) {
    return this.salesService.updateStatus(id, user.tenantId || '', newStatus);
  }

  @Patch('approve-manual-commission/:orderId')
  approveManualCommission(
    @Param('orderId') orderId: string,
    @CurrentUser() user: User,
  ) {
    return this.salesService.mannualAproveCommission(
      orderId,
      user.tenantId || '',
    );
  }
}
