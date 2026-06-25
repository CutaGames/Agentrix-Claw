import { createGuestRuntime, type GuestMessagePort } from './sandbox-guest';
import {
  makeCapResultOk,
  makeCapResultError,
  makeInitMessage,
  type SandboxGuestMessage,
} from './sandbox-protocol';

/**
 * Unit tests for the L1 guest runtime (design §5.2, R6.2).
 *
 * Verifies the frozen World_API proxy: init captures handles/version, calls are
 * posted as `cap` messages and resolve/reject on the correlated `cap.result`,
 * and the exposed proxy is frozen so experience code cannot tamper with it.
 */

/** A simple in-memory message port pairing guest↔host without a DOM. */
function makeMemoryPort(): {
  port: GuestMessagePort;
  sent: SandboxGuestMessage[];
  deliver: (data: unknown) => void;
} {
  const sent: SandboxGuestMessage[] = [];
  let listener: ((data: unknown) => void) | undefined;
  return {
    sent,
    deliver: (data) => listener?.(data),
    port: {
      postMessage: (m) => sent.push(m),
      addMessageListener: (h) => {
        listener = h;
      },
    },
  };
}

describe('createGuestRuntime (L1 frozen World_API proxy)', () => {
  it('captures apiVersion and read-only handles from the init message', () => {
    const { port, deliver } = makeMemoryPort();
    const runtime = createGuestRuntime(port);

    deliver(
      makeInitMessage({
        grantedCaps: ['ui.*'],
        readonlyHandles: [{ id: 'wa_1', kind: 'world_asset', display: { name: 'Hero' } }],
      }),
    );

    expect(runtime.api.apiVersion).toBe('1.0');
    expect(runtime.api.handles).toEqual([
      { id: 'wa_1', kind: 'world_asset', display: { name: 'Hero' } },
    ]);
  });

  it('posts a cap message and resolves on the correlated ok result', async () => {
    const { port, sent, deliver } = makeMemoryPort();
    const runtime = createGuestRuntime(port);

    const promise = runtime.api.call('ui.toast', { text: 'hello' });

    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ type: 'cap', name: 'ui.toast', args: { text: 'hello' } });

    deliver(makeCapResultOk(sent[0].id, { shown: true }));
    await expect(promise).resolves.toEqual({ shown: true });
  });

  it('rejects with the structured error on a failed result', async () => {
    const { port, sent, deliver } = makeMemoryPort();
    const runtime = createGuestRuntime(port);

    const promise = runtime.api.call('economy.requestCharge');
    deliver(makeCapResultError(sent[0].id, { error: 'CAP_DENIED', detail: 'nope' }));

    await expect(promise).rejects.toEqual({ error: 'CAP_DENIED', detail: 'nope' });
  });

  it('correlates concurrent calls by id', async () => {
    const { port, sent, deliver } = makeMemoryPort();
    const runtime = createGuestRuntime(port);

    const p1 = runtime.api.call('state.kv', { key: 'a' });
    const p2 = runtime.api.call('state.kv', { key: 'b' });

    // Resolve out of order.
    deliver(makeCapResultOk(sent[1].id, 'second'));
    deliver(makeCapResultOk(sent[0].id, 'first'));

    await expect(p1).resolves.toBe('first');
    await expect(p2).resolves.toBe('second');
  });

  it('exposes a frozen proxy that experience code cannot tamper with', () => {
    const { port } = makeMemoryPort();
    const runtime = createGuestRuntime(port);

    expect(Object.isFrozen(runtime.api)).toBe(true);
    expect(Object.isFrozen(runtime.api.call)).toBe(true);
    expect(() => {
      // @ts-expect-error — attempting to overwrite a frozen method
      runtime.api.call = () => Promise.resolve('hacked');
    }).toThrow();
  });

  it('invokes the onInit callback when init arrives', () => {
    const { port, deliver } = makeMemoryPort();
    const onInit = jest.fn();
    createGuestRuntime(port, { onInit });

    const init = makeInitMessage({ grantedCaps: [], readonlyHandles: [] });
    deliver(init);
    expect(onInit).toHaveBeenCalledWith(init);
  });
});
