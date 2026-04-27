import { DesktopUpdateService } from './desktop-update.service';

describe('DesktopUpdateService', () => {
  const createService = (values: Record<string, string | undefined>) => new DesktopUpdateService({
    get: jest.fn((key: string) => values[key]),
  } as any);

  it('returns a Tauri updater manifest when a newer signed asset is configured', () => {
    const service = createService({
      DESKTOP_UPDATE_VERSION: '0.1.2',
      DESKTOP_UPDATE_BASE_URL: 'https://agentrix.top/downloads/desktop',
      DESKTOP_UPDATE_SIGNATURE_WINDOWS_X86_64: 'signed-payload',
      DESKTOP_UPDATE_ASSET_WINDOWS_X86_64: 'Agentrix-Desktop-0.1.2-x64-setup.exe',
      DESKTOP_UPDATE_NOTES: 'Bug fixes',
      DESKTOP_UPDATE_PUB_DATE: '2026-04-27T00:00:00.000Z',
    });

    const manifest = service.getUpdateManifest('windows', 'x86_64', '0.1.1');

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

  it('returns null when metadata is incomplete or version is not newer', () => {
    expect(createService({
      DESKTOP_UPDATE_VERSION: '0.1.2',
      DESKTOP_UPDATE_BASE_URL: 'https://agentrix.top/downloads/desktop',
    }).getUpdateManifest('windows', 'x86_64', '0.1.1')).toBeNull();

    expect(createService({
      DESKTOP_UPDATE_VERSION: '0.1.1',
      DESKTOP_UPDATE_BASE_URL: 'https://agentrix.top/downloads/desktop',
      DESKTOP_UPDATE_SIGNATURE_WINDOWS_X86_64: 'signed-payload',
      DESKTOP_UPDATE_ASSET_WINDOWS_X86_64: 'Agentrix-Desktop-0.1.1-x64-setup.exe',
    }).getUpdateManifest('windows', 'x86_64', '0.1.1')).toBeNull();
  });
});