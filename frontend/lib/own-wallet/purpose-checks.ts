/**
 * L8-6 own wallet, wallet origin side: what the page checks before the owner signs (design W2.5, W2.6). One function
 * per purpose; each answers `{ ok: true, display }` or `{ ok: false, reasonCode, field }`. Read results as
 * `x.ok === false`. A page calls `navigator.credentials.get` only after `ok: true`.
 *
 * - Every purpose first passes W2.5 (a)-(e): the configured chain, the pinned EntryPoint v0.7, the local `userOpHash`
 *   (a server hash that differs is refused), the paymaster rule and gas caps of this chain, the fixed outer call and
 *   execution mode, the nonce's validator segment (root; SocialRecovery for `recover`), `factory` only on
 *   `deploy_setup`.
 * - "Hard" items compare with L (this device's record), the chain (facts the page read itself through the pinned public
 *   node, `public-chain-reader.ts`) and pinned constants. "Consistency" items compare with the intent I from the URL
 *   fragment; a difference refuses with appendix C item 17's red line and still carries what was decoded.
 * - `display` is always what this page decoded from the UserOp, never text from a server. A forged link whose intent
 *   matches a hostile UserOp therefore still shows the real recipient, guardians and file, and the hard items still
 *   refuse.
 * - `grant_session` is refused until S7 fixes its encoding (coord 10-29 16:0x: UNSAFE_ENABLE; the owner signs the
 *   EnableSession data, not a root UserOp of this form).
 */
import { OWN_WALLET_GUARDIANS_MAX_V1, OWN_WALLET_MODULES_V1, OWN_WALLET_PINNED_TOKENS_V1, ownWalletModuleV1, type OwnWalletChainIdV1 } from '../../../shared/types/agent-own-wallet';
import { ERC8004_METADATA_KEYS_V1, ERC8004_REVOKED_HOLDER_V1, erc8004AgentRegistryIdV1 } from '../../../shared/types/agent-erc8004';
import { OWN_WALLET_COPY_ZH_V1, addressBelongsToOtherAgentTextV1 } from './copy';
import { checkExecModeV1 } from './exec-mode';
import { checkUserOpGasV1 } from './gas-caps';
import type { OwnWalletIntentV1, OwnWalletRecoveryIntentV1 } from './intent';
import { checkAccountFactoryV1 } from './kernel-address';
import { findLocalAccountV1, findLocalVaultV1, localDuplicateOfV1, type OwnWalletLocalRecordV1 } from './local-store';
import { dataUriTextV1, expectedAgentUriV1, registrationFileDigestV1 } from './registration-file';
import {
  decodeAddCredentialV1,
  decodeErc20TransferV1,
  decodeGuardianOpV1,
  decodeRegisterCallV1,
  decodeRegistryCallV1,
  decodeRemoveCredentialV1,
  decodeRemoveSessionV1,
  decodeSocialRecoveryInstallV1,
  isRecoveryNonceV1,
  isRootNonceV1,
  metadataTextV1,
  type OwnWalletExecutionV1,
} from './userop-decode';
import { OWN_WALLET_ENTRY_POINT_V1, walletRequestUserOpHashV1, type OwnWalletPurposeV1, type OwnWalletWalletRequestV1 } from './userop-hash';
import { keyFingerprintV1 } from './webauthn';

const SOCIAL_RECOVERY = ownWalletModuleV1('socialRecovery').address.toLowerCase();
const WEBAUTHN_VALIDATOR = ownWalletModuleV1('webAuthnValidator').address.toLowerCase();
const SMART_SESSIONS = ownWalletModuleV1('smartSessions').address.toLowerCase();
const REGISTRY = ownWalletModuleV1('erc8004IdentityRegistryProxy').address.toLowerCase();
const PINNED_MODULE_ADDRESSES = OWN_WALLET_MODULES_V1.map((m) => m.address.toLowerCase());
const REVOKED_HOLDER = ERC8004_REVOKED_HOLDER_V1.toLowerCase();
const ZERO_ADDRESS = '0x' + '00'.repeat(20);
/** SocialRecovery's linked-list sentinel: the `prevGuardian` of the first entry. */
const SENTINEL = '0x0000000000000000000000000000000000000001';
const CHAIN_NAMES: Readonly<Record<OwnWalletChainIdV1, string>> = { 97: 'BSC testnet', 84532: 'Base Sepolia' };
export const OWN_WALLET_CHAIN_NAMES_V1 = CHAIN_NAMES;
const NATIVE_SYMBOLS: Readonly<Record<OwnWalletChainIdV1, string>> = { 97: 'tBNB', 84532: 'ETH' };
const BYTES32 = /^0x[0-9a-f]{64}$/;
const BYTES20 = /^0x[0-9a-f]{40}$/;

/** Facts the page read from the chain itself (`public-chain-reader.ts`). A missing fact refuses (`chain_fact_missing`). */
export interface OwnWalletChainFactsV1 {
  /** `install_recovery`: `eth_getCode(sender)` is not empty. */
  deployed?: boolean;
  /** `install_recovery` / `set_guardians`: `isModuleInstalled(1, SocialRecovery, 0x)`. */
  socialRecoveryInstalled?: boolean;
  /** `set_guardians`: `getGuardians(sender)` in list order, and `threshold(sender)`. */
  guardians?: string[];
  guardianThreshold?: number;
  /** `remove_credential`: the WebAuthnValidator credentials and threshold of the account. */
  credentials?: Array<{ pubKeyX: string; pubKeyY: string }>;
  credentialThreshold?: number;
  /** `revoke_registration`: `ownerOf(agentId)`. */
  registrationOwner?: string;
  /** `revoke_registration` / `revoke_session`: `getPermissionIDs(sender)`. */
  permissionIds?: string[];
}

