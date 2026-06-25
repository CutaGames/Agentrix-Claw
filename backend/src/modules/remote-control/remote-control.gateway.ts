/**
 * RemoteControlGateway — P-9 wave 10 cross-device control plane.
 *
 * Behavior:
 *   - Client connects to namespace `/remote-control` with JWT in handshake.auth.token.
 *   - Each socket joins room `user:<userId>` AND room `device:<deviceId>` so
 *     we can route messages by user OR by specific device.
 *   - On `remote-control:execute`:
 *       1. Verify the cross-device token issued by RemoteControlController.
 *       2. Confirm command is in whitelist; reject forbidden / unknown.
 *       3. Forward `remote-control:run` to `device:<targetDeviceId>` room.
 *       4. Originator awaits `remote-control:ack` (forwarded back via room).
 *
 * Spec: requirements.md R8.5-R8.11, design.md §Components/Core 4.
 */
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
import { CrossDeviceTokenService } from './cross-device-token.service';
import {
  REMOTE_CONTROL_EVENTS,
  REMOTE_CONTROL_FORBIDDEN,
  REMOTE_CONTROL_WHITELIST,
  type RemoteControlAckPayload,
  type RemoteControlExecutePayload,
  type RemoteControlNackPayload,
} from '../../../../shared/types/remote-control';

@WebSocketGateway({
  namespace: '/remote-control',
  cors: { origin: '*' },
})
export class RemoteControlGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer() server!: Server;

  private readonly logger = new Logger(RemoteControlGateway.name);
  private readonly meta = new Map<string, { userId: string; deviceId: string }>();

  constructor(
    private readonly tokens: CrossDeviceTokenService,
    private readonly jwt: JwtService,
    private readonly cfg: ConfigService,
  ) {}

  async handleConnection(socket: Socket) {
    try {
      const token =
        socket.handshake.auth?.token ||
        socket.handshake.query?.token?.toString() ||
        socket.handshake.headers?.authorization?.replace('Bearer ', '');
      const deviceId = (socket.handshake.auth?.deviceId
        || socket.handshake.query?.deviceId) as string | undefined;
      if (!token || !deviceId) {
        this.logger.warn(`Reject remote-control socket: missing token/deviceId`);
        socket.disconnect();
        return;
      }
      const claims = await this.jwt.verifyAsync(token, {
        secret: this.cfg.get<string>('JWT_SECRET'),
      });
      const userId = claims?.sub || claims?.id;
      if (!userId) {
        socket.disconnect();
        return;
      }
      this.meta.set(socket.id, { userId, deviceId });
      socket.join(`user:${userId}`);
      socket.join(`device:${deviceId}`);
      this.logger.log(`remote-control socket connected user=${userId} device=${deviceId}`);
    } catch (err) {
      this.logger.warn(`Reject remote-control socket: ${(err as Error).message}`);
      socket.disconnect();
    }
  }

  handleDisconnect(socket: Socket) {
    this.meta.delete(socket.id);
  }

  @SubscribeMessage(REMOTE_CONTROL_EVENTS.EXECUTE)
  async onExecute(
    @ConnectedSocket() socket: Socket,
    @MessageBody() body: RemoteControlExecutePayload,
  ): Promise<void> {
    const meta = this.meta.get(socket.id);
    if (!meta) {
      this.nack(socket, body?.requestId ?? '', 'invalid-token', 'no socket meta');
      return;
    }

    if (!body?.token || !body.targetDeviceId || !body.command || !body.requestId) {
      this.nack(socket, body?.requestId ?? '', 'invalid-token', 'missing required fields');
      return;
    }

    if ((REMOTE_CONTROL_FORBIDDEN as readonly string[]).includes(body.command)) {
      this.nack(socket, body.requestId, 'forbidden-command');
      return;
    }
    if (!(REMOTE_CONTROL_WHITELIST as readonly string[]).includes(body.command)) {
      this.nack(socket, body.requestId, 'command-not-allowed');
      return;
    }

    let claims;
    try {
      claims = await this.tokens.verify(body.token);
    } catch (err) {
      this.nack(socket, body.requestId, 'expired-token', (err as Error).message);
      return;
    }

    if (claims.userId !== meta.userId) {
      this.nack(socket, body.requestId, 'invalid-token', 'token user mismatch');
      return;
    }
    if (claims.targetDeviceId !== body.targetDeviceId) {
      this.nack(socket, body.requestId, 'invalid-token', 'token target mismatch');
      return;
    }
    if (claims.command !== body.command) {
      this.nack(socket, body.requestId, 'invalid-token', 'token command mismatch');
      return;
    }

    // Forward to target device room. If no device is in the room the
    // emit silently drops; we'd want to surface "target-not-online" but
    // socket.io rooms don't expose membership cheaply — leave as 5s
    // ack timeout enforcement on the client side.
    this.server.to(`device:${body.targetDeviceId}`).emit(REMOTE_CONTROL_EVENTS.RUN, {
      requestId: body.requestId,
      command: body.command,
      args: body.args ?? {},
      requestedBy: meta.userId,
      executeMode: body.executeMode ?? 'execute',
    });
    this.logger.log(
      `remote-control execute forwarded user=${meta.userId} from=${meta.deviceId} to=${body.targetDeviceId} cmd=${body.command} req=${body.requestId}`,
    );
  }

  @SubscribeMessage(REMOTE_CONTROL_EVENTS.ACK)
  async onAck(
    @ConnectedSocket() socket: Socket,
    @MessageBody() body: RemoteControlAckPayload,
  ): Promise<void> {
    const meta = this.meta.get(socket.id);
    if (!meta) return;
    // Forward ack back to all user-rooms so the originator (whichever
    // device sent the execute) receives it.
    this.server.to(`user:${meta.userId}`).emit(REMOTE_CONTROL_EVENTS.ACK, body);
  }

  private nack(socket: Socket, requestId: string, reason: RemoteControlNackPayload['reason'], details?: string): void {
    socket.emit(REMOTE_CONTROL_EVENTS.NACK, { requestId, reason, details } satisfies RemoteControlNackPayload);
  }
}
