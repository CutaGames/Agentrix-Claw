import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan } from 'typeorm';
import { Cron, CronExpression } from '@nestjs/schedule';
import { SessionHandoff, HandoffStatus } from '../../../entities/session-handoff.entity';
import { DevicePresence } from '../../../entities/device-presence.entity';
import { emitDesktopSyncEvent } from '../../desktop-sync/desktop-sync.events';

export interface InitiateHandoffDto {
  agentId: string;
  sessionId?: string;
  sourceDeviceId: string;
  sourceDeviceType?: string;
  targetDeviceId?: string;
  targetDeviceType?: string;
  contextSnapshot?: SessionHandoff['contextSnapshot'];
}

export interface DeviceHeartbeatDto {
  deviceId: string;
  deviceType: string;
  deviceName?: string;
  platform?: string;
  appVersion?: string;
  capabilities?: string[];
}

@Injectable()
export class SessionHandoffService {
  private readonly logger = new Logger(SessionHandoffService.name);

  constructor(
    @InjectRepository(SessionHandoff)
    private readonly handoffRepo: Repository<SessionHandoff>,
    @InjectRepository(DevicePresence)
    private readonly deviceRepo: Repository<DevicePresence>,
  ) {}

  // ── Session Handoff ─────────────────────────────────────────────────────

  async initiateHandoff(userId: string, dto: InitiateHandoffDto): Promise<SessionHandoff> {
    const handoff = this.handoffRepo.create({
      userId,
      agentId: dto.agentId,
      sessionId: dto.sessionId,
      sourceDeviceId: dto.sourceDeviceId,
      sourceDeviceType: dto.sourceDeviceType,
      targetDeviceId: dto.targetDeviceId,
      targetDeviceType: dto.targetDeviceType,
      status: HandoffStatus.INITIATED,
      contextSnapshot: dto.contextSnapshot,
      expiresAt: new Date(Date.now() + 5 * 60 * 1000), // 5 min expiry
    });

    const saved = await this.handoffRepo.save(handoff);
    this.logger.log(
      `Handoff initiated: ${saved.id} from ${dto.sourceDeviceId} → ${dto.targetDeviceId ?? 'broadcast'}`,
    );

    // Broadcast to target device(s) via WebSocket
    this.broadcastHandoffRequest(userId, saved);

    return saved;
  }

  async acceptHandoff(userId: string, handoffId: string, deviceId: string): Promise<SessionHandoff> {
    const handoff = await this.handoffRepo.findOne({
      where: { id: handoffId, userId },
    });

    if (!handoff) {
      throw new NotFoundException('Handoff not found');
    }

    if (handoff.status !== HandoffStatus.INITIATED) {
      throw new BadRequestException(`Handoff already ${handoff.status}`);
    }

    if (handoff.expiresAt && handoff.expiresAt < new Date()) {
      await this.handoffRepo.update(handoffId, { status: HandoffStatus.EXPIRED });
      throw new BadRequestException('Handoff has expired');
    }

    handoff.status = HandoffStatus.ACCEPTED;
    handoff.acceptedAt = new Date();
    handoff.targetDeviceId = deviceId;
    const saved = await this.handoffRepo.save(handoff);

    // Notify source device
    this.broadcastToDevices(userId, 'handoff:accepted', {
      handoffId: saved.id,
      acceptedBy: deviceId,
      agentId: saved.agentId,
      sessionId: saved.sessionId,
    });

    this.logger.log(`Handoff ${handoffId} accepted by device ${deviceId}`);
    return saved;
  }

  async rejectHandoff(userId: string, handoffId: string): Promise<SessionHandoff> {
    const handoff = await this.handoffRepo.findOne({
      where: { id: handoffId, userId },
    });

    if (!handoff) {
      throw new NotFoundException('Handoff not found');
    }

    handoff.status = HandoffStatus.REJECTED;
    const saved = await this.handoffRepo.save(handoff);

    this.broadcastToDevices(userId, 'handoff:rejected', {
      handoffId: saved.id,
      agentId: saved.agentId,
    });

    return saved;
  }

  async completeHandoff(userId: string, handoffId: string): Promise<SessionHandoff> {
    const handoff = await this.handoffRepo.findOne({
      where: { id: handoffId, userId, status: HandoffStatus.ACCEPTED },
    });

    if (!handoff) {
      throw new NotFoundException('Accepted handoff not found');
    }

    handoff.status = HandoffStatus.COMPLETED;
    const saved = await this.handoffRepo.save(handoff);

    this.broadcastToDevices(userId, 'handoff:completed', {
      handoffId: saved.id,
      agentId: saved.agentId,
      sessionId: saved.sessionId,
    });

    return saved;
  }

