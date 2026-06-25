/**
 * Capability_Registry — World_API 能力白名单 + deny-by-default 分派器
 * (design §4 World_API 能力模型, §5.2 L1 postMessage 协议, R5.1/5.2/5.5).
 *
 * World_API 是体验影响世界、UI、状态、经济、Agent 的**唯一受控通道**。本模块实现
 * "deny-by-default" 这一不可协商的安全不变量:
 *
 *   - **白名单**: 暴露给体验的能力集合 = {@link WorldApiCapability} 枚举 (单一事实
 *     来源, shared/types/world-creation.ts §8)。不在白名单内的能力一律拒绝。
 *   - **按声明授权**: 每个体验 / 逻辑模块声明它需要的能力子集 (`grantedCaps`)。
 *     未声明的能力即便在白名单内也一律拒绝 (logic module deny-by-default, design §3.3)。
 *   - **结构化拒绝 + 审计**: 任一拒绝返回 `{ error: "CAP_DENIED", detail }` 并向可注入的
 *     审计 sink 写入一条 `CAP_DENIED` 记录 (R5.5)。
 *   - **绝不暴露 raw filesystem / raw network / raw process** (R5.2): 这些根本不在白名单
 *     枚举内, 因此结构上不可达。`net.fetch` 是唯一出网通道, 经 host 代理 (task 4.3)。
 *
 * 核心导出 {@link dispatchCapability} 为**纯函数** (审计经注入的 sink, 默认 no-op):
 * 同样输入产生同样判定, 设计为可被 Property 3 (能力 deny-by-default, task 4.2)
 * 属性测试直接驱动 —— 任何未声明 / 不在白名单的能力必被拒绝并产生审计记录。
 *
 * 本模块仅实现能力注册表 + 分派 + deny-by-default + 审计。`net.fetch` host 代理与
 * `battle.start` 桥接见 task 4.3; 沙箱实例化 / postMessage 传输见 task 5.x。
 *
 * @see .kiro/specs/ai-world-creation-platform/design.md — §4 World_API 能力模型
 */

import {
  WorldApiCapability,
  WorldCreationError,
} from '../../../../shared/types/world-creation';

// ============================================================
// §1 Capability whitelist (single source of truth)
// design: §4 World_API 能力模型, R5.1
// ============================================================

/**
 * The whitelist of World_API capabilities exposed to experiences.
 *
 * Derived directly from the {@link WorldApiCapability} enum so the registry
 * stays in lock-step with the single source of truth in shared types. Anything
 * not present here is denied by default (R5.1/5.5). Raw filesystem / network /
 * process access is intentionally absent and thus structurally unreachable
 * (R5.2).
 */
export const WHITELISTED_CAPABILITIES: ReadonlySet<WorldApiCapability> = new Set<WorldApiCapability>(
  Object.values(WorldApiCapability),
);

/**
 * Whether a wildcard-aware capability `token` matches a concrete `requested`
 * capability string.
 *
 * The whitelist uses two namespaced wildcard tokens — `ui.*` and `npc.*`
 * (design §4 table) — so a granted/whitelisted `ui.*` authorizes concrete
 * sub-capabilities such as `ui.toast` or `ui.panel`. Exact (non-wildcard)
 * tokens match only their identical string.
 */
function capabilityMatches(token: string, requested: string): boolean {
  if (token === requested) {
    return true;
  }
  if (token.endsWith('.*')) {
    const prefix = token.slice(0, -2); // "ui.*" -> "ui"
    return requested === prefix || requested.startsWith(`${prefix}.`);
  }
  return false;
}

/**
 * True iff `cap` resolves to a whitelisted World_API capability (wildcard-aware).
 *
 * @param cap a requested capability string (concrete or wildcard token)
 */
export function isWhitelistedCapability(cap: string): boolean {
  for (const token of WHITELISTED_CAPABILITIES) {
    if (capabilityMatches(token, cap)) {
      return true;
    }
  }
  return false;
}

// ============================================================
// §2 Audit sink (injectable / observable for testability)
// design: §5.2 host 端按白名单分派, 未授权写审计 (R5.5)
// ============================================================

/** Why a capability dispatch was denied. */
export type CapabilityDenyReason =
  /** The capability is not present in the World_API whitelist (R5.1/5.2). */
  | 'NOT_WHITELISTED'
  /** The capability is whitelisted but was not declared in `grantedCaps` (design §3.3). */
  | 'NOT_GRANTED';

/**
 * A single audit log entry recorded whenever a capability dispatch is denied.
 * Emitted to the injected {@link CapabilityAuditSink} so tests can assert that a
 * denial produced an audit record (Property 3, R5.5).
 */
export interface CapabilityAuditEntry {
  /** Audit event kind. Always `CAP_DENIED` for denials. */
  event: 'CAP_DENIED';
  /** The requested capability string that was denied. */
  cap: string;
  /** Machine-readable reason the call was denied. */
  reason: CapabilityDenyReason;
  /** Optional sandbox session id the call originated from. */
  sessionId?: string;
  /** Human-readable detail mirroring the structured error detail. */
  detail: string;
  /** Unix epoch millis when the denial was recorded. */
  ts: number;
}

