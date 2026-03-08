import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  StockRepository,
  WarehouseEntity,
  StockMovementEntity,
  StockTransferEntity,
  CreateWarehouseInput,
  UpdateWarehouseInput,
  CreateStockMovementInput,
  CreateStockTransferInput,
  WarehouseFilter,
  StockMovementFilter,
  StockTransferFilter,
} from '../../../core/application/ports/repositories/stock.repository';
import { PaginationResult } from '../../../core/application/ports/repositories/base.repository';
import {
  StockMovementType as PrismaStockMovementType,
  TransferStatus as PrismaTransferStatus,
  Warehouse,
  StockMovement,
  StockTransfer,
  StockItem,
  Prisma,
} from '@prisma/client';
import { StockMovementType, TransferStatus } from '../../../core/domain/enums';
import { toNumber } from '../../../core/utils';

type WarehouseWithRelations = Warehouse & {
  responsibleUser?: { id: string; name: string } | null;
  stockItems?: StockItem[];
};

type StockMovementWithRelations = StockMovement & {
  product?: { id: string; name: string };
  fromWarehouse?: Warehouse | null;
  toWarehouse?: Warehouse | null;
};

type StockTransferWithRelations = StockTransfer & {
  origin?: Warehouse;
  destination?: Warehouse;
  requester?: { id: string; name: string };
  items?: Array<{
    id: string;
    productId: string;
    quantity: import('@prisma/client/runtime/library').Decimal;
    product?: { id: string; name: string };
  }>;
};

@Injectable()
export class PrismaStockRepository implements StockRepository {
  constructor(private readonly prisma: PrismaService) {}

  // ---------------------------------------------------------------------------
  // Warehouse Methods
  // ---------------------------------------------------------------------------
  async findWarehouseById(id: string): Promise<WarehouseEntity | null> {
    const warehouse = await this.prisma.warehouse.findUnique({
      where: { id },
      include: this.warehouseIncludes(),
    });
    return warehouse ? this.mapWarehouseToEntity(warehouse) : null;
  }

  async findAllWarehouses(
    tenantId: string,
    filter?: WarehouseFilter,
  ): Promise<PaginationResult<WarehouseEntity>> {
    const where: Prisma.WarehouseWhereInput = { tenantId };

    if (filter?.search) {
      where.name = { contains: filter.search, mode: 'insensitive' };
    }
    if (filter?.responsibleUserId) {
      where.responsibleUserId = filter.responsibleUserId;
    }

    const page = filter?.page ?? 1;
    const limit = filter?.limit ?? 20;
    const skip = (page - 1) * limit;

    const [warehouses, total] = await Promise.all([
      this.prisma.warehouse.findMany({
        where,
        include: this.warehouseIncludes(),
        skip,
        take: limit,
        orderBy: { name: 'asc' },
      }),
      this.prisma.warehouse.count({ where }),
    ]);

    const totalPages = Math.ceil(total / limit);

    return {
      data: warehouses.map((w) => this.mapWarehouseToEntity(w)),
      total,
      page,
      limit,
      totalPages,
      hasNextPage: page < totalPages,
      hasPreviousPage: page > 1,
    };
  }

  async createWarehouse(input: CreateWarehouseInput): Promise<WarehouseEntity> {
    const warehouse = await this.prisma.warehouse.create({
      data: {
        tenantId: input.tenantId,
        name: input.name,
        isDefault: input.isDefault ?? false,
        responsibleUserId: input.responsibleUserId,
      },
      include: this.warehouseIncludes(),
    });
    return this.mapWarehouseToEntity(warehouse);
  }

  async updateWarehouse(
    id: string,
    input: UpdateWarehouseInput,
  ): Promise<WarehouseEntity> {
    const warehouse = await this.prisma.warehouse.update({
      where: { id },
      data: {
        name: input.name,
        isDefault: input.isDefault,
        responsibleUserId: input.responsibleUserId,
      },
      include: this.warehouseIncludes(),
    });
    return this.mapWarehouseToEntity(warehouse);
  }

  async deleteWarehouse(id: string): Promise<void> {
    await this.prisma.warehouse.delete({ where: { id } });
  }

  async getDefaultWarehouse(tenantId: string): Promise<WarehouseEntity | null> {
    const warehouse = await this.prisma.warehouse.findFirst({
      where: { tenantId, isDefault: true },
      include: this.warehouseIncludes(),
    });
    return warehouse ? this.mapWarehouseToEntity(warehouse) : null;
  }

  // ---------------------------------------------------------------------------
  // Stock Methods
  // ---------------------------------------------------------------------------
  async getStock(
    warehouseId: string,
    productId: string,
  ): Promise<{ quantity: number }> {
    const stockItem = await this.prisma.stockItem.findUnique({
      where: {
        productId_warehouseId: { productId, warehouseId },
      },
    });
    return { quantity: toNumber(stockItem?.quantity ?? 0) };
  }

