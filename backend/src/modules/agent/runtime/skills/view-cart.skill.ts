import { Injectable, Inject, forwardRef } from '@nestjs/common';
import { ISkill, SkillResult, SkillContext } from '../interfaces/skill.interface';
import { CartService } from '../../../cart/cart.service';

@Injectable()
export class ViewCartSkill implements ISkill {
  id = 'view_cart';
  name = '查看购物车';
  description = '查看购物车中的商品';
  supportedIntents = ['view_cart', '查看购物车', '购物车', '我的购物车'];

  constructor(
    @Inject(forwardRef(() => CartService))
    private cartService: CartService,
  ) {}

  async execute(params: Record<string, any>, context: SkillContext): Promise<SkillResult> {
    try {
      // 使用 userId 或 sessionId 作为购物车标识（支持未登录用户）
      const cartIdentifier = context.userId || context.sessionId;
      const isSessionId = !context.userId;

      console.log('🛒 ViewCartSkill 执行:', {
        userId: context.userId,
        sessionId: context.sessionId,
        cartIdentifier,
        isSessionId,
      });

      if (!cartIdentifier) {
        return {
          success: false,
          message: '无法识别用户身份，请刷新页面后重试。',
        };
      }

      // 获取购物车
      const cart = await this.cartService.getCartWithProducts(cartIdentifier, isSessionId);
      
      console.log('🛒 ViewCartSkill 获取购物车结果:', {
        cartIdentifier,
        isSessionId,
        itemCount: cart.items?.length || 0,
        items: cart.items,
      });

      if (!cart.items || cart.items.length === 0) {
        const loginHint = isSessionId ? '\n\n💡 提示：登录后购物车会永久保存。\n\n🔐 登录步骤：\n• 点击右上角用户菜单中的"登录"选项\n• 或访问：/login 进行登录\n• 如果没有账号，可以访问：/register 注册新账号' : '';
        return {
          success: true,
          message: `🛒 您的购物车是空的。${loginHint}\n\n💡 您可以：\n• 说"搜索商品"来查找商品\n• 说"第一个"、"第二个"等来添加商品到购物车`,
          data: {
            type: 'view_cart',
            cartItems: [], // 供前端SelectableCart组件使用
            items: [], // 保持向后兼容
            total: 0,
            itemCount: 0,
          },
        };
      }

      // 生成购物车列表
      const itemsList = cart.items
        .map((item, idx) => {
          const priceStr = item.product?.priceDisplay || 
            `${item.product?.currency === 'CNY' ? '¥' : item.product?.currency === 'USD' ? '$' : ''}${item.product?.price?.toFixed(2) || '0.00'} ${item.product?.currency || 'CNY'}`;
          return `${idx + 1}. ${item.product?.name || '未知商品'} - ${priceStr} x${item.quantity}`;
        })
        .join('\n');

      const totalStr = `${cart.items[0]?.product?.currency === 'CNY' ? '¥' : cart.items[0]?.product?.currency === 'USD' ? '$' : ''}${cart.total.toFixed(2)} ${cart.items[0]?.product?.currency || 'CNY'}`;
      const loginHint = isSessionId ? '\n\n⚠️ 提示：结算和支付需要登录账号。\n\n🔐 登录步骤：\n• 点击右上角用户菜单中的"登录"选项\n• 或访问：/login 进行登录\n• 如果没有账号，可以访问：/register 注册新账号' : '';

      // 格式化购物车商品数据，供前端SelectableCart组件使用
      const cartItems = cart.items.map(item => ({
        product: {
          id: item.product?.id || '',
          name: item.product?.name || '未知商品',
          description: item.product?.description || '',
          price: item.product?.price || 0,
          currency: item.product?.currency || 'CNY',
          stock: item.product?.stock || 0,
          category: item.product?.category || '',
          metadata: {
            image: item.product?.metadata?.image || item.product?.image || '',
            description: item.product?.description || '',
          },
          merchantId: item.product?.merchantId || '',
        },
        quantity: item.quantity || 1,
      }));

      return {
        success: true,
        message: `🛒 您的购物车（${cart.itemCount}件商品）：\n\n${itemsList}\n\n💰 总计：${totalStr}${loginHint}\n\n💡 下一步操作：\n• 在下方选择要购买的商品，然后点击"支付"按钮\n• 说"结算"或"下单"来创建订单并支付\n• 说"继续购物"搜索更多商品`,
        data: {
          type: 'view_cart',
          cartItems: cartItems, // 供前端SelectableCart组件使用
          items: cart.items, // 保持向后兼容
          total: cart.total,
          itemCount: cart.itemCount,
        },
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
        message: `查看购物车时出现错误：${error.message}。请稍后重试。`,
      };
    }
  }
}

