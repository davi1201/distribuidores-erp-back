// ============================================================================
// UTILITÁRIOS DE DATA
// ============================================================================

import {
  format,
  parseISO,
  startOfDay,
  endOfDay,
  startOfMonth,
  endOfMonth,
  addDays,
  addMonths,
  differenceInDays,
  isAfter,
  isBefore,
  isToday,
} from 'date-fns';
import { ptBR } from 'date-fns/locale';

/**
 * Formata data para exibição brasileira
 */
export function formatDateBR(date: Date | string): string {
  const d = typeof date === 'string' ? parseISO(date) : date;
  return format(d, 'dd/MM/yyyy', { locale: ptBR });
}

/**
 * Formata data e hora para exibição
 */
export function formatDateTimeBR(date: Date | string): string {
  const d = typeof date === 'string' ? parseISO(date) : date;
  return format(d, "dd/MM/yyyy 'às' HH:mm", { locale: ptBR });
}

/**
 * Formata mês abreviado
 */
export function formatMonthShort(date: Date): string {
  return format(date, 'MMM', { locale: ptBR });
}

/**
 * Formata mês completo com ano
 */
export function formatMonthYear(date: Date): string {
  return format(date, 'MMMM/yyyy', { locale: ptBR });
}

/**
 * Verifica se data está vencida
 */
export function isOverdue(dueDate: Date): boolean {
  const today = startOfDay(new Date());
  const due = startOfDay(dueDate);
  return isBefore(due, today);
}

/**
 * Calcula dias de atraso
 */
export function daysOverdue(dueDate: Date): number {
  const today = startOfDay(new Date());
  const due = startOfDay(dueDate);

  if (!isBefore(due, today)) return 0;
  return differenceInDays(today, due);
}

/**
 * Retorna início e fim do mês atual
 */
export function getCurrentMonthRange(): { start: Date; end: Date } {
  const now = new Date();
  return {
    start: startOfMonth(now),
    end: endOfMonth(now),
  };
}

/**
 * Retorna início e fim do dia
 */
export function getDayRange(date: Date): { start: Date; end: Date } {
  return {
    start: startOfDay(date),
    end: endOfDay(date),
  };
}

/**
 * Calcula data de vencimento baseada em dias
 */
export function calculateDueDate(baseDate: Date, days: number): Date {
  return addDays(baseDate, days);
}

/**
 * Gera array de datas para parcelas
 */
export function generateInstallmentDates(
  startDate: Date,
  installments: number,
  intervalDays = 30,
): Date[] {
  const dates: Date[] = [];

  for (let i = 0; i < installments; i++) {
    dates.push(addDays(startDate, intervalDays * i));
  }

  return dates;
}

// Re-exports para uso direto
export {
  addDays,
  addMonths,
  startOfDay,
  endOfDay,
  startOfMonth,
  endOfMonth,
  differenceInDays,
  isAfter,
  isBefore,
  isToday,
  parseISO,
  format,
};
