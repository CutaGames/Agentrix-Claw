import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Request,
  UseGuards,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';

import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { CreationGameService } from './creation-game.service';
import { CreationRepository } from '../creation.repository';

/** GET /v1/creations/:id/game — 响应(供 WebView 渲染)。 */
export interface GetCreationGameResponse {
  creationId: string;
  title: string;
  engine: string;
  source: 'llm' | 'template' | 'embed';
  version: number;
  /** 生成所用模型(友好名;template/embed 时为 null)。前端据此提示用户。 */
  modelUsed: string | null;
  /** 外链游戏 URL(source=embed 时有效;WebView 直接加载)。 */
  url: string | null;
  /** 外链来源分类(opensource/distribution/upload/host;source=embed 时有意义)。 */
  provider: string | null;
  /** 自包含 HTML 文档(llm/template;embed 为空)。 */
  html: string;
}

/**
 * CreationGameController — game 创作的可玩 HTML5 产物存取(方案 A)。
 *
 *   GET  /v1/creations/:id/game          取当前可玩包(任意登录用户可玩)。
 *   POST /v1/creations/:id/generate-game 重新生成(owner;协同编辑/重生成用)。
 */
@ApiTags('creation')
@Controller('v1/creations')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class CreationGameController {
  constructor(
    private readonly gameService: CreationGameService,
    private readonly repo: CreationRepository,
  ) {}

  /** GET /v1/creations/:id/game — 当前可玩包;无则按类型懒生成(种子/旧创作首玩即生成)。 */
  @Get(':id/game')
  @ApiOperation({ summary: 'Get the current playable game bundle (HTML5 or embedded web game)' })
  async getGame(@Request() req: any, @Param('id') id: string): Promise<GetCreationGameResponse> {
    const userId = req.user?.id ?? req.user?.sub;
    let bundle = await this.gameService.getCurrentBundle(id);
    if (!bundle) {
      const creation = await this.repo.findById(id);
      if (!creation) throw new NotFoundException('Creation not found.');
      if (creation.type !== 'game') {
        throw new NotFoundException('This creation is not a game.');
      }
      // 懒生成:首次进入即产出可玩包(用进入者的模型偏好/BYO;LLM 失败则模板兜底)。
      bundle = await this.gameService.generateForCreation(
        id,
        creation.title,
        creation.summary || creation.title,
        userId,
      );
    }
    return this.toResponse(bundle);
  }

  /** POST /v1/creations/:id/generate-game — owner 重新生成可玩包(LLM/模板)。 */
  @Post(':id/generate-game')
  @ApiOperation({ summary: 'Generate / regenerate the playable game bundle (owner)' })
  async generate(
    @Request() req: any,
    @Param('id') id: string,
  ): Promise<GetCreationGameResponse> {
    const userId = req.user?.id ?? req.user?.sub;
    const creation = await this.repo.findById(id);
    if (!creation) throw new NotFoundException('Creation not found.');
    // 以创作标题/摘要为 prompt 源,用调用者的模型偏好/BYO。
    const title = creation.title;
    const description = creation.summary || creation.title;
    const bundle = await this.gameService.generateForCreation(id, title, description, userId);
    return this.toResponse(bundle);
  }

  /**
   * POST /v1/creations/:id/embed-game — owner 把"已有网页游戏"接入为当前可玩包。
   * body: { url, title? }。URL 必须 https + 命中域名白名单(开源/分发网络/受信主机)。
   * 仅创作 owner 可设置(避免任意用户为他人创作注入外链)。
   */
  @Post(':id/embed-game')
  @ApiOperation({ summary: 'Attach an existing web game (external URL) as the playable bundle (owner)' })
  async embed(
    @Request() req: any,
    @Param('id') id: string,
    @Body() body: { url?: string; title?: string },
  ): Promise<GetCreationGameResponse> {
    const userId = req.user?.id ?? req.user?.sub;
    const creation = await this.repo.findById(id);
    if (!creation) throw new NotFoundException('Creation not found.');
    if (creation.type !== 'game') throw new BadRequestException('This creation is not a game.');
    const owns = await this.gameService.userOwnsCreation(userId, creation.ownerAccountId);
    if (!owns) throw new ForbiddenException('Only the creation owner can attach an embedded game.');
    if (!body?.url) throw new BadRequestException('url is required.');
    if (!this.gameService.validateEmbedUrl(body.url)) {
      throw new BadRequestException('URL must be https and from an allowlisted domain.');
    }
    const bundle = await this.gameService.setEmbedGame(id, body.url, body.title || creation.title);
    return this.toResponse(bundle);
  }

  /**
   * POST /v1/creations/:id/import-game — owner 导入「自己网站上的游戏」(任意公网 https URL)。
   * 与 embed-game 区别:不限白名单(provider='import'),仅做 https + 防 SSRF 校验;WebView 沙箱兜底。
   */
  @Post(':id/import-game')
  @ApiOperation({ summary: "Import the owner's own web game by URL (any public https)" })
  async importGame(
    @Request() req: any,
    @Param('id') id: string,
    @Body() body: { url?: string; title?: string },
  ): Promise<GetCreationGameResponse> {
    const userId = req.user?.id ?? req.user?.sub;
    const creation = await this.repo.findById(id);
    if (!creation) throw new NotFoundException('Creation not found.');
    if (creation.type !== 'game') throw new BadRequestException('This creation is not a game.');
    const owns = await this.gameService.userOwnsCreation(userId, creation.ownerAccountId);
    if (!owns) throw new ForbiddenException('Only the creation owner can import a game.');
    if (!body?.url) throw new BadRequestException('url is required.');
    if (!this.gameService.validateImportUrl(body.url)) {
      throw new BadRequestException('URL must be a public https address.');
    }
    const bundle = await this.gameService.importGame(id, body.url, body.title || creation.title);
    return this.toResponse(bundle);
  }

  private toResponse(bundle: {
    creationId: string;
    title: string;
    engine: string;
    source: 'llm' | 'template' | 'embed';
    version: number;
    modelUsed: string | null;
    url: string | null;
    provider: string | null;
    html: string;
  }): GetCreationGameResponse {
    return {
      creationId: bundle.creationId,
      title: bundle.title,
      engine: bundle.engine,
      source: bundle.source,
      version: bundle.version,
      modelUsed: bundle.modelUsed ?? null,
      url: bundle.url ?? null,
      provider: bundle.provider ?? null,
      html: bundle.html ?? '',
    };
  }
}
