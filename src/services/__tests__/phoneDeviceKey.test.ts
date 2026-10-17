/**
 * The phone as a registered device with its own P-256 key (phoneDeviceKey.ts; contracts
 * device-pairing-proof.ts, device-signing-credential.ts). The fake native key is a real P-256 key from
 * Node's crypto that signs DER, like Keystore and Secure Enclave; proofs are verified the way the backend
 * does (`DeviceRegistryService.assertPairingProof`, `DeviceSigningCredentialService`).
 */
import { describe, it, expect, jest } from '@jest/globals';
import * as crypto from 'crypto';
import type { HttpRequestV1, HttpResponseV1, HttpTransportV1 } from '../../../shared/client/transport';
import {
  deriveSelfCertifyingDeviceIdV1,
  devicePairingProofMessageV1,
  validateDevicePairingProofShapeV1,
} from '../../../shared/types/device-pairing-proof';
import { deviceSigningCredentialRegisterProofMessageV1 } from '../../../shared/types/device-signing-credential';
import { computeEmbeddedCanonicalSha256V1 } from '../../../shared/types/soul-core-embedded';
import {
  PhoneDeviceKeyError,
  decodePhoneEnrollmentState,
  derSignatureToP1363,
  enrollPhoneDevice,
  phoneDeviceFence,
  phoneDeviceId,
  phoneKeyJwk,
  phoneKeyThumbprint,
  signWithPhoneKey,
  type PhoneDeviceKeyNativeV1,
  type PhoneEnrollmentStateV1,
  type PhoneKeyHardwareV1,
} from '../phoneDeviceKey';

const BASE = 'https://api.agentrix.top/api';

function fakeNative(hardware: PhoneKeyHardwareV1 = 'tee') {
  let key: crypto.KeyObject | null = null;
  let pub: { x: string; y: string } | null = null;
  const signed: string[] = [];
  const make = () => {
    const pair = crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' });
    key = pair.privateKey;
    const jwk = pair.publicKey.export({ format: 'jwk' }) as { x: string; y: string };
    pub = { x: jwk.x, y: jwk.y };
  };
  const native: PhoneDeviceKeyNativeV1 & { signed: string[] } = {
    signed,
    getPublicKey: jest.fn(async () => (pub ? { ...pub, hardware } : null)),
    createKey: jest.fn(async () => {
      make();
      return { ...pub!, hardware };
    }),
    sign: jest.fn(async (message: string) => {
      signed.push(message);
      return crypto.sign('sha256', Buffer.from(message, 'utf8'), { key: key!, dsaEncoding: 'der' }).toString('base64');
    }),
  };
  return native;
}

function verifyP1363(jwk: { x: string; y: string }, message: string, signature: string): boolean {
  const publicKey = crypto.createPublicKey({ key: { kty: 'EC', crv: 'P-256', x: jwk.x, y: jwk.y }, format: 'jwk' });
  return crypto.verify('sha256', Buffer.from(message, 'utf8'), { key: publicKey, dsaEncoding: 'ieee-p1363' }, Buffer.from(signature, 'base64url'));
}

function memoryStore(initial: PhoneEnrollmentStateV1 | null = null) {
  let state = initial;
  return {
    get: () => state,
    load: jest.fn(async () => state),
    save: jest.fn(async (next: PhoneEnrollmentStateV1) => {
      state = JSON.parse(JSON.stringify(next));
    }),
  };
}

const deviceRow = (deviceId: string) => ({
  device_id: deviceId,
  device_class: 'phone',
  device_revocation_epoch: '0',
  credential_revocation_epoch: '0',
  optimistic_version: '3',
  credential_version: '1',
});

