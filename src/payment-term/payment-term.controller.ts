import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Delete,
  UseGuards,
  Query,
} from '@nestjs/common';

import { CreatePaymentTermDto } from './dto/create-payment-term.dto';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { User } from '@prisma/client';
import { ClerkAuthGuard } from '../auth/guards/clerk-auth.guard';
import { PaymentTermsService } from './payment-term.service';

@Controller('payment-terms')
@UseGuards(ClerkAuthGuard)
export class PaymentTermsController {
  constructor(private readonly paymentTermsService: PaymentTermsService) {}

  @Post()
  create(@Body() dto: CreatePaymentTermDto, @CurrentUser() user: User) {
    return this.paymentTermsService.create(dto, user.tenantId || '');
  }

  @Get()
  findAll(
    @CurrentUser() user: User,
    @Query('type') type?: 'PAYABLE' | 'RECEIVABLE',
  ) {
    return this.paymentTermsService.findAll(user.tenantId || '', type);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUser() user: User) {
    return this.paymentTermsService.findOne(id, user.tenantId || '');
  }

  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUser() user: User) {
    return this.paymentTermsService.remove(id, user.tenantId || '');
  }
}
