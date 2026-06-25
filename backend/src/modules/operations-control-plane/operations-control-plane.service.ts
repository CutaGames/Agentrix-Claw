import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AgentLaneEvent } from '../../entities/agent-lane-event.entity';
import { AgentLaneJob } from '../../entities/agent-lane-job.entity';
import { AgentRepairJob } from '../../entities/agent-repair-job.entity';
import {
  DesktopApproval,
  DesktopCommand,
  DesktopDevicePresence,
  DesktopSession,
  DesktopTask,
} from '../../entities/desktop-sync.entity';
import { DesktopSyncService } from '../desktop-sync/desktop-sync.service';
import { DesktopCommandKind } from '../desktop-sync/dto/desktop-sync.dto';
import { ToolControlPlaneService } from '../tool-control-plane/tool-control-plane.service';

export type OperationsTimelineSource = 'parallel-lane' | 'auto-repair' | 'desktop-task' | 'approval' | 'desktop-command';
export type OperationsTimelineTone = 'info' | 'success' | 'warning' | 'error';

export interface OperationsTimelineItem {
  id: string;
  source: OperationsTimelineSource;
  title: string;
  detail?: string;
  status?: string;
  tone: OperationsTimelineTone;
  createdAt: string;
  metadata?: Record<string, any>;
}

export interface OperationsFollowUpRequest {
  sessionId: string;
  title?: string;
  targetDeviceId?: string;
  requesterDeviceId?: string;
  action?: 'resume-on-desktop' | 'summarize' | 'open-session';
}

const DEVICE_ONLINE_THRESHOLD_MS = 5 * 60 * 1000;

@Injectable()
export class OperationsControlPlaneService {
  constructor(
    @InjectRepository(AgentLaneJob)
    private readonly laneJobRepo: Repository<AgentLaneJob>,
    @InjectRepository(AgentLaneEvent)
    private readonly laneEventRepo: Repository<AgentLaneEvent>,
    @InjectRepository(AgentRepairJob)
    private readonly repairJobRepo: Repository<AgentRepairJob>,
    @InjectRepository(DesktopDevicePresence)
    private readonly devicePresenceRepo: Repository<DesktopDevicePresence>,
    @InjectRepository(DesktopSession)
    private readonly sessionRepo: Repository<DesktopSession>,
    @InjectRepository(DesktopTask)
    private readonly taskRepo: Repository<DesktopTask>,
    @InjectRepository(DesktopApproval)
    private readonly approvalRepo: Repository<DesktopApproval>,
    @InjectRepository(DesktopCommand)
    private readonly commandRepo: Repository<DesktopCommand>,
    private readonly desktopSyncService: DesktopSyncService,
    private readonly toolControlPlaneService: ToolControlPlaneService,
  ) {}

  async getOverview(userId: string) {
    const [laneJobs, repairJobs, devices, tasks, approvals, commands, sessions] = await Promise.all([
      this.laneJobRepo.find({ where: { userId }, order: { updatedAt: 'DESC' }, take: 100 }),
      this.repairJobRepo.find({ where: { userId }, order: { updatedAt: 'DESC' }, take: 100 }),
      this.devicePresenceRepo.find({ where: { userId }, order: { lastSeenAt: 'DESC' } }),
      this.taskRepo.find({ where: { userId }, order: { updatedAt: 'DESC' }, take: 100 }),
      this.approvalRepo.find({ where: { userId }, order: { createdAt: 'DESC' }, take: 100 }),
      this.commandRepo.find({ where: { userId }, order: { updatedAt: 'DESC' }, take: 100 }),
      this.sessionRepo.find({ where: { userId }, order: { updatedAt: 'DESC' }, take: 50 }),
    ]);

    const toolPolicy = this.toolControlPlaneService.buildPolicyReport();
    const pendingApprovals = approvals.filter((approval) => approval.status === 'pending').length;
    const runningLaneJobs = laneJobs.filter((job) => job.status === 'running' || job.status === 'queued').length;
    const runningTasks = tasks.filter((task) => task.status === 'executing' || task.status === 'need-approve').length;
    const failedSignals = laneJobs.filter((job) => job.status === 'failed' || job.status === 'timeout').length
      + repairJobs.filter((job) => job.status === 'failed').length
      + tasks.filter((task) => task.status === 'failed').length
      + commands.filter((command) => command.status === 'failed' || command.status === 'rejected').length;

    const status = toolPolicy.status === 'fail' || failedSignals > 0
      ? 'warn'
      : pendingApprovals > 0 || runningLaneJobs > 0 || runningTasks > 0
        ? 'active'
        : 'pass';

    return {
      generatedAt: new Date().toISOString(),
      status,
      counts: {
        laneJobs: laneJobs.length,
        repairJobs: repairJobs.length,
        devices: devices.length,
        onlineDevices: devices.filter((device) => this.isOnline(device.lastSeenAt)).length,
        tasks: tasks.length,
        sessions: sessions.length,
        approvals: approvals.length,
        pendingApprovals,
        commands: commands.length,
        runningLaneJobs,
        runningTasks,
        failedSignals,
      },
      laneJobs: this.countByStatus(laneJobs.map((job) => job.status)),
      repairJobs: this.countByStatus(repairJobs.map((job) => job.status)),
      desktopTasks: this.countByStatus(tasks.map((task) => task.status)),
      desktopCommands: this.countByStatus(commands.map((command) => command.status)),
      toolPolicy: {
        status: toolPolicy.status,
        summary: toolPolicy.summary,
        riskBands: toolPolicy.riskBands,
        recommendations: toolPolicy.recommendations,
      },
    };
  }

