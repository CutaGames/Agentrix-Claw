import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Body,
  Query,
  Request,
  Res,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiResponse,
  ApiQuery,
} from '@nestjs/swagger';
import { Response } from 'express';
import { ReferralService, CreateReferralDto, UpdateReferralStatusDto } from './referral.service';
import { ReferralCommissionService } from './referral-commission.service';
import { ReferralLinkService, CreateReferralLinkDto } from './referral-link.service';
import { ReferralLinkType, ReferralLinkStatus } from '../../entities/referral-link.entity';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Public } from '../auth/decorators/public.decorator';

@ApiTags('referral')
@Controller('referral')
export class ReferralController {
  constructor(
    private readonly referralService: ReferralService,
    private readonly commissionService: ReferralCommissionService,
    private readonly linkService: ReferralLinkService,
  ) {}

  // ===== Referral Relationships =====

  @Post()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '创建推广关系' })
  @ApiResponse({ status: 201, description: '推广关系创建成功' })
  async createReferral(
    @Request() req: any,
    @Body() dto: CreateReferralDto,
  ) {
    return this.referralService.createReferral({
      ...dto,
      agentId: dto.agentId || req.user.id,
    });
  }

  @Get('my-referrals')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '获取我的推广关系' })
  async getMyReferrals(@Request() req: any) {
    const agentId = req.user.id;
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

  @Get('link')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '获取我的推广链接' })
  async getMyReferralLink(@Request() req: any) {
    const agentId = req.user.id;
    const baseUrl = process.env.FRONTEND_URL || 'https://www.agentrix.top';
    return {
      link: `${baseUrl}?ref=${agentId}`,
      agentId,
    };
  }

  // ===== Referral Links (Social Referral) =====

  @Post('links')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '创建推广短链（通用/商品级/Skill级）' })
  @ApiResponse({ status: 201, description: '推广短链创建成功' })
  async createReferralLink(
    @Request() req: any,
    @Body() dto: CreateReferralLinkDto,
  ) {
    return this.linkService.createLink(req.user.id, dto);
  }

  @Get('links')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '获取我的推广短链列表' })
  @ApiQuery({ name: 'type', required: false, enum: ReferralLinkType })
  async getMyLinks(
    @Request() req: any,
    @Query('type') type?: ReferralLinkType,
  ) {
    return this.linkService.getMyLinks(req.user.id, type);
  }

  @Get('links/stats')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '获取推广短链统计汇总' })
  async getLinkStats(@Request() req: any) {
    return this.linkService.getLinkStatistics(req.user.id);
  }

  @Put('links/:linkId/status')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '更新推广短链状态（暂停/恢复）' })
  async updateLinkStatus(
    @Request() req: any,
    @Param('linkId') linkId: string,
    @Body() body: { status: ReferralLinkStatus },
  ) {
    return this.linkService.updateLinkStatus(req.user.id, linkId, body.status);
  }

  @Delete('links/:linkId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '归档推广短链' })
  async archiveLink(
    @Request() req: any,
    @Param('linkId') linkId: string,
  ) {
    await this.linkService.archiveLink(req.user.id, linkId);
    return { success: true };
  }

  @Public()
  @Get('r/:shortCode/resolve')
  @ApiOperation({ summary: '解析短链（返回目标URL，不重定向）' })
  async resolveShortLink(@Param('shortCode') shortCode: string) {
    const link = await this.linkService.getLinkByShortCode(shortCode);
    if (!link || link.status !== ReferralLinkStatus.ACTIVE) {
      return { fullUrl: null, targetId: null, targetType: null };
    }
    await this.linkService.recordClick(shortCode, true);
    return {
      fullUrl: link.fullUrl,
      targetId: link.targetId,
      targetType: link.targetType,
      targetName: link.targetName,
      type: link.type,
    };
  }

  @Public()
  @Get('r/:shortCode')
  @ApiOperation({ summary: '短链重定向（公开，记录点击）' })
  async redirectShortLink(
    @Param('shortCode') shortCode: string,
    @Res() res: Response,
  ) {
    const link = await this.linkService.getLinkByShortCode(shortCode);
    if (!link || link.status !== ReferralLinkStatus.ACTIVE) {
      const baseUrl = process.env.FRONTEND_URL || 'https://www.agentrix.top';
      return res.redirect(baseUrl);
    }

    await this.linkService.recordClick(shortCode, true);

    const targetUrl = link.fullUrl || `${process.env.FRONTEND_URL || 'https://www.agentrix.top'}?ref=${link.ownerId}`;
    return res.redirect(302, targetUrl);
  }

  // ===== Referral Details & Commissions =====

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
}

