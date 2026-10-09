/**
 * The phone's shell binding (phoneShellBinding.ts) and telling the Agent what the phone can do
 * (phoneCapabilityDeclaration.ts `declarePhoneCapabilities`). The server answers are shaped like
 * `SoulShellController.bindingHandshake` (`ShellSessionBindingService.create`), and the upload is checked with the
 * same contract decoder the backend uses.
 */
import { describe, it, expect, jest } from '@jest/globals';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { decodeDeviceCapabilityUploadV0 } from '../../../shared/types/device-capability';
import { validateShellSessionBindingV1 } from '../../../shared/types/shell-session-binding';
import type { PhoneDeviceKeyNativeV1 } from '../phoneDeviceKey';
import {
  PHONE_DECLARATION_BINDING_INVALID,
  declarePhoneCapabilities,
  type PhoneDeclareDeps,
  type PhoneDeclareFailureReason,
  type PhoneDeclareInput,
} from '../phoneCapabilityDeclaration';
import {
  PHONE_SHELL_BINDING_PATH,
  buildPhoneShellBindingRequest,
  decodePhoneShellBindingAnswer,
  ensurePhoneShellBinding,
  type PhoneShellBindingStoreV1,
  type PhoneShellBindingV1,
} from '../phoneShellBinding';
import { PHONE_DECLARE_FAILURE_COPY } from '../phoneDeviceKeyCopy';

const NOW = Date.parse('2026-10-05T09:00:00.000Z');
const DEVICE = 'dev_0123456789abcdef0123456789abcdef';
const AGENT = '11111111-2222-4333-8444-555555555555';
const KEY = 'dsc_phone_1';
const BINDING_ID = '22222222-3333-4444-8555-666666666666';
const ASK = { agentAccountId: AGENT, deviceId: DEVICE, credentialRef: KEY };

function serverBinding(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: 1,
    bindingId: BINDING_ID,
    bindingVersion: 1,
    agentId: 'agt_unique_1',
    accountableAgentId: 'agt_unique_1',
    authorityRootRef: { kind: 'soul_core', soulCoreId: 'sc_1' },
    principalRef: { type: 'actor_identity', id: 'user-1' },
    shellId: `agentrix-mobile-${DEVICE}`,
    deviceId: DEVICE,
    runtimeRef: { type: 'runtime', id: 'agentrix:soul-shell-backend:v1' },
    keyRef: KEY,
    keyPurpose: 'device-auth',
    audience: ['agentrix:soul-shell:v1'],
    capabilities: ['session.read'],
    nonceDomain: `shell:${BINDING_ID}:v1:0f0e`,
    issuedAt: '2026-10-05T09:00:00.000Z',
    expiresAt: '2026-10-05T09:15:00.000Z',
    status: 'active',
    ...overrides,
  };
}

function answer(binding: Record<string, unknown> = serverBinding(), ref?: Record<string, unknown>) {
  return {
    success: true,
    data: {
      schemaVersion: 1,
      binding,
      shellSessionRef: ref ?? { type: 'shell_session_binding', id: binding.bindingId, version: binding.bindingVersion },
      session: { agentAccountId: AGENT, persona: {}, memoryAvailable: false, presence: { shells: [] }, grantedCapabilities: [], negotiated: {} },
    },
  };
}

function memoryStore(initial: unknown = null) {
  let value: unknown = initial;
  const store: PhoneShellBindingStoreV1 & { value: () => unknown } = {
    value: () => value,
    load: jest.fn(async () => value),
    save: jest.fn(async (binding: PhoneShellBindingV1) => {
      value = binding;
    }),
    clear: jest.fn(async () => {
      value = null;
    }),
  };
  return store;
}

function kept(overrides: Partial<PhoneShellBindingV1> = {}): PhoneShellBindingV1 {
  return { id: BINDING_ID, version: 1, agentAccountId: AGENT, deviceId: DEVICE, keyRef: KEY, expiresAt: '2026-10-05T09:10:00.000Z', ...overrides };
}

