import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { WalletProjectionService } from './wallet-projection.service';

@UseGuards(JwtAuthGuard)
@Controller('api/v1/wallet')
export class WalletProjectionController {
  constructor(private readonly service: WalletProjectionService) {}

  /** 顿领 §5.3.3 跨端 read-only 钱包投影 */
  @Get('projection')
  async projection(@Req() req: any) {
    const userId = req.user?.userId || req.user?.sub || req.user?.id;
    return this.service.getProjection(userId);
  }
}
