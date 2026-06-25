import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  UseGuards,
  Request,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { UnifiedAgentService } from './unified-agent.service';

@ApiTags('Unified Agents')
@Controller('agents')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class UnifiedAgentController {
  constructor(private readonly service: UnifiedAgentService) {}

  @Get('unified')
  @ApiOperation({ summary: '获取统一 Agent 视图（Instance + Account 合并）' })
  @ApiResponse({ status: 200, description: '返回统一 Agent 列表' })
  async getUnifiedAgents(@Request() req) {
    const agents = await this.service.getUnifiedAgents(req.user.id);
    return { success: true, data: agents };
  }

  @Get('unified/:id')
  @ApiOperation({ summary: '获取单个 Agent 统一视图' })
  @ApiResponse({ status: 200, description: '返回 Agent 详情' })
  async getUnifiedAgent(@Request() req, @Param('id') id: string) {
    const agent = await this.service.getUnifiedAgentById(req.user.id, id);
    return { success: true, data: agent };
  }

  @Post('create')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: '创建 Agent（同时创建 Instance + Account）' })
  @ApiResponse({ status: 201, description: 'Agent 创建成功' })
  async createAgent(@Request() req, @Body() dto: {
    name: string;
    description?: string;
    personality?: string;
    defaultModel?: string;
    spendingLimits?: { singleTxLimit: number; dailyLimit: number; monthlyLimit: number; currency: string };
  }) {
    const agent = await this.service.createUnifiedAgent(req.user.id, dto);
    return { success: true, data: agent, message: 'Agent 创建成功' };
  }
}
