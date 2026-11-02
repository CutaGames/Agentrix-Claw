/**
 * L8-6 own wallet, wallet origin side: the rules of the setup wizard (design 5.1 steps 3-5, W4.3, S11c).
 *
 * The wizard only decides the RECOVERY MEANS of an account this device holds the key of, and writes the one thing it
 * keeps (the recovery code's ADDRESS) into this device's record L. The recovery code's words never reach this file: the
 * view generates and shows them (`recovery-code.ts`) and passes the derived address only. Nothing here sends a request.
 *
 * - The account must be in L for the same chain, the same Agent and kind `agent` (the link is only a pointer).
 * - Guardians follow W4.3: only a recovery code → [code] with 1 vote; any human guardian → at least 2 votes, the code
 *   counting as one; without a code at least 2 humans; never more votes than guardians, 1-16 guardians, no zero address,
 *   no duplicate, not the account itself, not the code address as a human.
 * - On "continue" L is made to match the final choice: with a recovery code its address is written, without one a stale
 *   address from an earlier try is removed (the approve page refuses a record that has a code the intent does not name).
 * - The way back to the main site is built from the pinned main origin only.
 */
import { OWN_WALLET_GUARDIANS_MAX_V1, type OwnWalletChainIdV1 } from '../../../shared/types/agent-own-wallet';
import { walletSetupReturnUrlV1, setupAgentNameV1, type OwnWalletSetupLinkV1 } from './links';
import {
  findLocalAccountV1,
  readLocalRecordsV1,
  recordLocalAccountV1,
  type OwnWalletLocalRecordV1,
  type OwnWalletLocalStorePortV1,
} from './local-store';
import { recoveryThresholdProblemV1 } from './purpose-checks';

const ADDRESS_ANY = /^0x[0-9a-fA-F]{40}$/;
const ZERO_ADDRESS = `0x${'0'.repeat(40)}`;
const MAIN_ORIGIN = /^https:\/\/[a-z0-9.-]+(?::[0-9]{1,5})?$/;

export type OwnWalletSetupGuardianTextV1 =
  | { ok: true; list: string[] }
  | { ok: false; reasonCode: 'guardian_address_invalid' | 'guardian_zero_address' | 'guardian_duplicate' | 'guardian_list_too_long' };

/** The typed guardian addresses: one per line (commas and spaces also separate), lower-cased, nothing silently dropped but blanks. */
export function parseGuardianLinesV1(text: unknown): OwnWalletSetupGuardianTextV1 {
  const parts = typeof text === 'string' ? text.split(/[\s,;]+/).filter((p) => p.length > 0) : [];
  const list: string[] = [];
  for (const part of parts) {
    if (!ADDRESS_ANY.test(part)) return { ok: false, reasonCode: 'guardian_address_invalid' };
    const address = part.toLowerCase();
    if (address === ZERO_ADDRESS) return { ok: false, reasonCode: 'guardian_zero_address' };
    if (list.includes(address)) return { ok: false, reasonCode: 'guardian_duplicate' };
    list.push(address);
  }
  if (list.length > OWN_WALLET_GUARDIANS_MAX_V1) return { ok: false, reasonCode: 'guardian_list_too_long' };
  return { ok: true, list };
}

export type OwnWalletSetupPlanV1 = { ok: true; guardians: string[]; threshold: number; recoveryCode: boolean } | { ok: false; reasonCode: string };

/**
 * The guardian list and the vote count the wizard hands to the main site. `threshold` null means the default: 1 for a
 * recovery code alone, otherwise 2. The result is what W4.3 allows or a reason; it never "fixes" an input.
 */
export function planSetupGuardiansV1(input: { account: string; recoveryCodeAddress: string | null; humans: readonly string[]; threshold: number | null }): OwnWalletSetupPlanV1 {
  const account = String(input.account).toLowerCase();
  const code = input.recoveryCodeAddress === null ? null : String(input.recoveryCodeAddress).toLowerCase();
  if (code !== null && (!ADDRESS_ANY.test(code) || code === ZERO_ADDRESS)) return { ok: false, reasonCode: 'guardian_address_invalid' };
  const humans: string[] = [];
  for (const raw of input.humans) {
    if (typeof raw !== 'string' || !ADDRESS_ANY.test(raw)) return { ok: false, reasonCode: 'guardian_address_invalid' };
    const address = raw.toLowerCase();
    if (address === ZERO_ADDRESS) return { ok: false, reasonCode: 'guardian_zero_address' };
    if (address === account) return { ok: false, reasonCode: 'guardian_is_account' };
    if (code !== null && address === code) return { ok: false, reasonCode: 'guardian_is_recovery_code' };
    if (humans.includes(address)) return { ok: false, reasonCode: 'guardian_duplicate' };
    humans.push(address);
  }
  if (code === null && humans.length === 0) return { ok: false, reasonCode: 'recovery_means_required' };
  if (code === null && humans.length < 2) return { ok: false, reasonCode: 'guardian_list_too_small' };
  const guardians = (code === null ? humans : [...humans, code]).slice().sort();
  if (guardians.length > OWN_WALLET_GUARDIANS_MAX_V1) return { ok: false, reasonCode: 'guardian_list_too_long' };
  const threshold = input.threshold === null ? (humans.length === 0 ? 1 : 2) : input.threshold;
  const problem = recoveryThresholdProblemV1(guardians, threshold, code ?? undefined);
  if (problem) return { ok: false, reasonCode: problem };
  return { ok: true, guardians, threshold, recoveryCode: code !== null };
}

