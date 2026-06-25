/**
 * L1_Bridge — host 端 L1 iframe 沙箱桥的能力分派 (design §5.2, R6.2/5.5).
 *
 * L1 隔离把 Tier_B 规则 / JS 体验运行在 `<iframe sandbox>` 内；iframe (guest) 通过
 * 冻结的 postMessage 代理发出 `cap` 请求 (见 sandbox-protocol.ts / sandbox-guest.ts)。
 * **真正的能力执行在 host**。本模块是 host 端接收 guest `cap` 消息、做白名单分派、
 * 并回送 `cap.result` 的逻辑。
 *
 * 安全姿态 (design §5.2)：
 *   - **deny-by-default**：复用 {@link dispatchCapability} (capability-registry.ts)
 *     做白名单 + grantedCaps 双门控 —— **不在此重复 deny 逻辑**。未授权 → `CAP_DENIED`
 *     并经注入的审计 sink 写一条审计记录 (R5.5)。
 *   - **纯函数**：核心 {@link dispatchCapMessage} 无 I/O、不修改入参，授权判定来自
 *     capability-registry，能力执行经注入的 {@link CapabilityExecutor} (默认 no-op)。
 *     同输入恒产生同 `cap.result`，便于 Property 3 (能力 deny-by-default) 与单元测试驱动。
 *   - **防御性解析**：guest 不可信，畸形消息被当作 `CAP_DENIED` 处理而非崩溃 host。
 *   - **金额仅 hint**：经济类能力 (economy.*) 的 args 仅作展示提示；权威金额由服务端
 *     Economy_Bridge 计算 (design §6, task 7.x)。本桥只负责授权与转发。
 *
 * 本模块不实现具体能力副作用 (scene.* / economy.* / battle.start 等在 task 4.3/7.x)；
 * 它通过可注入的 executor 把已授权调用转交上层，保持桥本身可测、纯净。
 *
 * @see .kiro/specs/ai-world-creation-platform/design.md — §5.2 L1 postMessage 协议
 */

import {
  dispatchCapability,
  isDispatchAllowed,
  type CapabilityAuditSink,
} from '../world-api/capability-registry';
import type { WorldApiCapability, WorldCreationError } from '../../../../shared/types/world-creation';
import {
  isCapMessage,
  makeCapResultError,
  makeCapResultOk,
  type SandboxCapMessage,
  type SandboxCapResultMessage,
} from './sandbox-protocol';

// ============================================================
// §1 Capability executor (injected — keeps the bridge pure & testable)
// ============================================================

/**
 * Executes an **already-authorized** capability and returns its result value.
 * Injected so the bridge stays independent of concrete capability side-effects
 * (scene.* / economy.* / battle.start are implemented in later tasks). May be
 * async; the bridge awaits it. Throwing rejects the call with `CAP_DENIED`-free
 * structured error mapping handled by {@link dispatchCapMessage}.
 */
export type CapabilityExecutor = (
  call: { cap: string; args: Record<string, unknown>; sessionId?: string },
) => unknown | Promise<unknown>;

/** Default executor: authorize-only (no side effects). Returns `undefined`. */
const NOOP_EXECUTOR: CapabilityExecutor = () => undefined;

// ============================================================
// §2 Dispatch context
// ============================================================

/** Context for {@link dispatchCapMessage} — granted caps + audit + executor. */
export interface SandboxDispatchContext {
  /** Sandbox session id (recorded in audit entries on denial). */
  sessionId?: string;
  /**
   * The capability subset granted to this experience (from the init message).
   * Deny-by-default: a capability not matched here is rejected even if
   * whitelisted (design §3.3).
   */
  grantedCaps: ReadonlyArray<WorldApiCapability | string>;
  /** Audit sink for `CAP_DENIED` entries (R5.5). */
  audit?: CapabilityAuditSink;
  /** Executes authorized capabilities; defaults to authorize-only no-op. */
  executor?: CapabilityExecutor;
}

// ============================================================
// §3 Core dispatch (pure w.r.t. authorization; effects via executor)
// ============================================================

