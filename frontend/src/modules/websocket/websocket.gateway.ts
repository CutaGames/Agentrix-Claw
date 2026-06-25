// WebSocket Gateway - 需要安装 @nestjs/websockets 和 socket.io 依赖
// 暂时禁用此功能

/*
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
import { Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';

interface AuthenticatedSocket extends Socket {
  userId?: string;
}

@NestWebSocketGateway({
  cors: {
    origin: process.env.CORS_ORIGIN?.split(',') || ['http://localhost:3000'],
    credentials: true,
  },
  namespace: '/ws',
})
export class WebSocketGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(WebSocketGateway.name);
  private connectedClients = new Map<string, Set<string>>(); // userId -> Set of socketIds

  constructor(
    private jwtService: JwtService,
    private configService: ConfigService,
  ) {}

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
}
*/

// 临时占位类，避免编译错误
export class WebSocketGateway {
  // 占位实现
}
