import { Injectable, Logger } from '@nestjs/common';
import {
  AEON_SYNC,
  type AeonCharacterSnapshot,
} from '../../../../../shared/types/aeon-sync';

/**
 * RoomPresenceService — Aeon 房间瞬时在场态(Task 0.4)。
 *
 * design.md §Data Model:实时在场是高频写,首选放内存(spike 阶段);
 * `aeon_room_presence` 表仅作断线对账/重启恢复的低频快照,不做每帧写库。
 * Phase 0 spike 用纯内存实现验证延迟/容量;Phase 1+ 再叠加 Redis(多实例 fan-out)
 * 与可选的低频落库。
 *
 * 职责:
 *   - 维护 roomId → (charId → snapshot) 的在场映射
 *   - 心跳时间戳,供网关检测断线宽限(DISCONNECT_GRACE_MS)
 *   - 容量校验(ROOM_CAPACITY_MVP)
 *   - 提供全量快照供 room_state 下发与重连对账
 */
@Injectable()
export class RoomPresenceService {
  private readonly logger = new Logger(RoomPresenceService.name);

  /** roomId -> (charId -> snapshot) */
  private readonly rooms = new Map<string, Map<string, AeonCharacterSnapshot>>();
  /** charId -> last heartbeat epoch ms */
  private readonly lastSeen = new Map<string, number>();
  /** charId -> roomId(反查,便于断开清理) */
  private readonly charRoom = new Map<string, string>();

  /** 当前房间人数(真人+agent 合计)。 */
  occupancy(roomId: string): number {
    return this.rooms.get(roomId)?.size ?? 0;
  }

  /** 容量是否已满(R5.5 / ROOM_CAPACITY_MVP)。 */
  isFull(roomId: string): boolean {
    return this.occupancy(roomId) >= AEON_SYNC.ROOM_CAPACITY_MVP;
  }

  /**
   * 加入/更新一个角色的在场快照。返回 false 表示因容量已满被拒绝(新加入时)。
   */
  upsert(roomId: string, snap: AeonCharacterSnapshot): boolean {
    let room = this.rooms.get(roomId);
    const isNew = !room || !room.has(snap.charId);
    if (isNew && this.isFull(roomId)) {
      return false;
    }
    if (!room) {
      room = new Map();
      this.rooms.set(roomId, room);
    }
    room.set(snap.charId, snap);
    this.lastSeen.set(snap.charId, Date.now());
    this.charRoom.set(snap.charId, roomId);
    return true;
  }

  /** 局部更新位置/朝向/精灵(高频路径,避免整对象替换的额外分配)。 */
  applyMove(charId: string, x: number, y: number, facing: AeonCharacterSnapshot['facing'], sprite?: string): AeonCharacterSnapshot | null {
    const roomId = this.charRoom.get(charId);
    if (!roomId) return null;
    const snap = this.rooms.get(roomId)?.get(charId);
    if (!snap) return null;
    snap.x = x;
    snap.y = y;
    snap.facing = facing;
    if (sprite) snap.sprite = sprite;
    this.lastSeen.set(charId, Date.now());
    return snap;
  }

  /** 更新控制态 + 身份徽章(控制态切换路径)。 */
  applyControl(
    charId: string,
    controlState: AeonCharacterSnapshot['controlState'],
    badge: AeonCharacterSnapshot['badge'],
    isAgentDriven: boolean,
  ): AeonCharacterSnapshot | null {
    const roomId = this.charRoom.get(charId);
    if (!roomId) return null;
    const snap = this.rooms.get(roomId)?.get(charId);
    if (!snap) return null;
    snap.controlState = controlState;
    snap.badge = badge;
    snap.isAgentDriven = isAgentDriven;
    this.lastSeen.set(charId, Date.now());
    return snap;
  }

  /** 更新舞台角色(Stage 原语:host/speaker/audience 上下台路径)。 */
  applyStageRole(
    charId: string,
    stageRole: AeonCharacterSnapshot['stageRole'],
  ): AeonCharacterSnapshot | null {
    const roomId = this.charRoom.get(charId);
    if (!roomId) return null;
    const snap = this.rooms.get(roomId)?.get(charId);
    if (!snap) return null;
    snap.stageRole = stageRole;
    this.lastSeen.set(charId, Date.now());
    return snap;
  }

  /** 心跳:刷新最后活跃时间。 */
  heartbeat(charId: string): void {
    if (this.charRoom.has(charId)) {
      this.lastSeen.set(charId, Date.now());
    }
  }

  /** 移除一个角色(主动离开或断线)。返回其所在房间 id(供网关广播 char_leave)。 */
  remove(charId: string): string | null {
    const roomId = this.charRoom.get(charId);
    if (!roomId) return null;
    this.rooms.get(roomId)?.delete(charId);
    this.charRoom.delete(charId);
    this.lastSeen.delete(charId);
    if (this.rooms.get(roomId)?.size === 0) {
      this.rooms.delete(roomId);
    }
    return roomId;
  }

  /** 取某角色当前所在房间。 */
  roomOf(charId: string): string | null {
    return this.charRoom.get(charId) ?? null;
  }

  /** 取房间全量快照(供 room_state 下发 + 重连对账)。 */
  snapshot(roomId: string): AeonCharacterSnapshot[] {
    const room = this.rooms.get(roomId);
    return room ? Array.from(room.values()) : [];
  }

  /**
   * 扫描超过断线宽限(DISCONNECT_GRACE_MS)未心跳的角色,返回 [charId, roomId] 列表。
   * 网关定时调用 → 对每个超时角色广播 char_leave 并 remove。
   */
  collectStale(now = Date.now()): Array<{ charId: string; roomId: string }> {
    const stale: Array<{ charId: string; roomId: string }> = [];
    for (const [charId, ts] of this.lastSeen.entries()) {
      if (now - ts > AEON_SYNC.DISCONNECT_GRACE_MS) {
        const roomId = this.charRoom.get(charId);
        if (roomId) stale.push({ charId, roomId });
      }
    }
    return stale;
  }
}
