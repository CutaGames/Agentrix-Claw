import { withFailover, isFailoverWorthy } from './with-failover.util';

describe('with-failover.util', () => {
  describe('isFailoverWorthy', () => {
    it('returns true for 429/5xx/408', () => {
      expect(isFailoverWorthy({ status: 429 })).toBe(true);
      expect(isFailoverWorthy({ status: 500 })).toBe(true);
      expect(isFailoverWorthy({ status: 502 })).toBe(true);
      expect(isFailoverWorthy({ status: 408 })).toBe(true);
    });

    it('returns false for 4xx client errors', () => {
      expect(isFailoverWorthy({ status: 400 })).toBe(false);
      expect(isFailoverWorthy({ status: 401 })).toBe(false);
      expect(isFailoverWorthy({ status: 403 })).toBe(false);
    });

    it('recognizes transient network errors by message', () => {
      expect(isFailoverWorthy(new Error('ECONNRESET'))).toBe(true);
      expect(isFailoverWorthy(new Error('fetch failed'))).toBe(true);
      expect(isFailoverWorthy(new Error('Rate limit exceeded'))).toBe(true);
      expect(isFailoverWorthy(new Error('service unavailable'))).toBe(true);
    });

    it('returns false for unknown errors', () => {
      expect(isFailoverWorthy(new Error('validation failed'))).toBe(false);
      expect(isFailoverWorthy(null)).toBe(false);
      expect(isFailoverWorthy(undefined)).toBe(false);
    });
  });

  describe('withFailover', () => {
    it('returns the primary result when it succeeds', async () => {
      const out = await withFailover([
        { label: 'claude', run: async () => 'primary' },
        { label: 'openai', run: async () => 'secondary' },
      ]);
      expect(out.value).toBe('primary');
      expect(out.usedLabel).toBe('claude');
      expect(out.failoverOccurred).toBe(false);
      expect(out.attemptedLabels).toEqual(['claude']);
    });

    it('falls over to the next provider on transient error', async () => {
      const out = await withFailover([
        { label: 'claude', run: async () => { throw { status: 503, message: 'Service Unavailable' }; } },
        { label: 'openai', run: async () => 'fallback-ok' },
      ]);
      expect(out.value).toBe('fallback-ok');
      expect(out.usedLabel).toBe('openai');
      expect(out.failoverOccurred).toBe(true);
      expect(out.attemptedLabels).toEqual(['claude', 'openai']);
    });

    it('does NOT fall over for 4xx errors', async () => {
      await expect(
        withFailover([
          { label: 'claude', run: async () => { throw { status: 401, message: 'unauthorized' }; } },
          { label: 'openai', run: async () => 'fallback-ok' },
        ]),
      ).rejects.toMatchObject({ status: 401 });
    });

    it('throws when all providers fail', async () => {
      await expect(
        withFailover([
          { label: 'claude', run: async () => { throw new Error('ECONNRESET'); } },
          { label: 'openai', run: async () => { throw { status: 502, message: 'bad gateway' }; } },
        ]),
      ).rejects.toMatchObject({ status: 502 });
    });

    it('throws immediately if no providers supplied', async () => {
      await expect(withFailover([])).rejects.toThrow(/no providers/i);
    });
  });
});
