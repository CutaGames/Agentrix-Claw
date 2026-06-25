/**
 * Developer Revenue Service
 * 
 * 开发者收益管理
 * 追踪Skill调用收益、支持提现和收益报表
 */

import { Injectable, Logger, Inject, forwardRef } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { Skill, SkillStatus } from '../../entities/skill.entity';
import { SkillAnalytics, CallerType, CallPlatform } from '../../entities/skill-analytics.entity';
import { DeveloperAccountService } from '../developer-account/developer-account.service';

export interface RevenueRecord {
  id: string;
  skillId: string;
  skillName: string;
  amount: number;
  currency: string;
  callerId?: string;
  callerType: CallerType;
  platform: CallPlatform;
  timestamp: Date;
  settled: boolean;
}

export interface RevenueSummary {
  totalEarnings: number;
  pendingSettlement: number;
  settledAmount: number;
  currency: string;
  period: {
    start: Date;
    end: Date;
  };
  breakdown: {
    bySkill: Array<{
      skillId: string;
      skillName: string;
      earnings: number;
      calls: number;
    }>;
    byPlatform: Array<{
      platform: CallPlatform;
      earnings: number;
      calls: number;
    }>;
    byDay: Array<{
      date: string;
      earnings: number;
      calls: number;
    }>;
  };
}

export interface DeveloperDashboard {
  overview: {
    totalSkills: number;
    publishedSkills: number;
    totalCalls: number;
    totalEarnings: number;
    pendingSettlement: number;
  };
  recentActivity: RevenueRecord[];
  topSkills: Array<{
    skillId: string;
    skillName: string;
    calls: number;
    earnings: number;
    rating: number;
  }>;
  earningsChart: Array<{
    date: string;
    earnings: number;
  }>;
}

@Injectable()
export class DeveloperRevenueService {
  private readonly logger = new Logger(DeveloperRevenueService.name);
  private readonly PLATFORM_FEE_RATE = 0.15; // 15% 平台分成

  constructor(
    private configService: ConfigService,
    @InjectRepository(Skill)
    private skillRepository: Repository<Skill>,
    @InjectRepository(SkillAnalytics)
    private analyticsRepository: Repository<SkillAnalytics>,
    @Inject(forwardRef(() => DeveloperAccountService))
    private developerAccountService: DeveloperAccountService,
  ) {}

  /**
   * 获取开发者收益概览
   */
  async getDeveloperDashboard(developerId: string): Promise<DeveloperDashboard> {
    // 获取开发者的所有Skill
    const skills = await this.skillRepository.find({
      where: { authorId: developerId },
    });

    const skillIds = skills.map(s => s.id);
    const publishedSkills = skills.filter(s => s.status === SkillStatus.PUBLISHED);

    // 获取分析数据
    let analytics: SkillAnalytics[] = [];
    if (skillIds.length > 0) {
      analytics = await this.analyticsRepository
        .createQueryBuilder('analytics')
        .where('analytics.skillId IN (:...skillIds)', { skillIds })
        .orderBy('analytics.createdAt', 'DESC')
        .take(1000)
        .getMany();
    }

    // 计算总收益
    let totalEarnings = 0;
    let totalCalls = analytics.length;
    const skillEarnings = new Map<string, { calls: number; earnings: number }>();

    for (const record of analytics) {
      const earning = Number(record.revenueGenerated) || 0;
      const developerShare = earning * (1 - this.PLATFORM_FEE_RATE);
      totalEarnings += developerShare;

      const current = skillEarnings.get(record.skillId) || { calls: 0, earnings: 0 };
      current.calls++;
      current.earnings += developerShare;
      skillEarnings.set(record.skillId, current);
    }

    // 最近活动
    const recentActivity: RevenueRecord[] = analytics.slice(0, 10).map(a => ({
      id: a.id,
      skillId: a.skillId,
      skillName: skills.find(s => s.id === a.skillId)?.name || 'Unknown',
      amount: (Number(a.revenueGenerated) || 0) * (1 - this.PLATFORM_FEE_RATE),
      currency: 'USD',
      callerId: a.callerId,
      callerType: a.callerType,
      platform: a.platform,
      timestamp: a.createdAt,
      settled: false,
    }));

    // Top Skills
    const topSkills = skills
      .map(skill => {
        const data = skillEarnings.get(skill.id) || { calls: 0, earnings: 0 };
        return {
          skillId: skill.id,
          skillName: skill.displayName || skill.name,
          calls: data.calls,
          earnings: data.earnings,
          rating: skill.rating || 0,
        };
      })
      .sort((a, b) => b.earnings - a.earnings)
      .slice(0, 5);

    // 收益图表 (最近30天)
    const earningsChart = this.buildEarningsChart(analytics, 30);

    return {
      overview: {
        totalSkills: skills.length,
        publishedSkills: publishedSkills.length,
        totalCalls,
        totalEarnings: Math.round(totalEarnings * 100) / 100,
        pendingSettlement: Math.round(totalEarnings * 100) / 100, // TODO: 实现结算逻辑
      },
      recentActivity,
      topSkills,
      earningsChart,
    };
  }

