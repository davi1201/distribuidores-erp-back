import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateOrderDto } from './dto/create-sale.dto';
import { FinancialService } from '../financial/financial.service';
import { OrderStatus } from '@prisma/client';

@Injectable()
export class SalesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly financialService: FinancialService,
  ) {}

  async create(createDto: CreateOrderDto, tenantId: string, user: any) {
    const {
      customerId,
      priceListId,
      items,
      shipping = 0,
      discount = 0,
      paymentMethod,
      installments,
    } = createDto;

    // 1. CARREGAMENTO DOS DEPÓSITOS (Vendedor e Matriz)

    // Busca depósito do Vendedor (Se existir)
    const sellerWarehouse = await this.prisma.warehouse.findFirst({
      where: { tenantId, responsibleUserId: user.userId },
    });

    // Busca depósito da Matriz (Default)
    const matrixWarehouse = await this.prisma.warehouse.findFirst({
      where: { tenantId, isDefault: true },
    });

    // Validação básica
    if (!sellerWarehouse && !matrixWarehouse) {
      throw new BadRequestException('Nenhum depósito configurado no sistema.');
    }

    // 2. VALIDAÇÃO DO CLIENTE E ENDEREÇO
    const customer = await this.prisma.customer.findUnique({
      where: { id: customerId },
      include: { addresses: true },
    });

    if (!customer || customer.tenantId !== tenantId) {
      throw new NotFoundException('Cliente não encontrado.');
    }

    const deliveryAddress = customer.addresses[0];
    if (!deliveryAddress) {
      throw new BadRequestException('Cliente sem endereço cadastrado.');
    }

    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      include: { billingProfile: true },
    });

    const originState = tenant?.billingProfile?.stateUf || 'PR';
    const destinationState = deliveryAddress.state;

    // --- INÍCIO DA TRANSAÇÃO ---
    const order = await this.prisma.$transaction(async (tx) => {
      let subtotal = 0;
      let totalIcms = 0;
      let totalIpi = 0;

      // Flag para controlar o status do pedido
      // Se pegar algo da matriz (e o usuário for seller), vira SEPARATION
      let needsSeparation = false;

      const orderItemsData: Array<{
        productId: string;
        quantity: number;
        unitPrice: number;
        discount: number;
        totalPrice: number;
        icmsRate: number;
        ipiRate: number;
      }> = [];

      for (const itemDto of items) {
        const product = await tx.product.findUnique({
          where: { id: itemDto.productId },
          include: {
            prices: { where: { priceListId } },
            taxProfile: { include: { rules: true } },
          },
        });

        if (!product) {
          throw new BadRequestException(
            `Produto ${itemDto.productId} não encontrado.`,
          );
        }

        const quantityToSell = Number(itemDto.quantity);

        // --- LÓGICA DE BAIXA DE ESTOQUE HÍBRIDA ---
        let sourceWarehouseId: string | null = null;

        // A. Tenta no Depósito do Vendedor (Prioridade)
        if (sellerWarehouse) {
          const sellerStock = await tx.stockItem.findUnique({
            where: {
              productId_warehouseId: {
                productId: product.id,
                warehouseId: sellerWarehouse.id,
              },
            },
          });

          if (sellerStock && Number(sellerStock.quantity) >= quantityToSell) {
            sourceWarehouseId = sellerWarehouse.id;
          }
        }

        // B. Se não tem no Vendedor, tenta na Matriz (Fallback)
        if (!sourceWarehouseId && matrixWarehouse) {
          const matrixStock = await tx.stockItem.findUnique({
            where: {
              productId_warehouseId: {
                productId: product.id,
                warehouseId: matrixWarehouse.id,
              },
            },
          });

          if (matrixStock && Number(matrixStock.quantity) >= quantityToSell) {
            sourceWarehouseId = matrixWarehouse.id;

            // Se quem está vendendo é SELLER e usou estoque da MATRIZ
            if (user.role === 'SELLER') {
              needsSeparation = true;
            }
          }
        }

        // C. Se não achou em lugar nenhum
        if (!sourceWarehouseId) {
          throw new BadRequestException(
            `Estoque insuficiente para "${product.name}". Verifique o saldo no seu depósito e na matriz.`,
          );
        }

        // D. Executa a Baixa no Depósito Escolhido
        await tx.stockItem.update({
          where: {
            productId_warehouseId: {
              productId: product.id,
              warehouseId: sourceWarehouseId,
            },
          },
          data: { quantity: { decrement: quantityToSell } },
        });

        // E. Registra Kardex
        // Calcula o saldo após a movimentação
        const stockAfterMovement = await tx.stockItem.findUnique({
          where: {
            productId_warehouseId: {
              productId: product.id,
              warehouseId: sourceWarehouseId,
            },
          },
        });

        await tx.stockMovement.create({
          data: {
            tenantId,
            productId: product.id,
            type: 'EXIT',
            quantity: quantityToSell,
            reason: needsSeparation
              ? 'Venda (Retirada na Matriz)'
              : 'Venda (Pronta Entrega)',
            fromWarehouseId: sourceWarehouseId,
            costPrice: product.costPrice,
            userId: user.id,
            balanceAfter: stockAfterMovement
              ? Number(stockAfterMovement.quantity)
              : 0,
          },
        });

        // --- CÁLCULOS (Preço e Impostos) ---
        const priceObj = product.prices[0];
        let unitPrice = priceObj ? Number(priceObj.price) : 0;

        if (unitPrice === 0)
          throw new BadRequestException(`Produto ${product.name} sem preço.`);

        const itemDiscount = Number(itemDto.discount || 0);
        const totalItem = unitPrice * quantityToSell - itemDiscount;

        let icmsRate = 0;
        let ipiRate = 0;

        // (Lógica de impostos mantida...)
        if (product.taxProfile) {
          let rule = product.taxProfile.rules.find(
            (r) =>
              r.originState === originState &&
              r.destinationState === destinationState,
          );
          if (!rule) {
            rule = product.taxProfile.rules.find(
              (r) =>
                r.originState === originState &&
                r.destinationState === originState,
            );
          }
          if (rule) {
            icmsRate = Number(rule.icmsRate);
            ipiRate = Number(rule.ipiRate);
          }
        }

        const icmsValue = totalItem * (icmsRate / 100);
        const ipiValue = totalItem * (ipiRate / 100);

        subtotal += totalItem;
        totalIcms += icmsValue;
        totalIpi += ipiValue;

        orderItemsData.push({
          productId: product.id,
          quantity: quantityToSell,
          unitPrice: unitPrice,
          discount: itemDiscount,
          totalPrice: totalItem,
          icmsRate: icmsRate,
          ipiRate: ipiRate,
        });
      }

      const finalTotal = subtotal + Number(shipping) - Number(discount);

      // --- DEFINIÇÃO DO STATUS ---
      // Se needsSeparation for true (Seller vendeu da matriz), status é SEPARATION.
      // Caso contrário, é CONFIRMED (Venda normal).
      const finalStatus = needsSeparation
        ? OrderStatus.SEPARATION
        : OrderStatus.CONFIRMED;

      // Cria Pedido
      return tx.order.create({
        data: {
          tenantId,
          customerId,
          priceListId,
          status: finalStatus,
          subtotal,
          discount: Number(discount),
          shipping: Number(shipping),
          total: finalTotal,
          totalIcms,
          totalIpi,
          items: {
            create: orderItemsData,
          },
        },
        include: {
          items: { include: { product: true } },
          customer: true,
        },
      });
    });

    // --- GERAÇÃO FINANCEIRA ---
    if (installments && installments.length > 0) {
      for (const inst of installments) {
        await this.financialService.createReceivable(
          {
            titleNumber: `PED-${order.code}/${inst.number}`,
            description: `Venda Pedido #${order.code}`,
            amount: Number(inst.amount),
            dueDate: inst.dueDate,
            customerId: customerId,
            orderId: order.id,
            paymentMethod: paymentMethod,
          },
          tenantId,
        );
      }
    } else {
      await this.financialService.createReceivable(
        {
          titleNumber: `PED-${order.code}/U`,
          description: `Venda à Vista - Pedido #${order.code}`,
          amount: Number(order.total),
          dueDate: new Date().toISOString(),
          customerId: customerId,
          orderId: order.id,
          paymentMethod: paymentMethod,
        },
        tenantId,
      );
    }

    return order;
  }

  async findAll(tenantId: string) {
    return this.prisma.order.findMany({
      where: { tenantId },
      include: {
        customer: { select: { name: true } },
        _count: { select: { items: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string, tenantId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id },
      include: {
        customer: true,
        priceList: true,
        items: {
          include: {
            product: { include: { images: { take: 1 } } },
          },
        },
      },
    });

    if (!order || order.tenantId !== tenantId) {
      throw new NotFoundException('Pedido não encontrado');
    }

    return order;
  }
}
