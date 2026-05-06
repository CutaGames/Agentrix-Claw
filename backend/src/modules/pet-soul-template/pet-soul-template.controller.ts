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
    const resolvedPlan = planLevel ?? (userId ? await this.planResolver.getPlan(userId) : undefined);
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
