import { Injectable, Inject, forwardRef } from '@nestjs/common';
import { ISkill, SkillResult, SkillContext } from '../interfaces/skill.interface';
import { CartService } from '../../../cart/cart.service';
import { ProductService } from '../../../product/product.service';
import { MemoryType } from '../../../../entities/agent-memory.entity';

@Injectable()
export class AddToCartSkill implements ISkill {
  id = 'add_to_cart';
  name = '加入购物车';
  description = '将商品添加到购物车';
  supportedIntents = ['add_to_cart', 'add_cart', '加入购物车', '加购'];

  constructor(
    @Inject(forwardRef(() => CartService))
    private cartService: CartService,
    @Inject(forwardRef(() => ProductService))
    private productService: ProductService,
  ) {}

  async execute(params: Record<string, any>, context: SkillContext): Promise<SkillResult> {
    try {
      const { productId, productIndex, quantity = 1 } = params;

      // 使用 userId 或 sessionId 作为购物车标识（支持未登录用户）
      const cartIdentifier = context.userId || context.sessionId;
      const isSessionId = !context.userId;

      if (!cartIdentifier) {
        return {
          success: false,
          message: '无法识别用户身份，请刷新页面后重试。',
        };
      }

      let finalProductId = productId;

      // 如果没有提供 productId，尝试从 Memory 中获取（支持"第一个"、"第二个"等引用）
      if (!finalProductId && productIndex !== undefined) {
        const lastSearch = await context.memory?.getMemory(
          context.sessionId,
          'last_search_products',
        );

        if (lastSearch && lastSearch.value?.products) {
          const products = lastSearch.value.products;
          const index = productIndex - 1; // 转换为 0-based 索引
          if (index >= 0 && index < products.length) {
            finalProductId = products[index].id;
          } else {
            return {
              success: false,
              message: `抱歉，找不到第 ${productIndex} 个商品。请先搜索商品。`,
            };
          }
        } else {
          return {
            success: false,
            message: '请先搜索商品，然后告诉我要加入购物车的商品编号。',
          };
        }
      }

      if (!finalProductId) {
        return {
          success: false,
          message: '请告诉我要加入购物车的商品ID或商品编号。',
        };
      }

      // 获取商品信息
      const product = await this.productService.getProduct(finalProductId);
      if (!product) {
        return {
          success: false,
          message: `抱歉，找不到商品（ID: ${finalProductId}）。`,
        };
      }

      // 检查库存
      if (product.stock < quantity) {
        return {
          success: false,
          message: `抱歉，商品"${product.name}"库存不足。当前库存：${product.stock}。`,
        };
      }

      // 确保价格是数字类型
      const productPrice = typeof product.price === 'number' 
        ? product.price 
        : typeof product.price === 'string' 
          ? parseFloat(product.price) 
          : 0;
      
      const currency = (product.metadata as any)?.currency || 'CNY';
      const priceDisplay = currency === 'CNY' ? `¥${productPrice.toFixed(2)}` : 
                          currency === 'USD' ? `$${productPrice.toFixed(2)}` : 
                          `${productPrice.toFixed(2)} ${currency}`;

      // 添加到购物车（支持未登录用户使用 sessionId）
      const cart = await this.cartService.addToCart(cartIdentifier, finalProductId, quantity, isSessionId);

      // 保存到 Memory
      if (context.memory) {
        await context.memory.saveMemory(
          context.sessionId,
          MemoryType.ENTITY,
          'current_cart',
          {
            items: cart.items,
            updatedAt: cart.updatedAt,
          },
          {
            importance: 0.8,
            tags: ['cart', 'shopping'],
          },
        );
      }

      const loginHint = isSessionId ? '\n\n⚠️ 提示：结算和支付需要登录账号。\n\n🔐 请先登录：\n• 点击右上角用户菜单中的"登录"选项\n• 或访问：/login 进行登录\n• 登录后您的购物车会自动保存' : '';
      
      return {
        success: true,
        message: `✅ 已加入购物车！\n\n📦 商品信息：\n• 商品：${product.name}\n• 数量：${quantity}\n• 单价：${priceDisplay}${loginHint}\n\n💡 下一步操作：\n• 说"查看购物车"查看所有商品\n• 说"继续购物"搜索更多商品\n• 说"结算"或"下单"来创建订单`,
        data: {
          product: {
            id: product.id,
            name: product.name,
            price: productPrice,
            currency,
            quantity,
          },
          cart,
        },
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
        message: `加入购物车时出现错误：${error.message}。请稍后重试。`,
      };
    }
  }
}

