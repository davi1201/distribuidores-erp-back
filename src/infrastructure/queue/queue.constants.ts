// ============================================================================
// QUEUE CONSTANTS - Constantes do sistema de filas
// ============================================================================

/**
 * Nomes das filas disponíveis
 */
export const QUEUE_NAMES = {
  EMAIL: 'email',
  NFE_IMPORT: 'nfe-import',
  COMMISSION: 'commission',
  REPORT: 'report',
} as const;

export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];
