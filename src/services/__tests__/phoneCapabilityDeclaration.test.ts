/**
 * This phone's capability declaration (phoneCapabilityDeclaration.ts; contract device-capability.ts 2 and 6).
 * The fake native key is a real P-256 key from Node's crypto that signs DER, like Keystore and Secure Enclave;
 * the upload is verified the way the backend does (`DeviceCapabilityService.declare`: contract decoder, digest,
 * five-line message, P1363 over it).
 */
import { describe, it, expect, jest } from '@jest/globals';
import * as crypto from 'crypto';
import {
  decodeDeviceCapabilityUploadV0,
  deviceCapabilityDeclarationDigestV0,
  deviceCapabilityDeclarationMessageV0,
  type DeviceCapabilityDeclarationV0,
} from '../../../shared/types/device-capability';
import type { PhoneDeviceKeyNativeV1 } from '../phoneDeviceKey';
import {
  buildPhoneCapabilityDeclaration,
  uploadPhoneCapabilityDeclaration,
  type PhoneCapabilityUploadDeps,
  type PhoneDeclarationInput,
} from '../phoneCapabilityDeclaration';

const NOW = new Date('2026-10-03T06:00:00.250Z');
const DEVICE = 'dev_0123456789abcdef0123456789abcdef';

function fakeNative(options: { cancel?: boolean; garbage?: boolean } = {}) {
  const pair = crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' });
  const jwk = pair.publicKey.export({ format: 'jwk' }) as { x: string; y: string };
  const native: PhoneDeviceKeyNativeV1 & { jwk: { x: string; y: string } } = {
    jwk,
    getPublicKey: jest.fn(async () => ({ ...jwk, hardware: 'tee' as const })),
    createKey: jest.fn(async () => ({ ...jwk, hardware: 'tee' as const })),
    sign: jest.fn(async (message: string) => {
      if (options.cancel) throw Object.assign(new Error('cancelled'), { code: 'user_cancelled' });
      if (options.garbage) return 'bm90IGEgc2lnbmF0dXJl';
      return crypto.sign('sha256', Buffer.from(message, 'utf8'), { key: pair.privateKey, dsaEncoding: 'der' }).toString('base64');
    }),
  };
  return native;
}

function verifyP1363(jwk: { x: string; y: string }, message: string, signature: string): boolean {
  const publicKey = crypto.createPublicKey({ key: { kty: 'EC', crv: 'P-256', x: jwk.x, y: jwk.y }, format: 'jwk' });
  return crypto.verify('sha256', Buffer.from(message, 'utf8'), { key: publicKey, dsaEncoding: 'ieee-p1363' }, Buffer.from(signature, 'base64url'));
}

function input(overrides: Partial<PhoneDeclarationInput> = {}): PhoneDeclarationInput {
  return {
    deviceId: DEVICE,
    credentialRef: 'dsc_phone_1',
    shellBinding: { id: '22222222-3333-4444-8555-666666666666', version: 1 },
    declarationId: '33333333-4444-4555-8666-777777777777',
    now: NOW,
    pushReachable: true,
    hardwareKey: true,
    foreground: true,
    grantedSensors: ['sensor.location.v1'],
    ...overrides,
  };
}

function declared(overrides: Partial<PhoneDeclarationInput> = {}): DeviceCapabilityDeclarationV0 {
  const built = buildPhoneCapabilityDeclaration(input(overrides));
  if (built.ok !== true) throw new Error('expected a declaration');
  return (built as { ok: true; declaration: DeviceCapabilityDeclarationV0 }).declaration;
}

function deps(overrides: Partial<PhoneCapabilityUploadDeps> = {}, serverFlag = '1') {
  const posts: Array<{ path: string; body: any }> = [];
  const native = fakeNative();
  const all: PhoneCapabilityUploadDeps & { posts: typeof posts; native: ReturnType<typeof fakeNative> } = {
    posts,
    native,
    localEnabled: true,
    nowMs: () => NOW.getTime(),
    getJson: jest.fn(async () => ({ status: 200, body: { flags: { DEVICE_MESH_V0_ENABLED: serverFlag }, fetchedAt: '2026-10-03T05:59:00Z' } })),
    postJson: jest.fn(async (path: string, body: unknown) => {
      posts.push({ path, body });
      return { status: 200, body: { deviceId: DEVICE, declarationId: 'x', digest: 'y', expiresAt: '2026-10-03T06:15:00.000Z', replayed: false } };
    }),
    prompt: 'Report what this phone can do',
    ...(overrides as object),
  } as never;
  return all;
}

