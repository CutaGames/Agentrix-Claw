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
import { Logger, OnModuleInit } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';

import { ARCADE, type ArcadeJoinPayload, type PongInput, type PongState } from '../../../../shared/types/arcade';
import { PongRoomService } from './pong-room.service';

interface ArcadeSocket extends Socket {
  userId?: string;
  roomId?: string;
}

/**
 * ArcadeGateway — 权威实时对战网关(路径 A)。namespace `/arcade`,JWT 握手鉴权。
 *
 * 与 /aeon 的差异:本网关不广播客户端位置,而是把客户端**输入**喂给 PongRoomService 的
 * 权威 tick 循环,循环每 tick 回调本网关,把**逐 socket 的权威快照**下发(座位 you 不同)。
 */
@NestWebSocketGateway({
  namespace: ARCADE.NAMESPACE,
  cors: {
    origin: process.env.CORS_ORIGIN?.split(',') || ['http://localhost:3000'],
    credentials: true,
  },
})
export class ArcadeGateway implements OnGatewayConnection, OnGatewayDisconnect, OnModuleInit {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(ArcadeGateway.name);
  /** roomId -> Set<socketId>(逐 socket 下发权威快照用)。 */
  private readonly roomSockets = new Map<string, Set<string>>();

  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly pong: PongRoomService,
  ) {}

  onModuleInit() {
    // 注册广播器:每 tick 把房间内每个 socket 的权威快照分别下发。
    this.pong.setBroadcaster((roomId, stateFor) => {
      const ids = this.roomSockets.get(roomId);
      if (!ids) return;
      for (const sid of ids) {
        this.server.to(sid).emit(ARCADE.STATE, stateFor(sid) as PongState);
      }
    });
  }

  async handleConnection(client: ArcadeSocket) {
    try {
      const token =
        client.handshake.auth?.token ||
        client.handshake.query?.token?.toString() ||
        client.handshake.headers?.authorization?.replace('Bearer ', '');
      if (!token) { client.disconnect(); return; }
      const payload = await this.jwtService.verifyAsync(token, {
        secret: this.configService.get<string>('JWT_SECRET'),
      });
      client.userId = payload.sub || payload.id;
      if (!client.userId) client.disconnect();
    } catch (err: any) {
      this.logger.warn(`arcade socket ${client.id} auth failed: ${err.message}`);
      client.disconnect();
    }
  }

  handleDisconnect(client: ArcadeSocket) {
    if (client.roomId) {
      this.pong.leave(client.roomId, client.id);
      this.roomSockets.get(client.roomId)?.delete(client.id);
      if (this.roomSockets.get(client.roomId)?.size === 0) this.roomSockets.delete(client.roomId);
    }
  }

  @SubscribeMessage(ARCADE.JOIN)
  handleJoin(@ConnectedSocket() client: ArcadeSocket, @MessageBody() body: ArcadeJoinPayload) {
    if (!client.userId || !body?.roomId) return { ok: false };
    const roomId = body.roomId;
    client.roomId = roomId;
    let set = this.roomSockets.get(roomId);
    if (!set) { set = new Set(); this.roomSockets.set(roomId, set); }
    set.add(client.id);
    const side = this.pong.join(roomId, client.id, (body.displayName || '玩家').slice(0, 24));
    return { ok: true, side };
  }

  @SubscribeMessage(ARCADE.INPUT)
  handleInput(@ConnectedSocket() client: ArcadeSocket, @MessageBody() body: PongInput) {
    if (!client.roomId) return;
    const dir = body?.dir === -1 || body?.dir === 1 ? body.dir : 0;
    this.pong.setInput(client.roomId, client.id, dir);
  }

  @SubscribeMessage('arcade:restart')
  handleRestart(@ConnectedSocket() client: ArcadeSocket) {
    if (client.roomId) this.pong.restart(client.roomId);
  }

  @SubscribeMessage(ARCADE.LEAVE)
  handleLeave(@ConnectedSocket() client: ArcadeSocket) {
    if (client.roomId) {
      this.pong.leave(client.roomId, client.id);
      this.roomSockets.get(client.roomId)?.delete(client.id);
      client.roomId = undefined;
    }
    return { ok: true };
  }
}
