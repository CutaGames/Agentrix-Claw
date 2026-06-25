import { Injectable, Logger } from '@nestjs/common';
import { RoomPresenceService } from '../realtime/room-presence.service';
import { AeonRealtimeGateway } from '../realtime/aeon-realtime.gateway';
import {
  AEON_SYNC,
  identityFromControl,
  type AeonCharacterSnapshot,
} from '../../../../../shared/types/aeon-sync';

/**
 * AgentFillService — 房间冷启动填场(Task 4.3 / R13.1/13.2/13.3/13.7)。
 *
 * 房间真人 < 活跃阈值 → 注入 owner 的 agent + 他人 opt-in 的 agent + world-sim NPC,
 * 让空房不空场。铁律(R3 / R13.2):所有填场参与者一律带 agent/NPC 身份标识,
 * 绝不冒充真人。空闲 ≥ IDLE_DOWNSHIFT_MS 降频(R13.3)。用户可 opt-out 自己 agent
 * 进他人填场池(R13.7)。
 *
 * 设计取舍:填场角色是"轻量 NPC 投影"——不消耗真实 OpenClaw 调用(避免成本),
 * 由 world-sim 风格的简单巡游驱动;真正的 owner-agent 决策仍走 AgentDriverService。
 * 真人进入到阈值以上时自动撤场(R13,不与真人抢位)。
 */

/** 填场参与者来源。 */
export type FillSource = 'owner_agent' | 'optin_agent' | 'world_npc';

interface FillEntry {
  charId: string;
  roomId: string;
  source: FillSource;
  ownerUserId: string | null;
  lastMoveAt: number;
  idle: boolean;
}

@Injectable()
export class AgentFillService {
  private readonly logger = new Logger(AgentFillService.name);

  /** 真人活跃阈值:房间真人 < 此数则填场(R13.1)。 */
  private static readonly HUMAN_ACTIVE_THRESHOLD = 3;
  /** 目标填场后总人数(填到这个数为止,含真人)。 */
  private static readonly FILL_TARGET = 6;
  /** 空闲降频阈值(R13.3):≥5 分钟无人互动则降频巡游。 */
  private static readonly IDLE_DOWNSHIFT_MS = 5 * 60 * 1000;

  /** roomId -> 填场角色列表。 */
  private readonly fills = new Map<string, FillEntry[]>();
  /** opt-out 的用户(不让自己 agent 进他人填场池,R13.7)。 */
  private readonly optedOut = new Set<string>();

  constructor(
    private readonly presence: RoomPresenceService,
    private readonly gateway: AeonRealtimeGateway,
  ) {}

  /** 用户 opt-out / opt-in 自己 agent 进入他人填场池(R13.7)。 */
  setOptOut(userId: string, optOut: boolean): void {
    if (optOut) this.optedOut.add(userId);
    else this.optedOut.delete(userId);
  }

  isOptedOut(userId: string): boolean {
    return this.optedOut.has(userId);
  }

  /** 房间真人数(controlState=manual 且非填场)。 */
  private humanCount(roomId: string): number {
    const fillIds = new Set((this.fills.get(roomId) ?? []).map((f) => f.charId));
    return this.presence
      .snapshot(roomId)
      .filter((c) => c.controlState === 'manual' && !fillIds.has(c.charId)).length;
  }

  /**
   * 评估并维持房间填场(R13.1)。真人不足→注入;真人增多→撤场。
   * 由房间进入事件或定时器调用。candidateAgents:可用于填场的 {charId,ownerUserId,sprite}。
   */
  evaluate(
    roomId: string,
    ownerUserId: string | null,
    candidateAgents: Array<{ charId: string; ownerUserId: string; sprite?: string; name?: string }> = [],
  ): void {
    const humans = this.humanCount(roomId);
    const current = this.fills.get(roomId) ?? [];

    // 真人已达阈值 → 全部撤场,把空间还给真人(R13)。
    if (humans >= AgentFillService.HUMAN_ACTIVE_THRESHOLD) {
      this.clearRoom(roomId);
      return;
    }

    const need = Math.max(0, AgentFillService.FILL_TARGET - humans - current.length);
    if (need <= 0) return;

    const pool = candidateAgents.filter((a) => a.ownerUserId === ownerUserId || !this.isOptedOut(a.ownerUserId));
    const added: FillEntry[] = [];
    for (let i = 0; i < need; i++) {
      const cand = pool[i];
      const source: FillSource = cand
        ? cand.ownerUserId === ownerUserId
          ? 'owner_agent'
          : 'optin_agent'
        : 'world_npc';
      const charId = cand?.charId ?? `npc-${roomId.slice(0, 6)}-${Date.now()}-${i}`;
      const snap = this.makeFillSnapshot(charId, source, cand?.ownerUserId ?? null, cand?.sprite, cand?.name);
      const ok = this.presence.upsert(roomId, snap);
      if (!ok) break; // 容量满
      this.gateway.emitToRoom(roomId, { t: 'char_upsert', char: snap, serverTs: Date.now() });
      added.push({
        charId,
        roomId,
        source,
        ownerUserId: cand?.ownerUserId ?? null,
        lastMoveAt: Date.now(),
        idle: false,
      });
    }
    if (added.length) {
      this.fills.set(roomId, [...current, ...added]);
      this.logger.log(`Agent-fill room ${roomId}: +${added.length} (humans=${humans})`);
    }
  }

