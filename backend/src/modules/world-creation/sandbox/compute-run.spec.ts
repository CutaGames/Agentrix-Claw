/**
 * compute.run capability authorization — unit tests (task 5.2, R5.6).
 *
 * Verifies the host-side gate that precedes L2 WASM execution:
 *   - a module declaring `compute.run` is authorized;
 *   - a module NOT declaring it is denied with `CAP_DENIED` + an audit record;
 *   - returned-intent capabilities are deny-by-default against the module grant;
 *   - request shaping refuses to build a request for an un-granted module.
 *
 * The actual untrusted compute runs in the desktop Rust `world_sandbox`; these
 * tests cover the authorization layer only (no WASM engine required).
 */

import {
  WorldApiCapability,
  type LogicModuleRef,
} from '../../../../shared/types/world-creation';
import { createAuditCollector } from '../world-api/capability-registry';
import {
  authorizeComputeRun,
  authorizeIntent,
  buildComputeRunRequest,
} from './compute-run';

function moduleWith(caps: WorldApiCapability[]): LogicModuleRef {
  return {
    moduleId: 'td_core',
    runtime: 'wasm',
    entry: 'tick',
    capabilities: caps,
    hash: 'sha256:deadbeef',
    reviewStatus: 'passed',
  };
}

describe('authorizeComputeRun', () => {
  it('authorizes a module that declared compute.run', () => {
    const module = moduleWith([
      WorldApiCapability.ComputeRun,
      WorldApiCapability.SceneTransform,
    ]);
    expect(authorizeComputeRun({ module })).toEqual({ ok: true });
  });

  it('denies a module that did not declare compute.run and audits it', () => {
    const audit = createAuditCollector();
    const module = moduleWith([WorldApiCapability.SceneTransform]);

    const result = authorizeComputeRun({ module, sessionId: 's1', audit: audit.sink });

    expect(result).toEqual({
      error: 'CAP_DENIED',
      detail: expect.stringContaining('compute.run'),
    });
    expect(audit.entries).toHaveLength(1);
    expect(audit.entries[0]).toMatchObject({
      event: 'CAP_DENIED',
      cap: 'compute.run',
      reason: 'NOT_GRANTED',
      sessionId: 's1',
    });
  });
});

describe('authorizeIntent', () => {
  const module = moduleWith([
    WorldApiCapability.ComputeRun,
    WorldApiCapability.SceneTransform,
    WorldApiCapability.StateKv,
  ]);

  it('allows an intent capability the module declared', () => {
    expect(authorizeIntent(WorldApiCapability.SceneTransform, module)).toEqual({
      ok: true,
      cap: 'scene.transform',
    });
  });

  it('denies an intent capability the module did not declare', () => {
    const result = authorizeIntent(WorldApiCapability.EconomyRequestCharge, module);
    expect(result).toEqual({
      error: 'CAP_DENIED',
      detail: expect.stringContaining('economy.requestCharge'),
    });
  });
});

describe('buildComputeRunRequest', () => {
  it('shapes a serde-compatible request when authorized', () => {
    const module = moduleWith([WorldApiCapability.ComputeRun]);
    const bytes = new Uint8Array([0, 97, 115, 109]);

    const req = buildComputeRunRequest(module, bytes, { dtMs: 16 }, { fuel: 5000 });

    expect(req).toEqual({
      module_id: 'td_core',
      entry: 'tick',
      capabilities: ['compute.run'],
      wasm_bytes: [0, 97, 115, 109],
      input: { dtMs: 16 },
      fuel: 5000,
    });
  });

  it('throws when the module is not authorized for compute.run', () => {
    const module = moduleWith([WorldApiCapability.SceneTransform]);
    expect(() => buildComputeRunRequest(module, [0, 97, 115, 109], {})).toThrow(
      /CAP_DENIED/,
    );
  });
});
