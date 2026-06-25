import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between } from 'typeorm';
import { RiskAssessment, RiskLevel, RiskDecision } from '../../../entities/risk-assessment.entity';
import { Payment, PaymentStatus } from '../../../entities/payment.entity';
import { Order, OrderStatus } from '../../../entities/order.entity';

@Injectable()
export class RiskManagementService {
  constructor(
    @InjectRepository(RiskAssessment)
    private riskRepository: Repository<RiskAssessment>,
    @InjectRepository(Payment)
    private paymentRepository: Repository<Payment>,
    @InjectRepository(Order)
    private orderRepository: Repository<Order>,
  ) {}

  // ========== 风险监控 ==========

  async getRiskAssessments(query: any) {
    const page = parseInt(query.page || '1');
    const limit = parseInt(query.limit || '20');
    const skip = (page - 1) * limit;

    const queryBuilder = this.riskRepository
      .createQueryBuilder('risk')
      .leftJoinAndSelect('risk.payment', 'payment')
      .leftJoinAndSelect('risk.user', 'user');

    if (query.riskLevel) {
      queryBuilder.andWhere('risk.riskLevel = :riskLevel', { riskLevel: query.riskLevel });
    }

    if (query.decision) {
      queryBuilder.andWhere('risk.decision = :decision', { decision: query.decision });
    }

    if (query.userId) {
      queryBuilder.andWhere('risk.userId = :userId', { userId: query.userId });
    }

    if (query.startDate && query.endDate) {
      queryBuilder.andWhere('risk.createdAt BETWEEN :startDate AND :endDate', {
        startDate: query.startDate,
        endDate: query.endDate,
      });
    }

    queryBuilder.skip(skip).take(limit).orderBy('risk.createdAt', 'DESC');

    const [assessments, total] = await queryBuilder.getManyAndCount();

    return {
      data: assessments,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async getRiskAssessmentById(id: string) {
    const assessment = await this.riskRepository.findOne({
      where: { id },
      relations: ['payment', 'user'],
    });

    if (!assessment) {
      throw new NotFoundException('风险评估不存在');
    }

    return assessment;
  }

  async getRiskStatistics() {
    const [total, byLevel, byDecision, highRiskCount] = await Promise.all([
      this.riskRepository.count(),
      this.riskRepository
        .createQueryBuilder('risk')
        .select('risk.riskLevel', 'level')
        .addSelect('COUNT(*)', 'count')
        .groupBy('risk.riskLevel')
        .getRawMany(),
      this.riskRepository
        .createQueryBuilder('risk')
        .select('risk.decision', 'decision')
        .addSelect('COUNT(*)', 'count')
        .groupBy('risk.decision')
        .getRawMany(),
      this.riskRepository.count({ where: { riskLevel: 'high' } }),
    ]);

    return {
      total,
      highRiskCount,
      byLevel: byLevel.reduce((acc, item) => {
        acc[item.level] = parseInt(item.count);
        return acc;
      }, {} as Record<string, number>),
      byDecision: byDecision.reduce((acc, item) => {
        acc[item.decision] = parseInt(item.count);
        return acc;
      }, {} as Record<string, number>),
    };
  }

  // ========== 风险订单管理 ==========

  async getRiskOrders(query: any) {
    const page = parseInt(query.page || '1');
    const limit = parseInt(query.limit || '20');
    const skip = (page - 1) * limit;

    // 获取高风险订单
    const highRiskAssessments = await this.riskRepository.find({
      where: { riskLevel: 'high' },
      relations: ['payment', 'user'],
      order: { createdAt: 'DESC' },
      skip,
      take: limit,
    });

    const paymentIds = highRiskAssessments
      .map((a) => a.paymentId)
      .filter((id) => id !== null);

    const orders = await this.orderRepository.find({
      where: paymentIds.length > 0 ? { paymentId: paymentIds as any } : {},
      relations: ['user', 'merchant', 'product'],
    });

    return {
      data: orders,
      total: await this.riskRepository.count({ where: { riskLevel: 'high' } }),
      page,
      limit,
      totalPages: Math.ceil(
        (await this.riskRepository.count({ where: { riskLevel: 'high' } })) / limit,
      ),
    };
  }

  async blockOrder(orderId: string, reason: string) {
    const order = await this.orderRepository.findOne({ where: { id: orderId } });
    if (!order) {
      throw new NotFoundException('订单不存在');
    }

    order.status = OrderStatus.FROZEN;
    if (!order.metadata) {
      order.metadata = {};
    }
    order.metadata.blockReason = reason;
    order.metadata.blockedAt = new Date();

    await this.orderRepository.save(order);

    // 如果订单有支付，也冻结支付
    if (order.paymentId) {
      const payment = await this.paymentRepository.findOne({ where: { id: order.paymentId } });
      if (payment) {
        payment.status = PaymentStatus.CANCELLED;
        await this.paymentRepository.save(payment);
      }
    }

    return order;
  }

  async releaseOrder(orderId: string) {
    const order = await this.orderRepository.findOne({ where: { id: orderId } });
    if (!order) {
      throw new NotFoundException('订单不存在');
    }

    if (order.status === OrderStatus.FROZEN) {
      order.status = OrderStatus.PENDING;
      if (order.metadata) {
        delete order.metadata.blockReason;
        delete order.metadata.blockedAt;
      }
      await this.orderRepository.save(order);
    }

    return order;
  }

  // ========== 风险用户管理 ==========

  async getRiskUsers(query: any) {
    const page = parseInt(query.page || '1');
    const limit = parseInt(query.limit || '20');
    const skip = (page - 1) * limit;

    // 获取有高风险记录的用户
    const highRiskUsers = await this.riskRepository
      .createQueryBuilder('risk')
      .select('risk.userId', 'userId')
      .addSelect('COUNT(*)', 'riskCount')
      .addSelect('MAX(risk.riskScore)', 'maxRiskScore')
      .where('risk.riskLevel = :level', { level: 'high' })
      .groupBy('risk.userId')
      .having('COUNT(*) >= :minCount', { minCount: query.minRiskCount || 1 })
      .orderBy('COUNT(*)', 'DESC')
      .skip(skip)
      .take(limit)
      .getRawMany();

    return {
      data: highRiskUsers,
      total: highRiskUsers.length,
      page,
      limit,
      totalPages: Math.ceil(highRiskUsers.length / limit),
    };
  }
}

