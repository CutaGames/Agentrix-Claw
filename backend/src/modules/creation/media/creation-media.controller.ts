import {
  Controller,
  Post,
  Param,
  Request,
  UseGuards,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';

import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { CreationImageService } from './creation-image.service';
import { CreationGameService } from '../game/creation-game.service';
import { CreationRepository } from '../creation.repository';

/**
 * CreationMediaController — AI 出图(封面 / 互动剧插画)REST 面(owner)。
 *
 *   POST /:id/generate-cover     生成竖版封面 → 写入 preview(创作流卡片 + 分享海报)。
 *   POST /:id/drama/illustrate   为互动剧生成封面 + 每集主场景图(回写 scene.bg)。
 */
@ApiTags('creation')
@Controller('v1/creations')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class CreationMediaController {
  constructor(
    private readonly images: CreationImageService,
    private readonly gameService: CreationGameService,
    private readonly repo: CreationRepository,
  ) {}

  private async assertOwner(userId: string, id: string) {
    const creation = await this.repo.findById(id);
    if (!creation) throw new NotFoundException('Creation not found.');
    const owns = await this.gameService.userOwnsCreation(userId, creation.ownerAccountId);
    if (!owns) throw new ForbiddenException('Only the creation owner can generate media.');
  }

  @Post(':id/generate-cover')
  @ApiOperation({ summary: 'Generate an AI cover image and set it as the creation preview (owner).' })
  async generateCover(@Request() req: any, @Param('id') id: string): Promise<{ url: string }> {
    const userId = req.user?.id ?? req.user?.sub;
    await this.assertOwner(userId, id);
    const url = await this.images.generateCover(id, userId);
    return { url };
  }

  @Post(':id/drama/illustrate')
  @ApiOperation({ summary: 'Generate AI cover + per-episode scene art for the interactive drama (owner).' })
  async illustrate(
    @Request() req: any,
    @Param('id') id: string,
  ): Promise<{ coverUrl: string | null; sceneImages: number }> {
    const userId = req.user?.id ?? req.user?.sub;
    await this.assertOwner(userId, id);
    return this.images.illustrateDrama(id, userId);
  }
}
