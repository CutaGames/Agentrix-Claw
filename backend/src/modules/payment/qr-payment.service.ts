import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as QRCode from 'qrcode';
import * as crypto from 'crypto';
import { PayIntent, PayIntentStatus, PayIntentType } from '../../entities/pay-intent.entity';
import { PayIntentService } from './pay-intent.service';

/**
 * P1: 线下 QR 支付服务
 * 
 * 支持场景：
 * 1. 商户动态二维码 - 商户展示，顾客扫码支付
 * 2. 顾客付款码 - 顾客展示，商户扫码收款
 * 3. 固定金额二维码 - 预设金额的快捷支付
 * 4. 开放金额二维码 - 商户/收银员输入金额
 */

export interface GenerateQRCodeOptions {
  /** 二维码类型 */
  type: 'merchant_dynamic' | 'customer_payment' | 'fixed_amount' | 'open_amount';
  /** 商户 ID（商户动态码和固定金额码需要） */
  merchantId?: string;
  /** 用户 ID（顾客付款码需要） */
  userId?: string;
  /** 固定金额（可选） */
  amount?: number;
  /** 货币 */
  currency?: string;
  /** 描述 */
  description?: string;
  /** 订单号 */
  orderId?: string;
  /** Agent ID（归因追踪） */
  agentId?: string;
  /** 二维码有效期（秒），默认 5 分钟 */
  expiresIn?: number;
  /** 二维码尺寸 */
  size?: 'small' | 'medium' | 'large';
  /** 是否包含 Logo */
  includeLogo?: boolean;
}

export interface QRCodeResult {
  /** 二维码数据（Base64 Data URL） */
  qrCodeDataUrl: string;
  /** 支付链接 */
  paymentUrl: string;
  /** 二维码内容（原始文本） */
  qrContent: string;
  /** 二维码 ID（用于查询状态） */
  qrId: string;
  /** 过期时间 */
  expiresAt: Date;
  /** PayIntent ID（如果创建了） */
  payIntentId?: string;
}

export interface VerifyQRCodeResult {
  valid: boolean;
  type: string;
  merchantId?: string;
  userId?: string;
  amount?: number;
  currency?: string;
  description?: string;
  payIntentId?: string;
  expired?: boolean;
  errorMessage?: string;
}

export interface ProcessPaymentFromQRDto {
  qrId: string;
  /** 收银员/商户输入的金额（开放金额二维码时） */
  amount?: number;
  /** 付款方用户 ID */
  payerId: string;
  /** 付款方式 */
  paymentMethod?: string;
}

@Injectable()
export class QrPaymentService {
  private readonly logger = new Logger(QrPaymentService.name);
  
  // QR Code 缓存（生产环境应使用 Redis）
  private qrCodeCache: Map<string, {
    type: string;
    merchantId?: string;
    userId?: string;
    amount?: number;
    currency?: string;
    description?: string;
    orderId?: string;
    agentId?: string;
    payIntentId?: string;
    expiresAt: Date;
    used: boolean;
  }> = new Map();

  constructor(
    private readonly configService: ConfigService,
    @InjectRepository(PayIntent)
    private readonly payIntentRepository: Repository<PayIntent>,
    private readonly payIntentService: PayIntentService,
  ) {}

