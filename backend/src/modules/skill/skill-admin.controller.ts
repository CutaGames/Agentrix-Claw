/**
 * Skill Admin Controller
 * 
 * 后台管理 API：审批、上架、定价管理
 */

import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  Patch,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { SkillApprovalService } from './skill-approval.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@ApiTags('Skill Admin')
@Controller('admin/skills')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class SkillAdminController {
  constructor(private readonly approvalService: SkillApprovalService) {}

  /**
   * 获取待审批列表
   */
  @Get('pending')
  @ApiOperation({ summary: '获取待审批 Skill 列表' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  async getPendingSkills(
    @Query('page') page = 1,
    @Query('limit') limit = 20,
  ) {
    return this.approvalService.getPendingSkills(Number(page), Number(limit));
  }

  /**
   * 获取导入统计
   */
  @Get('stats')
  @ApiOperation({ summary: '获取导入统计' })
  async getImportStats() {
    return this.approvalService.getImportStats();
  }

  /**
   * 获取单个 Skill 详情
   */
  @Get(':id')
  @ApiOperation({ summary: '获取 Skill 详情' })
  async getSkillDetail(@Param('id') id: string) {
    return this.approvalService.getSkillDetail(id);
  }

  /**
   * 触发生态扫描导入
   */
  @Post('scan')
  @ApiOperation({ summary: '扫描并导入外部 Skill (Claude MCP / ChatGPT Actions / X402 / UCP)' })
  async scanAndImport() {
    return this.approvalService.scanAndImport();
  }

  /**
   * V2.1: 单独扫描 X402 服务
   */
  @Post('scan/x402')
  @ApiOperation({ summary: '扫描并导入 X402 服务' })
  async scanX402(@Body() body?: { serviceUrls?: string[] }) {
    return this.approvalService.scanX402Services(body?.serviceUrls);
  }

  /**
   * V2.1: 单独扫描 UCP 商户
   */
  @Post('scan/ucp')
  @ApiOperation({ summary: '扫描并导入 UCP 商户商品' })
  async scanUCP(@Body() body?: { merchantUrls?: string[] }) {
    return this.approvalService.scanUCPMerchants(body?.merchantUrls);
  }

  /**
   * V2.1: 单独扫描 MCP 服务器
   */
  @Post('scan/mcp')
  @ApiOperation({ summary: '扫描并导入 Claude MCP 服务器' })
  async scanMCP(@Body() body?: { serverIds?: string[] }) {
    return this.approvalService.scanMCPServers(body?.serverIds);
  }

  /**
   * 批量审批通过
   */
  @Post('approve')
  @ApiOperation({ summary: '批量审批通过' })
  async approveSkills(
    @Body() body: { skillIds: string[]; publishImmediately?: boolean },
  ) {
    return this.approvalService.approveSkills(
      body.skillIds,
      body.publishImmediately ?? true,
    );
  }

  /**
   * 批量拒绝
   */
  @Post('reject')
  @ApiOperation({ summary: '批量拒绝' })
  async rejectSkills(
    @Body() body: { skillIds: string[]; reason?: string },
  ) {
    return this.approvalService.rejectSkills(body.skillIds, body.reason);
  }

  /**
   * 批量上架
   */
  @Post('publish')
  @ApiOperation({ summary: '批量上架到市场' })
  async publishSkills(@Body() body: { skillIds: string[] }) {
    return this.approvalService.publishSkills(body.skillIds);
  }

  /**
   * 更新定价
   */
  @Patch(':id/pricing')
  @ApiOperation({ summary: '更新 Skill 定价' })
  async updatePricing(
    @Param('id') id: string,
    @Body() pricing: {
      type?: 'free' | 'per_call' | 'subscription' | 'revenue_share';
      pricePerCall?: number;
      currency?: string;
      commissionRate?: number;
    },
  ) {
    return this.approvalService.updatePricing(id, pricing);
  }
}
