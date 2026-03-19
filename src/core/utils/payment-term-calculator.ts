// ============================================================================
// CALCULADORA DE CONDIÇÕES DE PAGAMENTO (Padrão ERP)
// ============================================================================
// Calcula descontos por pontualidade e juros/multa por atraso
// Baseado nas melhores práticas de ERPs como SAP, TOTVS e Oracle NetSuite
// ============================================================================

// Tipo genérico para aceitar Decimal do Prisma ou number
type DecimalLike = { toNumber(): number } | number;

export interface PaymentTermConfig {
  discountPercentage: DecimalLike;
  discountDays: number;
  interestPercentage: DecimalLike; // Juros ao mês
  finePercentage: DecimalLike; // Multa fixa por atraso
}

export interface PaymentCalculationInput {
  originalAmount: number;
  issueDate: Date; // Data de emissão do título
  dueDate: Date; // Data de vencimento
  paymentDate: Date; // Data do pagamento efetivo
  paymentTermConfig: PaymentTermConfig;
}

export interface PaymentCalculationResult {
  originalAmount: number;
  discountAmount: number;
  fineAmount: number;
  interestAmount: number;
  finalAmount: number;
  daysLate: number;
  daysEarly: number;
  isEligibleForDiscount: boolean;
  breakdown: {
    description: string;
    value: number;
  }[];
}

/**
 * Converte Decimal para number de forma segura
 */
function toNum(value: DecimalLike | null | undefined): number {
  if (value === null || value === undefined) return 0;
  if (typeof value === 'number') return value;
  if (typeof value === 'object' && 'toNumber' in value) return value.toNumber();
  return Number(value);
}

/**
 * Calcula a diferença em dias entre duas datas
 */
function diffInDays(date1: Date, date2: Date): number {
  const diffTime = date1.getTime() - date2.getTime();
  return Math.floor(diffTime / (1000 * 60 * 60 * 24));
}

/**
 * Calcula o valor final de um pagamento considerando desconto, juros e multa
 * seguindo as regras configuradas na Condição de Pagamento (PaymentTerm)
 *
 * @example
 * // Pagamento pontual com desconto
 * const result = calculatePaymentAmount({
 *   originalAmount: 1000,
 *   issueDate: new Date('2024-01-01'),
 *   dueDate: new Date('2024-01-30'),
 *   paymentDate: new Date('2024-01-10'),
 *   paymentTermConfig: {
 *     discountPercentage: 5, // 5% de desconto
 *     discountDays: 10,      // Se pagar em até 10 dias
 *     interestPercentage: 1, // 1% de juros ao mês
 *     finePercentage: 2,     // 2% de multa
 *   }
 * });
 * // result.finalAmount = 950 (5% de desconto aplicado)
 */
export function calculatePaymentAmount(
  input: PaymentCalculationInput,
): PaymentCalculationResult {
  const { originalAmount, issueDate, dueDate, paymentDate, paymentTermConfig } =
    input;

  const discountPercent = toNum(paymentTermConfig.discountPercentage);
  const discountDays = paymentTermConfig.discountDays;
  const interestPercent = toNum(paymentTermConfig.interestPercentage);
  const finePercent = toNum(paymentTermConfig.finePercentage);

  const breakdown: { description: string; value: number }[] = [];
  let finalAmount = originalAmount;
  let discountAmount = 0;
  let fineAmount = 0;
  let interestAmount = 0;

  // Calcula dias de antecipação ou atraso
  const daysFromIssue = diffInDays(paymentDate, issueDate);
  const daysFromDue = diffInDays(paymentDate, dueDate);

  const daysEarly = daysFromDue < 0 ? Math.abs(daysFromDue) : 0;
  const daysLate = daysFromDue > 0 ? daysFromDue : 0;

  // Verifica elegibilidade para desconto
  const isEligibleForDiscount =
    discountPercent > 0 && discountDays > 0 && daysFromIssue <= discountDays;

  // =========================================================================
  // CENÁRIO 1: Pagamento com desconto (dentro do prazo de antecipação)
  // =========================================================================
  if (isEligibleForDiscount) {
    discountAmount = (originalAmount * discountPercent) / 100;
    finalAmount = originalAmount - discountAmount;
    breakdown.push({
      description: `Desconto por pontualidade (${discountPercent}%)`,
      value: -discountAmount,
    });
  }

  // =========================================================================
  // CENÁRIO 2: Pagamento em atraso (após vencimento)
  // =========================================================================
  if (daysLate > 0) {
    // Multa fixa por atraso
    if (finePercent > 0) {
      fineAmount = (originalAmount * finePercent) / 100;
      finalAmount += fineAmount;
      breakdown.push({
        description: `Multa por atraso (${finePercent}%)`,
        value: fineAmount,
      });
    }

    // Juros pro-rata (mensal -> diário)
    if (interestPercent > 0) {
      const dailyInterest = interestPercent / 30; // Taxa diária
      interestAmount = (originalAmount * dailyInterest * daysLate) / 100;
      finalAmount += interestAmount;
      breakdown.push({
        description: `Juros de mora (${interestPercent}% a.m. x ${daysLate} dias)`,
        value: interestAmount,
      });
    }
  }

  return {
    originalAmount,
    discountAmount: Math.round(discountAmount * 100) / 100,
    fineAmount: Math.round(fineAmount * 100) / 100,
    interestAmount: Math.round(interestAmount * 100) / 100,
    finalAmount: Math.round(finalAmount * 100) / 100,
    daysLate,
    daysEarly,
    isEligibleForDiscount,
    breakdown,
  };
}

/**
 * Calcula o valor do desconto para uma data de pagamento específica
 * Útil para exibir ao cliente o valor do desconto disponível
 */
export function calculateEarlyPaymentDiscount(
  amount: number,
  issueDate: Date,
  discountPercentage: DecimalLike,
  discountDays: number,
  checkDate: Date = new Date(),
): { discountAmount: number; isEligible: boolean; daysRemaining: number } {
  const discountPercent = toNum(discountPercentage);
  const daysFromIssue = diffInDays(checkDate, issueDate);
  const daysRemaining = discountDays - daysFromIssue;
  const isEligible = discountPercent > 0 && daysRemaining > 0;

  const discountAmount = isEligible ? (amount * discountPercent) / 100 : 0;

  return {
    discountAmount: Math.round(discountAmount * 100) / 100,
    isEligible,
    daysRemaining: Math.max(0, daysRemaining),
  };
}

/**
 * Calcula juros e multa acumulados para uma data
 * Útil para exibir ao cliente o valor atualizado da dívida
 */
export function calculateLatePaymentCharges(
  amount: number,
  dueDate: Date,
  interestPercentage: DecimalLike,
  finePercentage: DecimalLike,
  checkDate: Date = new Date(),
): {
  fineAmount: number;
  interestAmount: number;
  totalCharges: number;
  daysLate: number;
} {
  const interestPercent = toNum(interestPercentage);
  const finePercent = toNum(finePercentage);
  const daysLate = Math.max(0, diffInDays(checkDate, dueDate));

  if (daysLate === 0) {
    return { fineAmount: 0, interestAmount: 0, totalCharges: 0, daysLate: 0 };
  }

  const fineAmount = (amount * finePercent) / 100;
  const dailyInterest = interestPercent / 30;
  const interestAmount = (amount * dailyInterest * daysLate) / 100;

  return {
    fineAmount: Math.round(fineAmount * 100) / 100,
    interestAmount: Math.round(interestAmount * 100) / 100,
    totalCharges: Math.round((fineAmount + interestAmount) * 100) / 100,
    daysLate,
  };
}
