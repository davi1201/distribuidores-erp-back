// ============================================================================
// RATE LIMITING MODULE - Proteção contra ataques de força bruta
// ============================================================================

import { Module } from '@nestjs/common';
import { ThrottlerModule as NestThrottlerModule } from '@nestjs/throttler';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { CustomThrottlerGuard } from './custom-throttler.guard';

@Module({
  imports: [
    NestThrottlerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => [
        {
          // Limite global: 100 requests por minuto
          name: 'default',
          ttl: config.get<number>('THROTTLE_TTL', 60000),
          limit: config.get<number>('THROTTLE_LIMIT', 100),
        },
        {
          // Limite mais restritivo para login: 5 tentativas por minuto
          name: 'strict',
          ttl: 60000,
          limit: 5,
        },
        {
          // Limite para endpoints de alta carga: 10 por minuto
          name: 'heavy',
          ttl: 60000,
          limit: 10,
        },
      ],
    }),
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: CustomThrottlerGuard,
    },
  ],
  exports: [NestThrottlerModule],
})
export class ThrottlerModule {}
