import {
  dispatchCapMessage,
  createHostBridge,
  type SandboxDispatchContext,
} from './l1-bridge';
import { makeCapMessage, type SandboxCapResultMessage } from './sandbox-protocol';
import { createAuditCollector } from '../world-api/capability-registry';
import { WorldApiCapability } from '../../../../shared/types/world-creation';

/**
 * Unit tests for the L1 host bridge dispatch (design §5.2, R5.5/R6.2).
 *
 * Verifies the host-side, pure capability dispatch: authorized caps run via the
 * injected executor; unauthorized/unwhitelisted/malformed caps return CAP_DENIED
 * and produce an audit entry (deny-by-default delegated to capability-registry,
 * not duplicated here).
 */
describe('dispatchCapMessage (L1 host dispatch)', () => {
  it('authorizes a granted, whitelisted cap and returns the executor value', async () => {
    const ctx: SandboxDispatchContext = {
      sessionId: 's1',
      grantedCaps: [WorldApiCapability.Ui],
      executor: async ({ cap, args }) => ({ echoed: cap, args }),
    };

    const result = await dispatchCapMessage(
      makeCapMessage({ id: 'm1', name: 'ui.toast', args: { text: 'hi' } }),
      ctx,
    );

    expect(result).toEqual({
      type: 'cap.result',
      id: 'm1',
      ok: true,
      value: { echoed: 'ui.toast', args: { text: 'hi' } },
    });
  });

  it('denies a whitelisted-but-not-granted cap with CAP_DENIED and audits it', async () => {
    const audit = createAuditCollector();
    const ctx: SandboxDispatchContext = {
      sessionId: 's2',
      grantedCaps: [WorldApiCapability.Ui], // economy.* not granted
      audit: audit.sink,
    };

    const result = await dispatchCapMessage(
      makeCapMessage({ id: 'm2', name: 'economy.requestCharge', args: { amountRef: 'cart.total' } }),
      ctx,
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.error).toBe('CAP_DENIED');
    }
    expect(audit.entries).toHaveLength(1);
    expect(audit.entries[0]).toMatchObject({
      event: 'CAP_DENIED',
      cap: 'economy.requestCharge',
      reason: 'NOT_GRANTED',
      sessionId: 's2',
    });
  });

  it('denies a non-whitelisted cap with CAP_DENIED (reason NOT_WHITELISTED)', async () => {
    const audit = createAuditCollector();
    const result = await dispatchCapMessage(
      makeCapMessage({ id: 'm3', name: 'fs.readFile', args: { path: '/etc/passwd' } }),
      { sessionId: 's3', grantedCaps: ['fs.readFile'], audit: audit.sink },
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.error).toBe('CAP_DENIED');
    }
    expect(audit.entries[0]).toMatchObject({ reason: 'NOT_WHITELISTED', cap: 'fs.readFile' });
  });

  it('treats a malformed message as CAP_DENIED without throwing', async () => {
    const result = await dispatchCapMessage(
      { type: 'cap', id: 'm4' } as unknown,
      { grantedCaps: [WorldApiCapability.Ui] },
    );
    expect(result).toEqual({
      type: 'cap.result',
      id: 'm4',
      ok: false,
      error: { error: 'CAP_DENIED', detail: 'malformed capability message' },
    });
  });

  it('returns a structured error when the executor throws', async () => {
    const ctx: SandboxDispatchContext = {
      grantedCaps: [WorldApiCapability.StateKv],
      executor: () => {
        throw new Error('boom');
      },
    };
    const result = await dispatchCapMessage(
      makeCapMessage({ id: 'm5', name: 'state.kv', args: {} }),
      ctx,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.detail).toContain('boom');
    }
  });

  it('resolves wildcard ui.* grant for concrete ui sub-capabilities', async () => {
    const result = await dispatchCapMessage(
      makeCapMessage({ id: 'm6', name: 'ui.panel', args: {} }),
      { grantedCaps: ['ui.*'], executor: () => 'ok' },
    );
    expect(result).toEqual({ type: 'cap.result', id: 'm6', ok: true, value: 'ok' });
  });
});

describe('createHostBridge', () => {
  it('posts the cap.result back through the transport', async () => {
    const posted: SandboxCapResultMessage[] = [];
    const bridge = createHostBridge({
      sessionId: 's-bridge',
      grantedCaps: [WorldApiCapability.Ui],
      transport: { postMessage: (m) => posted.push(m) },
      executor: () => 'done',
    });

    const result = await bridge.handleGuestMessage(
      makeCapMessage({ id: 'b1', name: 'ui.toast', args: { text: 'x' } }),
    );

    expect(result).toEqual({ type: 'cap.result', id: 'b1', ok: true, value: 'done' });
    expect(posted).toEqual([result]);
    expect(bridge.sessionId).toBe('s-bridge');
  });

  it('posts a CAP_DENIED cap.result for an ungranted capability', async () => {
    const posted: SandboxCapResultMessage[] = [];
    const bridge = createHostBridge({
      sessionId: 's-deny',
      grantedCaps: [],
      transport: { postMessage: (m) => posted.push(m) },
    });

    await bridge.handleGuestMessage(makeCapMessage({ id: 'b2', name: 'battle.start' }));

    expect(posted).toHaveLength(1);
    expect(posted[0].ok).toBe(false);
  });
});
