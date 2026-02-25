import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateOrderDto } from './dto/create-sale.dto';
import { FinancialService } from '../financial/financial.service';
import { OrderStatus, Prisma } from '@prisma/client';
import { CommissionsService } from 'src/commissions/commissions.service';

@Injectable()
export class SalesService {
  private readonly logger = new Logger(SalesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly financialService: FinancialService,
    private readonly commissionsService: CommissionsService,
  ) {}

  async create(createDto: CreateOrderDto, tenantId: string, user: any) {
    const {
      customerId,
      priceListId,
      items,
      shipping = 0,
      discount = 0,
      paymentMethodId,
      paymentTermId,
      installmentsPlan,
    } = createDto;

    const currentUserId = user.id || user.userId;
    const sellerId = user.role === 'SELLER' ? currentUserId : null;

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
      throw new NotFoundException('Cliente não encontrado.');
    }

    const deliveryAddress = customer.addresses[0];
    if (!deliveryAddress) {
      throw new BadRequestException(
        'O cliente selecionado não possui um endereço cadastrado.',
      );
    }

    const originState = tenant?.billingProfile?.stateUf || 'PR';
    const destinationState = deliveryAddress.stateCode;

    const order = await this.prisma.$transaction(async (tx) => {
      let subtotal = 0;
      let totalIcms = 0;
      let totalIpi = 0;
      let hasPreOrderItems = false;

      const orderItemsData: Prisma.OrderItemUncheckedCreateWithoutOrderInput[] =
        [];

      for (const itemDto of items) {
        const requestedQty = Number(itemDto.quantity);
        if (requestedQty <= 0) continue;

        const product = await tx.product.findUnique({
          where: { id: itemDto.productId },
          include: {
            prices: { where: { priceListId } },
            taxProfile: { include: { rules: true } },
          },
        });

        if (!product) {
          throw new BadRequestException(
            `Produto ID ${itemDto.productId} não encontrado.`,
          );
        }

        // --- Lógica de Auto-Routing (Split de Estoque) ---
        let qtyFromSeller = 0;
        let qtyFromMatrix = 0;

        if (itemDto.deliveryType === 'PRE_ORDER') {
          qtyFromMatrix = requestedQty;
        } else {
          // Se for Pronta Entrega (READY), tenta suprir o máximo pelo Vendedor
          let sellerAvailable = 0;
          if (sellerWarehouse) {
            const sellerStock = await tx.stockItem.findUnique({
              where: {
                productId_warehouseId: {
                  productId: product.id,
                  warehouseId: sellerWarehouse.id,
                },
              },
            });
            sellerAvailable = sellerStock ? Number(sellerStock.quantity) : 0;
          }

          if (sellerAvailable >= requestedQty) {
            qtyFromSeller = requestedQty;
          } else {
            // Se faltar no vendedor, quebra o pedido: pega o que tem, o resto vira encomenda.
            qtyFromSeller = sellerAvailable;
            qtyFromMatrix = requestedQty - sellerAvailable;
          }
        }

        // Validação preventiva do estoque da Matriz (se precisar dela)
        if (qtyFromMatrix > 0) {
          if (!matrixWarehouse) {
            throw new BadRequestException(
              `Faltam ${qtyFromMatrix} un. de "${product.name}", mas não há Matriz para suprir.`,
            );
          }
          const matrixStock = await tx.stockItem.findUnique({
            where: {
              productId_warehouseId: {
                productId: product.id,
                warehouseId: matrixWarehouse.id,
              },
            },
          });
          if (!matrixStock || Number(matrixStock.quantity) < qtyFromMatrix) {
            throw new BadRequestException(
              `Estoque insuficiente na Matriz para suprir a falta de ${qtyFromMatrix} un. de "${product.name}".`,
            );
          }
        }

        // Cálculos Financeiros Base
        const priceObj = product.prices[0];
        const unitPrice = priceObj ? Number(priceObj.price) : 0;
        if (unitPrice === 0) {
          throw new BadRequestException(
            `Produto "${product.name}" não possui preço na tabela selecionada.`,
          );
        }

        // O desconto total da linha é rateado por unidade para não corromper o split
        const unitDiscount = Number(itemDto.discount || 0) / requestedQty;

        let icmsRate = 0;
        let ipiRate = 0;

        if (product.taxProfile) {
          let rule = product.taxProfile.rules.find(
            (r) =>
              r.originState === originState &&
              r.destinationState === String(destinationState),
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

        // Função auxiliar para processar a quebra (Split) gerando linhas separadas
        const processSplit = async (
          qty: number,
          warehouseId: string,
          isPreOrder: boolean,
        ) => {
          if (qty <= 0) return;

          if (isPreOrder) hasPreOrderItems = true;

          const stockRecord = await tx.stockItem.update({
            where: {
              productId_warehouseId: { productId: product.id, warehouseId },
            },
            data: { quantity: { decrement: qty } },
          });

          await tx.stockMovement.create({
            data: {
              tenantId,
              productId: product.id,
              type: 'EXIT',
              quantity: qty,
              reason: isPreOrder
                ? 'Venda (Separação Matriz)'
                : 'Venda (Pronta Entrega)',
              fromWarehouseId: warehouseId,
              costPrice: product.costPrice,
              userId: currentUserId,
              balanceAfter: Number(stockRecord.quantity),
            },
          });

          const splitDiscount = unitDiscount * qty;
          const splitTotal = unitPrice * qty - splitDiscount;
          const splitIcms = splitTotal * (icmsRate / 100);
          const splitIpi = splitTotal * (ipiRate / 100);

          subtotal += splitTotal;
          totalIcms += splitIcms;
          totalIpi += splitIpi;

          orderItemsData.push({
            productId: product.id,
            quantity: qty,
            unitPrice,
            discount: splitDiscount,
            totalPrice: splitTotal,
            icmsRate,
            ipiRate,
            deliveryType: isPreOrder ? 'PRE_ORDER' : 'READY',
          });
        };

        // Executa o split (Se o vendedor tiver tudo, o debaixo nem roda)
        if (sellerWarehouse)
          await processSplit(qtyFromSeller, sellerWarehouse.id, false);
        if (matrixWarehouse)
          await processSplit(qtyFromMatrix, matrixWarehouse.id, true);
      }

      const finalTotal = subtotal + Number(shipping) - Number(discount);
      const finalStatus = hasPreOrderItems
        ? OrderStatus.SEPARATION
        : OrderStatus.CONFIRMED;

      return tx.order.create({
        data: {
          tenantId,
          paymentTermId,
          customerId,
          priceListId,
          status: finalStatus,
          subtotal,
          discount: Number(discount),
          shipping: Number(shipping),
          total: finalTotal,
          totalIcms,
          sellerId,
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

    try {
      await this.financialService.generateTitlesFromCondition({
        tenantId,
        userId: currentUserId,
        type: 'RECEIVABLE',
        totalAmount: Number(order.total),
        docNumber: order.code ? String(order.code) : order.id.slice(0, 8),
        descriptionPrefix: 'Venda Pedido',
        customerId: customerId,
        orderId: order.id,
        paymentTermId,
        installmentsPlan,
        paymentMethodId,
        startDate: new Date(),
      });
    } catch (error) {
      this.logger.error(
        `Erro ao gerar financeiro para o Pedido ${order.id}: ${error.message}`,
      );
    }

    if (sellerId) {
      try {
        await this.commissionsService.calculateAndRegister(order.id, tenantId);
      } catch (error) {
        this.logger.error(
          `Erro ao calcular comissão para o Pedido ${order.id}: ${error.message}`,
        );
      }
    }

    return order;
  }

  async findAll(
    tenantId: string,
    user: any,
    filters?: {
      search?: string;
      status?: string;
      startDate?: string;
      endDate?: string;
    },
  ) {
    const whereClause: Prisma.OrderWhereInput = { tenantId };

    // 1. Filtro de Permissão (Vendedor só vê o dele)
    if (user.role === 'SELLER') {
      whereClause.sellerId = user.id;
    }

    if (filters) {
      // 2. Filtro de Status
      if (filters.status) {
        whereClause.status = filters.status as OrderStatus;
      }

      // 3. Filtro de Datas (Criado entre Start e End)
      if (filters.startDate || filters.endDate) {
        whereClause.createdAt = {};

        if (filters.startDate) {
          // Garante o início do dia (00:00:00)
          const start = new Date(filters.startDate);
          start.setUTCHours(0, 0, 0, 0);
          whereClause.createdAt.gte = start;
        }

        if (filters.endDate) {
          // Garante o final do dia (23:59:59)
          const end = new Date(filters.endDate);
          end.setUTCHours(23, 59, 59, 999);
          whereClause.createdAt.lte = end;
        }
      }

      // 4. Filtro de Busca (Nome do Cliente ou Código do Pedido)
      if (filters.search) {
        const searchStr = filters.search.trim();
        const searchAsNumber = Number(searchStr);

        whereClause.OR = [
          {
            customer: {
              name: { contains: searchStr, mode: 'insensitive' }, // Busca ignorando maiúsculas/minúsculas
            },
          },
        ];

        // Se o que foi digitado for um número válido, inclui a busca pelo código exato do pedido
        if (!isNaN(searchAsNumber)) {
          whereClause.OR.push({
            code: searchAsNumber,
          });
        }
      }
    }

    // Executa a busca com a cláusula condicional montada
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
            productId: true, // <--- ADICIONADO PARA AGRUPAMENTO SEGURO
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
        paymentTerm: { select: { id: true, name: true } },
        financialTitles: {
          take: 1,
          select: {
            totalInstallments: true,
            paymentMethod: { select: { name: true } },
          },
        },
      },
    });

    return orders.map((order) => {
      const mainTitle = order.financialTitles[0];

      // 👇 AGRUPAMENTO INTELIGENTE PARA O FRONT-END (Recibo Visual)
      const groupedItemsMap = new Map();

      for (const item of order.items) {
        if (!groupedItemsMap.has(item.productId)) {
          groupedItemsMap.set(item.productId, {
            ...item,
            quantity: Number(item.quantity),
            totalPrice: Number(item.totalPrice),
            discount: Number(item.discount),
          });
        } else {
          const existing = groupedItemsMap.get(item.productId);
          existing.quantity += Number(item.quantity);
          existing.totalPrice += Number(item.totalPrice);
          existing.discount += Number(item.discount);
        }
      }

      return {
        ...order,
        displayItems: Array.from(groupedItemsMap.values()),
        paymentInfo: {
          methodName: mainTitle?.paymentMethod?.name || 'Não definido',
          installments: mainTitle?.totalInstallments || 0,
          termName: order.paymentTerm?.name || 'À vista',
        },
      };
    });
  }

  async findOne(id: string, tenantId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id },
      include: {
        customer: true,
        priceList: true,
        items: { include: { product: { include: { images: { take: 1 } } } } },
      },
    });

    if (!order || order.tenantId !== tenantId) {
      throw new NotFoundException('Pedido não encontrado');
    }

    return order;
  }

  async updateStatus(id: string, tenantId: string, newStatus: OrderStatus) {
    const order = await this.prisma.order.findUnique({ where: { id } });

    if (!order || order.tenantId !== tenantId) {
      throw new NotFoundException('Pedido não encontrado');
    }

    return this.prisma.order.update({
      where: { id },
      data: { status: newStatus },
    });
  }

  async mannualAproveCommission(orderId: string, tenantId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
    });

    if (!order || order.tenantId !== tenantId) {
      throw new NotFoundException('Pedido não encontrado');
    }

    await this.commissionsService.calculateAndRegister(order.id, tenantId);
  }
}