  async getActiveHandoffs(userId: string): Promise<SessionHandoff[]> {
    return this.handoffRepo.find({
      where: { userId, status: HandoffStatus.INITIATED },
      order: { createdAt: 'DESC' },
    });
  }

  async getHandoffHistory(userId: string, limit = 20): Promise<SessionHandoff[]> {
    return this.handoffRepo.find({
      where: { userId },
      order: { createdAt: 'DESC' },
      take: limit,
    });
  }

  // ── Device Presence ─────────────────────────────────────────────────────

  async deviceHeartbeat(userId: string, dto: DeviceHeartbeatDto): Promise<DevicePresence> {
    let device = await this.deviceRepo.findOne({
      where: { userId, deviceId: dto.deviceId },
    });

    if (!device) {
      device = this.deviceRepo.create({
        userId,
        deviceId: dto.deviceId,
        deviceType: dto.deviceType,
        deviceName: dto.deviceName,
        platform: dto.platform,
        appVersion: dto.appVersion,
        capabilities: dto.capabilities ?? [],
        isOnline: true,
        lastSeenAt: new Date(),
      });
    } else {
      device.isOnline = true;
      device.lastSeenAt = new Date();
      if (dto.deviceName) device.deviceName = dto.deviceName;
      if (dto.platform) device.platform = dto.platform;
      if (dto.appVersion) device.appVersion = dto.appVersion;
      if (dto.capabilities) device.capabilities = dto.capabilities;
    }

    const saved = await this.deviceRepo.save(device);

    // Broadcast presence update
    this.broadcastToDevices(userId, 'device:heartbeat', {
      deviceId: saved.deviceId,
      deviceType: saved.deviceType,
      deviceName: saved.deviceName,
      isOnline: true,
      lastSeenAt: saved.lastSeenAt.toISOString(),
    });

    return saved;
  }

  async deviceDisconnect(userId: string, deviceId: string): Promise<void> {
    await this.deviceRepo.update(
      { userId, deviceId },
      { isOnline: false, lastSeenAt: new Date() },
    );

    this.broadcastToDevices(userId, 'device:offline', { deviceId });
  }

  async getOnlineDevices(userId: string): Promise<DevicePresence[]> {
    return this.deviceRepo.find({
      where: { userId, isOnline: true },
      order: { lastSeenAt: 'DESC' },
    });
  }

  async getAllDevices(userId: string): Promise<DevicePresence[]> {
    return this.deviceRepo.find({
      where: { userId },
      order: { lastSeenAt: 'DESC' },
    });
  }

  /**
   * Mark devices as offline if no heartbeat in the last N minutes.
   * Should be called by a cron job.
   */
  async cleanupStaleDevices(staleMinutes = 5): Promise<number> {
    const threshold = new Date(Date.now() - staleMinutes * 60 * 1000);
    const result = await this.deviceRepo.update(
      { isOnline: true, lastSeenAt: LessThan(threshold) },
      { isOnline: false },
    );
    return result.affected ?? 0;
  }

  // ── Private ─────────────────────────────────────────────────────────────

  private broadcastHandoffRequest(userId: string, handoff: SessionHandoff): void {
    this.broadcastToDevices(userId, 'handoff:request', {
      handoffId: handoff.id,
      agentId: handoff.agentId,
      sessionId: handoff.sessionId,
      sourceDeviceId: handoff.sourceDeviceId,
      sourceDeviceType: handoff.sourceDeviceType,
      targetDeviceId: handoff.targetDeviceId,
      targetDeviceType: handoff.targetDeviceType,
      contextSnapshot: handoff.contextSnapshot,
      expiresAt: handoff.expiresAt?.toISOString(),
    });
  }

  private broadcastToDevices(userId: string, event: string, payload: any): void {
    try {
      emitDesktopSyncEvent(userId, event, payload);
    } catch {
      // WebSocket not available — silently skip
    }
  }

  // ── Scheduled Cleanup ───────────────────────────────────────────────────

  @Cron(CronExpression.EVERY_5_MINUTES, { name: 'device-presence-cleanup' })
  async scheduledDeviceCleanup(): Promise<void> {
    const staleCount = await this.cleanupStaleDevices(5);
    if (staleCount > 0) {
      this.logger.log(`Marked ${staleCount} stale devices as offline`);
    }
  }

  @Cron(CronExpression.EVERY_HOUR, { name: 'handoff-expiry-cleanup' })
  async scheduledHandoffExpiry(): Promise<void> {
    const result = await this.handoffRepo.update(
      { status: HandoffStatus.INITIATED, expiresAt: LessThan(new Date()) },
      { status: HandoffStatus.EXPIRED },
    );
    if (result.affected && result.affected > 0) {
      this.logger.log(`Expired ${result.affected} stale handoff requests`);
    }
  }
}
