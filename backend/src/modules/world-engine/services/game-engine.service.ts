import { Injectable } from '@nestjs/common';
import {
  CharacterGeneratorService,
  CharacterProfile,
  CharacterGenerationOptions,
} from './character-generator.service';
import { BattleEngineService, BattleParticipant, BattleResult } from './battle-engine.service';
import { DungeonBuilderService } from './dungeon-builder.service';
import { Dungeon } from '../entities/dungeon.entity';

// SemanticDescription type (mirrored from shared/types/world-engine)
interface SemanticDescription {
  objectCategory: string;
  categoryConfidence: number;
  materialType: string;
  estimatedSize: { length: number; width: number; height: number };
  functionalAffordances: string[];
  visualStyleTags: string[];
}

/**
 * GameEngineService — Character generation, dungeon building, battle simulation.
 *
 * Responsibilities:
 * - Generate character profiles from semantic descriptions (delegates to CharacterGeneratorService)
 * - Build dungeons from room scan data
 * - Simulate deterministic turn-based battles (delegates to BattleEngineService)
 *
 * Implementation: Tasks 4.1, 6.1, 7.1
 */
@Injectable()
export class GameEngineService {
  constructor(
    private readonly characterGenerator: CharacterGeneratorService,
    private readonly battleEngine: BattleEngineService,
    private readonly dungeonBuilder: DungeonBuilderService,
  ) {}

  /**
   * Generate a complete character profile from semantic description.
   * Delegates to CharacterGeneratorService for the actual implementation.
   */
  async generateCharacter(
    semanticDescription: SemanticDescription,
    options?: CharacterGenerationOptions,
  ): Promise<CharacterProfile> {
    return this.characterGenerator.generateCharacter(semanticDescription, options);
  }

  /**
   * Generate a dungeon from room scan layout data.
   * Delegates to DungeonBuilderService for the actual implementation.
   */
  async generateDungeon(
    sessionId: string,
    creatorId: string,
    theme?: string,
  ): Promise<Dungeon> {
    return this.dungeonBuilder.generateDungeon(sessionId, creatorId, theme);
  }

  /**
   * Simulate a battle between two world asset characters.
   * Delegates to BattleEngineService for deterministic combat simulation.
   */
  simulateBattle(
    challenger: BattleParticipant,
    defender: BattleParticipant,
    seed: number,
  ): BattleResult {
    return this.battleEngine.simulateBattle(challenger, defender, seed);
  }
}
