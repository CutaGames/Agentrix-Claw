/**
 * NetFetchProxy unit tests — task 4.4 (出网限流与审计), design §4 World_API, R5.2/5.3.
 *
 * `net.fetch` is the single audited, rate-limited egress channel. These tests
 * drive the proxy deterministically by injecting:
 *   - a stub `fetchImpl` (no real network),
 *   - a fixed/controllable `now` clock (for the sliding window), and
 *   - an in-memory audit collector ({@link createNetFetchAuditCollector}).
 *
 * Coverage:
 *   (1) net.fetch not granted        → CAP_DENIED      + NET_FETCH_CAP_DENIED audit
 *   (2) non-https / non-allowlist host→ CAP_DENIED      + NET_FETCH_DENIED_* audit
 *   (3) over per-session window       → RESOURCE_EXCEEDED + NET_FETCH_RATE_LIMITED,
 *                                       then recovers after the window slides
 *   (4) all gates pass                → fetchImpl invoked + NET_FETCH_ALLOWED audit
 *
 * @see backend/src/modules/world-creation/world-api/net-fetch-proxy.ts
 */

import {
  NetFetchProxy,
  createNetFetchAuditCollector,
  SlidingWindowRateLimiter,
  type HostFetchImpl,
  type NetFetchRequest,
  type NetFetchResponse,
} from './net-fetch-proxy';
import { WorldApiCapability } from '../../../../shared/types/world-creation';

// ============================================================
// Test helpers
// ============================================================

const GRANTED_WITH_NET = [WorldApiCapability.NetFetch];
const GRANTED_WITHOUT_NET = [WorldApiCapability.SceneSpawn];

const OK_RESPONSE: NetFetchResponse = {
  status: 200,
  headers: { 'content-type': 'application/json' },
  body: '{"ok":true}',
};

/** Build a stub fetchImpl that records calls and returns a canned response. */
function makeStubFetch(): { impl: HostFetchImpl; calls: NetFetchRequest[] } {
  const calls: NetFetchRequest[] = [];
  const impl: HostFetchImpl = async (req) => {
    calls.push(req);
    return OK_RESPONSE;
  };
  return { impl, calls };
}

/** A mutable clock for deterministic sliding-window tests. */
function makeClock(start = 1_000_000): { now: () => number; advance: (ms: number) => void } {
  let t = start;
  return {
    now: () => t,
    advance: (ms: number) => {
      t += ms;
    },
  };
}

// ============================================================
// (1) Capability gate — net.fetch not granted
// ============================================================

describe('NetFetchProxy — capability gate (R5.2/5.5)', () => {
  it('denies egress with CAP_DENIED and audits when net.fetch is not granted', async () => {
    const audit = createNetFetchAuditCollector();
    const { impl, calls } = makeStubFetch();
    const proxy = new NetFetchProxy({
      allowedHosts: ['api.example.com'],
      fetchImpl: impl,
      audit: audit.sink,
    });

    const result = await proxy.fetch(
      { url: 'https://api.example.com/v1' },
      GRANTED_WITHOUT_NET,
      'sess-1',
    );

    expect('ok' in result).toBe(false);
    expect(result).toMatchObject({ error: 'CAP_DENIED' });
    // fetchImpl must never run on a denied call.
    expect(calls).toHaveLength(0);
    // The denial is audited as an egress CAP_DENIED event.
    expect(audit.entries.some((e) => e.event === 'NET_FETCH_CAP_DENIED')).toBe(true);
  });
});

// ============================================================
// (2) Target gate — scheme + host allowlist
// ============================================================

describe('NetFetchProxy — target gate (design §10 egress allowlist)', () => {
  it('rejects non-https egress with CAP_DENIED and a scheme audit', async () => {
    const audit = createNetFetchAuditCollector();
    const { impl, calls } = makeStubFetch();
    const proxy = new NetFetchProxy({
      allowedHosts: ['api.example.com'],
      fetchImpl: impl,
      audit: audit.sink,
    });

    const result = await proxy.fetch(
      { url: 'http://api.example.com/v1' },
      GRANTED_WITH_NET,
      'sess-1',
    );

    expect(result).toMatchObject({ error: 'CAP_DENIED' });
    expect(calls).toHaveLength(0);
    expect(audit.entries.some((e) => e.event === 'NET_FETCH_DENIED_SCHEME')).toBe(true);
  });

  it('rejects a host outside the allowlist with CAP_DENIED and a host audit', async () => {
    const audit = createNetFetchAuditCollector();
    const { impl, calls } = makeStubFetch();
    const proxy = new NetFetchProxy({
      allowedHosts: ['api.example.com'],
      fetchImpl: impl,
      audit: audit.sink,
    });

    const result = await proxy.fetch(
      { url: 'https://evil.example.net/steal' },
      GRANTED_WITH_NET,
      'sess-1',
    );

    expect(result).toMatchObject({ error: 'CAP_DENIED' });
    expect(calls).toHaveLength(0);
    expect(audit.entries.some((e) => e.event === 'NET_FETCH_DENIED_HOST')).toBe(true);
  });

  it('allows a subdomain matched by a *.wildcard allowlist entry', async () => {
    const audit = createNetFetchAuditCollector();
    const { impl, calls } = makeStubFetch();
    const proxy = new NetFetchProxy({
      allowedHosts: ['*.example.com'],
      fetchImpl: impl,
      audit: audit.sink,
    });

    const result = await proxy.fetch(
      { url: 'https://cdn.example.com/asset.glb' },
      GRANTED_WITH_NET,
      'sess-1',
    );

    expect('ok' in result && result.ok).toBe(true);
    expect(calls).toHaveLength(1);
  });
});