export interface OwnWalletPurposeContextV1 {
  request: OwnWalletWalletRequestV1;
  /** The build-time chain (`NEXT_PUBLIC_AGENT_OWN_WALLET_CHAIN_ID`). */
  configuredChainId: number | null;
  /** From the URL fragment only (`readWalletLinkV1`). */
  intent: OwnWalletIntentV1 | null;
  /** All valid L records of this device. */
  records: readonly OwnWalletLocalRecordV1[];
  chain?: OwnWalletChainFactsV1;
  /** The registration file text the page fetched itself from `agentURI` (or decoded from a `data:` URI). */
  registrationFileText?: string;
  /** Build-time constants. `allowDataUri` only in the rehearsal harness (A25). */
  pins: { fileBaseUrl: string; mainOrigin: string; allowDataUri?: boolean };
  /** `add_credential` / `recover` on the owner's device: the key this page has just created. */
  freshCredential?: { pubKeyX: string; pubKeyY: string };
  /** `add_credential` across devices: the first fingerprint group the owner typed from the other device. */
  fingerprintFirstGroup?: string;
  /** `recover`: whether this is the owner's new device or a guardian's page. */
  role?: 'owner' | 'guardian';
  /** `remove_credential`: the owner ticked "delete this device's key" and confirmed again. */
  confirmRemoveThisDevice?: boolean;
  /** `set_guardians`: the owner confirmed removing this device's recovery code address. */
  confirmRemoveRecoveryCode?: boolean;
}

export interface OwnWalletRegisterDisplayV1 {
  name: string;
  description: string;
  cardUrl: string;
  registry: string;
  chainName: string;
}

export type OwnWalletDisplayV1 =
  | { purpose: 'deploy_setup'; accountAddress: string; agentName?: string; credentialLabel?: string; guardians: string[]; threshold: number; usesRecoveryCode: boolean; register?: OwnWalletRegisterDisplayV1 }
  | { purpose: 'install_recovery'; accountAddress: string; guardians: string[]; threshold: number; usesRecoveryCode: boolean }
  | ({ purpose: 'register'; accountAddress: string } & OwnWalletRegisterDisplayV1)
  | { purpose: 'revoke_registration'; accountAddress: string; agentId: string; name: string; sessionsRemoved: number; irreversible: true }
  | { purpose: 'revoke_session'; accountAddress: string; permissionId: string }
  | { purpose: 'add_credential'; accountAddress: string; fingerprint: string }
  | { purpose: 'remove_credential'; accountAddress: string; fingerprint: string; thisDevice: boolean; label?: string }
  | { purpose: 'set_guardians'; accountAddress: string; guardians: string[]; threshold: number }
  | { purpose: 'transfer'; accountAddress: string; to: string; amount: string; asset: 'native' | 'token'; symbol: string; decimals: number; toIsOwnVault: boolean }
  | { purpose: 'recover'; accountAddress: string; fingerprint: string; role: 'owner' | 'guardian' };

export type OwnWalletPurposeRefusalV1 = { ok: false; reasonCode: string; field: string; message?: string; display?: OwnWalletDisplayV1 };
export type OwnWalletPurposeCheckV1 = { ok: true; purpose: OwnWalletPurposeV1; userOpHash: string; display: OwnWalletDisplayV1 } | OwnWalletPurposeRefusalV1;

const refuse = (reasonCode: string, field: string, message?: string): OwnWalletPurposeRefusalV1 => (message ? { ok: false, reasonCode, field, message } : { ok: false, reasonCode, field });
const differs = (field: string, display: OwnWalletDisplayV1): OwnWalletPurposeRefusalV1 => ({ ok: false, reasonCode: 'intent_mismatch', field, message: OWN_WALLET_COPY_ZH_V1.differsFromMainSite, display });
const sameKey = (a: { pubKeyX: string; pubKeyY: string }, b: { pubKeyX: string; pubKeyY: string }) => BigInt(a.pubKeyX) === BigInt(b.pubKeyX) && BigInt(a.pubKeyY) === BigInt(b.pubKeyY);
const sameSet = (a: readonly string[], b: readonly string[]) => {
  const x = new Set(a.map((v) => v.toLowerCase()));
  const y = new Set(b.map((v) => v.toLowerCase()));
  return x.size === y.size && Array.from(x).every((v) => y.has(v));
};

/** Purposes whose W2.6 row has a consistency column: the link must carry an intent for them. */
const NEEDS_INTENT: readonly OwnWalletPurposeV1[] = ['deploy_setup', 'install_recovery', 'register', 'revoke_registration', 'set_guardians', 'transfer'];

