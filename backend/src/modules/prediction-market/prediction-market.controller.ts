import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PredictionAsset } from '../../entities/prediction-round.entity';
import { PredictionBetSide } from '../../entities/prediction-bet.entity';
import { PredictionMarketService } from './prediction-market.service';
import { PolymarketFeedService } from './polymarket-feed.service';

class PlaceBetDto {
  roundId!: string;
  side!: PredictionBetSide;
  amount!: number;
}

@ApiTags('prediction-market')
@Controller('prediction-market')
export class PredictionMarketController {
  constructor(
    private readonly service: PredictionMarketService,
    private readonly polymarket: PolymarketFeedService,
  ) {}

  @Get('rounds/live')
  @ApiOperation({ summary: '获取活跃中的轮次（OPEN + LOCKED）' })
  async listLive(
    @Query('asset') asset?: string,
    @Query('limit') limit?: string,
  ) {
    const a = (asset?.toUpperCase() as PredictionAsset) || PredictionAsset.BTC;
    const n = limit ? Math.max(1, Math.min(20, parseInt(limit, 10))) : 8;
    return { items: await this.service.listLiveRounds(a, n) };
  }

  @Get('rounds/recent')
  @ApiOperation({ summary: '获取最近已结算轮次' })
  async listRecent(
    @Query('asset') asset?: string,
    @Query('limit') limit?: string,
  ) {
    const a = (asset?.toUpperCase() as PredictionAsset) || PredictionAsset.BTC;
    const n = limit ? Math.max(1, Math.min(50, parseInt(limit, 10))) : 10;
    return { items: await this.service.listRecentSettled(a, n) };
  }

  @Get('rounds/:id')
  @ApiOperation({ summary: '获取轮次详情' })
  async getRound(@Param('id') id: string) {
    return this.service.getRound(id);
  }

  @Post('bets')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '下注（demo 模式，使用虚拟 USDC 余额）' })
  async placeBet(@Request() req: any, @Body() dto: PlaceBetDto) {
    return this.service.placeBet({
      userId: req.user?.id,
      roundId: dto.roundId,
      side: dto.side,
      amount: Number(dto.amount),
    });
  }

  @Get('me/balance')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '获取我的预测市场余额（虚拟 USDC）' })
  async myBalance(@Request() req: any) {
    const bal = await this.service.getOrCreateBalance(req.user?.id);
    return {
      balance: Number(bal.balance),
      totalWagered: Number(bal.totalWagered),
      totalPayout: Number(bal.totalPayout),
      netPnl: Number(bal.netPnl),
      totalBets: bal.totalBets,
      winsCount: bal.winsCount,
      lossesCount: bal.lossesCount,
      currentStreak: bal.currentStreak,
      bestStreak: bal.bestStreak,
      winRate: bal.totalBets > 0 ? Number(((bal.winsCount / bal.totalBets) * 100).toFixed(2)) : 0,
    };
  }

  @Get('me/bets')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '我的最近下注' })
  async myBets(@Request() req: any, @Query('limit') limit?: string) {
    const n = limit ? Math.max(1, Math.min(100, parseInt(limit, 10))) : 30;
    return { items: await this.service.getMyBets(req.user?.id, n) };
  }

  @Get('leaderboard')
  @ApiOperation({ summary: '盈利排行榜' })
  async leaderboard(@Query('limit') limit?: string) {
    const n = limit ? Math.max(1, Math.min(100, parseInt(limit, 10))) : 10;
    return { items: await this.service.leaderboard(n) };
  }

  // ── Polymarket 热点（只读，跳转到 polymarket.com） ──
  @Get('polymarket/trending')
  @ApiOperation({ summary: 'Polymarket 热点事件（只读，跳转外部）' })
  async polymarketTrending(@Query('limit') limit?: string) {
    const n = limit ? Math.max(1, Math.min(40, parseInt(limit, 10))) : 12;
    return { items: await this.polymarket.getTrendingEvents(n) };
  }
}
