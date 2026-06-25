import { DesktopDownloadService } from './desktop-download.service';

describe('DesktopDownloadService', () => {
  function makeService() {
    const save = jest.fn(async (entity: any) => ({ ...entity, id: 'new-id' }));
    const create = jest.fn((data: any) => data);
    const repo = { save, create } as any;
    return { service: new DesktopDownloadService(repo), save, create };
  }

  it('persists a minimal intent and returns a download URL', async () => {
    const { service, create } = makeService();
    const r = await service.track({ utmSource: 'twitter' });
    expect(r.ok).toBe(true);
    expect(r.downloadUrl).toMatch(/^https:\/\/agentrix\.top\/downloads\/desktop\//);
    expect(create).toHaveBeenCalledTimes(1);
    const row = (create.mock.calls[0] as any)[0];
    expect(row.utmSource).toBe('twitter');
    expect(row.userAgentHash).toBeNull();
  });

  it('hashes user-agent into a 64-char hex digest', async () => {
    const { service, create } = makeService();
    await service.track({ userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' });
    const row = (create.mock.calls[0] as any)[0];
    expect(row.userAgentHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('clips long fields to their max length', async () => {
    const { service, create } = makeService();
    const longSource = 'a'.repeat(200);
    const longReferrer = 'https://example.com/?'.padEnd(2000, 'b');
    await service.track({ utmSource: longSource, referrer: longReferrer });
    const row = (create.mock.calls[0] as any)[0];
    expect(row.utmSource.length).toBe(64);
    expect(row.referrer.length).toBe(1000);
  });

  it('treats empty / whitespace strings as null', async () => {
    const { service, create } = makeService();
    await service.track({ utmSource: '   ', utmCampaign: '', referrer: '\t\n' });
    const row = (create.mock.calls[0] as any)[0];
    expect(row.utmSource).toBeNull();
    expect(row.utmCampaign).toBeNull();
    expect(row.referrer).toBeNull();
  });

  it('captures CF country when provided', async () => {
    const { service, create } = makeService();
    await service.track({ ipCountry: 'CN', platform: 'windows' });
    const row = (create.mock.calls[0] as any)[0];
    expect(row.ipCountry).toBe('CN');
    expect(row.platform).toBe('windows');
  });
});
