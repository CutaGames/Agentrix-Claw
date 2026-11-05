/**
 * L8-6 own wallet: creating an own account on the wallet origin (design 5.1 steps 1-2, W1.1, W3.3).
 *
 * 1. `navigator.credentials.create` makes a wallet passkey (rpId = the build constant; ES256; UV required).
 * 2. The public key goes to `POST /wallet-requests/:ref/credential` with the one-time token from the fragment.
 * 3. The server's answer (address, initData, salt, index, kind) is recomputed from this page's own key; any difference
 *    refuses, writes nothing and shows no address.
 * 4. L is written (refused for a duplicate: appendix C item 31) and only then is the address shown.
 */
import type { OwnWalletChainIdV1 } from '../../../shared/types/agent-own-wallet';
import type { OwnWalletOriginClientV1 } from './client';
import { checkServerAccountV1 } from './kernel-address';
import type { OwnWalletCreateLinkV1 } from './links';
import { recordLocalAccountV1, type OwnWalletLocalRecordV1, type OwnWalletLocalStorePortV1 } from './local-store';
import { createWalletPasskeyV1, keyFingerprintV1, type OwnWalletWebAuthnPortV1 } from './webauthn';

export interface OwnWalletCreateDepsV1 {
  chainId: OwnWalletChainIdV1 | null;
  rpId: string;
  client: OwnWalletOriginClientV1;
  webauthn: OwnWalletWebAuthnPortV1 | null;
  store: OwnWalletLocalStorePortV1;
  random: (length: number) => Uint8Array;
  now: () => Date;
}

export type OwnWalletCreateResultV1 =
  | { ok: true; record: OwnWalletLocalRecordV1; fingerprint: string; backedUp: boolean | null }
  | { ok: false; reasonCode: string; status?: number; message?: string };

export async function createOwnAccountV1(link: OwnWalletCreateLinkV1, deps: OwnWalletCreateDepsV1): Promise<OwnWalletCreateResultV1> {
  if (deps.chainId === null || deps.chainId === undefined) return { ok: false, reasonCode: 'chain_not_configured' };
  const passkey = await createWalletPasskeyV1(deps.webauthn, { rpId: deps.rpId, userName: 'Agentrix Wallet', random: deps.random });
  if (passkey.ok === false) return { ok: false, reasonCode: passkey.reasonCode };
  const key = { pubKeyX: passkey.value.pubKeyX, pubKeyY: passkey.value.pubKeyY };
  const answer = await deps.client.postCredential(link.requestRef, link.walletToken, { credentialId: passkey.value.credentialId, ...key });
  if (answer.ok === false) return { ok: false, reasonCode: answer.code, status: answer.status };
  if (answer.value.kind !== link.kind) return { ok: false, reasonCode: 'kind_mismatch' };
  const checked = checkServerAccountV1(answer.value, key);
  if (checked.ok === false) return { ok: false, reasonCode: checked.reasonCode };
  const record: OwnWalletLocalRecordV1 = {
    chainId: deps.chainId,
    kind: link.kind,
    accountAddress: checked.account.accountAddress,
    saltIndex: checked.account.saltIndex,
    credentialId: passkey.value.credentialId,
    pubKeyX: key.pubKeyX.toLowerCase(),
    pubKeyY: key.pubKeyY.toLowerCase(),
    createdAt: deps.now().toISOString(),
  };
  if (link.kind === 'agent') {
    record.agentId = link.agentId;
    if (link.agentName) record.agentName = link.agentName;
  }
  const written = await recordLocalAccountV1(deps.store, record);
  if (written.ok === false) return { ok: false, reasonCode: written.reasonCode, ...('message' in written ? { message: written.message } : {}) };
  return { ok: true, record: written.record, fingerprint: keyFingerprintV1(key), backedUp: passkey.value.backedUp };
}
