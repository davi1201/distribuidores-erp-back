// ============================================================================
// CUSTOM THROTTLER GUARD - Personalização do Rate Limiting
// ============================================================================

import { Injectable, ExecutionContext } from '@nestjs/common';
import { ThrottlerGuard, ThrottlerException } from '@nestjs/throttler';
import { Reflector } from '@nestjs/core';
import { createLogger } from '../../core/logging';

/**
 * Lista de rotas que devem ser ignoradas pelo rate limiting
 * Ex: webhooks externos que precisam de alta disponibilidade
 */
const SKIP_ROUTES = [
  '/webhooks/asaas',
  '/webhooks/stripe',
  '/webhooks/clerk',
  '/health',
  '/ready',
  '/overview',
  '/commissions/my-metrics',
  '/users/me',
];

/**
 * Rotas com limite mais restritivo (autenticação)
 */
const STRICT_ROUTES = [
  '/auth/login',
  '/auth/register',
  '/auth/forgot-password',
];

@Injectable()
export class CustomThrottlerGuard extends ThrottlerGuard {
  private readonly logger = createLogger(CustomThrottlerGuard.name);

  /**
   * Gera chave única por IP + rota
   */
  protected async getTracker(req: Record<string, any>): Promise<string> {
    const ip = this.getClientIp(req);
    const route = req.url || req.path || 'unknown';
    return `${ip}-${route}`;
  }

  /**
   * Ignora rate limiting para rotas específicas
   */
  protected async shouldSkip(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const path = request.url || request.path;

    // Webhooks e health checks ignoram rate limiting
    if (SKIP_ROUTES.some((route) => path.startsWith(route))) {
      return true;
    }

    return false;
  }

  /**
   * Extrai IP real do cliente (considerando proxies)
   */
  private getClientIp(req: Record<string, any>): string {
    const forwarded = req.headers?.['x-forwarded-for'];
    const realIp = req.headers?.['x-real-ip'];

    if (forwarded) {
      return String(forwarded).split(',')[0].trim();
    }

    if (realIp) {
      return String(realIp);
    }

    return req.ip || req.connection?.remoteAddress || 'unknown';
  }

  /**
   * Handler de erro personalizado
   */
  protected async throwThrottlingException(
    context: ExecutionContext,
  ): Promise<void> {
    const request = context.switchToHttp().getRequest();
    const ip = this.getClientIp(request);
    const path = request.url || request.path;

    this.logger.warn(`Rate limit excedido`, {
      ip,
      path,
      userAgent: request.headers?.['user-agent'],
    });

    throw new ThrottlerException(
      'Muitas requisições. Por favor, aguarde antes de tentar novamente.',
    );
  }
}
