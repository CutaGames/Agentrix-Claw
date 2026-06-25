import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { OpenClawInstance } from '../../entities/openclaw-instance.entity';
import { RelayRegistry } from './telegram-bot.service';

/**
 * WebSocket Relay Gateway — allows local OpenClaw agents to connect and receive
 * Telegram (and future social platform) messages without needing a public IP.
 *
 * Protocol:
 *  1. Local agent WS-connects to wss://api.agentrix.top/relay
 *     with auth: { relayToken: "<token>", userId: "<userId>" }
 *  2. Gateway validates token, marks instance relayConnected=true
 *  3. When user sends a Telegram message, TelegramBotService calls
 *     RelayRegistry.emitToAgent() → gateway forwards to local agent socket
 *  4. Local agent processes message, sends back { key, reply } event
 *  5. Gateway calls RelayRegistry.resolveReply() → TelegramBotService sends reply to user
 */
@WebSocketGateway({ namespace: '/relay', cors: { origin: '*' } })
export class LocalRelayGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(LocalRelayGateway.name);

  // Map instanceId → socket id
  private agentSockets = new Map<string, string>();

  constructor(
    @InjectRepository(OpenClawInstance)
    private readonly instanceRepo: Repository<OpenClawInstance>,
  ) {
    // Wire RelayRegistry.emitToAgent to this gateway
    RelayRegistry.emitToAgent = (instanceId, payload) => {
      const socketId = this.agentSockets.get(instanceId);
      if (socketId) {
        this.server.to(socketId).emit('agent:message', payload);
      }
    };
  }

  async handleConnection(socket: Socket): Promise<void> {
    const { relayToken } = socket.handshake.auth as { relayToken?: string };
    if (!relayToken) {
      this.logger.warn(`Relay connection rejected — no relayToken`);
      socket.disconnect(true);
      return;
    }

    const instance = await this.instanceRepo.findOneBy({ relayToken });
    if (!instance) {
      this.logger.warn(`Relay connection rejected — unknown token: ${relayToken}`);
      socket.disconnect(true);
      return;
    }

    // Store mapping
    this.agentSockets.set(instance.id, socket.id);
    socket.data.instanceId = instance.id;

    // Mark online
    await this.instanceRepo.update(instance.id, { relayConnected: true });

    this.logger.log(`Local agent connected: instance=${instance.id} name="${instance.name}"`);

    // Notify APP that local agent is online (if it's polling)
    socket.emit('relay:ready', { instanceId: instance.id, name: instance.name });
  }

  async handleDisconnect(socket: Socket): Promise<void> {
    const instanceId = socket.data.instanceId as string | undefined;
    if (!instanceId) return;

    this.agentSockets.delete(instanceId);
    await this.instanceRepo.update(instanceId, { relayConnected: false });

    this.logger.log(`Local agent disconnected: instance=${instanceId}`);
  }

  /** Local agent sends AI reply back to platform */
  @SubscribeMessage('agent:reply')
  handleAgentReply(
    @ConnectedSocket() socket: Socket,
    @MessageBody() payload: { key: string; reply: string },
  ): void {
    RelayRegistry.resolveReply(payload.key, payload.reply);
  }

  /** Health ping from local agent */
  @SubscribeMessage('ping')
  handlePing(@ConnectedSocket() socket: Socket): void {
    socket.emit('pong', { ts: Date.now() });
  }

  /** Check if a local agent is currently connected */
  isAgentOnline(instanceId: string): boolean {
    return this.agentSockets.has(instanceId);
  }
}
