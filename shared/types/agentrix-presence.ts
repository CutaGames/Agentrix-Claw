/**
 * Agentrix Cross-Platform Presence — Single Source of Truth (SSoT)
 *
 * 跨端唯一类型源。所有 5 端（Web / Desktop / Mobile / Watch / Glass）
 * 与后端必须 import 本文件，不得复制定义。
 *
 * 对应 PRD: docs/agentrix-cross-platform-prd-v3.md
 *   §3.4  Living Pet 6 表情状态机
 *   §3.5  亲密度
 *   §4.1  UserDeviceGraph
 *   §4.3  Trust Level
 *   §5.1  Handoff
 *   §5.2  Approval Routing
 *   §5.3  Wallet Projection
 *   §5.4  Vitals Bus
 *   §5.5  Memory 4 层
 *   §7.1  Realtime topic 列表
 *   §7.3  Presence Heartbeat
 *
 * 版本: v3.0
 * 创建: 2026-05-04 (P0-W1-1)
 */

// ============================================================
// §1 端 / 平台 / Trust
// ============================================================

export type Surface = 'web' | 'desktop' | 'mobile' | 'watch' | 'glass';

export type Platform =
  | 'macos'
  | 'windows'
  | 'linux'
  | 'ios'
  | 'android'
  | 'wearos'
  | 'watchos'
  | 'web-chrome'
  | 'web-safari'
  | 'web-firefox'
  | 'web-edge'
  | 'glass-android'
  | 'glass-other';

/**
 * Trust 等级 (§4.3)
 *  0 = 公开 Web (read-only)
 *  1 = 轻量登录
 *  2 = 设备绑定（Desktop / Watch 配对）
 *  3 = 生物认证（仅 Mobile）
 */
export type TrustLevel = 0 | 1 | 2 | 3;

/** 网络状态 (§7.3) */
export type NetworkState = 'wifi' | 'cellular' | 'ethernet' | 'offline';

// ============================================================
// §3.4 Living Pet 状态机
// ============================================================

/** 6 基础情绪 + P3 扩展 4 种 */
export type PetEmotion =
  | 'happy'
  | 'focused'
  | 'concerned'
  | 'tired'
  | 'excited'
  | 'calm'
  // P3 扩展
  | 'love'
  | 'sad'
  | 'angry'
  | 'sleepy';

/** 情绪强度 0=neutral, 3=max */
export type EmotionIntensity = 0 | 1 | 2 | 3;

/**
 * 主宠状态 (§3.4.3)
 * 由后端 Realtime 通道广播到所有在线端，端本地不持有写权。
 */
export interface PetState {
  pet_id: string;
  user_id: string;
  emotion: PetEmotion;
  emotion_intensity: EmotionIntensity;
  /** 当前情绪起始时间 (unix ms) */
  emotion_since: number;
  /** 该情绪何时自动衰减为 calm (unix ms) */
  emotion_decay_at: number;
  /** §3.5 亲密度 0-10 */
  intimacy_level: number;
  intimacy_xp: number;
  /** 最近 5 条记忆片段（长期记忆走 Memory Store §5.5） */
  recent_memory_snippets: string[];
  /** §3.8 当前驱动主宠的 working agent；与 pet_id 永远独立 */
  primary_agent_id: string;
  /** 引擎切换中（1-2s 换装动画） */
  engine_switching: boolean;
  /** 最近一次更新时间 */
  updated_at: number;
}

// ============================================================
// §4.1 UserDeviceGraph
// ============================================================

export interface DeviceNode {
  device_id: string;
  surface: Surface;
  platform: Platform;
  trust_level: TrustLevel;
  /** unix ms */
  last_active_at: number;
  online: boolean;
  battery_pct?: number;
  locale?: string;
  /** 客户端 agent-presence SDK 版本 */
  agent_presence_version: string;
}

export interface UserDeviceGraph {
  user_id: string;
  devices: DeviceNode[];
  /** 当前主端（§4.2 算法选出） */
  active_primary_surface: Surface;
  /** 唯一签名端，通常 = mobile */
  biometric_surface: Surface;
}

// ============================================================
// §5.1 Handoff
// ============================================================

export type HandoffMode = 'handoff' | 'mirror';

export type HandoffTaskKind =
  | 'chat'
  | 'coding'
  | 'approval'
  | 'voice'
  | 'visual';

export type HandoffStatus =
  | 'pending'
  | 'accepted'
  | 'mirrored'
  | 'cancelled'
  | 'completed'
  | 'expired';

export interface HandoffSession {
  session_id: string;
  user_id: string;
  origin_surface: Surface;
  origin_device_id: string;
  /** unix ms */
  started_at: number;
  last_heartbeat_at: number;
  task_kind: HandoffTaskKind;
  /** 指向 Memory Store 的 context snapshot */
  task_context_ref: string;
  handoff_mode: HandoffMode | null;
  target_surface: Surface | null;
  target_device_id: string | null;
  status: HandoffStatus;
}

// ============================================================
// §5.2 Approval Routing — 4 级风险
// ============================================================

/**
 * L0 读 / L1 低写 / L2 高写或单笔支付（必须 Mobile 生物认证） /
 * L3 跨链或大额或团队预算（Mobile 生物 + ≥ 1 协签）
 */
export type RiskLevel = 0 | 1 | 2 | 3;

export type ApprovalActionKind =
  | 'write'
  | 'pay'
  | 'transfer'
  | 'deploy'
  | 'delete';

export type ApprovalStatus =
  | 'pending'
  | 'approved'
  | 'denied'
  | 'timeout'
  | 'cancelled';

export type ApprovalMethod = 'tap' | 'biometric' | 'voice';

