/**
 * Aeon(永曜城)实时同步契约 — 跨端单一来源(SSoT)。
 *
 * spec: .kiro/specs/agentrix-world/{requirements,design,tasks}.md
 * Task 0.1 — 移动端(RN+Expo)、桌面端(Tauri)、后端(/aeon Socket.IO 网关)
 * 三方必须 import 本文件,保证位置/状态/身份字段跨端完全一致(满足 R1.7 / R3.5 / R18.3)。
 *
 * 设计要点(design.md §Architecture 实时同步层):
 *   - 服务器权威(server-authoritative)轻量版:客户端发"意图",服务器校验后广播。
 *   - 位置高频低风险 → 客户端预测 + 服务器广播;客户端上报节流 ≤10Hz。
 *   - 房间 = Socket.IO room `aeon:room:<roomId>`,与现有 `user:<id>` 房间模式一致。
 *   - 身份铁律(R3):`isAgentDriven` / `badge` 是渲染 ✋/🤖 的权威字段,无任何隐藏开关。
 */

// ── 控制态(双控位 R2)──────────────────────────────────────────────
/** 角色控制态:真人亲自 / agent 托管 / 协同(人设目标+AI执行+可夺回)。 */
export type AeonControlState = 'manual' | 'agent' | 'copilot';

/** 角色身份标识(R3 铁律):真人 / agent / 协同 / NPC。决定渲染的可见徽章。 */
export type AeonBadge = 'human' | 'agent' | 'copilot' | 'npc';

/** 族群短码(复用现有 6 族群精灵)。 */
export type AeonClan = 'A' | 'B' | 'C' | 'D' | 'E' | 'F';

/** 朝向(精灵镜像)。 */
export type AeonFacing = 'left' | 'right';

// ── 角色快照(房间内同步的最小权威单元)─────────────────────────────
export interface AeonCharacterSnapshot {
  /** 角色实例 id(= world_asset id 或主宠 id)。 */
  charId: string;
  /** 角色归属用户。 */
  ownerUserId: string;
  /** 当前控制态。 */
  controlState: AeonControlState;
  /** R3 铁律权威字段:是否 agent 驱动。客户端据此渲染 ✋/🤖,不得隐藏。 */
  isAgentDriven: boolean;
  /** 身份徽章(由后端权威下发,与 controlState 同周期更新)。 */
  badge: AeonBadge;
  /** 族群(决定精灵外观)。 */
  clan: AeonClan;
  /** 等距网格坐标。 */
  x: number;
  y: number;
  /** 朝向。 */
  facing: AeonFacing;
  /** 当前精灵动作(idle/walk/talk/...)。 */
  sprite: string;
  /** 展示名。 */
  displayName: string;
}

// ── 客户端 → 服务器事件(意图)────────────────────────────────────
export type AeonClientEvent =
  | { t: 'move'; x: number; y: number; facing: AeonFacing }
  | { t: 'action'; action: string; targetCharId?: string }
  | { t: 'control'; controlState: AeonControlState }
  | { t: 'chat'; text: string; scope: 'proximity' | 'room' };

// ── 服务器 → 客户端事件(权威广播)──────────────────────────────────
export type AeonServerEvent =
  | { t: 'room_state'; roomId: string; chars: AeonCharacterSnapshot[]; serverTs: number }
  | { t: 'char_upsert'; char: AeonCharacterSnapshot; serverTs: number }
  | { t: 'char_leave'; charId: string; serverTs: number }
  | {
      t: 'chat';
      fromCharId: string;
      text: string;
      /** R3.3 归因:agent 发出的消息标注"由 <owner> 的 agent 执行"。 */
      attribution?: string;
      serverTs: number;
    }
  | { t: 'action'; fromCharId: string; action: string; serverTs: number };

// ── 加入房间的握手载荷 ─────────────────────────────────────────────
export interface AeonJoinPayload {
  roomId: string;
  charId: string;
}

// ── 常量(延迟/容量/节流 — 与 requirements Design Constraints 对齐)──
export const AEON_SYNC = {
  /** Socket.IO 命名空间(与现有 /ws /presence 等并列)。 */
  NAMESPACE: '/aeon',
  /** 房间名前缀:`aeon:room:<roomId>`。 */
  ROOM_PREFIX: 'aeon:room:',
  /** 客户端位置上报节流(≤10Hz),降带宽。 */
  MOVE_THROTTLE_MS: 100,
  /** R1.2:房间内同步 p95 端到端延迟上限。 */
  P95_LATENCY_TARGET_MS: 300,
  /** R1.2/R5.5:MVP 单房间真人+agent 合计并发上限。 */
  ROOM_CAPACITY_MVP: 20,
  /** R1.4:断线检测宽限,超时广播 char_leave。 */
  DISCONNECT_GRACE_MS: 10_000,
  /** R1.4:重连后全量快照对账窗口。 */
  RECONCILE_WINDOW_MS: 5_000,
  /** Socket.IO 事件名(客户端发)。 */
  CLIENT_EVENT: 'aeon:client',
  /** Socket.IO 事件名(服务器发)。 */
  SERVER_EVENT: 'aeon:server',
  /** 加入房间消息名。 */
  JOIN: 'aeon:join',
  /** 离开房间消息名。 */
  LEAVE: 'aeon:leave',
  /** 心跳消息名。 */
  HEARTBEAT: 'aeon:heartbeat',
} as const;

/** 由 roomId 生成 Socket.IO room 名。 */
export function aeonRoomName(roomId: string): string {
  return `${AEON_SYNC.ROOM_PREFIX}${roomId}`;
}

/**
 * 权威映射:控制态 → 徽章 + isAgentDriven。集中在此,避免各端各写一套(R3.5)。
 * - manual  → human(✋),非 agent 驱动
 * - agent   → agent(🤖),agent 驱动
 * - copilot → copilot(🤖+✋),agent 驱动(人可随时夺回)
 */
export function identityFromControl(
  controlState: AeonControlState,
  isNpc = false,
): { badge: AeonBadge; isAgentDriven: boolean } {
  if (isNpc) return { badge: 'npc', isAgentDriven: true };
  switch (controlState) {
    case 'manual':
      return { badge: 'human', isAgentDriven: false };
    case 'agent':
      return { badge: 'agent', isAgentDriven: true };
    case 'copilot':
      return { badge: 'copilot', isAgentDriven: true };
  }
}