describe('the shell binding request and answer', () => {
  it('asks for a mobile shell on this device with its key as signer, no capabilities and no lifetime', () => {
    expect(buildPhoneShellBindingRequest(ASK)).toEqual({
      schemaVersion: 1,
      agentAccountId: AGENT,
      shell: 'mobile',
      shellId: `agentrix-mobile-${DEVICE}`,
      capabilities: {},
      deviceId: DEVICE,
      signerRef: KEY,
    });
    expect(buildPhoneShellBindingRequest({ ...ASK, agentAccountId: '../x' })).toBeNull();
    expect(buildPhoneShellBindingRequest({ ...ASK, deviceId: '' })).toBeNull();
    expect(buildPhoneShellBindingRequest({ ...ASK, credentialRef: 'has space' })).toBeNull();
  });

  it('the fixture is a valid binding for the shared validator', () => {
    expect(validateShellSessionBindingV1(serverBinding(), { now: new Date(NOW).toISOString() }).valid).toBe(true);
  });

  it('reads the binding the server made for exactly what was asked', () => {
    const asked = buildPhoneShellBindingRequest(ASK)!;
    expect(decodePhoneShellBindingAnswer(answer(), asked, NOW)).toEqual({
      id: BINDING_ID,
      version: 1,
      agentAccountId: AGENT,
      deviceId: DEVICE,
      keyRef: KEY,
      expiresAt: '2026-10-05T09:15:00.000Z',
    });
  });

  it('anything else is unreadable: another device, key or shell, not active, expired, a mismatched ref, a broken binding', () => {
    const asked = buildPhoneShellBindingRequest(ASK)!;
    for (const body of [
      answer(serverBinding({ deviceId: 'dev_ffffffffffffffffffffffffffffffff' })),
      answer(serverBinding({ deviceId: undefined })),
      answer(serverBinding({ keyRef: 'dsc_other', keyPurpose: 'device-auth' })),
      answer(serverBinding({ shellId: 'agentrix-mobile-someone-else' })),
      answer(serverBinding({ status: 'revoked', revokedAt: '2026-10-05T09:00:00.000Z' })),
      answer(serverBinding({ status: 'superseded' })),
      answer(serverBinding({ expiresAt: '2026-10-05T08:59:59.000Z', issuedAt: '2026-10-05T08:45:00.000Z' })),
      answer(serverBinding({ bindingId: 'not-a-uuid' })),
      answer(serverBinding(), { type: 'shell_session_binding', id: BINDING_ID, version: 2 }),
      answer(serverBinding(), { type: 'runtime', id: BINDING_ID, version: 1 }),
      answer(serverBinding({ accountableAgentId: 'agt_other' })),
      { success: true, data: { ...answer().data, schemaVersion: 2 } },
      { success: true, data: null },
      null,
      'ok',
    ]) {
      expect(decodePhoneShellBindingAnswer(body, asked, NOW)).toBeNull();
    }
  });
});

describe('ensurePhoneShellBinding', () => {
  const post = (status: number, body: unknown) => jest.fn(async (_path: string, _body: unknown) => ({ status, body }));

  it('asks once, keeps the answer, and reuses it for the same device, key and Agent while two minutes are left', async () => {
    const store = memoryStore();
    const postJson = post(201, answer());
    const first = await ensurePhoneShellBinding(ASK, { postJson, store, nowMs: () => NOW });
    expect(first).toEqual({ ok: true, binding: kept({ expiresAt: '2026-10-05T09:15:00.000Z' }), reused: false });
    expect(postJson).toHaveBeenCalledTimes(1);
    expect(postJson.mock.calls[0][0]).toBe(PHONE_SHELL_BINDING_PATH);
    expect(postJson.mock.calls[0][1]).toEqual(buildPhoneShellBindingRequest(ASK));
    expect(store.value()).toEqual(kept({ expiresAt: '2026-10-05T09:15:00.000Z' }));

    const again = await ensurePhoneShellBinding(ASK, { postJson, store, nowMs: () => NOW + 12 * 60_000 });
    expect(again).toEqual({ ok: true, binding: kept({ expiresAt: '2026-10-05T09:15:00.000Z' }), reused: true });
    expect(postJson).toHaveBeenCalledTimes(1);
  });

  it('asks again when the kept one is nearly over, for another Agent, device or key, or unreadable', async () => {
    for (const stored of [
      kept({ expiresAt: '2026-10-05T09:01:59.000Z' }),
      kept({ agentAccountId: '99999999-2222-4333-8444-555555555555' }),
      kept({ deviceId: 'dev_ffffffffffffffffffffffffffffffff' }),
      kept({ keyRef: 'dsc_old' }),
      { ...kept(), id: 'not-a-uuid' },
      'garbage',
    ]) {
      const store = memoryStore(stored);
      const postJson = post(201, answer());
      const result = await ensurePhoneShellBinding(ASK, { postJson, store, nowMs: () => NOW });
      expect(result.ok).toBe(true);
      expect(postJson).toHaveBeenCalledTimes(1);
      expect(store.value()).toEqual(kept({ expiresAt: '2026-10-05T09:15:00.000Z' }));
    }
  });

  it('404 is closed, other refusals carry status and code, network and unreadable answers keep nothing', async () => {
    const cases: Array<[ReturnType<typeof post> | (() => Promise<never>), unknown]> = [
      [post(404, { message: 'soul-shell protocol disabled' }), { ok: false, reason: 'closed' }],
      [post(400, { code: 'shell_binding_handshake_invalid', message: 'x' }), { ok: false, reason: 'rejected', status: 400, code: 'shell_binding_handshake_invalid' }],
      [post(403, null), { ok: false, reason: 'rejected', status: 403, code: null }],
      [jest.fn(async () => { throw new Error('offline'); }), { ok: false, reason: 'network' }],
      [post(201, answer(serverBinding({ keyRef: 'dsc_other' }))), { ok: false, reason: 'unreadable' }],
    ];
    for (const [postJson, expected] of cases) {
      const store = memoryStore();
      expect(await ensurePhoneShellBinding(ASK, { postJson: postJson as never, store, nowMs: () => NOW })).toEqual(expected);
      expect(store.save).not.toHaveBeenCalled();
    }
    const store = memoryStore();
    const postJson = post(201, answer());
    expect(await ensurePhoneShellBinding({ ...ASK, agentAccountId: '' }, { postJson, store, nowMs: () => NOW })).toEqual({ ok: false, reason: 'invalid' });
    expect(postJson).not.toHaveBeenCalled();
  });
});