/** Map a thrown executor error into a structured EXECUTION error. */
function executionError(cap: string, cause: unknown): WorldCreationError {
  const reason = cause instanceof Error ? cause.message : String(cause);
  return {
    error: 'ECONOMY_REJECTED',
    detail: `capability "${cap}" execution failed: ${reason}`,
  };
}

/**
 * Dispatch a single guest `cap` message on the host (design §5.2, R5.5).
 *
 * Authorization is delegated to {@link dispatchCapability} (deny-by-default,
 * whitelist + grantedCaps), so deny logic is **not duplicated** here. On denial
 * the registry writes a `CAP_DENIED` audit entry and this function returns a
 * `cap.result` carrying that structured error. On authorization the injected
 * {@link CapabilityExecutor} runs the effect and its value is returned in a
 * successful `cap.result`.
 *
 * Defensive: a malformed/non-cap message yields a `CAP_DENIED` result rather
 * than throwing (the guest is untrusted).
 *
 * @param message an inbound guest message (validated defensively)
 * @param ctx granted caps, audit sink, optional executor, session id
 * @returns the `cap.result` message to post back to the guest
 */
export async function dispatchCapMessage(
  message: unknown,
  ctx: SandboxDispatchContext,
): Promise<SandboxCapResultMessage> {
  // Defensive parse — the guest is untrusted (design §5.2).
  if (!isCapMessage(message)) {
    const id =
      typeof (message as Partial<SandboxCapMessage>)?.id === 'string'
        ? (message as SandboxCapMessage).id
        : 'unknown';
    return makeCapResultError(id, {
      error: 'CAP_DENIED',
      detail: 'malformed capability message',
    });
  }

  const cap = String(message.name);

  // Authorization: reuse the deny-by-default registry dispatcher (no duplication).
  const decision = dispatchCapability({
    cap,
    grantedCaps: ctx.grantedCaps,
    sessionId: ctx.sessionId,
    audit: ctx.audit,
  });

  if (!isDispatchAllowed(decision)) {
    // decision is the structured CAP_DENIED error; registry already audited it.
    return makeCapResultError(message.id, decision);
  }

  // Authorized — run the effect via the injected executor.
  const executor = ctx.executor ?? NOOP_EXECUTOR;
  try {
    const value = await executor({
      cap,
      args: message.args ?? {},
      sessionId: ctx.sessionId,
    });
    return makeCapResultOk(message.id, value);
  } catch (cause) {
    return makeCapResultError(message.id, executionError(cap, cause));
  }
}

// ============================================================
// §4 Host bridge factory (stateful wrapper around the pure core)
// ============================================================

/** A transport the host uses to post `cap.result` messages back to the guest. */
export interface HostToGuestTransport {
  /** Post a host → guest message into the iframe. */
  postMessage(message: SandboxCapResultMessage): void;
}

/** A live host-side L1 bridge bound to one sandbox session. */
export interface HostBridge {
  /** The session id this bridge serves. */
  readonly sessionId: string;
  /**
   * Handle one inbound guest message: dispatch it and post the `cap.result`
   * back through the transport. Returns the result message for observability.
   */
  handleGuestMessage(message: unknown): Promise<SandboxCapResultMessage>;
}

/**
 * Create a stateful host bridge for one L1 sandbox session. Thin wrapper over
 * the pure {@link dispatchCapMessage}: it captures the session's granted caps,
 * audit sink, and executor, then routes each guest message and posts the
 * `cap.result` back through `transport`.
 *
 * @param input session id, granted caps, transport, optional audit/executor
 * @returns a {@link HostBridge} that handles inbound guest messages
 */
export function createHostBridge(input: {
  sessionId: string;
  grantedCaps: ReadonlyArray<WorldApiCapability | string>;
  transport: HostToGuestTransport;
  audit?: CapabilityAuditSink;
  executor?: CapabilityExecutor;
}): HostBridge {
  const ctx: SandboxDispatchContext = {
    sessionId: input.sessionId,
    grantedCaps: input.grantedCaps,
    audit: input.audit,
    executor: input.executor,
  };

  return {
    sessionId: input.sessionId,
    async handleGuestMessage(message: unknown): Promise<SandboxCapResultMessage> {
      const result = await dispatchCapMessage(message, ctx);
      input.transport.postMessage(result);
      return result;
    },
  };
}
