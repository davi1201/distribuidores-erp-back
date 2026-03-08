// ============================================================================
// UTILITÁRIOS NUMÉRICOS
// ============================================================================

import { Decimal } from '@prisma/client/runtime/library';

/**
 * Converte valor para número seguro (trata Decimal do Prisma)
 */
export function toNumber(
  value: number | Decimal | string | null | undefined,
): number {
  if (value === null || value === undefined) return 0;
  if (typeof value === 'number') return value;
  if (value instanceof Decimal) return value.toNumber();
  return Number(value) || 0;
}

/**
 * Converte para Decimal do Prisma
 */
export function toDecimal(value: number | string): Decimal {
  return new Decimal(value);
}

/**
 * Formata valor monetário em BRL
 */
export function formatCurrency(value: number, currency = 'BRL'): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency,
  }).format(value);
}

/**
 * Formata porcentagem
 */
export function formatPercentage(value: number, decimals = 2): string {
  return `${value.toFixed(decimals)}%`;
}

/**
 * Arredonda para N casas decimais
 */
export function roundTo(value: number, decimals = 2): number {
  const factor = Math.pow(10, decimals);
  return Math.round(value * factor) / factor;
}

/**
 * Calcula porcentagem
 */
export function calculatePercentage(value: number, total: number): number {
  if (total === 0) return 0;
  return roundTo((value / total) * 100, 2);
}

/**
 * Aplica markup sobre valor
 */
export function applyMarkup(cost: number, markupPercent: number): number {
  return roundTo(cost * (1 + markupPercent / 100), 2);
}

/**
 * Calcula markup entre custo e preço de venda
 */
export function calculateMarkup(cost: number, salePrice: number): number {
  if (cost === 0) return 0;
  return roundTo(((salePrice - cost) / cost) * 100, 2);
}

/**
 * Gera número de documento com padding
 */
export function generateDocNumber(doc: string | number, length = 4): string {
  const num = Number(doc);
  if (isNaN(num)) return String(doc);
  return String(num).padStart(length, '0');
}

/**
 * Valida se valor é positivo
 */
export function isPositive(value: number): boolean {
  return value > 0;
}

/**
 * Garante que valor não seja negativo
 */
export function ensureNonNegative(value: number): number {
  return Math.max(0, value);
}
