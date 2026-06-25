import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between, MoreThanOrEqual } from 'typeorm';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { User } from '../../entities/user.entity';
import { Order } from '../../entities/order.entity';

@ApiTags('growth')
@Controller('analytics/growth')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class GrowthDashboardController {
  constructor(
    @InjectRepository(User) private readonly userRepo: Repository<User>,
    @InjectRepository(Order) private readonly orderRepo: Repository<Order>,
  ) {}

  @Get()
  @ApiOperation({ summary: '增长数据看板 — 注册数/DAU/Agent活跃/收入' })
  @ApiResponse({ status: 200, description: '返回增长指标' })
  async getGrowthDashboard(@Query('days') days?: string) {
    const lookbackDays = Math.min(Number(days) || 30, 90);
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterdayStart = new Date(todayStart.getTime() - 86400000);
    const weekAgo = new Date(now.getTime() - 7 * 86400000);
    const monthAgo = new Date(now.getTime() - 30 * 86400000);

    const [
      totalUsers,
      newUsersToday,
      newUsersYesterday,
      newUsersWeek,
      newUsersMonth,
      dauToday,
      dauYesterday,
      totalOrders,
      ordersToday,
    ] = await Promise.all([
      this.userRepo.count(),
      this.userRepo.count({ where: { createdAt: MoreThanOrEqual(todayStart) } }),
      this.userRepo.count({ where: { createdAt: Between(yesterdayStart, todayStart) } }),
      this.userRepo.count({ where: { createdAt: MoreThanOrEqual(weekAgo) } }),
      this.userRepo.count({ where: { createdAt: MoreThanOrEqual(monthAgo) } }),
      // DAU: users with lastActiveAt today
      this.userRepo.count({ where: { lastActiveAt: MoreThanOrEqual(todayStart) } }),
      this.userRepo.count({ where: { lastActiveAt: Between(yesterdayStart, todayStart) } }),
      this.orderRepo.count(),
      this.orderRepo.count({ where: { createdAt: MoreThanOrEqual(todayStart) } }),
    ]);

    // Daily registration trend (last N days)
    const registrationTrend = await this.userRepo
      .createQueryBuilder('u')
      .select("DATE(u.createdAt)", 'date')
      .addSelect('COUNT(*)', 'count')
      .where('u.createdAt >= :since', { since: new Date(now.getTime() - lookbackDays * 86400000) })
      .groupBy("DATE(u.createdAt)")
      .orderBy('date', 'ASC')
      .getRawMany();

    // Daily active user trend (last N days)
    const dauTrend = await this.userRepo
      .createQueryBuilder('u')
      .select("DATE(u.lastActiveAt)", 'date')
      .addSelect('COUNT(*)', 'count')
      .where('u.lastActiveAt >= :since', { since: new Date(now.getTime() - lookbackDays * 86400000) })
      .groupBy("DATE(u.lastActiveAt)")
      .orderBy('date', 'ASC')
      .getRawMany();

    return {
      snapshot: {
        totalUsers,
        newUsersToday,
        newUsersYesterday,
        newUsersWeek,
        newUsersMonth,
        dauToday,
        dauYesterday,
        dauGrowth: dauYesterday > 0 ? ((dauToday - dauYesterday) / dauYesterday * 100).toFixed(1) + '%' : 'N/A',
        registrationGrowth: newUsersYesterday > 0 ? ((newUsersToday - newUsersYesterday) / newUsersYesterday * 100).toFixed(1) + '%' : 'N/A',
        totalOrders,
        ordersToday,
      },
      trends: {
        registration: registrationTrend.map((r: any) => ({ date: r.date, count: Number(r.count) })),
        dau: dauTrend.map((r: any) => ({ date: r.date, count: Number(r.count) })),
      },
      generatedAt: now.toISOString(),
    };
  }
}
