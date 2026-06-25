/**
 * Sandbox_Guest — L1 iframe guest 侧轻量帧脚本 / 冻结 World_API 代理 (design §5.2, R6.2).
 *
 * 运行在 `<iframe sandbox>` **内部** (guest)。它把一个用 `Object.freeze` 冻结、闭包
 * 封装的 `World_API` 对象暴露给体验逻辑 —— 但这个对象**只是 postMessage 消息代理**：
 * 它不持有任何真实能力，每次调用都被序列化成一条 `cap` 消息发给 host，由 host 按
 * grantedCaps 白名单分派 (见 l1-bridge.ts)，结果经 `cap.result` 回送并 resolve 对应的
 * Promise (design §5.2)。
 *
 * 安全设计：
 *   - **冻结 API surface**：返回的代理与其每个方法都 `Object.freeze`，体验代码无法
 *     篡改/替换方法以提权。
 *   - **零原生能力**：代理内不引用 fetch / filesystem / process —— 唯一对外通道是注入的
 *     postMessage 端口。host 才是能力执行处；guest 永远拿不到账户凭证 (design §6)。
 *   - **只读资产 handle**：init 时收到的 handle 仅含 id + 展示数据，无所有权凭证 (§9.1)。
 *
 * 本模块为**环境无关**实现 (抽象出 {@link GuestMessagePort} 端口，不依赖 DOM 类型)，
 * 便于在 host 测试中以内存端口驱动。真正注入 iframe 的自包含引导脚本见
 * {@link SANDBOX_GUEST_BOOTSTRAP} (用 window.postMessage 落地同一协议)。
 *
 * @see .kiro/specs/ai-world-creation-platform/design.md — §5.2 L1 postMessage 协议
 */

import {
  isCapResultMessage,
  isInitMessage,
  makeCapMessage,
  type ReadonlyAssetHandle,
  type SandboxGuestMessage,
  type SandboxInitMessage,
} from './sandbox-protocol';
import type { WorldApiCapability, WorldCreationError } from '../../../../shared/types/world-creation';

// ============================================================
// §1 Transport port (environment-agnostic, no DOM dependency)
// ============================================================

/**
 * The minimal message port the guest uses to talk to the host. In a real
 * iframe this is backed by `window.postMessage` + a `message` listener; in
 * tests it can be an in-memory channel — keeping the guest logic testable
 * without a DOM.
 */
export interface GuestMessagePort {
  /** Post a guest → host message to the host. */
  postMessage(message: SandboxGuestMessage): void;
  /** Register a handler for inbound host → guest messages. */
  addMessageListener(handler: (data: unknown) => void): void;
}

// ============================================================
// §2 Frozen World_API proxy
// ============================================================

/**
 * The frozen World_API proxy exposed to experience logic inside the iframe.
 * Every call is forwarded to the host as a `cap` message; the returned Promise
 * resolves with the host's `cap.result` value or rejects with the structured
 * {@link WorldCreationError} (e.g., `CAP_DENIED`).
 */
export interface FrozenWorldApi {
  /** Protocol version the host advertised at init. */
  readonly apiVersion: string;
  /** Read-only asset handles injected at init (no ownership credentials). */
  readonly handles: ReadonlyArray<ReadonlyAssetHandle>;
  /**
   * Invoke a World_API capability. Resolves with the host result value, or
   * rejects with a structured {@link WorldCreationError} on denial/failure.
   */
  call(name: WorldApiCapability | string, args?: Record<string, unknown>): Promise<unknown>;
}

/** A pending capability call awaiting its `cap.result`. */
interface PendingCall {
  resolve: (value: unknown) => void;
  reject: (error: WorldCreationError) => void;
}

/**
 * The live guest runtime: the frozen {@link FrozenWorldApi} proxy plus the
 * message handler the host's messages should be routed into.
 */
export interface GuestRuntime {
  /** The frozen World_API proxy to hand to experience logic. */
  api: FrozenWorldApi;
}