  /**
   * 填场角色身份铁律(R13.2 / R3):一律 agent/NPC 态 + 🤖 徽章,绝不冒充真人。
   * world_npc 用 isNpc=true → badge:'npc';opt-in/owner agent → badge:'agent'。
   */
  private makeFillSnapshot(
    charId: string,
    source: FillSource,
    ownerUserId: string | null,
    sprite?: string,
    name?: string,
  ): AeonCharacterSnapshot {
    const isNpc = source === 'world_npc';
    const identity = identityFromControl('agent', isNpc);
    return {
      charId,
      ownerUserId: ownerUserId ?? 'world',
      displayName: name ?? (isNpc ? '居民' : 'Agent'),
      controlState: 'agent',
      badge: identity.badge,
      isAgentDriven: true,
      clan: (['A', 'B', 'C', 'D', 'E', 'F'] as const)[Math.floor(Math.random() * 6)],
      x: Math.floor(Math.random() * 10) + 2,
      y: Math.floor(Math.random() * 10) + 2,
      facing: 'right',
      sprite: sprite ?? 'idle',
    };
  }

  /**
   * 巡游 tick(R13.3):非空闲填场角色低频随机走动;空闲≥阈值降频(跳过部分 tick)。
   * 由定时器调用(网关 sweep 同周期或独立)。
   */
  tick(now = Date.now()): void {
    for (const [roomId, entries] of this.fills.entries()) {
      const idleRoom = now - this.lastHumanInteraction(roomId) > AgentFillService.IDLE_DOWNSHIFT_MS;
      for (const e of entries) {
        // 降频:空闲房间每个角色约 1/3 概率才动。
        if (idleRoom && Math.random() > 0.33) continue;
        const snap = this.presence.snapshot(roomId).find((c) => c.charId === e.charId);
        if (!snap) continue;
        const nx = Math.max(0, Math.min(31, snap.x + (Math.random() < 0.5 ? -1 : 1)));
        const ny = Math.max(0, Math.min(31, snap.y + (Math.random() < 0.5 ? -1 : 1)));
        const updated = this.presence.applyMove(e.charId, nx, ny, nx >= snap.x ? 'right' : 'left');
        if (updated) {
          this.gateway.emitToRoom(roomId, { t: 'char_upsert', char: updated, serverTs: now });
          e.lastMoveAt = now;
          e.idle = idleRoom;
        }
      }
    }
  }

  private lastHumanInteraction(roomId: string): number {
    // 近似:用最近一次真人快照心跳。无真人则返回很久以前(触发降频)。
    const fillIds = new Set((this.fills.get(roomId) ?? []).map((f) => f.charId));
    const humans = this.presence.snapshot(roomId).filter((c) => c.controlState === 'manual' && !fillIds.has(c.charId));
    return humans.length ? Date.now() : 0;
  }

  /** 撤掉房间所有填场角色(真人回来或房间关闭)。 */
  clearRoom(roomId: string): void {
    const entries = this.fills.get(roomId);
    if (!entries?.length) return;
    for (const e of entries) {
      this.presence.remove(e.charId);
      this.gateway.emitToRoom(roomId, { t: 'char_leave', charId: e.charId, serverTs: Date.now() });
    }
    this.fills.delete(roomId);
    this.logger.log(`Agent-fill cleared room ${roomId} (-${entries.length})`);
  }

  /** 当前填场角色 id(供测试/调试)。 */
  fillIds(roomId: string): string[] {
    return (this.fills.get(roomId) ?? []).map((f) => f.charId);
  }

  /** 容量上限暴露(对齐 ROOM_CAPACITY_MVP)。 */
  get capacity(): number {
    return AEON_SYNC.ROOM_CAPACITY_MVP;
  }
}
