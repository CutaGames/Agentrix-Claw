import { Injectable, Inject, forwardRef } from '@nestjs/common';
import { ISkill, SkillResult, SkillContext } from '../interfaces/skill.interface';
import { CartService } from '../../../cart/cart.service';

@Injectable()
export class UpdateCartItemSkill implements ISkill {
  id = 'update_cart_item';
  name = '更新购物车商品数量';
  description = '更新购物车中商品的数量';
  supportedIntents = ['update_cart_item', '更新购物车', '更新数量', '修改数量', '更改数量'];

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

      // 从参数中提取商品ID和数量
      let productId = params.productId || params.product_id;
      let quantity = params.quantity;

      // 如果没有直接提供，尝试从消息中提取
      if (!productId || !quantity) {
        const message = (params.message || '').toString();
        
        // 先尝试从购物车中获取所有商品，以便通过名称查找
        const cart = await this.cartService.getCartWithProducts(cartIdentifier, isSessionId);
        
        // 尝试提取商品名称或ID
        if (!productId) {
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

        // 尝试提取数量
        if (!quantity) {
          const quantityMatch = message.match(/(?:数量|quantity|为|改为|改成|修改为|更新为)[\s:：]?(\d+)/i);
          if (quantityMatch) {
            quantity = parseInt(quantityMatch[1]);
          } else {
            // 尝试匹配"X个"、"X件"等
            const quantityMatch2 = message.match(/(\d+)[个件项]/);
            if (quantityMatch2) {
              quantity = parseInt(quantityMatch2[1]);
            }
          }
        }
      }

      if (!productId) {
        return {
          success: false,
          error: '请提供要更新的商品ID或商品名称。例如："更新购物车中"商品名"的数量为3"',
        };
      }

      if (!quantity || quantity <= 0) {
        return {
          success: false,
          error: '请提供有效的数量（大于0）。例如："更新购物车中"商品名"的数量为3"',
        };
      }

      // 更新购物车商品数量
      const cart = await this.cartService.updateCartItemQuantity(cartIdentifier, productId, quantity, isSessionId);

      return {
        success: true,
        message: `✅ 已更新购物车商品数量！\n\n💡 您可以：\n• 说"查看购物车"查看更新后的购物车`,
        data: {
          type: 'update_cart_item',
          productId,
          quantity,
          cart,
        },
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message || '更新购物车商品数量失败，请稍后重试',
      };
    }
  }
}

