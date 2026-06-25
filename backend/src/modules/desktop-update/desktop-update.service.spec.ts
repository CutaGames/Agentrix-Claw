import { DesktopUpdateService } from './desktop-update.service';

describe('DesktopUpdateService', () => {
  const stubRepo = (rows: any[] = []) => ({
    find: jest.fn(async () => rows),
  } as any);

  const createService = (values: Record<string, string | undefined>, releases: any[] = []) =>
    new DesktopUpdateService(
      { get: jest.fn((key: string) => values[key]) } as any,
      stubRepo(releases),
    );

  it('returns a Tauri updater manifest when a newer signed asset is configured (env fallback)', async () => {
    const service = createService({
      DESKTOP_UPDATE_VERSION: '0.1.2',
      DESKTOP_UPDATE_BASE_URL: 'https://agentrix.top/downloads/desktop',
      DESKTOP_UPDATE_SIGNATURE_WINDOWS_X86_64: 'signed-payload',
      DESKTOP_UPDATE_ASSET_WINDOWS_X86_64: 'Agentrix-Desktop-0.1.2-x64-setup.exe',
      DESKTOP_UPDATE_NOTES: 'Bug fixes',
      DESKTOP_UPDATE_PUB_DATE: '2026-04-27T00:00:00.000Z',
    });

    const manifest = await service.getUpdateManifest('windows', 'x86_64', '0.1.1');

    expect(manifest).toEqual({
      version: '0.1.2',
      notes: 'Bug fixes',
      pub_date: '2026-04-27T00:00:00.000Z',
      platforms: {
        'windows-x86_64': {
          signature: 'signed-payload',
          url: 'https://agentrix.top/downloads/desktop/Agentrix-Desktop-0.1.2-x64-setup.exe',
        },
      },
    });
  });

  it('returns null when metadata is incomplete or version is not newer', async () => {
    expect(await createService({
      DESKTOP_UPDATE_VERSION: '0.1.2',
      DESKTOP_UPDATE_BASE_URL: 'https://agentrix.top/downloads/desktop',
    }).getUpdateManifest('windows', 'x86_64', '0.1.1')).toBeNull();

    expect(await createService({
      DESKTOP_UPDATE_VERSION: '0.1.1',
      DESKTOP_UPDATE_BASE_URL: 'https://agentrix.top/downloads/desktop',
      DESKTOP_UPDATE_SIGNATURE_WINDOWS_X86_64: 'signed-payload',
      DESKTOP_UPDATE_ASSET_WINDOWS_X86_64: 'Agentrix-Desktop-0.1.1-x64-setup.exe',
    }).getUpdateManifest('windows', 'x86_64', '0.1.1')).toBeNull();
  });

  it('prefers DB-backed releases over env when both are configured', async () => {
    const service = createService(
      {
        DESKTOP_UPDATE_VERSION: '0.1.2',
        DESKTOP_UPDATE_BASE_URL: 'https://agentrix.top/downloads/desktop',
        DESKTOP_UPDATE_SIGNATURE_WINDOWS_X86_64: 'env-sig',
        DESKTOP_UPDATE_ASSET_WINDOWS_X86_64: 'env.exe',
      },
      [
        {
          version: '0.2.0',
          channel: 'stable',
          target: 'windows',
          arch: 'x86_64',
          url: 'https://agentrix.top/desktop/v0.2.0/setup.exe',
          signature: 'db-sig',
          notesMd: 'Sprint G-2 release',
          rolloutPercent: 100,
          pubDate: new Date('2026-05-20T00:00:00Z'),
          isActive: true,
        },
      ],
    );

    const manifest = await service.getUpdateManifest('windows', 'x86_64', '0.1.1');

    expect(manifest?.version).toBe('0.2.0');
    expect(manifest?.platforms['windows-x86_64'].signature).toBe('db-sig');
  });

  it('skips DB releases that are older than the client version', async () => {
    const service = createService(
      {},
      [
        {
          version: '0.1.0',
          channel: 'stable',
          target: 'windows',
          arch: 'x86_64',
          url: 'old.exe',
          signature: 'old-sig',
          rolloutPercent: 100,
          pubDate: new Date(),
          isActive: true,
        },
      ],
    );

    expect(await service.getUpdateManifest('windows', 'x86_64', '0.1.1')).toBeNull();
  });

  it('respects rolloutPercent — only some fingerprints get the release', async () => {
    const service = createService(
      {},
      [
        {
          version: '0.2.0',
          channel: 'stable',
          target: 'windows',
          arch: 'x86_64',
          url: 'new.exe',
          signature: 'sig',
          rolloutPercent: 1, // 1% rollout
          pubDate: new Date(),
          isActive: true,
        },
      ],
    );

    // Try ~1000 different fingerprints; only some should hit
    let hits = 0;
    for (let i = 0; i < 1000; i++) {
      const m = await service.getUpdateManifest('windows', 'x86_64', '0.1.1', {
        deviceFingerprint: `device-${i}`,
      });
      if (m) hits += 1;
    }
    // Should be roughly 10 (1% of 1000) — generous bounds avoid flaky CI
    expect(hits).toBeGreaterThanOrEqual(2);
    expect(hits).toBeLessThanOrEqual(30);
  });
});
