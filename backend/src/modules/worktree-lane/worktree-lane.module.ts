import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { WorktreeLaneEntity } from '../../entities/worktree-lane.entity';
import { WorktreeLaneController } from './worktree-lane.controller';
import { WorktreeLaneService } from './worktree-lane.service';

/**
 * WorktreeLaneModule — backend storage for worktree lanes.
 *
 * Spec: multi-agent-collaboration-2026-06 W1.2
 */
@Module({
  imports: [TypeOrmModule.forFeature([WorktreeLaneEntity])],
  controllers: [WorktreeLaneController],
  providers: [WorktreeLaneService],
  exports: [WorktreeLaneService],
})
export class WorktreeLaneModule {}
