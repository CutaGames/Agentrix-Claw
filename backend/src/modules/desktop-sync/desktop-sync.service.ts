import { Injectable, Logger, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { NotificationService } from '../notification/notification.service';
import { NotificationType } from '../../entities/notification.entity';
import {
  DesktopDevicePresence,
  DesktopSession,
  DesktopTask,
  DesktopApproval,
  DesktopCommand,
} from '../../entities/desktop-sync.entity';
import {
  SharedWorkspace,
  SharedWorkspaceMember,
  SharedWorkspaceSession,
  DeviceMediaTransfer,
  WorkspaceRole,
  WorkspaceInviteStatus,
} from '../../entities/shared-workspace.entity';
import {
  ClaimDesktopCommandDto,
  CompleteDesktopCommandDto,
  CreateDesktopCommandDto,
  CreateDesktopApprovalDto,
  DesktopCommandStatus,
  DesktopCommandKind,
  DesktopApprovalDecision,
  DesktopApprovalRiskLevel,
  DesktopHeartbeatDto,
  DesktopSessionDeviceType,
  DesktopSessionMessageDto,
  DesktopTaskStatus,
  DesktopTimelineStatus,
  DesktopTimelineEntryDto,
  RespondDesktopApprovalDto,
  UpsertDesktopSessionDto,
  UpsertDesktopTaskDto,
  UploadDeviceMediaDto,
  SharedWorkspaceRoleDto,
} from './dto/desktop-sync.dto';
import { emitDesktopSyncEvent } from './desktop-sync.events';

// Threshold for considering a device "online" (no heartbeat within this window = offline)
const DEVICE_ONLINE_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes

@Injectable()
export class DesktopSyncService {
  private readonly logger = new Logger(DesktopSyncService.name);

  constructor(
    private readonly notificationService: NotificationService,
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
    @InjectRepository(SharedWorkspace)
    private readonly workspaceRepo: Repository<SharedWorkspace>,
    @InjectRepository(SharedWorkspaceMember)
    private readonly workspaceMemberRepo: Repository<SharedWorkspaceMember>,
    @InjectRepository(SharedWorkspaceSession)
    private readonly workspaceSessionRepo: Repository<SharedWorkspaceSession>,
    @InjectRepository(DeviceMediaTransfer)
    private readonly mediaTransferRepo: Repository<DeviceMediaTransfer>,
  ) {}

  async heartbeat(userId: string, dto: DesktopHeartbeatDto) {
    const now = new Date();

    // Upsert device presence row
    let entity = await this.devicePresenceRepo.findOne({
      where: { userId, deviceId: dto.deviceId },
    });

    if (!entity) {
      entity = this.devicePresenceRepo.create({
        userId,
        deviceId: dto.deviceId,
      });
    }

    entity.platform = dto.platform;
    entity.appVersion = dto.appVersion;
    entity.context = dto.context as Record<string, unknown> | undefined;
    entity.lastSeenAt = now;

    entity = await this.devicePresenceRepo.save(entity);

    const record = this.devicePresenceToRecord(entity);
    emitDesktopSyncEvent(userId, 'desktop-sync:presence', record);

    return {
      ok: true,
      device: record,
      serverTime: now.toISOString(),
    };
  }

  async upsertTask(userId: string, dto: UpsertDesktopTaskDto) {
    let entity = await this.taskRepo.findOne({ where: { userId, taskId: dto.taskId } });
    if (!entity) {
      entity = this.taskRepo.create({ userId, taskId: dto.taskId });
    }

    entity.deviceId = dto.deviceId;
    entity.sessionId = dto.sessionId;
    entity.title = dto.title;
    entity.summary = dto.summary;
    entity.status = dto.status as any;
    entity.startedAt = dto.startedAt ?? entity.startedAt ?? Date.now();
    entity.finishedAt = dto.finishedAt;
    entity.timeline = this.normalizeTimeline(dto.timeline ?? entity.timeline ?? []);
    entity.context = this.toJsonRecord(dto.context);

    entity = await this.taskRepo.save(entity);

    const record = this.taskEntityToRecord(entity);
    emitDesktopSyncEvent(userId, 'desktop-sync:task', record);

    return { ok: true, task: record };
  }

  async createApproval(userId: string, dto: CreateDesktopApprovalDto) {
    const entity = this.approvalRepo.create();
    entity.userId = userId;
    entity.deviceId = dto.deviceId;
    entity.taskId = dto.taskId;
    entity.timelineEntryId = dto.timelineEntryId;
    entity.title = dto.title;
    entity.description = dto.description;
    entity.riskLevel = dto.riskLevel;
    entity.sessionKey = dto.sessionKey;
    entity.status = 'pending';
    entity.rememberForSession = false;
    entity.context = this.toJsonRecord(dto.context);

    const saved = await this.approvalRepo.save(entity);
    const approvalId = saved.id;

    await this.bumpTaskStatusForApproval(
      userId,
      dto.taskId,
      dto.timelineEntryId,
      DesktopTimelineStatus.WAITING_APPROVAL,
    );

    const record = this.approvalEntityToRecord(saved);
    emitDesktopSyncEvent(userId, 'desktop-sync:approval', record);

    const message = this.formatApprovalMessage(saved);
    await this.notificationService.createNotification(userId, {
      type: NotificationType.APPROVAL as any,
      title: `Desktop approval required · ${saved.riskLevel}`,
      message,
    });
    await this.notificationService.sendPushNotification(userId, {
      title: 'Desktop approval required',
      body: message,
      data: {
        type: 'desktop_approval_required',
        approvalId,
        taskId: dto.taskId,
        deviceId: dto.deviceId,
      },
      channelId: 'developer',
    });

    return { ok: true, approval: record };
  }

  async respondToApproval(userId: string, approvalId: string, dto: RespondDesktopApprovalDto) {
    const entity = await this.approvalRepo.findOne({ where: { userId, id: approvalId } });
    if (!entity) {
      throw new NotFoundException('Approval request not found');
    }

    entity.status = dto.decision === DesktopApprovalDecision.APPROVED ? 'approved' : 'rejected';
    entity.respondedAt = new Date();
    entity.responseDeviceId = dto.deviceId;
    entity.rememberForSession = Boolean(dto.rememberForSession);
    entity.metadata = dto.metadata;

    await this.approvalRepo.save(entity);

    await this.bumpTaskStatusForApproval(
      userId,
      entity.taskId,
      entity.timelineEntryId,
      dto.decision === DesktopApprovalDecision.APPROVED
        ? DesktopTimelineStatus.RUNNING
        : DesktopTimelineStatus.REJECTED,
    );

    const record = this.approvalEntityToRecord(entity);
    emitDesktopSyncEvent(userId, 'desktop-sync:approval-response', record);

    return { ok: true, approval: record };
  }

  async getState(userId: string) {
    const deviceEntities = await this.devicePresenceRepo.find({
      where: { userId },
      order: { lastSeenAt: 'DESC' },
    });
    const devices = deviceEntities.map((e) => this.devicePresenceToRecord(e));

    const taskEntities = await this.taskRepo.find({ where: { userId }, order: { updatedAt: 'DESC' }, take: 100 });
    const tasks = taskEntities.map((e) => this.taskEntityToRecord(e));

    const approvalEntities = await this.approvalRepo.find({ where: { userId }, order: { createdAt: 'DESC' }, take: 100 });
    const approvals = approvalEntities.map((e) => this.approvalEntityToRecord(e));

    const sessions = await this.listSessions(userId);
    const commands = await this.listCommands(userId);

    return {
      devices,
      tasks,
      approvals,
      sessions,
      commands,
      pendingApprovalCount: approvals.filter((item) => item.status === 'pending').length,
      serverTime: new Date().toISOString(),
    };
  }

  async getPendingApprovals(userId: string, deviceId?: string) {
    const qb = this.approvalRepo.createQueryBuilder('a')
      .where('a.userId = :userId', { userId })
      .andWhere('a.status = :status', { status: 'pending' })
      .orderBy('a.createdAt', 'DESC');

    if (deviceId) {
      qb.andWhere('a.deviceId = :deviceId', { deviceId });
    }

    const entities = await qb.getMany();
    return entities.map((e) => this.approvalEntityToRecord(e));
  }

  async upsertSession(userId: string, dto: UpsertDesktopSessionDto) {
    let entity = await this.sessionRepo.findOne({ where: { userId, sessionId: dto.sessionId } });
    if (!entity) {
      entity = this.sessionRepo.create({ userId, sessionId: dto.sessionId });
    }

    entity.title = dto.title;
    entity.messageCount = dto.messages.length;
    entity.deviceId = dto.deviceId;
    entity.deviceType = dto.deviceType;
    entity.messages = dto.messages.slice(-80);

    entity = await this.sessionRepo.save(entity);

    const meta = this.sessionEntityToMeta(entity);
    emitDesktopSyncEvent(userId, 'session:updated', {
      sessionId: entity.sessionId,
      messages: entity.messages,
      meta,
    });

    return { ok: true, session: entity };
  }

  async listSessions(userId: string) {
    const entities = await this.sessionRepo.find({
      where: { userId },
      order: { updatedAt: 'DESC' },
      take: 50,
      select: ['id', 'sessionId', 'title', 'messageCount', 'updatedAt', 'deviceId', 'deviceType'],
    });
    return entities.map((e) => this.sessionEntityToMeta(e));
  }

  async getSession(userId: string, sessionId: string) {
    const entity = await this.sessionRepo.findOne({ where: { userId, sessionId } });
    if (!entity) {
      throw new NotFoundException('Desktop session not found');
    }

    return {
      sessionId: entity.sessionId,
      messages: entity.messages,
      meta: this.sessionEntityToMeta(entity),
    };
  }

  async createCommand(userId: string, dto: CreateDesktopCommandDto) {
    const entity = this.commandRepo.create({
      userId,
      title: dto.title,
      kind: dto.kind,
      status: DesktopCommandStatus.PENDING,
      targetDeviceId: dto.targetDeviceId,
      requesterDeviceId: dto.requesterDeviceId,
      sessionId: dto.sessionId,
      payload: dto.payload,
    });

    const saved = await this.commandRepo.save(entity);
    const record = this.commandEntityToRecord(saved);
    emitDesktopSyncEvent(userId, 'desktop-sync:command', record);

    return { ok: true, command: record };
  }

  async listCommands(userId: string, deviceId?: string) {
    const qb = this.commandRepo.createQueryBuilder('c')
      .where('c.userId = :userId', { userId })
      .orderBy('c.updatedAt', 'DESC')
      .take(60);

    if (deviceId) {
      qb.andWhere('(c.targetDeviceId IS NULL OR c.targetDeviceId = :deviceId)', { deviceId });
    }

    const entities = await qb.getMany();
    return entities.map((e) => this.commandEntityToRecord(e));
  }

  async getPendingCommands(userId: string, deviceId?: string) {
    const all = await this.listCommands(userId, deviceId);
    return all.filter((command) => command.status === DesktopCommandStatus.PENDING);
  }

  async claimCommand(userId: string, commandId: string, dto: ClaimDesktopCommandDto) {
    const entity = await this.commandRepo.findOne({ where: { userId, id: commandId } });
    if (!entity) {
      throw new NotFoundException('Desktop command not found');
    }

    if (entity.targetDeviceId && entity.targetDeviceId !== dto.deviceId) {
      throw new NotFoundException('Desktop command is not targeted to this device');
    }

    if (entity.status !== DesktopCommandStatus.PENDING) {
      return { ok: true, command: this.commandEntityToRecord(entity) };
    }

    entity.status = DesktopCommandStatus.CLAIMED;
    entity.claimedAt = new Date();
    entity.claimedByDeviceId = dto.deviceId;
    await this.commandRepo.save(entity);

    const record = this.commandEntityToRecord(entity);
    emitDesktopSyncEvent(userId, 'desktop-sync:command-updated', record);

    return { ok: true, command: record };
  }

  async completeCommand(userId: string, commandId: string, dto: CompleteDesktopCommandDto) {
    const entity = await this.commandRepo.findOne({ where: { userId, id: commandId } });
    if (!entity) {
      throw new NotFoundException('Desktop command not found');
    }

    entity.status = dto.status;
    entity.completedAt = new Date();
    entity.claimedByDeviceId = entity.claimedByDeviceId ?? dto.deviceId;
    entity.result = dto.result;
    entity.error = dto.error;
    await this.commandRepo.save(entity);

    const record = this.commandEntityToRecord(entity);
    emitDesktopSyncEvent(userId, 'desktop-sync:command-updated', record);

    return { ok: true, command: record };
  }

  // ══════════════════════════════════════════════════════════════════════════
  // P8.1 — Unified Session History (cross-device)
  // ══════════════════════════════════════════════════════════════════════════

  async getUnifiedSessionHistory(userId: string, limit: number = 50) {
    // Combine desktop-sync sessions with device information
    const sessions = await this.sessionRepo.find({
      where: { userId },
      order: { updatedAt: 'DESC' },
      take: limit,
    });

    // Group by sessionId, merge cross-device data
    const sessionMap = new Map<string, any>();
    for (const s of sessions) {
      const existing = sessionMap.get(s.sessionId);
      if (!existing || s.updatedAt > existing.updatedAt) {
        sessionMap.set(s.sessionId, {
          sessionId: s.sessionId,
          title: s.title,
          messageCount: s.messageCount,
          lastUpdatedAt: s.updatedAt?.getTime?.() ?? Date.now(),
          originDeviceId: s.deviceId,
          originDeviceType: s.deviceType,
          devices: [{ deviceId: s.deviceId, deviceType: s.deviceType }],
        });
      } else {
        existing.devices.push({ deviceId: s.deviceId, deviceType: s.deviceType });
      }
    }

    return Array.from(sessionMap.values()).sort(
      (a, b) => b.lastUpdatedAt - a.lastUpdatedAt,
    );
  }

  // ══════════════════════════════════════════════════════════════════════════
  // P8.2 — Remote Control Enhanced (agent completion push)
  // ══════════════════════════════════════════════════════════════════════════

  async notifyAgentCompletion(
    userId: string,
    sessionId: string,
    deviceId: string,
    summary: string,
  ) {
    emitDesktopSyncEvent(userId, 'agent:task-completed', {
      sessionId,
      deviceId,
      summary,
      timestamp: Date.now(),
    });

    await this.notificationService.createNotification(userId, {
      type: NotificationType.SYSTEM,
      title: 'Agent task completed',
      message: summary.slice(0, 200),
    });
    await this.notificationService.sendPushNotification(userId, {
      title: 'Agent task completed',
      body: summary.slice(0, 100),
      data: { type: 'agent_task_completed', sessionId, deviceId },
      channelId: 'developer',
    });
  }

  async getDeviceCapabilities(userId: string) {
    const devices = await this.devicePresenceRepo.find({
      where: { userId },
      order: { lastSeenAt: 'DESC' },
    });
    return devices.map((d) => ({
      deviceId: d.deviceId,
      platform: d.platform,
      isOnline: (Date.now() - new Date(d.lastSeenAt).getTime()) < DEVICE_ONLINE_THRESHOLD_MS,
      capabilities: this.inferDeviceCapabilities(d.platform),
      context: d.context,
    }));
  }

  private inferDeviceCapabilities(platform: string): string[] {
    const p = platform.toLowerCase();
    if (p.includes('android') || p.includes('ios') || p.includes('iphone')) {
      return ['camera', 'gps', 'accelerometer', 'microphone', 'push_notifications', 'biometrics'];
    }
    if (p.includes('win') || p.includes('mac') || p.includes('linux')) {
      return ['screenshot', 'file_system', 'terminal', 'clipboard', 'browser_control', 'microphone'];
    }
    return ['clipboard', 'microphone'];
  }

  // ══════════════════════════════════════════════════════════════════════════
  // P8.3 — Device Capability Sharing (media transfer)
  // ══════════════════════════════════════════════════════════════════════════

  async uploadDeviceMedia(
    userId: string,
    dto: { sourceDeviceId: string; targetDeviceId?: string; mediaType: string; fileName?: string; mimeType?: string; dataUrl?: string; metadata?: Record<string, unknown>; sessionId?: string },
  ) {
    const entity = this.mediaTransferRepo.create({
      userId,
      sourceDeviceId: dto.sourceDeviceId,
      targetDeviceId: dto.targetDeviceId,
      mediaType: dto.mediaType,
      fileName: dto.fileName,
      mimeType: dto.mimeType,
      dataUrl: dto.dataUrl?.substring(0, 2 * 1024 * 1024), // 2MB limit
      metadata: dto.metadata,
      sessionId: dto.sessionId,
      status: 'pending',
    });

    const saved = await this.mediaTransferRepo.save(entity);

    emitDesktopSyncEvent(userId, 'device:media-transfer', {
      transferId: saved.id,
      sourceDeviceId: saved.sourceDeviceId,
      targetDeviceId: saved.targetDeviceId,
      mediaType: saved.mediaType,
      fileName: saved.fileName,
      sessionId: saved.sessionId,
      timestamp: Date.now(),
    });

    return { ok: true, transferId: saved.id };
  }

  async getDeviceMediaTransfers(userId: string, deviceId?: string, limit: number = 20) {
    const qb = this.mediaTransferRepo.createQueryBuilder('m')
      .where('m.userId = :userId', { userId })
      .orderBy('m.createdAt', 'DESC')
      .take(limit);

    if (deviceId) {
      qb.andWhere('(m.sourceDeviceId = :did OR m.targetDeviceId = :did OR m.targetDeviceId IS NULL)', { did: deviceId });
    }

    const entities = await qb.getMany();
    return entities.map((e) => ({
      transferId: e.id,
      sourceDeviceId: e.sourceDeviceId,
      targetDeviceId: e.targetDeviceId,
      mediaType: e.mediaType,
      fileName: e.fileName,
      mimeType: e.mimeType,
      fileSize: e.fileSize,
      metadata: e.metadata,
      sessionId: e.sessionId,
      status: e.status,
      createdAt: e.createdAt?.toISOString?.() ?? new Date().toISOString(),
      hasData: !!e.dataUrl,
    }));
  }

  async getDeviceMediaData(userId: string, transferId: string) {
    const entity = await this.mediaTransferRepo.findOne({ where: { userId, id: transferId } });
    if (!entity) throw new NotFoundException('Media transfer not found');

    entity.status = 'delivered';
    await this.mediaTransferRepo.save(entity);

    return {
      transferId: entity.id,
      mediaType: entity.mediaType,
      fileName: entity.fileName,
      mimeType: entity.mimeType,
      dataUrl: entity.dataUrl,
      metadata: entity.metadata,
    };
  }

  async updateDeviceCapabilityContext(
    userId: string,
    deviceId: string,
    capabilities: string[],
    gps?: { lat: number; lng: number; accuracy?: number; altitude?: number },
    sensors?: string[],
  ) {
    const device = await this.devicePresenceRepo.findOne({ where: { userId, deviceId } });
    if (!device) return null;

    device.context = {
      ...device.context,
      capabilities,
      gps,
      sensors,
      capabilityUpdatedAt: Date.now(),
    };
    await this.devicePresenceRepo.save(device);

    emitDesktopSyncEvent(userId, 'device:capability-update', {
      deviceId, capabilities, gps, sensors,
    });

    return { ok: true };
  }

  // ══════════════════════════════════════════════════════════════════════════
  // P8.4 — Shared Workspace (Team Collaboration)
  // ══════════════════════════════════════════════════════════════════════════

  async createSharedWorkspace(userId: string, name: string, description?: string) {
    const ws = this.workspaceRepo.create({
      ownerId: userId,
      name,
      description,
      settings: {},
      isActive: true,
    });
    const saved = await this.workspaceRepo.save(ws);

    // Auto-add owner as member
    const member = this.workspaceMemberRepo.create({
      workspaceId: saved.id,
      userId,
      role: WorkspaceRole.OWNER,
      inviteStatus: WorkspaceInviteStatus.ACCEPTED,
      joinedAt: new Date(),
    });
    await this.workspaceMemberRepo.save(member);

    return { ok: true, workspace: saved };
  }

  async listSharedWorkspaces(userId: string) {
    const memberships = await this.workspaceMemberRepo.find({
      where: { userId, inviteStatus: WorkspaceInviteStatus.ACCEPTED },
    });

    if (!memberships.length) return [];

    const workspaceIds = memberships.map((m) => m.workspaceId);
    const workspaces = await this.workspaceRepo.findByIds(workspaceIds);

    return workspaces.map((ws) => {
      const membership = memberships.find((m) => m.workspaceId === ws.id);
      return {
        workspaceId: ws.id,
        name: ws.name,
        description: ws.description,
        role: membership?.role,
        ownerId: ws.ownerId,
        createdAt: ws.createdAt?.toISOString?.(),
      };
    });
  }

  async inviteToWorkspace(userId: string, workspaceId: string, inviteeUserId: string, role: WorkspaceRole = WorkspaceRole.VIEWER) {
    // Verify user is owner or editor
    const callerMember = await this.workspaceMemberRepo.findOne({
      where: { workspaceId, userId, inviteStatus: WorkspaceInviteStatus.ACCEPTED },
    });
    if (!callerMember || callerMember.role === WorkspaceRole.VIEWER) {
      throw new ForbiddenException('Insufficient permissions to invite');
    }

    // Check if already invited
    const existing = await this.workspaceMemberRepo.findOne({
      where: { workspaceId, userId: inviteeUserId },
    });
    if (existing) {
      return { ok: true, status: 'already_invited', member: existing };
    }

    const member = this.workspaceMemberRepo.create({
      workspaceId,
      userId: inviteeUserId,
      role,
      inviteStatus: WorkspaceInviteStatus.PENDING,
      invitedBy: userId,
    });
    const saved = await this.workspaceMemberRepo.save(member);

    await this.notificationService.createNotification(inviteeUserId, {
      type: NotificationType.SYSTEM,
      title: 'Workspace invitation',
      message: `You have been invited to a shared workspace`,
    });

    return { ok: true, member: saved };
  }

  async respondToWorkspaceInvite(userId: string, workspaceId: string, action: 'accept' | 'decline') {
    const member = await this.workspaceMemberRepo.findOne({
      where: { workspaceId, userId, inviteStatus: WorkspaceInviteStatus.PENDING },
    });
    if (!member) throw new NotFoundException('No pending invitation found');

    member.inviteStatus = action === 'accept' ? WorkspaceInviteStatus.ACCEPTED : WorkspaceInviteStatus.DECLINED;
    if (action === 'accept') member.joinedAt = new Date();
    await this.workspaceMemberRepo.save(member);

    return { ok: true, status: member.inviteStatus };
  }

  async shareSessionToWorkspace(userId: string, workspaceId: string, sessionId: string, title?: string) {
    // Verify membership
    const member = await this.workspaceMemberRepo.findOne({
      where: { workspaceId, userId, inviteStatus: WorkspaceInviteStatus.ACCEPTED },
    });
    if (!member || member.role === WorkspaceRole.VIEWER) {
      throw new ForbiddenException('Insufficient permissions to share sessions');
    }

    const shared = this.workspaceSessionRepo.create({
      workspaceId,
      sessionId,
      createdByUserId: userId,
      title: title || 'Shared Chat',
      isActive: true,
    });
    const saved = await this.workspaceSessionRepo.save(shared);

    emitDesktopSyncEvent(userId, 'workspace:session-shared', {
      workspaceId,
      sessionId,
      title: saved.title,
    });

    return { ok: true, sharedSession: saved };
  }

  async getWorkspaceSessions(userId: string, workspaceId: string) {
    // Verify membership
    const member = await this.workspaceMemberRepo.findOne({
      where: { workspaceId, userId, inviteStatus: WorkspaceInviteStatus.ACCEPTED },
    });
    if (!member) throw new ForbiddenException('Not a member of this workspace');

    const sessions = await this.workspaceSessionRepo.find({
      where: { workspaceId, isActive: true },
      order: { updatedAt: 'DESC' },
    });
    return sessions;
  }

  async getWorkspaceMembers(userId: string, workspaceId: string) {
    // Verify membership
    const member = await this.workspaceMemberRepo.findOne({
      where: { workspaceId, userId, inviteStatus: WorkspaceInviteStatus.ACCEPTED },
    });
    if (!member) throw new ForbiddenException('Not a member of this workspace');

    return this.workspaceMemberRepo.find({ where: { workspaceId } });
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  async listOnlineDevices(userId: string) {
    const entities = await this.devicePresenceRepo.find({
      where: { userId },
      order: { lastSeenAt: 'DESC' },
    });
    return entities
      .map((e) => this.devicePresenceToRecord(e))
      .filter((d) => d.isOnline);
  }

  private devicePresenceToRecord(e: DesktopDevicePresence) {
    const lastSeenAt = e.lastSeenAt instanceof Date ? e.lastSeenAt.toISOString() : String(e.lastSeenAt);
    const isOnline = (Date.now() - new Date(lastSeenAt).getTime()) < DEVICE_ONLINE_THRESHOLD_MS;
    return {
      deviceId: e.deviceId,
      platform: e.platform,
      appVersion: e.appVersion,
      context: e.context,
      lastSeenAt,
      isOnline,
    };
  }

  private normalizeTimeline(entries: DesktopTimelineEntryDto[]) {
    return [...entries]
      .sort((a, b) => (a.startedAt || 0) - (b.startedAt || 0))
      .slice(-40);
  }

  private toJsonRecord(value: unknown): Record<string, unknown> | undefined {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return undefined;
    }

    return JSON.parse(JSON.stringify(value)) as Record<string, unknown>;
  }

  private async bumpTaskStatusForApproval(
    userId: string,
    taskId: string,
    timelineEntryId: string | undefined,
    timelineStatus: DesktopTimelineEntryDto['status'],
  ) {
    const entity = await this.taskRepo.findOne({ where: { userId, taskId } });
    if (!entity) return;

    if (timelineEntryId) {
      entity.timeline = (entity.timeline || []).map((entry: any) =>
        entry.id === timelineEntryId ? { ...entry, status: timelineStatus } : entry,
      );
    }

    if (timelineStatus === 'waiting-approval') {
      entity.status = DesktopTaskStatus.NEED_APPROVE as any;
    } else if (timelineStatus === 'running') {
      entity.status = DesktopTaskStatus.EXECUTING as any;
    } else if (timelineStatus === 'rejected') {
      entity.status = DesktopTaskStatus.FAILED as any;
    }

    await this.taskRepo.save(entity);
    emitDesktopSyncEvent(userId, 'desktop-sync:task', this.taskEntityToRecord(entity));
  }

  private formatApprovalMessage(approval: DesktopApproval) {
    const deviceLabel = (approval.context as any)?.workspaceHint || approval.deviceId;
    return `${approval.title} on ${deviceLabel}. ${approval.description.slice(0, 120)}`;
  }

  private sessionEntityToMeta(e: DesktopSession) {
    return {
      sessionId: e.sessionId,
      title: e.title,
      messageCount: e.messageCount,
      updatedAt: e.updatedAt?.getTime?.() ?? Date.now(),
      deviceId: e.deviceId,
      deviceType: e.deviceType,
    };
  }

  private taskEntityToRecord(e: DesktopTask) {
    return {
      taskId: e.taskId,
      deviceId: e.deviceId,
      sessionId: e.sessionId,
      title: e.title,
      summary: e.summary,
      status: e.status,
      startedAt: e.startedAt ? Number(e.startedAt) : undefined,
      finishedAt: e.finishedAt ? Number(e.finishedAt) : undefined,
      updatedAt: e.updatedAt?.toISOString?.() ?? new Date().toISOString(),
      timeline: e.timeline || [],
      context: e.context,
    };
  }

  private approvalEntityToRecord(e: DesktopApproval) {
    return {
      approvalId: e.id,
      deviceId: e.deviceId,
      taskId: e.taskId,
      timelineEntryId: e.timelineEntryId,
      title: e.title,
      description: e.description,
      riskLevel: e.riskLevel,
      sessionKey: e.sessionKey,
      status: e.status,
      requestedAt: e.createdAt?.toISOString?.() ?? new Date().toISOString(),
      respondedAt: e.respondedAt?.toISOString?.(),
      responseDeviceId: e.responseDeviceId,
      rememberForSession: e.rememberForSession,
      context: e.context,
      metadata: e.metadata,
    };
  }

  private commandEntityToRecord(e: DesktopCommand) {
    return {
      commandId: e.id,
      title: e.title,
      kind: e.kind,
      status: e.status,
      targetDeviceId: e.targetDeviceId,
      requesterDeviceId: e.requesterDeviceId,
      sessionId: e.sessionId,
      payload: e.payload,
      createdAt: e.createdAt?.toISOString?.() ?? new Date().toISOString(),
      updatedAt: e.updatedAt?.toISOString?.() ?? new Date().toISOString(),
      claimedAt: e.claimedAt?.toISOString?.(),
      claimedByDeviceId: e.claimedByDeviceId,
      completedAt: e.completedAt?.toISOString?.(),
      result: e.result,
      error: e.error,
    };
  }
}
