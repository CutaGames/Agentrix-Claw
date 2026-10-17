import {
  evaluateImportedExecutableEnableCommandV1,
  isImportedExecutableInvocableV1,
} from '../imported-executable-enable';

describe('imported executable enable', () => {
  it('refuses enable without confirmation or a live binding', () => {
    expect(
      evaluateImportedExecutableEnableCommandV1({ confirmation: 'yes', liveBinding: null }),
    ).toEqual({ status: 'refused', reasonCode: 'confirmation_required' });
    expect(
      evaluateImportedExecutableEnableCommandV1({ confirmation: 'enable', liveBinding: null }),
    ).toEqual({ status: 'refused', reasonCode: 'live_binding_required' });
  });

  it('refuses archive-shaped secrets and accepts a live MCP connection UUID', () => {
    expect(
      evaluateImportedExecutableEnableCommandV1({
        confirmation: 'enable',
        liveBinding: { kind: 'mcp_connection', ref: '11111111-1111-4111-8111-111111111111' },
      }),
    ).toEqual({
      status: 'allowed',
      binding: { kind: 'mcp_connection', ref: '11111111-1111-4111-8111-111111111111' },
    });
    expect(
      evaluateImportedExecutableEnableCommandV1({
        confirmation: 'enable',
        liveBinding: { apiKey: 'sk-live-from-archive' },
      }),
    ).toEqual({ status: 'refused', reasonCode: 'live_binding_rejected' });
  });

  it('allows only an Agentrix skill UUID the owner already has', () => {
    expect(
      evaluateImportedExecutableEnableCommandV1({
        confirmation: 'enable',
        liveBinding: {
          kind: 'agentrix_skill',
          ref: '22222222-2222-4222-8222-222222222222',
        },
      }),
    ).toEqual({
      status: 'allowed',
      binding: { kind: 'agentrix_skill', ref: '22222222-2222-4222-8222-222222222222' },
    });
  });

  it('keeps imported rows non-invocable until they are bound and enabled', () => {
    expect(
      isImportedExecutableInvocableV1({
        isEnabled: false,
        w1rImported: true,
        quarantined: true,
        requiresReauthorization: true,
        liveBindingRef: null,
      }),
    ).toBe(false);
    expect(
      isImportedExecutableInvocableV1({
        isEnabled: true,
        w1rImported: true,
        quarantined: false,
        requiresReauthorization: false,
        liveBindingRef: null,
      }),
    ).toBe(false);
    expect(
      isImportedExecutableInvocableV1({
        isEnabled: true,
        w1rImported: true,
        quarantined: false,
        requiresReauthorization: false,
        liveBindingRef: '22222222-2222-4222-8222-222222222222',
      }),
    ).toBe(true);
    expect(
      isImportedExecutableInvocableV1({
        isEnabled: true,
        w1rImported: false,
      }),
    ).toBe(true);
  });
});
