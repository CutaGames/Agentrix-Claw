import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DeviceSession, type FabricDeviceType, type FabricScreenSize } from '../../entities/device-session.entity';

/**
 * SessionFabricService — Multi-device session binding & primary-device switching.
 *
 * Responsibilities:
 *   1. Register/unregister devices into an active session
 *   2. Elect and switch the primary input device
 *   3. Query all participating devices and their capabilities
 *   4. Auto-promote when primary device goes offline
 *
 * The Voice Gateway calls this service at session:start and disconnect.
 * The OutputDispatcher reads capability sets to decide where to route output.
 */

export interface DeviceCapabilities {
  hasCamera: boolean;
  hasMic: boolean;
  hasSpeaker: boolean;
  hasScreen: boolean;
  screenSize: FabricScreenSize;
  hasLocalModel: boolean;
}

const DEFAULT_CAPABILITIES: Record<FabricDeviceType, DeviceCapabilities> = {
  phone: { hasCamera: true, hasMic: true, hasSpeaker: true, hasScreen: true, screenSize: 'medium', hasLocalModel: false },
  desktop: { hasCamera: false, hasMic: true, hasSpeaker: true, hasScreen: true, screenSize: 'large', hasLocalModel: true },
  web: { hasCamera: false, hasMic: true, hasSpeaker: true, hasScreen: true, screenSize: 'large', hasLocalModel: false },
  glass: { hasCamera: true, hasMic: true, hasSpeaker: true, hasScreen: false, screenSize: 'none', hasLocalModel: false },
  watch: { hasCamera: false, hasMic: true, hasSpeaker: true, hasScreen: true, screenSize: 'small', hasLocalModel: false },
};

/** Priority for auto-promoting primary device (lower = preferred) */
const PRIMARY_PRIORITY: Record<FabricDeviceType, number> = {
  glass: 1,
  phone: 2,
  desktop: 3,
  web: 4,
  watch: 5,
};

@Injectable()
export class SessionFabricService {
  private readonly logger = new Logger(SessionFabricService.name);

  constructor(
    @InjectRepository(DeviceSession)
    private readonly deviceSessionRepo: Repository<DeviceSession>,
  ) {}

  /**
   * Register a device into a session. If no primary exists, auto-promote.
   */
  async joinSession(params: {
    userId: string;
    sessionId: string;
    deviceId: string;
    deviceType: FabricDeviceType;
    socketId: string;
    capabilities?: Partial<DeviceCapabilities>;
  }): Promise<DeviceSession> {
    const caps = {
      ...DEFAULT_CAPABILITIES[params.deviceType],
      ...(params.capabilities || {}),
    };

    // Upsert: device may rejoin after brief disconnect
    let ds = await this.deviceSessionRepo.findOne({
      where: { userId: params.userId, deviceId: params.deviceId },
    });

    if (ds) {
      ds.sessionId = params.sessionId;
      ds.deviceType = params.deviceType;
      ds.socketId = params.socketId;
      ds.capabilities = caps;
      ds.lastActiveAt = new Date();
    } else {
      ds = this.deviceSessionRepo.create({
        userId: params.userId,
        sessionId: params.sessionId,
        deviceId: params.deviceId,
        deviceType: params.deviceType,
        socketId: params.socketId,
        capabilities: caps,
        isPrimary: false,
        lastActiveAt: new Date(),
      });
    }

    ds = await this.deviceSessionRepo.save(ds);

    // Auto-elect primary if none exists
    const primaryExists = await this.deviceSessionRepo.count({
      where: { sessionId: params.sessionId, isPrimary: true },
    });
    if (!primaryExists) {
      await this.electPrimary(params.sessionId);
    }

    this.logger.debug(
      `Device ${params.deviceId} (${params.deviceType}) joined session ${params.sessionId}`,
    );
    return ds;
  }