  async getTimeline(userId: string, limit = 80): Promise<{ generatedAt: string; items: OperationsTimelineItem[] }> {
    const take = Math.max(1, Math.min(Number(limit) || 80, 160));
    const [laneEvents, repairJobs, tasks, approvals, commands] = await Promise.all([
      this.laneEventRepo.find({ where: { job: { userId } } as any, order: { createdAt: 'DESC' }, take }),
      this.repairJobRepo.find({ where: { userId }, order: { updatedAt: 'DESC' }, take }),
      this.taskRepo.find({ where: { userId }, order: { updatedAt: 'DESC' }, take }),
      this.approvalRepo.find({ where: { userId }, order: { createdAt: 'DESC' }, take }),
      this.commandRepo.find({ where: { userId }, order: { updatedAt: 'DESC' }, take }),
    ]);

    const items: OperationsTimelineItem[] = [
      ...laneEvents.map((event) => ({
        id: `lane-event-${event.id}`,
        source: 'parallel-lane' as const,
        title: event.type,
        detail: this.stringifyDetail(event.payload),
        status: event.type,
        tone: this.toneForStatus(event.type),
        createdAt: this.iso(event.createdAt),
        metadata: { jobId: event.jobId, parentJobId: event.parentJobId, sequence: event.sequence, payload: event.payload },
      })),
      ...repairJobs.map((job) => ({
        id: `repair-job-${job.id}`,
        source: 'auto-repair' as const,
        title: `Repair ${job.status}`,
        detail: job.command,
        status: job.status,
        tone: this.toneForStatus(job.status),
        createdAt: this.iso(job.updatedAt || job.createdAt),
        metadata: { jobId: job.id, attemptsCount: job.attemptsCount, sessionId: job.sessionId },
      })),
      ...tasks.map((task) => ({
        id: `desktop-task-${task.id}`,
        source: 'desktop-task' as const,
        title: task.title,
        detail: task.summary,
        status: task.status,
        tone: this.toneForStatus(task.status),
        createdAt: this.iso(task.updatedAt || task.createdAt),
        metadata: { taskId: task.taskId, sessionId: task.sessionId, deviceId: task.deviceId },
      })),
      ...approvals.map((approval) => ({
        id: `approval-${approval.id}`,
        source: 'approval' as const,
        title: approval.title,
        detail: approval.description,
        status: approval.status,
        tone: approval.status === 'pending' ? 'warning' as const : this.toneForStatus(approval.status),
        createdAt: this.iso(approval.respondedAt || approval.createdAt),
        metadata: { approvalId: approval.id, taskId: approval.taskId, riskLevel: approval.riskLevel, deviceId: approval.deviceId },
      })),
      ...commands.map((command) => ({
        id: `desktop-command-${command.id}`,
        source: 'desktop-command' as const,
        title: command.title,
        detail: command.error || this.stringifyDetail(command.payload),
        status: command.status,
        tone: this.toneForStatus(command.status),
        createdAt: this.iso(command.completedAt || command.updatedAt || command.createdAt),
        metadata: { commandId: command.id, kind: command.kind, targetDeviceId: command.targetDeviceId, sessionId: command.sessionId },
      })),
    ];

    return {
      generatedAt: new Date().toISOString(),
      items: items
        .sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt))
        .slice(0, take),
    };
  }

  async getContinuity(userId: string) {
    const [sessions, devices, tasks, approvals] = await Promise.all([
      this.sessionRepo.find({ where: { userId }, order: { updatedAt: 'DESC' }, take: 40 }),
      this.devicePresenceRepo.find({ where: { userId }, order: { lastSeenAt: 'DESC' } }),
      this.taskRepo.find({ where: { userId }, order: { updatedAt: 'DESC' }, take: 80 }),
      this.approvalRepo.find({ where: { userId }, order: { createdAt: 'DESC' }, take: 80 }),
    ]);

    const tasksBySession = this.groupBy(tasks, (task) => task.sessionId || '__global__');
    const pendingApprovals = approvals.filter((approval) => approval.status === 'pending');
    const runningTasks = tasks.filter((task) => task.status === 'executing' || task.status === 'need-approve');
    const onlineDevices = devices.filter((device) => this.isOnline(device.lastSeenAt));

    const sessionCards = sessions.map((session) => {
      const sessionTasks = tasksBySession.get(session.sessionId) || [];
      return {
        sessionId: session.sessionId,
        title: session.title,
        messageCount: session.messageCount,
        deviceId: session.deviceId,
        deviceType: session.deviceType,
        updatedAt: this.iso(session.updatedAt),
        activeTaskCount: sessionTasks.filter((task) => task.status === 'executing' || task.status === 'need-approve').length,
        pendingApprovalCount: pendingApprovals.filter((approval) => sessionTasks.some((task) => task.taskId === approval.taskId)).length,
      };
    });

    return {
      generatedAt: new Date().toISOString(),
      devices: devices.map((device) => ({
        deviceId: device.deviceId,
        platform: device.platform,
        appVersion: device.appVersion,
        isOnline: this.isOnline(device.lastSeenAt),
        lastSeenAt: this.iso(device.lastSeenAt),
        context: device.context,
      })),
      sessions: sessionCards,
      activeTasks: runningTasks.slice(0, 12).map((task) => ({
        taskId: task.taskId,
        title: task.title,
        status: task.status,
        sessionId: task.sessionId,
        deviceId: task.deviceId,
        updatedAt: this.iso(task.updatedAt),
      })),
      pendingApprovals: pendingApprovals.slice(0, 12).map((approval) => ({
        approvalId: approval.id,
        taskId: approval.taskId,
        title: approval.title,
        riskLevel: approval.riskLevel,
        deviceId: approval.deviceId,
        requestedAt: this.iso(approval.createdAt),
      })),
      wearableSummary: {
        title: 'Agentrix task continuity',
        pendingApprovalCount: pendingApprovals.length,
        runningTaskCount: runningTasks.length,
        onlineDeviceCount: onlineDevices.length,
        topItems: [
          ...pendingApprovals.slice(0, 3).map((approval) => ({ kind: 'approval', title: approval.title, riskLevel: approval.riskLevel })),
          ...runningTasks.slice(0, 3).map((task) => ({ kind: 'task', title: task.title, status: task.status })),
        ].slice(0, 4),
      },
    };
  }

  async createFollowUp(userId: string, dto: OperationsFollowUpRequest) {
    const title = dto.title || 'Resume Agentrix session';
    const action = dto.action || 'resume-on-desktop';
    const command = await this.desktopSyncService.createCommand(userId, {
      title,
      kind: DesktopCommandKind.CONTEXT,
      targetDeviceId: dto.targetDeviceId,
      requesterDeviceId: dto.requesterDeviceId,
      sessionId: dto.sessionId,
      payload: {
        action,
        sessionId: dto.sessionId,
        requestedAt: Date.now(),
      },
    });
    return {
      ok: true,
      followUp: {
        action,
        sessionId: dto.sessionId,
        command: command.command,
      },
    };
  }

  private countByStatus(statuses: Array<string | undefined>) {
    return statuses.reduce<Record<string, number>>((acc, status) => {
      const key = status || 'unknown';
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});
  }

  private toneForStatus(status: string): OperationsTimelineTone {
    if (/fail|error|timeout|reject|cancel/i.test(status)) return 'error';
    if (/complete|pass|applied|approved|finished|success/i.test(status)) return 'success';
    if (/pending|approval|queued|waiting|need/i.test(status)) return 'warning';
    return 'info';
  }

  private stringifyDetail(value: unknown): string | undefined {
    if (!value) return undefined;
    if (typeof value === 'string') return value;
    try {
      return JSON.stringify(value).slice(0, 500);
    } catch {
      return String(value);
    }
  }

  private groupBy<T>(items: T[], getKey: (item: T) => string) {
    const map = new Map<string, T[]>();
    for (const item of items) {
      const key = getKey(item);
      map.set(key, [...(map.get(key) || []), item]);
    }
    return map;
  }

  private isOnline(value: Date | string) {
    return Date.now() - new Date(value).getTime() < DEVICE_ONLINE_THRESHOLD_MS;
  }

  private iso(value: Date | string | number | undefined) {
    if (!value) return new Date().toISOString();
    if (value instanceof Date) return value.toISOString();
    return new Date(value).toISOString();
  }
}