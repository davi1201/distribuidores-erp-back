import { HttpException, HttpStatus } from '@nestjs/common';

/**
 * Base class for all domain-specific exceptions.
 * Provides consistent error handling across the application.
 */
export class DomainException extends HttpException {
  constructor(
    message: string,
    statusCode: HttpStatus = HttpStatus.BAD_REQUEST,
    public readonly code?: string,
    public readonly details?: Record<string, unknown>,
  ) {
    super(
      {
        message,
        code: code || 'DOMAIN_ERROR',
        details,
        timestamp: new Date().toISOString(),
      },
      statusCode,
    );
  }
}

/**
 * Thrown when a requested resource is not found.
 */
export class NotFoundException extends DomainException {
  constructor(resource: string, identifier?: string | number) {
    const message = identifier
      ? `${resource} com identificador "${identifier}" não encontrado`
      : `${resource} não encontrado`;
    super(message, HttpStatus.NOT_FOUND, 'RESOURCE_NOT_FOUND', {
      resource,
      identifier,
    });
  }
}

/**
 * Thrown when validation fails.
 */
export class ValidationException extends DomainException {
  constructor(message: string, fields?: Record<string, string[]>) {
    super(message, HttpStatus.BAD_REQUEST, 'VALIDATION_ERROR', { fields });
  }
}

/**
 * Thrown when business rules are violated.
 */
export class BusinessRuleException extends DomainException {
  constructor(message: string, rule?: string) {
    super(message, HttpStatus.UNPROCESSABLE_ENTITY, 'BUSINESS_RULE_VIOLATION', {
      rule,
    });
  }
}

/**
 * Thrown when user doesn't have permission.
 */
export class ForbiddenException extends DomainException {
  constructor(message = 'Você não tem permissão para realizar esta ação') {
    super(message, HttpStatus.FORBIDDEN, 'FORBIDDEN');
  }
}

/**
 * Thrown when authentication fails.
 */
export class UnauthorizedException extends DomainException {
  constructor(message = 'Autenticação necessária') {
    super(message, HttpStatus.UNAUTHORIZED, 'UNAUTHORIZED');
  }
}

/**
 * Thrown when there's a conflict (e.g., duplicate resource).
 */
export class ConflictException extends DomainException {
  constructor(message: string, resource?: string) {
    super(message, HttpStatus.CONFLICT, 'CONFLICT', { resource });
  }
}

/**
 * Thrown when external service fails.
 */
export class ExternalServiceException extends DomainException {
  constructor(service: string, originalError?: string) {
    super(
      `Erro ao comunicar com serviço externo: ${service}`,
      HttpStatus.BAD_GATEWAY,
      'EXTERNAL_SERVICE_ERROR',
      { service, originalError },
    );
  }
}
