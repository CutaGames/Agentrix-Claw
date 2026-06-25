import {
  Controller,
  Post,
  Get,
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
import { RiskService } from './risk.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@ApiTags('risk')
@ApiBearerAuth()
@Controller('risk')
@UseGuards(JwtAuthGuard)
export class RiskController {
  constructor(private readonly riskService: RiskService) {}

  @Post('assess')
  @ApiOperation({ summary: '评估支付风险' })
  @ApiResponse({ status: 200, description: '返回风险评估结果' })
  async assessRisk(
    @Request() req,
    @Body() body: {
      amount: number;
      currency: string;
      paymentMethod: string;
      deviceFingerprint?: any;
      ip?: string;
      recipient?: string;
      metadata?: any;
    },
  ) {
    return this.riskService.assessRisk({
      userId: req.user.id,
      ...body,
    });
  }

  @Get('blacklist/check')
  @ApiOperation({ summary: '检查IP是否在黑名单中' })
  @ApiResponse({ status: 200, description: '返回检查结果' })
  async checkBlacklist(@Query('ip') ip: string) {
    return {
      blacklisted: await this.riskService.checkBlacklist(ip),
    };
  }

  @Post('blacklist/add')
  @ApiOperation({ summary: '添加IP到黑名单' })
  @ApiResponse({ status: 200, description: '添加成功' })
  async addToBlacklist(
    @Body() body: { ip: string; reason?: string },
  ) {
    await this.riskService.addToBlacklist(body.ip, body.reason);
    return { success: true };
  }

  @Get('frequency-limit')
  @ApiOperation({ summary: '检查频率限制' })
  @ApiResponse({ status: 200, description: '返回频率限制状态' })
  async checkFrequencyLimit(
    @Request() req,
    @Query('agentId') agentId: string,
    @Query('timeWindow') timeWindow?: number,
    @Query('maxRequests') maxRequests?: number,
  ) {
    return this.riskService.checkFrequencyLimit(
      req.user.id,
      agentId,
      timeWindow,
      maxRequests,
    );
  }

  @Get('address-risk')
  @ApiOperation({ summary: '获取链上地址风险评分' })
  @ApiResponse({ status: 200, description: '返回风险评分' })
  async getAddressRiskScore(@Query('address') address: string) {
    const score = await this.riskService.getAddressRiskScore(address);
    return {
      address,
      riskScore: score,
      riskLevel: score < 30 ? 'low' : score < 60 ? 'medium' : score < 80 ? 'high' : 'critical',
    };
  }
}

