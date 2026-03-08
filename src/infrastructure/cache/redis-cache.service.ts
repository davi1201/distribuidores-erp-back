// ============================================================================
// REDIS CACHE SERVICE - Cache Distribuído para Escalabilidade
// ============================================================================

import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { createLogger } from '../../core/logging';
import { CACHE_TTL } from '../../core/constants';

@Injectable()
export class RedisCacheService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = createLogger(RedisCacheService.name);
  private redis: Redis | null = null;
  private isConnected = false;

  constructor(private readonly config: ConfigService) {}

  async onModuleInit(): Promise<void> {
    const redisUrl = this.config.get<string>('REDIS_URL');

    if (!redisUrl) {
      this.logger.warn(
        'REDIS_URL não configurado - cache distribuído desabilitado',
      );
      return;
    }

    try {
      this.redis = new Redis(redisUrl, {
        maxRetriesPerRequest: 3,
        lazyConnect: true,
      });

      await this.redis.connect();
      this.isConnected = true;
      this.logger.log('Conectado ao Redis com sucesso');

      this.redis.on('error', (err) => {
        this.logger.error('Erro na conexão Redis', err.message);
        this.isConnected = false;
      });

      this.redis.on('reconnecting', () => {
        this.logger.warn('Reconectando ao Redis...');
      });
    } catch (error) {
      this.logger.error('Falha ao conectar ao Redis', error.message);
      this.isConnected = false;
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (this.redis) {
      await this.redis.quit();
      this.logger.log('Desconectado do Redis');
    }
  }

  /**
   * Verifica se o cache está disponível
   */
  isAvailable(): boolean {
    return this.isConnected && this.redis !== null;
  }

  /**
   * Busca valor do cache ou executa o fetcher e armazena
   */
  async getOrSet<T>(
    key: string,
    fetcher: () => Promise<T>,
    ttlSeconds: number = CACHE_TTL.MEDIUM,
  ): Promise<T> {
    if (!this.isAvailable()) {
      return fetcher();
    }

    try {
      const cached = await this.redis!.get(key);
      if (cached) {
        return JSON.parse(cached);
      }

      const value = await fetcher();
      await this.set(key, value, ttlSeconds);
      return value;
    } catch (error) {
      this.logger.debug(`Cache miss para key: ${key}`, {
        error: error.message,
      });
      return fetcher();
    }
  }

  /**
   * Busca valor do cache
   */
  async get<T>(key: string): Promise<T | null> {
    if (!this.isAvailable()) return null;

    try {
      const value = await this.redis!.get(key);
      return value ? JSON.parse(value) : null;
    } catch {
      return null;
    }
  }

  /**
   * Armazena valor no cache
   */
  async set<T>(
    key: string,
    value: T,
    ttlSeconds: number = CACHE_TTL.MEDIUM,
  ): Promise<void> {
    if (!this.isAvailable()) return;

    try {
      await this.redis!.setex(key, ttlSeconds, JSON.stringify(value));
    } catch (error) {
      this.logger.debug(`Falha ao cachear key: ${key}`, {
        error: error.message,
      });
    }
  }

  /**
   * Invalida uma chave específica
   */
  async invalidate(key: string): Promise<void> {
    if (!this.isAvailable()) return;

    try {
      await this.redis!.del(key);
    } catch (error) {
      this.logger.debug(`Falha ao invalidar key: ${key}`, {
        error: error.message,
      });
    }
  }

  /**
   * Invalida todas as chaves que começam com o prefixo
   */
  async invalidateByPrefix(prefix: string): Promise<void> {
    if (!this.isAvailable()) return;

    try {
      const keys = await this.redis!.keys(`${prefix}*`);
      if (keys.length > 0) {
        await this.redis!.del(...keys);
        this.logger.debug(
          `Invalidadas ${keys.length} chaves com prefixo: ${prefix}`,
        );
      }
    } catch (error) {
      this.logger.debug(`Falha ao invalidar prefixo: ${prefix}`, {
        error: error.message,
      });
    }
  }

  /**
   * Invalida cache de um tenant específico
   */
  async invalidateTenant(tenantId: string): Promise<void> {
    await this.invalidateByPrefix(`tenant:${tenantId}`);
  }

  /**
   * Limpa todo o cache
   */
  async clear(): Promise<void> {
    if (!this.isAvailable()) return;

    try {
      await this.redis!.flushdb();
      this.logger.log('Cache limpo');
    } catch (error) {
      this.logger.error('Falha ao limpar cache', error.message);
    }
  }

  /**
   * Obtém estatísticas do cache
   */
  async getStats(): Promise<{
    connected: boolean;
    keys: number;
    memory: string;
  }> {
    if (!this.isAvailable()) {
      return { connected: false, keys: 0, memory: '0' };
    }

    try {
      const info = await this.redis!.info('memory');
      const dbSize = await this.redis!.dbsize();
      const memoryMatch = info.match(/used_memory_human:(\S+)/);

      return {
        connected: true,
        keys: dbSize,
        memory: memoryMatch?.[1] || 'unknown',
      };
    } catch {
      return { connected: false, keys: 0, memory: '0' };
    }
  }
}
