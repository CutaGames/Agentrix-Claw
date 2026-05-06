import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PetGenQuotaService } from './pet-gen-quota.service';

/**
 * GET /v1/pet/quota — 当前用户当月配额视图（PetCreator 弹窗 / 经济面板用）
 */
@UseGuards(JwtAuthGuard)
@Controller('v1/pet/quota')
export class PetGenQuotaController {
  constructor(private readonly service: PetGenQuotaService) {}

  @Get()
  async get(@Req() req: any) {
    const userId = req.user?.userId || req.user?.sub || req.user?.id;
    // Phase 2 W2 真正的 plan 解析将走 SubscriptionService；当前先按 free 兜底
    const row = await this.service.getOrCreate(userId, 'free');
    return this.service.toDto(row);
  }
}
