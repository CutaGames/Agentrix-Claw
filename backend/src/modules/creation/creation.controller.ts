import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  Request,
  UseGuards,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CreationAuthoringService } from './creation-authoring.service';
import { CreationRepository } from './creation.repository';
import type {
  CreateCreationRequest,
  CreateCreationResponse,
  GenerateCreationRequest,
  GenerateCreationResponse,
  ContinueCreationRequest,
  ContinueCreationResponse,
} from '../../../shared/types/creation-api';
import type { Creation, Offering } from '../../../shared/types/creation';

/**
 * CreationController — 统一创作入口(world-creation-feed task 4.1)。
 *
 * spec: .kiro/specs/world-creation-feed/{requirements,design}.md
 *   - design §Components and Interfaces — REST 表(统一前缀 `/v1/creations`):
 *       POST /v1/creations            新建创作(可仅 geo / 仅内容 / 两者)
 *       POST /v1/creations/:id/generate   提示词生成 ECS(复用 v6 generate)
 *       POST /v1/creations/:id/continue   连续谱编辑(prompt/coEdit/handBuild,复用 v6 continue)
 *   - 需求 2.1 / 2.2 / 2.3 / 2.4。
 *
 * 编排逻辑全部委托 {@link CreationAuthoringService}(写 Creation 实体 + 复用 v6 创作引擎);
 * 控制器仅负责鉴权、解析认证用户 id 与请求体透传。auth/guards 与既有控制器一致
 * (JwtAuthGuard + ApiBearerAuth,参见 world-creation PlotController)。
 */
@ApiTags('creation')
@Controller('v1/creations')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class CreationController {
  constructor(
    private readonly authoring: CreationAuthoringService,
    private readonly repo: CreationRepository,
  ) {}

  /** GET /v1/creations/mine — 我的创作列表(「我的世界」管理,需求 10.4)。 */
  @Get('mine')
  @ApiOperation({ summary: 'List my creations (My World management)' })
  async mine(@Request() req: any): Promise<{ items: Creation[] }> {
    const userId = req.user?.id ?? req.user?.sub;
    const ownerIds = await this.authoring.resolveOwnedAccountIds(userId);
    const rows = await this.repo.findByOwners(ownerIds);
    return { items: rows as unknown as Creation[] };
  }

  /** POST /v1/creations — 新建创作(可仅 geo / 仅内容 / 两者;可选 inline prompt 触发生成)。 */
  @Post()
  @ApiOperation({
    summary: 'Create a Creation (geo-only / content-only / both); optional inline prompt triggers generation',
  })
  async create(
    @Request() req: any,
    @Body() body: CreateCreationRequest,
  ): Promise<CreateCreationResponse> {
    const userId = req.user?.id ?? req.user?.sub;
    return this.authoring.createCreation(userId, body);
  }

  /** POST /v1/creations/:id/fork — Remix(血缘衍生)一个已发布创作(P0-③)。 */
  @Post(':id/fork')
  @ApiOperation({ summary: 'Remix/fork a published Creation (sets lineage; royalties flow upstream on sales)' })
  async fork(
    @Request() req: any,
    @Param('id') id: string,
  ): Promise<CreateCreationResponse> {
    const userId = req.user?.id ?? req.user?.sub;
    return this.authoring.forkCreation(userId, id);
  }

  /** POST /v1/creations/:id/generate — 提示词驱动 ECS 生成,写回 ecsVersionId。 */
  @Post(':id/generate')
  @ApiOperation({ summary: 'Prompt-drive ECS_World generation; sets the Creation ecsVersionId' })
  async generate(
    @Request() req: any,
    @Param('id') id: string,
    @Body() body: GenerateCreationRequest,
  ): Promise<GenerateCreationResponse> {
    const userId = req.user?.id ?? req.user?.sub;
    return this.authoring.generate(userId, id, body);
  }

  /** POST /v1/creations/:id/continue — 连续谱编辑(promptDrive/coEdit/handBuild),产生带 diff 的新版本。 */
  @Post(':id/continue')
  @ApiOperation({ summary: 'Continuum edit (promptDrive/coEdit/handBuild) producing a new version with diff' })
  async continue(
    @Request() req: any,
    @Param('id') id: string,
    @Body() body: ContinueCreationRequest,
  ): Promise<ContinueCreationResponse> {
    const userId = req.user?.id ?? req.user?.sub;
    return this.authoring.continue(userId, id, body);
  }

  /**
   * POST /v1/creations/:id/offerings — 设置店铺商品(owner)。
   * 把简单的 {name, priceAxp, description} 列表落为权威 Offering[](verbs=['order']),
   * 发布时纳入派生(>0 → listed),体验页据此展示 + 购买。
   */
  @Post(':id/offerings')
  @ApiOperation({ summary: 'Set shop offerings/products (owner)' })
  async setOfferings(
    @Request() req: any,
    @Param('id') id: string,
    @Body() body: { offerings?: Array<{ name?: string; priceAxp?: number; description?: string; kind?: string }> },
  ): Promise<{ ok: boolean; count: number }> {
    const userId = req.user?.id ?? req.user?.sub;
    const creation = await this.repo.findById(id);
    if (!creation) throw new NotFoundException('Creation not found.');
    const ownedIds = await this.authoring.resolveOwnedAccountIds(userId);
    if (!ownedIds.includes(creation.ownerAccountId)) {
      throw new ForbiddenException('Only the owner can set offerings.');
    }
    const offerings: Offering[] = (body?.offerings ?? [])
      .filter((o) => o && (o.name || '').trim())
      .slice(0, 50)
      .map((o, i) => ({
        id: `o${i + 1}`,
        kind: (o.kind as any) || 'product',
        name: String(o.name).trim().slice(0, 80),
        description: o.description ? String(o.description).slice(0, 200) : undefined,
        price: { axp: Math.max(0, Math.round(Number(o.priceAxp) || 0)) },
        verbs: ['order'],
      }));
    creation.offerings = offerings;
    await this.repo.save(creation);
    return { ok: true, count: offerings.length };
  }
}
