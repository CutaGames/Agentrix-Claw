import { Module, Global } from '@nestjs/common';
import { CacheService } from './cache.service';
import { CacheOptimizationService } from './cache-optimization.service';

@Global()
@Module({
  providers: [CacheService, CacheOptimizationService],
  exports: [CacheService, CacheOptimizationService],
})
export class CacheModule {}

