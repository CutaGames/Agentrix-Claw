import { Injectable, Logger } from '@nestjs/common';
import { DesktopSyncService } from '../desktop-sync/desktop-sync.service';

/**
 * Tier Router — decides whether a compute-heavy task goes to:
 *   1. user's own desktop sidecar (ComfyUI / TripoSR / llama.cpp)
 *   2. cloud provider (Meshy / Hunyuan3D / Fal / HuggingFace)
 *   3. declined (Free tier with no desktop)
 *
 * Per docs/DESKTOP_AUDIT_AND_REFACTOR_PLAN_2026-05 D-MESH Phase 1.
 *
 * Phase 1 scope (this file): decision only — the actual "desktop runs it"
 * path lands in Phase 2 (sidecar + capability registry + push channel).
 * For Phase 1 we write the decision into task metadata so the UI can show
 * "routed to [your Alienware 4090]" even while cloud is still the real
 * executor.
 */
export type ExecutionPreference = 'auto' | 'cloud' | 'desktop' | 'local';
export type ExecutionTarget = 'cloud' | 'desktop' | 'declined';

export interface DeviceCapability {
  deviceId: string;
  deviceName: string;
  isOnline: boolean;
  lastSeenAt: string;
  gpu?: string | null;
  /** Capability flags the desktop reported. */
  petGenReady?: boolean;
  videoGenReady?: boolean;
  localLlmReady?: boolean;
}

export interface RoutingDecision {
  target: ExecutionTarget;
  deviceId: string | null;
  deviceName: string | null;
  reason: string;
  fallbackAfterMs?: number;
}

@Injectable()
export class TierRouterService {
  private readonly logger = new Logger(TierRouterService.name);

  constructor(private readonly desktopSync: DesktopSyncService) {}

  /**
   * Route a task to the best available execution target.
   *
   * @param userId       JWT-authenticated user
   * @param preference   User's explicit preference (auto / cloud / desktop)
   * @param requires     Which capability the task needs ('pet_gen' | 'video_gen' | 'llm')
   */
  async route(
    userId: string,
    preference: ExecutionPreference,
    requires: 'pet_gen' | 'video_gen' | 'llm',
  ): Promise<RoutingDecision> {
    // Explicit 'cloud' always goes to cloud
    if (preference === 'cloud') {
      return {
        target: 'cloud',
        deviceId: null,
        deviceName: null,
        reason: 'user_preference_cloud',
      };
    }

    // Fetch online desktop devices
    let devices: DeviceCapability[] = [];
    try {
      const online = await this.desktopSync.listOnlineDevices(userId);
      devices = (online || []).map((d: any) => ({
        deviceId: d.deviceId,
        deviceName: d.deviceName ?? d.deviceId,
        isOnline: Boolean(d.isOnline),
        lastSeenAt: d.lastSeenAt ?? new Date().toISOString(),
        gpu: d?.capabilities?.gpu ?? null,
        petGenReady: Boolean(d?.capabilities?.pet_gen_ready),
        videoGenReady: Boolean(d?.capabilities?.video_gen_ready),
        localLlmReady: Boolean(d?.capabilities?.local_llm_ready),
      }));
    } catch (e: any) {
      this.logger.warn(`listOnlineDevices failed for ${userId}: ${e?.message}`);
    }

    // Filter to desktops that can handle this capability
    const capable = devices.filter((d) => {
      if (!d.isOnline) return false;
      if (requires === 'pet_gen') return d.petGenReady === true;
      if (requires === 'video_gen') return d.videoGenReady === true;
      if (requires === 'llm') return d.localLlmReady === true;
      return false;
    });

    // Explicit 'desktop' / 'local' fails if no capable desktop
    if (preference === 'desktop' || preference === 'local') {
      if (capable.length === 0) {
        return {
          target: 'cloud',
          deviceId: null,
          deviceName: null,
          reason: 'no_capable_desktop_online_fallback_cloud',
        };
      }
      const best = capable[0];
      return {
        target: 'desktop',
        deviceId: best.deviceId,
        deviceName: best.deviceName,
        reason: 'user_preference_desktop',
        fallbackAfterMs: 120_000,
      };
    }

    // preference === 'auto': prefer desktop if available, else cloud
    if (capable.length > 0) {
      const best = capable[0];
      return {
        target: 'desktop',
        deviceId: best.deviceId,
        deviceName: best.deviceName,
        reason: 'auto_routed_to_desktop',
        fallbackAfterMs: 120_000,
      };
    }

    return {
      target: 'cloud',
      deviceId: null,
      deviceName: null,
      reason: 'auto_no_desktop_available',
    };
  }

  /**
   * Public helper for clients to check what devices are available for
   * compute before they submit. Used by mobile PetCreator's "🖥 Desktop
   * compute" toggle to show "you have [Alienware 4090] online".
   */
  async listCapableDevices(
    userId: string,
    requires: 'pet_gen' | 'video_gen' | 'llm',
  ): Promise<DeviceCapability[]> {
    try {
      const online = await this.desktopSync.listOnlineDevices(userId);
      return (online || [])
        .map((d: any) => ({
          deviceId: d.deviceId,
          deviceName: d.deviceName ?? d.deviceId,
          isOnline: Boolean(d.isOnline),
          lastSeenAt: d.lastSeenAt ?? new Date().toISOString(),
          gpu: d?.capabilities?.gpu ?? null,
          petGenReady: Boolean(d?.capabilities?.pet_gen_ready),
          videoGenReady: Boolean(d?.capabilities?.video_gen_ready),
          localLlmReady: Boolean(d?.capabilities?.local_llm_ready),
        }))
        .filter((d) => {
          if (!d.isOnline) return false;
          if (requires === 'pet_gen') return d.petGenReady;
          if (requires === 'video_gen') return d.videoGenReady;
          if (requires === 'llm') return d.localLlmReady;
          return false;
        });
    } catch {
      return [];
    }
  }
}
