import { Injectable } from '@nestjs/common';
import { createLogger } from '../../core/logging';
import { CACHE_TTL } from '../../core/constants';

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

@Injectable()
export class CacheService {
  private readonly logger = createLogger(CacheService.name);
  private readonly cache = new Map<string, CacheEntry<any>>();

  // Re-export para manter compatibilidade
  static readonly TTL = CACHE_TTL;

  /**
   * Busca valor do cache ou executa a função e armazena o resultado
   */
  async getOrSet<T>(
    key: string,
    fetcher: () => Promise<T>,
    ttlSeconds: number = CacheService.TTL.MEDIUM,
  ): Promise<T> {
    const cached = this.get<T>(key);
    if (cached !== undefined) {
      return cached;
    }

    const value = await fetcher();
    this.set(key, value, ttlSeconds);
    return value;
  }

  /**
   * Busca valor do cache
   */
  get<T>(key: string): T | undefined {
    const entry = this.cache.get(key);

    if (!entry) {
      return undefined;
    }

    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return undefined;
    }

    return entry.value as T;
  }

  /**
   * Armazena valor no cache
   */
  set<T>(
    key: string,
    value: T,
    ttlSeconds: number = CacheService.TTL.MEDIUM,
  ): void {
    this.cache.set(key, {
      value,
      expiresAt: Date.now() + ttlSeconds * 1000,
    });
  }

  /**
   * Invalida uma chave específica
   */
  invalidate(key: string): void {
    this.cache.delete(key);
  }

  /**
   * Invalida todas as chaves que começam com o prefixo
   */
  invalidateByPrefix(prefix: string): void {
    for (const key of this.cache.keys()) {
      if (key.startsWith(prefix)) {
        this.cache.delete(key);
      }
    }
  }

  /**
   * Invalida cache de um tenant específico
   */
  invalidateTenant(tenantId: string): void {
    this.invalidateByPrefix(`tenant:${tenantId}`);
  }

  /**
   * Limpa todo o cache
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * Gera chave de cache padronizada
   */
  static key(...parts: (string | number | undefined)[]): string {
    return parts.filter(Boolean).join(':');
  }

  /**
   * Estatísticas do cache
   */
  getStats(): { size: number; keys: string[] } {
    return {
      size: this.cache.size,
      keys: Array.from(this.cache.keys()),
    };
  }
}

// Keys helpers para uso consistente
export const CacheKeys = {
  // Tenant
  tenant: (id: string) => `tenant:${id}`,
  tenantConfig: (id: string) => `tenant:${id}:config`,
  tenantPaymentMethods: (id: string) => `tenant:${id}:payment-methods`,

  // Locations
  states: () => 'locations:states',
  citiesByState: (stateId: number) => `locations:cities:${stateId}`,

  // Products
  productById: (id: string) => `product:${id}`,
  productsByTenant: (tenantId: string) => `tenant:${tenantId}:products`,
  sellableProducts: (tenantId: string) =>
    `tenant:${tenantId}:products:sellable`,

  // Price Lists
  priceList: (id: string) => `price-list:${id}`,
  priceListsByTenant: (tenantId: string) => `tenant:${tenantId}:price-lists`,

  // Warehouses
  warehousesByTenant: (tenantId: string) => `tenant:${tenantId}:warehouses`,
  defaultWarehouse: (tenantId: string) =>
    `tenant:${tenantId}:warehouse:default`,

  // Dashboard
  dashboardOverview: (tenantId: string, oderId: string) =>
    `tenant:${tenantId}:dashboard:${oderId}`,

  // System
  systemPaymentMethods: () => 'system:payment-methods',
};
