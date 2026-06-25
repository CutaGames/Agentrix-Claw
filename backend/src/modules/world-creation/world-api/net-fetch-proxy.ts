/**
 * NetFetchProxy — `net.fetch` host 代理 (design §4 World_API, R5.2/5.3, task 4.3).
 *
 * `net.fetch` 是体验影响外部世界的**唯一出网通道**。World_API 绝不暴露 raw
 * network (R5.2)，因此本代理是结构上唯一的出口，并对每一次出网请求强制施加
 * 三道闸门，全部经审计 (R5.3 "host 代理 + 限流 + 审计"):
 *
 *   1. **能力闸门 (deny-by-default)**: 复用 {@link dispatchCapability} —— 体验必须
 *      在白名单且其 `grantedCaps` 已声明 `net.fetch`，否则 `CAP_DENIED` + 审计。
 *   2. **目标闸门 (域名白名单)**: 只允许 https 且 host 命中可配置的域名白名单
 *      (支持 `*.example.com` 子域通配)；白名单外目标一律拒绝 (design §10 "出网目标
 *      白名单外")。
 *   3. **限流闸门 (per-session 滑动窗口)**: 每个沙箱会话在窗口内的出网次数有上限，
 *      超出即 `RESOURCE_EXCEEDED` + 审计，防止出网滥用 / 资源炸弹。
 *
 * 通过全部闸门后，请求经注入的 `fetchImpl` (host 侧 fetch) 发出并审计为
 * `NET_FETCH_ALLOWED`。所有可变依赖 (时钟 `now`、`fetchImpl`、审计 sink) 均可注入，
 * 因此本类是**确定性、可被单元测试直接驱动**的 (task 4.4: 出网限流与审计)。
 *
 * 本模块只实现 host 侧出网代理；沙箱 ↔ host 的 postMessage 传输见 task 5.x，不在此实现。
 *
 * @see .kiro/specs/ai-world-creation-platform/design.md — §4 World_API 能力模型
 */

import {
  WorldApiCapability,
  WorldCreationError,
} from '../../../../shared/types/world-creation';
import {
  dispatchCapability,
  isDispatchAllowed,
  type CapabilityAuditSink,
} from './capability-registry';

// ============================================================
// §1 Defaults
// ============================================================

/** Default per-session rate-limit window (R5.3), in milliseconds. */
export const DEFAULT_NET_FETCH_WINDOW_MS = 60_000;

/** Default max `net.fetch` calls per session within {@link DEFAULT_NET_FETCH_WINDOW_MS}. */
export const DEFAULT_NET_FETCH_MAX_REQUESTS = 30;

/** The only URL scheme allowed through the egress proxy. */
export const ALLOWED_NET_FETCH_SCHEME = 'https:';

// ============================================================
// §2 Egress audit (R5.3 "audited")
// ============================================================

/** Outcome kinds recorded for every egress attempt through the proxy. */
export type NetFetchAuditEvent =
  /** Request passed all gates and was dispatched to `fetchImpl`. */
  | 'NET_FETCH_ALLOWED'
  /** Denied: `net.fetch` capability not whitelisted/granted (mirrors CAP_DENIED). */
  | 'NET_FETCH_CAP_DENIED'
  /** Denied: URL was malformed or used a non-https scheme. */
  | 'NET_FETCH_DENIED_SCHEME'
  /** Denied: target host is not in the egress allowlist. */
  | 'NET_FETCH_DENIED_HOST'
  /** Denied: per-session rate limit exceeded. */
  | 'NET_FETCH_RATE_LIMITED';

/** A single egress audit log entry written for every `net.fetch` attempt. */
export interface NetFetchAuditEntry {
  /** Egress audit event kind. */
  event: NetFetchAuditEvent;
  /** The requested URL (best-effort; raw string if it failed to parse). */
  url: string;
  /** The resolved host, or empty string if the URL could not be parsed. */
  host: string;
  /** The HTTP method (uppercased), defaulting to GET. */
  method: string;
  /** Optional sandbox session id the request originated from. */
  sessionId?: string;
  /** Human-readable detail mirroring the structured error detail. */
  detail: string;
  /** Unix epoch millis when the entry was recorded. */
  ts: number;
}

/** Injectable egress audit sink. Tests can collect entries in memory. */
export type NetFetchAuditSink = (entry: NetFetchAuditEntry) => void;

/** A no-op egress audit sink used when none is injected. */
const NOOP_NET_FETCH_AUDIT: NetFetchAuditSink = () => {
  /* intentionally empty */
};

/**
 * An in-memory egress audit collector: a {@link NetFetchAuditSink} plus the
 * ordered list of entries it received. Convenient for unit tests asserting that
 * an egress attempt was allowed / denied / rate-limited and audited.
 */
