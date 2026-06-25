import { Injectable, Inject, forwardRef } from '@nestjs/common';
import { ISkill, SkillResult, SkillContext } from '../interfaces/skill.interface';
import { CartService } from '../../../cart/cart.service';

@Injectable()
export class RemoveFromCartSkill implements ISkill {
  id = 'remove_from_cart';
  name = '从购物车移除商品';
  description = '从购物车中移除指定商品';
  supportedIntents = ['remove_from_cart', '移除商品', '删除商品', '从购物车移除', '从购物车删除'];

  constructor(
    @Inject(forwardRef(() => CartService))
    private cartService: CartService,
  ) {}

  async execute(params: Record<string, any>, context: SkillContext): Promise<SkillResult> {
    try {
      // 使用 userId 或 sessionId 作为购物车标识（支持未登录用户）
      const cartIdentifier = context.userId || context.sessionId;
      const isSessionId = !context.userId;

      if (!cartIdentifier) {
        return {
          success: false,
          error: '无法识别用户身份，请刷新页面后重试。',
        };
      }

      // 从参数中提取商品ID
      let productId = params.productId || params.product_id;

      // 如果没有直接提供，尝试从消息中提取
      if (!productId) {
        const message = (params.message || '').toString();
        
        // 先获取购物车，以便通过名称或ID查找
        const cart = await this.cartService.getCartWithProducts(cartIdentifier, isSessionId);
        
        // 尝试匹配商品名称（在引号中）
        const nameMatch = message.match(/[""]([^""]+)[""]/);
        if (nameMatch) {
          // 通过商品名称查找商品ID（从购物车中查找）
          const item = cart.items.find(i => i.product?.name?.includes(nameMatch[1]));
          if (item) {
            productId = item.productId;
          }
        }
        
        // 如果还是没找到，尝试匹配商品ID格式（UUID或短ID）
        if (!productId) {
          const idMatch = message.match(/([a-f0-9-]{8,})/i);
          if (idMatch) {
            // 检查这个ID是否在购物车中
            const item = cart.items.find(i => i.productId === idMatch[1] || i.productId.includes(idMatch[1]));
            if (item) {
              productId = item.productId;
            }
          }
        }
      }

      if (!productId) {
        return {
          success: false,
          error: '请提供要移除的商品ID或商品名称。例如："从购物车中移除"商品名""',
        };
      }

      // 从购物车移除商品
      const cart = await this.cartService.removeFromCart(cartIdentifier, productId, isSessionId);

      return {
        success: true,
        message: `✅ 已从购物车移除商品！\n\n💡 您可以：\n• 说"查看购物车"查看剩余商品`,
        data: {
          type: 'remove_from_cart',
          productId,
          cart,
        },
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message || '从购物车移除商品失败，请稍后重试',
      };
    }
  }
}

