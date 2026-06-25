import { runWithFailover, defaultIsRetryable } from './provider-failover';

describe('provider-failover (BE-T2.8)', () => {
  describe('defaultIsRetryable', () => {
    it.each([500, 502, 503, 504, 429, 408])('treats HTTP %i as retryable', (s) => {
      expect(defaultIsRetryable({ status: s })).toBe(true);
    });
    it.each([400, 401, 403, 404, 422])('treats HTTP %i as NOT retryable', (s) => {
      expect(defaultIsRetryable({ status: s })).toBe(false);
    });
    it('treats ECONNRESET / ETIMEDOUT as retryable', () => {
      expect(defaultIsRetryable({ code: 'ECONNRESET' })).toBe(true);
      expect(defaultIsRetryable({ code: 'ETIMEDOUT' })).toBe(true);
    });
    it('treats "fetch failed" message as retryable', () => {
      expect(defaultIsRetryable({ message: 'fetch failed' })).toBe(true);
    });
    it('returns false on null / undefined', () => {
      expect(defaultIsRetryable(null)).toBe(false);
      expect(defaultIsRetryable(undefined)).toBe(false);
    });
  });

  describe('runWithFailover', () => {
    it('returns primary result without invoking fallback when primary succeeds', async () => {
      const fallback = jest.fn();
      const out = await runWithFailover({
        primary: { name: 'meshy', exec: async () => 'PRIMARY_OK' },
        fallback: { name: 'hunyuan3d', exec: fallback },
      });
      expect(out.result).toBe('PRIMARY_OK');
      expect(out.providerUsed).toBe('meshy');
      expect(out.attempts).toBe(1);
      expect(out.primaryError).toBeNull();
      expect(fallback).not.toHaveBeenCalled();
    });

    it('falls over to secondary on retryable 503', async () => {
      const out = await runWithFailover({
        primary: { name: 'meshy', exec: async () => { throw { status: 503, message: 'gateway timeout' }; } },
        fallback: { name: 'hunyuan3d', exec: async () => 'FALLBACK_OK' },
      });
      expect(out.result).toBe('FALLBACK_OK');
      expect(out.providerUsed).toBe('hunyuan3d');
      expect(out.attempts).toBe(2);
      expect(out.primaryError).toMatchObject({ status: 503 });
    });

    it('does NOT fall over on non-retryable 400 (caller error)', async () => {
      const fallback = jest.fn();
      await expect(runWithFailover({
        primary: { name: 'meshy', exec: async () => { throw { status: 400, message: 'bad prompt' }; } },
        fallback: { name: 'hunyuan3d', exec: fallback },
      })).rejects.toMatchObject({ status: 400 });
      expect(fallback).not.toHaveBeenCalled();
    });

    it('throws fallback error (with primary as cause) when both fail', async () => {
      const primaryErr = { status: 502, message: 'meshy down' };
      const fallbackErr = new Error('hunyuan also down');
      await expect(runWithFailover({
        primary: { name: 'meshy', exec: async () => { throw primaryErr; } },
        fallback: { name: 'hunyuan3d', exec: async () => { throw fallbackErr; } },
      })).rejects.toBe(fallbackErr);
      expect((fallbackErr as any).cause).toBe(primaryErr);
    });

    it('throws primary error when no fallback configured', async () => {
      const err = { status: 503, message: 'no backup' };
      await expect(runWithFailover({
        primary: { name: 'meshy', exec: async () => { throw err; } },
      })).rejects.toBe(err);
    });

    it('emits onAttempt telemetry for primary success', async () => {
      const events: any[] = [];
      await runWithFailover({
        primary: { name: 'meshy', exec: async () => 'ok' },
        onAttempt: (e) => events.push(e),
      });
      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({ providerName: 'meshy', attempt: 1, success: true });
      expect(typeof events[0].elapsedMs).toBe('number');
    });

    it('emits onAttempt for both primary failure and fallback success', async () => {
      const events: any[] = [];
      await runWithFailover({
        primary: { name: 'meshy', exec: async () => { throw { status: 500 }; } },
        fallback: { name: 'hunyuan3d', exec: async () => 'fb' },
        onAttempt: (e) => events.push(e),
      });
      expect(events).toHaveLength(2);
      expect(events[0]).toMatchObject({ providerName: 'meshy', success: false });
      expect(events[1]).toMatchObject({ providerName: 'hunyuan3d', success: true });
    });
  });
});
