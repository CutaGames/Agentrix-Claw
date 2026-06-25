import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Request,
  UseGuards,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';

import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { CreationDramaService } from './creation-drama.service';
import { CreationGameService } from '../game/creation-game.service';
import { CreationRepository } from '../creation.repository';

import type { DramaStory, DramaState, UnlockEpisodeResponse } from '../../../../shared/types/drama';

/**
 * CreationDramaController — 互动剧闭环 REST 面(`/v1/creations`)。
 *
 *   GET  /:id/drama            取故事(任意登录用户)。
 *   GET  /:id/drama/state      取当前用户已解锁集号。
 *   POST /:id/drama/unlock     用 AXP 解锁某集(服务端权威 + 幂等)。
 *   POST /:id/generate-drama   生成/重生成互动剧(owner;LLM→JSON,失败兜底 demo)。
 *
 * 打赏复用既有 `POST /:id/tip`(creation-social)。
 */
@ApiTags('creation')
@Controller('v1/creations')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class CreationDramaController {
  constructor(
    private readonly drama: CreationDramaService,
    private readonly gameService: CreationGameService,
    private readonly repo: CreationRepository,
  ) {}

  @Get(':id/drama')
  @ApiOperation({ summary: 'Get the interactive-drama story (branching scenes).' })
  async getStory(@Param('id') id: string): Promise<DramaStory> {
    const story = await this.drama.getStory(id);
    if (!story) throw new NotFoundException('该创作不是互动剧或不存在。');
    return story;
  }

  @Get(':id/drama/state')
  @ApiOperation({ summary: "Get the caller's unlocked episodes for this drama." })
  async getState(@Request() req: any, @Param('id') id: string): Promise<DramaState> {
    const userId = req.user?.id ?? req.user?.sub;
    return this.drama.getState(id, userId);
  }

  @Post(':id/drama/unlock')
  @ApiOperation({ summary: 'Unlock an episode with AXP (server-authoritative, idempotent).' })
  async unlock(
    @Request() req: any,
    @Param('id') id: string,
    @Body() body: { episode?: number },
  ): Promise<UnlockEpisodeResponse> {
    const userId = req.user?.id ?? req.user?.sub;
    const episode = Number(body?.episode);
    if (!Number.isInteger(episode) || episode < 1) {
      throw new BadRequestException('episode is required (>=1).');
    }
    return this.drama.unlock(id, userId, episode);
  }

  @Post(':id/generate-drama')
  @ApiOperation({ summary: 'Generate / regenerate the interactive drama (owner).' })
  async generate(@Request() req: any, @Param('id') id: string): Promise<DramaStory> {
    const userId = req.user?.id ?? req.user?.sub;
    const creation = await this.repo.findById(id);
    if (!creation) throw new NotFoundException('Creation not found.');
    const owns = await this.gameService.userOwnsCreation(userId, creation.ownerAccountId);
    if (!owns) throw new ForbiddenException('Only the creation owner can generate the drama.');
    return this.drama.generateForCreation(id, creation.title, creation.summary || creation.title, userId);
  }
}
