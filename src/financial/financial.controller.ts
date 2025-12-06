import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  UseGuards,
  Query,
} from '@nestjs/common';
import { FinancialService } from './financial.service';
import { CreateTitleDto } from './dto/create-title.dto';
import { RegisterPaymentDto } from './dto/register-payment.dto';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { CurrentUser } from 'src/auth/decorators/current-user.decorator';
import type { User } from '@prisma/client';

@Controller('financial')
@UseGuards(JwtAuthGuard)
export class FinancialController {
  constructor(private readonly financialService: FinancialService) {}

  @Post('titles')
  create(@Body() dto: CreateTitleDto, @CurrentUser() user: User) {
    return this.financialService.createReceivable(dto, user.tenantId || '');
  }

  @Post('payments')
  pay(@Body() dto: RegisterPaymentDto, @CurrentUser() user: User) {
    return this.financialService.registerPayment(
      dto,
      user.tenantId || '',
      user,
    );
  }

  @Get('titles')
  findAll(
    @CurrentUser() user: User,
    @Query('status') status?: string,
    @Query('customerId') customerId?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.financialService.findAll(user.tenantId || '', user, {
      status,
      customerId,
      startDate,
      endDate,
    });
  }

  @Get('titles/:id')
  findOne(@Param('id') id: string, @CurrentUser() user: User) {
    return this.financialService.findOne(id, user.tenantId || '');
  }
}