  /**
   * 生成支付二维码
   */
  async generatePaymentQRCode(options: GenerateQRCodeOptions): Promise<QRCodeResult> {
    this.logger.log(`生成支付二维码: type=${options.type}, merchantId=${options.merchantId}`);

    // 生成唯一 QR ID
    const qrId = this.generateQRId();
    
    // 计算过期时间
    const expiresIn = options.expiresIn || 300; // 默认 5 分钟
    const expiresAt = new Date(Date.now() + expiresIn * 1000);

    // 根据类型处理
    let payIntentId: string | undefined;
    let paymentUrl: string;

    const frontendUrl = this.configService.get<string>('FRONTEND_URL') || 'http://localhost:3000';

    switch (options.type) {
      case 'fixed_amount':
        // 固定金额：立即创建 PayIntent
        if (!options.merchantId || !options.amount) {
          throw new BadRequestException('固定金额二维码需要 merchantId 和 amount');
        }
        const fixedIntent = await this.payIntentService.createPayIntent(options.merchantId, {
          type: PayIntentType.ORDER_PAYMENT,
          amount: options.amount,
          currency: options.currency || 'USD',
          description: options.description,
          orderId: options.orderId,
          merchantId: options.merchantId,
          agentId: options.agentId,
          expiresIn,
        });
        payIntentId = fixedIntent.id;
        paymentUrl = `${frontendUrl}/pay/intent/${payIntentId}?source=qr`;
        break;

      case 'merchant_dynamic':
        // 商户动态码：延迟创建 PayIntent，等待收银员输入金额
        if (!options.merchantId) {
          throw new BadRequestException('商户动态二维码需要 merchantId');
        }
        paymentUrl = `${frontendUrl}/pay/qr/${qrId}?type=merchant`;
        break;

      case 'customer_payment':
        // 顾客付款码：用户展示，商户扫码
        if (!options.userId) {
          throw new BadRequestException('顾客付款码需要 userId');
        }
        paymentUrl = `${frontendUrl}/pay/qr/${qrId}?type=customer`;
        break;

      case 'open_amount':
        // 开放金额码：类似商户动态码
        if (!options.merchantId) {
          throw new BadRequestException('开放金额二维码需要 merchantId');
        }
        paymentUrl = `${frontendUrl}/pay/qr/${qrId}?type=open`;
        break;

      default:
        throw new BadRequestException(`不支持的二维码类型: ${options.type}`);
    }

    // 缓存 QR 信息
    this.qrCodeCache.set(qrId, {
      type: options.type,
      merchantId: options.merchantId,
      userId: options.userId,
      amount: options.amount,
      currency: options.currency || 'USD',
      description: options.description,
      orderId: options.orderId,
      agentId: options.agentId,
      payIntentId,
      expiresAt,
      used: false,
    });

    // 生成 QR 内容
    const qrContent = this.buildQRContent(qrId, options.type, paymentUrl);

    // 生成 QR 图片
    const qrCodeDataUrl = await this.generateQRImage(qrContent, options.size, options.includeLogo);

    return {
      qrCodeDataUrl,
      paymentUrl,
      qrContent,
      qrId,
      expiresAt,
      payIntentId,
    };
  }

  /**
   * 验证二维码
   */
  async verifyQRCode(qrId: string): Promise<VerifyQRCodeResult> {
    const qrInfo = this.qrCodeCache.get(qrId);

    if (!qrInfo) {
      return {
        valid: false,
        type: 'unknown',
        errorMessage: '二维码不存在或已过期',
      };
    }

    if (qrInfo.expiresAt < new Date()) {
      return {
        valid: false,
        type: qrInfo.type,
        expired: true,
        errorMessage: '二维码已过期',
      };
    }

    if (qrInfo.used) {
      return {
        valid: false,
        type: qrInfo.type,
        errorMessage: '二维码已使用',
      };
    }

    return {
      valid: true,
      type: qrInfo.type,
      merchantId: qrInfo.merchantId,
      userId: qrInfo.userId,
      amount: qrInfo.amount,
      currency: qrInfo.currency,
      description: qrInfo.description,
      payIntentId: qrInfo.payIntentId,
    };
  }

