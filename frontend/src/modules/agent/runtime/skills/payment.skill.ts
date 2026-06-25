import { Injectable, Inject, forwardRef } from '@nestjs/common';
import { ISkill, SkillResult, SkillContext } from '../interfaces/skill.interface';
import { PaymentService } from '../../../payment/payment.service';
import { OrderService } from '../../../order/order.service';
import { MemoryType } from '../../../../entities/agent-memory.entity';

@Injectable()
export class PaymentSkill implements ISkill {
  id = 'payment';
  name = '支付';
  description = '处理订单支付';
  supportedIntents = ['payment', '支付', '付款', 'pay', 'pay_order'];

  constructor(
    @Inject(forwardRef(() => PaymentService))
    private paymentService: PaymentService,
    @Inject(forwardRef(() => OrderService))
    private orderService: OrderService,
  ) {}

  async execute(params: Record<string, any>, context: SkillContext): Promise<SkillResult> {
    try {
      if (!context.userId) {
        return {
          success: false,
          message: '请先登录后再进行支付。\n\n🔐 登录步骤：\n• 点击右上角用户菜单中的"登录"选项\n• 或访问：/login 进行登录\n• 如果没有账号，可以访问：/register 注册新账号',
        };
      }

      let orderId = params.orderId;

      // 如果没有提供 orderId，尝试从 Memory 中获取
      if (!orderId) {
        const currentOrder = await context.memory?.getMemory(
          context.sessionId,
          'current_order',
        );
        if (currentOrder && currentOrder.value?.orderId) {
          orderId = currentOrder.value.orderId;
        } else {
          return {
            success: false,
            message: '请告诉我要支付的订单号，或先创建订单。',
          };
        }
      }

      // 获取订单
      const order = await this.orderService.getOrder(context.userId, orderId);
      if (!order) {
        return {
          success: false,
          message: `抱歉，找不到订单（ID: ${orderId}）。`,
        };
      }

      if (order.status !== 'pending') {
        return {
          success: false,
          message: `订单状态为 ${order.status}，无法支付。`,
        };
      }

      // 创建支付
      // 默认使用钱包支付，如果用户指定了其他方式，可以从 params.method 获取
      const paymentMethod = params.method || 'wallet'; // wallet, stripe, passkey, x402, multisig, epay
      
      const payment = await this.paymentService.processPayment(context.userId, {
        amount: order.amount,
        currency: order.currency || 'CNY',
        paymentMethod: paymentMethod as any, // PaymentMethod 枚举值
        description: `订单支付: ${order.id}`,
        merchantId: order.merchantId,
        metadata: {
          orderId: order.id,
          productId: order.productId,
          orderType: order.metadata?.orderType || 'product',
        },
      });

      // 确保金额是数字类型（TypeORM 的 decimal 可能返回字符串）
      const paymentAmount = typeof payment.amount === 'number' 
        ? payment.amount 
        : typeof payment.amount === 'string' 
          ? parseFloat(payment.amount) 
          : 0;
      
      const currency = payment.currency || order.currency || 'CNY';
      const amountDisplay = currency === 'CNY' ? `¥${paymentAmount.toFixed(2)}` : 
                           currency === 'USD' ? `$${paymentAmount.toFixed(2)}` : 
                           `${paymentAmount.toFixed(2)} ${currency}`;

      // 更新 Memory
      if (context.memory) {
        await context.memory.saveMemory(
          context.sessionId,
          MemoryType.ENTITY,
          'current_payment',
          {
            paymentId: payment.id,
            orderId: order.id,
            amount: paymentAmount,
            status: payment.status,
            createdAt: payment.createdAt,
          },
          {
            importance: 0.9,
            tags: ['payment', 'order'],
          },
        );
      }

      return {
        success: true,
        message: `✅ 支付创建成功！\n\n💳 支付信息：\n• 支付号：${payment.id}\n• 订单号：${order.id}\n• 支付金额：${amountDisplay}\n• 支付方式：${payment.paymentMethod}\n• 支付状态：${payment.status}\n\n💡 请完成支付以完成订单。`,
        data: {
          payment: {
            ...payment,
            amount: paymentAmount, // 确保返回数字类型
          },
          order,
        },
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
        message: `创建支付时出现错误：${error.message}。请稍后重试。`,
      };
    }
  }
}

