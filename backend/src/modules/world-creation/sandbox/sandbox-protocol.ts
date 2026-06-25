/**
 * Sandbox_Protocol — L1 iframe postMessage 协议 (design §5.2 冻结 API surface, R6.2/5.5).
 *
 * Capability_Sandbox 的 L1 隔离级把 Tier_B 规则 / JS 体验运行在 `<iframe sandbox>` 内。
 * iframe (guest) 与宿主 (host) 之间**唯一**的通信通道是一组冻结、结构化的 postMessage
 * 消息。本模块是 host 与 guest **共享**的协议单一事实来源：
 *
 *   host → guest:  { type: "init",       apiVersion, grantedCaps[], readonlyHandles[] }
 *   guest → host:  { type: "cap",        id, name, args }
 *   host → guest:  { type: "cap.result", id, ok | err, value }
 *
 * 设计要点 (design §5.2)：
 *   - guest 内注入的 `World_API` 只是**消息代理** —— 真正执行在 host (见 l1-bridge.ts)。
 *   - host 端按 `grantedCaps` 白名单分派；未授权能力直接 `{ ok:false, error: CAP_DENIED }`
 *     并写审计 (复用 capability-registry，不重复 deny 逻辑)。
 *   - 金额类调用一律转发服务端，guest 拿不到任何账户凭证 (design §6)。
 *
 * 本模块仅定义协议消息类型 + 类型守卫 + 构造器 (纯)。host 分派见 {@link ./l1-bridge}；
 * guest 帧脚本见 {@link ./sandbox-guest}；L0 声明式渲染见 {@link ./l0-render}。
 *
 * @see .kiro/specs/ai-world-creation-platform/design.md — §5.2 L1 postMessage 协议
 */

import type {
  SandboxIsolationLevel,
  WorldApiCapability,
  WorldCreationError,
} from '../../../../shared/types/world-creation';

// ============================================================
// §1 Protocol constants
// ============================================================

/** Current sandbox postMessage protocol version. Bumped on breaking changes. */
export const SANDBOX_API_VERSION = '1.0' as const;

/** Discriminator values for the three protocol message kinds. */
export const SANDBOX_MESSAGE_TYPES = {
  /** host → guest: bootstrap the experience with its granted capability surface. */
  init: 'init',
  /** guest → host: request invocation of a World_API capability. */
  cap: 'cap',
  /** host → guest: the resolved result (or error) of a prior `cap` request. */
  capResult: 'cap.result',
} as const;

// ============================================================
// §2 Read-only asset handle (design §9.1)
// ============================================================

/**
 * A read-only asset handle injected into the sandbox at init. Contains only an
 * id plus display data — never an ownership credential or transfer capability
 * (design §9.1, R9.1/9.2). The guest cannot forge ownership from a handle.
 */
export interface ReadonlyAssetHandle {
  /** Asset id (e.g., a World_Asset / soul / pet id). */
  id: string;
  /** Asset kind for display/selection (e.g., "world_asset", "soul", "pet"). */
  kind: string;
  /** Non-authoritative display data (name, thumbnail ref, display stats…). */
  display?: Record<string, unknown>;
}

// ============================================================
// §3 Message shapes (discriminated union on `type`)
// ============================================================

/**
 * host → guest bootstrap message. Carries the frozen capability surface the
 * experience is authorized to use (`grantedCaps`) and the read-only asset
 * handles resolved server-side for the entering user (design §5.2/§9.1).
 */
export interface SandboxInitMessage {
  type: typeof SANDBOX_MESSAGE_TYPES.init;
  /** Protocol version the host speaks. */
  apiVersion: string;
  /** The capability subset granted to this experience (deny-by-default). */
  grantedCaps: ReadonlyArray<WorldApiCapability | string>;
  /** Read-only asset handles (no ownership credentials). */
  readonlyHandles: ReadonlyAssetHandle[];
  /** Isolation level the experience runs at (informational for the guest). */
  isolationLevel?: SandboxIsolationLevel;
}

/**
 * guest → host capability request. `id` correlates the eventual
 * {@link SandboxCapResultMessage}. `name` is the capability string; `args` is
 * capability-specific (monetary amounts are display hints only — design §6).
 */
export interface SandboxCapMessage {
  type: typeof SANDBOX_MESSAGE_TYPES.cap;
  /** Correlation id chosen by the guest; echoed back in the result. */
  id: string;
  /** Requested capability (concrete string or enum value). */
  name: WorldApiCapability | string;
  /** Capability arguments. */
  args?: Record<string, unknown>;
}

