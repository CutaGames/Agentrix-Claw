import { Injectable, Inject, forwardRef } from '@nestjs/common';
import { ISkill, SkillResult, SkillContext } from '../interfaces/skill.interface';
import { CartService } from '../../../cart/cart.service';
import { OrderService } from '../../../order/order.service';
import { MemoryType } from '../../../../entities/agent-memory.entity';

@Injectable()
export class CheckoutSkill implements ISkill {
  id = 'checkout';
  name = '结算';
  description = '创建订单并结算购物车';
  supportedIntents = ['checkout', '结算', '下单', 'create_order', 'place_order'];

  constructor(
    @Inject(forwardRef(() => CartService))
    private cartService: CartService,
    @Inject(forwardRef(() => OrderService))
    private orderService: OrderService,
  ) {}

  async execute(params: Record<string, any>, context: SkillContext): Promise<SkillResult> {
    try {
      if (!context.userId) {
        return {
          success: false,
          message: '创建订单需要登录账号。请先登录后再进行结算。\n\n🔐 登录步骤：\n• 点击右上角用户菜单中的"登录"选项\n• 或访问：/login 进行登录\n• 如果没有账号，可以访问：/register 注册新账号\n\n💡 提示：您可以将商品加入购物车，登录后再结算。购物车中的商品会自动保存。',
        };
      }

      // 尝试从 sessionId 购物车迁移到 userId 购物车（如果存在）
      if (context.sessionId) {
        try {
          const sessionCart = await this.cartService.getCartWithProducts(context.sessionId, true);
          if (sessionCart.items && sessionCart.items.length > 0) {
            // 迁移商品到用户购物车
            for (const item of sessionCart.items) {
              await this.cartService.addToCart(context.userId, item.productId, item.quantity, false);
            }
            // 清空 session 购物车
            await this.cartService.clearCart(context.sessionId, true);
          }
        } catch (error) {
          // 迁移失败不影响继续执行
          console.warn('迁移 session 购物车失败:', error);
        }
      }

      // 获取购物车
      const cart = await this.cartService.getCartWithProducts(context.userId);

      if (!cart.items || cart.items.length === 0) {
        return {
          success: false,
          message: '购物车是空的，请先添加商品。',
        };
      }

      // 检查库存
      const outOfStockItems: any[] = [];
      for (const item of cart.items) {
        if (item.product && item.product.stock < item.quantity) {
          outOfStockItems.push({
            product: item.product.name,
            stock: item.product.stock,
            requested: item.quantity,
          });
        }
      }

      if (outOfStockItems.length > 0) {
        const message = outOfStockItems
          .map(
            (item) =>
              `• ${item.product}：库存 ${item.stock}，需要 ${item.requested}`,
          )
          .join('\n');
        return {
          success: false,
          message: `以下商品库存不足：\n${message}\n\n请调整数量后重试。`,
        };
      }

      // 获取第一个商品的商户ID和货币（假设所有商品来自同一商户）
      const firstItem = cart.items[0];
      if (!firstItem.product) {
        return {
          success: false,
          message: '购物车中的商品信息不完整，无法结算。请重新添加商品。',
        };
      }

      const merchantId = firstItem.product.merchantId || 'default';
      const currency = firstItem.product.currency || 'CNY';
      const firstProductId = firstItem.productId;

      // 创建订单（包含多个商品）
      // 注意：CreateOrderDto 需要 productId，我们使用第一个商品的 ID
      // 其他商品信息存储在 metadata 中
      const order = await this.orderService.createOrder(context.userId, {
        merchantId,
        productId: firstProductId,
        amount: cart.total,
        currency,
        metadata: {
          items: cart.items.map((item) => ({
            productId: item.productId,
            productName: item.product?.name,
            quantity: item.quantity,
            price: item.product?.price,
          })),
          orderType: 'cart_checkout',
        },
      });

      // 清空购物车
      await this.cartService.clearCart(context.userId);

      // 保存订单到 Memory
      if (context.memory) {
        await context.memory.saveMemory(
          context.sessionId,
          MemoryType.ENTITY,
          'current_order',
          {
            orderId: order.id,
            status: order.status,
            total: order.amount,
            createdAt: order.createdAt,
          },
          {
            importance: 0.9,
            tags: ['order', 'checkout'],
          },
        );
      }

      // 确保金额是数字类型（TypeORM 的 decimal 可能返回字符串）
      const orderAmount = typeof order.amount === 'number' 
        ? order.amount 
        : typeof order.amount === 'string' 
          ? parseFloat(order.amount) 
          : 0;
      
      // 使用订单的货币，如果没有则使用之前获取的 currency
      const orderCurrency = order.currency || currency;
      const amountDisplay = orderCurrency === 'CNY' ? `¥${orderAmount.toFixed(2)}` : 
                           orderCurrency === 'USD' ? `$${orderAmount.toFixed(2)}` : 
                           `${orderAmount.toFixed(2)} ${orderCurrency}`;

      return {
        success: true,
        message: `✅ 订单创建成功！\n\n📦 订单信息：\n• 订单号：${order.id}\n• 商品数量：${cart.items.length}\n• 订单总额：${amountDisplay}\n• 订单状态：${order.status}\n\n💡 下一步操作：\n• 说"支付"或"付款"来完成支付\n• 说"查看订单"查看订单详情`,
        data: {
          order: {
            ...order,
            amount: orderAmount, // 确保返回数字类型
          },
          items: cart.items,
        },
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
        message: `创建订单时出现错误：${error.message}。请稍后重试。`,
      };
    }
  }
}

