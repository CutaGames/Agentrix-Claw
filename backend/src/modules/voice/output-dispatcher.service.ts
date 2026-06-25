import { Injectable, Logger } from '@nestjs/common';
import { Server } from 'socket.io';
import { SessionFabricService } from './session-fabric.service';
import type { DeviceSession, FabricDeviceType } from '../../entities/device-session.entity';

/**
 * OutputDispatcherService — Routes agent output to the right device(s).
 *
 * Rules:
 *   - Voice audio → devices with hasSpeaker (primary first, then glass/phone)
 *   - Detailed text/charts → devices with hasScreen + screenSize >= 'medium'
 *   - Quick approval → watch or phone
 *   - Deep-think status → all devices
 *   - Error/important → all devices
 *
 * The dispatcher receives a server (Socket.IO) reference and emits to
 * specific socket IDs rather than broadcasting to the whole user room.
 */

export type OutputKind =
  | 'voice_audio'     // TTS audio chunk → speaker devices
  | 'agent_text'      // Streaming text → screen devices
  | 'agent_end'       // Response complete → all
  | 'deep_think_status' // Deep-think start/progress/done → all
  | 'approval_request'  // Payment/action approval → watch + phone
  | 'detailed_content'  // Charts/reports/long text → large-screen devices
  | 'notification'      // Short notification → all
  | 'error';            // Error → all

export interface DispatchPayload {
  sessionId: string;
  event: string;
  data: Record<string, any>;
  kind: OutputKind;
}

@Injectable()
export class OutputDispatcherService {
  private readonly logger = new Logger(OutputDispatcherService.name);
  private server: Server | null = null;

  constructor(private readonly fabric: SessionFabricService) {}

  /** Set the Socket.IO server reference (called once from gateway onModuleInit) */
  setServer(server: Server): void {
    this.server = server;
  }

  /**
   * Dispatch an output to the appropriate device(s) in the session.
   */
  async dispatch(payload: DispatchPayload): Promise<void> {
    if (!this.server) {
      this.logger.warn('OutputDispatcher: no server reference set');
      return;
    }

    const devices = await this.fabric.getSessionDevices(payload.sessionId);
    if (devices.length === 0) return;

    const targets = this.selectTargets(devices, payload.kind);
    if (targets.length === 0) return;

    for (const device of targets) {
      if (!device.socketId) continue;
      this.server.to(device.socketId).emit(payload.event, payload.data);
    }
  }

  /**
   * Broadcast to ALL devices in a session (errors, notifications, session-end).
   */
  async broadcast(sessionId: string, event: string, data: Record<string, any>): Promise<void> {
    if (!this.server) return;

    const devices = await this.fabric.getSessionDevices(sessionId);
    for (const device of devices) {
      if (!device.socketId) continue;
      this.server.to(device.socketId).emit(event, data);
    }
  }

  /**
   * Emit only to the primary device (e.g., interim STT for subtitle on glass).
   */
  async emitToPrimary(sessionId: string, event: string, data: Record<string, any>): Promise<void> {
    if (!this.server) return;

    const primary = await this.fabric.getPrimaryDevice(sessionId);
    if (primary?.socketId) {
      this.server.to(primary.socketId).emit(event, data);
    }
  }

  /**
   * Emit to devices with a specific capability.
   */
  async emitToCapable(
    sessionId: string,
    event: string,
    data: Record<string, any>,
    filter: (d: DeviceSession) => boolean,
  ): Promise<void> {
    if (!this.server) return;

    const devices = await this.fabric.getSessionDevices(sessionId);
    for (const device of devices) {
      if (device.socketId && filter(device)) {
        this.server.to(device.socketId).emit(event, data);
      }
    }
  }

  // ── Target selection logic ──────────────────────────────

  private selectTargets(devices: DeviceSession[], kind: OutputKind): DeviceSession[] {
    switch (kind) {
      case 'voice_audio':
        // Audio → devices with speaker, prefer primary
        return this.filterByCap(devices, (d) => d.capabilities.hasSpeaker);

      case 'agent_text':
        // Streaming text → devices with screens
        return this.filterByCap(devices, (d) => d.capabilities.hasScreen);

      case 'detailed_content':
        // Reports/charts → large-screen devices only
        return this.filterByCap(
          devices,
          (d) => d.capabilities.hasScreen && (d.capabilities.screenSize === 'large' || d.capabilities.screenSize === 'medium'),
        );

      case 'approval_request':
        // Approvals → phone first (secure MPC), then watch (quick tap)
        return this.sortedByType(
          this.filterByCap(devices, (d) => d.capabilities.hasScreen),
          ['phone', 'watch', 'desktop', 'web'],
        );

      case 'deep_think_status':
      case 'notification':
      case 'agent_end':
      case 'error':
        // Broadcast to all connected devices
        return devices;

      default:
        return devices;
    }
  }

  private filterByCap(
    devices: DeviceSession[],
    predicate: (d: DeviceSession) => boolean,
  ): DeviceSession[] {
    const filtered = devices.filter(predicate);
    // If no device matches, fall back to all (graceful degradation)
    return filtered.length > 0 ? filtered : devices;
  }

  private sortedByType(devices: DeviceSession[], priority: FabricDeviceType[]): DeviceSession[] {
    return [...devices].sort((a, b) => {
      const ia = priority.indexOf(a.deviceType);
      const ib = priority.indexOf(b.deviceType);
      return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
    });
  }
}
