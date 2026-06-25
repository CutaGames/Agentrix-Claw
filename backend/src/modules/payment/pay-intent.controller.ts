import {
  Controller,
  Get,
  Post,
  Put,
  Body,
  Param,
  UseGuards,
  Request,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiHeader,
} from '@nestjs/swagger';
import { PayIntentService, CreatePayIntentDto } from './pay-intent.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { OptionalJwtAuthGuard } from '../auth/guards/optional-jwt-auth.guard';
import { ApiKeyGuard } from '../api-key/guards/api-key.guard';
import { UnifiedAuthGuard } from '../auth/guards/unified-auth.guard';

@ApiTags('pay-intents')
@Controller('pay-intents')
export class PayIntentController {
  constructor(private readonly payIntentService: PayIntentService) {}

  @Post()
  @ApiOperation({ summary: '创建PayIntent（支持JWT或API Key）' })
  @ApiResponse({ status: 201, description: '返回创建的PayIntent' })
  @ApiHeader({ name: 'x-api-key', description: 'API Key (agx_test_... or agx_live_...)', required: false })
  @UseGuards(UnifiedAuthGuard)
  async createPayIntent(
    @Request() req: any,
    @Body() dto: CreatePayIntentDto,
  ) {
    // 如果是通过 API Key 创建的，强制使用 API Key 的模式
    if (req.user?.mode) {
      dto.mode = req.user.mode;
    }
    
    // 如果是商户通过 API Key 创建，自动填充 merchantId
    if (!dto.merchantId && req.user?.id) {
      dto.merchantId = req.user.id;
    }

    return this.payIntentService.createPayIntent(req.user?.id, dto);
  }

  @Post(':payIntentId/authorize')
  @ApiOperation({ summary: '授权PayIntent' })
  @ApiResponse({ status: 200, description: '返回授权的PayIntent' })
  @UseGuards(OptionalJwtAuthGuard)
  @ApiBearerAuth()
  async authorizePayIntent(
    @Request() req: any,
    @Param('payIntentId') payIntentId: string,
    @Body() body: { authorizationType?: 'user' | 'agent' | 'quickpay'; quickPayGrantId?: string },
  ) {
    return this.payIntentService.authorizePayIntent(
      payIntentId,
      req.user?.id,
      body.authorizationType || 'user',
      body.quickPayGrantId,
    );
  }

  @Post(':payIntentId/execute')
  @ApiOperation({ summary: '执行PayIntent（创建实际支付）' })
  @ApiResponse({ status: 200, description: '返回执行 of the PayIntent' })
  @UseGuards(OptionalJwtAuthGuard)
  @ApiBearerAuth()
  async executePayIntent(
    @Request() req: any,
    @Param('payIntentId') payIntentId: string,
    @Body() body: any,
  ) {
    return this.payIntentService.executePayIntent(payIntentId, req.user?.id, body);
  }

  @Get(':payIntentId')
  @ApiOperation({ summary: '获取PayIntent详情' })
  @ApiResponse({ status: 200, description: '返回PayIntent详情' })
  @UseGuards(OptionalJwtAuthGuard)
  @ApiBearerAuth()
  async getPayIntent(
    @Request() req: any,
    @Param('payIntentId') payIntentId: string,
  ) {
    return this.payIntentService.getPayIntent(payIntentId, req.user?.id);
  }

  @Put(':payIntentId/cancel')
  @ApiOperation({ summary: '取消PayIntent' })
  @ApiResponse({ status: 200, description: '返回取消的PayIntent' })
  @UseGuards(UnifiedAuthGuard)
  @ApiBearerAuth()
  async cancelPayIntent(
    @Request() req: any,
    @Param('payIntentId') payIntentId: string,
  ) {
    return this.payIntentService.cancelPayIntent(payIntentId, req.user?.id);
  }
}

