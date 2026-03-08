import { Module, Global } from '@nestjs/common';
import { CacheService } from './cache.service';
import { RedisCacheService } from './redis-cache.service';

@Global()
@Module({
  providers: [CacheService, RedisCacheService],
  exports: [CacheService, RedisCacheService],
})
export class CacheModule {}