export interface NetFetchAuditCollector {
  /** The sink to pass into a {@link NetFetchProxy}. */
  sink: NetFetchAuditSink;
  /** All egress entries received so far, in arrival order. */
  entries: NetFetchAuditEntry[];
}

/** Create an in-memory {@link NetFetchAuditCollector}. */
export function createNetFetchAuditCollector(): NetFetchAuditCollector {
  const entries: NetFetchAuditEntry[] = [];
  return {
    entries,
    sink: (entry) => {
      entries.push(entry);
    },
  };
}

// ============================================================
// §3 Per-session sliding-window rate limiter (R5.3 "rate-limited")
// ============================================================

/**
 * A minimal per-key sliding-window counter. Keeps the timestamps of recent
 * allowed events per key and rejects once `maxRequests` would be exceeded
 * within `windowMs`. The clock is injectable for deterministic tests.
 */
export class SlidingWindowRateLimiter {
  private readonly hits = new Map<string, number[]>();

  constructor(
    private readonly maxRequests: number,
    private readonly windowMs: number,
    private readonly now: () => number = () => Date.now(),
  ) {}

  /**
   * Try to consume one slot for `key`. Returns `true` if within budget (and
   * records the hit), `false` if the limit is exceeded.
   */
  tryConsume(key: string): boolean {
    const at = this.now();
    const cutoff = at - this.windowMs;
    const recent = (this.hits.get(key) ?? []).filter((t) => t > cutoff);

    if (recent.length >= this.maxRequests) {
      this.hits.set(key, recent);
      return false;
    }

    recent.push(at);
    this.hits.set(key, recent);
    return true;
  }

  /** Current count of in-window hits for `key` (for assertions/metrics). */
  countWithinWindow(key: string): number {
    const cutoff = this.now() - this.windowMs;
    return (this.hits.get(key) ?? []).filter((t) => t > cutoff).length;
  }
}

// ============================================================
// §4 Host-side fetch abstraction
// ============================================================

/** A non-authoritative request shape forwarded through the proxy. */
export interface NetFetchRequest {
  /** Absolute target URL (must be https and host-allowlisted). */
  url: string;
  /** HTTP method; defaults to GET. */
  method?: string;
  /** Optional request headers. */
  headers?: Record<string, string>;
  /** Optional request body (already serialized by the caller). */
  body?: string;
}

/** A minimal response surface returned to the experience. */
export interface NetFetchResponse {
  /** HTTP status code. */
  status: number;
  /** Response headers. */
  headers: Record<string, string>;
  /** Response body as text. */
  body: string;
}

/**
 * The host-side fetch implementation injected into the proxy. Abstracted so the
 * proxy never touches a global/raw network API directly and so unit tests can
 * stub egress without making real network calls.
 */
export type HostFetchImpl = (req: NetFetchRequest) => Promise<NetFetchResponse>;

// ============================================================
// §5 NetFetchProxy
// ============================================================

/** Options to construct a {@link NetFetchProxy}. */
export interface NetFetchProxyOptions {
  /**
   * Egress host allowlist. Entries may be exact hosts (`api.example.com`) or a
   * single-label subdomain wildcard (`*.example.com`, matching any subdomain of
   * `example.com` as well as `example.com` itself). Empty ⇒ all egress denied.
   */
  allowedHosts: ReadonlyArray<string>;
  /** Max requests per session within {@link windowMs}. Defaults to 30. */
  maxRequestsPerWindow?: number;
  /** Rate-limit window in milliseconds. Defaults to 60s. */
  windowMs?: number;
  /** Host-side fetch implementation (injected; never a raw global). */
  fetchImpl: HostFetchImpl;
  /** Egress audit sink. Defaults to a no-op. */
  audit?: NetFetchAuditSink;
  /** Injectable clock for deterministic rate-limit tests. */
  now?: () => number;
}

/** Successful proxied egress result. */
export interface NetFetchOk {
  ok: true;
  /** The resolved host the request was sent to. */
  host: string;
  /** The host-side response. */
  response: NetFetchResponse;
}

/** Result of {@link NetFetchProxy.fetch}: success or a structured error. */
export type NetFetchResult = NetFetchOk | WorldCreationError;

/**
 * The single, audited, rate-limited egress channel for `net.fetch` (R5.2/5.3).
 *
 * Construct once per host context with an allowlist + injected `fetchImpl`, then
 * call {@link fetch} for every experience-initiated egress. The proxy enforces
 * capability → target → rate gates in order and audits every outcome.
 */
export class NetFetchProxy {
  private readonly allowedHosts: ReadonlyArray<string>;
  private readonly fetchImpl: HostFetchImpl;
  private readonly audit: NetFetchAuditSink;
  private readonly now: () => number;
  private readonly rateLimiter: SlidingWindowRateLimiter;

