import {
  Controller,
  Get,
  Put,
  Post,
  Param,
  Body,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { LogisticsService } from './logistics.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@ApiTags('logistics')
@Controller('logistics')
export class LogisticsController {
  constructor(private readonly logisticsService: LogisticsService) {}

  @Get('tracking/:orderId')
  @ApiOperation({ summary: '获取物流跟踪信息（需要认证）' })
  @ApiResponse({ status: 200, description: '返回物流跟踪信息' })
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  async getTrackingAuth(@Param('orderId') orderId: string) {
    return this.logisticsService.getLogisticsTracking(orderId);
  }

  @Put(':orderId/status')
  @ApiOperation({ summary: '更新物流状态' })
  @ApiResponse({ status: 200, description: '返回更新的物流信息' })
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  async updateStatus(
    @Param('orderId') orderId: string,
    @Body() body: {
      status: 'pending' | 'packed' | 'shipped' | 'in_transit' | 'delivered' | 'failed';
      trackingNumber?: string;
      carrier?: string;
    },
  ) {
    return this.logisticsService.updateLogisticsStatus(
      orderId,
      body.status,
      body.trackingNumber,
      body.carrier,
    );
  }

  @Post(':orderId/events')
  @ApiOperation({ summary: '添加物流事件' })
  @ApiResponse({ status: 200, description: '事件添加成功' })
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  async addEvent(
    @Param('orderId') orderId: string,
    @Body() body: {
      description: string;
      location?: string;
      status?: string;
    },
  ) {
    return this.logisticsService.addLogisticsEvent(
      orderId,
      body.description,
      body.location,
      body.status,
    );
  }

  @Get('tracking/:orderId')
  @ApiOperation({ summary: '获取物流跟踪信息（公开端点）' })
  @ApiResponse({ status: 200, description: '返回物流跟踪信息' })
  async getTracking(@Param('orderId') orderId: string) {
    return this.logisticsService.getLogisticsTracking(orderId);
  }

  @Post('tracking/:orderId/auto-update')
  @ApiOperation({ summary: '自动更新物流状态' })
  @ApiResponse({ status: 200, description: '返回更新的物流信息' })
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  async autoUpdate(@Param('orderId') orderId: string) {
    return this.logisticsService.autoUpdateLogisticsStatus(orderId);
  }
}

