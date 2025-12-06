import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import {
  CreateStockMovementDto,
  MovementType,
} from './dto/create-movement.dto';

@Injectable()
export class StockService {
  constructor(private readonly prisma: PrismaService) {}

  // --- 1. HELPER: BUSCAR OU CRIAR MATRIZ ---
  async getOrCreateDefaultWarehouse(tenantId: string) {
    const defaultWh = await this.prisma.warehouse.findFirst({
      where: { tenantId, isDefault: true },
    });

    if (defaultWh) return defaultWh;

    const anyWh = await this.prisma.warehouse.findFirst({
      where: { tenantId },
      orderBy: { createdAt: 'asc' },
    });

    if (anyWh) return anyWh;

    return this.prisma.warehouse.create({
      data: {
        tenantId,
        name: 'Depósito Principal (Matriz)',
        isDefault: true,
      },
    });
  }

  // --- 2. LISTAR DEPÓSITOS (Necessário para o Select do Front) ---
  async getWarehouses(tenantId: string) {
    // Garante que a matriz existe antes de listar
    await this.getOrCreateDefaultWarehouse(tenantId);

    return this.prisma.warehouse.findMany({
      where: { tenantId },
      orderBy: { isDefault: 'desc' }, // Matriz primeiro
      include: {
        responsibleUser: { select: { name: true, email: true } }, // Mostra quem é o dono se houver
      },
    });
  }

  // --- 3. CRIAR DEPÓSITO (Genérico ou Vendedor) ---
  async createWarehouse(
    tenantId: string,
    name: string,
    responsibleUserId?: string,
  ) {
    // Se for vinculado a um usuário, verifica se ele já tem um depósito
    if (responsibleUserId) {
      const existing = await this.prisma.warehouse.findFirst({
        where: { tenantId, responsibleUserId },
      });

      if (existing) {
        // Se já existe, retorna o existente para não duplicar
        return existing;
      }
    }

    return this.prisma.warehouse.create({
      data: {
        tenantId,
        name,
        responsibleUserId: responsibleUserId || null,
        isDefault: false,
      },
    });
  }

  // --- 4. ENTRADA/SAÍDA DE ESTOQUE (KARDEX) ---
  async registerMovement(
    dto: CreateStockMovementDto,
    tenantId: string,
    userId: string,
  ) {
    const warehouse = await this.getOrCreateDefaultWarehouse(tenantId);

    let stockItem = await this.prisma.stockItem.findUnique({
      where: {
        productId_warehouseId: {
          productId: dto.productId,
          warehouseId: warehouse.id,
        },
      },
    });

    if (!stockItem) {
      stockItem = await this.prisma.stockItem.create({
        data: {
          productId: dto.productId,
          warehouseId: warehouse.id,
          quantity: 0,
          minStock: 0,
        },
      });
    }

    const moveQty = Number(dto.quantity);

    // Validação prévia de saldo (para UX, a validação real ocorre no DB)
    if (
      dto.type === MovementType.EXIT &&
      Number(stockItem.quantity) < moveQty
    ) {
      throw new BadRequestException(
        `Saldo insuficiente na ${warehouse.name}. Atual: ${Number(stockItem.quantity)}, Saída: ${moveQty}`,
      );
    }

    return this.prisma.$transaction(async (tx) => {
      // Uso de increment/decrement para concorrência segura
      const operation =
        dto.type === MovementType.ENTRY
          ? { increment: moveQty }
          : { decrement: moveQty };

      const updatedStock = await tx.stockItem.update({
        where: { id: stockItem.id },
        data: { quantity: operation },
      });

      if (Number(updatedStock.quantity) < 0) {
        throw new BadRequestException(
          `Saldo insuficiente na ${warehouse.name}.`,
        );
      }

      const product = await tx.product.findUnique({
        where: { id: dto.productId },
      });

      const movement = await tx.stockMovement.create({
        data: {
          tenantId,
          productId: dto.productId,
          type: dto.type,
          quantity: moveQty,
          reason: dto.documentReference
            ? `${dto.reason} (Ref: ${dto.documentReference})`
            : dto.reason,
          costPrice: product?.costPrice || 0,
          balanceAfter: updatedStock.quantity,
          userId,
          toWarehouseId: dto.type === MovementType.ENTRY ? warehouse.id : null,
          fromWarehouseId: dto.type === MovementType.EXIT ? warehouse.id : null,
        },
      });

      return { movement, newBalance: updatedStock.quantity };
    });
  }

