/**
 * Guest Payment Controller
 * 
 * 处理游客支付的后端 API 端点
 */

import { Controller, Post, Body, Logger } from '@nestjs/common';
import { Public } from '../auth/decorators/public.decorator';
import { StripeService } from './stripe.service';
import { ProductService } from '../product/product.service';

interface CreateGuestIntentDto {
  productId: string;
  quantity: number;
  email: string;
  guestSessionId?: string;
  source?: string;
}

@Controller('payment')
export class GuestPaymentController {
  private readonly logger = new Logger(GuestPaymentController.name);

  constructor(
    private readonly stripeService: StripeService,
    private readonly productService: ProductService,
  ) {}

  /**
   * 创建游客支付意图
   * POST /api/payment/guest-intent
   */
  @Post('guest-intent')
  @Public()
  async createGuestIntent(@Body() dto: CreateGuestIntentDto) {
    this.logger.log(`Creating guest intent: productId=${dto.productId}, email=${dto.email}`);

    try {
      // 获取商品信息
      const product = await this.productService.getProduct(dto.productId);
      if (!product) {
        return { success: false, message: '商品不存在' };
      }

      const quantity = dto.quantity || 1;
      const totalAmount = Number(product.price) * quantity;
      const currency = product.metadata?.currency || 'CNY';

      // 创建 Stripe PaymentIntent
      const paymentIntent = await this.stripeService.createPaymentIntent({
        amount: totalAmount,
        currency: currency.toLowerCase(),
        paymentMethod: 'stripe', // 默认使用 Stripe
        description: `Guest purchase: ${product.name} x${quantity}`,
      } as any);

      this.logger.log(`Guest intent created: ${paymentIntent.paymentIntentId}`);

      return {
        success: true,
        clientSecret: paymentIntent.clientSecret,
        paymentIntentId: paymentIntent.paymentIntentId,
        amount: totalAmount,
        currency,
      };
    } catch (error: any) {
      this.logger.error(`Failed to create guest intent: ${error.message}`);
      return {
        success: false,
        message: error.message || '创建支付失败',
      };
    }
  }
}
