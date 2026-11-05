/**
 * L8-6 own wallet, wallet origin side: the two recovery pages' steps (design 5.4), over ports so that tests drive them.
 *
 * Owner's new device (`/wallet/recover/`, link from `POST /recovery/requests`):
 * 1. Create a NEW wallet passkey on this device (5.4 step 2) and post only its public key with the one-time token.
 * 2. The server answers a second request (the recovery UserOp). The page fetches it, computes the hash itself and
 *    checks it with `checkRecoverV1` (role owner: the UserOp adds exactly this page's new key, through SocialRecovery,
 *    on the pinned validator). A server hash that differs is refused.
 * 3. It reads the account's credentials and guardians from the chain through the public node, finds the root key
 *    (the one that gives the account address at some index) and writes L for the new key with that root key, so the
 *    address shown later is still computed on this device. The new key can sign only after the receipt (backend).
 * 4. The recovery code (optional) signs here; a guardian link is shown for the others.
 *
 * Guardian page (`/wallet/guardian/`): fetch the request, check it (role guardian), read the guardians from the chain,
 * show the fingerprint decoded from the UserOp; then `guardian-sign.ts`.
 */
import type { OwnWalletChainIdV1 } from '../../../shared/types/agent-own-wallet';
import type { OwnWalletGuardianStateV1, OwnWalletOriginClientV1, OwnWalletRecoverRequestV1 } from './client';
import { saltIndexOfV1 } from './device-check';
import type { OwnWalletCreateLinkV1 } from './links';
import { readLocalRecordsV1, recordLocalAccountV1, type OwnWalletLocalRecordV1, type OwnWalletLocalStorePortV1 } from './local-store';
import { readGuardiansV1, readWebAuthnCredentialsV1, type OwnWalletPublicChainReaderV1 } from './public-chain-reader';
import { checkRecoverV1 } from './purpose-checks';
import { signRecoveryWithCodeV1 } from './recovery-code';
import type { OwnWalletWalletRequestV1 } from './userop-hash';
import { createWalletPasskeyV1, type OwnWalletWebAuthnPortV1 } from './webauthn';

export type OwnWalletRecoveryFailureV1 = { ok: false; reasonCode: string; status?: number; message?: string };

/** What a recovery page shows: everything decoded or read on this device. */
export interface OwnWalletRecoveryViewStateV1 {
  requestRef: string;
  walletToken: string;
  account: string;
  userOpHash: string;
  /** sha256 of the new key, from the decoded UserOp (5.4 step 5). */
  fingerprint: string;
  /** `getGuardians(account)` and `threshold(account)` as the public node gave them. */
  guardians: string[];
  threshold: number;
}

const ROLE_OWNER = 'owner' as const;

async function checkedRequest(
  client: OwnWalletOriginClientV1,
  requestRef: string,
  walletToken: string,
  input: { configuredChainId: OwnWalletChainIdV1 | null; records: readonly OwnWalletLocalRecordV1[]; role: 'owner' | 'guardian'; freshCredential?: { pubKeyX: string; pubKeyY: string }; serverHash?: string },
): Promise<{ ok: true; request: OwnWalletWalletRequestV1; userOpHash: string; fingerprint: string } | OwnWalletRecoveryFailureV1> {
  const got = await client.getRequest(requestRef, walletToken);
  if (got.ok === false) return { ok: false, reasonCode: got.code, status: got.status };
  if (got.value.purpose !== 'recover') return { ok: false, reasonCode: 'purpose_mismatch' };
  const check = checkRecoverV1({
    request: got.value,
    configuredChainId: input.configuredChainId,
    intent: null,
    records: input.records,
    pins: { fileBaseUrl: '', mainOrigin: '' },
    role: input.role,
    ...(input.freshCredential ? { freshCredential: input.freshCredential } : {}),
  });
  if (check.ok === false) return { ok: false, reasonCode: check.reasonCode, ...(check.message ? { message: check.message } : {}) };
  if (check.display.purpose !== 'recover') return { ok: false, reasonCode: 'purpose_mismatch' };
  if (input.serverHash !== undefined && input.serverHash !== check.userOpHash) return { ok: false, reasonCode: 'userop_hash_mismatch' };
  return { ok: true, request: got.value, userOpHash: check.userOpHash, fingerprint: check.display.fingerprint };
}

async function chainGuardians(reader: OwnWalletPublicChainReaderV1, account: string): Promise<{ guardians: string[]; threshold: number } | OwnWalletRecoveryFailureV1> {
  try {
    const g = await readGuardiansV1(reader, account);
    if (g.guardians.length === 0 || g.threshold < 1) return { ok: false, reasonCode: 'recovery_required' };
    return g;
  } catch {
    return { ok: false, reasonCode: 'network_unavailable' };
  }
}

const isFailure = (v: unknown): v is OwnWalletRecoveryFailureV1 => typeof v === 'object' && v !== null && (v as { ok?: unknown }).ok === false;

export interface OwnWalletRecoverDepsV1 {
  chainId: OwnWalletChainIdV1 | null;
  rpId: string;
  client: OwnWalletOriginClientV1;
  webauthn: OwnWalletWebAuthnPortV1 | null;
  store: OwnWalletLocalStorePortV1;
  reader: OwnWalletPublicChainReaderV1 | null;
  random: (length: number) => Uint8Array;
  now: () => Date;
}

