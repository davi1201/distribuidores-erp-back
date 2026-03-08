// ============================================================================
// QUEUE MODULE - Sistema de Filas Assíncronas com BullMQ
// ============================================================================

import { Module, Global, DynamicModule, Logger } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ConfigModule, ConfigService } from '@nestjs/config';

// Constantes
import { QUEUE_NAMES } from './queue.constants';

// Processadores de filas
import { EmailProcessor } from './processors/email.processor';
import { NfeImportProcessor } from './processors/nfe-import.processor';
import { CommissionProcessor } from './processors/commission.processor';

// Re-exporta constantes para compatibilidade
export { QUEUE_NAMES } from './queue.constants';

@Global()
@Module({})
export class QueueModule {
  private static readonly logger = new Logger(QueueModule.name);

  static forRoot(): DynamicModule {
    const redisEnabled = process.env.REDIS_ENABLED === 'true';

    if (!redisEnabled) {
      this.logger.warn(
        'Redis não habilitado (REDIS_ENABLED != true). Sistema de filas desativado.',
      );
      return {
        module: QueueModule,
        imports: [],
        providers: [],
        exports: [],
      };
    }

    return {
      module: QueueModule,
      imports: [
        BullModule.forRootAsync({
          imports: [ConfigModule],
          inject: [ConfigService],
          useFactory: (config: ConfigService) => ({
            connection: {
              host: config.get<string>('REDIS_HOST', 'localhost'),
              port: config.get<number>('REDIS_PORT', 6379),
              password: config.get<string>('REDIS_PASSWORD'),
            },
            defaultJobOptions: {
              removeOnComplete: 100,
              removeOnFail: 500,
              attempts: 3,
              backoff: {
                type: 'exponential',
                delay: 1000,
              },
            },
          }),
        }),
        BullModule.registerQueue(
          { name: QUEUE_NAMES.EMAIL },
          { name: QUEUE_NAMES.NFE_IMPORT },
          { name: QUEUE_NAMES.COMMISSION },
          { name: QUEUE_NAMES.REPORT },
        ),
      ],
      providers: [EmailProcessor, NfeImportProcessor, CommissionProcessor],
      exports: [BullModule],
    };
  }
}
