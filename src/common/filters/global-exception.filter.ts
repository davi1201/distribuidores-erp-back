import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { createLogger } from '../../core/logging';
import { Request, Response } from 'express';
import { DomainException } from '../exceptions/domain.exception';
import { Prisma } from '@prisma/client';

interface ErrorResponse {
  statusCode: number;
  message: string;
  code: string;
  details?: Record<string, unknown>;
  timestamp: string;
  path: string;
}

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = createLogger(GlobalExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const errorResponse = this.buildErrorResponse(exception, request.url);

    // Log detailed error for debugging
    this.logError(exception, request, errorResponse);

    response.status(errorResponse.statusCode).json(errorResponse);
  }

  private buildErrorResponse(exception: unknown, path: string): ErrorResponse {
    const timestamp = new Date().toISOString();

    // Handle Domain Exceptions
    if (exception instanceof DomainException) {
      const response = exception.getResponse() as Record<string, unknown>;
      return {
        statusCode: exception.getStatus(),
        message: response.message as string,
        code: response.code as string,
        details: response.details as Record<string, unknown>,
        timestamp,
        path,
      };
    }

    // Handle Prisma Errors
    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      return this.handlePrismaError(exception, path, timestamp);
    }

    // Handle standard HTTP exceptions
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const response = exception.getResponse();
      const message =
        typeof response === 'object' && 'message' in response
          ? Array.isArray((response as Record<string, unknown>).message)
            ? ((response as Record<string, unknown>).message as string[]).join(
                ', ',
              )
            : ((response as Record<string, unknown>).message as string)
          : exception.message;

      return {
        statusCode: status,
        message,
        code: 'HTTP_ERROR',
        timestamp,
        path,
      };
    }

    // Handle unknown errors
    return {
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      message: 'Erro interno do servidor',
      code: 'INTERNAL_ERROR',
      timestamp,
      path,
    };
  }

  private handlePrismaError(
    exception: Prisma.PrismaClientKnownRequestError,
    path: string,
    timestamp: string,
  ): ErrorResponse {
    switch (exception.code) {
      case 'P2002':
        return {
          statusCode: HttpStatus.CONFLICT,
          message: 'Registro duplicado. Este valor já existe.',
          code: 'DUPLICATE_ENTRY',
          details: { fields: exception.meta?.target },
          timestamp,
          path,
        };
      case 'P2025':
        return {
          statusCode: HttpStatus.NOT_FOUND,
          message: 'Registro não encontrado.',
          code: 'NOT_FOUND',
          timestamp,
          path,
        };
      case 'P2003':
        return {
          statusCode: HttpStatus.BAD_REQUEST,
          message: 'Violação de chave estrangeira.',
          code: 'FOREIGN_KEY_VIOLATION',
          timestamp,
          path,
        };
      default:
        return {
          statusCode: HttpStatus.BAD_REQUEST,
          message: 'Erro de banco de dados.',
          code: 'DATABASE_ERROR',
          details: { prismaCode: exception.code },
          timestamp,
          path,
        };
    }
  }

  private logError(
    exception: unknown,
    request: Request,
    errorResponse: ErrorResponse,
  ) {
    const logMessage = {
      statusCode: errorResponse.statusCode,
      message: errorResponse.message,
      code: errorResponse.code,
      method: request.method,
      url: request.url,
      userId: (request as Request & { user?: { id: string } }).user?.id,
      body: this.sanitizeBody(request.body),
      stack:
        exception instanceof Error
          ? exception.stack
          : 'No stack trace available',
    };

    if (errorResponse.statusCode >= 500) {
      this.logger.error(JSON.stringify(logMessage, null, 2));
    } else if (errorResponse.statusCode >= 400) {
      this.logger.warn(JSON.stringify(logMessage, null, 2));
    }
  }

  private sanitizeBody(body: Record<string, unknown>): Record<string, unknown> {
    if (!body || typeof body !== 'object') return body;

    const sensitiveFields = ['password', 'token', 'secret', 'accessToken'];
    const sanitized = { ...body };

    for (const field of sensitiveFields) {
      if (field in sanitized) {
        sanitized[field] = '[REDACTED]';
      }
    }

    return sanitized;
  }
}
