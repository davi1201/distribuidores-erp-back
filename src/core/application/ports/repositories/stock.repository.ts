import { PaginationResult } from './base.repository';
import { StockMovementType, TransferStatus } from '../../../domain/enums';

// ============================================================================
// ENTIDADES
// ============================================================================
export interface WarehouseEntity {
  id: string;
  tenantId: string;
  name: string;
  isDefault: boolean;
  responsibleUserId?: string;
  responsibleUserName?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface StockMovementEntity {
  id: string;
  tenantId: string;
  productId: string;
  productName?: string;
  type: StockMovementType;
  reason: string;
  quantity: number;
  costPrice: number;
  balanceAfter: number;
  fromWarehouseId?: string;
  fromWarehouseName?: string;
  toWarehouseId?: string;
  toWarehouseName?: string;
  userId?: string;
  createdAt: Date;
}

export interface StockTransferItemEntity {
  id: string;
  productId: string;
  productName: string;
  quantity: number;
}

export interface StockTransferEntity {
  id: string;
  code: number;
  tenantId: string;
  status: TransferStatus;
  requesterId: string;
  requesterName?: string;
  originWarehouseId: string;
  originWarehouseName?: string;
  destinationWarehouseId: string;
  destinationWarehouseName?: string;
  items: StockTransferItemEntity[];
  createdAt: Date;
  updatedAt: Date;
}

// ============================================================================
// INPUTS
// ============================================================================
export interface CreateWarehouseInput {
  tenantId: string;
  name: string;
  isDefault?: boolean;
  responsibleUserId?: string;
}

export interface UpdateWarehouseInput {
  name?: string;
  isDefault?: boolean;
  responsibleUserId?: string;
}

export interface CreateStockMovementInput {
  tenantId: string;
  productId: string;
  type: StockMovementType;
  reason: string;
  quantity: number;
  costPrice?: number;
  balanceAfter: number;
  fromWarehouseId?: string;
  toWarehouseId?: string;
  userId?: string;
}

export interface CreateStockTransferInput {
  tenantId: string;
  requesterId: string;
  originWarehouseId: string;
  destinationWarehouseId: string;
  items: Array<{
    productId: string;
    quantity: number;
  }>;
}

// ============================================================================
// FILTROS
// ============================================================================
export interface WarehouseFilter {
  search?: string;
  responsibleUserId?: string;
  page?: number;
  limit?: number;
}

export interface StockMovementFilter {
  type?: StockMovementType;
  fromWarehouseId?: string;
  toWarehouseId?: string;
  dateFrom?: Date;
  dateTo?: Date;
  page?: number;
  limit?: number;
}

export interface StockTransferFilter {
  status?: TransferStatus;
  originWarehouseId?: string;
  destinationWarehouseId?: string;
  page?: number;
  limit?: number;
}

// ============================================================================
// REPOSITÓRIO
// ============================================================================
export abstract class StockRepository {
  // Warehouse
  abstract findWarehouseById(id: string): Promise<WarehouseEntity | null>;
  abstract findAllWarehouses(
    tenantId: string,
    filter?: WarehouseFilter,
  ): Promise<PaginationResult<WarehouseEntity>>;
  abstract createWarehouse(
    input: CreateWarehouseInput,
  ): Promise<WarehouseEntity>;
  abstract updateWarehouse(
    id: string,
    input: UpdateWarehouseInput,
  ): Promise<WarehouseEntity>;
  abstract deleteWarehouse(id: string): Promise<void>;
  abstract getDefaultWarehouse(
    tenantId: string,
  ): Promise<WarehouseEntity | null>;

  // Stock
  abstract getStock(
    warehouseId: string,
    productId: string,
  ): Promise<{ quantity: number }>;
  abstract updateStock(
    warehouseId: string,
    productId: string,
    quantity: number,
  ): Promise<void>;

  // Movements
  abstract createMovement(
    input: CreateStockMovementInput,
  ): Promise<StockMovementEntity>;
  abstract findMovementsByProduct(
    tenantId: string,
    productId: string,
    filter?: StockMovementFilter,
  ): Promise<PaginationResult<StockMovementEntity>>;
  abstract findMovementsByWarehouse(
    tenantId: string,
    warehouseId: string,
    filter?: StockMovementFilter,
  ): Promise<PaginationResult<StockMovementEntity>>;

  // Transfers
  abstract createTransfer(
    input: CreateStockTransferInput,
  ): Promise<StockTransferEntity>;
  abstract findTransfersByTenant(
    tenantId: string,
    filter?: StockTransferFilter,
  ): Promise<PaginationResult<StockTransferEntity>>;
  abstract updateTransferStatus(
    id: string,
    status: TransferStatus,
    userId?: string,
  ): Promise<StockTransferEntity>;
}
