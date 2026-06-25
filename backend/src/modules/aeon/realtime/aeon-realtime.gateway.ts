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
import { Logger, OnModuleInit, OnModuleDestroy, Optional, Inject, forwardRef } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import {
  AEON_SYNC,
  aeonRoomName,
  identityFromControl,
  type AeonClientEvent,
  type AeonServerEvent,
  type AeonJoinPayload,
  type AeonCharacterSnapshot,
} from '../../../../../shared/types/aeon-sync';
import { RoomPresenceService } from './room-presence.service';
import { StageService } from './stage.service';
import { CreationHostAgentService } from './creation-host-agent.service';

interface AeonSocket extends Socket {
  userId?: string;
  charId?: string;
  roomId?: string;
}

/**
 * AeonRealtimeGateway — Aeon `/aeon` 实时房间同步网关(Task 0.2,spike 版)。
 *
 * design.md §Architecture 实时同步层:
 *   - 复用现有网关 JWT 握手鉴权模式(参考 websocket.gateway.ts / presence.gateway.ts)
 *   - 服务器权威轻量版:客户端发"意图"(move/action/control/chat),服务器校验后广播
 *   - 房间 = Socket.IO room `aeon:room:<roomId>`
 *   - 断线:DISCONNECT_GRACE_MS 心跳超时 → 广播 char_leave;重连下发 room_state 全量对账
 *
 * Phase 0 目标:验证 20 并发下 p95 ≤ 300ms。多实例 fan-out 由 Redis adapter(Task 0.3)
 * 在 app 启动时注入到 server,本网关逻辑与单/多实例无关(广播走 socket.io room)。
 */
