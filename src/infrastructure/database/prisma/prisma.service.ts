import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { createLogger } from '../../../core/logging';
import { PrismaClient, Prisma } from '@prisma/client';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = createLogger(PrismaService.name);

  constructor(private readonly configService: ConfigService) {
    const isDev = configService.get('NODE_ENV') === 'development';

    super({
      log: isDev
        ? [
            { emit: 'event', level: 'query' },
            { emit: 'stdout', level: 'info' },
            { emit: 'stdout', level: 'warn' },
            { emit: 'stdout', level: 'error' },
          ]
        : [
            { emit: 'stdout', level: 'warn' },
            { emit: 'stdout', level: 'error' },
          ],
    });

    // Log slow queries em desenvolvimento
    if (isDev) {
      (this as any).$on('query', (e: Prisma.QueryEvent) => {
        if (e.duration > 100) {
          this.logger.warn(
            `Slow query (${e.duration}ms): ${e.query.substring(0, 100)}...`,
          );
        }
      });
    }
  }

  async onModuleInit() {
    try {
      await this.$connect();
      this.logger.log('Database connection established');
    } catch (error) {
      this.logger.error('Failed to connect to database', error);
      throw error;
    }
  }

  async onModuleDestroy() {
    await this.$disconnect();
    this.logger.log('Database connection closed');
  }

  /**
   * Helper para executar operações em transação
   */
  async executeInTransaction<T>(
    fn: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    return this.$transaction(fn, {
      maxWait: 5000,
      timeout: 10000,
    });
  }

  /**
   * Helper para soft delete
   */
  async softDelete(
    model: string,
    id: string,
    deletedById?: string,
  ): Promise<void> {
    await (this as any)[model].update({
      where: { id },
      data: {
        deletedAt: new Date(),
        ...(deletedById && { deletedById }),
      },
    });
  }

  /**
   * Limpa conexões para testes
   */
  async cleanDatabase(): Promise<void> {
    if (this.configService.get('NODE_ENV') !== 'test') {
      throw new Error('cleanDatabase can only be used in test environment');
    }

    const tables = await this.$queryRaw<{ tablename: string }[]>`
      SELECT tablename FROM pg_tables WHERE schemaname = 'public'
    `;

    for (const { tablename } of tables) {
      if (tablename !== '_prisma_migrations') {
        await this.$executeRawUnsafe(`TRUNCATE TABLE "${tablename}" CASCADE;`);
      }
    }
  }
}