/** W2.6 guardian list as encoded: 1-16 non-zero addresses in strictly ascending 20-byte order (R3-M2). */
export function guardianOrderProblemV1(list: readonly string[]): string | null {
  if (list.length === 0) return 'guardian_list_empty';
  if (list.length > OWN_WALLET_GUARDIANS_MAX_V1) return 'guardian_list_too_long';
  for (let i = 0; i < list.length; i += 1) {
    if (!BYTES20.test(list[i])) return 'guardian_address_invalid';
    if (list[i] === ZERO_ADDRESS) return 'guardian_zero_address';
    if (i > 0 && !(list[i - 1] < list[i])) return list[i - 1] === list[i] ? 'guardian_duplicate' : 'guardians_not_sorted';
  }
  return null;
}

/**
 * W4.3: only a recovery code → guardians = [code], threshold 1; any human guardian → threshold ≥ 2 (the code counts as
 * one vote); threshold never above the number of guardians.
 */
export function recoveryThresholdProblemV1(guardians: readonly string[], threshold: number, recoveryCodeAddress?: string): string | null {
  if (!Number.isInteger(threshold) || threshold < 1 || threshold > guardians.length) return 'guardian_threshold_invalid';
  const code = recoveryCodeAddress ? recoveryCodeAddress.toLowerCase() : undefined;
  const humans = guardians.filter((g) => g !== code);
  if (humans.length === 0) return guardians.length === 1 && threshold === 1 ? null : 'guardian_threshold_invalid';
  return threshold >= 2 ? null : 'guardian_threshold_invalid';
}

interface CommonOk {
  ok: true;
  chainId: OwnWalletChainIdV1;
  sender: string;
  userOpHash: string;
  callType: 'single' | 'batch';
  executions: OwnWalletExecutionV1[];
  record: OwnWalletLocalRecordV1 | undefined;
}

/** W2.5 (a)-(e) plus the nonce segment and the link's intent purpose; shared by every purpose. */
function commonChecks(ctx: OwnWalletPurposeContextV1, purpose: OwnWalletPurposeV1): CommonOk | OwnWalletPurposeRefusalV1 {
  const request = ctx.request;
  if (!request || !request.userOp) return refuse('request_malformed', '$');
  if (request.purpose !== purpose) return refuse('purpose_mismatch', 'purpose');
  if (purpose === 'grant_session') return refuse('purpose_not_supported', 'purpose');
  if (ctx.configuredChainId === null || ctx.configuredChainId === undefined) return refuse('chain_not_configured', 'chainId');
  if (request.chainId !== ctx.configuredChainId) return refuse('chain_mismatch', 'chainId');
  if (request.entryPoint !== OWN_WALLET_ENTRY_POINT_V1) return refuse('entry_point_not_pinned', 'entryPoint');
  const op = request.userOp;
  const sender = op.sender.toLowerCase();
  if (sender !== request.accountAddress.toLowerCase()) return refuse('sender_mismatch', 'userOp.sender');
  if (ctx.intent && ctx.intent.purpose !== purpose) return refuse('intent_mismatch', 'intent.purpose', OWN_WALLET_COPY_ZH_V1.differsFromMainSite);
  if (!ctx.intent && NEEDS_INTENT.includes(purpose)) return refuse('intent_missing', 'intent');
  const gas = checkUserOpGasV1(request.chainId, op);
  if (gas.ok === false) return refuse(gas.reasonCode, gas.field);
  if (purpose === 'recover' ? !isRecoveryNonceV1(op.nonce) : !isRootNonceV1(op.nonce)) return refuse(purpose === 'recover' ? 'nonce_not_recovery' : 'nonce_not_root', 'userOp.nonce');
  if (purpose === 'deploy_setup' && op.factory === null) return refuse('factory_missing', 'userOp.factory');
  if (purpose !== 'deploy_setup' && op.factory !== null) return refuse('factory_not_allowed', 'userOp.factory');
  const exec = checkExecModeV1(op.callData, { sender, purpose, session: false });
  if (exec.ok === false) return refuse(exec.reasonCode, exec.field);
  const userOpHash = walletRequestUserOpHashV1(request);
  if (request.serverUserOpHash !== null && request.serverUserOpHash !== userOpHash) return refuse('userop_hash_mismatch', 'userOpHash');
  const record = findLocalAccountV1(ctx.records ?? [], request.chainId, sender);
  if (record && ctx.intent && ctx.intent.agentId !== undefined && ctx.intent.agentId !== record.agentId) {
    return refuse('account_belongs_to_other_agent', 'intent.agentId', addressBelongsToOtherAgentTextV1(record.agentName));
  }
  return { ok: true, chainId: request.chainId, sender, userOpHash, callType: exec.call.callType, executions: exec.call.executions, record };
}

function needRecord(common: CommonOk): OwnWalletPurposeRefusalV1 | null {
  return common.record ? null : refuse('local_record_missing', 'local');
}

function single(common: CommonOk, target: string): OwnWalletExecutionV1 | OwnWalletPurposeRefusalV1 {
  if (common.callType !== 'single' || common.executions.length !== 1) return refuse('call_type_mismatch', 'userOp.callData');
  const e = common.executions[0];
  if (e.target !== target) return refuse('target_not_pinned', 'userOp.callData.target');
  if (e.value !== BigInt(0)) return refuse('value_not_allowed', 'userOp.callData.value');
  return e;
}