  constructor(options: NetFetchProxyOptions) {
    this.allowedHosts = options.allowedHosts.map((h) => h.toLowerCase());
    this.fetchImpl = options.fetchImpl;
    this.audit = options.audit ?? NOOP_NET_FETCH_AUDIT;
    this.now = options.now ?? (() => Date.now());
    this.rateLimiter = new SlidingWindowRateLimiter(
      options.maxRequestsPerWindow ?? DEFAULT_NET_FETCH_MAX_REQUESTS,
      options.windowMs ?? DEFAULT_NET_FETCH_WINDOW_MS,
      this.now,
    );
  }

  /**
   * Proxy a single `net.fetch` egress request through all gates.
   *
   * @param request the egress request (url/method/headers/body)
   * @param grantedCaps capabilities declared/authorized for the experience
   * @param sessionId optional sandbox session id (rate-limit key + audit)
   * @returns `{ ok: true, host, response }` on success, otherwise a structured error
   */
  async fetch(
    request: NetFetchRequest,
    grantedCaps: ReadonlyArray<WorldApiCapability | string>,
    sessionId?: string,
  ): Promise<NetFetchResult> {
    const method = (request.method ?? 'GET').toUpperCase();

    // (1) Capability gate — deny-by-default via the shared registry. Denials are
    // audited by the registry; we additionally record an egress audit entry.
    const capAudit: CapabilityAuditSink = (entry) => {
      this.emit('NET_FETCH_CAP_DENIED', request.url, '', method, sessionId, entry.detail);
    };
    const dispatch = dispatchCapability({
      cap: WorldApiCapability.NetFetch,
      grantedCaps,
      sessionId,
      audit: capAudit,
    });
    if (!isDispatchAllowed(dispatch)) {
      return dispatch;
    }

    // (2) Target gate — parse URL, require https, enforce host allowlist.
    let parsed: URL;
    try {
      parsed = new URL(request.url);
    } catch {
      return this.deny(
        'NET_FETCH_DENIED_SCHEME',
        'CAP_DENIED',
        request.url,
        '',
        method,
        sessionId,
        `net.fetch URL is malformed: "${request.url}"`,
      );
    }

    const host = parsed.hostname.toLowerCase();

    if (parsed.protocol !== ALLOWED_NET_FETCH_SCHEME) {
      return this.deny(
        'NET_FETCH_DENIED_SCHEME',
        'CAP_DENIED',
        request.url,
        host,
        method,
        sessionId,
        `net.fetch only permits ${ALLOWED_NET_FETCH_SCHEME} egress, got "${parsed.protocol}"`,
      );
    }

    if (!this.isHostAllowed(host)) {
      return this.deny(
        'NET_FETCH_DENIED_HOST',
        'CAP_DENIED',
        request.url,
        host,
        method,
        sessionId,
        `host "${host}" is not in the net.fetch egress allowlist`,
      );
    }

    // (3) Rate gate — per-session sliding window.
    const rateKey = sessionId ?? '__anonymous__';
    if (!this.rateLimiter.tryConsume(rateKey)) {
      return this.deny(
        'NET_FETCH_RATE_LIMITED',
        'RESOURCE_EXCEEDED',
        request.url,
        host,
        method,
        sessionId,
        `net.fetch rate limit exceeded for session "${rateKey}"`,
      );
    }

    // All gates passed — perform the host-proxied egress and audit success.
    const response = await this.fetchImpl({ ...request, method });
    this.emit(
      'NET_FETCH_ALLOWED',
      request.url,
      host,
      method,
      sessionId,
      `net.fetch ${method} ${host} -> ${response.status}`,
    );
    return { ok: true, host, response };
  }

  /** Whether `host` matches an exact or `*.`-wildcard allowlist entry. */
  private isHostAllowed(host: string): boolean {
    return this.allowedHosts.some((entry) => {
      if (entry === host) {
        return true;
      }
      if (entry.startsWith('*.')) {
        const baseDomain = entry.slice(2); // "*.example.com" -> "example.com"
        return host === baseDomain || host.endsWith(`.${baseDomain}`);
      }
      return false;
    });
  }

  /** Audit a denial and return the matching structured error. */
  private deny(
    auditEvent: NetFetchAuditEvent,
    errorCode: WorldCreationError['error'],
    url: string,
    host: string,
    method: string,
    sessionId: string | undefined,
    detail: string,
  ): WorldCreationError {
    this.emit(auditEvent, url, host, method, sessionId, detail);
    return { error: errorCode, detail };
  }

  /** Write a single egress audit entry through the injected sink. */
  private emit(
    event: NetFetchAuditEvent,
    url: string,
    host: string,
    method: string,
    sessionId: string | undefined,
    detail: string,
  ): void {
    this.audit({ event, url, host, method, sessionId, detail, ts: this.now() });
  }
}
