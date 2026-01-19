import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateStockMovementDto,
  MovementType,
} from './dto/create-movement.dto';
import { CreateTransferDto } from './dto/create-transfer.dto';
import { NotificationsService } from 'src/notifications/notifications.service';

@Injectable()
export class StockService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
  ) {}

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
  async getWarehouses(user: any) {
    const { tenantId, userId } = user;
    // Garante que a matriz existe antes de listar
    await this.getOrCreateDefaultWarehouse(tenantId);

    let whereCondition: any = {};

    if (user.role === 'SELLER') {
      whereCondition = {
        tenantId,
        OR: [
          {
            isDefault: true, // Sempre traz a Matriz
          },
          {
            responsibleUserId: userId,
          },
        ],
      };
    } else {
      whereCondition = { tenantId };
    }

    return this.prisma.warehouse.findMany({
      where: whereCondition,
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

  async findStockByWarehouse(
    tenantId: string,
    warehouseId?: string,
    search?: string,
  ) {
    const whereCondition: any = {
      tenantId,
      isActive: true,
      // FILTRO ESSENCIAL: Ignora produtos que têm filhos (Pais).
      // Resultado: Traz apenas Produtos Simples e Variantes (SKUs finais).
      variants: { none: {} },
      ...(warehouseId
        ? {
            stock: {
              some: { warehouseId },
            },
          }
        : {}),
    };

    // Se tiver busca por texto
    if (search) {
      whereCondition.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { sku: { contains: search, mode: 'insensitive' } },
      ];
    }

    const products = await this.prisma.product.findMany({
      where: whereCondition,
      include: {
        stock: {
          where: warehouseId ? { warehouseId } : undefined,
        },
        images: { take: 1 },
      },
      orderBy: { name: 'asc' },
    });

    return products.map((p) => {
      const totalQty = p.stock.reduce((acc, s) => acc + Number(s.quantity), 0);

      return {
        id: p.id,
        name: p.name,
        sku: p.sku,
        unit: p.unit,
        imageUrl: p.images[0]?.url,
        quantity: totalQty,
        variants: [], // Array vazio pois são itens finais
      };
    });
  }

  async createTransfer(
    dto: CreateTransferDto,
    userId: string,
    tenantId: string,
  ) {
    console.log('user', userId);

    const transfer = await this.prisma.stockTransfer.create({
      data: {
        tenantId,
        requesterId: userId,
        originId: dto.originWarehouseId,
        destinationId: dto.destinationWarehouseId,
        status: 'PENDING',
        items: {
          create: dto.items.map((i) => ({
            productId: i.productId,
            quantity: i.quantity,
          })),
        },
      },
      include: {
        origin: { select: { name: true } },
        destination: { select: { name: true } },
        requester: { select: { name: true } },
      },
    });

    this.notificationsService.send({
      tenantId,
      type: 'stock', // <--- Tipo correto para ícone de caixa/estoque
      title: 'Solicitação de Transferência',
      message: `O vendedor ${transfer.requester.name} está solicitando ajuste de estoque De ${transfer.origin.name} para ${transfer.destination.name}`,
      link: `/registrations/stock?transferId=${transfer.id}`, // Link para a tela de transferências
      actionLabel: 'Analisar',
      metadata: {
        id: transfer.id,
        originId: transfer.originId,
      },
      targetRoles: ['ADMIN', 'OWNER'],
    });

    return transfer;
  }

  async findAllTransfers(user: any, tenantId: string) {
    const whereCondition: any = {
      tenantId, // IMPORTANTE: Sempre filtrar pelo Tenant
    };

    // Se for SELLER, filtrar onde ele pediu OU onde ele é o dono do destino
    if (user.role === 'SELLER') {
      whereCondition.OR = [
        { requesterId: user.id },
        {
          destination: {
            responsibleUserId: user.id,
          },
        },
      ];
    }

    return this.prisma.stockTransfer.findMany({
      where: whereCondition,
      include: {
        origin: { select: { id: true, name: true } },
        destination: { select: { id: true, name: true } },

        requester: { select: { name: true } },

        items: {
          include: {
            product: { select: { name: true, sku: true, unit: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async approveTransfer(transferId: string, userId: string) {
    return this.prisma.$transaction(async (tx) => {
      const transfer = await tx.stockTransfer.findUnique({
        where: { id: transferId },
        include: { items: true, origin: true },
      });

      if (!transfer) {
        throw new NotFoundException('Transferência não encontrada.');
      }

      if (transfer.status !== 'PENDING')
        throw new BadRequestException('Status inválido.');

      // CORREÇÃO: Buscamos quem está aprovando AGORA para pegar o nome
      const approver = await tx.user.findUnique({
        where: { id: userId },
        select: { name: true },
      });

      // 1. Processa cada item (Saída da Origem)
      for (const item of transfer.items) {
        // Verifica saldo na Origem
        const stockOrigin = await tx.stockItem.findUnique({
          where: {
            productId_warehouseId: {
              productId: item.productId,
              warehouseId: transfer.originId,
            },
          },
        });

        if (
          !stockOrigin ||
          Number(stockOrigin.quantity) < Number(item.quantity)
        ) {
          throw new BadRequestException(
            `Saldo insuficiente na origem para o produto ${item.productId}`,
          );
        }

        // Baixa na Origem
        await tx.stockItem.update({
          where: { id: stockOrigin.id },
          data: { quantity: { decrement: item.quantity } },
        });

        // Registra Kardex (SAÍDA DE TRÂNSITO)
        await tx.stockMovement.create({
          data: {
            tenantId: transfer.tenantId,
            productId: item.productId,
            fromWarehouseId: transfer.originId, // Saiu daqui
            type: 'EXIT',
            reason: `Transferência #${transfer.code} (Em Trânsito)`,
            quantity: item.quantity,
            userId,
            balanceAfter: Number(stockOrigin.quantity) - Number(item.quantity),
          },
        });
      }

      this.notificationsService.send({
        tenantId: transfer.tenantId,
        type: 'stock',
        title: 'Pedido de Transferência Aprovado',
        message: `O seu pedido #${transfer.code} de transferência de estoque foi aprovado por ${approver?.name || 'Administrador'}`,
        link: `/registrations/stock`,
        actionLabel: 'Analisar',
        metadata: {
          id: transfer.id,
          originId: transfer.originId,
        },
        targetRoles: ['SELLER'],
      });

      // Atualiza Status
      return tx.stockTransfer.update({
        where: { id: transferId },
        data: {
          status: 'IN_TRANSIT',
          approvedByUserId: userId,
        },
      });
    });
  }

  async completeTransfer(transferId: string, userId: string) {
    return this.prisma.$transaction(async (tx) => {
      const transfer = await tx.stockTransfer.findUnique({
        where: { id: transferId },
        include: { items: true, destination: true },
      });

      if (!transfer) {
        throw new NotFoundException('Transferência não encontrada.');
      }

      if (transfer.status !== 'IN_TRANSIT')
        throw new BadRequestException('Transferência não está em trânsito.');

      // 1. Processa cada item (Entrada no Destino)
      for (const item of transfer.items) {
        // Busca ou Cria StockItem no Destino
        const stockDest = await tx.stockItem.upsert({
          where: {
            productId_warehouseId: {
              productId: item.productId,
              warehouseId: transfer.destinationId,
            },
          },
          create: {
            productId: item.productId,
            warehouseId: transfer.destinationId,
            quantity: item.quantity,
            minStock: 0,
            maxStock: 0,
          },
          update: {
            quantity: { increment: item.quantity },
          },
        });

        // Registra Kardex (ENTRADA DE TRÂNSITO)
        await tx.stockMovement.create({
          data: {
            tenantId: transfer.tenantId,
            productId: item.productId,
            toWarehouseId: transfer.destinationId, // Entrou aqui
            type: 'ENTRY',
            reason: `Recebimento Transferência #${transfer.code}`,
            quantity: item.quantity,
            userId,
            balanceAfter: Number(stockDest.quantity),
          },
        });
      }

      // Finaliza
      return tx.stockTransfer.update({
        where: { id: transferId },
        data: {
          status: 'COMPLETED',
          receivedByUserId: userId,
        },
      });
    });
  }

  async updateStockByProductId(
    productId: string,
    warehouseId: string,
    quantity: number,
    reason: string,
    userId: string,
    tenantId: string,
  ) {
    const stockItems = await this.prisma.stockItem.findMany({
      where: { productId, warehouseId: warehouseId },
    });

    return this.prisma.$transaction(
      stockItems.map(
        (item) =>
          this.prisma.stockItem.update({
            where: { id: item.id },
            data: { quantity: quantity + Number(item.quantity) },
          }),

        this.prisma.stockMovement.create({
          data: {
            tenantId,
            productId,
            type: MovementType.ENTRY,
            quantity,
            reason: reason || 'Ajuste',
            costPrice: 0,
            balanceAfter: quantity,
            userId,
          },
        }),
      ),
    );
  }
}
