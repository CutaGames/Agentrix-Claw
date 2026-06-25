import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between, MoreThanOrEqual } from 'typeorm';
import { ConversationEvent } from '../../../entities/conversation-event.entity';
import { UserAgent } from '../../../entities/user-agent.entity';
import { DevicePresence } from '../../../entities/device-presence.entity';
import { AgentScheduledTask, ScheduledTaskStatus } from '../../../entities/agent-scheduled-task.entity';

export interface AgentActivityStats {
  agentId: string;
  agentName: string;
  totalMessages: number;
  inboundCount: number;
  outboundCount: number;
  channelBreakdown: Record<string, number>;
  avgResponseTimeMs?: number;
  lastActiveAt?: string;
}

export interface ChannelVolumeStats {
  channel: string;
  totalMessages: number;
  inbound: number;
  outbound: number;
  failedDeliveries: number;
}

export interface DashboardOverview {
  totalAgents: number;
  activeAgents: number;
  totalMessages24h: number;
  totalMessagesWeek: number;
  onlineDevices: number;
  totalDevices: number;
  activeScheduledTasks: number;
  failedScheduledTasks: number;
  channelVolume: ChannelVolumeStats[];
  agentActivity: AgentActivityStats[];
}

@Injectable()
export class OperationsDashboardService {
  private readonly logger = new Logger(OperationsDashboardService.name);

  constructor(
    @InjectRepository(ConversationEvent)
    private readonly eventRepo: Repository<ConversationEvent>,
    @InjectRepository(UserAgent)
    private readonly agentRepo: Repository<UserAgent>,
    @InjectRepository(DevicePresence)
    private readonly deviceRepo: Repository<DevicePresence>,
    @InjectRepository(AgentScheduledTask)
    private readonly taskRepo: Repository<AgentScheduledTask>,
  ) {}

  async getDashboardOverview(userId: string): Promise<DashboardOverview> {
    const now = new Date();
    const h24Ago = new Date(now.getTime() - 24 * 3600 * 1000);
    const weekAgo = new Date(now.getTime() - 7 * 24 * 3600 * 1000);

    // Parallel queries
    const [
      totalAgents,
      activeAgents,
      totalMessages24h,
      totalMessagesWeek,
      onlineDevices,
      totalDevices,
      activeScheduledTasks,
      failedScheduledTasks,
      channelVolume,
      agentActivity,
    ] = await Promise.all([
      this.agentRepo.count({ where: { userId } }),
      this.agentRepo.count({ where: { userId, status: 'active' as any } }),
      this.eventRepo.count({ where: { userId, createdAt: MoreThanOrEqual(h24Ago) } }),
      this.eventRepo.count({ where: { userId, createdAt: MoreThanOrEqual(weekAgo) } }),
      this.deviceRepo.count({ where: { userId, isOnline: true } }),
      this.deviceRepo.count({ where: { userId } }),
      this.taskRepo.count({ where: { userId, status: ScheduledTaskStatus.ACTIVE } }),
      this.taskRepo.count({ where: { userId, status: ScheduledTaskStatus.FAILED } }),
      this.getChannelVolume(userId, h24Ago),
      this.getAgentActivity(userId, h24Ago),
    ]);

    return {
      totalAgents,
      activeAgents,
      totalMessages24h,
      totalMessagesWeek,
      onlineDevices,
      totalDevices,
      activeScheduledTasks,
      failedScheduledTasks,
      channelVolume,
      agentActivity,
    };
  }

