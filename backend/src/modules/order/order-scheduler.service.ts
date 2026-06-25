import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan } from 'typeorm';
import { Order, OrderStatus } from '../../entities/order.entity';

@Injectable()
export class OrderSchedulerService {
  private readonly logger = new Logger(OrderSchedulerService.name);

  constructor(
    @InjectRepository(Order)
    private orderRepository: Repository<Order>,
  ) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async cancelUnpaidOrders() {
    const timeout = new Date(Date.now() - 30 * 60 * 1000); // 30 minutes ago

    const orders = await this.orderRepository.find({
      where: {
        status: OrderStatus.PENDING,
        createdAt: LessThan(timeout),
      },
    });

    if (orders.length > 0) {
      this.logger.log(`Found ${orders.length} expired orders. Cancelling...`);
      
      for (const order of orders) {
        order.status = OrderStatus.CANCELLED;
        order.metadata = {
            ...order.metadata,
            cancelReason: 'Payment timeout (30 mins)',
            cancelledAt: new Date().toISOString()
        };
        await this.orderRepository.save(order);
      }
      
      this.logger.log(`Cancelled ${orders.length} orders.`);
    }
  }
}
