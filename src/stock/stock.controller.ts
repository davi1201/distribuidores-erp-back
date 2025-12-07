import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { StockService } from './stock.service';
import { CreateStockMovementDto } from './dto/create-movement.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { User } from '@prisma/client';
import { TransferStockDto } from './dto/transfer-stock.dto';
import { CreateWarehouseDto } from './dto/create-warehouse.dto';

@Controller('stock')
@UseGuards(JwtAuthGuard)
export class StockController {
  constructor(private readonly stockService: StockService) {}

  // Registrar Entrada/Saída
  @Post('movement')
  async createMovement(
    @Body() dto: CreateStockMovementDto,
    @CurrentUser() user: User,
  ) {
    return this.stockService.registerMovement(
      dto,
      user.tenantId || '',
      user.id,
    );
  }

  @Post('transfer')
  async transferStock(
    @Body() dto: TransferStockDto,
    @CurrentUser() user: User,
  ) {
    return this.stockService.transferStock(user.tenantId ?? '', user.id, dto);
  }

  // 3. Criar Depósito Móvel (Geralmente chamado ao cadastrar um vendedor)
  @Post('warehouses')
  async createMobileWarehouse(
    @Body() dto: CreateWarehouseDto,
    @CurrentUser() user: User,
  ) {
    return this.stockService.createWarehouse(
      user.tenantId ?? '',
      dto.name,
      dto.userId,
    );
  }

  // Pegar Extrato de um Produto
  @Get('product/:id/history')
  async getHistory(@Param('id') productId: string, @CurrentUser() user: User) {
    return this.stockService.getProductHistory(productId, user.tenantId || '');
  }

  // Pegar Saldo Rápido
  @Get('product/:id/balance')
  async getBalance(@Param('id') productId: string, @CurrentUser() user: User) {
    return this.stockService.getBalance(productId, user.tenantId || '');
  }

  @Get('warehouses')
  async getWarehouses(@CurrentUser() user: User) {
    return this.stockService.getWarehouses(user.tenantId || '');
  }
}
