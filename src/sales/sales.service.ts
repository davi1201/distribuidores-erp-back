import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createLogger } from '../core/logging';
import { PrismaService } from '../prisma/prisma.service';
import { CreateOrderDto } from './dto/create-sale.dto';
import { FinancialService } from '../financial/financial.service';
import { OrderStatus, Prisma } from '@prisma/client';
import { CommissionsService } from '../commissions/commissions.service';

// Core imports
import { ERROR_MESSAGES, ENTITY_NAMES } from '../core/constants';
import { toNumber, roundTo } from '../core/utils/number.utils';

@Injectable()
export class SalesService {
  private readonly logger = createLogger(SalesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly financialService: FinancialService,
    private readonly commissionsService: CommissionsService,
  ) {}

  // ==========================================================================
  // ORQUESTRADOR PRINCIPAL DE CRIAÇÃO DE VENDA
  // ==========================================================================
  async create(createDto: CreateOrderDto, tenantId: string, user: any) {
    const payload = createDto as any;
    const currentUserId = user.id || user.userId;
    const sellerId = user.role === 'SELLER' ? currentUserId : null;

    // 1. Validações e Contexto Base (Fail Fast fora da transação)
    const context = await this.validateAndFetchOrderContext(
      tenantId,
      payload.customerId,
      currentUserId,
    );

    // 2. Transação Atômica do ERP
    const order = await this.prisma.$transaction(async (tx) => {
      // 2.1 Processa Estoque e Itens
      const processedItems = await this.processOrderItems(
        tx,
        payload.items,
        context,
        currentUserId,
        tenantId,
        payload.priceListId,
      );

      // 2.2 Processa Split de Pagamentos e Taxas
      const baseOrderTotal =
        processedItems.subtotal +
        toNumber(payload.shipping) -
        toNumber(payload.discount);
      const processedPayments = await this.processPayments(
        tx,
        payload.payments,
        baseOrderTotal,
        tenantId,
      );

      // 2.3 Criação da Ordem (Pedido)
      const finalStatus = processedItems.hasPreOrderItems
        ? OrderStatus.SEPARATION
        : OrderStatus.CONFIRMED;
      const createdOrder = await tx.order.create({
        data: {
          tenantId,
          customerId: payload.customerId,
          priceListId: payload.priceListId,
          paymentTermId: payload.paymentTermId, // Mantido para legado
          status: finalStatus,
          subtotal: processedItems.subtotal,
          discount: toNumber(payload.discount),
          shipping: toNumber(payload.shipping),
          total: processedPayments.absoluteFinalTotal,
          totalIcms: processedItems.totalIcms,
          totalIpi: processedItems.totalIpi,
          sellerId,
          items: { create: processedItems.orderItemsData },
          ...(processedPayments.orderPaymentsData.length > 0 && {
            payments: { create: processedPayments.orderPaymentsData },
          }),
        },
        include: { payments: true },
      });

      // 2.4 Geração de Títulos Financeiros
      await this.generateOrderTitles(
        tx,
        createdOrder,
        payload,
        currentUserId,
        tenantId,
      );

      return createdOrder;
    });

    // 3. Pós-Processamento (Comissões)
    if (sellerId) {
      await this.safeProcessCommission(order.id, tenantId);
    }

    return order;
  }

  // ==========================================================================
  // MÉTODOS PRIVADOS DE NEGÓCIO (CLEAN CODE)
  // ==========================================================================

  private async validateAndFetchOrderContext(
    tenantId: string,
    customerId: string,
    currentUserId: string,
  ) {
    const [sellerWarehouse, matrixWarehouse, customer, tenant] =
      await Promise.all([
        this.prisma.warehouse.findFirst({
          where: { tenantId, responsibleUserId: currentUserId },
        }),
        this.prisma.warehouse.findFirst({
          where: { tenantId, isDefault: true },
        }),
        this.prisma.customer.findUnique({
          where: { id: customerId },
          include: { addresses: true },
        }),
        this.prisma.tenant.findUnique({
          where: { id: tenantId },
          include: { billingProfile: true },
        }),
      ]);

    if (!sellerWarehouse && !matrixWarehouse) {
      throw new BadRequestException(
        'Nenhum depósito configurado no sistema para realizar vendas.',
      );
    }
    if (!customer || customer.tenantId !== tenantId) {
      throw new NotFoundException(
        ERROR_MESSAGES.NOT_FOUND(ENTITY_NAMES.CUSTOMER),
      );
    }
    if (!customer.addresses[0]) {
      throw new BadRequestException(
        'O cliente selecionado não possui um endereço cadastrado.',
      );
    }

    return {
      sellerWarehouse,
      matrixWarehouse,
      originState: tenant?.billingProfile?.stateUf || 'PR',
      destinationState: customer.addresses[0].stateCode,
    };
  }

