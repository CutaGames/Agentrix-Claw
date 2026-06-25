import { computeFingerprint, sanitizePath, DesktopCrashService } from './desktop-crash.service';

describe('desktop-crash sanitizers', () => {
  describe('sanitizePath', () => {
    it('replaces Windows user paths', () => {
      expect(sanitizePath('Failed at C:\\Users\\jdoe\\AppData\\foo'))
        .toBe('Failed at C:\\Users\\<user>\\AppData\\foo');
    });

    it('replaces Mac user paths', () => {
      expect(sanitizePath('Stack at /Users/janedoe/.config/agentrix'))
        .toBe('Stack at /Users/<user>/.config/agentrix');
    });

    it('replaces Linux home paths', () => {
      expect(sanitizePath('panic in /home/alice/projects/foo'))
        .toBe('panic in /home/<user>/projects/foo');
    });

    it('handles all three in a single string', () => {
      const messy = 'win=C:\\Users\\bob\\x mac=/Users/carol/y linux=/home/dave/z';
      expect(sanitizePath(messy))
        .toBe('win=C:\\Users\\<user>\\x mac=/Users/<user>/y linux=/home/<user>/z');
    });

    it('returns input unchanged when no path-like substring exists', () => {
      expect(sanitizePath('simple error message')).toBe('simple error message');
    });

    it('handles empty / undefined gracefully', () => {
      expect(sanitizePath('')).toBe('');
    });
  });

  describe('computeFingerprint', () => {
    it('same type+message produces same fingerprint', () => {
      expect(computeFingerprint('rust_panic', 'index out of bounds'))
        .toBe(computeFingerprint('rust_panic', 'index out of bounds'));
    });

    it('different types produce different fingerprints', () => {
      expect(computeFingerprint('rust_panic', 'foo'))
        .not.toBe(computeFingerprint('js_error', 'foo'));
    });

    it('only the first 100 chars of the message matter', () => {
      const a = 'a'.repeat(100) + 'X';
      const b = 'a'.repeat(100) + 'Y';
      expect(computeFingerprint('rust_panic', a)).toBe(computeFingerprint('rust_panic', b));
    });
  });

  describe('DesktopCrashService.record', () => {
    it('inserts new row when no recent dupe exists', async () => {
      const findOne = jest.fn(async () => null);
      const create = jest.fn((x: any) => ({ ...x, id: 'new-id' }));
      const save = jest.fn(async (x: any) => x);
      const repo = { findOne, create, save } as any;
      const service = new DesktopCrashService(repo);

      const r = await service.record({
        deviceId: 'device-X',
        appVersion: '0.2.0',
        type: 'rust_panic',
        message: 'panic at C:\\Users\\bob\\foo',
        occurredAt: 1700000000000,
      });

      expect(r.deduped).toBe(false);
      expect(create).toHaveBeenCalledTimes(1);
      const row = (create.mock.calls[0] as any)[0];
      expect(row.message).toContain('<user>');
      expect(row.deviceIdHash).toMatch(/^[a-f0-9]{64}$/);
    });

    it('bumps count on dedupe within 10-minute window', async () => {
      const existing = { id: 'existing-id', count: 3 };
      const findOne = jest.fn(async () => existing);
      const save = jest.fn(async (x: any) => x);
      const repo = { findOne, save, create: jest.fn() } as any;
      const service = new DesktopCrashService(repo);

      const r = await service.record({
        deviceId: 'device-X',
        appVersion: '0.2.0',
        type: 'rust_panic',
        message: 'panic again',
        occurredAt: Date.now(),
      });

      expect(r.deduped).toBe(true);
      expect(existing.count).toBe(4);
      expect(save).toHaveBeenCalledWith(existing);
    });
  });
});
