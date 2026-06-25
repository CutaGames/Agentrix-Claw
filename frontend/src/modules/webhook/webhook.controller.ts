import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
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
import { WebhookService } from './webhook.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@ApiTags('webhooks')
@ApiBearerAuth()
@Controller('webhooks')
@UseGuards(JwtAuthGuard)
export class WebhookController {
  constructor(private readonly webhookService: WebhookService) {}

  @Post()
  @ApiOperation({ summary: '创建Webhook配置' })
  @ApiResponse({ status: 201, description: 'Webhook配置创建成功' })
  async createWebhook(
    @Request() req,
    @Body() body: {
      url: string;
      events: string[];
    },
  ) {
    return this.webhookService.createWebhookConfig({
      userId: req.user.id,
      ...body,
    });
  }

  @Get()
  @ApiOperation({ summary: '获取Webhook配置列表' })
  @ApiResponse({ status: 200, description: '返回Webhook配置列表' })
  async getWebhooks(@Request() req) {
    return this.webhookService.getWebhookConfigs(req.user.id);
  }

  @Put(':id')
  @ApiOperation({ summary: '更新Webhook配置' })
  @ApiResponse({ status: 200, description: '更新成功' })
  async updateWebhook(
    @Request() req,
    @Param('id') id: string,
    @Body() body: {
      url?: string;
      events?: string[];
      active?: boolean;
    },
  ) {
    return this.webhookService.updateWebhookConfig(id, body);
  }

  @Delete(':id')
  @ApiOperation({ summary: '删除Webhook配置' })
  @ApiResponse({ status: 200, description: '删除成功' })
  async deleteWebhook(@Param('id') id: string) {
    await this.webhookService.deleteWebhookConfig(id);
    return { success: true };
  }

  @Get(':id/events')
  @ApiOperation({ summary: '获取Webhook事件历史' })
  @ApiResponse({ status: 200, description: '返回事件历史' })
  async getWebhookEvents(
    @Param('id') id: string,
    @Query('limit') limit?: number,
  ) {
    return this.webhookService.getWebhookEvents(id, limit || 50);
  }
}