/**
 * Create the L1 guest runtime over a {@link GuestMessagePort}.
 *
 * Wires the protocol on the guest side: it listens for the host `init` message
 * (capturing `apiVersion` + read-only handles), correlates each `cap` request
 * with its `cap.result` by id, and exposes a **frozen** World_API proxy whose
 * only power is to post `cap` messages. The proxy and its methods are
 * `Object.freeze`d so experience code cannot tamper with them to escalate.
 *
 * @param port the message port to the host (window.postMessage in a real iframe)
 * @param options optional callback invoked once the host `init` arrives
 * @returns the guest runtime exposing the frozen World_API proxy
 */
export function createGuestRuntime(
  port: GuestMessagePort,
  options?: { onInit?: (init: SandboxInitMessage) => void },
): GuestRuntime {
  const pending = new Map<string, PendingCall>();
  let seq = 0;

  // Mutable bootstrap state captured from the host `init` message.
  const state: { apiVersion: string; handles: ReadonlyAssetHandle[] } = {
    apiVersion: '0.0',
    handles: [],
  };

  port.addMessageListener((data: unknown) => {
    if (isInitMessage(data)) {
      state.apiVersion = data.apiVersion;
      state.handles = data.readonlyHandles ?? [];
      options?.onInit?.(data);
      return;
    }
    if (isCapResultMessage(data)) {
      const entry = pending.get(data.id);
      if (!entry) {
        return;
      }
      pending.delete(data.id);
      if (data.ok) {
        entry.resolve(data.value);
      } else {
        entry.reject(data.error);
      }
    }
  });

  function call(
    name: WorldApiCapability | string,
    args?: Record<string, unknown>,
  ): Promise<unknown> {
    const id = `c${++seq}`;
    return new Promise<unknown>((resolve, reject) => {
      pending.set(id, { resolve, reject });
      port.postMessage(makeCapMessage({ id, name, args }));
    });
  }

  // Build the frozen proxy. Getters expose the (post-init) captured state so a
  // late init still surfaces correctly through the frozen object.
  const api: FrozenWorldApi = Object.freeze({
    get apiVersion() {
      return state.apiVersion;
    },
    get handles() {
      return Object.freeze([...state.handles]);
    },
    call: Object.freeze(call),
  }) as FrozenWorldApi;

  return { api };
}

// ============================================================
// §3 Self-contained iframe bootstrap (injected as a frame script)
// ============================================================

/**
 * A self-contained bootstrap script (as a string) to inject into the
 * `<iframe sandbox>` document. It lands the exact same protocol as
 * {@link createGuestRuntime} but on top of the real `window.postMessage`
 * transport, then exposes a frozen `window.World_API` to experience code.
 *
 * Kept as a string (not a typed function) so it can be serialized into the
 * iframe srcdoc/script without bundling, and so it does not require DOM lib
 * types in the backend's TS config. Host-side dispatch logic lives in
 * {@link ./l1-bridge}.
 */
export const SANDBOX_GUEST_BOOTSTRAP = `(() => {
  "use strict";
  var pending = new Map();
  var seq = 0;
  var apiVersion = "0.0";
  var handles = [];
  function send(name, args) {
    var id = "c" + (++seq);
    return new Promise(function (resolve, reject) {
      pending.set(id, { resolve: resolve, reject: reject });
      parent.postMessage({ type: "cap", id: id, name: name, args: args || {} }, "*");
    });
  }
  window.addEventListener("message", function (ev) {
    var data = ev.data;
    if (!data || typeof data !== "object") return;
    if (data.type === "init") {
      apiVersion = data.apiVersion;
      handles = data.readonlyHandles || [];
      return;
    }
    if (data.type === "cap.result") {
      var entry = pending.get(data.id);
      if (!entry) return;
      pending.delete(data.id);
      if (data.ok) entry.resolve(data.value);
      else entry.reject(data.error);
    }
  });
  var api = Object.freeze({
    get apiVersion() { return apiVersion; },
    get handles() { return Object.freeze(handles.slice()); },
    call: Object.freeze(send)
  });
  Object.defineProperty(window, "World_API", { value: api, writable: false, configurable: false });
})();`;
