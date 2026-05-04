import { Module } from '@nestjs/common';
import { A2AMatchingService } from './a2a-matching.service';
import { A2AMatchingController } from './a2a-matching.controller';

/** A2AMatchingModule — 顿领 §10 跨用户撮合 (P2-8 part 1) */
@Module({
  controllers: [A2AMatchingController],
  providers: [A2AMatchingService],
  exports: [A2AMatchingService],
})
export class A2AMatchingModule {}
