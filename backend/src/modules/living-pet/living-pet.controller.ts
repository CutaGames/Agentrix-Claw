import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { LivingPetService, PetEmotion } from './living-pet.service';

/**
 * 顿领 §3.4 主宠 API
 *
 * 路由:
 *   GET  /api/v1/pet/state           当前 user 的主宠状态（自动衰减）
 *   POST /api/v1/pet/emotion         显式设置情绪（内部使用 / Vitals 反应器调用）
 *   POST /api/v1/pet/intimacy        增加亲密度 xp
 *   POST /api/v1/pet/engine/switch   §3.8 切换 primary agent
 */
@UseGuards(JwtAuthGuard)
@Controller('api/v1/pet')
export class LivingPetController {
  constructor(private readonly service: LivingPetService) {}

  @Get('state')
  async getState(@Req() req: any) {
    const userId = req.user?.userId || req.user?.sub || req.user?.id;
    const pet = await this.service.getOrCreate(userId);
    return this.service.toDto(pet);
  }

  @Post('emotion')
  async setEmotion(
    @Req() req: any,
    @Body() body: { emotion: PetEmotion; intensity?: 0 | 1 | 2 | 3 },
  ) {
    const userId = req.user?.userId || req.user?.sub || req.user?.id;
    const pet = await this.service.setEmotion(userId, {
      emotion: body.emotion,
      intensity: body.intensity,
    });
    return this.service.toDto(pet);
  }

  @Post('intimacy')
  async addIntimacy(@Req() req: any, @Body() body: { xp: number }) {
    const userId = req.user?.userId || req.user?.sub || req.user?.id;
    const pet = await this.service.addIntimacyXp(userId, Number(body.xp || 0));
    return this.service.toDto(pet);
  }

  @Post('engine/switch')
  async switchEngine(@Req() req: any, @Body() body: { agentId: string }) {
    const userId = req.user?.userId || req.user?.sub || req.user?.id;
    const pet = await this.service.switchPrimaryAgent(userId, body.agentId);
    return this.service.toDto(pet);
  }
}
