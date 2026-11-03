/**
 * L8-6 own wallet, wallet origin side: a guardian signs a recovery (design 5.4 step 5, R4-L10, A43).
 *
 * - Only an injected EIP-1193 wallet (`window.ethereum`: a browser extension, or a wallet app's own browser). No
 *   WalletConnect: its relay is another origin and is not in the wallet origin's `connect-src`.
 * - `eth_requestAccounts` gives the address; `personal_sign` gets `[userOpHash as 0x hex of its 32 raw bytes, address]`.
 *   The wallet prefixes "\x19Ethereum Signed Message:\n32" to those 32 bytes, which is what SocialRecovery checks
 *   (`ECDSA.toEthSignedMessageHash(userOpHash)`); it is not a signature over the 66-character hex text.
 * - Before anything is posted: `verifyMessage(getBytes(userOpHash), sig)` must give the address the wallet named, and
 *   that address must be in `getGuardians(account)` as this page read it from the chain. Otherwise appendix C item 36
 *   and nothing is submitted. No wallet at all: item 35.
 */
import { getBytes, verifyMessage } from 'ethers';
import { OWN_WALLET_PAGE_COPY_ZH_V1 as COPY } from './copy';

/** The part of EIP-1193 this page uses. */
export interface OwnWalletEip1193ProviderV1 {
  request(args: { method: string; params?: unknown[] }): Promise<unknown>;
}

export type OwnWalletGuardianSignProblemV1 = 'no_injected_wallet' | 'wallet_cancelled' | 'account_unavailable' | 'signature_malformed' | 'signer_not_guardian' | 'hash_invalid';

export type OwnWalletGuardianSignResultV1 = { ok: true; signer: string; signature: string } | { ok: false; reasonCode: OwnWalletGuardianSignProblemV1; message?: string };

const HASH = /^0x[0-9a-f]{64}$/;
const ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const SIGNATURE = /^0x[0-9a-fA-F]{130}$/;

/** `window.ethereum` when it looks like an EIP-1193 provider, else `null`. */
export function injectedEthereumV1(win: unknown): OwnWalletEip1193ProviderV1 | null {
  if (typeof win !== 'object' || win === null) return null;
  const eth = (win as { ethereum?: unknown }).ethereum;
  if (typeof eth !== 'object' || eth === null || typeof (eth as { request?: unknown }).request !== 'function') return null;
  return eth as OwnWalletEip1193ProviderV1;
}

/** A 65-byte signature with v 27 / 28 (a wallet that answers v 0 / 1 is moved to 27 / 28; the signature is the same). */
function normalizedSignature(value: unknown): string | null {
  if (typeof value !== 'string' || !SIGNATURE.test(value)) return null;
  const sig = value.toLowerCase();
  const v = parseInt(sig.slice(130, 132), 16);
  if (v === 27 || v === 28) return sig;
  if (v === 0 || v === 1) return sig.slice(0, 130) + (v + 27).toString(16);
  return null;
}

/**
 * Asks the injected wallet to sign `userOpHash` (computed by this page from the decoded UserOp) and checks the result
 * against the guardians the page read from the chain. Nothing is posted here; the caller posts only on `ok: true`.
 */
export async function guardianSignRecoveryV1(provider: OwnWalletEip1193ProviderV1 | null, input: { userOpHash: string; guardians: readonly string[] }): Promise<OwnWalletGuardianSignResultV1> {
  if (!provider) return { ok: false, reasonCode: 'no_injected_wallet', message: COPY.guardianNoWallet };
  if (typeof input.userOpHash !== 'string' || !HASH.test(input.userOpHash)) return { ok: false, reasonCode: 'hash_invalid' };
  let accounts: unknown;
  try {
    accounts = await provider.request({ method: 'eth_requestAccounts' });
  } catch {
    return { ok: false, reasonCode: 'wallet_cancelled' };
  }
  const first = Array.isArray(accounts) ? accounts[0] : undefined;
  if (typeof first !== 'string' || !ADDRESS.test(first)) return { ok: false, reasonCode: 'account_unavailable' };
  const account = first.toLowerCase();
  let raw: unknown;
  try {
    raw = await provider.request({ method: 'personal_sign', params: [input.userOpHash, account] });
  } catch {
    return { ok: false, reasonCode: 'wallet_cancelled' };
  }
  const signature = normalizedSignature(raw);
  if (!signature) return { ok: false, reasonCode: 'signature_malformed' };
  let signer: string;
  try {
    signer = verifyMessage(getBytes(input.userOpHash), signature).toLowerCase();
  } catch {
    return { ok: false, reasonCode: 'signature_malformed' };
  }
  const guardians = input.guardians.map((g) => String(g).toLowerCase());
  if (signer !== account || !guardians.includes(signer)) return { ok: false, reasonCode: 'signer_not_guardian', message: COPY.guardianWrongSigner };
  return { ok: true, signer, signature };
}

/** "已有 k / N 位签名，还差 N−k 位" (5.4 step 5). */
export function guardianProgressTextV1(collected: number, required: number): string {
  const k = Math.max(0, Math.floor(collected));
  const n = Math.max(1, Math.floor(required));
  return `已有 ${Math.min(k, n)} / ${n} 位签名，还差 ${Math.max(0, n - k)} 位`;
}
