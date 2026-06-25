import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Body,
  Request,
  UseGuards,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { WorldEngineFlagGuard } from '../guards/world-engine-flag.guard';
import { SoulLinkageService } from '../services/soul-linkage.service';
import { UgcGameService, RuleSetInput } from '../services/ugc-game.service';

/**
 * SoulUgcController — Phase C (统一灵魂) + Phase D (UGC 规则集) 的 HTTP 入口。
 *
 * Phase C — 化身主宠:
 *   POST   /v1/world-engine/assets/:id/incarnate    把扫描角色化身为主宠世界形态
 *   DELETE /v1/world-engine/assets/:id/incarnate    解除化身
 *   GET    /v1/world-engine/assets/:id/soul-status   查询灵魂链接 + 主宠连续状态
 *
 * Phase D — UGC 规则集:
 *   POST   /v1/world-engine/ugc/rulesets             创建规则集
 *   GET    /v1/world-engine/ugc/rulesets             我的规则集
 *   GET    /v1/world-engine/ugc/rulesets/:code       按分享码加载
 *   POST   /v1/world-engine/ugc/rulesets/:code/play  加载并计一次游玩
 *   DELETE /v1/world-engine/ugc/rulesets/:id          删除
 */
@ApiTags('world-engine/soul-ugc')
@Controller('v1/world-engine')
@UseGuards(JwtAuthGuard, WorldEngineFlagGuard)
@ApiBearerAuth()
export class SoulUgcController {
  constructor(
    private readonly soulLinkage: SoulLinkageService,
    private readonly ugcGame: UgcGameService,
  ) {}

  /** 游客无真实账户(userId 形如 'guest:anon-...'),写操作一律拒绝。 */
  private assertNotGuest(req: any): string {
    const isGuest = req.user?.isGuest === true || req.user?.type === 'guest';
    if (isGuest) {
      throw new ForbiddenException('登录后才能使用此功能');
    }
    return req.user?.id || req.user?.sub;
  }

  // ── Phase C: 化身主宠 ──────────────────────────────────────

  @Post('assets/:id/incarnate')
  @ApiOperation({ summary: '把扫描角色化身为主宠的世界形态(灵魂连续)' })
  async incarnate(@Request() req: any, @Param('id') id: string) {
    const userId = this.assertNotGuest(req);
    return this.soulLinkage.incarnate(userId, id);
  }

  @Delete('assets/:id/incarnate')
  @ApiOperation({ summary: '解除化身(不影响主宠亲密度/情绪)' })
  async unincarnate(@Request() req: any, @Param('id') id: string) {
    const userId = this.assertNotGuest(req);
    return this.soulLinkage.unincarnate(userId, id);
  }

  @Get('assets/:id/soul-status')
  @ApiOperation({ summary: '查询资产的灵魂链接 + 主宠连续状态' })
  async soulStatus(@Request() req: any, @Param('id') id: string) {
    const userId = this.assertNotGuest(req);
    return this.soulLinkage.getSoulStatus(userId, id);
  }

  // ── Phase D: UGC 规则集 ────────────────────────────────────

  @Post('ugc/rulesets')
  @ApiOperation({ summary: '创建 UGC 游戏规则集' })
  async createRuleSet(@Request() req: any, @Body() body: RuleSetInput) {
    const userId = this.assertNotGuest(req);
    if (!body?.name) throw new BadRequestException('name is required');
    return this.ugcGame.createRuleSet(userId, body);
  }

  @Get('ugc/rulesets')
  @ApiOperation({ summary: '我的规则集列表' })
  async listMine(@Request() req: any) {
    const userId = this.assertNotGuest(req);
    return { items: await this.ugcGame.listMine(userId) };
  }

  @Get('ugc/rulesets/:code')
  @ApiOperation({ summary: '按分享码加载规则集' })
  async getByCode(@Param('code') code: string) {
    return this.ugcGame.getByShareCode(code);
  }

  @Post('ugc/rulesets/:code/play')
  @ApiOperation({ summary: '加载规则集并计一次游玩(裂变热度)' })
  async play(@Param('code') code: string) {
    return this.ugcGame.play(code);
  }

  @Delete('ugc/rulesets/:id')
  @ApiOperation({ summary: '删除规则集' })
  async deleteRuleSet(@Request() req: any, @Param('id') id: string) {
    const userId = this.assertNotGuest(req);
    return this.ugcGame.deleteRuleSet(userId, id);
  }
}
