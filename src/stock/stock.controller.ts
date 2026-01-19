import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { StockService } from './stock.service';
import { CreateStockMovementDto } from './dto/create-movement.dto';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { User } from '@prisma/client';
import { CreateWarehouseDto } from './dto/create-warehouse.dto';
import { CreateTransferDto } from './dto/create-transfer.dto';
import { ClerkAuthGuard } from 'src/auth/guards/clerk-auth.guard';

@Controller('stock')
@UseGuards(ClerkAuthGuard)
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

  @Post('transfers')
  createTransfer(@Body() dto: CreateTransferDto, @CurrentUser() user: User) {
    return this.stockService.createTransfer(dto, user.id, user.tenantId || '');
  }

  @Get('transfers')
  findAllTransfers(@CurrentUser() user: User) {
    
    return this.stockService.findAllTransfers(user, user.tenantId || '');
  }

  @Patch('transfers/:id/approve')
  approveTransfer(@Param('id') id: string, @CurrentUser() user: User) {
    // Verificar permissão ADMIN/MANAGER
    return this.stockService.approveTransfer(id, user.id);
  }

  @Patch('transfers/:id/complete')
  completeTransfer(@Param('id') id: string, @CurrentUser() user) {
    return this.stockService.completeTransfer(id, user.id);
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
    return this.stockService.getWarehouses(user);
  }

  @Get('products')
  findAll(
    @CurrentUser() user: User,
    @Query('warehouseId') warehouseId?: string,
    @Query('search') search?: string,
  ) {
    return this.stockService.findStockByWarehouse(
      user.tenantId || '',
      warehouseId,
      search,
    );
  }
}