export type OwnWalletSetupLoadV1 = { ok: true; record: OwnWalletLocalRecordV1 } | { ok: false; reasonCode: 'chain_not_configured' | 'chain_mismatch' | 'store_unavailable' | 'account_not_on_this_device' | 'agent_mismatch' };

/** The account of the link as this device recorded it; anything else (another chain, Agent or kind) is refused before the page asks for anything. */
export async function loadSetupRecordV1(link: OwnWalletSetupLinkV1, deps: { chainId: OwnWalletChainIdV1 | null; store: OwnWalletLocalStorePortV1 }): Promise<OwnWalletSetupLoadV1> {
  if (deps.chainId === null || deps.chainId === undefined) return { ok: false, reasonCode: 'chain_not_configured' };
  if (link.chainId !== deps.chainId) return { ok: false, reasonCode: 'chain_mismatch' };
  let records: OwnWalletLocalRecordV1[];
  try {
    records = await readLocalRecordsV1(deps.store);
  } catch {
    return { ok: false, reasonCode: 'store_unavailable' };
  }
  const record = findLocalAccountV1(records, link.chainId, link.account);
  if (!record || record.kind !== 'agent') return { ok: false, reasonCode: 'account_not_on_this_device' };
  if (record.agentId !== link.agentId) return { ok: false, reasonCode: 'agent_mismatch' };
  return { ok: true, record };
}

/** `main_origin_not_configured` unless the build pinned a plain https main origin (the only place the wizard returns to). */
export function setupMainOriginProblemV1(mainOrigin: string): 'main_origin_not_configured' | null {
  return typeof mainOrigin === 'string' && MAIN_ORIGIN.test(mainOrigin) ? null : 'main_origin_not_configured';
}

export type OwnWalletSetupCommitV1 = { ok: true; url: string } | { ok: false; reasonCode: string };

/**
 * "Continue": makes L match the final choice, then builds the way back. `recoveryCodeAddress` is the address of the code
 * the owner just wrote down and typed words of (or `null` when the owner chose no code). Nothing is written when the plan
 * and the code disagree, or when the way back cannot be built.
 */
export async function commitSetupV1(
  input: { link: OwnWalletSetupLinkV1; record: OwnWalletLocalRecordV1; plan: Extract<OwnWalletSetupPlanV1, { ok: true }>; recoveryCodeAddress: string | null; register: boolean },
  deps: { store: OwnWalletLocalStorePortV1; mainOrigin: string },
): Promise<OwnWalletSetupCommitV1> {
  const { link, record, plan } = input;
  if (setupMainOriginProblemV1(deps.mainOrigin)) return { ok: false, reasonCode: 'main_origin_not_configured' };
  const code = input.recoveryCodeAddress === null ? null : input.recoveryCodeAddress.toLowerCase();
  if (plan.recoveryCode !== (code !== null)) return { ok: false, reasonCode: 'return_link_invalid' };
  if (code !== null && !plan.guardians.includes(code)) return { ok: false, reasonCode: 'return_link_invalid' };
  if (input.register && !link.register) return { ok: false, reasonCode: 'return_link_invalid' };
  if (record.agentId !== link.agentId || record.accountAddress !== link.account) return { ok: false, reasonCode: 'agent_mismatch' };
  const url = walletSetupReturnUrlV1(deps.mainOrigin, {
    state: link.state,
    agentId: link.agentId,
    ...(setupAgentNameV1(link.agentName ?? record.agentName) !== undefined ? { agentName: setupAgentNameV1(link.agentName ?? record.agentName) as string } : {}),
    mode: link.mode,
    register: input.register,
    recoveryCode: plan.recoveryCode,
    threshold: plan.threshold,
    guardians: plan.guardians,
  });
  if (url === null) return { ok: false, reasonCode: 'return_link_invalid' };
  const next: OwnWalletLocalRecordV1 = { ...record };
  if (code !== null) next.recoveryCodeAddress = code;
  else delete next.recoveryCodeAddress;
  if (next.recoveryCodeAddress !== record.recoveryCodeAddress) {
    const written = await recordLocalAccountV1(deps.store, next);
    if (written.ok === false) return { ok: false, reasonCode: written.reasonCode === 'store_unavailable' ? 'store_unavailable' : 'return_link_invalid' };
  }
  return { ok: true, url };
}
