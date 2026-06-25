import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { PetArenaMatch } from '../../entities/pet-arena-match.entity';
import { PetArenaLadderSnapshot } from '../../entities/pet-arena-ladder-snapshot.entity';
import { PetProductivitySnapshot } from '../../entities/pet-productivity-snapshot.entity';
import { PetTeamMember } from '../../entities/pet-team-member.entity';
import { LivingPet } from '../../entities/living-pet.entity';
import { PetArenaService } from './pet-arena.service';
import { PetArenaController } from './pet-arena.controller';
import { PetArenaScheduler } from './pet-arena.scheduler';
import { AgentTaskEntity } from '../../entities/agent-task.entity';

/**
 * Multi-Agent v2 W8 — Pet Arena module.
 *
 * Endpoints:
 *   POST /api/pet-arena/match
 *   POST /api/pet-arena/match/:id/resolve
 *   GET  /api/pet-arena/ladder/me
 *   GET  /api/pet-arena/productivity/:livingPetId
 *
 * Feature flag: MULTI_AGENT_PET_ARENA_ENABLED=1 (default OFF)
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      PetArenaMatch,
      PetArenaLadderSnapshot,
      PetProductivitySnapshot,
      PetTeamMember,
      LivingPet,
      AgentTaskEntity,
    ]),
  ],
  controllers: [PetArenaController],
  providers: [PetArenaService, PetArenaScheduler],
  exports: [PetArenaService],
})
export class PetArenaModule {}
