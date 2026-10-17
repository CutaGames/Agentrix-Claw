/**
 * Identity credential on the phone (identityCredential.ts; the Web reads the same route in
 * frontend/lib/soul-core-console/identity-credential.ts).
 */
import * as fs from 'fs';
import * as path from 'path';
import type { HttpRequestV1, HttpResponseV1, HttpTransportV1 } from '../../../shared/client/transport';
import {
  IDENTITY_CREDENTIAL_OWNER_VERIFIED_MEANS,
  createMobileIdentityCredentialClient,
  decodeIdentityCredentialState,
  identityCredentialEnabled,
  identityCredentialView,
  type IdentityCredentialRead,
} from '../identityCredential';

const AGENT = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const BASE = 'https://api.example.test/api/';
const ROUTE = `https://api.example.test/api/agent-accounts/${AGENT}/identity-credential`;
const DID = 'did:pkh:eip155:97:0x2bee00000000000000000000000000000002b8f3';

const credential = (overrides: Record<string, unknown> = {}, subject: Record<string, unknown> = {}) => ({
  '@context': ['https://www.w3.org/2018/credentials/v1'],
  type: ['VerifiableCredential', 'AgentIdentityCredential'],
  issuer: 'did:pkh:eip155:97:0x1550e70000000000000000000000000000000001',
  issuanceDate: '2026-10-03T12:00:00.000Z',
  credentialSubject: {
    id: DID,
    kind: 'identity',
    agentRef: 'agx_agent_0001',
    passportNumber: 'AGX-0001-ABCD',
    ownerVerified: true,
    ownerVerification: 'signed_in_owner',
    issuedOn: '2026-10-03',
    ...subject,
  },
  proof: { type: 'EcdsaSecp256k1Signature2019', jws: 'eyJhbGciOiJFUzI1NksifQ..c2ln', verificationMethod: 'did:pkh:eip155:97:0x1550e7#controller' },
  ...overrides,
});
const state = (data: Record<string, unknown>) => ({ success: true, data: { did: DID, credential: credential(), verified: true, ...data } });
const reply = (body: unknown, status = 200): HttpResponseV1 => ({ status, headers: {}, body });

function client(responses: Array<HttpResponseV1 | Error>, options: { token?: string | null } = {}) {
  const requests: HttpRequestV1[] = [];
  const transport: HttpTransportV1 = {
    async request(request) {
      requests.push(request);
      const next = responses.shift();
      if (!next) throw new Error('no response queued');
      if (next instanceof Error) throw next;
      return next;
    },
  };
  const api = createMobileIdentityCredentialClient({
    transport,
    baseUrl: BASE,
    token: () => (options.token === undefined ? 'token-1' : options.token),
  });
  return { api, requests };
}

describe('identity credential on the phone · switch and decoding', () => {
  it('is on only when the build sets "1"', () => {
    expect(identityCredentialEnabled('1')).toBe(true);
    for (const value of ['0', 'true', '', undefined, 1]) expect(identityCredentialEnabled(value)).toBe(false);
  });

  it('reads an issued credential, a DID without one, and an Agent without a wallet', () => {
    expect(decodeIdentityCredentialState(state({}))).toEqual({ did: DID, credential: credential(), verified: true });
    expect(decodeIdentityCredentialState(state({ verified: false }))?.verified).toBe(false);
    expect(decodeIdentityCredentialState(state({ credential: null, verified: true }))).toEqual({ did: DID, credential: null, verified: false });
    expect(decodeIdentityCredentialState(state({ did: null, credential: null, verified: false }))).toEqual({ did: null, credential: null, verified: false });
  });

  it('anything the Web would not read is unreadable', () => {
    const bad: unknown[] = [
      null,
      { success: true },
      state({ verified: 'yes' }),
      state({ did: 'pkh:0x1' }),
      state({ did: 42 }),
      state({ credential: credential({}, { id: 'did:pkh:eip155:97:0xsomeoneelse' }) }),
      state({ credential: credential({ type: ['VerifiableCredential'] }) }),
      state({ credential: credential({ issuer: 'https://issuer.example' }) }),
      state({ credential: credential({ issuanceDate: 20261003 }) }),
      state({ credential: credential({ proof: { type: 'x', jws: '', verificationMethod: 'did:x#k' } }) }),
      state({ credential: credential({ '@context': 'https://www.w3.org/2018/credentials/v1' }) }),
      state({ credential: credential({}, { kind: 'reputation' }) }),
      state({ credential: credential({}, { ownerVerified: 'true' }) }),
      state({ credential: credential({}, { issuedOn: '2026-10-03T12:00:00Z' }) }),
      state({ credential: credential({}, { passportNumber: null }) }),
      state({ credential: credential({}, { agentRef: undefined }) }),
      state({ credential: credential({}, { ownerVerification: 1 }) }),
      state({ credential: 'signed' }),
    ];
    for (const body of bad) expect(decodeIdentityCredentialState(body)).toBeNull();
  });
});