  /**
   * 获取收益汇总
   */
  async getRevenueSummary(
    developerId: string,
    startDate: Date,
    endDate: Date,
  ): Promise<RevenueSummary> {
    // 获取开发者的Skill
    const skills = await this.skillRepository.find({
      where: { authorId: developerId },
    });
    const skillIds = skills.map(s => s.id);
    const skillMap = new Map(skills.map(s => [s.id, s]));

    if (skillIds.length === 0) {
      return this.emptyRevenueSummary(startDate, endDate);
    }

    // 获取时间范围内的分析数据
    const analytics = await this.analyticsRepository
      .createQueryBuilder('analytics')
      .where('analytics.skillId IN (:...skillIds)', { skillIds })
      .andWhere('analytics.createdAt >= :startDate', { startDate })
      .andWhere('analytics.createdAt <= :endDate', { endDate })
      .getMany();

    // 计算汇总
    let totalEarnings = 0;
    const bySkill = new Map<string, { earnings: number; calls: number }>();
    const byPlatform = new Map<CallPlatform, { earnings: number; calls: number }>();
    const byDay = new Map<string, { earnings: number; calls: number }>();

    for (const record of analytics) {
      const earning = (Number(record.revenueGenerated) || 0) * (1 - this.PLATFORM_FEE_RATE);
      totalEarnings += earning;

      // By Skill
      const skillData = bySkill.get(record.skillId) || { earnings: 0, calls: 0 };
      skillData.earnings += earning;
      skillData.calls++;
      bySkill.set(record.skillId, skillData);

      // By Platform
      const platformData = byPlatform.get(record.platform) || { earnings: 0, calls: 0 };
      platformData.earnings += earning;
      platformData.calls++;
      byPlatform.set(record.platform, platformData);

      // By Day
      const dayKey = record.createdAt.toISOString().split('T')[0];
      const dayData = byDay.get(dayKey) || { earnings: 0, calls: 0 };
      dayData.earnings += earning;
      dayData.calls++;
      byDay.set(dayKey, dayData);
    }

    return {
      totalEarnings: Math.round(totalEarnings * 100) / 100,
      pendingSettlement: Math.round(totalEarnings * 100) / 100,
      settledAmount: 0,
      currency: 'USD',
      period: { start: startDate, end: endDate },
      breakdown: {
        bySkill: Array.from(bySkill.entries()).map(([skillId, data]) => ({
          skillId,
          skillName: skillMap.get(skillId)?.name || 'Unknown',
          earnings: Math.round(data.earnings * 100) / 100,
          calls: data.calls,
        })).sort((a, b) => b.earnings - a.earnings),
        byPlatform: Array.from(byPlatform.entries()).map(([platform, data]) => ({
          platform,
          earnings: Math.round(data.earnings * 100) / 100,
          calls: data.calls,
        })),
        byDay: Array.from(byDay.entries())
          .map(([date, data]) => ({
            date,
            earnings: Math.round(data.earnings * 100) / 100,
            calls: data.calls,
          }))
          .sort((a, b) => a.date.localeCompare(b.date)),
      },
    };
  }