  // --- 5. TRANSFERÊNCIA (DISTRIBUIÇÃO) ---
  async transferStock(
    tenantId: string,
    userId: string,
    data: {
      productId: string;
      fromWarehouseId: string;
      toWarehouseId: string;
      quantity: number;
      reason?: string;
    },
  ) {
    const qty = Number(data.quantity);
    if (qty <= 0)
      throw new BadRequestException('Quantidade deve ser positiva.');

    // Validação de Existência
    const [destinationWarehouse, product] = await Promise.all([
      this.prisma.warehouse.findUnique({ where: { id: data.toWarehouseId } }),
      this.prisma.product.findUnique({
        where: { id: data.productId },
        select: { costPrice: true },
      }),
    ]);

    if (!destinationWarehouse || destinationWarehouse.tenantId !== tenantId) {
      throw new NotFoundException('Depósito de destino não encontrado.');
    }

    return this.prisma.$transaction(async (tx) => {
      // A. Busca Saldo na Origem
      const sourceItem = await tx.stockItem.findUnique({
        where: {
          productId_warehouseId: {
            productId: data.productId,
            warehouseId: data.fromWarehouseId,
          },
        },
        include: { warehouse: true },
      });

      if (!sourceItem || Number(sourceItem.quantity) < qty) {
        throw new BadRequestException(
          `Saldo insuficiente na origem (${sourceItem?.warehouse?.name || 'Origem'}). Disponível: ${Number(sourceItem?.quantity || 0)}`,
        );
      }

      // B. Decrementa Origem
      const updatedSource = await tx.stockItem.update({
        where: { id: sourceItem.id },
        data: { quantity: { decrement: qty } },
      });

      // C. Incrementa Destino (Lógica Manual para evitar erro 42P10 se faltar índice)
      // O upsert falhava porque o banco não tinha o índice unique(productId, warehouseId)
      const destinationItem = await tx.stockItem.findUnique({
        where: {
          productId_warehouseId: {
            productId: data.productId,
            warehouseId: data.toWarehouseId,
          },
        },
      });

      if (destinationItem) {
        // Se já existe, atualiza
        await tx.stockItem.update({
          where: { id: destinationItem.id },
          data: { quantity: { increment: qty } },
        });
      } else {
        // Se não existe, cria
        await tx.stockItem.create({
          data: {
            productId: data.productId,
            warehouseId: data.toWarehouseId,
            quantity: qty,
            minStock: 0,
          },
        });
      }

      // D. Histórico
      await tx.stockMovement.create({
        data: {
          tenantId,
          productId: data.productId,
          type: MovementType.TRANSFER, // Saiu da origem (Transferência é uma saída + entrada implícita)
          quantity: qty,
          reason: data.reason || 'Transferência entre estoques',
          fromWarehouseId: data.fromWarehouseId,
          toWarehouseId: data.toWarehouseId,
          userId,
          costPrice: product?.costPrice || 0,
          balanceAfter: updatedSource.quantity, // Saldo remanescente na origem
        },
      });
    });
  }

  // --- 6. CONSULTAS ---
  async getProductHistory(productId: string, tenantId: string) {
    return this.prisma.stockMovement.findMany({
      where: { productId, tenantId },
      orderBy: { createdAt: 'desc' },
      include: {
        user: { select: { name: true } },
        fromWarehouse: { select: { name: true } },
        toWarehouse: { select: { name: true } },
      },
      take: 50,
    });
  }

  async getBalance(productId: string, tenantId: string) {
    const items = await this.prisma.stockItem.findMany({
      where: { product: { id: productId, tenantId } },
      include: {
        warehouse: true,
        product: { select: { name: true, sku: true, unit: true } },
      },
    });

    return items;
  }
}
