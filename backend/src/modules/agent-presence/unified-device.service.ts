import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DevicePresence } from '../../entities/device-presence.entity';
import { DesktopDevicePresence } from '../../entities/desktop-sync.entity';

/**
 * UnifiedDeviceService — Single source of truth for cross-device management.
 *
 * Aggregates devices from both:
 *   - agent-presence DevicePresence (mobile, web, wearable, IoT)
 *   - desktop-sync DesktopDevicePresence (desktop app)
 *
 * This avoids breaking either existing module while providing
 * a merged view for the web dashboard.
 */

export interface UnifiedDevice {
  id: string;
  deviceId: string;
  deviceType: string;
  deviceName?: string;
  platform?: string;
  appVersion?: string;
  lastSeenAt: string;
  isOnline: boolean;
  source: 'agent-presence' | 'desktop-sync';
  capabilities?: string[];
  context?: Record<string, any>;
}

const ONLINE_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes

@Injectable()
export class UnifiedDeviceService {
  private readonly logger = new Logger(UnifiedDeviceService.name);

  constructor(
    @InjectRepository(DevicePresence)
    private readonly presenceDeviceRepo: Repository<DevicePresence>,
    @InjectRepository(DesktopDevicePresence)
    private readonly desktopDeviceRepo: Repository<DesktopDevicePresence>,
  ) {}

  /**
   * Return a merged, deduplicated list of all devices for a user.
   * Devices with the same deviceId are merged, preferring the most recent heartbeat.
   */
  async getAllDevices(userId: string): Promise<UnifiedDevice[]> {
    const [presenceDevices, desktopDevices] = await Promise.all([
      this.presenceDeviceRepo.find({ where: { userId }, order: { lastSeenAt: 'DESC' } }),
      this.desktopDeviceRepo.find({ where: { userId }, order: { lastSeenAt: 'DESC' } }),
    ]);

    const deviceMap = new Map<string, UnifiedDevice>();

    // Index agent-presence devices first
    for (const d of presenceDevices) {
      deviceMap.set(d.deviceId, {
        id: d.id,
        deviceId: d.deviceId,
        deviceType: d.deviceType,
        deviceName: d.deviceName,
        platform: d.platform,
        appVersion: d.appVersion,
        lastSeenAt: d.lastSeenAt?.toISOString() ?? new Date().toISOString(),
        isOnline: d.isOnline,
        source: 'agent-presence',
        capabilities: d.capabilities,
        context: d.metadata,
      });
    }

    // Merge desktop-sync devices — if same deviceId exists, keep the more recent one
    for (const d of desktopDevices) {
      const lastSeen = d.lastSeenAt instanceof Date ? d.lastSeenAt : new Date(d.lastSeenAt);
      const isOnline = (Date.now() - lastSeen.getTime()) < ONLINE_THRESHOLD_MS;
      const lastSeenAt = lastSeen.toISOString();

      const existing = deviceMap.get(d.deviceId);
      if (existing) {
        // Keep whichever has the more recent heartbeat
        if (new Date(lastSeenAt) > new Date(existing.lastSeenAt)) {
          deviceMap.set(d.deviceId, {
            ...existing,
            lastSeenAt,
            isOnline: isOnline || existing.isOnline,
            appVersion: d.appVersion ?? existing.appVersion,
            platform: d.platform ?? existing.platform,
            context: d.context as Record<string, any> ?? existing.context,
            source: 'desktop-sync',
          });
        } else {
          // Merge online status — online in either system means online
          existing.isOnline = existing.isOnline || isOnline;
        }
      } else {
        deviceMap.set(d.deviceId, {
          id: d.id,
          deviceId: d.deviceId,
          deviceType: 'desktop',
          deviceName: d.platform ? `Desktop (${d.platform})` : 'Desktop',
          platform: d.platform,
          appVersion: d.appVersion,
          lastSeenAt,
          isOnline,
          source: 'desktop-sync',
          context: d.context as Record<string, any>,
        });
      }
    }

    // Sort: online first, then by lastSeenAt desc
    return Array.from(deviceMap.values()).sort((a, b) => {
      if (a.isOnline !== b.isOnline) return a.isOnline ? -1 : 1;
      return new Date(b.lastSeenAt).getTime() - new Date(a.lastSeenAt).getTime();
    });
  }

  /**
   * Return only online devices from both systems.
   */
  async getOnlineDevices(userId: string): Promise<UnifiedDevice[]> {
    const all = await this.getAllDevices(userId);
    return all.filter(d => d.isOnline);
  }

  /**
   * Get device stats summary.
   */
  async getDeviceStats(userId: string): Promise<{
    total: number;
    online: number;
    offline: number;
    byType: Record<string, number>;
    bySource: Record<string, number>;
  }> {
    const all = await this.getAllDevices(userId);
    const online = all.filter(d => d.isOnline);

    const byType: Record<string, number> = {};
    const bySource: Record<string, number> = {};
    for (const d of all) {
      byType[d.deviceType] = (byType[d.deviceType] ?? 0) + 1;
      bySource[d.source] = (bySource[d.source] ?? 0) + 1;
    }

    return {
      total: all.length,
      online: online.length,
      offline: all.length - online.length,
      byType,
      bySource,
    };
  }

  /**
   * Propagate a heartbeat from desktop-sync into agent-presence DevicePresence,
   * ensuring devices registered via desktop-sync also appear in the agent-presence registry.
   */
  async syncDesktopHeartbeat(
    userId: string,
    deviceId: string,
    platform: string,
    appVersion?: string,
  ): Promise<void> {
    try {
      let device = await this.presenceDeviceRepo.findOne({
        where: { userId, deviceId },
      });

      if (!device) {
        device = this.presenceDeviceRepo.create({
          userId,
          deviceId,
          deviceType: 'desktop',
          deviceName: `Desktop (${platform})`,
          platform,
          appVersion,
          isOnline: true,
          lastSeenAt: new Date(),
          capabilities: ['notification'],
        });
      } else {
        device.isOnline = true;
        device.lastSeenAt = new Date();
        if (appVersion) device.appVersion = appVersion;
        if (platform) device.platform = platform;
      }

      await this.presenceDeviceRepo.save(device);
    } catch (err: any) {
      this.logger.warn(`Failed to sync desktop heartbeat to agent-presence: ${err.message}`);
    }
  }
}
