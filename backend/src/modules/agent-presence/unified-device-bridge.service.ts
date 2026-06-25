import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { UnifiedDeviceService } from './unified-device.service';
import {
  desktopSyncEventBus,
  DESKTOP_SYNC_EVENT,
  DesktopSyncEventEnvelope,
} from '../desktop-sync/desktop-sync.events';

/**
 * UnifiedDeviceBridge — Event-driven bridge that listens to desktop-sync
 * heartbeat events and propagates them into the agent-presence device registry.
 *
 * This avoids circular module imports by using the shared event bus.
 */
@Injectable()
export class UnifiedDeviceBridge implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(UnifiedDeviceBridge.name);
  private handler: (envelope: DesktopSyncEventEnvelope) => void;

  constructor(private readonly unifiedDevices: UnifiedDeviceService) {}

  onModuleInit() {
    this.handler = (envelope: DesktopSyncEventEnvelope) => {
      if (envelope.event !== 'desktop-sync:presence') return;

      const payload = envelope.payload as any;
      if (!payload?.deviceId || !envelope.userId) return;

      this.unifiedDevices
        .syncDesktopHeartbeat(
          envelope.userId,
          payload.deviceId,
          payload.platform ?? 'unknown',
          payload.appVersion,
        )
        .catch((err) =>
          this.logger.warn(`Bridge sync failed for device ${payload.deviceId}: ${err.message}`),
        );
    };

    desktopSyncEventBus.on(DESKTOP_SYNC_EVENT, this.handler);
    this.logger.log('Desktop-sync → agent-presence device bridge active');
  }

  onModuleDestroy() {
    if (this.handler) {
      desktopSyncEventBus.off(DESKTOP_SYNC_EVENT, this.handler);
    }
  }
}
