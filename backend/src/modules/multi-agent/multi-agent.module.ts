import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AgentTaskEntity } from '../../entities/agent-task.entity';
import { PetTeamMember } from '../../entities/pet-team-member.entity';
import { LivingPet } from '../../entities/living-pet.entity';
import { AgentAccount } from '../../entities/agent-account.entity';
import { AgentHireEscrow } from '../../entities/agent-hire-escrow.entity';
import { AgentTaskModule } from '../agent-task/agent-task.module';
import { AgentTaskSpawnService } from './agent-task-spawn.service';
import { MultiAgentController } from './multi-agent.controller';
import { SubTaskStalledScheduler } from './sub-task-stalled.scheduler';
import { WorldEngineBridgeService } from './world-engine-bridge.service';
import { MultiAgentMarketplaceService } from './multi-agent-marketplace.service';
import { MultiAgentMarketplaceController } from './multi-agent-marketplace.controller';
import { AgentHireEscrowService } from './agent-hire-escrow.service';
import { AgentHireEscrowController } from './agent-hire-escrow.controller';
import { AgentHireEscrowReconciler } from './agent-hire-escrow.reconciler';
import { MultiAgentSummaryModule } from '../multi-agent-summary/multi-agent-summary.module';
import { AgentAccountModule } from '../agent-account/agent-account.module';

/**
 * Multi-Agent Collaboration v1 module — exposes `agent_run` spawn
 * dispatcher (W2) + sub-task stalled detector cron (W4) + world-engine
 * bridge (W6,feature-flagged) + marketplace-hire dispatcher (W7,
 * feature-flagged) + hire escrow lifecycle (W7.3 v2.2 ship).
 *
 * v2.1 — adds dependency on MultiAgentSummaryModule for subscription
 * usage quota check at spawn time.
 *
 * v2.2 (W7.3) — adds AgentHireEscrowService + dispute controller.
 * Reconciler cron sweeps stale `reserved` rows whose linked task is
 * already terminal (covers worker-crash race).
 *
 * Spec: multi-agent-collaboration-2026-06
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      AgentTaskEntity,
      PetTeamMember,
      LivingPet,
      AgentAccount,
      AgentHireEscrow,
    ]),
    forwardRef(() => AgentTaskModule),
    forwardRef(() => MultiAgentSummaryModule),
    forwardRef(() => AgentAccountModule),
  ],
  controllers: [
    MultiAgentController,
    MultiAgentMarketplaceController,
    AgentHireEscrowController,
  ],
  providers: [
    AgentTaskSpawnService,
    SubTaskStalledScheduler,
    WorldEngineBridgeService,
    MultiAgentMarketplaceService,
    AgentHireEscrowService,
    AgentHireEscrowReconciler,
  ],
  exports: [
    AgentTaskSpawnService,
    WorldEngineBridgeService,
    MultiAgentMarketplaceService,
    AgentHireEscrowService,
  ],
})
export class MultiAgentModule {}
