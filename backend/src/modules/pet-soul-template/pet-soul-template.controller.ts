import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PetSoulTemplateService } from './pet-soul-template.service';

/**
 * 灵魂模板（族群 / 人格）API
 *
 *   GET  /api/v1/pet/souls          列出可用灵魂（按族群 / 计划过滤）
 *   GET  /api/v1/pet/souls/:id      取单只灵魂模板
 */
@UseGuards(JwtAuthGuard)
@Controller('v1/pet/souls')
export class PetSoulTemplateController {
  constructor(private readonly service: PetSoulTemplateService) {}

  @Get()
  async list(
    @Query('clan') clan?: string,
    @Query('plan') planLevel?: 'free' | 'pro' | 'pro_plus' | 'enterprise',
  ) {
    const items = await this.service.list({ clan, planLevel });
    return { items: items.map((t) => this.service.toDto(t)) };
  }

  @Get(':id')
  async get(@Param('id') id: string) {
    const tpl = await this.service.get(id);
    return this.service.toDto(tpl);
  }
}
