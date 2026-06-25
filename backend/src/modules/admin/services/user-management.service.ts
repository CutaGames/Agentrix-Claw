import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Like, Between } from 'typeorm';
import { User, KYCLevel, UserRole } from '../../../entities/user.entity';
import { Order } from '../../../entities/order.entity';
import { Payment } from '../../../entities/payment.entity';
import { WalletConnection } from '../../../entities/wallet-connection.entity';
import { QueryUsersDto, QueryTransactionsDto } from '../dto/user-management.dto';

/**
 * 将 roles 字段统一转换为数组
 * 兼容处理数据库中存储为字符串格式的历史数据
 */
function ensureRolesArray(roles: any): UserRole[] {
  if (typeof roles === 'string') {
    return roles
      .replace(/[{}]/g, '')
      .split(',')
      .map((r: string) => r.trim())
      .filter((r: string) => r) as UserRole[];
  }
  if (Array.isArray(roles)) {
    return roles;
  }
  return [UserRole.USER];
}

@Injectable()
export class UserManagementService {
  constructor(
    @InjectRepository(User)
    private userRepository: Repository<User>,
    @InjectRepository(Order)
    private orderRepository: Repository<Order>,
    @InjectRepository(Payment)
    private paymentRepository: Repository<Payment>,
    @InjectRepository(WalletConnection)
    private walletRepository: Repository<WalletConnection>,
  ) {}

