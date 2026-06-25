import {
  Controller,
  Get,
  Param,
  UseGuards,
  Logger,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { WorldEngineFlagGuard } from '../guards/world-engine-flag.guard';
import { WorldAsset } from '../entities/world-asset.entity';
import { AgentStatusWorldEngineExtension } from '../../../../shared/types/world-engine-api';

/**
 * XP thresholds for skill slot unlocks (matching design §5 and R6.4).
 */
const XP_THRESHOLDS = [100, 500, 1500, 5000];

/**
 * AgentExtensionController — Provides world-engine extension fields for agents.
 *
 * This is a NEW endpoint in the World Engine module that returns world-engine
 * specific data for a given agent, without modifying the existing agent status
 * endpoint. Clients can call this alongside the existing agent status endpoint
 * to get the full picture.
 *
 * Route: GET /api/v1/world-engine/agent-status/:agentId
 *
 * Requirements: 11.4
 */
@ApiTags('world-engine/agent-status')
@Controller('v1/world-engine/agent-status')
@UseGuards(JwtAuthGuard, WorldEngineFlagGuard)
@ApiBearerAuth()
export class AgentExtensionController {
  private readonly logger = new Logger(AgentExtensionController.name);

  constructor(
    @InjectRepository(WorldAsset)
    private readonly worldAssetRepository: Repository<WorldAsset>,
  ) {}

  @Get(':agentId')
  @ApiOperation({
    summary: 'Get world-engine extension fields for a bound agent',
    description:
      'Returns world-engine specific data (bound asset, XP, level, recent actions) for a given agent. Returns null fields if no world asset is bound to this agent.',
  })
  async getAgentWorldEngineStatus(
    @Param('agentId') agentId: string,
  ): Promise<AgentStatusWorldEngineExtension> {
    // Query world_assets where boundAgentId matches
    const asset = await this.worldAssetRepository.findOne({
      where: { boundAgentId: agentId },
    });

    if (!asset) {
      // No bound asset found — return null fields (backwards-compatible)
      return {
        boundAssetId: undefined,
        boundAssetName: undefined,
        xp: undefined,
        level: undefined,
        nextThreshold: undefined,
        recentActions: undefined,
      };
    }

    // Compute next XP threshold
    const nextThreshold = XP_THRESHOLDS.find((t) => t > asset.xp) ?? null;

    return {
      boundAssetId: asset.id,
      boundAssetName: asset.name,
      xp: asset.xp,
      level: asset.level,
      nextThreshold: nextThreshold ?? undefined,
      recentActions: [], // TODO: Populate from agent activity log in Task 8.1
    };
  }
}
