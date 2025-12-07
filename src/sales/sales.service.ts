import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { User } from '@prisma/client';
import { CreateOrderDto } from './dto/create-sale.dto';
import { FinancialService } from '../financial/financial.service';

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

    // 1. DEFINIÇÃO DO DEPÓSITO DE SAÍDA (Warehouse Logic)
    // Tenta encontrar um depósito vinculado ao usuário (ex: Carro do Vendedor)
    let warehouse = await this.prisma.warehouse.findFirst({
      where: {
        tenantId,
        responsibleUserId: user.userId,
      },
    });

    // Se não tiver (é o Dono ou Vendedor interno), usa a Matriz (Default)
    if (!warehouse) {
      warehouse = await this.prisma.warehouse.findFirst({
        where: { tenantId, isDefault: true },
      });
    }

    // Fallback de segurança: Pega qualquer um se não tiver default
    if (!warehouse) {
      warehouse = await this.prisma.warehouse.findFirst({
        where: { tenantId },
        orderBy: { createdAt: 'asc' },
      });
    }

    if (!warehouse) {
      throw new BadRequestException(
        'Nenhum depósito de estoque encontrado para realizar a baixa.',
      );
    }

    const customer = await this.prisma.customer.findUnique({
      where: { id: customerId },
      include: {
        addresses: true,
      },
    });

    if (!customer || customer.tenantId !== tenantId) {
      throw new NotFoundException('Cliente não encontrado.');
    }

    const deliveryAddress = customer.addresses[0];
    if (!deliveryAddress) {
      throw new BadRequestException(
        'Cliente não possui endereço cadastrado para cálculo de impostos.',
      );
    }

    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      include: { billingProfile: true },
    });

    const originState = tenant?.billingProfile?.stateUf || 'PR';
    const destinationState = deliveryAddress.state;

    // INÍCIO DA TRANSAÇÃO (Pedido + Estoque)
    const order = await this.prisma.$transaction(async (tx) => {
      let subtotal = 0;
      let totalIcms = 0;
      let totalIpi = 0;
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

        // --- BAIXA DE ESTOQUE ---
        // 1. Busca saldo no depósito correto
        const stockItem = await tx.stockItem.findUnique({
          where: {
            productId_warehouseId: {
              productId: product.id,
              warehouseId: warehouse.id,
            },
          },
        });

        const currentQty = Number(stockItem?.quantity || 0);
        const quantityToSell = Number(itemDto.quantity);

        if (currentQty < quantityToSell) {
          throw new BadRequestException(
            `Estoque insuficiente para "${product.name}" no depósito "${warehouse.name}". Disponível: ${currentQty}`,
          );
        }

        // 2. Decrementa saldo
        if (!stockItem) {
          throw new BadRequestException(
            `Estoque do produto "${product.name}" não encontrado no depósito "${warehouse.name}".`,
          );
        }
        await tx.stockItem.update({
          where: { id: stockItem.id },
          data: { quantity: { decrement: quantityToSell } },
        });

        // 3. Registra no Kardex (Movimentação)
        await tx.stockMovement.create({
          data: {
            tenantId,
            productId: product.id,
            type: 'EXIT', // Saída por Venda
            quantity: quantityToSell,
            reason: 'Venda (Pedido em processamento)', // Atualizaremos com o ID do pedido se necessário
            fromWarehouseId: warehouse.id, // Rastreabilidade: Saiu daqui
            costPrice: product.costPrice,
            balanceAfter: currentQty - quantityToSell,
            userId: user.id,
          },
        });

        // --- CÁLCULO DE PREÇO (Lógica mantida) ---
        const priceObj = product.prices[0];
        let unitPrice = priceObj ? Number(priceObj.price) : 0;

        if (unitPrice === 0) {
          throw new BadRequestException(
            `Produto ${product.name} sem preço na tabela selecionada.`,
          );
        }

        const itemDiscount = Number(itemDto.discount || 0);
        const totalItem = unitPrice * quantityToSell - itemDiscount;

        let icmsRate = 0;
        let ipiRate = 0;

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

      // Cria o Pedido
      return tx.order.create({
        data: {
          tenantId,
          customerId,
          priceListId,
          status: 'CONFIRMED', // Já confirmamos pois baixamos o estoque
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

    // --- GERAÇÃO FINANCEIRA (Pós-Transação) ---
    // Se der erro aqui, o pedido e o estoque já foram processados (Comercial OK, Financeiro Pendente)
    // Isso é seguro pois permite reprocessar o financeiro depois se precisar.
    if (installments && installments.length > 0) {
      for (const inst of installments) {
        await this.financialService.createReceivable(
          {
            titleNumber: `PED-${order.code}/${inst.number}`,
            description: `Venda Pedido #${order.code} - Parc ${inst.number}`,
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
