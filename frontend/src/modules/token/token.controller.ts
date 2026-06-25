import { Controller, Post, Get, Patch, Body, Param, UseGuards, Request } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TokenService, TokenLaunchRequest } from './token.service';

@Controller('tokens')
@UseGuards(JwtAuthGuard)
export class TokenController {
  constructor(private readonly tokenService: TokenService) {}

  /**
   * 发行代币
   */
  @Post('launch')
  async launch(@Request() req, @Body() dto: TokenLaunchRequest) {
    return this.tokenService.launch(req.user.id, dto);
  }

  /**
   * 查询代币状态
   */
  @Get(':id/status')
  async getStatus(@Param('id') id: string) {
    return this.tokenService.getStatus(id);
  }

  /**
   * 购买代币
   */
  @Post(':id/buy')
  async buy(
    @Request() req,
    @Param('id') id: string,
    @Body() dto: { amount: number; paymentMethod: 'usdc' | 'usdt' | 'wallet'; walletAddress?: string },
  ) {
    return this.tokenService.buy(id, req.user.id, dto.amount, dto.paymentMethod, dto.walletAddress);
  }

  /**
   * 查询代币销售信息
   */
  @Get(':id/sale')
  async getSaleInfo(@Param('id') id: string) {
    return this.tokenService.getSaleInfo(id);
  }

  /**
   * 更新代币价格
   */
  @Patch(':id/price')
  async updatePrice(@Param('id') id: string, @Body() dto: { price: number }) {
    return this.tokenService.updatePrice(id, dto.price);
  }
}