  /**
   * 商户扫描顾客付款码后处理支付
   * 
   * 流程：
   * 1. 商户输入金额
   * 2. 验证顾客付款码
   * 3. 创建 PayIntent 并自动从顾客账户扣款
   */
  async processMerchantScanCustomerCode(dto: ProcessPaymentFromQRDto, merchantId: string): Promise<PayIntent> {
    this.logger.log(`商户扫码处理: qrId=${dto.qrId}, merchantId=${merchantId}`);

    const verification = await this.verifyQRCode(dto.qrId);

    if (!verification.valid) {
      throw new BadRequestException(verification.errorMessage || '二维码无效');
    }

    if (verification.type !== 'customer_payment') {
      throw new BadRequestException('该二维码不是顾客付款码');
    }

    if (!dto.amount || dto.amount <= 0) {
      throw new BadRequestException('请输入有效金额');
    }

    // 创建 PayIntent
    const payIntent = await this.payIntentService.createPayIntent(merchantId, {
      type: PayIntentType.ORDER_PAYMENT,
      amount: dto.amount,
      currency: verification.currency || 'USD',
      description: verification.description,
      merchantId,
      agentId: this.qrCodeCache.get(dto.qrId)?.agentId,
      metadata: {
        qrId: dto.qrId,
        paymentSource: 'qr_scan',
        scanType: 'merchant_scan_customer',
      },
    });

    // 自动授权和执行支付（如果用户已授权快捷支付）
    // 这里简化处理，实际需要检查用户的 QuickPayGrant
    try {
      await this.payIntentService.authorizePayIntent(
        payIntent.id,
        verification.userId,
        'quickpay',
      );
    } catch (error) {
      this.logger.warn(`自动授权失败，需要用户确认: ${error.message}`);
      // 不抛出错误，让用户手动确认
    }

    // 标记二维码已使用
    const qrInfo = this.qrCodeCache.get(dto.qrId);
    if (qrInfo) {
      qrInfo.used = true;
      qrInfo.payIntentId = payIntent.id;
    }

    return payIntent;
  }

  /**
   * 顾客扫描商户动态码后处理支付
   * 
   * 流程：
   * 1. 顾客扫描商户二维码
   * 2. 如果是开放金额，收银员输入金额
   * 3. 创建 PayIntent 并显示支付页面
   */
  async processCustomerScanMerchantCode(dto: ProcessPaymentFromQRDto): Promise<PayIntent> {
    this.logger.log(`顾客扫码处理: qrId=${dto.qrId}, payerId=${dto.payerId}`);

    const verification = await this.verifyQRCode(dto.qrId);

    if (!verification.valid) {
      throw new BadRequestException(verification.errorMessage || '二维码无效');
    }

    if (!['merchant_dynamic', 'open_amount'].includes(verification.type)) {
      throw new BadRequestException('该二维码类型不支持顾客扫码');
    }

    // 如果已有 PayIntent，直接返回
    if (verification.payIntentId) {
      const existingIntent = await this.payIntentRepository.findOne({
        where: { id: verification.payIntentId },
      });
      if (existingIntent) {
        return existingIntent;
      }
    }

    // 开放金额需要输入金额
    if (verification.type === 'open_amount' && !dto.amount) {
      throw new BadRequestException('请输入支付金额');
    }

    const amount = dto.amount || verification.amount;
    if (!amount || amount <= 0) {
      throw new BadRequestException('请输入有效金额');
    }

    // 创建 PayIntent
    const qrInfo = this.qrCodeCache.get(dto.qrId);
    const payIntent = await this.payIntentService.createPayIntent(verification.merchantId!, {
      type: PayIntentType.ORDER_PAYMENT,
      amount,
      currency: verification.currency || 'USD',
      description: verification.description,
      orderId: qrInfo?.orderId,
      merchantId: verification.merchantId,
      agentId: qrInfo?.agentId,
      metadata: {
        qrId: dto.qrId,
        paymentSource: 'qr_scan',
        scanType: 'customer_scan_merchant',
      },
    });

    // 更新缓存
    if (qrInfo) {
      qrInfo.payIntentId = payIntent.id;
    }

    return payIntent;
  }

