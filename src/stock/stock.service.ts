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
import { User } from '@prisma/client';

@Injectable()
export class StockService {
  constructor(private readonly prisma: PrismaService) {}

  // --- REGISTRAR MOVIMENTAÇÃO (KARDEX) ---
  async registerMovement(
    dto: CreateStockMovementDto,
    tenantId: string,
    userId: string,
  ) {
    // 1. Busca o Produto e seu Estoque Atual
    const product = await this.prisma.product.findUnique({
      where: { id: dto.productId },
      include: { stock: true }, // Traz o StockItem atual
    });

    if (!product || product.tenantId !== tenantId) {
      throw new NotFoundException('Produto não encontrado.');
    }

    // Garante que existe registro na tabela stock_items (Se não, cria zerado)
    // Isso previne erros se o produto foi criado sem inicializar estoque
    let stockItem = product.stock[0];
    if (!stockItem) {
      stockItem = await this.prisma.stockItem.create({
        data: { productId: product.id, quantity: 0, minStock: 0 },
      });
    }

    // 2. Lógica de Cálculo
    const currentQty = Number(stockItem.quantity);
    const moveQty = Number(dto.quantity);
    let newQty = currentQty;

    if (dto.type === MovementType.ENTRY) {
      newQty = currentQty + moveQty;
    } else {
      newQty = currentQty - moveQty;

      // Validação de Estoque Negativo (Opcional: remover se permitir negativo)
      if (newQty < 0) {
        throw new BadRequestException(
          `Saldo insuficiente. Atual: ${currentQty}, Tentativa de saída: ${moveQty}`,
        );
      }
    }

    // 3. Transação Atômica (Atualiza Saldo + Cria Histórico)
    return this.prisma.$transaction(async (tx) => {
      // A. Atualiza o saldo atual
      const updatedStock = await tx.stockItem.update({
        where: { id: stockItem.id },
        data: { quantity: newQty },
      });

      // B. Registra no Histórico (Kardex)
      const movement = await tx.stockMovement.create({
        data: {
          tenantId,
          productId: dto.productId,
          type: dto.type,
          quantity: moveQty,
          reason: dto.documentReference
            ? `${dto.reason} (Ref: ${dto.documentReference})`
            : dto.reason,
          costPrice: product.costPrice, // Salva o custo no momento da ação
          balanceAfter: newQty, // Salva quanto ficou depois (fácil auditoria)
          userId,
        },
      });

      return {
        movement,
        newBalance: updatedStock.quantity,
      };
    });
  }

  // --- CONSULTAR EXTRATO (KARDEX) ---
  async getProductHistory(productId: string, tenantId: string) {
    // Valida pertinência
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
    });
    if (!product || product.tenantId !== tenantId) {
      throw new NotFoundException('Produto não encontrado');
    }

    return this.prisma.stockMovement.findMany({
      where: { productId },
      orderBy: { createdAt: 'desc' },
      include: {
        user: { select: { name: true, email: true } }, // Quem fez
      },
      take: 50, // Paginação simples
    });
  }

  // --- CONSULTAR SALDO ATUAL ---
  async getBalance(productId: string, tenantId: string) {
    const item = await this.prisma.stockItem.findFirst({
      where: { product: { id: productId, tenantId } },
      include: { product: { select: { name: true, sku: true, unit: true } } },
    });

    if (!item) throw new NotFoundException('Item de estoque não iniciado.');

    return item;
  }
}
