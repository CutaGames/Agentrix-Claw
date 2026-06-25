import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PetRiveAssetService } from './pet-rive-asset.service';

/**
 * GET /v1/pet/rive/assets?soulTemplateId=claw   列出灵魂全部 Rive
 * GET /v1/pet/rive/assets/default/:soulTemplateId  默认 Rive（渲染层启动用）
 */
@UseGuards(JwtAuthGuard)
@Controller('v1/pet/rive')
export class PetRiveAssetController {
  constructor(private readonly service: PetRiveAssetService) {}

  @Get('assets')
  async list(@Query('soulTemplateId') soulTemplateId?: string) {
    if (!soulTemplateId) return { items: [] };
    const items = await this.service.listBySoul(soulTemplateId);
    return { items: items.map((a) => this.service.toDto(a)) };
  }

  @Get('assets/default/:soulTemplateId')
  async getDefault(@Param('soulTemplateId') soulTemplateId: string) {
    const a = await this.service.getDefaultBySoul(soulTemplateId);
    return a ? this.service.toDto(a) : null;
  }
}
