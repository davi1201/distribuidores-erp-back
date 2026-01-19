import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  UseGuards,
  Query,
  Patch,
} from '@nestjs/common';
import { FinancialService } from './financial.service';
import { CreateTitleDto } from './dto/create-title.dto';
import { RegisterPaymentDto } from './dto/register-payment.dto';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { User } from '@prisma/client'; // Importa a tipagem do Prisma
// Ajuste o import do Guard conforme sua estrutura (ClerkAuthGuard ou JwtAuthGuard)
import { ClerkAuthGuard } from 'src/auth/guards/clerk-auth.guard';

@Controller('financial')
@UseGuards(ClerkAuthGuard)
export class FinancialController {
  constructor(private readonly financialService: FinancialService) {}

  // --- CRIAÇÃO UNIFICADA (Pagar e Receber) ---
  @Post('titles')
  create(@Body() dto: CreateTitleDto, @CurrentUser() user: User) {
    // Passamos user.id como terceiro argumento para o campo createdById
    return this.financialService.createTitle(dto, user.tenantId || '', user.id);
  }

  // --- REGISTRAR MOVIMENTAÇÃO (Pagamento ou Recebimento) ---
  @Post('movements') // Renomeado de 'payments' para ser mais genérico, mas pode manter se preferir
  registerMovement(@Body() dto: RegisterPaymentDto, @CurrentUser() user: User) {
    return this.financialService.registerMovement(
      dto,
      user.tenantId || '',
      user,
    );
  }

  // --- CONCILIAÇÃO BANCÁRIA (Novo) ---
  @Post('movements/reconcile')
  reconcile(
    @Body() body: { movementIds: string[] },
    @CurrentUser() user: User,
  ) {
    return this.financialService.reconcileMovements(
      body.movementIds,
      user.tenantId || '',
    );
  }

  // --- LISTAGEM COM NOVOS FILTROS ---
  @Get('titles')
  findAll(
    @CurrentUser() user: User,
    @Query('type') type?: 'RECEIVABLE' | 'PAYABLE', // Novo filtro
    @Query('status') status?: string,
    @Query('customerId') customerId?: string,
    @Query('supplierId') supplierId?: string, // Novo filtro
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.financialService.findAll(user.tenantId || '', user, {
      type,
      status,
      customerId,
      supplierId,
      startDate,
      endDate,
    });
  }

  @Get('payment-methods')
  findPaymentMethods(@CurrentUser() user: User) {
    return this.financialService.findAllPaymentMethods(user.tenantId ?? '');
  }
  // --- DETALHES ---
  // Certifique-se de que o método findOne existe no seu service (ele estava no original, mas se perdeu na refatoração, precisa ser mantido/readicionado)
  /*
  @Get('titles/:id')
  findOne(@Param('id') id: string, @CurrentUser() user: User) {
    return this.financialService.findOne(id, user.tenantId || '');
  }
  */
}