  private async processOrderItems(
    tx: Prisma.TransactionClient,
    items: any[],
    context: any,
    userId: string,
    tenantId: string,
    priceListId: string,
  ) {
    let subtotal = 0,
      totalIcms = 0,
      totalIpi = 0;
    let hasPreOrderItems = false;
    const orderItemsData: Prisma.OrderItemUncheckedCreateWithoutOrderInput[] =
      [];

    for (const item of items) {
      const requestedQty = toNumber(item.quantity);
      if (requestedQty <= 0) continue;

      const product = await tx.product.findUnique({
        where: { id: item.productId },
        include: {
          prices: { where: { priceListId: priceListId } },
          taxProfile: { include: { rules: true } },
        },
      });

      if (!product)
        throw new BadRequestException(
          `Produto ${item.productId} não encontrado.`,
        );

      const stockDistribution = await this.calculateStockDistribution(
        tx,
        product.id,
        requestedQty,
        item.deliveryType,
        context,
      );

      const unitPrice = product.prices[0]
        ? toNumber(product.prices[0].price)
        : 0;
      const unitDiscount = toNumber(item.discount) / requestedQty;
      const taxes = this.calculateTaxes(
        product,
        context.originState,
        context.destinationState,
      );

      const processSplit = async (
        qty: number,
        warehouseId: string,
        isPreOrder: boolean,
      ) => {
        if (qty <= 0) return;
        if (isPreOrder) hasPreOrderItems = true;

        await tx.stockItem.update({
          where: {
            productId_warehouseId: { productId: product.id, warehouseId },
          },
          data: { quantity: { decrement: qty } },
        });

        const splitTotal = unitPrice * qty - unitDiscount * qty;
        subtotal += splitTotal;
        totalIcms += splitTotal * (taxes.icmsRate / 100);
        totalIpi += splitTotal * (taxes.ipiRate / 100);

        orderItemsData.push({
          productId: product.id,
          quantity: qty,
          unitPrice,
          discount: unitDiscount * qty,
          totalPrice: splitTotal,
          icmsRate: taxes.icmsRate,
          ipiRate: taxes.ipiRate,
          deliveryType: isPreOrder ? 'PRE_ORDER' : 'READY',
        });
      };

      if (context.sellerWarehouse)
        await processSplit(
          stockDistribution.qtyFromSeller,
          context.sellerWarehouse.id,
          false,
        );
      if (context.matrixWarehouse)
        await processSplit(
          stockDistribution.qtyFromMatrix,
          context.matrixWarehouse.id,
          true,
        );
    }

    return { orderItemsData, subtotal, totalIcms, totalIpi, hasPreOrderItems };
  }

  private async calculateStockDistribution(
    tx: Prisma.TransactionClient,
    productId: string,
    requestedQty: number,
    deliveryType: string,
    context: any,
  ) {
    let qtyFromSeller = 0;
    let qtyFromMatrix = 0;

    if (deliveryType === 'PRE_ORDER') {
      qtyFromMatrix = requestedQty;
    } else {
      let sellerAvailable = 0;
      if (context.sellerWarehouse) {
        const stock = await tx.stockItem.findUnique({
          where: {
            productId_warehouseId: {
              productId,
              warehouseId: context.sellerWarehouse.id,
            },
          },
        });
        sellerAvailable = stock ? toNumber(stock.quantity) : 0;
      }
      if (sellerAvailable >= requestedQty) qtyFromSeller = requestedQty;
      else {
        qtyFromSeller = sellerAvailable;
        qtyFromMatrix = requestedQty - sellerAvailable;
      }
    }
    return { qtyFromSeller, qtyFromMatrix };
  }

  private calculateTaxes(
    product: any,
    originState: string,
    destinationState: string,
  ) {
    let icmsRate = 0,
      ipiRate = 0;
    if (product.taxProfile) {
      const rule =
        product.taxProfile.rules.find(
          (r: any) =>
            r.originState === originState &&
            r.destinationState === String(destinationState),
        ) ||
        product.taxProfile.rules.find(
          (r: any) =>
            r.originState === originState && r.destinationState === originState,
        );
      if (rule) {
        icmsRate = toNumber(rule.icmsRate);
        ipiRate = toNumber(rule.ipiRate);
      }
    }
    return { icmsRate, ipiRate };
  }

