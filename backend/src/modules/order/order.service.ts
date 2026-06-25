import { Injectable, NotFoundException, ForbiddenException, BadRequestException, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between } from 'typeorm';
import { Order, AssetType, OrderStatus } from '../../entities/order.entity';
import { CreateOrderDto } from './dto/order.dto';
import { UserRole } from '../../entities/user.entity';

@Injectable()
export class OrderService {
  constructor(
    @InjectRepository(Order)
    private orderRepository: Repository<Order>,
  ) {}

  async createOrder(userId: string | undefined, dto: CreateOrderDto) {
    // 如果未提供 userId，抛出未授权错误，提示用户登录
    if (!userId) {
      throw new UnauthorizedException('请先登录后再创建订单 / Please login before creating an order');
    }

    // Skill 购买时 productId 可能为空，skillId 存入 metadata
    const resolvedProductId = dto.productId || null;
    const resolvedMerchantId = dto.merchantId || userId; // fallback to buyer as merchant
    
    const order = this.orderRepository.create({
      userId,
      productId: resolvedProductId,
      merchantId: resolvedMerchantId,
      amount: dto.amount,
      currency: dto.currency,
      assetType:
        dto.assetType ||
        (dto.metadata?.assetType as AssetType) ||
        AssetType.PHYSICAL,
      execAgentId: dto.execAgentId || dto.agentId,
      refAgentId: dto.refAgentId || dto.metadata?.refAgentId,
      promoterId: dto.promoterId || dto.metadata?.promoterId,
      platformTaxRate: dto.platformTaxRate,
      executorHasWallet:
        dto.executorHasWallet ?? dto.metadata?.executorHasWallet ?? true,
      metadata: {
        ...dto.metadata,
        skillId: dto.skillId || dto.metadata?.skillId,
        assetType:
          dto.assetType ||
          dto.metadata?.assetType ||
          AssetType.PHYSICAL,
      },
    });
    return this.orderRepository.save(order);
  }

  async getOrders(
    userId?: string, 
    merchantId?: string,
    status?: OrderStatus,
    startDate?: Date,
    endDate?: Date,
  ) {
    const where: any = {};
    
    // 支持按userId查询（买家视角）
    if (userId) {
      where.userId = userId;
    }
    
    // 支持按merchantId查询（商户视角）
    if (merchantId) {
      where.merchantId = merchantId;
    }
    
    // 状态过滤
    if (status) {
      where.status = status;
    }
    
    // 日期范围过滤
    if (startDate && endDate) {
      where.createdAt = Between(startDate, endDate);
    }
    
    return this.orderRepository.find({
      where,
      relations: ['user', 'product'],
      order: { createdAt: 'DESC' },
    });
  }

  /**
   * Backwards-compatible API used by other modules.
   * Buyer/user-scoped order lookup.
   */
  async getOrder(userId: string, id: string) {
    if (!userId) {
      throw new BadRequestException('缺少用户信息');
    }

    const order = await this.orderRepository.findOne({
      where: { id, userId },
      relations: ['user', 'product'],
    });

    if (!order) {
      throw new NotFoundException('订单不存在');
    }

    return order;
  }

  async getOrderForRequester(requester: any, id: string) {
    const isMerchant = requester?.roles?.includes(UserRole.MERCHANT);
    const where = isMerchant
      ? { id, merchantId: requester.id }
      : { id, userId: requester.id };

    const order = await this.orderRepository.findOne({
      where,
      relations: ['user', 'product'],
    });

    if (!order) {
      throw new NotFoundException('订单不存在');
    }

    return order;
  }

  async updateOrderStatus(requester: any, id: string, status: OrderStatus) {
    const isMerchant = requester?.roles?.includes(UserRole.MERCHANT);
    if (!isMerchant) {
      throw new ForbiddenException('只有商户可以更新订单状态');
    }

    const order = await this.orderRepository.findOne({ where: { id, merchantId: requester.id } });
    if (!order) {
      throw new NotFoundException('订单不存在');
    }

    const allowedStatuses: OrderStatus[] = [OrderStatus.SHIPPED, OrderStatus.DELIVERED, OrderStatus.COMPLETED];
    if (!allowedStatuses.includes(status)) {
      throw new BadRequestException(`不支持更新为状态: ${status}`);
    }

    order.status = status;
    return this.orderRepository.save(order);
  }

  /**
   * Create a refund request by moving order into DISPUTED and writing metadata.refund.
   * This feeds the merchant-side refunds workflow under /merchant/refunds.
   */
  async requestRefund(requester: any, id: string, reason?: string) {
    const isMerchant = requester?.roles?.includes(UserRole.MERCHANT);

    const where = isMerchant
      ? { id, merchantId: requester.id }
      : { id, userId: requester.id };

    const order = await this.orderRepository.findOne({ where });
    if (!order) {
      throw new NotFoundException('订单不存在');
    }

    // Only paid/shipped/delivered/completed/settled orders can enter refund flow.
    const refundable: OrderStatus[] = [
      OrderStatus.PAID,
      OrderStatus.SHIPPED,
      OrderStatus.DELIVERED,
      OrderStatus.COMPLETED,
      OrderStatus.SETTLED,
    ];
    if (!refundable.includes(order.status)) {
      throw new BadRequestException(`订单状态为"${order.status}"，无法发起退款`);
    }

    const now = new Date().toISOString();
    const previousStatus = order.status;
    const refundInfo = order.metadata?.refund || {};

    order.status = OrderStatus.DISPUTED;
    order.metadata = {
      ...order.metadata,
      refund: {
        ...refundInfo,
        reason: reason || refundInfo.reason || '退款申请',
        requestedAt: refundInfo.requestedAt || now,
        requestedBy: requester?.id,
        requestedByRole: isMerchant ? 'merchant' : 'user',
        previousStatus: refundInfo.previousStatus || previousStatus,
      },
    };

    return this.orderRepository.save(order);
  }

  async cancelOrder(userId: string, id: string): Promise<Order> {
    const order = await this.orderRepository.findOne({
      where: { id, userId },
    });

    if (!order) {
      throw new NotFoundException('订单不存在');
    }

    // 只有待支付或已支付的订单可以取消
    if (order.status !== OrderStatus.PENDING && order.status !== OrderStatus.PAID) {
      throw new Error(`订单状态为"${order.status}"，无法取消。只有待支付或已支付的订单可以取消。`);
    }

    order.status = OrderStatus.CANCELLED;
    return this.orderRepository.save(order);
  }
}

