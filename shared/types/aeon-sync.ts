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

/**
 * 舞台角色(Stage 原语 / R22 未来范围的最小落地:现场活动/脱口秀)。
 *  - host:主持人(开/关麦、批准上台、控场);一个房间一名 host。
 *  - speaker:在台上/已上麦发言者(若干名,受 STAGE_MAX_SPEAKERS 限制)。
 *  - audience:观众(默认);可"举手"申请上台,可给台上发言者打赏 AXP。
 */
export type AeonStageRole = 'host' | 'speaker' | 'audience';

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
  /**
   * 舞台角色(仅在 Stage 类房间有意义;普通房间省略 → 视为 audience)。
   * 由服务器权威维护(host 批准上台 / 下台时同周期更新)。
   */
  stageRole?: AeonStageRole;
}

// ── 客户端 → 服务器事件(意图)────────────────────────────────────
export type AeonClientEvent =
  | { t: 'move'; x: number; y: number; facing: AeonFacing }
  | { t: 'action'; action: string; targetCharId?: string }
  | { t: 'control'; controlState: AeonControlState }
  | { t: 'chat'; text: string; scope: 'proximity' | 'room' }
  // ── 舞台原语(现场活动/脱口秀)客户端意图 ──────────────────────────
  /** 观众举手申请上台(host 收到后可批准)。 */
  | { t: 'stage_raise_hand' }
  /** host 批准某观众上台为 speaker(仅 host 有效)。 */
  | { t: 'stage_invite'; targetCharId: string }
  /** speaker 主动下台,或 host 请某 speaker 下台(targetCharId 省略=自己下台)。 */
  | { t: 'stage_leave_stage'; targetCharId?: string }
  /** 给台上某 speaker/host 打赏 AXP(观众→发言者,真实价值流转 R11)。 */
  | { t: 'stage_tip'; targetCharId: string; amount: number };

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
  | { t: 'action'; fromCharId: string; action: string; serverTs: number }
  // ── 舞台原语权威广播 ──────────────────────────────────────────────
  /** 有观众举手(广播给全场,host 据此决定批准谁)。 */
  | { t: 'stage_hand_raised'; fromCharId: string; displayName: string; serverTs: number }
  /**
   * 打赏成功广播(全场可见,营造现场打赏氛围)。amount 为本次打赏 AXP;
   * totalToTarget 为本场该 speaker 累计被打赏(用于"人气榜")。
   */
  | {
      t: 'stage_tip';
      fromCharId: string;
      fromName: string;
      targetCharId: string;
      targetName: string;
      amount: number;
      totalToTarget: number;
      attribution?: string;
      serverTs: number;
    };

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
  /** R5.5:舞台房间上限发言者(host 之外的 speaker)数。 */
  STAGE_MAX_SPEAKERS: 6,
  /** 单次打赏 AXP 上下限(防误触/刷屏;真钱大额走另路,此处仅 AXP)。 */
  STAGE_TIP_MIN: 1,
  STAGE_TIP_MAX: 5000,
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
