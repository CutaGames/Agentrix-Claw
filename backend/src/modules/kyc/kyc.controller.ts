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
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiParam, ApiQuery } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { KYCService, SubmitKYCDto, ReviewKYCDto } from './kyc.service';
import { KYCRecordLevel, DocumentType } from '../../entities/kyc-record.entity';

@ApiTags('KYC')
@Controller('kyc')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class KYCController {
  constructor(private readonly kycService: KYCService) {}

  @Post('submit')
  @ApiOperation({ summary: '提交 KYC 申请' })
  @ApiResponse({ status: 201, description: 'KYC 申请已提交' })
  async submit(@Request() req, @Body() dto: Omit<SubmitKYCDto, 'userId'>) {
    const record = await this.kycService.submit({
      ...dto,
      userId: req.user.id,
    });
    return {
      success: true,
      data: record,
      message: 'KYC 申请已提交',
    };
  }

  @Get('my')
  @ApiOperation({ summary: '获取我的 KYC 记录' })
  @ApiResponse({ status: 200, description: '返回 KYC 记录列表' })
  async getMyRecords(@Request() req) {
    const records = await this.kycService.findByUser(req.user.id);
    return {
      success: true,
      data: records,
    };
  }

  @Get('my/active')
  @ApiOperation({ summary: '获取我的有效 KYC 认证' })
  @ApiResponse({ status: 200, description: '返回有效的 KYC 认证' })
  async getMyActiveKYC(@Request() req) {
    const record = await this.kycService.getActiveKYC(req.user.id);
    return {
      success: true,
      data: record,
    };
  }

  @Get('check/:level')
  @ApiOperation({ summary: '检查是否满足 KYC 级别要求' })
  @ApiParam({ name: 'level', description: 'KYC 级别', enum: KYCRecordLevel })
  @ApiResponse({ status: 200, description: '返回是否满足要求' })
  async checkLevel(@Request() req, @Param('level') level: KYCRecordLevel) {
    const satisfied = await this.kycService.checkKYCLevel(req.user.id, level);
    return {
      success: true,
      data: { satisfied, requiredLevel: level },
    };
  }

  @Get(':id')
  @ApiOperation({ summary: '获取 KYC 记录详情' })
  @ApiParam({ name: 'id', description: 'KYC 记录 ID' })
  @ApiResponse({ status: 200, description: '返回 KYC 记录详情' })
  async findOne(@Param('id') id: string) {
    const record = await this.kycService.findById(id);
    return {
      success: true,
      data: record,
    };
  }

  @Post(':id/additional-info')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '提交补充材料' })
  @ApiParam({ name: 'id', description: 'KYC 记录 ID' })
  @ApiResponse({ status: 200, description: '补充材料已提交' })
  async submitAdditionalInfo(
    @Param('id') id: string,
    @Body('documents') documents: { type: DocumentType; url: string; hash?: string }[],
  ) {
    const record = await this.kycService.submitAdditionalInfo(id, documents);
    return {
      success: true,
      data: record,
      message: '补充材料已提交',
    };
  }

  @Post(':id/cancel')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '取消 KYC 申请' })
  @ApiParam({ name: 'id', description: 'KYC 记录 ID' })
  @ApiResponse({ status: 200, description: 'KYC 申请已取消' })
  async cancel(@Request() req, @Param('id') id: string) {
    const record = await this.kycService.cancel(id, req.user.id);
    return {
      success: true,
      data: record,
      message: 'KYC 申请已取消',
    };
  }

  // ========== 管理员接口 ==========

  @Get('admin/pending')
  @ApiOperation({ summary: '获取待审核列表（管理员）' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiResponse({ status: 200, description: '返回待审核列表' })
  async getPendingReviews(
    @Query('page') page = 1,
    @Query('limit') limit = 20,
  ) {
    const result = await this.kycService.getPendingReviews(Number(page), Number(limit));
    return {
      success: true,
      data: result.items,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total: result.total,
        totalPages: Math.ceil(result.total / Number(limit)),
      },
    };
  }

  @Post('admin/:id/start-review')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '开始审核（管理员）' })
  @ApiParam({ name: 'id', description: 'KYC 记录 ID' })
  @ApiResponse({ status: 200, description: '已开始审核' })
  async startReview(@Request() req, @Param('id') id: string) {
    const record = await this.kycService.startReview(id, req.user.id);
    return {
      success: true,
      data: record,
      message: '已开始审核',
    };
  }

  @Post('admin/:id/request-info')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '请求补充材料（管理员）' })
  @ApiParam({ name: 'id', description: 'KYC 记录 ID' })
  @ApiResponse({ status: 200, description: '已请求补充材料' })
  async requestAdditionalInfo(
    @Param('id') id: string,
    @Body('requiredInfo') requiredInfo: string[],
  ) {
    const record = await this.kycService.requestAdditionalInfo(id, requiredInfo);
    return {
      success: true,
      data: record,
      message: '已请求补充材料',
    };
  }

  @Post('admin/:id/complete-review')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '完成审核（管理员）' })
  @ApiParam({ name: 'id', description: 'KYC 记录 ID' })
  @ApiResponse({ status: 200, description: '审核已完成' })
  async completeReview(@Param('id') id: string, @Body() dto: ReviewKYCDto) {
    const record = await this.kycService.completeReview(id, dto);
    return {
      success: true,
      data: record,
      message: dto.status === 'approved' ? 'KYC 认证已通过' : 'KYC 认证已拒绝',
    };
  }

  @Post('admin/:id/revoke')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '撤销认证（管理员）' })
  @ApiParam({ name: 'id', description: 'KYC 记录 ID' })
  @ApiResponse({ status: 200, description: '认证已撤销' })
  async revoke(@Param('id') id: string, @Body('reason') reason: string) {
    const record = await this.kycService.revoke(id, reason);
    return {
      success: true,
      data: record,
      message: '认证已撤销',
    };
  }

  @Put('admin/:id/risk-score')
  @ApiOperation({ summary: '更新风险评分（管理员）' })
  @ApiParam({ name: 'id', description: 'KYC 记录 ID' })
  @ApiResponse({ status: 200, description: '风险评分已更新' })
  async updateRiskScore(
    @Param('id') id: string,
    @Body('amlScore') amlScore: number,
  ) {
    const record = await this.kycService.updateRiskScore(id, amlScore);
    return {
      success: true,
      data: {
        amlRiskScore: record.amlRiskScore,
      },
      message: '风险评分已更新',
    };
  }

  @Get('admin/expiring')
  @ApiOperation({ summary: '获取即将过期的认证（管理员）' })
  @ApiQuery({ name: 'days', required: false, type: Number, description: '提前天数，默认30' })
  @ApiResponse({ status: 200, description: '返回即将过期的认证列表' })
  async getExpiringRecords(@Query('days') days = 30) {
    const records = await this.kycService.getExpiringRecords(Number(days));
    return {
      success: true,
      data: records,
    };
  }

  @Get('admin/statistics')
  @ApiOperation({ summary: '获取 KYC 统计信息（管理员）' })
  @ApiResponse({ status: 200, description: '返回统计信息' })
  async getStatistics() {
    const stats = await this.kycService.getStatistics();
    return {
      success: true,
      data: stats,
    };
  }
}