  async getChannelVolume(userId: string, since: Date): Promise<ChannelVolumeStats[]> {
    const raw = await this.eventRepo
      .createQueryBuilder('ce')
      .select('ce.channel', 'channel')
      .addSelect('COUNT(*)', 'totalMessages')
      .addSelect(`SUM(CASE WHEN ce.direction = 'inbound' THEN 1 ELSE 0 END)`, 'inbound')
      .addSelect(`SUM(CASE WHEN ce.direction = 'outbound' THEN 1 ELSE 0 END)`, 'outbound')
      .addSelect(`SUM(CASE WHEN ce.delivery_status = 'failed' THEN 1 ELSE 0 END)`, 'failedDeliveries')
      .where('ce.user_id = :userId', { userId })
      .andWhere('ce.created_at >= :since', { since })
      .groupBy('ce.channel')
      .orderBy('"totalMessages"', 'DESC')
      .getRawMany();

    return raw.map((r) => ({
      channel: r.channel,
      totalMessages: Number(r.totalMessages),
      inbound: Number(r.inbound),
      outbound: Number(r.outbound),
      failedDeliveries: Number(r.failedDeliveries),
    }));
  }

  async getAgentActivity(userId: string, since: Date): Promise<AgentActivityStats[]> {
    const agents = await this.agentRepo.find({ where: { userId } });

    const stats: AgentActivityStats[] = [];

    for (const agent of agents) {
      const raw = await this.eventRepo
        .createQueryBuilder('ce')
        .select('COUNT(*)', 'total')
        .addSelect(`SUM(CASE WHEN ce.direction = 'inbound' THEN 1 ELSE 0 END)`, 'inbound')
        .addSelect(`SUM(CASE WHEN ce.direction = 'outbound' THEN 1 ELSE 0 END)`, 'outbound')
        .where('ce.user_id = :userId', { userId })
        .andWhere('ce.agent_id = :agentId', { agentId: agent.id })
        .andWhere('ce.created_at >= :since', { since })
        .getRawOne();

      const channelRaw = await this.eventRepo
        .createQueryBuilder('ce')
        .select('ce.channel', 'channel')
        .addSelect('COUNT(*)', 'count')
        .where('ce.user_id = :userId', { userId })
        .andWhere('ce.agent_id = :agentId', { agentId: agent.id })
        .andWhere('ce.created_at >= :since', { since })
        .groupBy('ce.channel')
        .getRawMany();

      const channelBreakdown: Record<string, number> = {};
      for (const c of channelRaw) {
        channelBreakdown[c.channel] = Number(c.count);
      }

      const lastEvent = await this.eventRepo.findOne({
        where: { userId, agentId: agent.id },
        order: { createdAt: 'DESC' },
      });

      stats.push({
        agentId: agent.id,
        agentName: agent.name,
        totalMessages: Number(raw?.total ?? 0),
        inboundCount: Number(raw?.inbound ?? 0),
        outboundCount: Number(raw?.outbound ?? 0),
        channelBreakdown,
        lastActiveAt: lastEvent?.createdAt?.toISOString(),
      });
    }

    return stats.sort((a, b) => b.totalMessages - a.totalMessages);
  }

  async getResponseTimeStats(
    userId: string,
    agentId: string,
    days = 7,
  ): Promise<{ avgMs: number; p95Ms: number; count: number }> {
    // Approximate response time by measuring gap between consecutive inbound/outbound pairs
    const since = new Date(Date.now() - days * 24 * 3600 * 1000);

    const events = await this.eventRepo.find({
      where: {
        userId,
        agentId,
        createdAt: MoreThanOrEqual(since),
      },
      order: { createdAt: 'ASC' },
      take: 1000,
    });

    const responseTimes: number[] = [];
    for (let i = 0; i < events.length - 1; i++) {
      if (events[i].direction === 'inbound' && events[i + 1].direction === 'outbound') {
        const diff = events[i + 1].createdAt.getTime() - events[i].createdAt.getTime();
        if (diff > 0 && diff < 300000) { // < 5 min
          responseTimes.push(diff);
        }
      }
    }

    if (responseTimes.length === 0) {
      return { avgMs: 0, p95Ms: 0, count: 0 };
    }

    responseTimes.sort((a, b) => a - b);
    const avg = responseTimes.reduce((s, v) => s + v, 0) / responseTimes.length;
    const p95 = responseTimes[Math.floor(responseTimes.length * 0.95)] ?? 0;

    return {
      avgMs: Math.round(avg),
      p95Ms: Math.round(p95),
      count: responseTimes.length,
    };
  }
}
