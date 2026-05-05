import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { A2ABidEntity } from '../../entities/a2a-bid.entity';
import { A2AMatchTaskEntity } from '../../entities/a2a-match-task.entity';
import { A2ATradeEntity } from '../../entities/a2a-trade.entity';
import { A2AMatchingService } from './a2a-matching.service';
import { A2AMatchingController } from './a2a-matching.controller';

/** A2AMatchingModule — 顿领 §10 跨用户撮合 (P2-8 part 1) */
@Module({
  imports: [TypeOrmModule.forFeature([A2AMatchTaskEntity, A2ABidEntity, A2ATradeEntity])],
  controllers: [A2AMatchingController],
  providers: [A2AMatchingService],
  exports: [A2AMatchingService],
})
export class A2AMatchingModule {}