  async getUsers(query: QueryUsersDto) {
    const page = parseInt(query.page || '1');
    const limit = parseInt(query.limit || '20');
    const skip = (page - 1) * limit;

    const where: any = {};

    const queryBuilder = this.userRepository.createQueryBuilder('user');

    if (query.search) {
      queryBuilder.where(
        '(user.email LIKE :search OR user.agentrixId LIKE :search OR user.nickname LIKE :search)',
        { search: `%${query.search}%` },
      );
    } else {
      queryBuilder.where('1=1');
    }

    if (query.kycLevel) {
      queryBuilder.andWhere('user.kyc_level = :kycLevel', { kycLevel: query.kycLevel });
    }

    if (query.kycStatus) {
      queryBuilder.andWhere('user.kyc_status = :kycStatus', { kycStatus: query.kycStatus });
    }

    if (query.startDate && query.endDate) {
      queryBuilder.andWhere('user.created_at BETWEEN :startDate AND :endDate', {
        startDate: query.startDate,
        endDate: query.endDate,
      });
    }

    queryBuilder.skip(skip).take(limit).orderBy('user.created_at', 'DESC');

    const [users, total] = await queryBuilder.getManyAndCount();

    return {
      data: users,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async getUserById(id: string) {
    const user = await this.userRepository.findOne({
      where: { id },
      relations: ['socialAccounts'],
    });

    if (!user) {
      throw new NotFoundException('用户不存在');
    }

    // 获取用户统计
    const [orderCount, totalSpent] = await Promise.all([
      this.orderRepository.count({ where: { userId: id } }),
      this.orderRepository
        .createQueryBuilder('order')
        .select('SUM(order.amount)', 'total')
        .where('order.userId = :userId', { userId: id })
        .andWhere('order.status IN (:...statuses)', {
          statuses: ['paid', 'delivered', 'settled'],
        })
        .getRawOne(),
    ]);

    // 获取钱包连接
    const wallets = await this.walletRepository.find({
      where: { userId: id },
    });

    // 获取最近30天交易趋势
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const recentOrders = await this.orderRepository.find({
      where: {
        userId: id,
        createdAt: Between(thirtyDaysAgo, new Date()),
      },
      order: { createdAt: 'DESC' },
      take: 30,
    });

    return {
      ...user,
      stats: {
        orderCount,
        totalSpent: totalSpent?.total || 0,
        walletCount: wallets.length,
      },
      wallets,
      recentOrders,
    };
  }

  async updateUserStatus(id: string, status: 'active' | 'frozen', reason?: string) {
    const user = await this.userRepository.findOne({ where: { id } });
    if (!user) {
      throw new NotFoundException('用户不存在');
    }

    // 这里可以添加状态字段，暂时使用metadata存储
    if (!user.metadata) {
      user.metadata = {};
    }
    user.metadata.status = status;
    if (reason) {
      user.metadata.statusReason = reason;
      user.metadata.statusUpdatedAt = new Date();
    }

    await this.userRepository.save(user);
    return user;
  }

  async approveKYC(id: string) {
    const user = await this.userRepository.findOne({ where: { id } });
    if (!user) {
      throw new NotFoundException('用户不存在');
    }

    user.kycLevel = KYCLevel.VERIFIED;
    user.kycStatus = 'approved';
    await this.userRepository.save(user);

    return user;
  }

  async rejectKYC(id: string, reason: string) {
    const user = await this.userRepository.findOne({ where: { id } });
    if (!user) {
      throw new NotFoundException('用户不存在');
    }

    user.kycStatus = 'rejected';
    if (!user.metadata) {
      user.metadata = {};
    }
    user.metadata.kycRejectReason = reason;
    await this.userRepository.save(user);

    return user;
  }

  async getTransactions(query: QueryTransactionsDto) {
    const page = parseInt(query.page || '1');
    const limit = parseInt(query.limit || '20');
    const skip = (page - 1) * limit;

    const where: any = {};

    if (query.userId) {
      where.userId = query.userId;
    }

    if (query.merchantId) {
      where.merchantId = query.merchantId;
    }

    if (query.status) {
      where.status = query.status;
    }

    if (query.startDate && query.endDate) {
      where.createdAt = Between(new Date(query.startDate), new Date(query.endDate));
    }

    const [payments, total] = await this.paymentRepository.findAndCount({
      where,
      skip,
      take: limit,
      order: { createdAt: 'DESC' },
      relations: ['user', 'merchant'],
    });

    return {
      data: payments,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async getUserStatistics() {
    const [
      totalUsers,
      activeUsers,
      verifiedUsers,
      newUsersToday,
      newUsersThisWeek,
      newUsersThisMonth,
    ] = await Promise.all([
      this.userRepository.count(),
      this.userRepository.count({ where: { kycStatus: 'approved' } }),
      this.userRepository.count({ where: { kycLevel: KYCLevel.VERIFIED } }),
      this.userRepository.count({
        where: {
          createdAt: Between(
            new Date(new Date().setHours(0, 0, 0, 0)),
            new Date(),
          ),
        },
      }),
      this.userRepository.count({
        where: {
          createdAt: Between(
            new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
            new Date(),
          ),
        },
      }),
      this.userRepository.count({
        where: {
          createdAt: Between(
            new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
            new Date(),
          ),
        },
      }),
    ]);

    return {
      totalUsers,
      activeUsers,
      verifiedUsers,
      newUsersToday,
      newUsersThisWeek,
      newUsersThisMonth,
    };
  }

  /**
   * 为用户添加角色
   */
  async addUserRole(userId: string, role: 'merchant' | 'agent') {
    const user = await this.userRepository.findOne({ where: { id: userId } });

    if (!user) {
      throw new NotFoundException('用户不存在');
    }

    // 使用辅助函数确保 roles 是数组
    const rolesArray = ensureRolesArray(user.roles);
    
    // 检查角色是否已存在
    if (rolesArray.includes(role as UserRole)) {
      return {
        success: true,
        message: '用户已拥有该角色',
        user,
      };
    }

    // 添加新角色
    rolesArray.push(role as UserRole);
    user.roles = rolesArray;

    await this.userRepository.save(user);

    return {
      success: true,
      message: `已为用户添加${role === 'merchant' ? '商户' : 'Agent'}角色`,
      user,
    };
  }

  /**
   * 移除用户角色
   */
  async removeUserRole(userId: string, role: 'merchant' | 'agent') {
    const user = await this.userRepository.findOne({ where: { id: userId } });

    if (!user) {
      throw new NotFoundException('用户不存在');
    }

    // 使用辅助函数确保 roles 是数组
    const rolesArray = ensureRolesArray(user.roles);
    
    // 检查角色是否存在
    if (!rolesArray.includes(role as UserRole)) {
      return {
        success: true,
        message: '用户没有该角色',
        user,
      };
    }

    // 移除角色（保留user角色）
    const updatedRoles = rolesArray.filter((r: UserRole) => r !== role);
    // 确保至少保留user角色
    if (updatedRoles.length === 0) {
      updatedRoles.push(UserRole.USER);
    }
    user.roles = updatedRoles;

    await this.userRepository.save(user);

    return {
      success: true,
      message: `已移除用户的${role === 'merchant' ? '商户' : 'Agent'}角色`,
      user,
    };
  }
}

