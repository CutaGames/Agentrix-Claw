import {
  Controller,
  Get,
  Post,
  Put,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiQuery,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { DeveloperAccountService } from './developer-account.service';
import {
  DeveloperAccountStatus,
  DeveloperTier,
  DeveloperType,
} from '../../entities/developer-account.entity';

@ApiTags('Developer Account')
@Controller('developer-accounts')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class DeveloperAccountController {
  constructor(private readonly developerAccountService: DeveloperAccountService) {}

  /**
   * 创建开发者账户
   */
  @Post()
  @ApiOperation({ summary: '创建开发者账户' })
  @ApiResponse({ status: 201, description: '开发者账户创建成功' })
  async create(
    @Request() req: any,
    @Body() body: {
      name: string;
      description?: string;
      website?: string;
      contactEmail?: string;
      type?: DeveloperType;
      metadata?: Record<string, any>;
    },
  ) {
    return this.developerAccountService.create(req.user.id, body);
  }

  /**
   * 获取我的开发者账户
   */
  @Get('my')
  @ApiOperation({ summary: '获取我的开发者账户' })
  @ApiResponse({ status: 200, description: '开发者账户信息' })
  async getMyAccount(@Request() req: any) {
    return this.developerAccountService.findByUserId(req.user.id);
  }

  /**
   * 获取开发者仪表盘
   */
  @Get('dashboard')
  @ApiOperation({ summary: '获取开发者仪表盘数据' })
  @ApiResponse({ status: 200, description: '仪表盘数据' })
  async getDashboard(@Request() req: any) {
    return this.developerAccountService.getDashboard(req.user.id);
  }

  /**
   * 获取开发者账户详情
   */
  @Get(':id')
  @ApiOperation({ summary: '获取开发者账户详情' })
  @ApiResponse({ status: 200, description: '开发者账户详情' })
  async findById(@Param('id') id: string) {
    return this.developerAccountService.findById(id);
  }

  /**
   * 更新开发者账户
   */
  @Put(':id')
  @ApiOperation({ summary: '更新开发者账户' })
  @ApiResponse({ status: 200, description: '更新成功' })
  async update(
    @Param('id') id: string,
    @Request() req: any,
    @Body() body: {
      name?: string;
      description?: string;
      website?: string;
      contactEmail?: string;
      webhookUrl?: string;
      oauthCallbackUrls?: string[];
      metadata?: Record<string, any>;
    },
  ) {
    return this.developerAccountService.update(id, req.user.id, body);
  }

  /**
   * 签署开发者协议
   */
  @Post(':id/sign-agreement')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '签署开发者协议' })
  @ApiResponse({ status: 200, description: '签署成功' })
  async signAgreement(@Param('id') id: string, @Request() req: any) {
    return this.developerAccountService.signAgreement(id, req.user.id);
  }

  /**
   * 检查 API Key 限额
   */
  @Get(':id/api-key-limit')
  @ApiOperation({ summary: '检查 API Key 创建限额' })
  @ApiResponse({ status: 200, description: '限额信息' })
  async checkApiKeyLimit(@Param('id') id: string) {
    return this.developerAccountService.checkApiKeyLimit(id);
  }

  /**
   * 检查请求限额
   */
  @Get(':id/rate-limit')
  @ApiOperation({ summary: '检查请求限额' })
  @ApiResponse({ status: 200, description: '限额信息' })
  async checkRateLimit(@Param('id') id: string) {
    return this.developerAccountService.checkRateLimit(id);
  }

  // ========== 管理员接口 ==========

  /**
   * 获取开发者列表（管理员）
   */
  @Get()
  @ApiOperation({ summary: '获取开发者列表（管理员）' })
  @ApiQuery({ name: 'status', required: false, enum: DeveloperAccountStatus })
  @ApiQuery({ name: 'tier', required: false, enum: DeveloperTier })
  @ApiQuery({ name: 'type', required: false, enum: DeveloperType })
  @ApiQuery({ name: 'search', required: false })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  @ApiResponse({ status: 200, description: '开发者列表' })
  async findAll(
    @Query('status') status?: DeveloperAccountStatus,
    @Query('tier') tier?: DeveloperTier,
    @Query('type') type?: DeveloperType,
    @Query('search') search?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.developerAccountService.findAll({
      status,
      tier,
      type,
      search,
      page: page ? parseInt(page) : undefined,
      limit: limit ? parseInt(limit) : undefined,
    });
  }

  /**
   * 审核通过
   */
  @Post(':id/approve')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '审核通过（管理员）' })
  @ApiResponse({ status: 200, description: '审核成功' })
  async approve(@Param('id') id: string, @Request() req: any) {
    return this.developerAccountService.approve(id, req.user.id);
  }

  /**
   * 审核拒绝
   */
  @Post(':id/reject')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '审核拒绝（管理员）' })
  @ApiResponse({ status: 200, description: '拒绝成功' })
  async reject(
    @Param('id') id: string,
    @Request() req: any,
    @Body() body: { reason: string },
  ) {
    return this.developerAccountService.reject(id, req.user.id, body.reason);
  }

  /**
   * 暂停账户
   */
  @Post(':id/suspend')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '暂停账户（管理员）' })
  @ApiResponse({ status: 200, description: '暂停成功' })
  async suspend(
    @Param('id') id: string,
    @Request() req: any,
    @Body() body: { reason: string },
  ) {
    return this.developerAccountService.suspend(id, req.user.id, body.reason);
  }

  /**
   * 恢复账户
   */
  @Post(':id/resume')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '恢复账户（管理员）' })
  @ApiResponse({ status: 200, description: '恢复成功' })
  async resume(@Param('id') id: string, @Request() req: any) {
    return this.developerAccountService.resume(id, req.user.id);
  }

  /**
   * 升级等级
   */
  @Post(':id/upgrade-tier')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '升级等级（管理员）' })
  @ApiResponse({ status: 200, description: '升级成功' })
  async upgradeTier(
    @Param('id') id: string,
    @Body() body: { tier: DeveloperTier },
  ) {
    return this.developerAccountService.upgradeTier(id, body.tier);
  }
}
