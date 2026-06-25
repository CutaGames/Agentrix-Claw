/**
 * Guest Checkout Controller
 * 
 * 处理游客支付的 HTTP 端点：
 * 1. 创建 Stripe Checkout Session
 * 2. 处理支付成功回调
 * 3. 短链接重定向
 */

import { Controller, Get, Post, Query, Body, Res, Param, Logger } from '@nestjs/common';
import { Response } from 'express';
import { ConfigService } from '@nestjs/config';
import { Public } from '../auth/decorators/public.decorator';
import { GuestCheckoutService } from './guest-checkout.service';

@Controller('checkout')
@Public()
export class GuestCheckoutController {
  private readonly logger = new Logger(GuestCheckoutController.name);

  constructor(
    private readonly guestCheckoutService: GuestCheckoutService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * 游客结账页面
   * GET /api/checkout/guest?productId=xxx&quantity=1&email=xxx&guestSessionId=xxx
   */
  @Get('guest')
  async guestCheckout(
    @Query('productId') productId: string,
    @Query('quantity') quantity: string,
    @Query('email') email: string,
    @Query('guestSessionId') guestSessionId: string,
    @Query('successUrl') successUrl: string,
    @Query('cancelUrl') cancelUrl: string,
    @Res() res: Response,
  ) {
    this.logger.log(`Guest checkout: productId=${productId}, email=${email}`);

    try {
      // 验证 guest session
      const session = this.guestCheckoutService.getGuestSession(guestSessionId);
      if (!session) {
        return res.status(400).json({ error: 'Invalid or expired guest session' });
      }

      // 构建 Stripe Checkout URL（实际应调用 Stripe API）
      const stripePublishableKey = this.configService.get<string>('STRIPE_PUBLISHABLE_KEY');
      const apiBaseUrl = this.configService.get<string>('API_BASE_URL') || 'https://api.agentrix.top';

      // 重定向到 Stripe Checkout 或内部结账页面
      const frontendUrl = this.configService.get<string>('FRONTEND_URL') || 'https://agentrix.top';
      const checkoutPageUrl = `${frontendUrl}/checkout/pay?` + new URLSearchParams({
        productId,
        quantity: quantity || '1',
        email,
        guestSessionId,
        successUrl: successUrl || `${frontendUrl}/checkout/success`,
        cancelUrl: cancelUrl || `${frontendUrl}/checkout/cancel`,
      }).toString();

      return res.redirect(checkoutPageUrl);

    } catch (error: any) {
      this.logger.error(`Guest checkout failed: ${error.message}`);
      return res.status(500).json({ error: error.message });
    }
  }

  /**
   * 支付成功回调
   * GET /api/checkout/success?session=xxx
   */
  @Get('success')
  async checkoutSuccess(
    @Query('session') stripeSessionId: string,
    @Query('guestSessionId') guestSessionId: string,
    @Res() res: Response,
  ) {
    this.logger.log(`Checkout success: stripeSession=${stripeSessionId}, guestSession=${guestSessionId}`);

    try {
      // TODO: 验证 Stripe Session 状态
      // TODO: 更新订单状态
      // TODO: 发送确认邮件

      const frontendUrl = this.configService.get<string>('FRONTEND_URL') || 'https://agentrix.top';
      return res.redirect(`${frontendUrl}/checkout/complete?status=success`);

    } catch (error: any) {
      this.logger.error(`Checkout success handler failed: ${error.message}`);
      return res.redirect(`${this.configService.get('FRONTEND_URL')}/checkout/complete?status=error`);
    }
  }

  /**
   * 短链接重定向
   * GET /pay/:shortCode
   */
  @Get('/pay/:shortCode')
  async shortLinkRedirect(
    @Param('shortCode') shortCode: string,
    @Res() res: Response,
  ) {
    this.logger.log(`Short link redirect: ${shortCode}`);

    // TODO: 查询短链接对应的完整 checkout URL
    const frontendUrl = this.configService.get<string>('FRONTEND_URL') || 'https://agentrix.top';
    return res.redirect(`${frontendUrl}/checkout/pay?ref=${shortCode}`);
  }

  /**
   * Stripe Webhook 处理
   * POST /api/checkout/webhook/stripe
   */
  @Post('webhook/stripe')
  async stripeWebhook(
    @Body() payload: any,
    @Res() res: Response,
  ) {
    this.logger.log(`Stripe webhook received: ${payload.type}`);

    try {
      const event = payload;

      switch (event.type) {
        case 'checkout.session.completed':
          // 支付完成
          const session = event.data.object;
          this.logger.log(`Payment completed: ${session.id}`);
          
          // TODO: 更新订单状态
          // TODO: 发送确认邮件
          // TODO: 触发发货流程
          break;

        case 'checkout.session.expired':
          // 支付过期
          this.logger.log(`Payment expired: ${event.data.object.id}`);
          break;

        default:
          this.logger.log(`Unhandled event type: ${event.type}`);
      }

      return res.status(200).json({ received: true });

    } catch (error: any) {
      this.logger.error(`Stripe webhook failed: ${error.message}`);
      return res.status(400).json({ error: error.message });
    }
  }
}
