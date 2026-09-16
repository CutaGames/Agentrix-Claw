jest.mock('../api', () => ({
  apiFetch: jest.fn(async () => ({ ok: true })),
}));

import { apiFetch } from '../api';
import {
  MOBILE_ALLOWED_DESKTOP_COMMAND_KINDS,
  MobileDesktopCommandKindNotAllowedError,
  RETIRED_MOBILE_DESKTOP_COMMAND_KINDS,
  assertMobileDesktopCommandKindAllowed,
  createRemoteDesktopCommand,
  isMobileAllowedDesktopCommandKind,
} from '../desktopSync';

const apiFetchMock = apiFetch as unknown as jest.Mock;

describe('MTR-R01 — Mobile cannot construct remote desktop mutations', () => {
  beforeEach(() => {
    apiFetchMock.mockClear();
  });

  it('keeps only read-only kinds in the allow-list', () => {
    expect([...MOBILE_ALLOWED_DESKTOP_COMMAND_KINDS]).toEqual([
      'context',
      'active-window',
      'list-windows',
    ]);
  });

  it('lists run-command and write-file as retired', () => {
    expect([...RETIRED_MOBILE_DESKTOP_COMMAND_KINDS]).toEqual([
      'run-command',
      'write-file',
      'read-file',
      'open-browser',
    ]);
    for (const kind of RETIRED_MOBILE_DESKTOP_COMMAND_KINDS) {
      expect(isMobileAllowedDesktopCommandKind(kind)).toBe(false);
    }
  });

  it.each([...RETIRED_MOBILE_DESKTOP_COMMAND_KINDS])(
    'rejects %s at construction without reaching the API',
    async (kind) => {
      await expect(
        createRemoteDesktopCommand({
          title: `attempt ${kind}`,
          kind: kind as never,
          payload: { command: 'rm -rf /' },
        }),
      ).rejects.toBeInstanceOf(MobileDesktopCommandKindNotAllowedError);
      expect(apiFetchMock).not.toHaveBeenCalled();
    },
  );

  it('carries a typed reason code instead of a bare Error', async () => {
    await expect(
      createRemoteDesktopCommand({ title: 'shell', kind: 'run-command' as never }),
    ).rejects.toMatchObject({ code: 'mobile_remote_mutation_removed', kind: 'run-command' });
  });

  it.each([undefined, null, '', 'desktop.computer-use.click', 'RUN-COMMAND'])(
    'fails closed for unknown kind %p',
    async (kind) => {
      await expect(
        createRemoteDesktopCommand({ title: 'unknown', kind: kind as never }),
      ).rejects.toBeInstanceOf(MobileDesktopCommandKindNotAllowedError);
      expect(apiFetchMock).not.toHaveBeenCalled();
    },
  );

  it.each([...MOBILE_ALLOWED_DESKTOP_COMMAND_KINDS])('still submits %s', async (kind) => {
    await createRemoteDesktopCommand({ title: `read ${kind}`, kind });
    expect(apiFetchMock).toHaveBeenCalledTimes(1);
    expect(apiFetchMock.mock.calls[0][0]).toBe('/desktop-sync/commands');
  });

  it('exposes the guard for callers that build a payload themselves', () => {
    expect(assertMobileDesktopCommandKindAllowed('context')).toBe('context');
    expect(() => assertMobileDesktopCommandKindAllowed('write-file')).toThrow(
      MobileDesktopCommandKindNotAllowedError,
    );
  });
});