const isRefusal = (v: unknown): v is OwnWalletPurposeRefusalV1 => typeof v === 'object' && v !== null && (v as { ok?: unknown }).ok === false;

/** The SocialRecovery install of `deploy_setup` / `install_recovery`: order, recovery code rule (R3-L1), W4.3. */
function checkRecoveryInstall(e: OwnWalletExecutionV1, sender: string, record: OwnWalletLocalRecordV1, intent: OwnWalletRecoveryIntentV1): { guardians: string[]; threshold: number; usesRecoveryCode: boolean } | OwnWalletPurposeRefusalV1 {
  if (e.target !== sender || e.value !== BigInt(0)) return refuse('recovery_install_invalid', 'userOp.callData.executions[0]');
  const install = decodeSocialRecoveryInstallV1(e.data);
  if (!install) return refuse('recovery_install_invalid', 'userOp.callData.executions[0]');
  const order = guardianOrderProblemV1(install.guardians);
  if (order) return refuse(order, 'guardians');
  const code = record.recoveryCodeAddress ? record.recoveryCodeAddress.toLowerCase() : undefined;
  // The intent says whether a recovery code was chosen; L decides what that means (a hostile server cannot drop it).
  if (intent.recoveryCode === true && (!code || !install.guardians.includes(code))) return refuse('recovery_code_missing', 'guardians');
  if (intent.recoveryCode === false && code) return refuse('recovery_code_record_present', 'guardians');
  const threshold = recoveryThresholdProblemV1(install.guardians, install.threshold, code);
  if (threshold) return refuse(threshold, 'threshold');
  return { guardians: install.guardians, threshold: install.threshold, usesRecoveryCode: !!code && install.guardians.includes(code) };
}

/** W2.6 `register` row, for a standalone `register` and for the second item of `deploy_setup`. */
function checkRegisterExecution(ctx: OwnWalletPurposeContextV1, common: CommonOk, e: OwnWalletExecutionV1): OwnWalletRegisterDisplayV1 | OwnWalletPurposeRefusalV1 {
  if (e.target !== REGISTRY) return refuse('registry_not_pinned', 'register.target');
  if (e.value !== BigInt(0)) return refuse('value_not_allowed', 'register.value');
  const call = decodeRegisterCallV1(e.data);
  if (!call) return refuse('register_call_invalid', 'register');
  const expected = expectedAgentUriV1(ctx.pins.fileBaseUrl, common.chainId, common.sender);
  let text: string | undefined;
  if (expected !== null && call.agentURI === expected) text = ctx.registrationFileText;
  else if (ctx.pins.allowDataUri === true && dataUriTextV1(call.agentURI) !== null) text = dataUriTextV1(call.agentURI);
  else return refuse('agent_uri_not_allowed', 'register.agentURI');
  if (typeof text !== 'string') return refuse('registration_file_unavailable', 'register.agentURI');
  const keys = call.metadata.map((m) => m.key);
  if (call.metadata.length !== 2 || !keys.includes(ERC8004_METADATA_KEYS_V1.fileDigest) || !keys.includes(ERC8004_METADATA_KEYS_V1.ownerVault)) return refuse('metadata_invalid', 'register.metadata');
  const digest = call.metadata.find((m) => m.key === ERC8004_METADATA_KEYS_V1.fileDigest).value;
  const ownerVault = call.metadata.find((m) => m.key === ERC8004_METADATA_KEYS_V1.ownerVault).value;
  if (!BYTES32.test(digest) || !BYTES20.test(ownerVault)) return refuse('metadata_invalid', 'register.metadata');
  const vault = findLocalVaultV1(ctx.records ?? [], common.chainId);
  if (!vault) return refuse('vault_record_missing', 'register.metadata.ownerVault');
  if (ownerVault !== vault.accountAddress) return refuse('owner_vault_mismatch', 'register.metadata.ownerVault');
  const file = registrationFileDigestV1(text);
  if (file.ok === false) return refuse(file.reasonCode, `registrationFile.${file.field}`);
  if (file.digest !== digest) return refuse('file_digest_mismatch', 'register.metadata.fileDigest');
  if (file.file.active !== true) return refuse('registration_file_inactive', 'registrationFile.active');
  const web = file.file.services.find((s) => s.name === 'web');
  if (!/^https:\/\/[a-z0-9.-]+(?::[0-9]{1,5})?$/.test(ctx.pins.mainOrigin)) return refuse('main_origin_not_configured', 'pins.mainOrigin');
  if (!web || !web.endpoint.startsWith(`${ctx.pins.mainOrigin}/`)) return refuse('card_url_not_main_origin', 'registrationFile.services');
  return { name: file.file.name, description: file.file.description, cardUrl: web.endpoint, registry: erc8004AgentRegistryIdV1(common.chainId), chainName: CHAIN_NAMES[common.chainId] };
}

