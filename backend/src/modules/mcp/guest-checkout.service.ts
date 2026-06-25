/**
 * Guest Checkout Service
 * 
 * 支持匿名用户（无 Agentrix 账户）在 Agent 对话中完成购物
 * 核心流程：Session-based Guest ID + Stripe Checkout（原生支持游客）
 */

import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { v4 as uuidv4 } from 'uuid';

export interface GuestSession {
  id: string;
  
  // 会话来源标识（ChatGPT session, Claude conversation 等）
  externalSessionId?: string;
  platform?: 'chatgpt' | 'claude' | 'gemini' | 'grok' | 'other';
  
  // 游客信息（购物时收集）
  email?: string;
  phone?: string;
  shippingAddress?: {
    name: string;
    phone: string;
    address: string;
    city: string;
    country: string;
    postalCode?: string;
  };
  
  // 待支付订单
  pendingPayment?: {
    productId: string;
    productName: string;
    quantity: number;
    amount: number;
    currency: string;
    checkoutUrl?: string;
    stripeSessionId?: string;
    expiresAt: Date;
  };
  
  // 状态
  status: 'active' | 'converted' | 'expired';
  convertedUserId?: string; // 如果游客注册了账户
  
  createdAt: Date;
  updatedAt: Date;
  expiresAt: Date;
}

export interface CreateGuestPaymentDto {
  productId: string;
  productName: string;
  quantity: number;
  amount: number;
  currency: string;
  email?: string;
  shippingAddress?: GuestSession['shippingAddress'];
}

export interface GuestPaymentResult {
  success: boolean;
  guestSessionId: string;
  
  // 支付方式
  checkoutUrl?: string;      // Stripe Checkout URL（无需注册）
  paymentLinkUrl?: string;   // 短链接
  
  // 需要补充的信息
  requiresEmail?: boolean;
  requiresShipping?: boolean;
  
  // 消息
  message: string;
  
  // 可选：注册引导
  registerUrl?: string;
  registerBenefit?: string;
}

@Injectable()
export class GuestCheckoutService {
  private readonly logger = new Logger(GuestCheckoutService.name);
  
  // 内存存储（生产环境应使用 Redis）
  private guestSessions: Map<string, GuestSession> = new Map();
  
  // 外部会话ID -> Guest Session ID 映射（用于跨对话保持状态）
  private externalSessionMapping: Map<string, string> = new Map();

  constructor(
    private readonly configService: ConfigService,
  ) {}

  /**
   * 获取或创建 Guest Session
   * 基于外部会话ID（如 ChatGPT conversation_id）保持状态
   */
  getOrCreateGuestSession(externalSessionId?: string, platform?: string): GuestSession {
    // 如果有外部会话ID，尝试复用现有 session
    if (externalSessionId) {
      const existingSessionId = this.externalSessionMapping.get(externalSessionId);
      if (existingSessionId) {
        const session = this.guestSessions.get(existingSessionId);
        if (session && session.status === 'active' && session.expiresAt > new Date()) {
          this.logger.log(`Reusing guest session: ${existingSessionId} for external: ${externalSessionId}`);
          return session;
        }
      }
    }

    // 创建新 session
    const sessionId = `guest_${uuidv4()}`;
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000); // 24小时过期

    const session: GuestSession = {
      id: sessionId,
      externalSessionId,
      platform: (platform as GuestSession['platform']) || 'other',
      status: 'active',
      createdAt: now,
      updatedAt: now,
      expiresAt,
    };

    this.guestSessions.set(sessionId, session);
    
    if (externalSessionId) {
      this.externalSessionMapping.set(externalSessionId, sessionId);
    }

