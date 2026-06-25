/**
 * Property 3: 能力 deny-by-default (capability deny-by-default) — task 4.2, design §4.
 *
 * World_API is the single controlled channel through which an experience can
 * touch the world. {@link dispatchCapability} enforces the non-negotiable
 * "deny-by-default" security invariant via two gates:
 *
 *   1. **Whitelist** — the capability must resolve to a {@link WorldApiCapability}
 *      (wildcard-aware for `ui.*` / `npc.*`). Anything else → `CAP_DENIED`
 *      (reason `NOT_WHITELISTED`).
 *   2. **Grant** — the capability must be matched by the experience's declared
 *      `grantedCaps`. A whitelisted-but-undeclared capability → `CAP_DENIED`
 *      (reason `NOT_GRANTED`).
 *
 * The property under test: for any capability that is NOT whitelisted, OR is
 * whitelisted but NOT in `grantedCaps`, `dispatchCapability` returns a
 * structured `CAP_DENIED` error AND writes exactly one new `CAP_DENIED` audit
 * record. Conversely, a whitelisted-and-granted capability is authorized and
 * writes no audit record.
 *
 * **Validates: Requirements 5.2, 5.5**
 */

import * as fc from 'fast-check';

import {
  createAuditCollector,
  dispatchCapability,
  isDispatchAllowed,
  isWhitelistedCapability,
  WHITELISTED_CAPABILITIES,
} from './capability-registry';
import { WorldApiCapability } from '../../../../shared/types/world-creation';

// ============================================================
// Capability whitelist (single source of truth = the enum)
// ============================================================

const WHITELISTED_CAPS: WorldApiCapability[] = Object.values(WorldApiCapability);

/** A whitelisted capability token (may be a wildcard token like `ui.*`). */
const whitelistedTokenArb = fc.constantFrom(...WHITELISTED_CAPS);

/**
 * A *concrete* whitelisted capability string. Wildcard tokens (`ui.*` / `npc.*`)
 * are expanded into concrete sub-capabilities so we exercise wildcard matching.
 */
const concreteWhitelistedCapArb: fc.Arbitrary<string> = fc.oneof(
  fc.constantFrom(
    WorldApiCapability.SceneSpawn,
    WorldApiCapability.SceneTransform,
    WorldApiCapability.SceneSetMaterial,
    WorldApiCapability.AssetImport,
    WorldApiCapability.StateKv,
    WorldApiCapability.EventOn,
    WorldApiCapability.BattleStart,
    WorldApiCapability.EconomyRequestCharge,
    WorldApiCapability.EconomyRequestPayout,
    WorldApiCapability.RpcToAgent,
    WorldApiCapability.NetFetch,
    WorldApiCapability.ComputeRun,
  ),
  // ui.* sub-capabilities
  fc.constantFrom('ui.panel', 'ui.text', 'ui.button', 'ui.toast', 'ui'),
  // npc.* sub-capabilities
  fc.constantFrom('npc.spawn', 'npc.dialogue', 'npc.behavior', 'npc'),
);

/** A capability string guaranteed NOT to resolve to any whitelisted capability. */
const nonWhitelistedCapArb: fc.Arbitrary<string> = fc
  .oneof(
    fc.constantFrom(
      'fs.read',
      'fs.write',
      'process.spawn',
      'net.raw',
      'eval.run',
      'scene.delete',
      'economy.mint',
      'state.kvv',
      'uix.toast',
      'npcx.spawn',
      'battle.stop',
      'rpc.toServer',
    ),
    fc.string({ minLength: 1, maxLength: 16 }),
  )
  .filter((s) => !isWhitelistedCapability(s));

// ============================================================
// Property 3 — deny-by-default
// ============================================================

