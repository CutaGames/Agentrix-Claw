import { VrmAutoRigProvider } from './vrm-auto-rig.provider';
import { ConfigService } from '@nestjs/config';

const cfg = (m: Record<string, string | undefined>) =>
  ({ get: (k: string) => m[k] }) as unknown as ConfigService;

const jsonRes = (body: any, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body,
}) as unknown as Response;

describe('VrmAutoRigProvider (BE-T3.1)', () => {
  it('returns rig_unconfigured when VRM_RIG_ENDPOINT missing', async () => {
    const p = new VrmAutoRigProvider(cfg({}));
    const r = await p.rig({ glbUrl: 'https://x/m.glb' });
    expect(r).toMatchObject({ success: false, reason: 'rig_unconfigured' });
    expect(p.isConfigured()).toBe(false);
  });

  describe('happy path', () => {
    it('returns vrmUrl + blendshapes when job succeeds', async () => {
      const p = new VrmAutoRigProvider(cfg({ VRM_RIG_ENDPOINT: 'https://rig.test', VRM_RIG_TOKEN: 't' }));
      const fetchImpl = jest.fn()
        .mockResolvedValueOnce(jsonRes({ job_id: 'j1', status: 'queued' }))
        .mockResolvedValueOnce(jsonRes({
          job_id: 'j1', status: 'succeeded',
          vrm_url: 'https://x/m.vrm',
          blendshapes: ['happy', 'sad', 'angry', 'surprised', 'neutral'],
        })) as any;
      const r = await p.rig({ glbUrl: 'https://x/m.glb' }, { fetchImpl, sleepImpl: jest.fn() });
      expect(r.success).toBe(true);
      expect(r.vrmUrl).toBe('https://x/m.vrm');
      expect(r.blendshapes).toHaveLength(5);
      expect(typeof r.elapsedMs).toBe('number');
    });

    it('passes species hint in request body', async () => {
      const p = new VrmAutoRigProvider(cfg({ VRM_RIG_ENDPOINT: 'https://rig.test' }));
      const captured: any = {};
      const fetchImpl = jest.fn().mockImplementation(async (url: string, init?: any) => {
        captured.url = url; captured.body = init?.body;
        return jsonRes({ job_id: 'j1', status: 'succeeded', vrm_url: 'https://x/m.vrm' });
      }) as any;
      await p.rig({ glbUrl: 'https://x/m.glb', hints: { species: 'quadruped' } },
        { fetchImpl, sleepImpl: jest.fn() });
      expect(JSON.parse(captured.body)).toMatchObject({ species: 'quadruped' });
    });
  });

  describe('failure modes', () => {
    const cfgOk = cfg({ VRM_RIG_ENDPOINT: 'https://rig.test' });

    it('HTTP 4xx → rig_rejected', async () => {
      const p = new VrmAutoRigProvider(cfgOk);
      const fetchImpl = jest.fn().mockResolvedValueOnce(jsonRes({}, 422)) as any;
      const r = await p.rig({ glbUrl: 'https://x/m.glb' }, { fetchImpl, sleepImpl: jest.fn() });
      expect(r).toMatchObject({ success: false, reason: 'rig_rejected' });
    });

    it('HTTP 5xx → rig_error', async () => {
      const p = new VrmAutoRigProvider(cfgOk);
      const fetchImpl = jest.fn().mockResolvedValueOnce(jsonRes({}, 503)) as any;
      const r = await p.rig({ glbUrl: 'https://x/m.glb' }, { fetchImpl, sleepImpl: jest.fn() });
      expect(r).toMatchObject({ success: false, reason: 'rig_error' });
    });

    it('thrown exception → rig_error', async () => {
      const p = new VrmAutoRigProvider(cfgOk);
      const fetchImpl = jest.fn().mockRejectedValueOnce(new Error('network')) as any;
      const r = await p.rig({ glbUrl: 'https://x/m.glb' }, { fetchImpl, sleepImpl: jest.fn() });
      expect(r.reason).toBe('rig_error');
    });

    it('job status=failed → rig_failed (or job error message)', async () => {
      const p = new VrmAutoRigProvider(cfgOk);
      const fetchImpl = jest.fn()
        .mockResolvedValueOnce(jsonRes({ job_id: 'j1', status: 'queued' }))
        .mockResolvedValueOnce(jsonRes({ job_id: 'j1', status: 'failed', error: 'mesh too dense' })) as any;
      const r = await p.rig({ glbUrl: 'https://x/m.glb' }, { fetchImpl, sleepImpl: jest.fn() });
      expect(r.success).toBe(false);
      expect(r.reason).toBe('mesh too dense');
    });

    it('job succeeded but missing vrm_url → rig_failed', async () => {
      const p = new VrmAutoRigProvider(cfgOk);
      const fetchImpl = jest.fn()
        .mockResolvedValueOnce(jsonRes({ job_id: 'j1', status: 'succeeded' })) as any;
      const r = await p.rig({ glbUrl: 'https://x/m.glb' }, { fetchImpl, sleepImpl: jest.fn() });
      expect(r.success).toBe(false);
    });
  });
});