  private async processPayments(
    tx: Prisma.TransactionClient,
    payments: any[],
    baseOrderTotal: number,
    tenantId: string,
  ) {
    let absoluteFinalTotal = 0;
    const orderPaymentsData: Prisma.OrderPaymentUncheckedCreateWithoutOrderInput[] =
      [];

    if (payments && Array.isArray(payments) && payments.length > 0) {
      const totalPaymentsSent = payments.reduce(
        (acc, p) => acc + toNumber(p.amount),
        0,
      );
      if (Math.abs(totalPaymentsSent - baseOrderTotal) > 0.02) {
        throw new BadRequestException(
          `A soma dos pagamentos não confere com o total da venda.`,
        );
      }

      for (const p of payments) {
        const term = await tx.paymentTerm.findUnique({
          where: { id: p.paymentTermId },
        });
        const rules = term?.rules as any[];
        const actualInstallments =
          Array.isArray(rules) && rules.length > 0
            ? rules.length
            : p.installments || 1;

        const calc = await this.financialService.calculateSaleTotal(
          tenantId,
          p.tenantPaymentMethodId,
          toNumber(p.amount),
          actualInstallments,
        );

        const isFullPayment = toNumber(p.amount) === baseOrderTotal;
        if (!isFullPayment && calc.discountApplied > 0) {
          this.logger.log(
            `Desconto removido: A venda foi dividida e o método exige pagamento integral.`,
          );
          calc.discountApplied = 0;
          // Reverte o total final: Valor original + Taxas de maquininha (se houver)
          calc.finalTotal = toNumber(p.amount) + calc.feeValue;
        }

        absoluteFinalTotal += calc.finalTotal;

        orderPaymentsData.push({
          tenantId,
          tenantPaymentMethodId: p.tenantPaymentMethodId,
          paymentTermId: p.paymentTermId,
          baseAmount: toNumber(p.amount),
          installments: actualInstallments,
          discountApplied: calc.discountApplied,
          feeApplied: calc.feeValue,
          finalAmount: calc.finalTotal,
        });
      }
    } else {
      absoluteFinalTotal = baseOrderTotal;
    }

    return { orderPaymentsData, absoluteFinalTotal };
  }

  private async generateOrderTitles(
    tx: Prisma.TransactionClient,
    order: any,
    payload: any,
    userId: string,
    tenantId: string,
  ) {
    const baseDocNumber = order.code
      ? String(order.code)
      : order.id.slice(0, 8);

    if (order.payments && order.payments.length > 0) {
      let paymentIndex = 1;
      for (const op of order.payments) {
        await this.financialService.generateTitlesFromCondition({
          tenantId,
          userId,
          type: 'RECEIVABLE',
          totalAmount: toNumber(op.finalAmount),
          docNumber: `${baseDocNumber}-${paymentIndex}`,
          descriptionPrefix: `Venda Pedido ${baseDocNumber}`,
          customerId: order.customerId,
          orderId: order.id,
          orderPaymentId: op.id,
          tenantPaymentMethodId: op.tenantPaymentMethodId,
          paymentTermId: op.paymentTermId || undefined,
          installmentCount: op.installments,
          startDate: new Date(payload.currentDueDate || Date.now()),
          tx,
        });
        paymentIndex++;
      }
    } else {
      // B2B Antigo Legado
      await this.financialService.generateTitlesFromCondition({
        tenantId,
        userId,
        type: 'RECEIVABLE',
        totalAmount: toNumber(order.total),
        docNumber: baseDocNumber,
        descriptionPrefix: 'Venda Pedido',
        customerId: order.customerId,
        orderId: order.id,
        paymentTermId: payload.paymentTermId,
        installmentsPlan: payload.installmentsPlan,
        tenantPaymentMethodId: payload.paymentMethodId,
        startDate: new Date(),
        tx,
      });
    }
  }

  private async safeProcessCommission(orderId: string, tenantId: string) {
    try {
      await this.commissionsService.calculateAndRegister(orderId, tenantId);
    } catch (error) {
      this.logger.error(
        `Erro ao processar comissão Pedido ${orderId}: ${error.message}`,
      );
    }
  }

  // ==========================================================================
  // LISTAGEM E BUSCA
  // ==========================================================================

