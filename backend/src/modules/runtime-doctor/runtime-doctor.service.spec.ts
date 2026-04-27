import { DesktopUpdateService } from '../desktop-update/desktop-update.service';
import { RuntimeDoctorService } from './runtime-doctor.service';

describe('RuntimeDoctorService', () => {
  const createService = (values: Record<string, string | undefined>) => {
    const configService = {
      get: jest.fn((key: string) => values[key]),
    };
    return new RuntimeDoctorService(configService as any, new DesktopUpdateService(configService as any));
  };

  it('fails release readiness when signing is required but missing', () => {
    const report = createService({ REQUIRE_WINDOWS_SIGNING: 'true' }).runDoctor({
      runtimeConfig: { provider: 'custom', model: 'agent-model', backend: 'claude-cli' },
    });

    expect(report.overallStatus).toBe('fail');
    expect(report.checks).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'desktop-windows-signing', status: 'fail' }),
      expect.objectContaining({ id: 'agent-runtime-backend-alias', status: 'fail' }),
      expect.objectContaining({ id: 'provider-runtime-policy', status: 'fail' }),
    ]));
  });

  it('passes parity and updater checks when signed manifest metadata is present', () => {
    const report = createService({
      WINDOWS_SIGNING_THUMBPRINT: 'ABC123',
      DESKTOP_UPDATE_VERSION: '0.1.2',
      DESKTOP_UPDATE_BASE_URL: 'https://agentrix.top/downloads/desktop',
      DESKTOP_UPDATE_SIGNATURE_WINDOWS_X86_64: 'signature',
      DESKTOP_UPDATE_ASSET_WINDOWS_X86_64: 'Agentrix-Desktop-0.1.2-x64-setup.exe',
    }).runDoctor({
      currentDesktopVersion: '0.1.1',
      runtimeConfig: {
        provider: 'platform',
        model: 'claude-sonnet-4-6',
        backend: 'agent-runtime',
        streamingCapability: 'preferred',
        reasoningMode: 'summary',
        fallbackPolicy: { enabled: true, models: ['claude-haiku-4-5'] },
      },
    });

    expect(report.chatPathParity.isParity).toBe(true);
    expect(report.checks).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'desktop-windows-signing', status: 'pass' }),
      expect.objectContaining({ id: 'desktop-updater-manifest', status: 'pass' }),
      expect.objectContaining({ id: 'provider-runtime-policy', status: 'pass' }),
      expect.objectContaining({ id: 'chat-path-parity', status: 'pass' }),
    ]));
  });
});