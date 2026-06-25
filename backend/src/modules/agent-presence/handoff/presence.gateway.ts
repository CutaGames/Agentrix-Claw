import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  ConnectedSocket,
  MessageBody,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { Server, Socket } from 'socket.io';
import { SessionHandoffService } from './session-handoff.service';
import { desktopSyncEventBus, DESKTOP_SYNC_EVENT } from '../../desktop-sync/desktop-sync.events';

/**
 * PresenceGateway — WebSocket gateway for real-time cross-device sync.
 *
 * Clients connect with JWT auth and join a room keyed by userId.
 * All presence events (device heartbeat, handoff requests, timeline updates)
 * are broadcast to the user's room so every connected device receives them.
 */
@WebSocketGateway({
  namespace: '/presence',
  cors: { origin: '*' },
})
export class PresenceGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(PresenceGateway.name);
  // Map<socketId, { userId, deviceId }>
  private readonly socketMeta = new Map<string, { userId: string; deviceId: string }>();

  constructor(
    private readonly handoffService: SessionHandoffService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  afterInit() {
    // Listen to the internal event bus and forward to WebSocket rooms
    desktopSyncEventBus.on(DESKTOP_SYNC_EVENT, (data: { userId: string; event: string; payload: unknown }) => {
      // Forward presence-related events to the user's room
      if (
        data.event.startsWith('presence:') ||
        data.event.startsWith('handoff:') ||
        data.event.startsWith('device:')
      ) {
        this.server?.to(`user:${data.userId}`)?.emit(data.event, data.payload);
      }
    });

    this.logger.log('PresenceGateway initialized, listening to event bus');
  }

  async handleConnection(socket: Socket) {
    try {
      // Extract auth from handshake
      const token =
        socket.handshake.auth?.token ||
        socket.handshake.query?.token?.toString() ||
        socket.handshake.headers?.authorization?.replace('Bearer ', '');
      const deviceId = socket.handshake.auth?.deviceId || socket.handshake.query?.deviceId;
      const deviceType = socket.handshake.auth?.deviceType || socket.handshake.query?.deviceType || 'unknown';

      if (!token) {
        this.logger.warn(`Presence socket rejected: missing auth token`);
        socket.disconnect();
        return;
      }

      if (!deviceId) {
        this.logger.warn(`Presence socket rejected: missing deviceId`);
        socket.disconnect();
        return;
      }

      // Verify JWT and extract userId
      const jwtPayload = await this.jwtService.verifyAsync(token, {
        secret: this.configService.get<string>('JWT_SECRET'),
      });
      const userId = jwtPayload.sub || jwtPayload.id;

      if (!userId) {
        this.logger.warn(`Presence socket rejected: JWT has no user id`);
        socket.disconnect();
        return;
      }

      // Store metadata
      this.socketMeta.set(socket.id, { userId: String(userId), deviceId: String(deviceId) });

      // Join user room
      socket.join(`user:${userId}`);

      // Register device heartbeat
      await this.handoffService.deviceHeartbeat(String(userId), {
        deviceId: String(deviceId),
        deviceType: String(deviceType),
        deviceName: socket.handshake.auth?.deviceName,
        platform: socket.handshake.auth?.platform,
        appVersion: socket.handshake.auth?.appVersion,
        capabilities: socket.handshake.auth?.capabilities,
      });

      this.logger.log(`Device connected: ${deviceId} (${deviceType}) for user ${userId}`);
    } catch (err: any) {
      this.logger.error(`Presence connection error: ${err.message}`);
      socket.disconnect();
    }
  }

  async handleDisconnect(socket: Socket) {
    const meta = this.socketMeta.get(socket.id);
    if (meta) {
      try {
        await this.handoffService.deviceDisconnect(meta.userId, meta.deviceId);
      } catch {
        // ignore
      }
      this.socketMeta.delete(socket.id);
      this.logger.log(`Device disconnected: ${meta.deviceId} for user ${meta.userId}`);
    }
  }

  @SubscribeMessage('heartbeat')
  async handleHeartbeat(
    @ConnectedSocket() socket: Socket,
    @MessageBody() payload: any,
  ) {
    const meta = this.socketMeta.get(socket.id);
    if (!meta) return;

    await this.handoffService.deviceHeartbeat(meta.userId, {
      deviceId: meta.deviceId,
      deviceType: payload?.deviceType || 'unknown',
      deviceName: payload?.deviceName,
      platform: payload?.platform,
      appVersion: payload?.appVersion,
      capabilities: payload?.capabilities,
    });
  }

  @SubscribeMessage('handoff:initiate')
  async handleHandoffInitiate(
    @ConnectedSocket() socket: Socket,
    @MessageBody() payload: any,
  ) {
    const meta = this.socketMeta.get(socket.id);
    if (!meta) return;

    const handoff = await this.handoffService.initiateHandoff(meta.userId, {
      agentId: payload.agentId,
      sessionId: payload.sessionId,
      sourceDeviceId: meta.deviceId,
      sourceDeviceType: payload.sourceDeviceType,
      targetDeviceId: payload.targetDeviceId,
      targetDeviceType: payload.targetDeviceType,
      contextSnapshot: payload.contextSnapshot,
    });

    socket.emit('handoff:initiated', { handoffId: handoff.id });
  }

  @SubscribeMessage('handoff:accept')
  async handleHandoffAccept(
    @ConnectedSocket() socket: Socket,
    @MessageBody() payload: { handoffId: string },
  ) {
    const meta = this.socketMeta.get(socket.id);
    if (!meta) return;

    try {
      const handoff = await this.handoffService.acceptHandoff(
        meta.userId,
        payload.handoffId,
        meta.deviceId,
      );
      socket.emit('handoff:accept_ok', {
        handoffId: handoff.id,
        contextSnapshot: handoff.contextSnapshot,
      });
    } catch (err: any) {
      socket.emit('handoff:accept_error', { error: err.message });
    }
  }

  @SubscribeMessage('handoff:reject')
  async handleHandoffReject(
    @ConnectedSocket() socket: Socket,
    @MessageBody() payload: { handoffId: string },
  ) {
    const meta = this.socketMeta.get(socket.id);
    if (!meta) return;

    try {
      await this.handoffService.rejectHandoff(meta.userId, payload.handoffId);
    } catch {
      // ignore
    }
  }
}