// ============================================================
// (3) Rate gate — per-session sliding window
// ============================================================

describe('NetFetchProxy — rate gate (R5.3 rate-limited)', () => {
  it('blocks once the per-session window budget is exceeded then recovers after it slides', async () => {
    const clock = makeClock();
    const audit = createNetFetchAuditCollector();
    const { impl, calls } = makeStubFetch();
    const proxy = new NetFetchProxy({
      allowedHosts: ['api.example.com'],
      fetchImpl: impl,
      audit: audit.sink,
      now: clock.now,
      windowMs: 1_000,
      maxRequestsPerWindow: 2,
    });

    const req: NetFetchRequest = { url: 'https://api.example.com/v1' };

    // First two requests within the window pass.
    const r0 = await proxy.fetch(req, GRANTED_WITH_NET, 'sess-1');
    expect('ok' in r0 && r0.ok).toBe(true);
    const r1 = await proxy.fetch(req, GRANTED_WITH_NET, 'sess-1');
    expect('ok' in r1 && r1.ok).toBe(true);

    // Third within the same window is rate-limited.
    const blocked = await proxy.fetch(req, GRANTED_WITH_NET, 'sess-1');
    expect(blocked).toMatchObject({ error: 'RESOURCE_EXCEEDED' });
    expect(audit.entries.some((e) => e.event === 'NET_FETCH_RATE_LIMITED')).toBe(true);
    expect(calls).toHaveLength(2); // blocked call did not reach fetchImpl

    // Slide the window past the budget — the limit recovers.
    clock.advance(1_001);
    const recovered = await proxy.fetch(req, GRANTED_WITH_NET, 'sess-1');
    expect('ok' in recovered && recovered.ok).toBe(true);
    expect(calls).toHaveLength(3);
  });

  it('rate-limits per session independently', async () => {
    const clock = makeClock();
    const { impl } = makeStubFetch();
    const proxy = new NetFetchProxy({
      allowedHosts: ['api.example.com'],
      fetchImpl: impl,
      now: clock.now,
      windowMs: 1_000,
      maxRequestsPerWindow: 1,
    });
    const req: NetFetchRequest = { url: 'https://api.example.com/v1' };

    const a1 = await proxy.fetch(req, GRANTED_WITH_NET, 'sess-A');
    expect('ok' in a1 && a1.ok).toBe(true);
    // sess-A is now exhausted...
    expect(await proxy.fetch(req, GRANTED_WITH_NET, 'sess-A')).toMatchObject({
      error: 'RESOURCE_EXCEEDED',
    });
    // ...but a different session is unaffected.
    const b1 = await proxy.fetch(req, GRANTED_WITH_NET, 'sess-B');
    expect('ok' in b1 && b1.ok).toBe(true);
  });
});

// ============================================================
// (4) Happy path — all gates pass
// ============================================================

describe('NetFetchProxy — all gates pass (R5.3 host-proxied + audited)', () => {
  it('invokes fetchImpl, returns the response, and audits NET_FETCH_ALLOWED', async () => {
    const clock = makeClock();
    const audit = createNetFetchAuditCollector();
    const { impl, calls } = makeStubFetch();
    const proxy = new NetFetchProxy({
      allowedHosts: ['api.example.com'],
      fetchImpl: impl,
      audit: audit.sink,
      now: clock.now,
    });

    const result = await proxy.fetch(
      { url: 'https://api.example.com/v1/data', method: 'post', body: '{}' },
      GRANTED_WITH_NET,
      'sess-1',
    );

    expect('ok' in result && result.ok).toBe(true);
    if ('ok' in result && result.ok) {
      expect(result.host).toBe('api.example.com');
      expect(result.response).toEqual(OK_RESPONSE);
    }

    // The egress was forwarded with an uppercased method.
    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe('POST');
    expect(calls[0].url).toBe('https://api.example.com/v1/data');

    // Exactly one allowed audit entry, stamped with the injected clock.
    const allowed = audit.entries.filter((e) => e.event === 'NET_FETCH_ALLOWED');
    expect(allowed).toHaveLength(1);
    expect(allowed[0].host).toBe('api.example.com');
    expect(allowed[0].ts).toBe(clock.now());
  });
});

// ============================================================
// SlidingWindowRateLimiter — focused unit coverage
// ============================================================

describe('SlidingWindowRateLimiter', () => {
  it('counts in-window hits and evicts expired ones as the clock advances', () => {
    const clock = makeClock();
    const limiter = new SlidingWindowRateLimiter(3, 1_000, clock.now);

    expect(limiter.tryConsume('k')).toBe(true);
    expect(limiter.tryConsume('k')).toBe(true);
    expect(limiter.tryConsume('k')).toBe(true);
    expect(limiter.countWithinWindow('k')).toBe(3);

    // Budget exhausted within the window.
    expect(limiter.tryConsume('k')).toBe(false);

    // Advance beyond the window — old hits expire, budget restored.
    clock.advance(1_001);
    expect(limiter.countWithinWindow('k')).toBe(0);
    expect(limiter.tryConsume('k')).toBe(true);
  });
});
