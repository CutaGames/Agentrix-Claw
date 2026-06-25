import {
  WebSocketGateway as NestWebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { DesktopSyncService } from '../desktop-sync/desktop-sync.service';
import { desktopSyncEventBus, DESKTOP_SYNC_EVENT, type DesktopSyncEventEnvelope } from '../desktop-sync/desktop-sync.events';
import { agentSyncEventBus, AGENT_SYNC_EVENT, type AgentSyncEventEnvelope } from '../agent-intelligence/agent-sync.events';
import { DesktopSessionDeviceType } from '../desktop-sync/dto/desktop-sync.dto';

interface AuthenticatedSocket extends Socket {
  userId?: string;
  desktopDeviceId?: string;
  deviceType?: string;
  devicePlatform?: string;
}

@NestWebSocketGateway({
  cors: {
    origin: process.env.CORS_ORIGIN?.split(',') || ['http://localhost:3000'],
    credentials: true,
  },
  namespace: '/ws',
})
export class WebSocketGateway implements OnGatewayConnection, OnGatewayDisconnect, OnModuleInit, OnModuleDestroy {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(WebSocketGateway.name);
  private connectedClients = new Map<string, Set<string>>(); // userId -> Set of socketIds
  private readonly desktopSyncListener = (envelope: DesktopSyncEventEnvelope) => {
    this.sendDesktopSyncEvent(envelope.userId, envelope.event, envelope.payload);
  };
  private readonly agentSyncListener = (envelope: AgentSyncEventEnvelope) => {
    this.sendAgentSyncEvent(envelope.userId, envelope.event, envelope.sessionId, envelope.payload, envelope.sourceDeviceId);
  };

  constructor(
    private jwtService: JwtService,
    private configService: ConfigService,
    private readonly desktopSyncService: DesktopSyncService,
  ) {}

  onModuleInit() {
    desktopSyncEventBus.on(DESKTOP_SYNC_EVENT, this.desktopSyncListener);
    agentSyncEventBus.on(AGENT_SYNC_EVENT, this.agentSyncListener);
  }

  onModuleDestroy() {
    desktopSyncEventBus.off(DESKTOP_SYNC_EVENT, this.desktopSyncListener);
    agentSyncEventBus.off(AGENT_SYNC_EVENT, this.agentSyncListener);
  }

  async handleConnection(client: AuthenticatedSocket) {
    try {
      // 从查询参数或认证头获取 token
      const token =
        client.handshake.auth?.token ||
        client.handshake.query?.token?.toString() ||
        client.handshake.headers?.authorization?.replace('Bearer ', '');

      if (!token) {
        this.logger.warn(`客户端 ${client.id} 连接失败: 缺少认证token`);
        client.disconnect();
        return;
      }

      // 验证 JWT token
      const payload = await this.jwtService.verifyAsync(token, {
        secret: this.configService.get<string>('JWT_SECRET'),
      });

      client.userId = payload.sub || payload.id;
      this.logger.log(`客户端 ${client.id} 已连接，用户ID: ${client.userId}`);

      // 将客户端添加到用户房间
      if (client.userId) {
        client.join(`user:${client.userId}`);
        if (!this.connectedClients.has(client.userId)) {
          this.connectedClients.set(client.userId, new Set());
        }
        this.connectedClients.get(client.userId)!.add(client.id);
      }
    } catch (error) {
      this.logger.error(`客户端 ${client.id} 认证失败: ${error.message}`);
      client.disconnect();
    }
  }

  handleDisconnect(client: AuthenticatedSocket) {
    if (client.userId) {
      const userClients = this.connectedClients.get(client.userId);
      if (userClients) {
        userClients.delete(client.id);
        if (userClients.size === 0) {
          this.connectedClients.delete(client.userId);
        }
      }
    }
    this.logger.log(`客户端 ${client.id} 已断开连接`);
  }

  sendPaymentStatusUpdate(userId: string, paymentId: string, status: string, transactionHash?: string) {
    this.server.to(`user:${userId}`).emit('payment:status', {
      paymentId,
      status,
      transactionHash,
      timestamp: new Date().toISOString(),
    });
    this.logger.log(`发送支付状态更新给用户 ${userId}: ${paymentId} -> ${status}`);
  }

  sendNotification(userId: string, notification: any) {
    this.server.to(`user:${userId}`).emit('notification:new', notification);
    this.logger.log(`发送通知给用户 ${userId}: ${notification.title}`);
  }

  sendUnreadCountUpdate(userId: string, count: number) {
    this.server.to(`user:${userId}`).emit('notification:unread-count', { count });
  }

  sendDesktopSyncEvent(userId: string, event: string, payload: unknown) {
    this.server.to(`user:${userId}`).emit(event, payload);
  }

  sendAgentSyncEvent(userId: string, event: string, sessionId: string, payload: unknown, sourceDeviceId?: string) {
    this.server.to(`user:${userId}`).emit(event, { sessionId, payload, sourceDeviceId, timestamp: Date.now() });
  }

  @SubscribeMessage('payment:subscribe')
  handlePaymentSubscribe(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { paymentId: string },
  ) {
    if (!client.userId) {
      return { error: '未认证' };
    }

    client.join(`payment:${data.paymentId}`);
    this.logger.log(`用户 ${client.userId} 订阅支付 ${data.paymentId}`);

    return { success: true, paymentId: data.paymentId };
  }

  @SubscribeMessage('payment:unsubscribe')
  handlePaymentUnsubscribe(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { paymentId: string },
  ) {
    client.leave(`payment:${data.paymentId}`);
    return { success: true };
  }

  @SubscribeMessage('ping')
  handlePing(@ConnectedSocket() client: AuthenticatedSocket) {
    return { pong: Date.now() };
  }

  @SubscribeMessage('device:announce')
  handleDeviceAnnounce(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { deviceId?: string; deviceType?: string; platform?: string },
  ) {
    if (!client.userId) {
      return { error: '未认证' };
    }

    if (data?.deviceId) {
      client.desktopDeviceId = data.deviceId;
      client.deviceType = data.deviceType;
      client.devicePlatform = data.platform;
      client.join(`user:${client.userId}:device:${data.deviceId}`);
    }

    return { ok: true };
  }

  @SubscribeMessage('device:list')
  handleDeviceList(@ConnectedSocket() client: AuthenticatedSocket) {
    if (!client.userId) {
      return { error: '未认证' };
    }
    const userRoom = `user:${client.userId}`;
    const sockets = this.server.of('/ws').adapter;
    const devices: Array<{ deviceId: string; deviceType: string; platform: string }> = [];

    // Iterate all connected sockets for this user
    const userSocketIds = this.connectedClients.get(client.userId);
    if (userSocketIds) {
      for (const sid of userSocketIds) {
        const s = this.server.of('/ws').sockets.get(sid) as AuthenticatedSocket | undefined;
        if (s && s.desktopDeviceId && s.id !== client.id) {
          devices.push({
            deviceId: s.desktopDeviceId,
            deviceType: s.deviceType || 'desktop',
            platform: s.devicePlatform || 'unknown',
          });
        }
      }
    }
    return { devices };
  }

  @SubscribeMessage('session:sync')
  handleSessionSync(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody()
    data: {
      sessionId?: string;
      messages?: Array<Record<string, unknown>>;
      meta?: {
        title?: string;
        updatedAt?: number;
        deviceId?: string;
        deviceType?: DesktopSessionDeviceType;
      };
    },
  ): any {
    if (!client.userId || !data?.sessionId) {
      return { error: 'Invalid session payload' };
    }

    return this.desktopSyncService.upsertSession(client.userId, {
      deviceId: data.meta?.deviceId || client.desktopDeviceId || client.id,
      deviceType: data.meta?.deviceType || DesktopSessionDeviceType.DESKTOP,
      sessionId: data.sessionId,
      title: data.meta?.title || 'Synced Session',
      updatedAt: data.meta?.updatedAt || Date.now(),
      messages: (data.messages || []) as any,
    });
  }

  @SubscribeMessage('session:list')
  async handleSessionList(@ConnectedSocket() client: AuthenticatedSocket) {
    if (!client.userId) {
      return { error: '未认证' };
    }

    const sessions = await this.desktopSyncService.listSessions(client.userId);
    client.emit('session:list:res', {
      sessions,
    });
    return { ok: true };
  }

  /** Push streaming chat chunk to client (called from proxy service) */
  sendChatChunk(userId: string, instanceId: string, chunk: string, done: boolean) {
    this.server.to(`user:${userId}`).emit('chat:chunk', { instanceId, chunk, done });
  }
}
