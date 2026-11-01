/**
 * L8-6 own wallet, wallet origin side: the recovery code (design 5.1 step 3, 5.4 steps 3-4, W4.3, A9, A43).
 *
 * - The code is a 12-word BIP-39 phrase made on this page from 16 random bytes (`crypto.getRandomValues`, injected),
 *   the same as `ethers.Wallet.createRandom()`; its key is the default path m/44'/60'/0'/0/0. It is shown once and the
 *   owner types some of its words back.
 * - Only the derived ADDRESS leaves this file: into L (`recoveryCodeAddress`) and into the owner's intent as one of the
 *   guardians. No function here sends anything; no request body ever carries the phrase or its key
 *   (`recovery-code.test.ts`).
 * - Recovery: the page derives the address from the typed phrase; when it is not in `getGuardians(account)` as the page
 *   read it from the chain itself, it stops before any request ("这个恢复码对应的不是这个钱包"). Otherwise it signs the
 *   locally computed `userOpHash` the way SocialRecovery checks it (`toEthSignedMessageHash` of the 32 raw bytes) and
 *   returns only the 65-byte signature.
 */
import { HDNodeWallet, Mnemonic, getBytes, verifyMessage } from 'ethers';
import { recordLocalAccountV1, type OwnWalletLocalRecordV1, type OwnWalletLocalStorePortV1, type OwnWalletRecordResultV1 } from './local-store';

export const OWN_WALLET_RECOVERY_CODE_WORDS_V1 = 12;
/** How many words the owner types back after writing the phrase down. */
export const OWN_WALLET_RECOVERY_CODE_CHECKS_V1 = 3;

const HASH = /^0x[0-9a-f]{64}$/;
const SIGNATURE = /^0x[0-9a-f]{130}$/;

/** Lower case, single spaces, no leading or trailing space. */
export function normalizeRecoveryCodeV1(text: unknown): string {
  return typeof text === 'string' ? text.trim().toLowerCase().split(/\s+/).filter(Boolean).join(' ') : '';
}

function walletOf(text: unknown): HDNodeWallet | null {
  const phrase = normalizeRecoveryCodeV1(text);
  if (phrase.split(' ').length !== OWN_WALLET_RECOVERY_CODE_WORDS_V1) return null;
  try {
    if (!Mnemonic.isValidMnemonic(phrase)) return null;
    return HDNodeWallet.fromMnemonic(Mnemonic.fromPhrase(phrase));
  } catch {
    return null;
  }
}

/** A new recovery code. `random` is `crypto.getRandomValues` (tests inject fixed bytes). */
export function generateRecoveryCodeV1(random: (length: number) => Uint8Array): { phrase: string; address: string } {
  const entropy = random(16);
  if (!(entropy instanceof Uint8Array) || entropy.length !== 16) throw new Error('recovery_code_entropy_invalid');
  const wallet = HDNodeWallet.fromMnemonic(Mnemonic.fromEntropy(entropy));
  return { phrase: (wallet.mnemonic as Mnemonic).phrase, address: wallet.address.toLowerCase() };
}

/** The address a typed phrase derives, lower case; `null` for anything that is not a valid 12-word phrase. */
export function recoveryCodeAddressV1(text: unknown): string | null {
  const wallet = walletOf(text);
  return wallet ? wallet.address.toLowerCase() : null;
}

/** `count` distinct word positions (0-based, ascending) the owner types back. */
export function recoveryCodeCheckIndexesV1(random: (length: number) => Uint8Array, count = OWN_WALLET_RECOVERY_CODE_CHECKS_V1): number[] {
  const order = Array.from({ length: OWN_WALLET_RECOVERY_CODE_WORDS_V1 }, (_, i) => i);
  const bytes = random(order.length);
  for (let i = order.length - 1; i > 0; i -= 1) {
    const j = bytes[i] % (i + 1);
    [order[i], order[j]] = [order[j], order[i]];
  }
  return order.slice(0, count).sort((a, b) => a - b);
}

/** The typed-back words equal the phrase's words at those positions (case and spaces ignored). */
export function recoveryCodeBackfillOkV1(phrase: string, answers: ReadonlyArray<{ index: number; word: string }>): boolean {
  const words = normalizeRecoveryCodeV1(phrase).split(' ');
  if (words.length !== OWN_WALLET_RECOVERY_CODE_WORDS_V1 || answers.length === 0) return false;
  return answers.every((a) => Number.isInteger(a.index) && a.index >= 0 && a.index < words.length && normalizeRecoveryCodeV1(a.word) === words[a.index]);
}

/**
 * Writes only the address into this device's record of the account (W2.6 recovery code rule, R3-L1). The record is
 * otherwise unchanged and is checked again on write.
 */
export function recordRecoveryCodeAddressV1(store: OwnWalletLocalStorePortV1, record: OwnWalletLocalRecordV1, address: string): Promise<OwnWalletRecordResultV1> {
  return recordLocalAccountV1(store, { ...record, recoveryCodeAddress: String(address).toLowerCase() });
}

export type OwnWalletRecoveryCodeSignatureV1 =
  | { ok: true; address: string; signature: string }
  | { ok: false; reasonCode: 'recovery_code_invalid' | 'recovery_code_not_this_wallet' | 'hash_invalid' | 'signature_failed' };

/**
 * 5.4 steps 3-4: the typed phrase signs `userOpHash` for the account whose guardians the page read from the chain.
 * Refuses before signing when the phrase is invalid or its address is not a guardian. Returns the signature only.
 */
export async function signRecoveryWithCodeV1(text: unknown, input: { userOpHash: string; guardians: readonly string[] }): Promise<OwnWalletRecoveryCodeSignatureV1> {
  if (typeof input.userOpHash !== 'string' || !HASH.test(input.userOpHash)) return { ok: false, reasonCode: 'hash_invalid' };
  const wallet = walletOf(text);
  if (!wallet) return { ok: false, reasonCode: 'recovery_code_invalid' };
  const address = wallet.address.toLowerCase();
  if (!input.guardians.map((g) => String(g).toLowerCase()).includes(address)) return { ok: false, reasonCode: 'recovery_code_not_this_wallet' };
  let signature: string;
  try {
    signature = (await wallet.signMessage(getBytes(input.userOpHash))).toLowerCase();
    if (!SIGNATURE.test(signature) || verifyMessage(getBytes(input.userOpHash), signature).toLowerCase() !== address) return { ok: false, reasonCode: 'signature_failed' };
  } catch {
    return { ok: false, reasonCode: 'signature_failed' };
  }
  return { ok: true, address, signature };
}
