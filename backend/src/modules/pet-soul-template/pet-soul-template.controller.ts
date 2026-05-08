import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PetSoulTemplateService } from './pet-soul-template.service';
import { UserPlanResolverService } from '../pet-gen-quota/user-plan-resolver.service';

/**
 * 灵魂模板（族群 / 人格）API
 *
 *   GET  /api/v1/pet/souls          列出可用灵魂（按族群 / 计划过滤）
 *   GET  /api/v1/pet/souls/:id      取单只灵魂模板
 */
@UseGuards(JwtAuthGuard)
@Controller('v1/pet/souls')
export class PetSoulTemplateController {
  constructor(
    private readonly service: PetSoulTemplateService,
    private readonly planResolver: UserPlanResolverService,
  ) {}

  @Get()
  async list(
    @Req() req: any,
    @Query('clan') clan?: string,
    @Query('plan') planLevel?: 'free' | 'pro' | 'pro_plus' | 'enterprise',
  ) {
    const userId = req.user?.userId || req.user?.sub || req.user?.id;
    // S6: \u670d\u52a1\u5668\u59cb\u7ec8\u4ee5 JWT \u89e3\u6790\u7684 plan \u4e3a\u51c6\uff1bquery \u53c2\u6570\u4ec5\u80fd\u9650\u7f29\u5230\u66f4\u4f4e tier\uff08\u9632\u4f2a\u9020\u8d8a\u7ea7\uff09
    const PLAN_RANK: Record<string, number> = { free: 0, pro: 1, pro_plus: 2, enterprise: 3 };
    const serverPlan = userId ? await this.planResolver.getPlan(userId) : undefined;
    let resolvedPlan = serverPlan;
    if (planLevel && serverPlan && (PLAN_RANK[planLevel] ?? 99) <= (PLAN_RANK[serverPlan] ?? 0)) {
      resolvedPlan = planLevel; // \u53ea\u5141\u8bb8\u4e3b\u52a8\u9650\u7f29
    }
    const items = await this.service.list({ clan, planLevel: resolvedPlan });
    return {
      items: items.map((t) => this.service.toDto(t)),
      access: resolvedPlan
        ? {
            plan_level: resolvedPlan,
          }
        : undefined,
    };
  }

  @Get(':id')
  async get(@Param('id') id: string) {
    const tpl = await this.service.get(id);
    return this.service.toDto(tpl);
  }
}
