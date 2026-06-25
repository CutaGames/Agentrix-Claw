import {
  Controller,
  Get,
  Post,
  Put,
  Param,
  Body,
  Request,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiResponse,
} from '@nestjs/swagger';
import { ReferralService, CreateReferralDto, UpdateReferralStatusDto } from './referral.service';
import { ReferralCommissionService } from './referral-commission.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Public } from '../auth/decorators/public.decorator';

@ApiTags('referral')
@Controller('referral')
export class ReferralController {
  constructor(
    private readonly referralService: ReferralService,
    private readonly commissionService: ReferralCommissionService,
  ) {}

  @Post()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '创建推广关系' })
  @ApiResponse({ status: 201, description: '推广关系创建成功' })
  async createReferral(
    @Request() req: any,
    @Body() dto: CreateReferralDto,
  ) {
    // 从JWT中获取Agent ID（假设用户ID就是Agent ID，或从UserAgent表关联）
    return this.referralService.createReferral({
      ...dto,
      agentId: dto.agentId || req.user.id, // 如果未提供agentId，使用当前用户ID
    });
  }

  @Get('my-referrals')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '获取我的推广关系' })
  async getMyReferrals(@Request() req: any) {
    const agentId = req.user.id; // 假设用户ID就是Agent ID
    return this.referralService.getAgentReferrals(agentId);
  }

  @Get('stats')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '获取推广统计' })
  async getReferralStats(@Request() req: any) {
    const agentId = req.user.id;
    return this.referralService.getAgentReferralStats(agentId);
  }

  @Get(':referralId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '获取推广关系详情' })
  async getReferral(@Param('referralId') referralId: string) {
    return this.referralService.getReferral(referralId);
  }

  @Put(':referralId/status')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '更新推广关系状态（审核）' })
  async updateReferralStatus(
    @Param('referralId') referralId: string,
    @Body() dto: UpdateReferralStatusDto,
  ) {
    return this.referralService.updateReferralStatus(referralId, dto);
  }

  @Get(':referralId/commissions')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '获取推广关系的分成记录' })
  async getReferralCommissions(
    @Param('referralId') referralId: string,
    @Body() body?: { status?: string },
  ) {
    return this.referralService.getReferralCommissions(
      referralId,
      body?.status as any,
    );
  }

  @Get('commissions/pending')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '获取待结算的分成' })
  async getPendingCommissions(@Request() req: any) {
    const agentId = req.user.id;
    return this.commissionService.getPendingCommissions(agentId);
  }

  @Get('commissions/settled')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '获取已结算的分成' })
  async getSettledCommissions(
    @Request() req: any,
    @Body() body?: { period?: string },
  ) {
    const agentId = req.user.id;
    return this.commissionService.getSettledCommissions(agentId, body?.period);
  }

  @Post('commissions/settle')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '手动触发结算（管理员）' })
  async settleCommissions(@Body() body?: { period?: string }) {
    return this.commissionService.settleCommissions(body?.period);
  }
}