describe('identity credential on the phone · reading it', () => {
  it('GETs the owner route with the session token and reads the answer', async () => {
    const { api, requests } = client([reply(state({}))]);
    await expect(api.read(AGENT)).resolves.toEqual({ kind: 'ready', state: { did: DID, credential: credential(), verified: true } });
    expect(requests).toHaveLength(1);
    expect(requests[0].method).toBe('GET');
    expect(requests[0].path).toBe(ROUTE);
    expect(requests[0].headers).toMatchObject({ Accept: 'application/json', Authorization: 'Bearer token-1' });
    expect(requests[0]).not.toHaveProperty('body');
  });

  it('a 404 (server switch off, or not yours) hides it; other answers and network errors are unreadable', async () => {
    await expect(client([reply({ message: 'Not Found' }, 404)]).api.read(AGENT)).resolves.toEqual({ kind: 'hidden' });
    for (const status of [401, 403, 500, 503]) {
      await expect(client([reply(state({}), status)]).api.read(AGENT)).resolves.toEqual({ kind: 'unreadable' });
    }
    await expect(client([new Error('offline')]).api.read(AGENT)).resolves.toEqual({ kind: 'unreadable' });
    await expect(client([reply(state({ credential: credential({}, { id: 'did:pkh:eip155:97:0xother' }) }))]).api.read(AGENT)).resolves.toEqual({ kind: 'unreadable' });
  });

  it('asks nothing without a sign-in or with a bad id', async () => {
    const signedOut = client([], { token: null });
    await expect(signedOut.api.read(AGENT)).resolves.toEqual({ kind: 'signed_out' });
    expect(signedOut.requests).toHaveLength(0);
    for (const id of ['', 'short', '../agent-accounts/x', `${AGENT}/identity-credential`, 'a'.repeat(81)]) {
      const bad = client([]);
      await expect(bad.api.read(id)).resolves.toEqual({ kind: 'unreadable' });
      expect(bad.requests).toHaveLength(0);
    }
  });
});

describe('identity credential on the phone · what the passport screen shows', () => {
  const ready = (data: Record<string, unknown>): IdentityCredentialRead => {
    const decoded = decodeIdentityCredentialState(state(data));
    if (!decoded) throw new Error('fixture does not decode');
    return { kind: 'ready', state: decoded };
  };

  it('shows nothing while hidden or signed out; says so while loading or unreadable', () => {
    expect(identityCredentialView({ kind: 'hidden' })).toBeNull();
    expect(identityCredentialView({ kind: 'signed_out' })).toBeNull();
    expect(identityCredentialView('loading')).toMatchObject({ headline: { zh: '正在读取身份凭证…' }, signature: null, did: null, notes: [] });
    expect(identityCredentialView({ kind: 'unreadable' })).toMatchObject({ headline: { zh: '身份凭证暂时读不到，请稍后再看。' }, signature: null, did: null });
  });

  it('an issued credential: date, whether the signature checks out, the DID, public ID and passport number', () => {
    const view = identityCredentialView(ready({}));
    expect(view).toMatchObject({ headline: { zh: '已签发 · 2026-10-03', en: 'Issued · 2026-10-03' }, signature: 'checks_out', did: DID });
    expect(view?.notes[0]).toEqual({ zh: '公开编号 agx_agent_0001 · 护照号 AGX-0001-ABCD', en: 'Public ID agx_agent_0001 · Passport AGX-0001-ABCD' });
    expect(view?.notes).toContainEqual(IDENTITY_CREDENTIAL_OWNER_VERIFIED_MEANS);
    expect(identityCredentialView(ready({ verified: false }))?.signature).toBe('does_not_check_out');
  });

  it('not issued points to the Web; no wallet means no DID', () => {
    const notIssued = identityCredentialView(ready({ credential: null }));
    expect(notIssued).toMatchObject({ headline: { zh: '还没签发' }, signature: null, did: DID });
    expect(notIssued?.notes[0].zh).toContain('在网页的元神控制台里签发');
    expect(notIssued?.notes).toContainEqual(IDENTITY_CREDENTIAL_OWNER_VERIFIED_MEANS);
    const noWallet = identityCredentialView(ready({ did: null, credential: null, verified: false }));
    expect(noWallet).toMatchObject({ signature: null, did: null });
    expect(noWallet?.headline.zh).toContain('还没有钱包');
  });
});

describe('identity credential on the phone · screen wiring', () => {
  const read = (relative: string) => fs.readFileSync(path.join(__dirname, '..', '..', relative), 'utf8');

  it('the passport screen shows it only behind the build switch and with an Agent', () => {
    expect(read('screens/four-zone/TwinPassportScreen.tsx')).toMatch(
      /\{IDENTITY_CREDENTIAL_ENABLED && agentAccountId \? <TwinIdentityCredential agentAccountId=\{agentAccountId\} \/> : null\}/,
    );
  });

  it('the phone only reads: no issuing request anywhere, and the service has no React Native import', () => {
    const service = read('services/identityCredential.ts');
    const panel = read('screens/four-zone/TwinIdentityCredential.tsx');
    for (const source of [service, panel]) expect(source).not.toMatch(/'POST'|method: 'POST'|\.issue\(/);
    expect(service).not.toMatch(/from 'react-native'|from 'expo-/);
    expect(panel).toContain('identityCredentialView(');
  });
});
