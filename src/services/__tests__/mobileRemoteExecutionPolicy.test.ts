/**
 * M0 (2026-09-27) — negative tests for the mobile remote-execution fence.
 *
 * The phone must not be able to queue shell, file read/write, URL open or
 * any other side-effecting command on a paired computer, and must not emit
 * loosening remote-control commands (start / toggle / broadcast). Each
 * blocked case also proves no network call happens.
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';

const apiFetch = jest.fn() as jest.MockedFunction<
  (path: string, options?: RequestInit) => Promise<any>
>;
const getApiConfig = jest.fn(() => ({ token: 'test-token', baseUrl: 'https://api.example.test/api' }));

jest.mock('../api', () => ({
  apiFetch: (path: string, options?: RequestInit) => apiFetch(path, options),
  getApiConfig: () => getApiConfig(),
}));
jest.mock('../voiceDiagnostics', () => ({
  addVoiceDiagnostic: jest.fn(),
}));
jest.mock('../companionEvents.service', () => ({
  companionEvents: { emit: jest.fn(), subscribe: jest.fn(() => () => undefined) },
}));

import {
  MOBILE_DESKTOP_COMMAND_ALLOWLIST,
  MOBILE_REMOTE_CONTROL_ALLOWLIST,
  MOBILE_REMOTE_EXECUTION_BLOCKED,
  MOBILE_REMOTE_RAW_BODY_KEYS,
  assertMobileDesktopCommandAllowed,
  assertMobileRemoteControlAllowed,
  isMobileRemoteExecutionBlockedError,
} from '../mobileRemoteExecutionPolicy';
import { createRemoteDesktopCommand } from '../desktopSync';
import { mintCrossDeviceToken, sendRemoteControl } from '../crossDeviceToken.service';
import {
  REMOTE_CONTROL_FORBIDDEN,
  REMOTE_CONTROL_WHITELIST,
} from '../../../shared/types/remote-control';

/** Every side-effecting or body-carrying desktop-sync kind known to backend. */
const BLOCKED_DESKTOP_KINDS = [
  'run-command',
  'write-file',
  'read-file',
  'open-browser',
  'list-directory',
  'git-diff',
  'git-commit',
  'git-push',
  'git-pull',
  'git-checkout',
  'computer-use-click',
  'computer-use-move',
  'computer-use-type',
  'computer-use-key',
  'computer-use-browser-navigate',
  'computer-use-browser-eval',
  'computer-use-browser-click-selector',
  'world-creation-task',
  'clipboard',
  'unknown-kind',
];

const MALFORMED_KINDS: unknown[] = ['', ' context', 'context ', 'CONTEXT', null, undefined, 42, {}, ['context']];

function expectBlocked(fn: () => unknown, reason: string) {
  let caught: unknown;
  try {
    fn();
  } catch (error) {
    caught = error;
  }
  expect(isMobileRemoteExecutionBlockedError(caught)).toBe(true);
  expect((caught as { code: string }).code).toBe(MOBILE_REMOTE_EXECUTION_BLOCKED);
  expect((caught as { reason: string }).reason).toBe(reason);
}

beforeEach(() => {
  apiFetch.mockReset();
  apiFetch.mockResolvedValue({ ok: true, token: 't', expiresAt: Date.now() + 30_000 });
});

describe('desktop-sync allowlist', () => {
  it('only allows read-only, body-free kinds', () => {
    expect([...MOBILE_DESKTOP_COMMAND_ALLOWLIST].sort()).toEqual(['active-window', 'context', 'list-windows']);
  });

  it.each(BLOCKED_DESKTOP_KINDS)('refuses %s', (kind) => {
    expectBlocked(() => assertMobileDesktopCommandAllowed(kind), 'kind_not_allowed_on_mobile');
  });

  it.each(MALFORMED_KINDS.map((kind) => [kind]))('fails closed on malformed kind %p', (kind) => {
    expectBlocked(() => assertMobileDesktopCommandAllowed(kind), 'kind_not_allowed_on_mobile');
  });

  it.each([...MOBILE_REMOTE_RAW_BODY_KEYS])('refuses an allowed kind that smuggles a raw "%s" body', (key) => {
    expectBlocked(
      () => assertMobileDesktopCommandAllowed('context', { [key]: 'rm -rf /' }),
      'raw_body_not_allowed_on_mobile',
    );
  });

  it.each([...MOBILE_DESKTOP_COMMAND_ALLOWLIST])('allows %s without a body', (kind) => {
    expect(() => assertMobileDesktopCommandAllowed(kind)).not.toThrow();
    expect(() => assertMobileDesktopCommandAllowed(kind, {})).not.toThrow();
  });
});