  async updateStock(
    warehouseId: string,
    productId: string,
    quantity: number,
  ): Promise<void> {
    await this.prisma.stockItem.upsert({
      where: {
        productId_warehouseId: { productId, warehouseId },
      },
      create: {
        productId,
        warehouseId,
        quantity,
      },
      update: {
        quantity,
      },
    });
  }

  // ---------------------------------------------------------------------------
  // Stock Movement Methods
  // ---------------------------------------------------------------------------
  async createMovement(
    input: CreateStockMovementInput,
  ): Promise<StockMovementEntity> {
    const movement = await this.prisma.stockMovement.create({
      data: {
        tenantId: input.tenantId,
        productId: input.productId,
        type: input.type as unknown as PrismaStockMovementType,
        reason: input.reason,
        quantity: input.quantity,
        costPrice: input.costPrice ?? 0,
        balanceAfter: input.balanceAfter,
        userId: input.userId,
        fromWarehouseId: input.fromWarehouseId,
        toWarehouseId: input.toWarehouseId,
      },
      include: this.movementIncludes(),
    });
    return this.mapMovementToEntity(movement);
  }

  async findMovementsByProduct(
    tenantId: string,
    productId: string,
    filter?: StockMovementFilter,
  ): Promise<PaginationResult<StockMovementEntity>> {
    const where: Prisma.StockMovementWhereInput = { tenantId, productId };

    if (filter?.type) {
      where.type = filter.type as unknown as PrismaStockMovementType;
    }
    if (filter?.fromWarehouseId) {
      where.fromWarehouseId = filter.fromWarehouseId;
    }
    if (filter?.toWarehouseId) {
      where.toWarehouseId = filter.toWarehouseId;
    }
    if (filter?.dateFrom || filter?.dateTo) {
      where.createdAt = {};
      if (filter.dateFrom) where.createdAt.gte = filter.dateFrom;
      if (filter.dateTo) where.createdAt.lte = filter.dateTo;
    }

    const page = filter?.page ?? 1;
    const limit = filter?.limit ?? 20;
    const skip = (page - 1) * limit;

    const [movements, total] = await Promise.all([
      this.prisma.stockMovement.findMany({
        where,
        include: this.movementIncludes(),
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.stockMovement.count({ where }),
    ]);

    const totalPages = Math.ceil(total / limit);

    return {
      data: movements.map((m) => this.mapMovementToEntity(m)),
      total,
      page,
      limit,
      totalPages,
      hasNextPage: page < totalPages,
      hasPreviousPage: page > 1,
    };
  }

  async findMovementsByWarehouse(
    tenantId: string,
    warehouseId: string,
    filter?: StockMovementFilter,
  ): Promise<PaginationResult<StockMovementEntity>> {
    const where: Prisma.StockMovementWhereInput = {
      tenantId,
      OR: [{ fromWarehouseId: warehouseId }, { toWarehouseId: warehouseId }],
    };

    if (filter?.type) {
      where.type = filter.type as unknown as PrismaStockMovementType;
    }
    if (filter?.dateFrom || filter?.dateTo) {
      where.createdAt = {};
      if (filter.dateFrom) where.createdAt.gte = filter.dateFrom;
      if (filter.dateTo) where.createdAt.lte = filter.dateTo;
    }

    const page = filter?.page ?? 1;
    const limit = filter?.limit ?? 20;
    const skip = (page - 1) * limit;

    const [movements, total] = await Promise.all([
      this.prisma.stockMovement.findMany({
        where,
        include: this.movementIncludes(),
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.stockMovement.count({ where }),
    ]);

    const totalPages2 = Math.ceil(total / limit);

    return {
      data: movements.map((m) => this.mapMovementToEntity(m)),
      total,
      page,
      limit,
      totalPages: totalPages2,
      hasNextPage: page < totalPages2,
      hasPreviousPage: page > 1,
    };
  }

  // ---------------------------------------------------------------------------
  // Stock Transfer Methods
  // ---------------------------------------------------------------------------
  async createTransfer(
    input: CreateStockTransferInput,
  ): Promise<StockTransferEntity> {
    const transfer = await this.prisma.stockTransfer.create({
      data: {
        tenantId: input.tenantId,
        requesterId: input.requesterId,
        originId: input.originWarehouseId,
        destinationId: input.destinationWarehouseId,
        status: PrismaTransferStatus.PENDING,
        items: {
          create: input.items.map((item) => ({
            productId: item.productId,
            quantity: item.quantity,
          })),
        },
      },
      include: this.transferIncludes(),
    });
    return this.mapTransferToEntity(transfer);
  }

  async findTransfersByTenant(
    tenantId: string,
    filter?: StockTransferFilter,
  ): Promise<PaginationResult<StockTransferEntity>> {
    const where: Prisma.StockTransferWhereInput = { tenantId };

    if (filter?.status) {
      where.status = filter.status as PrismaTransferStatus;
    }
    if (filter?.originWarehouseId) {
      where.originId = filter.originWarehouseId;
    }
    if (filter?.destinationWarehouseId) {
      where.destinationId = filter.destinationWarehouseId;
    }

    const page = filter?.page ?? 1;
    const limit = filter?.limit ?? 20;
    const skip = (page - 1) * limit;

    const [transfers, total] = await Promise.all([
      this.prisma.stockTransfer.findMany({
        where,
        include: this.transferIncludes(),
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.stockTransfer.count({ where }),
    ]);

    const totalPages3 = Math.ceil(total / limit);

    return {
      data: transfers.map((t) => this.mapTransferToEntity(t)),
      total,
      page,
      limit,
      totalPages: totalPages3,
      hasNextPage: page < totalPages3,
      hasPreviousPage: page > 1,
    };
  }

  async updateTransferStatus(
    id: string,
    status: TransferStatus,
    userId?: string,
  ): Promise<StockTransferEntity> {
    const updateData: Prisma.StockTransferUpdateInput = {
      status: status as unknown as PrismaTransferStatus,
    };

    if (status === TransferStatus.APPROVED && userId) {
      updateData.approvedBy = { connect: { id: userId } };
    }
    if (status === TransferStatus.COMPLETED && userId) {
      updateData.receivedBy = { connect: { id: userId } };
    }

    const transfer = await this.prisma.stockTransfer.update({
      where: { id },
      data: updateData,
      include: this.transferIncludes(),
    });
    return this.mapTransferToEntity(transfer);
  }

  // ---------------------------------------------------------------------------
  // Private Helpers
  // ---------------------------------------------------------------------------
  private warehouseIncludes() {
    return {
      responsibleUser: { select: { id: true, name: true } },
      stockItems: true,
    };
  }

  private movementIncludes() {
    return {
      product: { select: { id: true, name: true } },
      fromWarehouse: true,
      toWarehouse: true,
    };
  }

  private transferIncludes() {
    return {
      origin: true,
      destination: true,
      requester: { select: { id: true, name: true } },
      items: {
        include: {
          product: { select: { id: true, name: true } },
        },
      },
    };
  }

  private mapWarehouseToEntity(
    warehouse: WarehouseWithRelations,
  ): WarehouseEntity {
    return {
      id: warehouse.id,
      tenantId: warehouse.tenantId,
      name: warehouse.name,
      isDefault: warehouse.isDefault,
      responsibleUserId: warehouse.responsibleUserId ?? undefined,
      responsibleUserName: warehouse.responsibleUser?.name ?? undefined,
      createdAt: warehouse.createdAt,
      updatedAt: warehouse.updatedAt,
    };
  }

  private mapMovementToEntity(
    movement: StockMovementWithRelations,
  ): StockMovementEntity {
    return {
      id: movement.id,
      tenantId: movement.tenantId,
      productId: movement.productId,
      productName: movement.product?.name ?? undefined,
      type: movement.type as unknown as StockMovementType,
      reason: movement.reason,
      quantity: toNumber(movement.quantity),
      costPrice: toNumber(movement.costPrice),
      balanceAfter: toNumber(movement.balanceAfter),
      fromWarehouseId: movement.fromWarehouseId ?? undefined,
      fromWarehouseName: movement.fromWarehouse?.name ?? undefined,
      toWarehouseId: movement.toWarehouseId ?? undefined,
      toWarehouseName: movement.toWarehouse?.name ?? undefined,
      userId: movement.userId ?? undefined,
      createdAt: movement.createdAt,
    };
  }

  private mapTransferToEntity(
    transfer: StockTransferWithRelations,
  ): StockTransferEntity {
    return {
      id: transfer.id,
      code: transfer.code,
      tenantId: transfer.tenantId,
      status: transfer.status as unknown as TransferStatus,
      requesterId: transfer.requesterId,
      requesterName: transfer.requester?.name ?? undefined,
      originWarehouseId: transfer.originId,
      originWarehouseName: transfer.origin?.name ?? undefined,
      destinationWarehouseId: transfer.destinationId,
      destinationWarehouseName: transfer.destination?.name ?? undefined,
      items:
        transfer.items?.map((item) => ({
          id: item.id,
          productId: item.productId,
          productName: item.product?.name ?? '',
          quantity: toNumber(item.quantity),
        })) ?? [],
      createdAt: transfer.createdAt,
      updatedAt: transfer.updatedAt,
    };
  }
}