/** `deploy_setup`: the account's first UserOp (deploys it, installs SocialRecovery, optionally registers). */
export function checkDeploySetupV1(ctx: OwnWalletPurposeContextV1): OwnWalletPurposeCheckV1 {
  const c = commonChecks(ctx, 'deploy_setup');
  if (c.ok === false) return c;
  const intent = ctx.intent as Extract<OwnWalletIntentV1, { purpose: 'deploy_setup' }>;
  const missing = needRecord(c);
  if (missing) return missing;
  const record = c.record;
  // R4-L5: this address (or its index) is this device's account of another Agent.
  if (intent.agentId !== record.agentId) return refuse('account_belongs_to_other_agent', 'intent.agentId', addressBelongsToOtherAgentTextV1(record.agentName));
  const dup = localDuplicateOfV1(ctx.records ?? [], record);
  if (dup) return refuse(dup.reasonCode, 'local', dup.message);
  const op = ctx.request.userOp;
  const account = checkAccountFactoryV1({ chainId: c.chainId, factory: op.factory, factoryData: op.factoryData, sender: c.sender, local: record });
  if (account.ok === false) return refuse(account.reasonCode, account.field);
  if (c.callType !== 'batch') return refuse('call_type_mismatch', 'userOp.callData');
  if (c.executions.length > 2) return refuse('unexpected_call', 'userOp.callData.executions[2]');
  const recovery = checkRecoveryInstall(c.executions[0], c.sender, record, intent);
  if (isRefusal(recovery)) return recovery;
  let register: OwnWalletRegisterDisplayV1 | undefined;
  if (c.executions.length === 2) {
    const r = checkRegisterExecution(ctx, c, c.executions[1]);
    if (isRefusal(r)) return r;
    register = r;
  }
  const display: OwnWalletDisplayV1 = {
    purpose: 'deploy_setup',
    accountAddress: account.accountAddress,
    agentName: record.agentName,
    credentialLabel: record.credentialLabel,
    guardians: recovery.guardians,
    threshold: recovery.threshold,
    usesRecoveryCode: recovery.usesRecoveryCode,
    ...(register ? { register } : {}),
  };
  if (!sameSet(recovery.guardians, intent.guardians)) return differs('guardians', display);
  if (recovery.threshold !== intent.threshold) return differs('threshold', display);
  if (intent.register !== (register !== undefined)) return differs('register', display);
  if (register && register.cardUrl !== intent.cardUrl) return differs('cardUrl', display);
  return { ok: true, purpose: 'deploy_setup', userOpHash: c.userOpHash, display };
}

/** `install_recovery`: the account is deployed but SocialRecovery is not installed (R3-M2). */
export function checkInstallRecoveryV1(ctx: OwnWalletPurposeContextV1): OwnWalletPurposeCheckV1 {
  const c = commonChecks(ctx, 'install_recovery');
  if (c.ok === false) return c;
  const intent = ctx.intent as Extract<OwnWalletIntentV1, { purpose: 'install_recovery' }>;
  const missing = needRecord(c);
  if (missing) return missing;
  if (typeof ctx.chain?.deployed !== 'boolean' || typeof ctx.chain?.socialRecoveryInstalled !== 'boolean') return refuse('chain_fact_missing', 'chain');
  if (ctx.chain.deployed !== true) return refuse('account_not_deployed', 'chain.deployed');
  if (ctx.chain.socialRecoveryInstalled !== false) return refuse('recovery_already_installed', 'chain.socialRecoveryInstalled');
  if (c.callType !== 'single' || c.executions.length !== 1) return refuse('call_type_mismatch', 'userOp.callData');
  const recovery = checkRecoveryInstall(c.executions[0], c.sender, c.record, intent);
  if (isRefusal(recovery)) return recovery;
  const display: OwnWalletDisplayV1 = { purpose: 'install_recovery', accountAddress: c.sender, ...recovery };
  if (!sameSet(recovery.guardians, intent.guardians)) return differs('guardians', display);
  if (recovery.threshold !== intent.threshold) return differs('threshold', display);
  return { ok: true, purpose: 'install_recovery', userOpHash: c.userOpHash, display };
}

/** `register` on a deployed account. */
export function checkRegisterV1(ctx: OwnWalletPurposeContextV1): OwnWalletPurposeCheckV1 {
  const c = commonChecks(ctx, 'register');
  if (c.ok === false) return c;
  const intent = ctx.intent as Extract<OwnWalletIntentV1, { purpose: 'register' }>;
  const missing = needRecord(c);
  if (missing) return missing;
  if (c.callType !== 'single' || c.executions.length !== 1) return refuse('call_type_mismatch', 'userOp.callData');
  const r = checkRegisterExecution(ctx, c, c.executions[0]);
  if (isRefusal(r)) return r;
  const display: OwnWalletDisplayV1 = { purpose: 'register', accountAddress: c.sender, ...r };
  if (r.cardUrl !== intent.cardUrl) return differs('cardUrl', display);
  return { ok: true, purpose: 'register', userOpHash: c.userOpHash, display };
}

/**
 * `revoke_registration` (I4): `[removeSession…] setAgentURI setMetadata×2 transferFrom(sender → 0x…dEaD)`, in this
 * order, all for one agentId that the account holds on chain.
 */
