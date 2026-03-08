import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ClerkAuthGuard } from '../../../../auth/guards/clerk-auth.guard';
import { TenantGuard } from '../../../../common/guards/tenant.guard';
import { TenantRequired } from '../../../../common/decorators/tenant-required.decorator';
import { CurrentUser } from '../../../../auth/decorators/current-user.decorator';
import { AuthenticatedUser } from '../../../../common/interfaces/authenticated-user.interface';

import { CreateTitleUseCase } from '../../application/use-cases/create-title.use-case';
import { RegisterPaymentUseCase } from '../../application/use-cases/register-payment.use-case';
import { ListTitlesUseCase } from '../../application/use-cases/list-titles.use-case';

import { CreateTitleDto } from '../../application/dtos/create-title.dto';
import { RegisterPaymentDto } from '../../application/dtos/register-payment.dto';
import { ListTitlesQueryDto } from '../../application/dtos/list-titles-query.dto';

@Controller('financial/titles')
@UseGuards(ClerkAuthGuard, TenantGuard)
@TenantRequired()
export class FinancialTitlesController {
  constructor(
    private readonly createTitleUseCase: CreateTitleUseCase,
    private readonly registerPaymentUseCase: RegisterPaymentUseCase,
    private readonly listTitlesUseCase: ListTitlesUseCase,
  ) {}

  @Get()
  async list(
    @Query() query: ListTitlesQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.listTitlesUseCase.execute({
      tenantId: user.tenantId!,
      type: query.type,
      status: query.status,
      categoryId: query.categoryId,
      customerId: query.customerId,
      supplierId: query.supplierId,
      dueDateFrom: query.dueDateFrom ? new Date(query.dueDateFrom) : undefined,
      dueDateTo: query.dueDateTo ? new Date(query.dueDateTo) : undefined,
      search: query.search,
      page: query.page,
      limit: query.limit,
      orderBy: query.orderBy,
      orderDirection: query.orderDirection,
    });
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Body() dto: CreateTitleDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.createTitleUseCase.execute({
      tenantId: user.tenantId!,
      userId: user.id,
      type: dto.type,
      description: dto.description,
      amount: dto.amount,
      dueDate: new Date(dto.dueDate),
      categoryId: dto.categoryId,
      customerId: dto.customerId,
      supplierId: dto.supplierId,
    });
  }

  @Post('payments')
  @HttpCode(HttpStatus.OK)
  async registerPayment(
    @Body() dto: RegisterPaymentDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.registerPaymentUseCase.execute({
      tenantId: user.tenantId!,
      userId: user.id,
      titleId: dto.titleId,
      amount: dto.amount,
      paymentDate: dto.paymentDate ? new Date(dto.paymentDate) : new Date(),
      description: dto.description,
      discountAmount: dto.discountAmount,
      interestAmount: dto.interestAmount,
      fineAmount: dto.fineAmount,
    });
  }
}