    this.logger.log(`Created new guest session: ${sessionId}`);
    return session;
  }

  /**
   * 获取 Guest Session
   */
  getGuestSession(sessionId: string): GuestSession | null {
    const session = this.guestSessions.get(sessionId);
    if (!session) return null;
    
    // 检查过期
    if (session.expiresAt < new Date()) {
      session.status = 'expired';
      return null;
    }
    
    return session;
  }

  /**
   * 更新 Guest Session 信息
   */
  updateGuestSession(sessionId: string, updates: Partial<GuestSession>): GuestSession | null {
    const session = this.guestSessions.get(sessionId);
    if (!session) return null;

    Object.assign(session, updates, { updatedAt: new Date() });
    this.guestSessions.set(sessionId, session);
    
    return session;
  }

  /**
   * 为游客创建支付
   * 返回 Stripe Checkout URL，用户可直接支付（无需 Agentrix 账户）
   */
  async createGuestPayment(
    guestSessionId: string,
    dto: CreateGuestPaymentDto,
  ): Promise<GuestPaymentResult> {
    const session = this.getGuestSession(guestSessionId);
    if (!session) {
      return {
        success: false,
        guestSessionId,
        message: '会话已过期，请重新开始购物流程。',
      };
    }

    // 更新邮箱和收货地址
    if (dto.email) session.email = dto.email;
    if (dto.shippingAddress) session.shippingAddress = dto.shippingAddress;

    // 检查必要信息
    const isPhysicalProduct = dto.shippingAddress !== undefined;
    
    if (!session.email) {
      return {
        success: false,
        guestSessionId,
        requiresEmail: true,
        message: `请提供您的邮箱地址，用于接收「${dto.productName}」的订单确认和发货通知。`,
      };
    }

    // 生成 Stripe Checkout URL
    const apiBaseUrl = this.configService.get<string>('API_BASE_URL') || 'https://api.agentrix.top';
    const frontendUrl = this.configService.get<string>('FRONTEND_URL') || 'https://agentrix.top';
    
    // 构建 Stripe Checkout 参数
    const checkoutParams = new URLSearchParams({
      productId: dto.productId,
      quantity: dto.quantity.toString(),
      email: session.email,
      guestSessionId,
      successUrl: `${frontendUrl}/checkout/success?session={CHECKOUT_SESSION_ID}`,
      cancelUrl: `${frontendUrl}/checkout/cancel`,
    });

    if (session.shippingAddress) {
      checkoutParams.append('shipping', JSON.stringify(session.shippingAddress));
    }

    // Stripe Checkout URL（这里简化处理，实际应调用 Stripe API 创建 Session）
    const checkoutUrl = `${apiBaseUrl}/api/checkout/guest?${checkoutParams.toString()}`;
    
    // 生成短链接（便于在对话中展示）
    const shortCode = uuidv4().substring(0, 8);
    const paymentLinkUrl = `${frontendUrl}/pay/${shortCode}`;

    // 存储待支付信息
    session.pendingPayment = {
      productId: dto.productId,
      productName: dto.productName,
      quantity: dto.quantity,
      amount: dto.amount,
      currency: dto.currency,
      checkoutUrl,
      expiresAt: new Date(Date.now() + 30 * 60 * 1000), // 30分钟过期
    };

    this.guestSessions.set(guestSessionId, session);

    return {
      success: true,
      guestSessionId,
      checkoutUrl,
      paymentLinkUrl,
      message: `订单已创建！「${dto.productName}」x${dto.quantity}，总价 ${dto.amount} ${dto.currency}。\n\n👉 点击链接完成支付：${paymentLinkUrl}\n\n支付完成后，订单确认将发送到 ${session.email}`,
      registerUrl: `${frontendUrl}/register?ref=guest&session=${guestSessionId}`,
      registerBenefit: '注册 Agentrix 账户可获得：订单追踪、快速支付、专属优惠',
    };
  }

  /**
   * 检查游客支付状态
   */
  async checkGuestPaymentStatus(guestSessionId: string): Promise<{
    status: 'pending' | 'paid' | 'expired' | 'not_found';
    message: string;
    orderId?: string;
  }> {
    const session = this.getGuestSession(guestSessionId);
    if (!session) {
      return { status: 'not_found', message: '会话不存在或已过期' };
    }

    if (!session.pendingPayment) {
      return { status: 'not_found', message: '没有待支付的订单' };
    }

    if (session.pendingPayment.expiresAt < new Date()) {
      return { status: 'expired', message: '支付链接已过期，请重新下单' };
    }

    // TODO: 实际应查询 Stripe Session 状态
    return { status: 'pending', message: '订单待支付，请点击支付链接完成付款' };
  }

  /**
   * 游客注册转化
   * 将 Guest Session 关联到新注册的用户
   */
  async convertGuestToUser(guestSessionId: string, userId: string): Promise<boolean> {
    const session = this.guestSessions.get(guestSessionId);
    if (!session) return false;

    session.status = 'converted';
    session.convertedUserId = userId;
    session.updatedAt = new Date();

    this.guestSessions.set(guestSessionId, session);
    this.logger.log(`Guest session ${guestSessionId} converted to user ${userId}`);

    return true;
  }

  /**
   * 清理过期 sessions
   */
  cleanupExpiredSessions(): void {
    const now = new Date();
    let cleaned = 0;

    for (const [id, session] of this.guestSessions.entries()) {
      if (session.expiresAt < now) {
        this.guestSessions.delete(id);
        if (session.externalSessionId) {
          this.externalSessionMapping.delete(session.externalSessionId);
        }
        cleaned++;
      }
    }

    if (cleaned > 0) {
      this.logger.log(`Cleaned up ${cleaned} expired guest sessions`);
    }
  }
}