  /**
   * 获取二维码状态
   */
  async getQRCodeStatus(qrId: string): Promise<{
    status: 'pending' | 'paid' | 'expired' | 'cancelled' | 'unknown';
    payIntent?: PayIntent;
  }> {
    const qrInfo = this.qrCodeCache.get(qrId);

    if (!qrInfo) {
      return { status: 'unknown' };
    }

    if (qrInfo.expiresAt < new Date()) {
      return { status: 'expired' };
    }

    if (qrInfo.payIntentId) {
      const payIntent = await this.payIntentRepository.findOne({
        where: { id: qrInfo.payIntentId },
      });

      if (payIntent) {
        switch (payIntent.status) {
          case PayIntentStatus.SUCCEEDED:
            return { status: 'paid', payIntent };
          case PayIntentStatus.CANCELLED:
          case PayIntentStatus.FAILED:
            return { status: 'cancelled', payIntent };
          default:
            return { status: 'pending', payIntent };
        }
      }
    }

    return { status: 'pending' };
  }

  /**
   * 生成商户收款页面二维码
   * 用于商户线下展示的静态收款码
   */
  async generateMerchantReceiveQRCode(
    merchantId: string,
    options?: {
      defaultAmount?: number;
      currency?: string;
      description?: string;
    },
  ): Promise<QRCodeResult> {
    const frontendUrl = this.configService.get<string>('FRONTEND_URL') || 'http://localhost:3000';
    
    // 商户收款页面 URL
    const params = new URLSearchParams();
    params.set('merchant', merchantId);
    if (options?.defaultAmount) {
      params.set('amount', options.defaultAmount.toString());
    }
    if (options?.currency) {
      params.set('currency', options.currency);
    }
    if (options?.description) {
      params.set('desc', options.description);
    }

    const paymentUrl = `${frontendUrl}/pay/merchant?${params.toString()}`;
    const qrId = this.generateQRId();

    const qrCodeDataUrl = await this.generateQRImage(paymentUrl, 'large', true);

    // 静态码不过期，但设置一个较长的时间用于统计
    const expiresAt = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000); // 1年

    return {
      qrCodeDataUrl,
      paymentUrl,
      qrContent: paymentUrl,
      qrId,
      expiresAt,
    };
  }

  /**
   * 清理过期的二维码缓存
   */
  cleanupExpiredQRCodes(): number {
    const now = new Date();
    let cleanedCount = 0;

    for (const [qrId, qrInfo] of this.qrCodeCache.entries()) {
      // 保留已使用的二维码记录 24 小时用于审计
      const retentionTime = qrInfo.used 
        ? new Date(qrInfo.expiresAt.getTime() + 24 * 60 * 60 * 1000)
        : qrInfo.expiresAt;

      if (retentionTime < now) {
        this.qrCodeCache.delete(qrId);
        cleanedCount++;
      }
    }

    if (cleanedCount > 0) {
      this.logger.log(`清理了 ${cleanedCount} 个过期的二维码`);
    }

    return cleanedCount;
  }

  // ========== 私有方法 ==========

  private generateQRId(): string {
    // 格式: QR-{时间戳}-{随机字符}
    const timestamp = Date.now().toString(36);
    const random = crypto.randomBytes(6).toString('hex');
    return `QR-${timestamp}-${random}`;
  }

  private buildQRContent(qrId: string, type: string, paymentUrl: string): string {
    // 可以选择直接使用 URL，或者使用自定义协议
    // 这里使用 URL，方便浏览器直接打开
    return paymentUrl;
  }

  private async generateQRImage(
    content: string,
    size: 'small' | 'medium' | 'large' = 'medium',
    includeLogo: boolean = false,
  ): Promise<string> {
    const sizeMap = {
      small: 200,
      medium: 300,
      large: 400,
    };

    const options: QRCode.QRCodeToDataURLOptions = {
      width: sizeMap[size],
      margin: 2,
      color: {
        dark: '#000000',
        light: '#FFFFFF',
      },
      errorCorrectionLevel: includeLogo ? 'H' : 'M', // 如果有 Logo，需要更高纠错级别
    };

    try {
      const qrDataUrl = await QRCode.toDataURL(content, options);
      
      // TODO: 如果需要添加 Logo，可以在这里处理
      // 需要使用 canvas 或 sharp 库合成图片
      
      return qrDataUrl;
    } catch (error) {
      this.logger.error(`生成二维码图片失败: ${error.message}`);
      throw new BadRequestException('生成二维码失败');
    }
  }
}
