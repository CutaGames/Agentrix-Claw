/**
 * 身份凭证 on the phone (L5 backend 9 option B, mobile): the credential the platform signs onto the Agent's DID, shown
 * read-only on the passport screen. Off unless the build sets `EXPO_PUBLIC_SOUL_CORE_IDENTITY_VC_ENABLED=1`; the server
 * answers 404 while `SOUL_CORE_IDENTITY_VC_ENABLED` is off (and to anyone but the owner), and then nothing shows.
 *
 * `GET /agent-accounts/:id/identity-credential` → `{ success, data: { did, credential, verified } }`, decoded with the
 * shared contract (shared/types/agent-identity-credential.ts, the same decoder as the Web): type AgentIdentityCredential,
 * subject id equals the DID, ownerVerified true, issuedOn a day; anything else is unreadable. Issuing stays on the Web.
 * No React Native import: the transport and token are injected (TwinIdentityCredential.tsx binds them).
 */
import type { HttpResponseV1, HttpTransportV1 } from '../../shared/client/transport';
import {
  agentIdentityCredentialPathV1,
  decodeIdentityCredentialStateV1,
  type IdentityCredentialStateV1,
} from '../../shared/types/agent-identity-credential';

export {
  decodeIdentityCredentialV1,
  decodeIdentityCredentialStateV1 as decodeIdentityCredentialState,
  type IdentityCredentialStateV1,
  type IdentityCredentialSubjectV1,
  type IdentityCredentialV1,
} from '../../shared/types/agent-identity-credential';

type Copy = { zh: string; en: string };

export function identityCredentialEnabled(value: unknown): boolean {
  return value === '1';
}

// Read as a literal member expression so the Expo build inlines it.
export const IDENTITY_CREDENTIAL_ENABLED = identityCredentialEnabled(process.env.EXPO_PUBLIC_SOUL_CORE_IDENTITY_VC_ENABLED);

const SAFE_ID = /^[0-9a-zA-Z_-]{8,80}$/;

export const identityCredentialPath = agentIdentityCredentialPathV1;

export type IdentityCredentialRead =
  | { kind: 'ready'; state: IdentityCredentialStateV1 }
  /** 404: the server switch is off, or the Agent is not the caller's (the same answer). Nothing shows. */
  | { kind: 'hidden' }
  /** Nobody is signed in on this phone: nothing is requested. */
  | { kind: 'signed_out' }
  | { kind: 'unreadable' };

export interface MobileIdentityCredentialClientV0 {
  read(agentAccountId: string): Promise<IdentityCredentialRead>;
}

export function createMobileIdentityCredentialClient(deps: {
  transport: HttpTransportV1;
  baseUrl: string;
  token: () => string | null | undefined;
}): MobileIdentityCredentialClientV0 {
  const base = deps.baseUrl.replace(/\/+$/, '');
  return {
    async read(agentAccountId) {
      if (!SAFE_ID.test(agentAccountId)) return { kind: 'unreadable' };
      const token = deps.token();
      if (!token) return { kind: 'signed_out' };
      let response: HttpResponseV1;
      try {
        response = await deps.transport.request({
          method: 'GET',
          path: `${base}${identityCredentialPath(agentAccountId)}`,
          headers: { Accept: 'application/json', Authorization: `Bearer ${token}`, 'X-Agentrix-Surface': 'mobile' },
        });
      } catch {
        return { kind: 'unreadable' };
      }
      if (response.status === 404) return { kind: 'hidden' };
      if (response.status !== 200) return { kind: 'unreadable' };
      const state = decodeIdentityCredentialStateV1(response.body);
      return state ? { kind: 'ready', state } : { kind: 'unreadable' };
    },
  };
}

// ── What the passport screen shows ──────────────────────────────────────────────────────

export type IdentityCredentialSignature = 'checks_out' | 'does_not_check_out';

export interface IdentityCredentialView {
  headline: Copy;
  /** Only for an issued credential: whether its signature checks out against the platform's published address. */
  signature: IdentityCredentialSignature | null;
  /** The Agent's DID, when it has one. */
  did: string | null;
  notes: Copy[];
}

export const IDENTITY_CREDENTIAL_SIGNATURE_COPY: Readonly<Record<IdentityCredentialSignature, Copy>> = {
  checks_out: { zh: '验签通过', en: 'Signature checks out' },
  does_not_check_out: { zh: '验签没通过，先别拿去用', en: 'Signature does not check out; do not use it' },
};

/** Same wording as the Web panel: it is about who asked, not an ID check. */
export const IDENTITY_CREDENTIAL_OWNER_VERIFIED_MEANS: Copy = {
  zh: '「主人已验证」是指签发时是你本人登录后来要的，不是实名认证。',
  en: '"Owner verified" means you asked for it while signed in. It is not an ID check.',
};

/** A read as the passport screen shows it; `null` shows nothing (server switch off, not yours, signed out). */
export function identityCredentialView(read: IdentityCredentialRead | 'loading'): IdentityCredentialView | null {
  if (read === 'loading') return { headline: { zh: '正在读取身份凭证…', en: 'Reading the identity credential…' }, signature: null, did: null, notes: [] };
  if (read.kind === 'hidden' || read.kind === 'signed_out') return null;
  if (read.kind === 'unreadable') {
    return { headline: { zh: '身份凭证暂时读不到，请稍后再看。', en: 'The identity credential cannot be read right now.' }, signature: null, did: null, notes: [] };
  }
  const { did, credential, verified } = read.state;
  if (did === null) {
    return {
      headline: { zh: '这只 Agent 还没有钱包，所以没有 DID，也没有身份凭证。', en: 'This Agent has no wallet yet, so it has no DID and no identity credential.' },
      signature: null,
      did: null,
      notes: [{ zh: '先在网页上创建或绑定钱包。', en: 'Create or link a wallet on the Web first.' }],
    };
  }
  if (!credential) {
    return {
      headline: { zh: '还没签发', en: 'Not issued yet' },
      signature: null,
      did,
      notes: [
        {
          zh: '在网页的元神控制台里签发：平台会用签发钥匙给这只 Agent 的 DID 签一张身份凭证，写明公开编号和「主人已验证」。',
          en: 'Issue it in the Soul Core console on the Web: the platform signing key signs an identity credential onto this Agent\u2019s DID, with its public ID and "owner verified".',
        },
        IDENTITY_CREDENTIAL_OWNER_VERIFIED_MEANS,
      ],
    };
  }
  const subject = credential.credentialSubject;
  return {
    headline: { zh: `已签发 · ${subject.issuedOn}`, en: `Issued · ${subject.issuedOn}` },
    signature: verified ? 'checks_out' : 'does_not_check_out',
    did,
    notes: [
      { zh: `公开编号 ${subject.agentRef} · 护照号 ${subject.passportNumber}`, en: `Public ID ${subject.agentRef} · Passport ${subject.passportNumber}` },
      IDENTITY_CREDENTIAL_OWNER_VERIFIED_MEANS,
      { zh: '任何人可凭这张凭证和平台公开的签发地址离线验签；下载凭证在网页上。', en: 'Anyone can verify it offline against the platform\u2019s published signing address; download it on the Web.' },
    ],
  };
}