export function checkRevokeRegistrationV1(ctx: OwnWalletPurposeContextV1): OwnWalletPurposeCheckV1 {
  const c = commonChecks(ctx, 'revoke_registration');
  if (c.ok === false) return c;
  const intent = ctx.intent as Extract<OwnWalletIntentV1, { purpose: 'revoke_registration' }>;
  const missing = needRecord(c);
  if (missing) return missing;
  if (typeof ctx.chain?.registrationOwner !== 'string' || !Array.isArray(ctx.chain?.permissionIds)) return refuse('chain_fact_missing', 'chain');
  if (c.callType !== 'batch') return refuse('call_type_mismatch', 'userOp.callData');
  const removed: string[] = [];
  let i = 0;
  for (; i < c.executions.length && c.executions[i].target === SMART_SESSIONS; i += 1) {
    const id = c.executions[i].value === BigInt(0) ? decodeRemoveSessionV1(c.executions[i].data) : null;
    if (!id) return refuse('revoke_call_invalid', `userOp.callData.executions[${i}]`);
    removed.push(id);
  }
  const rest = c.executions.slice(i);
  if (rest.length !== 4 || rest.some((e) => e.target !== REGISTRY || e.value !== BigInt(0))) return refuse('revoke_call_invalid', 'userOp.callData');
  const calls = rest.map((e) => decodeRegistryCallV1(e.data));
  const [uri, metaA, metaB, transfer] = calls;
  if (!uri || uri.fn !== 'setAgentURI' || !metaA || metaA.fn !== 'setMetadata' || !metaB || metaB.fn !== 'setMetadata' || !transfer || transfer.fn !== 'transferFrom') {
    return refuse('revoke_call_invalid', 'userOp.callData');
  }
  const agentId = uri.agentId;
  if (metaA.agentId !== agentId || metaB.agentId !== agentId || transfer.agentId !== agentId) return refuse('revoke_call_invalid', 'agentId');
  if (ctx.chain.registrationOwner.toLowerCase() !== c.sender) return refuse('registration_not_owned', 'chain.registrationOwner');
  if (transfer.from !== c.sender || transfer.to !== REVOKED_HOLDER) return refuse('revoke_target_invalid', 'transferFrom');
  if (new Set(removed).size !== removed.length || !sameSet(removed, ctx.chain.permissionIds)) return refuse('sessions_mismatch', 'removeSession');
  const metas = [metaA, metaB];
  const status = metas.find((m) => m.key === 'agentrix.status');
  const digest = metas.find((m) => m.key === ERC8004_METADATA_KEYS_V1.fileDigest);
  if (!status || !digest || status === digest) return refuse('metadata_invalid', 'setMetadata');
  if (metadataTextV1(status.value) !== 'revoked' || !BYTES32.test(digest.value)) return refuse('metadata_invalid', 'setMetadata');
  const expected = expectedAgentUriV1(ctx.pins.fileBaseUrl, c.chainId, c.sender);
  let text: string | undefined;
  if (expected !== null && uri.uri === expected) text = ctx.registrationFileText;
  else if (ctx.pins.allowDataUri === true && dataUriTextV1(uri.uri) !== null) text = dataUriTextV1(uri.uri);
  else return refuse('agent_uri_not_allowed', 'setAgentURI');
  if (typeof text !== 'string') return refuse('registration_file_unavailable', 'setAgentURI');
  const file = registrationFileDigestV1(text);
  if (file.ok === false) return refuse(file.reasonCode, `registrationFile.${file.field}`);
  if (file.digest !== digest.value) return refuse('file_digest_mismatch', 'setMetadata');
  if (file.file.active !== false) return refuse('revoked_file_still_active', 'registrationFile.active');
  const display: OwnWalletDisplayV1 = { purpose: 'revoke_registration', accountAddress: c.sender, agentId: agentId.toString(), name: file.file.name, sessionsRemoved: removed.length, irreversible: true };
  if (file.file.name !== intent.agentName) return differs('agentName', display);
  return { ok: true, purpose: 'revoke_registration', userOpHash: c.userOpHash, display };
}

/** `revoke_session`: one `removeSession` of a permission the account has on chain. */
export function checkRevokeSessionV1(ctx: OwnWalletPurposeContextV1): OwnWalletPurposeCheckV1 {
  const c = commonChecks(ctx, 'revoke_session');
  if (c.ok === false) return c;
  const missing = needRecord(c);
  if (missing) return missing;
  if (!Array.isArray(ctx.chain?.permissionIds)) return refuse('chain_fact_missing', 'chain');
  const e = single(c, SMART_SESSIONS);
  if (isRefusal(e)) return e;
  const permissionId = decodeRemoveSessionV1(e.data);
  if (!permissionId) return refuse('revoke_call_invalid', 'userOp.callData');
  if (!ctx.chain.permissionIds.map((p) => p.toLowerCase()).includes(permissionId)) return refuse('session_not_on_chain', 'permissionId');
  return { ok: true, purpose: 'revoke_session', userOpHash: c.userOpHash, display: { purpose: 'revoke_session', accountAddress: c.sender, permissionId } };
}

