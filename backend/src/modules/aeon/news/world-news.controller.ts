import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { WorldNewsService } from './world-news.service';
import { AEON_ACTIVE_EPOCH, type AeonEpoch } from '../../../../../shared/types/aeon-world';

/**
 * WorldNewsController — 世界新闻栏 + 排行榜(Task 4.6 / R14.5)。`v1/aeon/news`。
 * 公开只读(逛世界即可看,无需登录)。
 */
@ApiTags('aeon/news')
@Controller('v1/aeon/news')
export class WorldNewsController {
  constructor(private readonly news: WorldNewsService) {}

  @Get()
  @ApiOperation({ summary: '世界新闻流' })
  list(@Query('epoch') epoch?: string, @Query('limit') limit?: string) {
    const ep = (epoch as AeonEpoch) || AEON_ACTIVE_EPOCH;
    return { items: this.news.list(ep, limit ? Math.min(100, parseInt(limit, 10) || 30) : 30) };
  }

  @Get('leaderboard')
  @ApiOperation({ summary: 'AXP 收入排行榜' })
  async leaderboard(@Query('limit') limit?: string) {
    return { items: await this.news.leaderboard(limit ? Math.min(50, parseInt(limit, 10) || 10) : 10) };
  }
}