function fakeNative(options: { cancel?: boolean } = {}) {
  const pair = crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' });
  const jwk = pair.publicKey.export({ format: 'jwk' }) as { x: string; y: string };
  const native: PhoneDeviceKeyNativeV1 = {
    getPublicKey: jest.fn(async () => ({ ...jwk, hardware: 'tee' as const })),
    createKey: jest.fn(async () => ({ ...jwk, hardware: 'tee' as const })),
    sign: jest.fn(async (message: string) => {
      if (options.cancel) throw Object.assign(new Error('cancelled'), { code: 'user_cancelled' });
      return crypto.sign('sha256', Buffer.from(message, 'utf8'), { key: pair.privateKey, dsaEncoding: 'der' }).toString('base64');
    }),
  };
  return native;
}

function phone(overrides: Partial<PhoneDeclareInput> = {}): PhoneDeclareInput {
  return { agentAccountId: AGENT, deviceId: DEVICE, credentialRef: KEY, pushReachable: true, hardwareKey: true, foreground: true, ...overrides };
}

function server(options: { meshFlag?: string; binding?: { status: number; body: unknown }; upload?: { status: number; body: unknown }; native?: PhoneDeviceKeyNativeV1; store?: ReturnType<typeof memoryStore> } = {}) {
  const posts: Array<{ path: string; body: any }> = [];
  const store = options.store ?? memoryStore();
  const deps: PhoneDeclareDeps & { posts: typeof posts; store: typeof store } = {
    posts,
    store,
    localEnabled: true,
    nowMs: () => NOW,
    getJson: jest.fn(async () => ({ status: 200, body: { flags: { DEVICE_MESH_V0_ENABLED: options.meshFlag ?? '1' }, fetchedAt: '2026-10-05T08:59:00Z' } })),
    postJson: jest.fn(async (p: string, body: unknown) => {
      posts.push({ path: p, body });
      if (p === PHONE_SHELL_BINDING_PATH) return options.binding ?? { status: 201, body: answer() };
      return options.upload ?? { status: 200, body: { deviceId: DEVICE, declarationId: 'x', digest: 'y', expiresAt: '2026-10-05T09:15:00.000Z', replayed: false } };
    }),
    native: options.native ?? fakeNative(),
    prompt: 'Tell your Agent what this phone can do',
    bindingStore: store,
    newDeclarationId: () => '33333333-4444-4555-8666-777777777777',
  };
  return deps;
}

