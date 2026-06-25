import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  UseGuards,
  Request,
  HttpStatus,
  HttpCode,
  NotFoundException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ExpertProfileService } from './expert-profile.service';

@ApiTags('Expert Profile')
@Controller('expert-profiles')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class ExpertProfileController {
  constructor(private readonly expertProfileService: ExpertProfileService) {}

  @Get('my')
  @ApiOperation({ summary: '获取我的专家档案' })
  @ApiResponse({ status: 200, description: '获取成功' })
  @ApiResponse({ status: 404, description: '档案不存在' })
  async getMyProfile(@Request() req) {
    const profile = await this.expertProfileService.getProfile(req.user.id);
    if (!profile) {
      throw new NotFoundException('Expert profile not found');
    }
    return profile;
  }

  @Post()
  @ApiOperation({ summary: '创建专家档案' })
  @ApiResponse({ status: 201, description: '创建成功' })
  async createProfile(
    @Request() req,
    @Body() body: {
      title: string;
      specialty: string;
      bio?: string;
      hourlyRate?: number;
      availability?: boolean;
    },
  ) {
    return this.expertProfileService.createProfile(req.user.id, body);
  }

  @Put('my')
  @ApiOperation({ summary: '更新我的专家档案' })
  @ApiResponse({ status: 200, description: '更新成功' })
  async updateMyProfile(
    @Request() req,
    @Body() body: {
      title?: string;
      specialty?: string;
      bio?: string;
      hourlyRate?: number;
      availability?: boolean;
    },
  ) {
    return this.expertProfileService.updateProfile(req.user.id, body);
  }

  @Get('my/sla-metrics')
  @ApiOperation({ summary: '获取SLA指标' })
  @ApiResponse({ status: 200, description: '获取成功' })
  async getSLAMetrics(@Request() req) {
    return this.expertProfileService.getSLAMetrics(req.user.id);
  }

  @Put('my/sla-config')
  @ApiOperation({ summary: '更新SLA配置' })
  @ApiResponse({ status: 200, description: '更新成功' })
  async updateSLAConfig(
    @Request() req,
    @Body() body: {
      targetResponseTime?: number;
      targetSuccessRate?: number;
      targetSatisfaction?: number;
    },
  ) {
    return this.expertProfileService.updateSLAConfig(req.user.id, body);
  }

  @Get(':id/consultations')
  @ApiOperation({ summary: '获取咨询列表' })
  @ApiResponse({ status: 200, description: '获取成功' })
  async getConsultations(
    @Param('id') id: string,
    @Request() req,
  ) {
    return this.expertProfileService.getConsultations(id, req.user.id);
  }

  @Post('my/capability-cards')
  @ApiOperation({ summary: '添加能力卡片' })
  @ApiResponse({ status: 201, description: '添加成功' })
  async addCapabilityCard(
    @Request() req,
    @Body() body: {
      title: string;
      description: string;
      skills: string[];
      pricing?: { amount: number; currency: string };
    },
  ) {
    return this.expertProfileService.addCapabilityCard(req.user.id, body);
  }

  @Put('my/capability-cards/:cardId')
  @ApiOperation({ summary: '更新能力卡片' })
  @ApiResponse({ status: 200, description: '更新成功' })
  async updateCapabilityCard(
    @Request() req,
    @Param('cardId') cardId: string,
    @Body() body: any,
  ) {
    return this.expertProfileService.updateCapabilityCard(req.user.id, cardId, body);
  }

  @Delete('my/capability-cards/:cardId')
  @ApiOperation({ summary: '删除能力卡片' })
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteCapabilityCard(
    @Request() req,
    @Param('cardId') cardId: string,
  ) {
    await this.expertProfileService.deleteCapabilityCard(req.user.id, cardId);
  }

  @Post('my/verification')
  @ApiOperation({ summary: '申请专家认证' })
  @ApiResponse({ status: 200, description: '申请已提交' })
  async requestVerification(
    @Request() req,
    @Body() body: {
      documents: string[];
      notes?: string;
    },
  ) {
    return this.expertProfileService.requestVerification(req.user.id, body);
  }

  @Post(':consultationId/accept')
  @ApiOperation({ summary: '接受咨询请求' })
  @ApiResponse({ status: 200, description: '已接受' })
  async acceptConsultation(
    @Request() req,
    @Param('consultationId') consultationId: string,
  ) {
    return this.expertProfileService.acceptConsultation(req.user.id, consultationId);
  }

  @Post(':consultationId/complete')
  @ApiOperation({ summary: '完成咨询' })
  @ApiResponse({ status: 200, description: '已完成' })
  async completeConsultation(
    @Request() req,
    @Param('consultationId') consultationId: string,
    @Body() body: { summary?: string; duration?: number },
  ) {
    return this.expertProfileService.completeConsultation(req.user.id, consultationId, body);
  }
}
