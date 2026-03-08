// ============================================================================
// ORDER TAX CALCULATOR - Cálculo de impostos de pedidos
// ============================================================================

import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { toNumber } from '../../core/utils';
import { createLogger } from '../../core/logging';

export interface TaxCalculationResult {
  icmsRate: number;
  ipiRate: number;
  pisRate: number;
  cofinsRate: number;
  totalTaxRate: number;
  icmsValue: number;
  ipiValue: number;
  pisValue: number;
  cofinsValue: number;
  totalTaxValue: number;
}

export interface TaxCalculationInput {
  tenantId: string;
  customerId: string;
  productId: string;
  amount: number;
  originState?: string;
  destinationState?: string;
}

@Injectable()
export class OrderTaxCalculatorService {
  private readonly logger = createLogger(OrderTaxCalculatorService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Calcula impostos para um item do pedido
   */
  async calculateItemTaxes(
    input: TaxCalculationInput,
  ): Promise<TaxCalculationResult> {
    const { tenantId, productId, amount, originState, destinationState } =
      input;

    // Busca regra fiscal aplicável ao produto
    const taxRule = await this.findApplicableTaxRule(
      tenantId,
      productId,
      originState,
      destinationState,
    );

    if (!taxRule) {
      this.logger.debug(
        'Nenhuma regra fiscal encontrada, usando alíquotas zero',
        {
          tenantId,
          productId,
        },
      );
      return this.createEmptyTaxResult();
    }

    const icmsRate = toNumber(taxRule.icmsRate);
    const ipiRate = toNumber(taxRule.ipiRate);
    const pisRate = toNumber(taxRule.pisRate);
    const cofinsRate = toNumber(taxRule.cofinsRate);

    const icmsValue = (amount * icmsRate) / 100;
    const ipiValue = (amount * ipiRate) / 100;
    const pisValue = (amount * pisRate) / 100;
    const cofinsValue = (amount * cofinsRate) / 100;

    return {
      icmsRate,
      ipiRate,
      pisRate,
      cofinsRate,
      totalTaxRate: icmsRate + ipiRate + pisRate + cofinsRate,
      icmsValue,
      ipiValue,
      pisValue,
      cofinsValue,
      totalTaxValue: icmsValue + ipiValue + pisValue + cofinsValue,
    };
  }

  /**
   * Calcula impostos para todos os itens de um pedido
   */
  async calculateOrderTaxes(
    tenantId: string,
    customerId: string,
    items: Array<{ productId: string; totalPrice: number }>,
    originState?: string,
    destinationState?: string,
  ): Promise<{
    itemTaxes: Map<string, TaxCalculationResult>;
    totalTaxes: TaxCalculationResult;
  }> {
    const itemTaxes = new Map<string, TaxCalculationResult>();
    let totalResult = this.createEmptyTaxResult();

    for (const item of items) {
      const taxes = await this.calculateItemTaxes({
        tenantId,
        customerId,
        productId: item.productId,
        amount: item.totalPrice,
        originState,
        destinationState,
      });

      itemTaxes.set(item.productId, taxes);
      totalResult = this.sumTaxResults(totalResult, taxes);
    }

    return { itemTaxes, totalTaxes: totalResult };
  }

  /**
   * Busca regra fiscal aplicável ao produto
   */
  private async findApplicableTaxRule(
    tenantId: string,
    productId: string,
    originState?: string,
    destinationState?: string,
  ) {
    // Busca o produto com seu perfil fiscal
    const product = await this.prisma.product.findFirst({
      where: { id: productId, tenantId },
      include: {
        taxProfile: {
          include: {
            rules: true,
          },
        },
      },
    });

    if (!product?.taxProfile?.rules?.length) {
      return null;
    }

    // Procura regra específica por estado
    if (originState && destinationState) {
      const specificRule = product.taxProfile.rules.find(
        (r) =>
          r.originState === originState &&
          r.destinationState === destinationState,
      );
      if (specificRule) return specificRule;
    }

    // Retorna primeira regra como fallback
    return product.taxProfile.rules[0];
  }

  /**
   * Cria resultado de impostos zerado
   */
  private createEmptyTaxResult(): TaxCalculationResult {
    return {
      icmsRate: 0,
      ipiRate: 0,
      pisRate: 0,
      cofinsRate: 0,
      totalTaxRate: 0,
      icmsValue: 0,
      ipiValue: 0,
      pisValue: 0,
      cofinsValue: 0,
      totalTaxValue: 0,
    };
  }

  /**
   * Soma dois resultados de impostos
   */
  private sumTaxResults(
    a: TaxCalculationResult,
    b: TaxCalculationResult,
  ): TaxCalculationResult {
    return {
      icmsRate: (a.icmsRate + b.icmsRate) / 2,
      ipiRate: (a.ipiRate + b.ipiRate) / 2,
      pisRate: (a.pisRate + b.pisRate) / 2,
      cofinsRate: (a.cofinsRate + b.cofinsRate) / 2,
      totalTaxRate: (a.totalTaxRate + b.totalTaxRate) / 2,
      icmsValue: a.icmsValue + b.icmsValue,
      ipiValue: a.ipiValue + b.ipiValue,
      pisValue: a.pisValue + b.pisValue,
      cofinsValue: a.cofinsValue + b.cofinsValue,
      totalTaxValue: a.totalTaxValue + b.totalTaxValue,
    };
  }
}
