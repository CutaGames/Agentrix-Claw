/**
 * 支付状态轮询服务
 */

import { paymentApi, PaymentInfo } from './payment.api';

export interface PaymentStatusOptions {
  paymentId: string;
  onUpdate?: (payment: PaymentInfo) => void;
  onComplete?: (payment: PaymentInfo) => void;
  onError?: (error: Error) => void;
  interval?: number; // 轮询间隔（毫秒），默认2秒
  maxAttempts?: number; // 最大轮询次数，默认30次（1分钟）
}

export class PaymentStatusPoller {
  private intervalId: NodeJS.Timeout | null = null;
  private attempts = 0;

  start(options: PaymentStatusOptions) {
    const {
      paymentId,
      onUpdate,
      onComplete,
      onError,
      interval = 2000,
      maxAttempts = 30,
    } = options;

    this.attempts = 0;

    this.intervalId = setInterval(async () => {
      try {
        this.attempts++;

        const payment = await paymentApi.getPayment(paymentId);

        if (onUpdate) {
          onUpdate(payment);
        }

        // 检查支付是否完成
        if (
          payment.status === 'completed' ||
          payment.status === 'failed' ||
          payment.status === 'cancelled'
        ) {
          this.stop();

          if (payment.status === 'completed' && onComplete) {
            onComplete(payment);
          }
        }

        // 达到最大尝试次数
        if (this.attempts >= maxAttempts) {
          this.stop();
          if (onError) {
            onError(new Error('支付状态查询超时'));
          }
        }
      } catch (error: any) {
        this.stop();
        if (onError) {
          onError(error);
        }
      }
    }, interval);
  }

  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  isPolling(): boolean {
    return this.intervalId !== null;
  }
}

// 单例实例
export const paymentStatusPoller = new PaymentStatusPoller();