/** A fake server: verifies the proofs like the backend, answers like the routes. */
function fakeServer(options: { pairStatus?: number; registerStatus?: number; listMissing?: boolean; otherThumbprint?: boolean } = {}) {
  const calls: HttpRequestV1[] = [];
  let registered: Record<string, unknown> | null = null;
  const transport: HttpTransportV1 = {
    request: jest.fn(async (req: HttpRequestV1): Promise<HttpResponseV1> => {
      calls.push(req);
      const path = req.path.replace(BASE, '');
      const b = req.body as Record<string, any>;
      if (path === '/v1/devices/pair/ticket') return { status: 201, headers: {}, body: { ticket: 'tkt_0123456789abcdef', expires_at: '2026-10-01T10:00:00Z' } };
      if (path === '/v1/devices/pair') {
        const { x, y } = b.proof.publicJwk;
        const derived = deriveSelfCertifyingDeviceIdV1(computeEmbeddedCanonicalSha256V1({ crv: 'P-256', kty: 'EC', x, y }));
        if (!validateDevicePairingProofShapeV1(b.proof).valid || derived !== b.device_id) return { status: 403, headers: {}, body: { code: 'DEVICE_PAIRING_PROOF_INVALID' } };
        if (!verifyP1363({ x, y }, devicePairingProofMessageV1({ ticket: b.ticket, deviceId: b.device_id }), b.proof.signature)) {
          return { status: 403, headers: {}, body: { code: 'DEVICE_PAIRING_PROOF_INVALID' } };
        }
        if (options.pairStatus) return { status: options.pairStatus, headers: {}, body: {} };
        return { status: 201, headers: {}, body: { device: deviceRow(b.device_id), dst: 'dst-secret' } };
      }
      if (path === '/v1/devices') {
        const items = options.listMissing ? [] : calls.filter((c) => c.path.endsWith('/v1/devices/pair')).map((c) => deviceRow((c.body as any).device_id));
        return { status: 200, headers: {}, body: { items } };
      }
      const m = path.match(/^\/v1\/devices\/([^/]+)\/signing-credentials\/(register|current\?purpose=device-auth)$/);
      if (m && m[2] === 'register') {
        const deviceId = decodeURIComponent(m[1]);
        const thumbprint = computeEmbeddedCanonicalSha256V1({ crv: 'P-256', kty: 'EC', x: b.publicJwk.x, y: b.publicJwk.y });
        const message = deviceSigningCredentialRegisterProofMessageV1({ deviceId, requestId: b.requestId, publicKeyThumbprint: thumbprint });
        if (!verifyP1363(b.publicJwk, message, b.proof.signature)) return { status: 403, headers: {}, body: { code: 'DEVICE_SIGNING_PROOF_INVALID' } };
        registered = {
          credentialRef: 'cred_phone_1',
          deviceId,
          publicKeyThumbprint: options.otherThumbprint ? 'f'.repeat(64) : thumbprint,
          status: 'active',
        };
        if (options.registerStatus) return { status: options.registerStatus, headers: {}, body: {} };
        return { status: 201, headers: {}, body: { receipt: { credential: registered } } };
      }
      if (m) return { status: 200, headers: {}, body: { credential: registered } };
      return { status: 404, headers: {}, body: {} };
    }),
  };
  return { transport, calls };
}

let counter = 0;
const deps = (native: PhoneDeviceKeyNativeV1, transport: HttpTransportV1, store = memoryStore()) => ({
  native,
  transport,
  baseUrl: `${BASE}/`,
  token: 'jwt-token',
  store,
  label: 'Pixel 9',
  newRequestId: async (prefix: string) => `${prefix}-${(counter += 1).toString(16).padStart(8, '0')}`,
  now: () => new Date('2026-10-01T09:40:00.000Z'),
  prompt: '确认把这台手机登记为你的设备',
});

