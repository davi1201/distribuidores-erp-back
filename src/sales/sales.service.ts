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
    private readonly commissionsService: CommissionsService, // <--- INJETADO
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

    // Padronização do ID do usuário (Geralmente é user.id vindo do AuthGuard)
    const currentUserId = user.id || user.userId;

    // Define quem é o vendedor responsável (Se for admin vendendo, pode ser null ou ele mesmo)
    // Se quiser que Admins também ganhem comissão, remova a verificação de role.
    const sellerId = user.role === 'SELLER' ? currentUserId : null;

    // 1. CARREGAMENTO DOS DEPÓSITOS
    const sellerWarehouse = await this.prisma.warehouse.findFirst({
      where: { tenantId, responsibleUserId: currentUserId },
    });

    const matrixWarehouse = await this.prisma.warehouse.findFirst({
      where: { tenantId, isDefault: true },
    });

    if (!sellerWarehouse && !matrixWarehouse) {
      throw new BadRequestException('Nenhum depósito configurado no sistema.');
    }

    // 2. VALIDAÇÃO DO CLIENTE
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

    // --- INÍCIO DA TRANSAÇÃO (Estoque + Pedido) ---
    const order = await this.prisma.$transaction(async (tx) => {
      let subtotal = 0;
      let totalIcms = 0;
      let totalIpi = 0;
      let needsSeparation = false;

      const orderItemsData: Prisma.OrderItemUncheckedCreateWithoutOrderInput[] =
        [];

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
        let sourceWarehouseId: string | null = null;

        // A. Tenta no Depósito do Vendedor
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

        // B. Se não tem no Vendedor, tenta na Matriz
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
            if (user.role === 'SELLER') {
              needsSeparation = true;
            }
          }
        }

        if (!sourceWarehouseId) {
          throw new BadRequestException(
            `Estoque insuficiente para "${product.name}".`,
          );
        }

        // C. Executa a Baixa
        await tx.stockItem.update({
          where: {
            productId_warehouseId: {
              productId: product.id,
              warehouseId: sourceWarehouseId,
            },
          },
          data: { quantity: { decrement: quantityToSell } },
        });

        // D. Registra Kardex
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
            userId: currentUserId,
            balanceAfter: 0,
          },
        });

        // --- CÁLCULOS ---
        const priceObj = product.prices[0];
        const unitPrice = priceObj ? Number(priceObj.price) : 0;

        if (unitPrice === 0)
          throw new BadRequestException(`Produto ${product.name} sem preço.`);

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
          unitPrice,
          discount: itemDiscount,
          totalPrice: totalItem,
          icmsRate,
          ipiRate,
        });
      }

      const finalTotal = subtotal + Number(shipping) - Number(discount);
      const finalStatus = needsSeparation
        ? OrderStatus.SEPARATION
        : OrderStatus.CONFIRMED;

      // Criação do Pedido
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
          sellerId: sellerId, // <--- Usando a variável corrigida
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

    // --- 3. INTEGRAÇÕES PÓS-VENDA (Assíncronas ou Sequenciais) ---

    // A. Gerar Financeiro (Contas a Receber)
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
      this.logger.error(`Erro financeiro Pedido ${order.id}: ${error.message}`);
      // Não damos throw aqui para não cancelar a venda se o financeiro falhar,
      // mas o ideal seria ter uma fila de retry.
    }

    // B. Gerar Comissão (NOVO)
    if (sellerId) {
      try {
        this.logger.log(`Calculando comissão para o vendedor ${sellerId}...`);
        await this.commissionsService.calculateAndRegister(order.id, tenantId);
      } catch (error) {
        this.logger.error(
          `Erro ao calcular comissão Pedido ${order.id}: ${error.message}`,
        );
        // Logamos o erro, mas não falhamos a venda. O Admin pode recalcular depois se necessário.
      }
    }

    return order;
  }

  // --- MÉTODOS DE CONSULTA ---

  async findAll(tenantId: string, user: any) {
    const whereClause: Prisma.OrderWhereInput = {
      tenantId,
    };

    if (user.role === 'SELLER') {
      whereClause.sellerId = user.id;
    }

    const orders = await this.prisma.order.findMany({
      where: whereClause,
      orderBy: { createdAt: 'desc' },
      include: {
        customer: {
          select: {
            id: true,
            name: true,
            document: true,
          },
        },
        seller: {
          select: { name: true },
        },
        items: {
          select: {
            id: true,
            quantity: true,
            unitPrice: true,
            discount: true,
            totalPrice: true,
            product: {
              select: {
                sku: true,
                name: true,
                images: {
                  take: 1,
                  select: { url: true },
                },
              },
            },
          },
        },
        priceList: {
          select: { name: true },
        },
        paymentTerm: {
          select: {
            id: true,
            name: true,
          },
        },
        // NOVO: Buscamos 1 título para pegar o método e total de parcelas
        financialTitles: {
          take: 1,
          select: {
            totalInstallments: true,
            paymentMethod: {
              select: { name: true },
            },
          },
        },
      },
    });

    // Transformação para facilitar o uso no Front-end
    return orders.map((order) => {
      const mainTitle = order.financialTitles[0];

      return {
        ...order,
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
}