/** `add_credential`: the key is the one this page just created, or the owner typed its fingerprint from the other device. */
export function checkAddCredentialV1(ctx: OwnWalletPurposeContextV1): OwnWalletPurposeCheckV1 {
  const c = commonChecks(ctx, 'add_credential');
  if (c.ok === false) return c;
  const missing = needRecord(c);
  if (missing) return missing;
  const e = single(c, WEBAUTHN_VALIDATOR);
  if (isRefusal(e)) return e;
  const key = decodeAddCredentialV1(e.data);
  if (!key) return refuse('credential_call_invalid', 'userOp.callData');
  if (key.requireUV !== true) return refuse('require_uv_missing', 'requireUV');
  const fingerprint = keyFingerprintV1(key);
  if (ctx.freshCredential) {
    if (!sameKey(ctx.freshCredential, key)) return refuse('credential_not_this_page', 'pubKey');
  } else if (typeof ctx.fingerprintFirstGroup === 'string') {
    if (ctx.fingerprintFirstGroup.trim().toLowerCase() !== fingerprint.split(' ')[0]) return refuse('fingerprint_mismatch', 'fingerprint');
  } else {
    return refuse('credential_not_confirmed', 'pubKey');
  }
  return { ok: true, purpose: 'add_credential', userOpHash: c.userOpHash, display: { purpose: 'add_credential', accountAddress: c.sender, fingerprint } };
}

/** `remove_credential`: not this device's key unless confirmed twice; never below the validator threshold. */
export function checkRemoveCredentialV1(ctx: OwnWalletPurposeContextV1): OwnWalletPurposeCheckV1 {
  const c = commonChecks(ctx, 'remove_credential');
  if (c.ok === false) return c;
  const missing = needRecord(c);
  if (missing) return missing;
  if (!Array.isArray(ctx.chain?.credentials) || typeof ctx.chain?.credentialThreshold !== 'number') return refuse('chain_fact_missing', 'chain');
  const e = single(c, WEBAUTHN_VALIDATOR);
  if (isRefusal(e)) return e;
  const key = decodeRemoveCredentialV1(e.data);
  if (!key) return refuse('credential_call_invalid', 'userOp.callData');
  if (!ctx.chain.credentials.some((k) => sameKey(k, key))) return refuse('credential_not_on_chain', 'pubKey');
  const thisDevice = sameKey(c.record, key);
  if (thisDevice && ctx.confirmRemoveThisDevice !== true) return refuse('removes_this_device_key', 'pubKey');
  if (ctx.chain.credentials.length - 1 < ctx.chain.credentialThreshold || ctx.chain.credentials.length - 1 < 1) return refuse('below_threshold', 'chain.credentialThreshold');
  const known = (ctx.records ?? []).find((r) => r.chainId === c.chainId && r.accountAddress === c.sender && sameKey(r, key));
  const display: OwnWalletDisplayV1 = {
    purpose: 'remove_credential',
    accountAddress: c.sender,
    fingerprint: keyFingerprintV1(key),
    thisDevice,
    ...(known?.credentialLabel ? { label: known.credentialLabel } : {}),
  };
  return { ok: true, purpose: 'remove_credential', userOpHash: c.userOpHash, display };
}

/** `set_guardians`: SocialRecovery calls applied to the chain's list must give a valid list (W4.3) equal to the intent. */
export function checkSetGuardiansV1(ctx: OwnWalletPurposeContextV1): OwnWalletPurposeCheckV1 {
  const c = commonChecks(ctx, 'set_guardians');
  if (c.ok === false) return c;
  const intent = ctx.intent as Extract<OwnWalletIntentV1, { purpose: 'set_guardians' }>;
  const missing = needRecord(c);
  if (missing) return missing;
  const chain = ctx.chain;
  if (typeof chain?.socialRecoveryInstalled !== 'boolean' || !Array.isArray(chain?.guardians) || typeof chain?.guardianThreshold !== 'number') return refuse('chain_fact_missing', 'chain');
  if (chain.socialRecoveryInstalled !== true) return refuse('recovery_not_installed', 'chain.socialRecoveryInstalled');
  const list = chain.guardians.map((g) => g.toLowerCase());
  let threshold = chain.guardianThreshold;
  for (let i = 0; i < c.executions.length; i += 1) {
    const e = c.executions[i];
    const at = `userOp.callData.executions[${i}]`;
    if (e.target !== SOCIAL_RECOVERY || e.value !== BigInt(0)) return refuse('guardian_call_invalid', at);
    const op = decodeGuardianOpV1(e.data);
    if (!op) return refuse('guardian_call_invalid', at);
    if (op.op === 'add') {
      if (op.guardian === ZERO_ADDRESS || list.includes(op.guardian)) return refuse('guardian_add_invalid', at);
      list.unshift(op.guardian);
    } else if (op.op === 'remove') {
      const index = list.indexOf(op.guardian);
      if (index < 0) return refuse('guardian_remove_invalid', at);
      if (op.prevGuardian !== (index === 0 ? SENTINEL : list[index - 1])) return refuse('guardian_prev_mismatch', at);
      list.splice(index, 1);
    } else {
      if (op.threshold < 1) return refuse('guardian_threshold_invalid', at);
      threshold = op.threshold;
    }
  }
  const code = c.record.recoveryCodeAddress ? c.record.recoveryCodeAddress.toLowerCase() : undefined;
  if (code && chain.guardians.map((g) => g.toLowerCase()).includes(code) && !list.includes(code) && ctx.confirmRemoveRecoveryCode !== true) {
    return refuse('recovery_code_removal_unconfirmed', 'guardians');
  }
  if (list.length === 0) return refuse('guardian_list_empty', 'guardians');
  if (list.length > OWN_WALLET_GUARDIANS_MAX_V1) return refuse('guardian_list_too_long', 'guardians');
  const t = recoveryThresholdProblemV1(list, threshold, code);
  if (t) return refuse(t, 'threshold');
  const display: OwnWalletDisplayV1 = { purpose: 'set_guardians', accountAddress: c.sender, guardians: list.slice(), threshold };
  if (!sameSet(list, intent.guardians)) return differs('guardians', display);
  if (threshold !== intent.threshold) return differs('threshold', display);
  return { ok: true, purpose: 'set_guardians', userOpHash: c.userOpHash, display };
}

