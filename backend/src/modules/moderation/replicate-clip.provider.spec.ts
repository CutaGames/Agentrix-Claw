import { ReplicateClipProvider } from './replicate-clip.provider';
import { ConfigService } from '@nestjs/config';

function makeConfig(map: Record<string, string | undefined>): ConfigService {
  return { get: jest.fn((k: string) => map[k]) } as any;
}

function jsonResponse(body: any, ok = true, status = 200): Response {
  return {
    ok,
    status,
    json: async () => body,
  } as unknown as Response;
}

describe('ReplicateClipProvider (BE-T2.7)', () => {
  it('returns allow + classifier_unconfigured when token missing', async () => {
    const p = new ReplicateClipProvider(makeConfig({}));
    const r = await p.classify('https://example.com/i.jpg');
    expect(r).toEqual({ decision: 'allow', score: 0, reason: 'classifier_unconfigured' });
    expect(p.isConfigured()).toBe(false);
  });

  describe('classification thresholds', () => {
    const sleep = jest.fn().mockResolvedValue(undefined);
    const cfg = makeConfig({ REPLICATE_API_TOKEN: 'r8_xxx' });

    function makeFetchSequence(prediction: any) {
      // Two-call sequence: submit then poll once.
      const fetchImpl = jest.fn()
        .mockResolvedValueOnce(jsonResponse({ id: 'pred-1', status: 'starting' }))
        .mockResolvedValueOnce(jsonResponse(prediction));
      return fetchImpl as unknown as typeof fetch;
    }

    it('score >= 0.85 → deny + nsfw_image', async () => {
      const p = new ReplicateClipProvider(cfg);
      const r = await p.classify('https://x/i.jpg', {
        fetchImpl: makeFetchSequence({ id: 'pred-1', status: 'succeeded', output: 0.92 }),
        sleepImpl: sleep,
      });
      expect(r).toEqual({ decision: 'deny', score: 0.92, reason: 'nsfw_image' });
    });

    it('score in [0.6, 0.85) → review', async () => {
      const p = new ReplicateClipProvider(cfg);
      const r = await p.classify('https://x/i.jpg', {
        fetchImpl: makeFetchSequence({ id: 'pred-1', status: 'succeeded', output: 0.7 }),
        sleepImpl: sleep,
      });
      expect(r).toMatchObject({ decision: 'review', reason: 'nsfw_image_review' });
    });

    it('score < 0.6 → allow', async () => {
      const p = new ReplicateClipProvider(cfg);
      const r = await p.classify('https://x/i.jpg', {
        fetchImpl: makeFetchSequence({ id: 'pred-1', status: 'succeeded', output: 0.1 }),
        sleepImpl: sleep,
      });
      expect(r).toMatchObject({ decision: 'allow', reason: null });
    });

    it('parses HF-style array output ({label,score}[])', async () => {
      const p = new ReplicateClipProvider(cfg);
      const r = await p.classify('https://x/i.jpg', {
        fetchImpl: makeFetchSequence({
          id: 'pred-1',
          status: 'succeeded',
          output: [{ label: 'normal', score: 0.05 }, { label: 'nsfw', score: 0.9 }],
        }),
        sleepImpl: sleep,
      });
      expect(r.decision).toBe('deny');
    });

    it('parses object output { nsfw }', async () => {
      const p = new ReplicateClipProvider(cfg);
      const r = await p.classify('https://x/i.jpg', {
        fetchImpl: makeFetchSequence({
          id: 'pred-1',
          status: 'succeeded',
          output: { nsfw: 0.95 },
        }),
        sleepImpl: sleep,
      });
      expect(r.decision).toBe('deny');
    });

    it('clamps out-of-range scores into [0,1]', async () => {
      const p = new ReplicateClipProvider(cfg);
      const r = await p.classify('https://x/i.jpg', {
        fetchImpl: makeFetchSequence({ id: 'pred-1', status: 'succeeded', output: 1.5 }),
        sleepImpl: sleep,
      });
      expect(r.score).toBe(1);
    });
  });

  describe('error handling (fail-open)', () => {
    const cfg = makeConfig({ REPLICATE_API_TOKEN: 'r8_xxx' });

    it('submit failure → classifier_error (allow)', async () => {
      const p = new ReplicateClipProvider(cfg);
      const fetchImpl = jest.fn().mockResolvedValueOnce(jsonResponse({}, false, 503)) as any;
      const r = await p.classify('https://x/i.jpg', { fetchImpl, sleepImpl: jest.fn() });
      expect(r).toEqual({ decision: 'allow', score: 0, reason: 'classifier_error' });
    });

    it('exception thrown → classifier_error', async () => {
      const p = new ReplicateClipProvider(cfg);
      const fetchImpl = jest.fn().mockRejectedValueOnce(new Error('network')) as any;
      const r = await p.classify('https://x/i.jpg', { fetchImpl, sleepImpl: jest.fn() });
      expect(r.reason).toBe('classifier_error');
    });

    it('failed prediction status → classifier_failed', async () => {
      const p = new ReplicateClipProvider(cfg);
      const fetchImpl = jest.fn()
        .mockResolvedValueOnce(jsonResponse({ id: 'p1', status: 'starting' }))
        .mockResolvedValueOnce(jsonResponse({ id: 'p1', status: 'failed', error: 'oom' })) as any;
      const r = await p.classify('https://x/i.jpg', { fetchImpl, sleepImpl: jest.fn() });
      expect(r.reason).toBe('classifier_failed');
    });

    it('invalid output shape → classifier_invalid_output', async () => {
      const p = new ReplicateClipProvider(cfg);
      const fetchImpl = jest.fn()
        .mockResolvedValueOnce(jsonResponse({ id: 'p1', status: 'starting' }))
        .mockResolvedValueOnce(jsonResponse({ id: 'p1', status: 'succeeded', output: 'wat' })) as any;
      const r = await p.classify('https://x/i.jpg', { fetchImpl, sleepImpl: jest.fn() });
      expect(r.reason).toBe('classifier_invalid_output');
    });
  });
});
