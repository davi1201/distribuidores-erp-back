// ============================================================================
// LOGGER CUSTOMIZADO COM CONTEXTO PADRONIZADO
// ============================================================================

import { Logger, LoggerService, Injectable, Scope } from '@nestjs/common';

export interface LogContext {
  tenantId?: string;
  userId?: string;
  requestId?: string;
  [key: string]: unknown;
}

@Injectable({ scope: Scope.TRANSIENT })
export class AppLogger implements LoggerService {
  private logger: Logger = new Logger('Application');
  private context = 'Application';
  private defaultMeta: LogContext = {};

  setContext(context: string): this {
    this.context = context;
    this.logger = new Logger(context);
    return this;
  }

  setDefaultMeta(meta: LogContext): this {
    this.defaultMeta = { ...this.defaultMeta, ...meta };
    return this;
  }

  private formatMessage(message: string, meta?: LogContext): string {
    const combinedMeta = { ...this.defaultMeta, ...meta };
    const metaEntries = Object.entries(combinedMeta).filter(
      ([, v]) => v !== undefined,
    );

    if (metaEntries.length === 0) return message;

    const metaStr = metaEntries
      .map(([k, v]) => `${k}=${JSON.stringify(v)}`)
      .join(' ');

    return `${message} | ${metaStr}`;
  }

  log(message: string, meta?: LogContext): void {
    this.logger.log(this.formatMessage(message, meta));
  }

  info(message: string, meta?: LogContext): void {
    this.log(message, meta);
  }

  error(message: string, trace?: string, meta?: LogContext): void {
    this.logger.error(this.formatMessage(message, meta), trace);
  }

  warn(message: string, meta?: LogContext): void {
    this.logger.warn(this.formatMessage(message, meta));
  }

  debug(message: string, meta?: LogContext): void {
    this.logger.debug(this.formatMessage(message, meta));
  }

  verbose(message: string, meta?: LogContext): void {
    this.logger.verbose(this.formatMessage(message, meta));
  }

  // Métodos específicos de domínio
  logOperation(
    operation: string,
    status: 'started' | 'completed' | 'failed',
    meta?: LogContext,
  ): void {
    const emoji =
      status === 'completed' ? '✅' : status === 'failed' ? '❌' : '🔄';
    this.log(`${emoji} ${operation} ${status}`, meta);
  }

  logDatabaseQuery(query: string, duration: number, meta?: LogContext): void {
    if (duration > 100) {
      this.warn(
        `Slow query (${duration}ms): ${query.substring(0, 100)}...`,
        meta,
      );
    } else {
      this.debug(`Query (${duration}ms): ${query.substring(0, 50)}...`, meta);
    }
  }

  logHttpRequest(
    method: string,
    url: string,
    statusCode: number,
    duration: number,
    meta?: LogContext,
  ): void {
    const message = `${method} ${url} ${statusCode} - ${duration}ms`;

    if (statusCode >= 500) {
      this.error(message, undefined, meta);
    } else if (statusCode >= 400) {
      this.warn(message, meta);
    } else {
      this.log(message, meta);
    }
  }

  logBusinessEvent(event: string, details: Record<string, unknown>): void {
    this.log(`[BUSINESS] ${event}`, details as LogContext);
  }

  logSecurityEvent(event: string, details: Record<string, unknown>): void {
    this.warn(`[SECURITY] ${event}`, details as LogContext);
  }
}

/**
 * Factory function para criar logger com contexto
 */
export function createLogger(
  context: string,
  defaultMeta?: LogContext,
): AppLogger {
  const logger = new AppLogger();
  logger.setContext(context);
  if (defaultMeta) {
    logger.setDefaultMeta(defaultMeta);
  }
  return logger;
}
