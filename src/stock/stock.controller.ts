import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { StockService } from './stock.service';
import { CreateStockMovementDto } from './dto/create-movement.dto';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { CurrentUser } from 'src/auth/decorators/current-user.decorator';
import type { User } from '@prisma/client';

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
}