export interface ApprovalAction {
  kind: ApprovalActionKind;
  /** 'wallet' | 'task' | 'agent' | ... */
  resource: string;
  amount_cents?: number;
  chain?: string;
  payload: unknown;
}

export interface ApprovalRecord {
  surface: Surface;
  device_id: string;
  /** unix ms */
  at: number;
  method: ApprovalMethod;
}

export interface ApprovalRequest {
  request_id: string;
  user_id: string;
  action: ApprovalAction;
  risk_level: RiskLevel;
  initiator_surface: Surface;
  /** L3 必须 ≥ 2 */
  required_surfaces: Surface[];
  status: ApprovalStatus;
  /** unix ms */
  created_at: number;
  /** 默认 5 分钟，L3 15 分钟 */
  expires_at: number;
  approvals: ApprovalRecord[];
}

// ============================================================
// §5.3 Wallet Projection（read-only）
// ============================================================

export interface WalletBalance {
  chain: string;
  symbol: string;
  /** big number as string */
  amount_raw: string;
  amount_usd_cents: number;
}

export interface AgentAccountProjection {
  agent_id: string;
  balance_usd_cents: number;
  auto_earn_today_cents: number;
  pending_splits_cents: number;
}

export type WalletTxKind = 'earn' | 'spend' | 'transfer' | 'split';
export type WalletTxSource = 'auto_earn' | 'a2a' | 'stripe' | 'manual';

export interface WalletTx {
  tx_id: string;
  kind: WalletTxKind;
  agent_id?: string;
  amount_usd_cents: number;
  /** unix ms */
  at: number;
  source: WalletTxSource;
}

export interface StripeSubscriptionSummary {
  subscription_id: string;
  status: string;
  /** unix ms */
  period_end: number;
}

export interface WalletProjection {
  user_id: string;
  /** unix ms */
  as_of: number;
  balances: WalletBalance[];
  agent_accounts: AgentAccountProjection[];
  recent_txs: WalletTx[];
  stripe_subscriptions: StripeSubscriptionSummary[];
}

// ============================================================
// §5.4 Vitals Bus
// ============================================================

export type VitalKind =
  | 'hr'
  | 'imu'
  | 'step'
  | 'sleep'
  | 'battery'
  | 'expression'
  | 'location';

export interface VitalEvent {
  user_id: string;
  source_device_id: string;
  kind: VitalKind;
  value: number | string | Record<string, unknown>;
  unit?: string;
  /** unix ms */
  at: number;
  /** 0 低 / 1 中 / 2 高 */
  confidence: 0 | 1 | 2;
}

// ============================================================
// §5.5 Memory 4 层
// ============================================================

export type MemoryLayer = 'session' | 'agent' | 'user' | 'knowledge_base';

/** P3 隐私围栏标签 */
export type MemoryTag =
  | 'work'
  | 'private'
  | 'family'
  | 'financial'
  | 'health'
  | 'relationship';

export interface MemoryQueryRequest {
  user_id: string;
  layer: MemoryLayer;
  agent_id?: string;
  query: string;
  top_k?: number;
  tags?: MemoryTag[];
}

export interface MemoryItem {
  memory_id: string;
  layer: MemoryLayer;
  agent_id?: string;
  content: string;
  tags: MemoryTag[];
  /** unix ms */
  created_at: number;
  /** 0-1 */
  score?: number;
}

export interface MemoryWriteRequest {
  user_id: string;
  layer: MemoryLayer;
  agent_id?: string;
  content: string;
  tags: MemoryTag[];
  /** 客户端去重幂等键 */
  idempotency_key: string;
}

// ============================================================
// §7.3 Presence Heartbeat
// ============================================================

export interface PresenceHeartbeat {
  user_id: string;
  device_id: string;
  surface: Surface;
  platform: Platform;
  app_version: string;
  battery_pct?: number;
  network: NetworkState;
  foreground: boolean;
  /** unix ms */
  last_user_input_at?: number;
  /** unix ms */
  at: number;
}

// ============================================================
// §7.1 Realtime Topic 注册
// ============================================================

/**
 * 10 个核心 topic。所有 Realtime 通道发布订阅必须使用 makeTopic() 生成，
 * 禁止字符串拼接。
 */
export const PresenceTopics = {
  presence: (userId: string) => `user.${userId}.presence`,
  petState: (userId: string) => `user.${userId}.pet.state`,
  handoff: (userId: string) => `user.${userId}.handoff`,
  approval: (userId: string) => `user.${userId}.approval`,
  wallet: (userId: string) => `user.${userId}.wallet`,
  vitals: (userId: string) => `user.${userId}.vitals`,
  agentEvent: (userId: string, agentId: string) =>
    `user.${userId}.agent.${agentId}.event`,
  memoryChanged: (userId: string) => `user.${userId}.memory.changed`,
  economyEvent: (userId: string) => `user.${userId}.economy.event`,
  surfacePrimaryChanged: (userId: string) =>
    `user.${userId}.surface.primary.changed`,
} as const;

/** Topic QoS（参考契约，运行时由 broker 实现） */
export type TopicQoS = 'at-most-once' | 'at-least-once' | 'best-effort';

// ============================================================
// §7.5 错误码 + 幂等
// ============================================================

export type PresenceErrorCode =
  | 'UNAUTHENTICATED'
  | 'TRUST_LEVEL_INSUFFICIENT'
  | 'SIGNING_SURFACE_MISMATCH'
  | 'HANDOFF_CONFLICT'
  | 'APPROVAL_EXPIRED'
  | 'RATE_LIMITED'
  | 'IDEMPOTENCY_REPLAY';

export interface PresenceError {
  code: PresenceErrorCode;
  message: string;
  details?: Record<string, unknown>;
}

// ============================================================
// §SDK 版本
// ============================================================

export const AGENTRIX_PRESENCE_TYPES_VERSION = '3.0.0';
