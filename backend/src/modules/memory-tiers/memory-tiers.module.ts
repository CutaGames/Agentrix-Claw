import { Module } from '@nestjs/common';
import { MemoryTiersService } from './memory-tiers.service';
import { MemoryTiersController } from './memory-tiers.controller';

/**
 * MemoryTiersModule — 顿领 §5.5 4 层记忆 API 标准化
 *
 * P1 阶段进程内实现，端契约稳定后 P2/P3 替换持久化层。
 */
@Module({
  controllers: [MemoryTiersController],
  providers: [MemoryTiersService],
  exports: [MemoryTiersService],
})
export class MemoryTiersModule {}