/** `transfer`: native coin with empty data, or this chain's pinned token `transfer`; never to the account or a module. */
export function checkTransferV1(ctx: OwnWalletPurposeContextV1): OwnWalletPurposeCheckV1 {
  const c = commonChecks(ctx, 'transfer');
  if (c.ok === false) return c;
  const intent = ctx.intent as Extract<OwnWalletIntentV1, { purpose: 'transfer' }>;
  const missing = needRecord(c);
  if (missing) return missing;
  if (c.callType !== 'single' || c.executions.length !== 1) return refuse('call_type_mismatch', 'userOp.callData');
  const e = c.executions[0];
  const token = OWN_WALLET_PINNED_TOKENS_V1[c.chainId];
  let to: string;
  let amount: bigint;
  let asset: 'native' | 'token';
  if (e.data === '0x') {
    asset = 'native';
    to = e.target;
    amount = e.value;
  } else {
    if (e.target !== token.address.toLowerCase()) return refuse('token_not_pinned', 'userOp.callData.target');
    if (e.value !== BigInt(0)) return refuse('value_not_allowed', 'userOp.callData.value');
    const t = decodeErc20TransferV1(e.data);
    if (!t) return refuse('transfer_call_invalid', 'userOp.callData');
    asset = 'token';
    to = t.to;
    amount = t.amount;
  }
  if (amount <= BigInt(0)) return refuse('amount_invalid', 'amount');
  if (to === c.sender || to === ZERO_ADDRESS || PINNED_MODULE_ADDRESSES.includes(to) || to === token.address.toLowerCase()) return refuse('recipient_not_allowed', 'to');
  const vault = findLocalVaultV1(ctx.records ?? [], c.chainId);
  const display: OwnWalletDisplayV1 = {
    purpose: 'transfer',
    accountAddress: c.sender,
    to,
    amount: amount.toString(),
    asset,
    symbol: asset === 'native' ? NATIVE_SYMBOLS[c.chainId] : token.symbol,
    decimals: asset === 'native' ? 18 : token.decimals,
    toIsOwnVault: !!vault && vault.accountAddress === to,
  };
  if (intent.asset !== asset) return differs('asset', display);
  if (intent.to !== to) return differs('to', display);
  if (intent.amount !== amount.toString()) return differs('amount', display);
  return { ok: true, purpose: 'transfer', userOpHash: c.userOpHash, display };
}

/** `recover` (5.4): SocialRecovery-validated `addCredential(x, y, true)` of the owner's new key. */
export function checkRecoverV1(ctx: OwnWalletPurposeContextV1): OwnWalletPurposeCheckV1 {
  const c = commonChecks(ctx, 'recover');
  if (c.ok === false) return c;
  const e = single(c, WEBAUTHN_VALIDATOR);
  if (isRefusal(e)) return e;
  const key = decodeAddCredentialV1(e.data);
  if (!key) return refuse('credential_call_invalid', 'userOp.callData');
  if (key.requireUV !== true) return refuse('require_uv_missing', 'requireUV');
  const role = ctx.role === 'guardian' ? 'guardian' : 'owner';
  if (role === 'owner' && (!ctx.freshCredential || !sameKey(ctx.freshCredential, key))) return refuse('credential_not_this_page', 'pubKey');
  return { ok: true, purpose: 'recover', userOpHash: c.userOpHash, display: { purpose: 'recover', accountAddress: c.sender, fingerprint: keyFingerprintV1(key), role } };
}

/** `grant_session`: refused until S7 fixes the encoding (see the file comment). */
export function checkGrantSessionV1(ctx: OwnWalletPurposeContextV1): OwnWalletPurposeCheckV1 {
  void ctx;
  return refuse('purpose_not_supported', 'purpose');
}

const CHECKS: Readonly<Record<OwnWalletPurposeV1, (ctx: OwnWalletPurposeContextV1) => OwnWalletPurposeCheckV1>> = {
  deploy_setup: checkDeploySetupV1,
  install_recovery: checkInstallRecoveryV1,
  register: checkRegisterV1,
  revoke_registration: checkRevokeRegistrationV1,
  grant_session: checkGrantSessionV1,
  revoke_session: checkRevokeSessionV1,
  add_credential: checkAddCredentialV1,
  remove_credential: checkRemoveCredentialV1,
  set_guardians: checkSetGuardiansV1,
  transfer: checkTransferV1,
  recover: checkRecoverV1,
};

/** Runs the check for the request's own purpose. Anything that throws is a refusal. */
export function checkWalletRequestV1(ctx: OwnWalletPurposeContextV1): OwnWalletPurposeCheckV1 {
  const check = ctx?.request ? CHECKS[ctx.request.purpose] : undefined;
  if (!check) return refuse('purpose_not_supported', 'purpose');
  try {
    return check(ctx);
  } catch {
    return refuse('check_failed', '$');
  }
}
