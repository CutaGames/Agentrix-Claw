import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  UseGuards,
  Request,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { HumanCommissionService } from './human-commission.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { HumanCommissionStatus } from '../../entities/human-commission.entity';

@ApiTags('Human Commissions')
@ApiBearerAuth()
@Controller('human-commissions')
@UseGuards(JwtAuthGuard)
export class HumanCommissionController {
  constructor(private readonly humanCommissionService: HumanCommissionService) {}

  @Get('stats')
  @ApiOperation({ summary: '获取推广佣金统计' })
  @ApiResponse({ status: 200, description: '返回佣金统计数据' })
  async getStats(@Request() req) {
    return this.humanCommissionService.getCommissionStats(req.user.id);
  }

  @Get()
  @ApiOperation({ summary: '获取佣金记录列表' })
  @ApiResponse({ status: 200, description: '返回佣金记录' })
  async getCommissions(
    @Request() req,
    @Query('status') status?: HumanCommissionStatus,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.humanCommissionService.getMyCommissions(req.user.id, {
      status,
      page: page ? parseInt(page) : 1,
      limit: limit ? parseInt(limit) : 20,
    });
  }

  @Get('referrals')
  @ApiOperation({ summary: '获取我推荐的用户列表' })
  @ApiResponse({ status: 200, description: '返回推荐用户列表' })
  async getReferrals(@Request() req) {
    const chains = await this.humanCommissionService.getReferredUsers(req.user.id);
    return chains.map(c => ({
      id: c.id,
      userId: c.referredId,
      userName: c.referred?.nickname || c.referred?.email || 'User',
      level: c.level,
      createdAt: c.createdAt,
    }));
  }

  @Post('settle')
  @ApiOperation({ summary: '结算已确认的佣金' })
  @ApiResponse({ status: 200, description: '结算完成' })
  async settle(@Request() req) {
    return this.humanCommissionService.settleCommissions(req.user.id);
  }

  @Post('record-referral')
  @ApiOperation({ summary: '记录推荐关系（注册时调用）' })
  @ApiResponse({ status: 201, description: '推荐关系已记录' })
  async recordReferral(
    @Request() req,
    @Body() body: { referralLinkId?: string; referrerCode?: string },
  ) {
    // 这里需要根据 referralLinkId 或 referrerCode 找到推荐人
    // 简化实现：直接用 referrerCode 作为推荐人ID
    if (body.referrerCode) {
      const chain = await this.humanCommissionService.recordReferral(
        body.referrerCode,
        req.user.id,
        body.referralLinkId,
      );
      return { success: true, chain };
    }
    return { success: false, message: 'No referrer specified' };
  }
}