@NestWebSocketGateway({
  namespace: AEON_SYNC.NAMESPACE,
  cors: {
    origin: process.env.CORS_ORIGIN?.split(',') || ['http://localhost:3000'],
    credentials: true,
  },
})
export class AeonRealtimeGateway
  implements OnGatewayConnection, OnGatewayDisconnect, OnModuleInit, OnModuleDestroy
{
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(AeonRealtimeGateway.name);
  private staleSweepTimer: NodeJS.Timeout | null = null;

  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly presence: RoomPresenceService,
    private readonly stage: StageService,
    @Optional()
    @Inject(forwardRef(() => CreationHostAgentService))
    private readonly hostAgent?: CreationHostAgentService,
  ) {}

  onModuleInit() {
    // 周期扫描断线(超过宽限未心跳)→ 广播 char_leave 并清理。
    this.staleSweepTimer = setInterval(() => this.sweepStale(), AEON_SYNC.DISCONNECT_GRACE_MS);
  }

  onModuleDestroy() {
    if (this.staleSweepTimer) clearInterval(this.staleSweepTimer);
  }

  async handleConnection(client: AeonSocket) {
    try {
      const token =
        client.handshake.auth?.token ||
        client.handshake.query?.token?.toString() ||
        client.handshake.headers?.authorization?.replace('Bearer ', '');
      if (!token) {
        this.logger.warn(`aeon socket ${client.id} rejected: missing token`);
        client.disconnect();
        return;
      }
      const payload = await this.jwtService.verifyAsync(token, {
        secret: this.configService.get<string>('JWT_SECRET'),
      });
      client.userId = payload.sub || payload.id;
      if (!client.userId) {
        client.disconnect();
        return;
      }
    } catch (err: any) {
      this.logger.error(`aeon socket ${client.id} auth failed: ${err.message}`);
      client.disconnect();
    }
  }

  handleDisconnect(client: AeonSocket) {
    if (client.charId) {
      const charId = client.charId;
      const roomId = this.presence.remove(charId);
      if (roomId) {
        this.handleStageDeparture(roomId, charId);
        this.broadcast(roomId, { t: 'char_leave', charId, serverTs: Date.now() });
      }
    }
  }

  // ── 加入房间 ─────────────────────────────────────────────────────
  @SubscribeMessage(AEON_SYNC.JOIN)
  async handleJoin(
    @ConnectedSocket() client: AeonSocket,
    @MessageBody() body: AeonJoinPayload & { snapshot: AeonCharacterSnapshot },
  ) {
    if (!client.userId) return { ok: false, error: 'unauthorized' };
    const { roomId, snapshot } = body;
    if (!roomId || !snapshot?.charId) return { ok: false, error: 'invalid_payload' };

    // 服务器权威:身份徽章/isAgentDriven 由 controlState 重新派生,不信客户端传值(R3 铁律)。
    const identity = identityFromControl(snapshot.controlState, snapshot.badge === 'npc');
    const authSnap: AeonCharacterSnapshot = {
      ...snapshot,
      ownerUserId: client.userId,
      badge: identity.badge,
      isAgentDriven: identity.isAgentDriven,
    };

    // 舞台房间:进场分配角色(首个真人成 host,其余 audience),写入权威快照。
    if (this.stage.isStageRoom(roomId)) {
      authSnap.stageRole = this.stage.onEnter(roomId, authSnap.charId);
    }

    const accepted = this.presence.upsert(roomId, authSnap);
    if (!accepted) {
      return { ok: false, error: 'room_full', capacity: AEON_SYNC.ROOM_CAPACITY_MVP };
    }

    client.charId = authSnap.charId;
    client.roomId = roomId;
    client.join(aeonRoomName(roomId));

    // 下发全量快照给本人(进入即对账)
    client.emit(AEON_SYNC.SERVER_EVENT, {
      t: 'room_state',
      roomId,
      chars: this.presence.snapshot(roomId),
      serverTs: Date.now(),
    } satisfies AeonServerEvent);

    // 向房间其它人广播本人加入
    this.broadcastExcept(client, roomId, {
      t: 'char_upsert',
      char: authSnap,
      serverTs: Date.now(),
    });

    // 创作房间(livestream/stage):确保有 AI 主理人 agent 当主播(best-effort,不阻断进入)。
    if (this.hostAgent?.isCreationRoom(roomId)) {
      this.hostAgent.ensureHost(roomId).catch(() => undefined);
    }
    return { ok: true };
  }

  // ── 离开房间 ─────────────────────────────────────────────────────
  @SubscribeMessage(AEON_SYNC.LEAVE)
  handleLeave(@ConnectedSocket() client: AeonSocket) {
    if (!client.charId) return { ok: true };
    const charId = client.charId;
    const roomId = this.presence.remove(charId);
    if (roomId) {
      client.leave(aeonRoomName(roomId));
      this.handleStageDeparture(roomId, charId);
      this.broadcast(roomId, { t: 'char_leave', charId, serverTs: Date.now() });
    }
    client.charId = undefined;
    client.roomId = undefined;
    return { ok: true };
  }

  // ── 心跳 ────────────────────────────────────────────────────────
  @SubscribeMessage(AEON_SYNC.HEARTBEAT)
  handleHeartbeat(@ConnectedSocket() client: AeonSocket) {
    if (client.charId) this.presence.heartbeat(client.charId);
    return { ok: true, serverTs: Date.now() };
  }

  // ── 客户端意图(move/action/control/chat)──────────────────────────
  @SubscribeMessage(AEON_SYNC.CLIENT_EVENT)
  async handleClientEvent(
    @ConnectedSocket() client: AeonSocket,
    @MessageBody() ev: AeonClientEvent,
  ) {
    if (!client.userId || !client.charId || !client.roomId) return { ok: false };
    const roomId = client.roomId;
    const charId = client.charId;
    const now = Date.now();

    switch (ev.t) {
      case 'move': {
        const snap = this.presence.applyMove(charId, ev.x, ev.y, ev.facing);
        if (snap) {
          this.broadcastExcept(client, roomId, { t: 'char_upsert', char: snap, serverTs: now });
        }
        break;
      }
      case 'control': {
        // 服务器权威派生身份(R3),不信客户端 badge。
        const identity = identityFromControl(ev.controlState);
        const snap = this.presence.applyControl(
          charId,
          ev.controlState,
          identity.badge,
          identity.isAgentDriven,
        );
        if (snap) {
          // 控制态变更与徽章在同一同步周期广播(R3.4)
          this.broadcast(roomId, { t: 'char_upsert', char: snap, serverTs: now });
        }
        break;
      }
      case 'action': {
        this.broadcastExcept(client, roomId, {
          t: 'action',
          fromCharId: charId,
          action: ev.action,
          serverTs: now,
        });
        break;
      }
      case 'chat': {
        const snap = this.presence.snapshot(roomId).find((c) => c.charId === charId);
        // R3.3 归因:agent 驱动的消息标注来源。
        const attribution = snap?.isAgentDriven
          ? `由 ${snap.displayName} 的 agent 执行`
          : undefined;
        this.broadcast(roomId, {
          t: 'chat',
          fromCharId: charId,
          text: ev.text,
          attribution,
          serverTs: now,
        });
        // 创作房间:观众发言 → 主播 agent 节流应答(best-effort)。
        if (this.hostAgent?.isCreationRoom(roomId)) {
          this.hostAgent.onAudienceChat(roomId, charId, ev.text).catch(() => undefined);
        }
        break;
      }
      case 'stage_raise_hand': {
        if (!this.stage.isStageRoom(roomId)) break;
        const snap = this.presence.snapshot(roomId).find((c) => c.charId === charId);
        if (this.stage.raiseHand(roomId, charId)) {
          this.broadcast(roomId, {
            t: 'stage_hand_raised',
            fromCharId: charId,
            displayName: snap?.displayName ?? '观众',
            serverTs: now,
          });
        }
        break;
      }
      case 'stage_invite': {
        if (!this.stage.isStageRoom(roomId)) break;
        this.stage.invite(roomId, charId, ev.targetCharId);
        const updated = this.presence.applyStageRole(ev.targetCharId, 'speaker');
        if (updated) this.broadcast(roomId, { t: 'char_upsert', char: updated, serverTs: now });
        break;
      }
      case 'stage_leave_stage': {
        if (!this.stage.isStageRoom(roomId)) break;
        const target = this.stage.leaveStage(roomId, charId, ev.targetCharId);
        const updated = this.presence.applyStageRole(target, 'audience');
        if (updated) this.broadcast(roomId, { t: 'char_upsert', char: updated, serverTs: now });
        break;
      }
      case 'stage_tip': {
        if (!this.stage.isStageRoom(roomId)) break;
        const fromSnap = this.presence.snapshot(roomId).find((c) => c.charId === charId);
        const toSnap = this.presence.snapshot(roomId).find((c) => c.charId === ev.targetCharId);
        if (!toSnap || !client.userId) break;
        // 仅可打赏台上(host/speaker)。
        if (toSnap.stageRole !== 'host' && toSnap.stageRole !== 'speaker') break;
        const refId = `aeon-tip-${roomId}-${charId}-${now}`;
        try {
          const total = await this.stage.settleTip({
            roomId,
            fromUserId: client.userId,
            toUserId: toSnap.ownerUserId,
            targetCharId: ev.targetCharId,
            amount: ev.amount,
            refId,
          });
          const attribution = fromSnap?.isAgentDriven
            ? `由 ${fromSnap.displayName} 的 agent 执行`
            : undefined;
          this.broadcast(roomId, {
            t: 'stage_tip',
            fromCharId: charId,
            fromName: fromSnap?.displayName ?? '观众',
            targetCharId: ev.targetCharId,
            targetName: toSnap.displayName,
            amount: ev.amount,
            totalToTarget: total,
            attribution,
            serverTs: now,
          });
        } catch (err: any) {
          // 打赏失败(余额不足/越界)只回执发起方,不广播。
          client.emit(AEON_SYNC.SERVER_EVENT, {
            t: 'action',
            fromCharId: charId,
            action: `tip_failed:${err?.message ?? '打赏失败'}`,
            serverTs: now,
          } satisfies AeonServerEvent);
        }
        break;
      }
    }
    this.presence.heartbeat(charId);
    return { ok: true };
  }

  /**
   * 舞台离场清理:从 StageService 移除该角色;若其为 host 且有 speaker,
   * 自动把 host 让给一名 speaker,并广播该新 host 的 char_upsert(R3.4 同周期)。
   */
  private handleStageDeparture(roomId: string, charId: string) {
    if (!this.stage.isStageRoom(roomId)) return;
    const { newHost } = this.stage.onLeave(roomId, charId);
    if (newHost) {
      const updated = this.presence.applyStageRole(newHost, 'host');
      if (updated) this.broadcast(roomId, { t: 'char_upsert', char: updated, serverTs: Date.now() });
    }
  }

  // ── 内部:广播工具 ─────────────────────────────────────────────────
  private broadcast(roomId: string, event: AeonServerEvent) {
    this.server.to(aeonRoomName(roomId)).emit(AEON_SYNC.SERVER_EVENT, event);
  }

  /**
   * 对外广播工具(供 AgentDriverService 等模块推送 agent 驱动角色的更新)。
   * 与内部 broadcast 同义,公开以便注入式调用。
   */
  emitToRoom(roomId: string, event: AeonServerEvent) {
    this.broadcast(roomId, event);
  }

  private broadcastExcept(client: AeonSocket, roomId: string, event: AeonServerEvent) {
    client.to(aeonRoomName(roomId)).emit(AEON_SYNC.SERVER_EVENT, event);
  }

  private sweepStale() {
    const stale = this.presence.collectStale();
    for (const { charId, roomId } of stale) {
      this.presence.remove(charId);
      this.handleStageDeparture(roomId, charId);
      this.broadcast(roomId, { t: 'char_leave', charId, serverTs: Date.now() });
      this.logger.debug(`aeon stale char_leave: ${charId} from ${roomId}`);
    }
  }
}
