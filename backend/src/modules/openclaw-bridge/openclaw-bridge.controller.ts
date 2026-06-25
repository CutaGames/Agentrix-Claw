import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiBody,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { OpenClawBridgeService } from './openclaw-bridge.service';
import { OpenClawSkillHubService } from './openclaw-skill-hub.service';

@ApiTags('openclaw/bridge')
@Controller('openclaw/bridge')
export class OpenClawBridgeController {
  constructor(
    private readonly bridge: OpenClawBridgeService,
    private readonly skillHub: OpenClawSkillHubService,
  ) {}

  /**
   * Probe an arbitrary URL to check reachability and gather instance metadata.
   * Used during the "Connect Existing" discovery step before binding.
   */
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Post('probe')
  @ApiOperation({ summary: 'Probe a URL to check if OpenClaw is reachable' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        url: { type: 'string', example: 'http://192.168.1.42:3001' },
        token: { type: 'string', description: 'Optional API token' },
      },
      required: ['url'],
    },
  })
  async probeUrl(
    @Body('url') url: string,
    @Body('token') token?: string,
  ) {
    return this.bridge.probeUrl(url, token);
  }

  /**
   * Migrate data from an already-bound OpenClaw instance into Agentrix.
   * Pulls: agent config, installed skills, memory entries, chat session list.
   */
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Post(':instanceId/migrate')
  @ApiOperation({ summary: 'Pull skills, memory, config and sessions from an existing instance' })
  async migrate(
    @Request() req: any,
    @Param('instanceId') instanceId: string,
  ) {
    return this.bridge.migrateInstance(req.user.id, instanceId);
  }

  /**
   * Returns the recommended local ports + health paths for client-side LAN scanning.
   * The mobile app scans its own LAN using these parameters — the server cannot
   * reach the user's private network, so scanning is delegated to the client.
   */
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Get('discover/config')
  @ApiOperation({ summary: 'Get LAN discovery parameters (ports + paths) for mobile-side scanning' })
  async discoverConfig() {
    return this.bridge.getDiscoveryCandidates();
  }

  /**
   * Search skills from the OpenClaw skill hub (no auth required for marketplace display)
   * Proxies to the OpenClaw hub or returns built-in skill catalog
   */
  @Get('skill-hub/search')
  @ApiOperation({ summary: 'Search OpenClaw hub skills for marketplace display' })
  async searchHubSkills(
    @Query('q') q?: string,
    @Query('category') category?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('sortBy') sortBy?: string,
    @Query('sortOrder') sortOrder?: 'ASC' | 'DESC',
  ) {
    return this.skillHub.getSkills({
      query: q,
      category,
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? parseInt(limit, 10) : 20,
      sortBy: sortBy ?? 'callCount',
      sortOrder: sortOrder ?? 'DESC',
    });
  }

  /**
   * Get categories from OpenClaw skill hub
   */
  @Get('skill-hub/categories')
  @ApiOperation({ summary: 'Get OpenClaw hub skill categories' })
  async getHubCategories() {
    return this.skillHub.getCategories();
  }

  /**
   * Install a hub skill into a bound OpenClaw instance.
   * Called after successful payment (or for free skills, directly).
   */
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Post(':instanceId/skill-hub-install')
  @ApiOperation({ summary: 'Install a hub skill into a bound OpenClaw instance' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        skillId: { type: 'string', example: 'oc-web-search' },
      },
      required: ['skillId'],
    },
  })
  async installHubSkill(
    @Request() req: any,
    @Param('instanceId') instanceId: string,
    @Body('skillId') skillId: string,
  ) {
    return this.bridge.installHubSkillToInstance(req.user.id, instanceId, skillId);
  }

  /* ================================================================ */
  /*  ClawHub Sync endpoints (admin / diagnostic)                      */
  /* ================================================================ */

  /**
   * Trigger a full sync from ClawHub → DB.
   * Can be called manually or via cron for initial population.
   */
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Post('skill-hub/sync')
  @ApiOperation({ summary: 'Trigger full sync of ClawHub skills to local DB' })
  async triggerHubSync() {
    return this.skillHub.triggerFullSync();
  }

  /**
   * Get a single skill by slug from ClawHub (with live fallback)
   */
  @Get('skill-hub/skills/:slug')
  @ApiOperation({ summary: 'Get ClawHub skill detail by slug' })
  async getHubSkillBySlug(@Param('slug') slug: string) {
    const skill = await this.skillHub.getSkillBySlug(slug);
    if (!skill) {
      return { error: 'Skill not found', slug };
    }
    return skill;
  }

  /**
   * Check hub health / connectivity
   */
  @Get('skill-hub/status')
  @ApiOperation({ summary: 'Check ClawHub connectivity and cache status' })
  async getHubStatus() {
    const reachable = await this.skillHub.isHubReachable();
    return {
      hubUrl: 'https://www.clawhub.ai/api/v1',
      reachable,
      ...this.skillHub.hubSyncStatus,
    };
  }
}
