import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Order, AssetType, OrderStatus } from '../../entities/order.entity';
import { CreateOrderDto } from './dto/order.dto';

@Injectable()
export class OrderService {
  constructor(
    @InjectRepository(Order)
    private orderRepository: Repository<Order>,
  ) {}

  async createOrder(userId: string, dto: CreateOrderDto) {
    // Skill 购买时 productId 可能为空，skillId 存入 metadata
    const resolvedProductId = dto.productId || null;
    const resolvedMerchantId = dto.merchantId || userId;

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

  async getOrders(userId: string) {
    return this.orderRepository.find({
      where: { userId },
      order: { createdAt: 'DESC' },
    });
  }

  async getOrder(userId: string, id: string) {
    const order = await this.orderRepository.findOne({
      where: { id, userId },
    });

    if (!order) {
      throw new NotFoundException('订单不存在');
    }

    return order;
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

