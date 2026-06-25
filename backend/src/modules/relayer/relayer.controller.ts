import { Controller, Post, Body, Get, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { PayMindRelayerService } from './relayer.service';
import { QuickPayRequestDto } from './dto/relayer.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@ApiTags('relayer')
@Controller('relayer')
export class RelayerController {
  constructor(private readonly relayerService: PayMindRelayerService) {}

  @Post('/quickpay')
  @ApiOperation({ summary: '处理 QuickPay 请求（Agent 调用）' })
  @ApiResponse({ status: 200, description: '支付确认成功' })
  @ApiResponse({ status: 400, description: '支付失败' })
  async processQuickPay(@Body() dto: QuickPayRequestDto) {
    return this.relayerService.processQuickPay(dto);
  }

  @Get('/queue/status')
  @ApiOperation({ summary: '获取队列状态（监控用）' })
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  async getQueueStatus() {
    return this.relayerService.getQueueStatus();
  }
}