/**
 * A simple, injectable audit sink. Implementations may forward to a logger,
 * persist to the moderation audit log, or (in tests) collect entries in memory.
 */
export type CapabilityAuditSink = (entry: CapabilityAuditEntry) => void;

/** A no-op audit sink used when no sink is injected. */
const NOOP_AUDIT_SINK: CapabilityAuditSink = () => {
  /* intentionally empty */
};

/**
 * A captured in-memory audit collector: a {@link CapabilityAuditSink} plus the
 * ordered list of entries it has received. Convenient for unit/property tests
 * that need to assert a denial was audited.
 */
export interface CapabilityAuditCollector {
  /** The sink to pass into {@link dispatchCapability}. */
  sink: CapabilityAuditSink;
  /** All entries received so far, in arrival order. */
  entries: CapabilityAuditEntry[];
}

/** Create an in-memory {@link CapabilityAuditCollector}. */
export function createAuditCollector(): CapabilityAuditCollector {
  const entries: CapabilityAuditEntry[] = [];
  return {
    entries,
    sink: (entry) => {
      entries.push(entry);
    },
  };
}

// ============================================================
// §3 Dispatch (deny-by-default)
// design: §4/§5.2, R5.5
// ============================================================

/** Input to {@link dispatchCapability}. */
export interface DispatchCapabilityInput {
  /**
   * The capability the experience is attempting to invoke. May be a concrete
   * string (e.g., `ui.toast`) or a {@link WorldApiCapability} enum value.
   */
  cap: WorldApiCapability | string;
  /**
   * The capability subset declared/authorized for this experience or logic
   * module. Deny-by-default: a capability not matched here is rejected even if
   * it is whitelisted (design §3.3).
   */
  grantedCaps: ReadonlyArray<WorldApiCapability | string>;
  /** Optional sandbox session id, recorded in the audit entry on denial. */
  sessionId?: string;
  /**
   * Optional audit sink invoked with a `CAP_DENIED` entry on every denial
   * (R5.5). Defaults to a no-op so the function stays pure/usable without wiring.
   */
  audit?: CapabilityAuditSink;
}

/**
 * Result of {@link dispatchCapability}: either an authorization to proceed
 * (`{ ok: true, cap }`) or a structured {@link WorldCreationError} with code
 * `CAP_DENIED`. Discriminate via the `ok` property (`'ok' in result`).
 */
export type CapabilityDispatchResult =
  | { ok: true; cap: string }
  | WorldCreationError;

/**
 * Type guard: `true` iff a dispatch result is a successful authorization.
 */
export function isDispatchAllowed(
  result: CapabilityDispatchResult,
): result is { ok: true; cap: string } {
  return (result as { ok?: boolean }).ok === true;
}

/** Build the structured CAP_DENIED error + matching audit entry, then audit it. */
function deny(
  cap: string,
  reason: CapabilityDenyReason,
  sessionId: string | undefined,
  audit: CapabilityAuditSink,
): WorldCreationError {
  const detail =
    reason === 'NOT_WHITELISTED'
      ? `capability "${cap}" is not in the World_API whitelist`
      : `capability "${cap}" was not granted to this experience`;

  audit({
    event: 'CAP_DENIED',
    cap,
    reason,
    sessionId,
    detail,
    ts: Date.now(),
  });

  return { error: 'CAP_DENIED', detail };
}

/**
 * Deny-by-default World_API capability dispatcher (design §4, R5.5).
 *
 * Authorizes a capability invocation iff the capability is **both**:
 *   1. present in the {@link WHITELISTED_CAPABILITIES} whitelist, **and**
 *   2. matched by the experience's declared `grantedCaps`.
 *
 * Any capability that is not whitelisted, or is whitelisted but not granted, is
 * denied with a structured `{ error: "CAP_DENIED", detail }` and an audit entry
 * is written to the injected sink. Matching is wildcard-aware so the namespaced
 * `ui.*` / `npc.*` tokens authorize their concrete sub-capabilities.
 *
 * Pure function (audit happens only via the injected sink, default no-op), so it
 * can be driven directly by the deny-by-default property test (Property 3,
 * task 4.2): for any capability not declared/whitelisted, the result is
 * `CAP_DENIED` and exactly one audit record is produced.
 *
 * @param input the requested capability, the granted subset, and optional audit/session
 * @returns `{ ok: true, cap }` when authorized, otherwise a `CAP_DENIED` error
 */
export function dispatchCapability(input: DispatchCapabilityInput): CapabilityDispatchResult {
  const cap = String(input.cap);
  const audit = input.audit ?? NOOP_AUDIT_SINK;
  const { sessionId } = input;

  // (1) Whitelist gate — anything outside the enum is structurally denied (R5.1/5.2).
  if (!isWhitelistedCapability(cap)) {
    return deny(cap, 'NOT_WHITELISTED', sessionId, audit);
  }

  // (2) Grant gate — must be explicitly declared by the experience (deny-by-default).
  const granted = input.grantedCaps.some((token) => capabilityMatches(String(token), cap));
  if (!granted) {
    return deny(cap, 'NOT_GRANTED', sessionId, audit);
  }

  return { ok: true, cap };
}
