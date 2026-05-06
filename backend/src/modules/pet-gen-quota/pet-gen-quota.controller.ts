import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PetGenQuotaService } from './pet-gen-quota.service';
import { UserPlanResolverService } from './user-plan-resolver.service';

/**
 * GET /v1/pet/quota — 当前用户当月配额视图（PetCreator 弹窗 / 经济面板用）
 */
@UseGuards(JwtAuthGuard)
@Controller('v1/pet/quota')
export class PetGenQuotaController {
  constructor(
    private readonly service: PetGenQuotaService,
    private readonly planResolver: UserPlanResolverService,
  ) {}

  @Get()
  async get(@Req() req: any) {
    const userId = req.user?.userId || req.user?.sub || req.user?.id;
    const plan = await this.planResolver.getPlan(userId);
    const row = await this.service.getOrCreate(userId, plan);
    return this.service.toDto(row);
  }
}
