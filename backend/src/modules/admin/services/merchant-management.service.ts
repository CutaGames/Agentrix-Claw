import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Like, Between } from 'typeorm';
import { User, UserRole } from '../../../entities/user.entity';
import { Product } from '../../../entities/product.entity';
import { Order } from '../../../entities/order.entity';
import { CommissionSettlement } from '../../../entities/commission-settlement.entity';
import { MPCWallet } from '../../../entities/mpc-wallet.entity';

@Injectable()
export class MerchantManagementService {
  constructor(
    @InjectRepository(User)
    private userRepository: Repository<User>,
    @InjectRepository(Product)
    private productRepository: Repository<Product>,
    @InjectRepository(Order)
    private orderRepository: Repository<Order>,
    @InjectRepository(CommissionSettlement)
    private settlementRepository: Repository<CommissionSettlement>,
    @InjectRepository(MPCWallet)
    private mpcWalletRepository: Repository<MPCWallet>,
  ) {}

  async getMerchants(query: any) {
    const page = parseInt(query.page || '1');
    const limit = parseInt(query.limit || '20');
    const skip = (page - 1) * limit;

    const where: any = {};

    if (query.search) {
      where.$or = [
        { email: Like(`%${query.search}%`) },
        { agentrixId: Like(`%${query.search}%`) },
        { nickname: Like(`%${query.search}%`) },
      ];
    }

    if (query.kycStatus) {
      where.kycStatus = query.kycStatus;
    }

    const queryBuilder = this.userRepository
      .createQueryBuilder('user')
      .leftJoinAndSelect('user.merchantProfile', 'profile')
      .where("user.roles @> '\"merchant\"'::jsonb");

    if (query.search) {
      queryBuilder.andWhere(
        '(user.email LIKE :search OR user.agentrixId LIKE :search OR user.nickname LIKE :search)',
        { search: `%${query.search}%` },
      );
    }

    if (query.kycStatus) {
      queryBuilder.andWhere('user.kycStatus = :kycStatus', { kycStatus: query.kycStatus });
    }

    queryBuilder.skip(skip).take(limit).orderBy('user.createdAt', 'DESC');

    const [merchants, total] = await queryBuilder.getManyAndCount();

    // 获取每个商户的统计信息和MPC钱包
    const merchantsWithStats = await Promise.all(
      merchants.map(async (merchant) => {
        const [productCount, orderCount, totalGMV, mpcWallets] = await Promise.all([
          this.productRepository.count({ where: { merchantId: merchant.id } }),
          this.orderRepository.count({ where: { merchantId: merchant.id } }),
          this.orderRepository
            .createQueryBuilder('order')
            .select('SUM(order.amount)', 'total')
            .where('order.merchantId = :merchantId', { merchantId: merchant.id })
            .andWhere('order.status IN (:...statuses)', {
              statuses: ['paid', 'delivered', 'settled'],
            })
            .getRawOne(),
          this.mpcWalletRepository.find({
            where: { merchantId: merchant.id },
            select: ['walletAddress', 'chain', 'currency', 'isActive'],
          }),
        ]);

        return {
          ...merchant,
          stats: {
            productCount,
            orderCount,
            totalGMV: totalGMV?.total || 0,
          },
          mpcWallets: mpcWallets.map(wallet => ({
            walletAddress: wallet.walletAddress,
            chain: wallet.chain,
            currency: wallet.currency,
            isActive: wallet.isActive,
          })),
        };
      }),
    );

    return {
      data: merchantsWithStats,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async getMerchantById(id: string) {
    const merchant = await this.userRepository
      .createQueryBuilder('user')
      .where('user.id = :id', { id })
      .andWhere("user.roles @> '[\"merchant\"]'::jsonb")
      .getOne();

    if (!merchant) {
      throw new NotFoundException('商户不存在');
    }

    // 获取商户统计
    const [productCount, orderCount, totalGMV, pendingSettlement, completedSettlement] =
      await Promise.all([
        this.productRepository.count({ where: { merchantId: id } }),
        this.orderRepository.count({ where: { merchantId: id } }),
        this.orderRepository
          .createQueryBuilder('order')
          .select('SUM(order.amount)', 'total')
          .where('order.merchantId = :merchantId', { merchantId: id })
          .andWhere('order.status IN (:...statuses)', {
            statuses: ['paid', 'delivered', 'settled'],
          })
          .getRawOne(),
        this.settlementRepository
          .createQueryBuilder('settlement')
          .select('SUM(settlement.amount)', 'total')
          .where('settlement.payeeId = :merchantId', { merchantId: id })
          .andWhere('settlement.status = :status', { status: 'pending' })
          .getRawOne(),
        this.settlementRepository
          .createQueryBuilder('settlement')
          .select('SUM(settlement.amount)', 'total')
          .where('settlement.payeeId = :merchantId', { merchantId: id })
          .andWhere('settlement.status = :status', { status: 'completed' })
          .getRawOne(),
      ]);

    // 获取MPC钱包
    const mpcWallet = await this.mpcWalletRepository.findOne({
      where: { merchantId: id },
    });

    // 获取最近30天订单
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const recentOrders = await this.orderRepository.find({
      where: {
        merchantId: id,
        createdAt: Between(thirtyDaysAgo, new Date()),
      },
      order: { createdAt: 'DESC' },
      take: 30,
    });

    return {
      ...merchant,
      stats: {
        productCount,
        orderCount,
        totalGMV: totalGMV?.total || 0,
        pendingSettlement: pendingSettlement?.total || 0,
        completedSettlement: completedSettlement?.total || 0,
      },
      mpcWallet,
      recentOrders,
    };
  }

  async getMerchantProducts(merchantId: string, query: any) {
    const page = parseInt(query.page || '1');
    const limit = parseInt(query.limit || '20');
    const skip = (page - 1) * limit;

    const where: any = { merchantId };

    if (query.search) {
      where.name = Like(`%${query.search}%`);
    }

    if (query.status) {
      where.status = query.status;
    }

    const [products, total] = await this.productRepository.findAndCount({
      where,
      skip,
      take: limit,
      order: { createdAt: 'DESC' },
    });

    return {
      data: products,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async getMerchantOrders(merchantId: string, query: any) {
    const page = parseInt(query.page || '1');
    const limit = parseInt(query.limit || '20');
    const skip = (page - 1) * limit;

    const where: any = { merchantId };

    if (query.status) {
      where.status = query.status;
    }

    if (query.startDate && query.endDate) {
      where.createdAt = Between(new Date(query.startDate), new Date(query.endDate));
    }

    const [orders, total] = await this.orderRepository.findAndCount({
      where,
      skip,
      take: limit,
      order: { createdAt: 'DESC' },
      relations: ['user', 'product'],
    });

    return {
      data: orders,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async getMerchantSettlements(merchantId: string, query: any) {
    const page = parseInt(query.page || '1');
    const limit = parseInt(query.limit || '20');
    const skip = (page - 1) * limit;

    const where: any = {
      payeeId: merchantId,
      payeeType: 'merchant',
    };

    if (query.status) {
      where.status = query.status;
    }

    const [settlements, total] = await this.settlementRepository.findAndCount({
      where,
      skip,
      take: limit,
      order: { createdAt: 'DESC' },
    });

    return {
      data: settlements,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async getMerchantStatistics() {
    const [totalMerchants, activeMerchants, verifiedMerchants] = await Promise.all([
      this.userRepository
        .createQueryBuilder('user')
        .where("user.roles @> '[\"merchant\"]'::jsonb")
        .getCount(),
      this.userRepository
        .createQueryBuilder('user')
        .where("user.roles @> '[\"merchant\"]'::jsonb")
        .andWhere('user.kycStatus = :status', { status: 'approved' })
        .getCount(),
      this.userRepository
        .createQueryBuilder('user')
        .where("user.roles @> '[\"merchant\"]'::jsonb")
        .andWhere('user.kycLevel = :level', { level: 'verified' })
        .getCount(),
    ]);

    return {
      totalMerchants,
      activeMerchants,
      verifiedMerchants,
    };
  }
}