/**
 * host → guest result of a prior {@link SandboxCapMessage}. On success
 * `ok: true` with an optional `value`; on failure `ok: false` with a structured
 * {@link WorldCreationError} (e.g., `CAP_DENIED`).
 */
export type SandboxCapResultMessage =
  | {
      type: typeof SANDBOX_MESSAGE_TYPES.capResult;
      /** Correlation id matching the originating `cap` message. */
      id: string;
      ok: true;
      /** Capability result value (capability-specific, may be undefined). */
      value?: unknown;
    }
  | {
      type: typeof SANDBOX_MESSAGE_TYPES.capResult;
      /** Correlation id matching the originating `cap` message. */
      id: string;
      ok: false;
      /** Structured error describing why the capability was rejected. */
      error: WorldCreationError;
    };

/** Any message flowing host → guest. */
export type SandboxHostMessage = SandboxInitMessage | SandboxCapResultMessage;

/** Any message flowing guest → host. */
export type SandboxGuestMessage = SandboxCapMessage;

/** Any sandbox protocol message. */
export type SandboxMessage = SandboxHostMessage | SandboxGuestMessage;

// ============================================================
// §4 Type guards (defensive — inbound messages are untrusted)
// ============================================================

/** True iff `value` is a non-null object. */
function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/**
 * Type guard for an inbound {@link SandboxCapMessage}. Validates shape
 * defensively: the guest is untrusted, so a malformed message must not crash
 * the host dispatcher (it is treated as a denied/ignored call upstream).
 */
export function isCapMessage(value: unknown): value is SandboxCapMessage {
  if (!isObject(value)) {
    return false;
  }
  return (
    value.type === SANDBOX_MESSAGE_TYPES.cap &&
    typeof value.id === 'string' &&
    typeof value.name === 'string' &&
    (value.args === undefined || isObject(value.args))
  );
}

/** Type guard for an inbound {@link SandboxInitMessage}. */
export function isInitMessage(value: unknown): value is SandboxInitMessage {
  if (!isObject(value)) {
    return false;
  }
  return (
    value.type === SANDBOX_MESSAGE_TYPES.init &&
    typeof value.apiVersion === 'string' &&
    Array.isArray(value.grantedCaps) &&
    Array.isArray(value.readonlyHandles)
  );
}

/** Type guard for an inbound {@link SandboxCapResultMessage}. */
export function isCapResultMessage(value: unknown): value is SandboxCapResultMessage {
  if (!isObject(value)) {
    return false;
  }
  return (
    value.type === SANDBOX_MESSAGE_TYPES.capResult &&
    typeof value.id === 'string' &&
    typeof value.ok === 'boolean'
  );
}

// ============================================================
// §5 Message constructors (pure)
// ============================================================

/** Build a host → guest {@link SandboxInitMessage}. */
export function makeInitMessage(input: {
  grantedCaps: ReadonlyArray<WorldApiCapability | string>;
  readonlyHandles?: ReadonlyAssetHandle[];
  isolationLevel?: SandboxIsolationLevel;
  apiVersion?: string;
}): SandboxInitMessage {
  return {
    type: SANDBOX_MESSAGE_TYPES.init,
    apiVersion: input.apiVersion ?? SANDBOX_API_VERSION,
    grantedCaps: input.grantedCaps,
    readonlyHandles: input.readonlyHandles ?? [],
    isolationLevel: input.isolationLevel,
  };
}

/** Build a guest → host {@link SandboxCapMessage}. */
export function makeCapMessage(input: {
  id: string;
  name: WorldApiCapability | string;
  args?: Record<string, unknown>;
}): SandboxCapMessage {
  return {
    type: SANDBOX_MESSAGE_TYPES.cap,
    id: input.id,
    name: input.name,
    args: input.args,
  };
}

/** Build a successful host → guest {@link SandboxCapResultMessage}. */
export function makeCapResultOk(id: string, value?: unknown): SandboxCapResultMessage {
  return { type: SANDBOX_MESSAGE_TYPES.capResult, id, ok: true, value };
}

/** Build a failed host → guest {@link SandboxCapResultMessage}. */
export function makeCapResultError(
  id: string,
  error: WorldCreationError,
): SandboxCapResultMessage {
  return { type: SANDBOX_MESSAGE_TYPES.capResult, id, ok: false, error };
}
