import { Injectable, Logger } from '@nestjs/common';
import { ICapabilityExecutor } from './executor.interface';
import { ExecutionContext, ExecutionResult } from '../interfaces/capability.interface';
import { ProductService } from '../../product/product.service';
import { OrderService } from '../../order/order.service';
import { PaymentService } from '../../payment/payment.service';

@Injectable()
export class BuyItemExecutor implements ICapabilityExecutor {
  name = 'executor_purchase';
  private readonly logger = new Logger(BuyItemExecutor.name);

  constructor(
    private productService: ProductService,
    private orderService: OrderService,
    private paymentService: PaymentService,
  ) {}

  async execute(params: Record<string, any>, context: ExecutionContext): Promise<ExecutionResult> {
    try {
      const { product_id, quantity = 1, shipping_address } = params;
      const { userId } = context;

      if (!userId) {
        return {
          success: false,
          error: 'USER_NOT_AUTHENTICATED',
          message: '用户未认证，请先登录',
        };
      }

      if (!product_id) {
        return {
          success: false,
          error: 'MISSING_PRODUCT_ID',
          message: '缺少商品ID参数',
        };
      }

      // 1. 获取商品信息
      const product = await this.productService.getProduct(product_id);
      if (!product) {
        return {
          success: false,
          error: 'PRODUCT_NOT_FOUND',
          message: `商品不存在：${product_id}`,
        };
      }

      // 2. 检查库存
      if (product.stock < quantity) {
        return {
          success: false,
          error: 'INSUFFICIENT_STOCK',
          message: `库存不足，当前库存：${product.stock}`,
        };
      }

      // 3. 计算总价
      const totalAmount = Number(product.price) * quantity;
      const currency = (product.metadata as any)?.currency || 'CNY';

      // 4. 创建订单
      const order = await this.orderService.createOrder(userId, {
        merchantId: product.merchantId,
        productId: product.id,
        amount: totalAmount,
        currency,
        metadata: {
          quantity,
          shippingAddress: shipping_address,
          productSnapshot: {
            name: product.name,
            price: product.price,
            category: product.category,
          },
          source: 'ai_capability',
        },
      });

      // 5. 创建支付意图（不自动支付，让用户确认）
      // 注意：这里只创建订单，不自动支付，需要用户确认

      return {
        success: true,
        data: {
          orderId: order.id,
          productName: product.name,
          quantity,
          totalAmount,
          currency,
          status: 'order_created',
        },
        message: `订单创建成功！订单号：${order.id}，总金额：${totalAmount} ${currency}`,
        orderId: order.id,
      };
    } catch (error: any) {
      this.logger.error(`BuyItem execution failed: ${error.message}`, error.stack);
      return {
        success: false,
        error: 'EXECUTION_FAILED',
        message: `执行失败：${error.message}`,
      };
    }
  }
}


