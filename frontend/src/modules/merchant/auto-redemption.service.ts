import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Payment, PaymentStatus } from '../../entities/payment.entity';
import { Order } from '../../entities/order.entity';

export interface RedemptionRecord {
  id: string;
  paymentId: string;
  orderId: string;
  merchantId: string;
  type: 'membership' | 'recharge' | 'service';
  status: 'pending' | 'redeemed' | 'failed';
  redeemedAt?: Date;
  metadata?: any;
}

@Injectable()
export class AutoRedemptionService {
  private readonly logger = new Logger(AutoRedemptionService.name);

  constructor(
    @InjectRepository(Payment)
    private paymentRepository: Repository<Payment>,
    @InjectRepository(Order)
    private orderRepository: Repository<Order>,
  ) {}

  /**
   * 自动核销（支付成功后触发）
   */
  async autoRedeem(paymentId: string): Promise<RedemptionRecord | null> {
    const payment = await this.paymentRepository.findOne({
      where: { id: paymentId },
    });

    if (!payment || payment.status !== PaymentStatus.COMPLETED) {
      return null;
    }

    const order = await this.orderRepository.findOne({
      where: { id: payment.metadata?.orderId },
    });

    if (!order) {
      return null;
    }

    // 判断核销类型
    const orderType = order.metadata?.orderType || order.metadata?.type;
    const productType = order.metadata?.productType;

    // 会员卡自动开通
    if (productType === 'membership' || orderType === 'membership') {
      return await this.redeemMembership(order, payment);
    }

    // 充值自动到账
    if (productType === 'recharge' || orderType === 'recharge') {
      return await this.redeemRecharge(order, payment);
    }

    // 服务自动激活
    if (orderType === 'service') {
      return await this.redeemService(order, payment);
    }

    return null;
  }

  /**
   * 会员卡自动开通
   */
  private async redeemMembership(
    order: Order,
    payment: Payment,
  ): Promise<RedemptionRecord> {
    const redemption: RedemptionRecord = {
      id: `redeem_${order.id}`,
      paymentId: payment.id,
      orderId: order.id,
      merchantId: order.merchantId,
      type: 'membership',
      status: 'redeemed',
      redeemedAt: new Date(),
      metadata: {
        membershipType: order.metadata?.membershipType,
        duration: order.metadata?.duration,
        activatedAt: new Date(),
      },
    };

    this.logger.log(`会员卡自动开通: orderId=${order.id}, paymentId=${payment.id}`);
    return redemption;
  }

  /**
   * 充值自动到账
   */
  private async redeemRecharge(
    order: Order,
    payment: Payment,
  ): Promise<RedemptionRecord> {
    const redemption: RedemptionRecord = {
      id: `redeem_${order.id}`,
      paymentId: payment.id,
      orderId: order.id,
      merchantId: order.merchantId,
      type: 'recharge',
      status: 'redeemed',
      redeemedAt: new Date(),
      metadata: {
        amount: payment.amount,
        currency: payment.currency,
        creditedAt: new Date(),
      },
    };

    this.logger.log(`充值自动到账: orderId=${order.id}, paymentId=${payment.id}, amount=${payment.amount}`);
    return redemption;
  }

  /**
   * 服务自动激活
   */
  private async redeemService(
    order: Order,
    payment: Payment,
  ): Promise<RedemptionRecord> {
    const redemption: RedemptionRecord = {
      id: `redeem_${order.id}`,
      paymentId: payment.id,
      orderId: order.id,
      merchantId: order.merchantId,
      type: 'service',
      status: 'redeemed',
      redeemedAt: new Date(),
      metadata: {
        serviceType: order.metadata?.serviceType,
        activatedAt: new Date(),
      },
    };

    this.logger.log(`服务自动激活: orderId=${order.id}, paymentId=${payment.id}`);
    return redemption;
  }
}