describe('key material', () => {
  it('the device id is the server derivation of the JWK thumbprint', async () => {
    const native = fakeNative();
    const key = await native.createKey();
    const jwk = phoneKeyJwk(key);
    expect(jwk).toEqual({ kty: 'EC', crv: 'P-256', x: key.x, y: key.y });
    expect(phoneKeyThumbprint(jwk)).toBe(computeEmbeddedCanonicalSha256V1({ crv: 'P-256', kty: 'EC', x: key.x, y: key.y }));
    expect(phoneDeviceId(jwk)).toMatch(/^dev_[0-9a-f]{32}$/);
    expect(() => phoneKeyJwk({ x: 'short', y: key.y })).toThrow('key_invalid');
  });

  it('DER signatures become 64-byte P1363 that the backend verifies', async () => {
    const native = fakeNative();
    const key = await native.createKey();
    for (let i = 0; i < 40; i += 1) {
      const message = `agentrix.test\n${i}`;
      const p1363 = await signWithPhoneKey(native, message, 'p');
      expect(p1363).toMatch(/^[A-Za-z0-9_-]{86}$/);
      expect(verifyP1363(key, message, p1363)).toBe(true);
    }
  });

  it('malformed DER is refused', () => {
    const der = (hex: string) => Buffer.from(hex, 'hex').toString('base64');
    const r = '01'.repeat(32);
    expect(derSignatureToP1363(der(`30440220${r}0220${r}`))).toMatch(/^[A-Za-z0-9_-]{86}$/);
    for (const bad of [
      `31440220${r}0220${r}`, // not a sequence
      `30450220${r}0220${r}`, // wrong length
      `30440220${r}0320${r}`, // not an integer
      `30460220${r}0220${r}0000`, // trailing bytes
      `30440220${'81'}${'01'.repeat(31)}0220${r}`, // negative r
      `3045022100${'01'.repeat(32)}0220${r}`, // padded without need
      `3025020100${'0220'}${r}`, // r is zero
    ]) {
      expect(() => derSignatureToP1363(der(bad))).toThrow('signature_invalid');
    }
    expect(() => derSignatureToP1363('not base64!')).toThrow('signature_invalid');
  });

  it('a cancelled prompt is its own error', async () => {
    const native = fakeNative();
    await native.createKey();
    (native.sign as jest.Mock<any>).mockRejectedValueOnce(Object.assign(new Error('x'), { code: 'user_cancelled' }));
    await expect(signWithPhoneKey(native, 'm', 'p')).rejects.toMatchObject({ code: 'user_cancelled' });
    (native.sign as jest.Mock<any>).mockRejectedValueOnce(new Error('boom'));
    await expect(signWithPhoneKey(native, 'm', 'p')).rejects.toMatchObject({ code: 'sign_failed' });
  });
});

