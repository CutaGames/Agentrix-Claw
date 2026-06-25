import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Order, OrderStatus } from '../../entities/order.entity';
import { User } from '../../entities/user.entity';

export interface MerchantCustomer {
  id: string;
  name: string;
  email: string;
  walletAddress?: string;
  totalSpent: number;
  currency: string;
  orderCount: number;
  lastOrderDate?: string;
  tags: string[];
  firstOrderDate?: string;
}

export interface MerchantRefund {
  id: string;
  orderId: string;
  orderNumber?: string;
  amount: number;
  currency: string;
  reason: string;
  status: 'pending' | 'approved' | 'rejected' | 'completed';
  requestedAt: string;
  processedAt?: string;
  customerName?: string;
}

@Injectable()
export class MerchantCustomerService {
  private readonly logger = new Logger(MerchantCustomerService.name);

  constructor(
    @InjectRepository(Order)
    private orderRepository: Repository<Order>,
    @InjectRepository(User)
    private userRepository: Repository<User>,
  ) {}

  /**
   * 获取商户的客户列表
   * 从订单数据中聚合客户信息
   */
  async getCustomers(merchantId: string, search?: string): Promise<MerchantCustomer[]> {
    // 获取该商户的所有已完成订单
    const query = this.orderRepository
      .createQueryBuilder('order')
      .select('order.userId', 'userId')
      .addSelect('COUNT(order.id)', 'orderCount')
      .addSelect('SUM(order.amount)', 'totalSpent')
      .addSelect('MAX(order.createdAt)', 'lastOrderDate')
      .addSelect('MIN(order.createdAt)', 'firstOrderDate')
      .addSelect('order.currency', 'currency')
      .where('order.merchantId = :merchantId', { merchantId })
      .andWhere('order.status IN (:...statuses)', { 
        statuses: [OrderStatus.PAID, OrderStatus.SHIPPED, OrderStatus.DELIVERED, OrderStatus.COMPLETED, OrderStatus.SETTLED] 
      })
      .groupBy('order.userId')
      .addGroupBy('order.currency')
      .orderBy('totalSpent', 'DESC');

    const customerStats = await query.getRawMany();

    // 获取用户详细信息
    const userIds = [...new Set(customerStats.map(c => c.userId))];
    const users = userIds.length > 0 
      ? await this.userRepository.find({ where: userIds.map(id => ({ id })) })
      : [];

    const userMap = new Map(users.map(u => [u.id, u]));

    // 组装客户数据
    const customers: MerchantCustomer[] = customerStats.map(stat => {
      const user = userMap.get(stat.userId);
      const totalSpent = parseFloat(stat.totalSpent) || 0;
      const orderCount = parseInt(stat.orderCount) || 0;

      // 根据消费金额和订单数计算标签
      const tags: string[] = [];
      if (totalSpent >= 10000) tags.push('VIP');
      else if (totalSpent >= 5000) tags.push('高级');
      if (orderCount >= 10) tags.push('活跃');
      else if (orderCount >= 5) tags.push('常客');
      if (orderCount === 1) tags.push('新客');

      return {
        id: stat.userId,
        name: user?.nickname || user?.email?.split('@')[0] || `用户${stat.userId.slice(-6)}`,
        email: user?.email || '',
        walletAddress: user?.metadata?.walletAddress,
        totalSpent,
        currency: stat.currency || 'CNY',
        orderCount,
        lastOrderDate: stat.lastOrderDate,
        firstOrderDate: stat.firstOrderDate,
        tags,
      };
    });

    // 如果有搜索条件，过滤结果
    if (search) {
      const searchLower = search.toLowerCase();
      return customers.filter(c => 
        c.name.toLowerCase().includes(searchLower) ||
        c.email.toLowerCase().includes(searchLower)
      );
    }

    return customers;
  }

  /**
   * 获取商户的退款列表
   * 从订单中获取退款状态的订单
   */
  async getRefunds(merchantId: string, status?: string): Promise<MerchantRefund[]> {
    const query = this.orderRepository
      .createQueryBuilder('order')
      .leftJoin('order.user', 'user')
      .select([
        'order.id',
        'order.userId',
        'order.amount',
        'order.currency',
        'order.status',
        'order.metadata',
        'order.createdAt',
        'order.updatedAt',
        'user.nickname',
        'user.email',
      ])
      .where('order.merchantId = :merchantId', { merchantId })
      .andWhere('order.status IN (:...statuses)', { 
        statuses: [OrderStatus.REFUNDED, OrderStatus.CANCELLED, OrderStatus.DISPUTED] 
      })
      .orderBy('order.updatedAt', 'DESC');

    const orders = await query.getMany();

    return orders.map(order => {
      // 从metadata中获取退款原因和处理信息
      const refundInfo = order.metadata?.refund || {};
      
      let refundStatus: MerchantRefund['status'] = 'pending';
      if (order.status === OrderStatus.REFUNDED) {
        refundStatus = 'completed';
      } else if (order.status === OrderStatus.DISPUTED) {
        refundStatus = refundInfo.approved === true ? 'approved' : 
                       refundInfo.approved === false ? 'rejected' : 'pending';
      } else if (order.status === OrderStatus.CANCELLED) {
        refundStatus = 'completed';
      }

      return {
        id: `ref_${order.id}`,
        orderId: order.id,
        orderNumber: order.metadata?.orderNumber,
        amount: order.amount,
        currency: order.currency || 'CNY',
        reason: refundInfo.reason || '用户申请退款',
        status: refundStatus,
        requestedAt: refundInfo.requestedAt || order.updatedAt?.toISOString() || order.createdAt.toISOString(),
        processedAt: refundInfo.processedAt,
        customerName: (order as any).user?.nickname || (order as any).user?.email?.split('@')[0],
      };
    });
  }

  /**
   * 处理退款申请
   */
  async processRefund(
    merchantId: string, 
    refundId: string, 
    action: 'approve' | 'reject',
    reason?: string,
  ): Promise<MerchantRefund> {
    // refundId格式为 ref_orderId
    const orderId = refundId.replace('ref_', '');
    
    const order = await this.orderRepository.findOne({
      where: { id: orderId, merchantId },
    });

    if (!order) {
      throw new Error('退款记录不存在');
    }

    if (order.status !== OrderStatus.DISPUTED && order.status !== OrderStatus.FROZEN) {
      throw new Error('该订单不在退款申请状态');
    }

    const now = new Date().toISOString();
    const refundInfo = order.metadata?.refund || {};

    if (action === 'approve') {
      // 批准退款
      order.status = OrderStatus.REFUNDED;
      refundInfo.approved = true;
      refundInfo.processedAt = now;
      refundInfo.processedReason = reason || '商户批准退款';
    } else {
      // 拒绝退款 - 恢复到之前状态（简化处理为已支付）
      order.status = OrderStatus.PAID;
      refundInfo.approved = false;
      refundInfo.processedAt = now;
      refundInfo.rejectedReason = reason || '商户拒绝退款';
    }

    order.metadata = { ...order.metadata, refund: refundInfo };
    await this.orderRepository.save(order);

    return {
      id: refundId,
      orderId: order.id,
      amount: order.amount,
      currency: order.currency || 'CNY',
      reason: refundInfo.reason || '用户申请退款',
      status: action === 'approve' ? 'completed' : 'rejected',
      requestedAt: refundInfo.requestedAt || order.createdAt.toISOString(),
      processedAt: now,
    };
  }
}