/** Steps 1-3 on the owner's new device. */
export async function startRecoveryOnNewDeviceV1(
  link: OwnWalletCreateLinkV1,
  deps: OwnWalletRecoverDepsV1,
): Promise<({ ok: true; recover: OwnWalletRecoverRequestV1; record: OwnWalletLocalRecordV1 } & { state: OwnWalletRecoveryViewStateV1 }) | OwnWalletRecoveryFailureV1> {
  if (deps.chainId === null || deps.chainId === undefined) return { ok: false, reasonCode: 'chain_not_configured' };
  if (!deps.reader) return { ok: false, reasonCode: 'rpc_unavailable' };
  const passkey = await createWalletPasskeyV1(deps.webauthn, { rpId: deps.rpId, userName: 'Agentrix Wallet', random: deps.random });
  if (passkey.ok === false) return { ok: false, reasonCode: passkey.reasonCode };
  const key = { pubKeyX: passkey.value.pubKeyX.toLowerCase(), pubKeyY: passkey.value.pubKeyY.toLowerCase() };
  const posted = await deps.client.postRecoveryCredential(link.requestRef, link.walletToken, { credentialId: passkey.value.credentialId, ...key });
  if (posted.ok === false) return { ok: false, reasonCode: posted.code, status: posted.status };
  const recover = posted.value;
  let records: OwnWalletLocalRecordV1[];
  try {
    records = await readLocalRecordsV1(deps.store);
  } catch {
    return { ok: false, reasonCode: 'store_unavailable' };
  }
  const checked = await checkedRequest(deps.client, recover.requestRef, recover.walletToken, { configuredChainId: deps.chainId, records, role: ROLE_OWNER, freshCredential: key, serverHash: recover.userOpHash });
  if (isFailure(checked)) return checked;
  const account = checked.request.accountAddress.toLowerCase();

  let credentials: Array<{ pubKeyX: string; pubKeyY: string }>;
  try {
    credentials = (await readWebAuthnCredentialsV1(deps.reader, account)).credentials;
  } catch {
    return { ok: false, reasonCode: 'network_unavailable' };
  }
  let root: { pubKeyX: string; pubKeyY: string; saltIndex: number } | null = null;
  for (const c of credentials) {
    const saltIndex = saltIndexOfV1(link.kind, c, account);
    if (saltIndex !== null) {
      root = { pubKeyX: c.pubKeyX.toLowerCase(), pubKeyY: c.pubKeyY.toLowerCase(), saltIndex };
      break;
    }
  }
  if (!root) return { ok: false, reasonCode: 'root_key_not_found' };
  const guardians = await chainGuardians(deps.reader, account);
  if (isFailure(guardians)) return guardians;

  const record: OwnWalletLocalRecordV1 = {
    chainId: deps.chainId,
    kind: link.kind,
    accountAddress: account,
    saltIndex: root.saltIndex,
    credentialId: passkey.value.credentialId,
    pubKeyX: key.pubKeyX,
    pubKeyY: key.pubKeyY,
    rootPubKeyX: root.pubKeyX,
    rootPubKeyY: root.pubKeyY,
    createdAt: deps.now().toISOString(),
  };
  if (link.kind === 'agent') {
    record.agentId = link.agentId;
    if (link.agentName) record.agentName = link.agentName;
  }
  const written = await recordLocalAccountV1(deps.store, record);
  if (written.ok === false) return { ok: false, reasonCode: written.reasonCode, ...('message' in written ? { message: written.message } : {}) };
  return {
    ok: true,
    recover,
    record: written.record,
    state: { requestRef: recover.requestRef, walletToken: recover.walletToken, account, userOpHash: checked.userOpHash, fingerprint: checked.fingerprint, guardians: guardians.guardians, threshold: guardians.threshold },
  };
}

/** Step 4: the recovery code signs on this page; only the signature is posted. */
export async function postRecoveryCodeSignatureV1(
  client: OwnWalletOriginClientV1,
  state: OwnWalletRecoveryViewStateV1,
  phrase: unknown,
): Promise<{ ok: true; value: OwnWalletGuardianStateV1 } | OwnWalletRecoveryFailureV1> {
  const signed = await signRecoveryWithCodeV1(phrase, { userOpHash: state.userOpHash, guardians: state.guardians });
  if (signed.ok === false) return { ok: false, reasonCode: signed.reasonCode };
  const posted = await client.postEcdsaSignatures(state.requestRef, state.walletToken, [signed.signature]);
  if (posted.ok === false) return { ok: false, reasonCode: posted.code, status: posted.status };
  return { ok: true, value: posted.value };
}

/** The guardian page's load: the request checked as a guardian sees it, and the guardians read from the chain. */
export async function loadGuardianRequestV1(
  link: { requestRef: string; walletToken: string },
  deps: { chainId: OwnWalletChainIdV1 | null; client: OwnWalletOriginClientV1; reader: OwnWalletPublicChainReaderV1 | null },
): Promise<{ ok: true; state: OwnWalletRecoveryViewStateV1 } | OwnWalletRecoveryFailureV1> {
  if (deps.chainId === null || deps.chainId === undefined) return { ok: false, reasonCode: 'chain_not_configured' };
  if (!deps.reader) return { ok: false, reasonCode: 'rpc_unavailable' };
  const checked = await checkedRequest(deps.client, link.requestRef, link.walletToken, { configuredChainId: deps.chainId, records: [], role: 'guardian' });
  if (isFailure(checked)) return checked;
  const account = checked.request.accountAddress.toLowerCase();
  const guardians = await chainGuardians(deps.reader, account);
  if (isFailure(guardians)) return guardians;
  return { ok: true, state: { requestRef: link.requestRef, walletToken: link.walletToken, account, userOpHash: checked.userOpHash, fingerprint: checked.fingerprint, guardians: guardians.guardians, threshold: guardians.threshold } };
}