describe('Property 3: World_API capability deny-by-default (task 4.2)', () => {
  it('denies any non-whitelisted capability and writes exactly one CAP_DENIED audit record', () => {
    fc.assert(
      fc.property(
        nonWhitelistedCapArb,
        // grantedCaps is irrelevant for a non-whitelisted cap — even "granting"
        // it (or all whitelisted caps) must not authorize it.
        fc.array(fc.oneof(whitelistedTokenArb, nonWhitelistedCapArb), { maxLength: 6 }),
        fc.option(fc.string({ maxLength: 12 }), { nil: undefined }),
        (cap, grantedCaps, sessionId) => {
          const collector = createAuditCollector();
          const before = collector.entries.length;

          const result = dispatchCapability({
            cap,
            grantedCaps: [...grantedCaps, cap], // even if "declared", still denied
            sessionId,
            audit: collector.sink,
          });

          // Denied with a structured CAP_DENIED error.
          expect(isDispatchAllowed(result)).toBe(false);
          expect(result).toMatchObject({ error: 'CAP_DENIED' });

          // Exactly one new audit record, tagged CAP_DENIED with the cap.
          expect(collector.entries.length).toBe(before + 1);
          const entry = collector.entries[collector.entries.length - 1];
          expect(entry.event).toBe('CAP_DENIED');
          expect(entry.cap).toBe(cap);
          expect(entry.reason).toBe('NOT_WHITELISTED');
          expect(entry.sessionId).toBe(sessionId);
        },
      ),
    );
  });

  it('denies a whitelisted-but-ungranted capability and writes exactly one CAP_DENIED audit record', () => {
    fc.assert(
      fc.property(
        concreteWhitelistedCapArb,
        // grantedCaps drawn only from OTHER capabilities, excluding any token
        // that would match `cap`.
        fc.array(whitelistedTokenArb, { maxLength: 6 }),
        fc.option(fc.string({ maxLength: 12 }), { nil: undefined }),
        (cap, grantedTokens, sessionId) => {
          // Remove any granted token that would authorize `cap` (wildcard-aware).
          const granted = grantedTokens.filter(
            (token) => !dispatchAuthorizes(token, cap),
          );

          const collector = createAuditCollector();
          const before = collector.entries.length;

          const result = dispatchCapability({
            cap,
            grantedCaps: granted,
            sessionId,
            audit: collector.sink,
          });

          expect(isDispatchAllowed(result)).toBe(false);
          expect(result).toMatchObject({ error: 'CAP_DENIED' });

          expect(collector.entries.length).toBe(before + 1);
          const entry = collector.entries[collector.entries.length - 1];
          expect(entry.event).toBe('CAP_DENIED');
          expect(entry.cap).toBe(cap);
          expect(entry.reason).toBe('NOT_GRANTED');
          expect(entry.sessionId).toBe(sessionId);
        },
      ),
    );
  });

  it('authorizes a whitelisted-and-granted capability and writes no audit record', () => {
    fc.assert(
      fc.property(
        concreteWhitelistedCapArb,
        fc.array(whitelistedTokenArb, { maxLength: 6 }),
        (cap, otherTokens) => {
          const collector = createAuditCollector();

          // Grant a token that authorizes `cap`: prefer the matching wildcard
          // token if `cap` is a sub-capability, otherwise grant `cap` itself.
          const grantingToken = WHITELISTED_CAPS.find((t) => dispatchAuthorizes(t, cap)) ?? cap;
          const result = dispatchCapability({
            cap,
            grantedCaps: [...otherTokens, grantingToken],
            audit: collector.sink,
          });

          expect(isDispatchAllowed(result)).toBe(true);
          expect(result).toMatchObject({ ok: true, cap });
          // A successful authorization produces no CAP_DENIED audit entry.
          expect(collector.entries.length).toBe(0);
        },
      ),
    );
  });
});

// ============================================================
// Test helper — wildcard-aware "does token authorize cap?"
// Mirrors the registry's internal matching so the test can construct
// granted-set membership precisely without importing private symbols.
// ============================================================

function dispatchAuthorizes(token: string, requested: string): boolean {
  if (token === requested) {
    return true;
  }
  if (token.endsWith('.*')) {
    const prefix = token.slice(0, -2);
    return requested === prefix || requested.startsWith(`${prefix}.`);
  }
  return false;
}

// Sanity: the whitelist is non-empty and derived from the enum.
describe('capability whitelist sanity', () => {
  it('mirrors the WorldApiCapability enum', () => {
    expect(WHITELISTED_CAPABILITIES.size).toBe(WHITELISTED_CAPS.length);
    for (const cap of WHITELISTED_CAPS) {
      expect(WHITELISTED_CAPABILITIES.has(cap)).toBe(true);
    }
  });
});
