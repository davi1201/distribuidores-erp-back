/**
 * Standard success response wrapper.
 */
export class SuccessResponseDto<T> {
  success: boolean = true;
  data: T;
  message?: string;
  timestamp: string;

  constructor(data: T, message?: string) {
    this.data = data;
    this.message = message;
    this.timestamp = new Date().toISOString();
  }
}

/**
 * Standard error response structure.
 */
export class ErrorResponseDto {
  success: boolean = false;
  message: string;
  code: string;
  details?: Record<string, unknown>;
  timestamp: string;

  constructor(
    message: string,
    code: string,
    details?: Record<string, unknown>,
  ) {
    this.message = message;
    this.code = code;
    this.details = details;
    this.timestamp = new Date().toISOString();
  }
}

/**
 * Helper to create success response.
 */
export function success<T>(data: T, message?: string): SuccessResponseDto<T> {
  return new SuccessResponseDto(data, message);
}

/**
 * Helper to create delete/void success response.
 */
export function deleted(
  message = 'Registro removido com sucesso',
): SuccessResponseDto<null> {
  return new SuccessResponseDto(null, message);
}