describe('createRemoteDesktopCommand', () => {
  it.each([
    ['run-command', { command: 'npm test', timeoutMs: 60000 }],
    ['write-file', { path: 'C:\\evil.bat', content: 'calc.exe' }],
    ['read-file', { path: '/etc/passwd' }],
    ['open-browser', { url: 'ms-msdt:/id PCWDiagnostic' }],
  ])('refuses %s before any network call', async (kind, payload) => {
    await expect(
      createRemoteDesktopCommand({ title: 'x', kind: kind as any, targetDeviceId: 'desk-1', payload }),
    ).rejects.toMatchObject({ code: MOBILE_REMOTE_EXECUTION_BLOCKED });
    expect(apiFetch).not.toHaveBeenCalled();
  });

  it('refuses a raw body even on an allowed kind', async () => {
    await expect(
      createRemoteDesktopCommand({ title: 'x', kind: 'context', payload: { command: 'whoami' } }),
    ).rejects.toMatchObject({ code: MOBILE_REMOTE_EXECUTION_BLOCKED, reason: 'raw_body_not_allowed_on_mobile' });
    expect(apiFetch).not.toHaveBeenCalled();
  });

  it('still queues a read-only context request', async () => {
    await createRemoteDesktopCommand({ title: 'Fetch Desktop Context', kind: 'context', targetDeviceId: 'desk-1' });
    expect(apiFetch).toHaveBeenCalledTimes(1);
    const [path, options] = apiFetch.mock.calls[0];
    expect(path).toBe('/desktop-sync/commands');
    expect(options?.method).toBe('POST');
    expect(JSON.parse(String(options?.body))).toMatchObject({ kind: 'context', targetDeviceId: 'desk-1' });
  });
});

describe('remote-control allowlist', () => {
  const loosening = REMOTE_CONTROL_WHITELIST.filter(
    (command) => !(MOBILE_REMOTE_CONTROL_ALLOWLIST as readonly string[]).includes(command),
  );

  it('is a strict subset of the shared whitelist: stop + status only', () => {
    expect([...MOBILE_REMOTE_CONTROL_ALLOWLIST].sort()).toEqual([
      'desktop.computer-use.stop',
      'device.status.query',
      'speaker.stop',
    ]);
    for (const command of MOBILE_REMOTE_CONTROL_ALLOWLIST) {
      expect(REMOTE_CONTROL_WHITELIST as readonly string[]).toContain(command);
    }
  });

  it('keeps every start / toggle / broadcast command off the phone', () => {
    expect(loosening).toEqual(
      expect.arrayContaining([
        'desktop.computer-use.start',
        'desktop.pro-mode.toggle',
        'desktop.aira-work-mode.start',
        'speaker.tts.broadcast',
        'speaker.white-noise.start',
        'watch.notifications.silence',
      ]),
    );
  });

  it.each([...loosening, ...REMOTE_CONTROL_FORBIDDEN, 'desktop.shell.run', 'unknown'])('refuses %s', (command) => {
    expectBlocked(() => assertMobileRemoteControlAllowed(command), 'kind_not_allowed_on_mobile');
  });

  it('refuses args on an allowed command', () => {
    expectBlocked(
      () => assertMobileRemoteControlAllowed('desktop.computer-use.stop', { command: 'rm -rf /' }),
      'args_not_allowed_on_mobile',
    );
  });

  it.each(loosening)('sendRemoteControl(%s) returns blocked-on-mobile without minting a token', async (command) => {
    const result = await sendRemoteControl({
      originDeviceId: 'phone-1',
      targetDeviceId: 'desk-1',
      command,
    });
    expect(result).toEqual({ ok: false, requestId: '', reason: 'blocked-on-mobile' });
    expect(apiFetch).not.toHaveBeenCalled();
  });

  it('sendRemoteControl refuses notify-only mode for a loosening command too', async () => {
    const result = await sendRemoteControl({
      originDeviceId: 'phone-1',
      targetDeviceId: 'desk-1',
      command: 'desktop.computer-use.start',
      executeMode: 'notify-only',
    });
    expect(result.reason).toBe('blocked-on-mobile');
    expect(apiFetch).not.toHaveBeenCalled();
  });

  it('mintCrossDeviceToken refuses a loosening command before the network', async () => {
    await expect(
      mintCrossDeviceToken({ targetDeviceId: 'desk-1', command: 'desktop.pro-mode.toggle' }),
    ).rejects.toMatchObject({ code: MOBILE_REMOTE_EXECUTION_BLOCKED });
    expect(apiFetch).not.toHaveBeenCalled();
  });

  it('mintCrossDeviceToken still mints for stop', async () => {
    await mintCrossDeviceToken({ targetDeviceId: 'desk-1', command: 'desktop.computer-use.stop', requestId: 'req-12345678' });
    expect(apiFetch).toHaveBeenCalledTimes(1);
    expect(apiFetch.mock.calls[0][0]).toBe('/v1/cross-device/token');
  });
});
