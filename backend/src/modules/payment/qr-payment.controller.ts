import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
  Logger,
  BadRequestException,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ApiKeyGuard as ApiKeyAuthGuard } from '../api-key/guards/api-key.guard';
import { QrPaymentService, GenerateQRCodeOptions, ProcessPaymentFromQRDto } from './qr-payment.service';

/**
 * P1: 线下 QR 支付控制器
 * 
 * 端点：
 * - POST /qr/generate - 生成支付二维码
 * - GET /qr/:qrId - 获取二维码详情
 * - GET /qr/:qrId/status - 获取支付状态
 * - POST /qr/:qrId/verify - 验证二维码
 * - POST /qr/:qrId/process - 处理扫码支付
 * - POST /qr/merchant/receive - 生成商户静态收款码
 */

@Controller('qr')
export class QrPaymentController {
  private readonly logger = new Logger(QrPaymentController.name);

  constructor(private readonly qrPaymentService: QrPaymentService) {}

  /**
   * 生成支付二维码
   * 
   * @example
   * POST /qr/generate
   * {
   *   "type": "fixed_amount",
   *   "merchantId": "merchant_123",
   *   "amount": 10.00,
   *   "currency": "USD",
   *   "description": "咖啡 x1"
   * }
   */
  @Post('generate')
  @UseGuards(JwtAuthGuard)
  async generateQRCode(
    @Body() dto: GenerateQRCodeOptions,
    @Request() req: any,
  ) {
    this.logger.log(`生成二维码请求: type=${dto.type}, user=${req.user?.id}`);

    // 如果是顾客付款码，自动使用当前用户 ID
    if (dto.type === 'customer_payment' && !dto.userId) {
      dto.userId = req.user?.id;
    }

    const result = await this.qrPaymentService.generatePaymentQRCode(dto);

    return {
      success: true,
      data: result,
    };
  }

  /**
   * API Key 方式生成二维码（供商户后端调用）
   */
  @Post('generate/api')
  @UseGuards(ApiKeyAuthGuard)
  async generateQRCodeWithApiKey(
    @Body() dto: GenerateQRCodeOptions,
    @Request() req: any,
  ) {
    this.logger.log(`API Key 生成二维码请求: type=${dto.type}, apiKey=${req.apiKey?.id}`);

    // API Key 认证时，merchantId 从 API Key 关联获取
    if (!dto.merchantId && req.apiKey?.merchantId) {
      dto.merchantId = req.apiKey.merchantId;
    }

    const result = await this.qrPaymentService.generatePaymentQRCode(dto);

    return {
      success: true,
      data: result,
    };
  }

  /**
   * 获取二维码信息
   */
  @Get(':qrId')
  async getQRCodeInfo(@Param('qrId') qrId: string) {
    const verification = await this.qrPaymentService.verifyQRCode(qrId);

    return {
      success: verification.valid,
      data: verification,
    };
  }

  /**
   * 获取二维码支付状态
   */
  @Get(':qrId/status')
  async getQRCodeStatus(@Param('qrId') qrId: string) {
    const status = await this.qrPaymentService.getQRCodeStatus(qrId);

    return {
      success: true,
      data: status,
    };
  }

  /**
   * 验证二维码
   */
  @Post(':qrId/verify')
  async verifyQRCode(@Param('qrId') qrId: string) {
    const verification = await this.qrPaymentService.verifyQRCode(qrId);

    return {
      success: verification.valid,
      data: verification,
    };
  }

  /**
   * 处理扫码支付
   * 
   * 场景 1: 商户扫描顾客付款码
   * - 商户输入金额
   * - 从顾客账户扣款
   * 
   * 场景 2: 顾客扫描商户动态码
   * - 收银员可能需要输入金额
   * - 创建 PayIntent 让顾客确认支付
   */
  @Post(':qrId/process')
  @UseGuards(JwtAuthGuard)
  async processQRPayment(
    @Param('qrId') qrId: string,
    @Body() body: { amount?: number; paymentMethod?: string },
    @Request() req: any,
  ) {
    const userId = req.user?.id;
    const merchantId = req.user?.merchantId; // 如果用户是商户

    // 先验证二维码
    const verification = await this.qrPaymentService.verifyQRCode(qrId);

    if (!verification.valid) {
      throw new BadRequestException(verification.errorMessage || '二维码无效');
    }

    const dto: ProcessPaymentFromQRDto = {
      qrId,
      amount: body.amount,
      payerId: userId,
      paymentMethod: body.paymentMethod,
    };

    let payIntent;

    // 根据二维码类型和当前用户角色决定处理方式
    if (verification.type === 'customer_payment' && merchantId) {
      // 商户扫描顾客付款码
      payIntent = await this.qrPaymentService.processMerchantScanCustomerCode(dto, merchantId);
    } else if (['merchant_dynamic', 'open_amount', 'fixed_amount'].includes(verification.type)) {
      // 顾客扫描商户码
      payIntent = await this.qrPaymentService.processCustomerScanMerchantCode(dto);
    } else {
      throw new BadRequestException('无法处理该二维码类型');
    }

    return {
      success: true,
      data: {
        payIntentId: payIntent.id,
        status: payIntent.status,
        amount: payIntent.amount,
        currency: payIntent.currency,
        redirectUrl: `/pay/intent/${payIntent.id}`,
      },
    };
  }

  /**
   * 生成商户静态收款码
   * 
   * 这是一个永久有效的收款码，顾客扫描后进入商户收款页面
   * 可以选择输入金额或使用默认金额
   */
  @Post('merchant/receive')
  @UseGuards(JwtAuthGuard)
  async generateMerchantReceiveQRCode(
    @Body() body: {
      merchantId?: string;
      defaultAmount?: number;
      currency?: string;
      description?: string;
    },
    @Request() req: any,
  ) {
    const merchantId = body.merchantId || req.user?.merchantId || req.user?.id;

    if (!merchantId) {
      throw new BadRequestException('需要提供 merchantId');
    }

    const result = await this.qrPaymentService.generateMerchantReceiveQRCode(merchantId, {
      defaultAmount: body.defaultAmount,
      currency: body.currency,
      description: body.description,
    });

    return {
      success: true,
      data: result,
    };
  }

  /**
   * 轮询二维码状态（用于收银端）
   * 
   * 商家展示二维码后，可以轮询此接口等待支付完成
   */
  @Get(':qrId/poll')
  async pollQRCodeStatus(
    @Param('qrId') qrId: string,
    @Query('timeout') timeout?: string,
  ) {
    const timeoutMs = parseInt(timeout || '0', 10);
    const startTime = Date.now();
    const maxWait = Math.min(timeoutMs, 30000); // 最多等待 30 秒

    // 简单轮询实现（生产环境应使用 WebSocket 或 Server-Sent Events）
    while (Date.now() - startTime < maxWait) {
      const status = await this.qrPaymentService.getQRCodeStatus(qrId);

      if (status.status === 'paid' || status.status === 'cancelled' || status.status === 'expired') {
        return {
          success: true,
          data: status,
        };
      }

      // 等待 1 秒后重试
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    // 超时返回当前状态
    const finalStatus = await this.qrPaymentService.getQRCodeStatus(qrId);
    return {
      success: true,
      data: finalStatus,
      timeout: true,
    };
  }
}