describe('declarePhoneCapabilities', () => {
  it('gets a binding, then sends one signed declaration that names it and that the backend decoder accepts', async () => {
    const d = server();
    expect(await declarePhoneCapabilities(phone(), d)).toEqual({ ok: true, expiresAt: '2026-10-05T09:15:00.000Z', replayed: false });
    expect(d.posts.map((p) => p.path)).toEqual([PHONE_SHELL_BINDING_PATH, `/devices/${DEVICE}/capabilities`]);
    const upload = decodeDeviceCapabilityUploadV0(d.posts[1].body, DEVICE, new Date(NOW));
    expect(upload.ok).toBe(true);
    expect(d.posts[1].body.declaration.shellBindingRef).toEqual({ type: 'shell_session_binding', id: BINDING_ID, version: 1 });
    expect(d.posts[1].body.declaration.signerRef).toBe(KEY);
    expect(d.native.sign).toHaveBeenCalledTimes(1);

    const second = await declarePhoneCapabilities(phone(), d);
    expect(second.ok).toBe(true);
    expect(d.posts.map((p) => p.path)).toEqual([PHONE_SHELL_BINDING_PATH, `/devices/${DEVICE}/capabilities`, `/devices/${DEVICE}/capabilities`]);
  });

  it('asks the server nothing while off locally, not enrolled or without an Agent; no binding while the mesh is off', async () => {
    const cases: Array<[PhoneDeclareDeps & { posts: unknown[] }, PhoneDeclareInput, PhoneDeclareFailureReason]> = [
      [{ ...server(), localEnabled: false } as never, phone(), 'off'],
      [server(), phone({ credentialRef: null }), 'not_enrolled'],
      [server(), phone({ deviceId: null }), 'not_enrolled'],
      [server(), phone({ agentAccountId: null }), 'no_agent'],
    ];
    for (const [d, input, reason] of cases) {
      expect(await declarePhoneCapabilities(input, d)).toEqual({ ok: false, reason });
      expect(d.getJson).not.toHaveBeenCalled();
      expect(d.postJson).not.toHaveBeenCalled();
    }
    const meshOff = server({ meshFlag: '0' });
    expect(await declarePhoneCapabilities(phone(), meshOff)).toEqual({ ok: false, reason: 'off' });
    expect(meshOff.posts).toHaveLength(0);
    expect(meshOff.native.sign).not.toHaveBeenCalled();
  });

  it('a binding that is closed, refused or unreadable stops before anything is signed', async () => {
    const cases: Array<[{ status: number; body: unknown }, unknown]> = [
      [{ status: 404, body: null }, { ok: false, reason: 'binding_closed' }],
      [{ status: 503, body: { code: 'unavailable' } }, { ok: false, reason: 'binding_rejected', status: 503, code: 'unavailable' }],
      [{ status: 201, body: { success: true, data: {} } }, { ok: false, reason: 'binding_unreadable' }],
    ];
    for (const [binding, expected] of cases) {
      const d = server({ binding });
      expect(await declarePhoneCapabilities(phone(), d)).toEqual(expected);
      expect(d.native.sign).not.toHaveBeenCalled();
      expect(d.posts.map((p) => p.path)).toEqual([PHONE_SHELL_BINDING_PATH]);
    }
  });

  it('a declaration refused for its binding drops the kept binding, so the next try asks for a new one', async () => {
    const d = server({ upload: { status: 403, body: { code: PHONE_DECLARATION_BINDING_INVALID } } });
    expect(await declarePhoneCapabilities(phone(), d)).toEqual({ ok: false, reason: 'rejected', status: 403, code: PHONE_DECLARATION_BINDING_INVALID });
    expect(d.store.clear).toHaveBeenCalledTimes(1);
    expect(d.store.value()).toBeNull();

    const other = server({ upload: { status: 409, body: { code: 'DEVICE_CAPABILITY_STALE' } } });
    await declarePhoneCapabilities(phone(), other);
    expect(other.store.clear).not.toHaveBeenCalled();
  });

  it('the owner cancelling the key sends no declaration', async () => {
    const d = server({ native: fakeNative({ cancel: true }) });
    expect(await declarePhoneCapabilities(phone(), d)).toEqual({ ok: false, reason: 'user_cancelled' });
    expect(d.posts.map((p) => p.path)).toEqual([PHONE_SHELL_BINDING_PATH]);
  });
});

describe('这台手机 wiring', () => {
  const read = (file: string) => fs.readFileSync(path.join(__dirname, file), 'utf8');

  it('every failure has words in both languages', () => {
    const reasons: PhoneDeclareFailureReason[] = [
      'off', 'user_cancelled', 'sign_failed', 'network', 'rejected',
      'not_enrolled', 'no_agent', 'invalid', 'binding_closed', 'binding_rejected', 'binding_unreadable',
    ];
    expect(Object.keys(PHONE_DECLARE_FAILURE_COPY).sort()).toEqual([...reasons].sort());
    for (const reason of reasons) {
      expect(PHONE_DECLARE_FAILURE_COPY[reason].zh.length).toBeGreaterThan(0);
      expect(PHONE_DECLARE_FAILURE_COPY[reason].en.length).toBeGreaterThan(0);
    }
  });

  it('the screen offers it only behind the device mesh build switch and once the phone is registered', () => {
    const screen = read('../../screens/four-zone/MyDevicesScreen.tsx');
    expect(screen).toContain('{meshOn && thisPhone.data.registered ? (');
    expect(screen).toContain('declareThisPhone({ agentAccountId, pushReachable }');
    expect(screen).toContain("if (result.reason === 'user_cancelled') return;");
  });

  it('the services have no React Native import; the binding never asks for a wallet', () => {
    for (const file of ['../phoneShellBinding.ts', '../phoneCapabilityDeclaration.ts']) {
      expect(read(file)).not.toMatch(/from 'react-native'|from 'expo-/);
    }
    expect(buildPhoneShellBindingRequest(ASK)?.capabilities).toEqual({});
  });
});
