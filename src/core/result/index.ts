// ============================================================================
// RESULT PATTERN - Tratamento funcional de erros
// ============================================================================

/**
 * Representa um erro de domínio
 */
export class DomainError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'DomainError';
  }
}

/**
 * Tipos de resultado: sucesso ou falha
 */
export type Result<T, E = DomainError> = Success<T> | Failure<E>;

/**
 * Resultado de sucesso
 */
export class Success<T> {
  readonly isSuccess = true;
  readonly isFailure = false;

  constructor(public readonly value: T) {}

  /**
   * Aplica função se for sucesso
   */
  map<U>(fn: (value: T) => U): Result<U, never> {
    return new Success(fn(this.value));
  }

  /**
   * Aplica função assíncrona se for sucesso
   */
  async mapAsync<U>(fn: (value: T) => Promise<U>): Promise<Result<U, never>> {
    const result = await fn(this.value);
    return new Success(result);
  }

  /**
   * Encadeia outra operação Result
   */
  flatMap<U, E>(fn: (value: T) => Result<U, E>): Result<U, E> {
    return fn(this.value);
  }

  /**
   * Retorna o valor ou executa função padrão
   */
  getOrElse(_defaultValue: T): T {
    return this.value;
  }

  /**
   * Desempacota o valor (lança erro se for Failure)
   */
  unwrap(): T {
    return this.value;
  }
}

/**
 * Resultado de falha
 */
export class Failure<E> {
  readonly isSuccess = false;
  readonly isFailure = true;

  constructor(public readonly error: E) {}

  /**
   * Não aplica função, retorna a falha
   */
  map<U>(_fn: (value: never) => U): Result<U, E> {
    return this as unknown as Result<U, E>;
  }

  /**
   * Não aplica função assíncrona, retorna a falha
   */
  async mapAsync<U>(_fn: (value: never) => Promise<U>): Promise<Result<U, E>> {
    return this as unknown as Result<U, E>;
  }

  /**
   * Não encadeia, retorna a falha
   */
  flatMap<U>(_fn: (value: never) => Result<U, E>): Result<U, E> {
    return this as unknown as Result<U, E>;
  }

  /**
   * Retorna o valor padrão
   */
  getOrElse<T>(defaultValue: T): T {
    return defaultValue;
  }

  /**
   * Lança o erro
   */
  unwrap(): never {
    throw this.error;
  }
}

// ---------------------------------------------------------------------------
// Factory Functions
// ---------------------------------------------------------------------------

/**
 * Cria um Result de sucesso
 */
export function ok<T>(value: T): Success<T> {
  return new Success(value);
}

/**
 * Cria um Result de falha
 */
export function fail<E = DomainError>(error: E): Failure<E> {
  return new Failure(error);
}

/**
 * Cria um erro de domínio
 */
export function domainError(
  code: string,
  message: string,
  details?: Record<string, unknown>,
): DomainError {
  return new DomainError(code, message, details);
}

// ---------------------------------------------------------------------------
// Utility Functions
// ---------------------------------------------------------------------------

/**
 * Combina múltiplos Results - retorna o primeiro erro ou todos os valores
 */
export function combine<T, E>(results: Result<T, E>[]): Result<T[], E> {
  const values: T[] = [];

  for (const result of results) {
    if (result.isFailure) {
      return result as unknown as Failure<E>;
    }
    values.push((result as Success<T>).value);
  }

  return ok(values);
}

/**
 * Executa função e retorna Result
 */
export async function tryCatch<T>(
  fn: () => Promise<T>,
  errorMapper?: (error: unknown) => DomainError,
): Promise<Result<T, DomainError>> {
  try {
    const result = await fn();
    return ok(result);
  } catch (error) {
    if (errorMapper) {
      return fail(errorMapper(error));
    }

    if (error instanceof DomainError) {
      return fail(error);
    }

    return fail(
      domainError(
        'UNEXPECTED_ERROR',
        error instanceof Error ? error.message : 'Erro inesperado',
      ),
    );
  }
}

/**
 * Versão síncrona do tryCatch
 */
export function tryCatchSync<T>(
  fn: () => T,
  errorMapper?: (error: unknown) => DomainError,
): Result<T, DomainError> {
  try {
    const result = fn();
    return ok(result);
  } catch (error) {
    if (errorMapper) {
      return fail(errorMapper(error));
    }

    if (error instanceof DomainError) {
      return fail(error);
    }

    return fail(
      domainError(
        'UNEXPECTED_ERROR',
        error instanceof Error ? error.message : 'Erro inesperado',
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// Erros de Domínio Predefinidos
// ---------------------------------------------------------------------------

export const DomainErrors = {
  notFound: (entity: string, id?: string) =>
    domainError('NOT_FOUND', `${entity} não encontrado(a)`, { entity, id }),

  alreadyExists: (entity: string, field?: string) =>
    domainError('ALREADY_EXISTS', `${entity} já existe`, { entity, field }),

  invalidData: (message: string, details?: Record<string, unknown>) =>
    domainError('INVALID_DATA', message, details),

  unauthorized: (reason?: string) =>
    domainError('UNAUTHORIZED', reason || 'Não autorizado'),

  forbidden: (resource?: string) =>
    domainError(
      'FORBIDDEN',
      `Acesso negado${resource ? ` a ${resource}` : ''}`,
    ),

  insufficientStock: (
    productId: string,
    requested: number,
    available: number,
  ) =>
    domainError('INSUFFICIENT_STOCK', 'Estoque insuficiente', {
      productId,
      requested,
      available,
    }),

  paymentFailed: (reason: string) =>
    domainError('PAYMENT_FAILED', `Falha no pagamento: ${reason}`),

  externalServiceError: (service: string, message: string) =>
    domainError('EXTERNAL_SERVICE_ERROR', message, { service }),
};