describe('enrollment', () => {
  it('pairs with a proof the server accepts, then registers the same key as device-auth', async () => {
    const native = fakeNative();
    const { transport, calls } = fakeServer();
    const store = memoryStore();
    const result = await enrollPhoneDevice(deps(native, transport, store));
    const key = (await native.getPublicKey())!;
    const deviceId = phoneDeviceId(phoneKeyJwk(key));
    expect(result).toEqual({ deviceId, credentialRef: 'cred_phone_1', hardware: 'tee' });
    expect(calls.map((c) => `${c.method} ${c.path.replace(BASE, '')}`)).toEqual([
      'POST /v1/devices/pair/ticket',
      'POST /v1/devices/pair',
      'GET /v1/devices',
      `POST /v1/devices/${deviceId}/signing-credentials/register`,
    ]);
    const pair = calls[1].body as any;
    expect(pair).toMatchObject({ device_id: deviceId, device_class: 'phone', label: 'Pixel 9', ticket: 'tkt_0123456789abcdef' });
    const register = calls[3].body as any;
    expect(register).toMatchObject({ schemaVersion: 1, algorithm: 'ecdsa-p256-sha256', purpose: 'device-auth', publicJwk: phoneKeyJwk(key) });
    expect(register.expectedDeviceFence).toEqual({
      schemaVersion: 1,
      target: { kind: 'device_registry', deviceId },
      deviceRevocationEpoch: '0',
      credentialRevocationEpoch: '0',
      optimisticVersion: '3',
      credentialVersion: '1',
      capturedAt: '2026-10-01T09:40:00.000Z',
    });
    for (const c of calls) expect(c.headers?.Authorization).toBe('Bearer jwt-token');
    // Two signatures, both by the device key, each asking the owner.
    expect(native.signed).toHaveLength(2);
    expect(store.get()).toMatchObject({ deviceId, paired: true, credentialRef: 'cred_phone_1' });
  });

  it('done already: nothing is sent again', async () => {
    const native = fakeNative();
    const { transport, calls } = fakeServer();
    const store = memoryStore();
    await enrollPhoneDevice(deps(native, transport, store));
    const before = calls.length;
    await enrollPhoneDevice(deps(native, transport, store));
    expect(calls.slice(before).map((c) => c.method + ' ' + c.path.replace(BASE, ''))).toEqual(['GET /v1/devices']);
    expect(native.signed).toHaveLength(2);
  });

  it('a 409 on pair or register is checked, not trusted: the device must be listed and the credential must be this key', async () => {
    const native = fakeNative();
    const ok409 = fakeServer({ pairStatus: 409, registerStatus: 409 });
    await expect(enrollPhoneDevice(deps(native, ok409.transport))).resolves.toMatchObject({ credentialRef: 'cred_phone_1' });

    const notListed = fakeServer({ pairStatus: 409, listMissing: true });
    await expect(enrollPhoneDevice(deps(fakeNative(), notListed.transport))).rejects.toMatchObject({ code: 'device_not_owned' });

    const otherKey = fakeServer({ registerStatus: 409, otherThumbprint: true });
    await expect(enrollPhoneDevice(deps(fakeNative(), otherKey.transport))).rejects.toMatchObject({ code: 'signer_mismatch' });
  });

  it('resumes with the same request ids after a failure', async () => {
    const native = fakeNative();
    const store = memoryStore();
    const server = fakeServer();
    let offline = true;
    const flaky: HttpTransportV1 = {
      request: async (req) => {
        if (offline && req.path.endsWith('/signing-credentials/register')) throw new Error('offline');
        return server.transport.request(req);
      },
    };
    await expect(enrollPhoneDevice(deps(native, flaky, store))).rejects.toMatchObject({ code: 'network' });
    const firstRegisterId = store.get()!.registerRequestId;
    expect(store.get()).toMatchObject({ paired: true });
    expect(firstRegisterId).toMatch(/^phone-register-/);
    offline = false;
    await expect(enrollPhoneDevice(deps(native, flaky, store))).resolves.toMatchObject({ credentialRef: 'cred_phone_1' });
    const registers = server.calls.filter((c) => c.path.endsWith('/register'));
    expect(registers).toHaveLength(1);
    expect((registers[0].body as any).requestId).toBe(firstRegisterId);
    expect(server.calls.filter((c) => c.path.endsWith('/v1/devices/pair'))).toHaveLength(1);
  });

  it('a software key is refused; a state for another key starts over', async () => {
    await expect(enrollPhoneDevice(deps(fakeNative('software'), fakeServer().transport))).rejects.toMatchObject({ code: 'key_not_hardware_backed' });
    await expect(enrollPhoneDevice({ ...deps(fakeNative('software'), fakeServer().transport), allowSoftwareKey: true })).resolves.toMatchObject({ hardware: 'software' });
    const store = memoryStore({ deviceId: 'dev_' + '0'.repeat(32), paired: true, credentialRef: 'cred_old' });
    const server = fakeServer();
    const result = await enrollPhoneDevice(deps(fakeNative(), server.transport, store));
    expect(result.credentialRef).toBe('cred_phone_1');
    expect(server.calls.some((c) => c.path.endsWith('/pair'))).toBe(true);
  });

  it('a pair answer for another device, or a rejected pair, fails closed', async () => {
    const native = fakeNative();
    const server = fakeServer();
    const wrong: HttpTransportV1 = {
      request: async (req) => {
        const res = await server.transport.request(req);
        if (req.path.endsWith('/v1/devices/pair')) return { ...res, body: { device: deviceRow('dev_' + 'a'.repeat(32)) } };
        return res;
      },
    };
    await expect(enrollPhoneDevice(deps(native, wrong))).rejects.toMatchObject({ code: 'pair_device_mismatch' });
    const rejected: HttpTransportV1 = { request: async () => ({ status: 403, headers: {}, body: {} }) };
    await expect(enrollPhoneDevice(deps(fakeNative(), rejected))).rejects.toMatchObject({ code: 'pair_ticket_rejected' });
  });
});

describe('stored state and fence', () => {
  it('decodes only a well-formed state', () => {
    const id = 'dev_' + '1'.repeat(32);
    expect(decodePhoneEnrollmentState({ deviceId: id, paired: true, pairRequestId: 'phone-pair-1', credentialRef: 'cred_1' })).toEqual({
      deviceId: id,
      paired: true,
      pairRequestId: 'phone-pair-1',
      registerRequestId: undefined,
      credentialRef: 'cred_1',
    });
    expect(decodePhoneEnrollmentState({ deviceId: 'desktop-1' })).toBeNull();
    expect(decodePhoneEnrollmentState({ deviceId: id, pairRequestId: ' bad id' })).toMatchObject({ pairRequestId: undefined });
    expect(decodePhoneEnrollmentState(null)).toBeNull();
  });

  it('a fence needs every epoch as a decimal string', () => {
    const id = 'dev_' + '1'.repeat(32);
    expect(() => phoneDeviceFence({ ...deviceRow(id), optimistic_version: 3 }, id, 'now')).toThrow(PhoneDeviceKeyError);
    expect(() => phoneDeviceFence({ ...deviceRow(id), credential_version: '-1' }, id, 'now')).toThrow('unexpected_response');
  });
});
