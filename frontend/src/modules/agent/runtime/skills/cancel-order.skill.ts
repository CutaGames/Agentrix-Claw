import { Injectable, Inject, forwardRef } from '@nestjs/common';
import { ISkill, SkillResult, SkillContext } from '../interfaces/skill.interface';
import { OrderService } from '../../../order/order.service';

@Injectable()
export class CancelOrderSkill implements ISkill {
  id = 'cancel_order';
  name = '取消订单';
  description = '取消指定的订单';
  supportedIntents = ['cancel_order', '取消订单', '取消', '取消微支付订单', '取消订单订单ID'];

  constructor(
    @Inject(forwardRef(() => OrderService))
    private orderService: OrderService,
  ) {}

  async execute(params: Record<string, any>, context: SkillContext): Promise<SkillResult> {
    try {
      const { userId } = context;
      if (!userId) {
        return {
          success: false,
          error: '取消订单功能需要登录后才能使用。请先登录。',
        };
      }

      // 从参数中提取订单ID
      let orderId = params.orderId || params.order_id || params.id;
      
      // 如果没有直接提供订单ID，尝试从消息中提取
      if (!orderId && params.message) {
        const message = params.message as string;
        // 尝试匹配订单ID格式（UUID或短ID）
        const idMatch = message.match(/(?:订单|order)[\s:：]?([a-f0-9-]{8,}|[a-f0-9]{8})/i);
        if (idMatch) {
          orderId = idMatch[1];
        } else {
          // 尝试匹配纯ID（8位以上）
          const pureIdMatch = message.match(/([a-f0-9-]{8,})/i);
          if (pureIdMatch) {
            orderId = pureIdMatch[1];
          }
        }
      }

      if (!orderId) {
        return {
          success: false,
          error: '请提供要取消的订单ID。例如："取消订单 订单ID:xxx" 或 "取消订单 xxx"',
        };
      }

      // 取消订单
      const cancelledOrder = await this.orderService.cancelOrder(userId, orderId);

      return {
        success: true,
        message: `✅ 订单已成功取消！\n\n订单ID: ${cancelledOrder.id}\n订单金额: ${cancelledOrder.currency === 'CNY' ? '¥' : cancelledOrder.currency === 'USD' ? '$' : ''}${Number(cancelledOrder.amount).toFixed(2)} ${cancelledOrder.currency}\n订单状态: 已取消\n\n💡 提示：如果订单已支付，退款将在1-3个工作日内处理。`,
        data: {
          type: 'cancel_order',
          order: {
            id: cancelledOrder.id,
            status: cancelledOrder.status,
            amount: cancelledOrder.amount,
            currency: cancelledOrder.currency,
          },
        },
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message || '取消订单失败，请稍后重试',
      };
    }
  }
}