  async findAll(tenantId: string, user: any, filters?: any) {
    const whereClause: Prisma.OrderWhereInput = { tenantId };

    if (user.role === 'SELLER') whereClause.sellerId = user.id;

    if (filters) {
      if (filters.status) whereClause.status = filters.status as OrderStatus;
      if (filters.startDate || filters.endDate) {
        whereClause.createdAt = {};
        if (filters.startDate)
          whereClause.createdAt.gte = new Date(
            new Date(filters.startDate).setUTCHours(0, 0, 0, 0),
          );
        if (filters.endDate)
          whereClause.createdAt.lte = new Date(
            new Date(filters.endDate).setUTCHours(23, 59, 59, 999),
          );
      }
      if (filters.search) {
        const searchStr = filters.search.trim();
        const searchAsNumber = Number(searchStr);
        whereClause.OR = [
          { customer: { name: { contains: searchStr, mode: 'insensitive' } } },
        ];
        if (!isNaN(searchAsNumber))
          whereClause.OR.push({ code: searchAsNumber });
      }
    }

    const orders = await this.prisma.order.findMany({
      where: whereClause,
      orderBy: { createdAt: 'desc' },
      include: {
        customer: { select: { id: true, name: true, document: true } },
        commissionRecord: {
          select: { id: true, commissionAmount: true, status: true },
        },
        seller: { select: { name: true } },
        items: {
          select: {
            id: true,
            productId: true,
            quantity: true,
            unitPrice: true,
            discount: true,
            totalPrice: true,
            deliveryType: true,
            product: {
              select: {
                sku: true,
                name: true,
                images: { take: 1, select: { url: true } },
              },
            },
          },
        },
        priceList: { select: { name: true } },
        paymentTerm: { select: { id: true, name: true } }, // Legado
        payments: {
          select: {
            installments: true,
            paymentTerm: { select: { name: true } },
            tenantPaymentMethod: {
              select: {
                customName: true,
                systemPaymentMethod: { select: { name: true } },
              },
            },
          },
        },
        financialTitles: {
          take: 1,
          select: {
            totalInstallments: true,
            tenantPaymentMethod: {
              select: {
                customName: true,
                systemPaymentMethod: { select: { name: true } },
              },
            },
          },
        },
      },
    });

    return orders.map((order) => this.mapOrderForDisplay(order));
  }

  private mapOrderForDisplay(order: any) {
    const groupedItemsMap = new Map();
    for (const item of order.items) {
      if (!groupedItemsMap.has(item.productId)) {
        groupedItemsMap.set(item.productId, {
          ...item,
          quantity: toNumber(item.quantity),
          totalPrice: toNumber(item.totalPrice),
          discount: toNumber(item.discount),
        });
      } else {
        const existing = groupedItemsMap.get(item.productId);
        existing.quantity += toNumber(item.quantity);
        existing.totalPrice += toNumber(item.totalPrice);
        existing.discount += toNumber(item.discount);
      }
    }

    let methodName = 'Não definido';
    let installmentsStr = '1x';
    let termName = 'À vista';

    if (order.payments && order.payments.length > 0) {
      const methods = order.payments.map(
        (p: any) =>
          `${p.tenantPaymentMethod?.customName || p.tenantPaymentMethod?.systemPaymentMethod?.name} (${p.installments}x)`,
      );
      methodName = methods.join(' + ');
      installmentsStr = 'Misto';
      // 🔥 Correção do Mapper: Pega o nome do termo de pagamento real usado no PDV
      termName = order.payments[0].paymentTerm?.name || 'Múltiplas Condições';
    } else if (order.financialTitles && order.financialTitles.length > 0) {
      const title = order.financialTitles[0];
      methodName =
        title.tenantPaymentMethod?.customName ||
        title.tenantPaymentMethod?.systemPaymentMethod?.name ||
        'Não definido';
      installmentsStr = `${title.totalInstallments || 1}x`;
      termName = order.paymentTerm?.name || 'À vista';
    }

    return {
      ...order,
      displayItems: Array.from(groupedItemsMap.values()),
      paymentInfo: { methodName, installments: installmentsStr, termName },
    };
  }

  async findOne(id: string, tenantId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id },
      include: {
        customer: true,
        priceList: true,
        items: { include: { product: { include: { images: { take: 1 } } } } },
        payments: {
          include: {
            tenantPaymentMethod: { include: { systemPaymentMethod: true } },
          },
        },
      },
    });

    if (!order || order.tenantId !== tenantId)
      throw new NotFoundException(ERROR_MESSAGES.NOT_FOUND(ENTITY_NAMES.ORDER));
    return order;
  }

  async updateStatus(id: string, tenantId: string, newStatus: OrderStatus) {
    const order = await this.prisma.order.findUnique({ where: { id } });
    if (!order || order.tenantId !== tenantId)
      throw new NotFoundException(ERROR_MESSAGES.NOT_FOUND(ENTITY_NAMES.ORDER));
    return this.prisma.order.update({
      where: { id },
      data: { status: newStatus },
    });
  }

  async mannualAproveCommission(orderId: string, tenantId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
    });
    if (!order || order.tenantId !== tenantId)
      throw new NotFoundException(ERROR_MESSAGES.NOT_FOUND(ENTITY_NAMES.ORDER));
    await this.commissionsService.calculateAndRegister(order.id, tenantId);
  }
}