  /**
   * Remove a device from the session fabric (disconnect / leave).
   * If the leaving device was primary, auto-promote next best.
   */
  async leaveSession(userId: string, deviceId: string): Promise<void> {
    const ds = await this.deviceSessionRepo.findOne({
      where: { userId, deviceId },
    });
    if (!ds) return;

    const wasPrimary = ds.isPrimary;
    const sessionId = ds.sessionId;

    await this.deviceSessionRepo.remove(ds);

    if (wasPrimary) {
      await this.electPrimary(sessionId);
    }

    this.logger.debug(`Device ${deviceId} left session ${sessionId} (wasPrimary=${wasPrimary})`);
  }

  /**
   * Explicitly switch primary to a specific device.
   */
  async switchPrimary(sessionId: string, targetDeviceId: string): Promise<boolean> {
    // Demote current primary
    await this.deviceSessionRepo.update(
      { sessionId, isPrimary: true },
      { isPrimary: false },
    );

    const result = await this.deviceSessionRepo.update(
      { sessionId, deviceId: targetDeviceId },
      { isPrimary: true, lastActiveAt: new Date() },
    );

    if (result.affected && result.affected > 0) {
      this.logger.log(`Primary switched to ${targetDeviceId} in session ${sessionId}`);
      return true;
    }

    // If target not found, re-elect
    await this.electPrimary(sessionId);
    return false;
  }

  /**
   * Get all devices in a session, ordered by primary first + priority.
   */
  async getSessionDevices(sessionId: string): Promise<DeviceSession[]> {
    return this.deviceSessionRepo.find({
      where: { sessionId },
      order: { isPrimary: 'DESC', lastActiveAt: 'DESC' },
    });
  }

  /**
   * Get the primary device for a session (if any).
   */
  async getPrimaryDevice(sessionId: string): Promise<DeviceSession | null> {
    return this.deviceSessionRepo.findOne({
      where: { sessionId, isPrimary: true },
    });
  }

  /**
   * Get all active session IDs for a user.
   */
  async getUserSessions(userId: string): Promise<string[]> {
    const rows = await this.deviceSessionRepo
      .createQueryBuilder('ds')
      .select('DISTINCT ds.session_id', 'sessionId')
      .where('ds.user_id = :userId', { userId })
      .getRawMany();
    return rows.map((r: { sessionId: string }) => r.sessionId);
  }

  /**
   * Update the socket ID for a device (reconnect scenario).
   */
  async updateSocketId(userId: string, deviceId: string, socketId: string): Promise<void> {
    await this.deviceSessionRepo.update(
      { userId, deviceId },
      { socketId, lastActiveAt: new Date() },
    );
  }

  /**
   * Touch last-active timestamp (heartbeat).
   */
  async heartbeat(userId: string, deviceId: string): Promise<void> {
    await this.deviceSessionRepo.update(
      { userId, deviceId },
      { lastActiveAt: new Date() },
    );
  }

  /**
   * Clean up stale device sessions (no heartbeat for > threshold).
   */
  async cleanupStale(thresholdMs = 5 * 60 * 1000): Promise<number> {
    const cutoff = new Date(Date.now() - thresholdMs);
    const result = await this.deviceSessionRepo
      .createQueryBuilder()
      .delete()
      .where('last_active_at < :cutoff', { cutoff })
      .execute();
    return result.affected || 0;
  }

  // ── Internal ────────────────────────────────────────────

  private async electPrimary(sessionId: string): Promise<void> {
    const devices = await this.deviceSessionRepo.find({
      where: { sessionId },
    });

    if (devices.length === 0) return;

    // Sort by priority (glass > phone > desktop > web > watch)
    devices.sort((a, b) => {
      const pa = PRIMARY_PRIORITY[a.deviceType] ?? 99;
      const pb = PRIMARY_PRIORITY[b.deviceType] ?? 99;
      if (pa !== pb) return pa - pb;
      // Tie-break by most recently active
      return new Date(b.lastActiveAt).getTime() - new Date(a.lastActiveAt).getTime();
    });

    const winner = devices[0];

    // Demote all, promote winner
    await this.deviceSessionRepo.update({ sessionId }, { isPrimary: false });
    await this.deviceSessionRepo.update({ id: winner.id }, { isPrimary: true });

    this.logger.log(
      `Auto-elected primary: ${winner.deviceId} (${winner.deviceType}) for session ${sessionId}`,
    );
  }
}