describe('buildPhoneCapabilityDeclaration', () => {
  it('declares the three presence types and, in the foreground, the granted sensors; the contract decoder accepts it', () => {
    const declaration = declared();
    expect(declaration.kind).toBe('mobile');
    expect(declaration.attestedBy).toBe('device_key');
    expect(declaration.signerRef).toBe('dsc_phone_1');
    expect(declaration.items.map((item) => [item.type, item.category, item.state])).toEqual([
      ['notify.push.v1', 'owner_presence', 'available'],
      ['approve.owner.v1', 'owner_presence', 'available'],
      ['key.sign.v1', 'owner_presence', 'available'],
      ['sensor.location.v1', 'personal_sensor', 'available'],
    ]);
    expect(declaration.conditions).toEqual({ onPower: null, thermalOk: null, idle: null, foreground: true });
    expect(declaration.observedAt).toBe('2026-10-03T06:00:00Z');
    expect(declaration.expiresAt).toBe('2026-10-03T06:15:00Z');
  });

  it('in the background no sensor is declared; no push token and a software key read unavailable', () => {
    const declaration = declared({ foreground: false, pushReachable: false, hardwareKey: false, grantedSensors: ['sensor.location.v1', 'sensor.camera.v1'] });
    expect(declaration.items.map((item) => [item.type, item.state])).toEqual([
      ['notify.push.v1', 'unavailable'],
      ['approve.owner.v1', 'available'],
      ['key.sign.v1', 'unavailable'],
    ]);
    expect(declaration.conditions.foreground).toBe(false);
  });

  it('refuses without enrollment, without a shell binding, or with what the contract would not accept', () => {
    expect(buildPhoneCapabilityDeclaration(input({ credentialRef: null }))).toEqual({ ok: false, reason: 'not_enrolled' });
    expect(buildPhoneCapabilityDeclaration(input({ shellBinding: null }))).toEqual({ ok: false, reason: 'no_shell_binding' });
    expect(buildPhoneCapabilityDeclaration(input({ declarationId: 'not-a-uuid' }))).toEqual({ ok: false, reason: 'invalid' });
    expect(buildPhoneCapabilityDeclaration(input({ shellBinding: { id: '22222222-3333-4444-8555-666666666666', version: 0 } }))).toEqual({ ok: false, reason: 'invalid' });
  });

  it('keeps the lifetime between one and fifteen minutes', () => {
    expect(declared({ ttlSeconds: 5 }).expiresAt).toBe('2026-10-03T06:01:00Z');
    expect(declared({ ttlSeconds: 3600 }).expiresAt).toBe('2026-10-03T06:15:00Z');
  });
});

describe('uploadPhoneCapabilityDeclaration', () => {
  it('signs the five-line message over the canonical digest with the device key; the backend checks pass', async () => {
    const d = deps();
    const declaration = declared();
    const result = await uploadPhoneCapabilityDeclaration(declaration, d);
    expect(result).toEqual({ ok: true, expiresAt: '2026-10-03T06:15:00.000Z', replayed: false });
    expect(d.posts).toHaveLength(1);
    expect(d.posts[0].path).toBe(`/devices/${DEVICE}/capabilities`);
    const upload = decodeDeviceCapabilityUploadV0(d.posts[0].body, DEVICE, NOW);
    expect(upload.ok).toBe(true);
    const message = deviceCapabilityDeclarationMessageV0({
      deviceId: DEVICE,
      declarationId: declaration.declarationId,
      digest: deviceCapabilityDeclarationDigestV0(d.posts[0].body.declaration),
      observedAt: declaration.observedAt,
    });
    expect(d.native.sign).toHaveBeenCalledWith(message, 'Report what this phone can do');
    expect(verifyP1363(d.native.jwk, message, d.posts[0].body.signature)).toBe(true);

    const tampered = JSON.parse(JSON.stringify(d.posts[0].body.declaration));
    tampered.items[2].state = 'available';
    tampered.items[0].state = 'busy';
    const tamperedMessage = deviceCapabilityDeclarationMessageV0({ deviceId: DEVICE, declarationId: declaration.declarationId, digest: deviceCapabilityDeclarationDigestV0(tampered), observedAt: declaration.observedAt });
    expect(verifyP1363(d.native.jwk, tamperedMessage, d.posts[0].body.signature)).toBe(false);
  });

  it('off locally, off on the server, or an unreadable or stale switch table: nothing is signed or sent', async () => {
    for (const d of [
      deps({ localEnabled: false }),
      deps({}, '0'),
      deps({ getJson: jest.fn(async () => ({ status: 404, body: null })) } as never),
      deps({ getJson: jest.fn(async () => ({ status: 200, body: { flags: { DEVICE_MESH_V0_ENABLED: '1' }, fetchedAt: '2026-10-03T05:00:00Z' } })) } as never),
      deps({ getJson: jest.fn(async () => { throw new Error('offline'); }) } as never),
    ]) {
      expect(await uploadPhoneCapabilityDeclaration(declared(), d)).toEqual({ ok: false, reason: 'off' });
      expect(d.native.sign).not.toHaveBeenCalled();
      expect(d.posts).toHaveLength(0);
    }
  });

  it('the owner cancelling, a broken signature or a network error sends nothing more; a refusal is reported once', async () => {
    const cancelled = deps({ native: fakeNative({ cancel: true }) } as never);
    expect(await uploadPhoneCapabilityDeclaration(declared(), cancelled)).toEqual({ ok: false, reason: 'user_cancelled' });
    expect(cancelled.posts).toHaveLength(0);

    const garbage = deps({ native: fakeNative({ garbage: true }) } as never);
    expect(await uploadPhoneCapabilityDeclaration(declared(), garbage)).toEqual({ ok: false, reason: 'sign_failed' });
    expect(garbage.posts).toHaveLength(0);

    const offline = deps({ postJson: jest.fn(async () => { throw new Error('offline'); }) } as never);
    expect(await uploadPhoneCapabilityDeclaration(declared(), offline)).toEqual({ ok: false, reason: 'network' });

    const postJson = jest.fn(async () => ({ status: 403, body: { code: 'DEVICE_MESH_BINDING_INVALID' } }));
    const refused = deps({ postJson } as never);
    expect(await uploadPhoneCapabilityDeclaration(declared(), refused)).toEqual({ ok: false, reason: 'rejected', status: 403, code: 'DEVICE_MESH_BINDING_INVALID' });
    expect(postJson).toHaveBeenCalledTimes(1);

    const odd = deps({ postJson: jest.fn(async () => ({ status: 200, body: { replayed: true } })) } as never);
    expect(await uploadPhoneCapabilityDeclaration(declared(), odd)).toEqual({ ok: false, reason: 'rejected', status: 200, code: null });
  });
});