  /**
   * 获取单个Skill的收益详情
   */
  async getSkillRevenue(
    skillId: string,
    developerId: string,
    days: number = 30,
  ): Promise<{
    skill: Partial<Skill>;
    totalEarnings: number;
    totalCalls: number;
    avgEarningsPerCall: number;
    recentCalls: RevenueRecord[];
    dailyEarnings: Array<{ date: string; earnings: number; calls: number }>;
  }> {
    // 验证Skill归属
    const skill = await this.skillRepository.findOne({
      where: { id: skillId, authorId: developerId },
    });

    if (!skill) {
      throw new Error('Skill not found or access denied');
    }

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const analytics = await this.analyticsRepository
      .createQueryBuilder('analytics')
      .where('analytics.skillId = :skillId', { skillId })
      .andWhere('analytics.createdAt >= :startDate', { startDate })
      .orderBy('analytics.createdAt', 'DESC')
      .getMany();

    let totalEarnings = 0;
    const byDay = new Map<string, { earnings: number; calls: number }>();

    for (const record of analytics) {
      const earning = (Number(record.revenueGenerated) || 0) * (1 - this.PLATFORM_FEE_RATE);
      totalEarnings += earning;

      const dayKey = record.createdAt.toISOString().split('T')[0];
      const dayData = byDay.get(dayKey) || { earnings: 0, calls: 0 };
      dayData.earnings += earning;
      dayData.calls++;
      byDay.set(dayKey, dayData);
    }

    const recentCalls: RevenueRecord[] = analytics.slice(0, 20).map(a => ({
      id: a.id,
      skillId: a.skillId,
      skillName: skill.name,
      amount: (Number(a.revenueGenerated) || 0) * (1 - this.PLATFORM_FEE_RATE),
      currency: 'USD',
      callerId: a.callerId,
      callerType: a.callerType,
      platform: a.platform,
      timestamp: a.createdAt,
      settled: false,
    }));

    return {
      skill: {
        id: skill.id,
        name: skill.name,
        displayName: skill.displayName,
        status: skill.status,
        pricing: skill.pricing,
        callCount: skill.callCount,
        rating: skill.rating,
      },
      totalEarnings: Math.round(totalEarnings * 100) / 100,
      totalCalls: analytics.length,
      avgEarningsPerCall: analytics.length > 0 
        ? Math.round((totalEarnings / analytics.length) * 100) / 100 
        : 0,
      recentCalls,
      dailyEarnings: Array.from(byDay.entries())
        .map(([date, data]) => ({
          date,
          earnings: Math.round(data.earnings * 100) / 100,
          calls: data.calls,
        }))
        .sort((a, b) => a.date.localeCompare(b.date)),
    };
  }

  /**
   * 记录Skill调用收益
   * 同时更新 DeveloperAccount 的待结算收益
   */
  async recordCallRevenue(
    skillId: string,
    callerId: string | undefined,
    callerType: CallerType,
    platform: CallPlatform,
    revenueAmount: number,
  ): Promise<void> {
    const analytics = this.analyticsRepository.create({
      skillId,
      callerId,
      callerType,
      platform,
      revenueGenerated: revenueAmount,
      success: true,
    });

    await this.analyticsRepository.save(analytics);
    this.logger.debug(`Recorded revenue: ${skillId} - ${revenueAmount} USD`);

    // 更新 DeveloperAccount 的待结算收益
    try {
      const skill = await this.skillRepository.findOne({
        where: { id: skillId },
        select: ['id', 'authorId'],
      });

      if (skill?.authorId) {
        // 计算开发者收益（扣除平台分成）
        const developerShare = revenueAmount * (1 - this.PLATFORM_FEE_RATE);
        
        // 查找开发者账户并更新收益
        const developerAccount = await this.developerAccountService.findByUserId(skill.authorId);
        if (developerAccount) {
          await this.developerAccountService.addRevenue(developerAccount.id, developerShare);
          this.logger.debug(`Updated DeveloperAccount ${developerAccount.id} with revenue: ${developerShare} USD`);
        }
      }
    } catch (error) {
      this.logger.warn(`Failed to update DeveloperAccount revenue: ${error.message}`);
      // 不影响主流程
    }
  }

  /**
   * 构建收益图表数据
   */
  private buildEarningsChart(
    analytics: SkillAnalytics[],
    days: number,
  ): Array<{ date: string; earnings: number }> {
    const chart = new Map<string, number>();
    const today = new Date();

    // 初始化所有日期
    for (let i = days - 1; i >= 0; i--) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);
      chart.set(date.toISOString().split('T')[0], 0);
    }

    // 填充数据
    for (const record of analytics) {
      const dayKey = record.createdAt.toISOString().split('T')[0];
      if (chart.has(dayKey)) {
        const earning = (Number(record.revenueGenerated) || 0) * (1 - this.PLATFORM_FEE_RATE);
        chart.set(dayKey, (chart.get(dayKey) || 0) + earning);
      }
    }

    return Array.from(chart.entries())
      .map(([date, earnings]) => ({
        date,
        earnings: Math.round(earnings * 100) / 100,
      }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }

  /**
   * 创建空收益汇总
   */
  private emptyRevenueSummary(startDate: Date, endDate: Date): RevenueSummary {
    return {
      totalEarnings: 0,
      pendingSettlement: 0,
      settledAmount: 0,
      currency: 'USD',
      period: { start: startDate, end: endDate },
      breakdown: {
        bySkill: [],
        byPlatform: [],
        byDay: [],
      },
    };
  }
}
