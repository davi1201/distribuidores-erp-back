// ============================================================================
// ORDER PAYMENT PROCESSOR - Processamento de pagamentos de pedidos
// ============================================================================

import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { toNumber } from '../../core/utils';
import { createLogger } from '../../core/logging';
import { Prisma, TitleType, TitleStatus } from '@prisma/client';

export interface PaymentMethodInfo {
  id: string;
  name: string;
  maxInstallments: number;
  minInstallmentValue: number;
  passFeeToCustomer: boolean;
}

export interface InstallmentOption {
  installmentNumber: number;
  installmentValue: number;
  totalWithFee: number;
  feePercentage: number;
}

export interface ProcessPaymentInput {
  tenantId: string;
  orderId: string;
  customerId: string;
  paymentMethodId: string;
  totalAmount: number;
  installments: number;
  createdById?: string;
}

export interface ProcessPaymentResult {
  titleIds: string[];
  totalAmount: number;
  installmentValue: number;
  totalWithFees: number;
}

@Injectable()
export class OrderPaymentProcessorService {
  private readonly logger = createLogger(OrderPaymentProcessorService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Busca informações do método de pagamento configurado
   */
  async getPaymentMethodInfo(
    tenantId: string,
    paymentMethodId: string,
  ): Promise<PaymentMethodInfo | null> {
    const method = await this.prisma.tenantPaymentMethod.findFirst({
      where: {
        id: paymentMethodId,
        tenantId,
        isActive: true,
      },
      include: {
        systemPaymentMethod: true,
      },
    });

    if (!method) {
      return null;
    }

    return {
      id: method.id,
      name: method.customName || method.systemPaymentMethod.name,
      maxInstallments: method.maxInstallments,
      minInstallmentValue: toNumber(method.minInstallmentValue),
      passFeeToCustomer: method.passFeeToCustomer,
    };
  }

  /**
   * Calcula opções de parcelamento disponíveis
   */
  async calculateInstallmentOptions(
    tenantId: string,
    paymentMethodId: string,
    totalAmount: number,
  ): Promise<InstallmentOption[]> {
    const method = await this.prisma.tenantPaymentMethod.findFirst({
      where: {
        id: paymentMethodId,
        tenantId,
        isActive: true,
      },
      include: {
        installments: {
          orderBy: { installment: 'asc' },
        },
      },
    });

    if (!method) {
      return [];
    }

    const options: InstallmentOption[] = [];
    const minValue = toNumber(method.minInstallmentValue);

    for (let i = 1; i <= method.maxInstallments; i++) {
      const installmentValue = totalAmount / i;

      // Verifica valor mínimo da parcela
      if (i > 1 && installmentValue < minValue) {
        break;
      }

      // Busca taxa para esta parcela
      const installmentConfig = method.installments.find(
        (inst) => inst.installment === i,
      );
      const feePercentage = toNumber(installmentConfig?.feePercentage);

      let totalWithFee = totalAmount;
      if (method.passFeeToCustomer && feePercentage > 0) {
        totalWithFee = totalAmount * (1 + feePercentage / 100);
      }

      options.push({
        installmentNumber: i,
        installmentValue: totalWithFee / i,
        totalWithFee,
        feePercentage,
      });
    }

    return options;
  }

  /**
   * Processa pagamento e cria títulos financeiros
   */
  async processPayment(
    input: ProcessPaymentInput,
  ): Promise<ProcessPaymentResult> {
    const {
      tenantId,
      orderId,
      customerId,
      paymentMethodId,
      totalAmount,
      installments,
      createdById,
    } = input;

    this.logger.info('Processando pagamento', {
      orderId,
      paymentMethodId,
      totalAmount,
      installments,
    });

    // Busca opções de parcelamento
    const options = await this.calculateInstallmentOptions(
      tenantId,
      paymentMethodId,
      totalAmount,
    );

    const selectedOption = options.find(
      (opt) => opt.installmentNumber === installments,
    );

    if (!selectedOption) {
      this.logger.warn('Parcelamento não disponível', {
        installments,
        available: options.map((o) => o.installmentNumber),
      });
      throw new Error(`Parcelamento em ${installments}x não disponível`);
    }

    // Cria títulos financeiros
    const titleIds: string[] = [];
    const titleNumber = await this.generateTitleNumber(tenantId);
    const baseDate = new Date();

    for (let i = 1; i <= installments; i++) {
      const dueDate = new Date(baseDate);
      dueDate.setMonth(dueDate.getMonth() + i);

      const createData: Prisma.FinancialTitleCreateInput = {
        tenant: { connect: { id: tenantId } },
        titleNumber: `${titleNumber}/${i}`,
        description: `Parcela ${i}/${installments} - Pedido`,
        installmentNumber: i,
        totalInstallments: installments,
        type: TitleType.RECEIVABLE,
        customer: { connect: { id: customerId } },
        order: { connect: { id: orderId } },
        tenantPaymentMethod: { connect: { id: paymentMethodId } },
        originalAmount: selectedOption.installmentValue,
        balance: selectedOption.installmentValue,
        paidAmount: 0,
        dueDate,
        status: TitleStatus.OPEN,
      };

      if (createdById) {
        createData.createdBy = { connect: { id: createdById } };
      }

      const title = await this.prisma.financialTitle.create({
        data: createData,
      });

      titleIds.push(title.id);
    }

    this.logger.info('Pagamento processado', {
      orderId,
      titlesCreated: titleIds.length,
      totalWithFees: selectedOption.totalWithFee,
    });

    return {
      titleIds,
      totalAmount,
      installmentValue: selectedOption.installmentValue,
      totalWithFees: selectedOption.totalWithFee,
    };
  }

  /**
   * Aplica desconto do método de pagamento
   */
  applyPaymentDiscount(amount: number, discountPercentage: number): number {
    if (discountPercentage <= 0) {
      return amount;
    }
    return amount * (1 - discountPercentage / 100);
  }

  /**
   * Gera número sequencial de título
   */
  private async generateTitleNumber(tenantId: string): Promise<string> {
    const lastTitle = await this.prisma.financialTitle.findFirst({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
      select: { titleNumber: true },
    });

    if (!lastTitle?.titleNumber) {
      return 'TIT-0001';
    }

    // Extrai número base (antes de /)
    const baseNumber = lastTitle.titleNumber.split('/')[0];
    const match = baseNumber.match(/\d+$/);

    if (!match) {
      return 'TIT-0001';
    }

    const nextNumber = parseInt(match[0], 10) + 1;
    return `TIT-${nextNumber.toString().padStart(4, '0')}`;
  }
}
