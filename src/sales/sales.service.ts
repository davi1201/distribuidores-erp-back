import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import type { User } from '@prisma/client';
import { CreateOrderDto } from './dto/create-sale.dto';
import { FinancialService } from 'src/financial/financial.service';

@Injectable()
export class SalesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly financialService: FinancialService,
  ) {}

  async create(createDto: CreateOrderDto, tenantId: string, user: User) {
    const {
      customerId,
      priceListId,
      items,
      shipping = 0,
      discount = 0,
      paymentMethod,
      installments,
    } = createDto;

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

    let subtotal = 0;
    let totalIcms = 0;
    let totalIpi = 0;
    const orderItemsData: {
      productId: string;
      quantity: number;
      unitPrice: number;
      discount: number;
      totalPrice: number;
      icmsRate: number;
      ipiRate: number;
    }[] = [];

    for (const itemDto of items) {
      const product = await this.prisma.product.findUnique({
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

      const priceObj = product.prices[0];
      let unitPrice = priceObj ? Number(priceObj.price) : 0;

      if (unitPrice === 0) {
        throw new BadRequestException(
          `Produto ${product.name} sem preço na tabela selecionada.`,
        );
      }

      const quantity = Number(itemDto.quantity);
      const itemDiscount = Number(itemDto.discount || 0);
      const totalItem = unitPrice * quantity - itemDiscount;

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
        quantity: quantity,
        unitPrice: unitPrice,
        discount: itemDiscount,
        totalPrice: totalItem,
        icmsRate: icmsRate,
        ipiRate: ipiRate,
      });
    }

    const finalTotal = subtotal + Number(shipping) - Number(discount);

    const order = await this.prisma.order.create({
      data: {
        tenantId,
        customerId,
        priceListId,
        status: 'DRAFT',
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
        items: {
          include: { product: true },
        },
        customer: true,
      },
    });

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
          amount: finalTotal,
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
