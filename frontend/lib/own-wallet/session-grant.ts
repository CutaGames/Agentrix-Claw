/**
 * L8-6 S7 part 3, wallet origin side: what the owner is asked to sign when a desktop computer is authorized to pay
 * (`grant_session`, design W2.3, W2.6, coord 10-29 16:0x and 19:3x). Pure functions over ethers; no key, no network, no
 * server text.
 *
 * - The UserOp is the owner's ROOT UserOp (wallet passkey): `execute(single, account, 0, installModule(1, SmartSessions,
 *   address(1) ‖ abi.encode(0x02 ‖ abi.encode(Session[1]), 0x, 0xe9ae5c53)))`. `0x02` is SmartSessions' UNSAFE_ENABLE
 *   install mode: it does not call the ERC-7484 registry. Instead the page requires the validator and the five policy
 *   contracts to be the pinned ones and their code on chain to hash to this chain's pinned codehash (the caller reads
 *   the code; see `public-chain-reader.ts`). The owner's signature covers the whole UserOp, so any change of validator,
 *   policy, init data or salt changes what is signed.
 * - The page accepts only what the backend assembler makes (`smart-sessions.encoder.ts`): the Session is decoded, turned
 *   back into parameters, rebuilt, and the bytes of the whole call must be identical. Anything else is refused.
 * - Session validator config is layout B (320 bytes, the SmartSessions v1.0.0 limit): `usePrecompile` false, `account`
 *   address(1), one credential, `requireUV` false, threshold 1. Pinned by `session-config-layout-b-vectors.json` (the
 *   expected bytes came from `eth_call` on 97).
 * - Actions are exactly two templates: the native coin to ONE payee (ValueLimit total, UsageLimit count, TimeFrame) and
 *   the chain's pinned token `transfer` to ONE payee (ERC20SpendingLimit total, UniAction payee and per-transfer cap,
 *   TimeFrame). No SudoPolicy, no ERC-7739 content, no UserOp policy, `permitERC4337Paymaster` false.
 * - Testnets only. A mainnet rule chain (never configured, A13) is refused here instead of being handled: its paymaster
 *   branch has no pinned paymaster to check against.
 * - The single-payment cap of the native coin is NOT on chain (ValueLimit is cumulative); the computer enforces it. The
 *   page therefore shows the on-chain limits as decoded and treats a per-payment cap in the link as information only.
 */
import { AbiCoder, concat, dataLength, dataSlice, getAddress, keccak256, solidityPacked, toBeHex } from 'ethers';
import { EXEC_MODE_RULES_V1, OWN_WALLET_MODULES_V1, OWN_WALLET_PINNED_TOKENS_V1, ownWalletChainAllowedV1, ownWalletModuleV1, type OwnWalletModuleNameV1 } from '../../../shared/types/agent-own-wallet';
import { KERNEL_EXECUTE_IFACE_V1, KERNEL_HOOK_NOT_NEEDED_V1 } from './userop-decode';

export const SESSION_CONFIG_BYTES_V1 = 320;
/** The `account` word of layout B; also the threshold word. Constant for every session: it binds nothing. */
export const SESSION_CONFIG_ACCOUNT_V1 = '0x0000000000000000000000000000000000000001';
export const SESSION_VALUE_SELECTOR_V1 = '0xffffffff';
export const SESSION_ERC20_TRANSFER_SELECTOR_V1 = '0xa9059cbb';
/** SmartSessions install data mode byte: UNSAFE_ENABLE. */
export const SESSION_INSTALL_MODE_UNSAFE_ENABLE_V1 = '0x02';
export const SESSION_MAX_COUNT_V1 = 1000;
export const SESSION_MAX_LIFETIME_SECONDS_V1 = 30 * 24 * 60 * 60;

/** The pinned contracts a device session touches: the validator, SmartSessions and the five policies. */
export const SESSION_CONTRACT_NAMES_V1: readonly OwnWalletModuleNameV1[] = [
  'webAuthnValidator',
  'smartSessions',
  'valueLimitPolicy',
  'usageLimitPolicy',
  'timeFramePolicy',
  'erc20SpendingLimitPolicy',
  'uniActionPolicy',
];

const SMART_SESSIONS = ownWalletModuleV1('smartSessions').address.toLowerCase();
const WEBAUTHN_VALIDATOR = ownWalletModuleV1('webAuthnValidator').address.toLowerCase();
const POLICY = {
  valueLimit: ownWalletModuleV1('valueLimitPolicy').address.toLowerCase(),
  usageLimit: ownWalletModuleV1('usageLimitPolicy').address.toLowerCase(),
  timeFrame: ownWalletModuleV1('timeFramePolicy').address.toLowerCase(),
  erc20SpendingLimit: ownWalletModuleV1('erc20SpendingLimitPolicy').address.toLowerCase(),
  uniAction: ownWalletModuleV1('uniActionPolicy').address.toLowerCase(),
} as const;
const POLICY_ADDRESSES: readonly string[] = [POLICY.valueLimit, POLICY.usageLimit, POLICY.timeFrame, POLICY.erc20SpendingLimit, POLICY.uniAction];
const ZERO_ADDRESS = '0x' + '0'.repeat(40);
const UINT256_MAX = (BigInt(1) << BigInt(256)) - BigInt(1);

const coder = AbiCoder.defaultAbiCoder();
const POLICY_DATA = 'tuple(address,bytes)';
const SESSION_TUPLE = `tuple(address,bytes,bytes32,${POLICY_DATA}[],tuple(tuple(bytes32,string[])[],${POLICY_DATA}[]),tuple(bytes4,address,${POLICY_DATA}[])[],bool)`;
const PARAM_RULE = 'tuple(uint8,uint64,bool,bytes32,tuple(uint256,uint256))';
const UNI_ACTION_TYPE = `tuple(uint256,tuple(uint256,${PARAM_RULE}[16]))`;
const WORD = /^0x[0-9a-fA-F]{64}$/;

export type OwnWalletSessionProblemV1 =
  | 'session_calldata_invalid'
  | 'session_chain_not_supported'
  | 'session_key_invalid'
  | 'session_limit_invalid'
  | 'session_expiry_invalid'
  | 'session_validator_not_pinned'
  | 'session_policy_not_pinned'
  | 'session_config_layout_invalid'
  | 'session_paymaster_rule_violated'
  | 'session_action_invalid'
  | 'session_target_not_allowed'
  | 'session_not_canonical';

export interface OwnWalletSessionPolicyEntryV1 {
  policy: string;
  initData: string;
}

export interface OwnWalletSessionActionV1 {
  selector: string;
  target: string;
  policies: OwnWalletSessionPolicyEntryV1[];
}

/** One `Session` struct of SmartSessions v1.0.0 (`erc7739Policies` is always empty and not a field here). */
export interface OwnWalletSessionSpecV1 {
  sessionValidator: string;
  sessionValidatorInitData: string;
  salt: string;
  userOpPolicies: OwnWalletSessionPolicyEntryV1[];
  actions: OwnWalletSessionActionV1[];
  permitERC4337Paymaster: boolean;
}

/** What a session stands for. `perTxWei` of the native coin is not on chain and not here. */
export interface OwnWalletSessionParamsV1 {
  sessionPubKeyX: string;
  sessionPubKeyY: string;
  /** Unix seconds; TimeFrame `validUntil`. */
  validUntil: number;
  native?: { payee: string; totalWei: string; maxCount: number };
  token?: { payee: string; perTransfer: string; total: string };
}

/** Thrown inside this file only. Read through `problemOf` (a tag, not `instanceof`: a transpiled Error subclass breaks it). */
class SessionProblem extends Error {
  readonly sessionProblem: OwnWalletSessionProblemV1;
  constructor(sessionProblem: OwnWalletSessionProblemV1) {
    super(sessionProblem);
    this.sessionProblem = sessionProblem;
  }
}

const bad = (reasonCode: OwnWalletSessionProblemV1): SessionProblem => new SessionProblem(reasonCode);

function problemOf(error: unknown): OwnWalletSessionProblemV1 {
  const tag = typeof error === 'object' && error !== null ? (error as { sessionProblem?: unknown }).sessionProblem : undefined;
  return typeof tag === 'string' ? (tag as OwnWalletSessionProblemV1) : 'session_not_canonical';
}

// ---------------------------------------------------------------------------------------------- P-256 key

const P256_P = BigInt('0xffffffff00000001000000000000000000000000ffffffffffffffffffffffff');
const P256_B = BigInt('0x5ac635d8aa3a93e7b3ebbd55769886bc651d06b0cc53b0f63bce3c3e27d2604b');

/** Is (x, y) a point of the P-256 curve? A key that is not on the curve can sign nothing; the page refuses it anyway. */
export function p256PointValidV1(x: string, y: string): boolean {
  if (typeof x !== 'string' || typeof y !== 'string' || !WORD.test(x) || !WORD.test(y)) return false;
  const px = BigInt(x);
  const py = BigInt(y);
  if (px >= P256_P || py >= P256_P) return false;
  const left = (py * py) % P256_P;
  const right = (((px * px) % P256_P) * px - BigInt(3) * px + P256_B) % P256_P;
  return left === ((right % P256_P) + P256_P) % P256_P;
}

// ---------------------------------------------------------------------------------------------- validator config

/** Layout B (design 1b (a), 320 bytes): 10 words. */
export function sessionValidatorDataV1(key: { pubKeyX: string; pubKeyY: string }): string {
  const word = (v: bigint | number | string) => toBeHex(v, 32);
  const credentialId = keccak256(coder.encode(['uint256', 'uint256', 'address'], [key.pubKeyX, key.pubKeyY, SESSION_CONFIG_ACCOUNT_V1]));
  return concat([word(0), word(1), word(0x80), word(0xc0), word(1), credentialId, word(1), word(key.pubKeyX), word(key.pubKeyY), word(0)]).toLowerCase();
}

/** The device key inside layout B, or `null` when the bytes are anything else (the canonical 384 bytes included). */
export function decodeSessionValidatorDataV1(data: unknown): { pubKeyX: string; pubKeyY: string } | null {
  if (typeof data !== 'string' || !/^0x(?:[0-9a-fA-F]{2})*$/.test(data) || dataLength(data) !== SESSION_CONFIG_BYTES_V1) return null;
  try {
    const x = '0x' + data.slice(2 + 64 * 7, 2 + 64 * 8);
    const y = '0x' + data.slice(2 + 64 * 8, 2 + 64 * 9);
    if (!WORD.test(x) || !WORD.test(y)) return null;
    const key = { pubKeyX: x.toLowerCase(), pubKeyY: y.toLowerCase() };
    return sessionValidatorDataV1(key) === data.toLowerCase() ? key : null;
  } catch {
    return null;
  }
}

/** `keccak256(abi.encode(sessionValidator, sessionValidatorInitData, salt))`, SmartSessions' permission id. */
export function sessionPermissionIdOfKeyV1(key: { pubKeyX: string; pubKeyY: string }, salt: string): string {
  return keccak256(coder.encode(['address', 'bytes', 'bytes32'], [getAddress(WEBAUTHN_VALIDATOR), sessionValidatorDataV1(key), salt.toLowerCase()])).toLowerCase();
}

// ---------------------------------------------------------------------------------------------- policy init data

const valueLimitInit = (limit: bigint): string => coder.encode(['uint256'], [limit]).toLowerCase();
const usageLimitInit = (limit: number): string => solidityPacked(['uint128'], [limit]).toLowerCase();
/** The pinned TimeFramePolicy reads uint128 validUntil ‖ uint128 validAfter (32 bytes). */
const timeFrameInit = (validUntil: number): string => solidityPacked(['uint128', 'uint128'], [validUntil, 0]).toLowerCase();
const spendingLimitInit = (token: string, limit: bigint): string => coder.encode(['address[]', 'uint256[]'], [[getAddress(token)], [limit]]).toLowerCase();

function uniActionTransferInit(payee: string, perTransfer: bigint): string {
  const empty = [0, 0, false, '0x' + '00'.repeat(32), [0, 0]];
  const rules: unknown[] = [];
  for (let i = 0; i < 16; i += 1) rules.push(empty);
  rules[0] = [0, 0, false, '0x' + '00'.repeat(12) + payee.slice(2).toLowerCase(), [0, 0]];
  rules[1] = [4, 32, false, toBeHex(perTransfer, 32), [0, 0]];
  return coder.encode([UNI_ACTION_TYPE], [[0, [2, rules]]]).toLowerCase();
}

// ---------------------------------------------------------------------------------------------- spec <-> bytes

/** The Session struct for these parameters on a testnet (design W2.3). `salt` is 32 bytes. */
function buildSpec(chainId: number, params: OwnWalletSessionParamsV1, salt: string): OwnWalletSessionSpecV1 {
  if (!ownWalletChainAllowedV1(chainId)) throw bad('session_chain_not_supported');
  const key = { pubKeyX: params.sessionPubKeyX, pubKeyY: params.sessionPubKeyY };
  const timeFrame: OwnWalletSessionPolicyEntryV1 = { policy: POLICY.timeFrame, initData: timeFrameInit(params.validUntil) };
  const actions: OwnWalletSessionActionV1[] = [];
  if (params.native) {
    actions.push({
      selector: SESSION_VALUE_SELECTOR_V1,
      target: params.native.payee.toLowerCase(),
      policies: [
        { policy: POLICY.valueLimit, initData: valueLimitInit(BigInt(params.native.totalWei)) },
        { policy: POLICY.usageLimit, initData: usageLimitInit(params.native.maxCount) },
        timeFrame,
      ],
    });
  }
  if (params.token) {
    const pinned = OWN_WALLET_PINNED_TOKENS_V1[chainId];
    actions.push({
      selector: SESSION_ERC20_TRANSFER_SELECTOR_V1,
      target: pinned.address.toLowerCase(),
      policies: [
        { policy: POLICY.erc20SpendingLimit, initData: spendingLimitInit(pinned.address, BigInt(params.token.total)) },
        { policy: POLICY.uniAction, initData: uniActionTransferInit(params.token.payee, BigInt(params.token.perTransfer)) },
        timeFrame,
      ],
    });
  }
  if (actions.length === 0) throw bad('session_action_invalid');
  return { sessionValidator: WEBAUTHN_VALIDATOR, sessionValidatorInitData: sessionValidatorDataV1(key), salt: salt.toLowerCase(), userOpPolicies: [], actions, permitERC4337Paymaster: false };
}

const policyTuple = (e: OwnWalletSessionPolicyEntryV1): [string, string] => [getAddress(e.policy), e.initData];

function sessionValues(spec: OwnWalletSessionSpecV1): unknown[] {
  return [
    getAddress(spec.sessionValidator),
    spec.sessionValidatorInitData,
    spec.salt,
    spec.userOpPolicies.map(policyTuple),
    [[], []],
    spec.actions.map((a) => [a.selector, getAddress(a.target), a.policies.map(policyTuple)]),
    spec.permitERC4337Paymaster,
  ];
}

/** The `installModule(1, SmartSessions, …)` call data the owner's account executes on itself, for this one session. */
function installCallData(spec: OwnWalletSessionSpecV1): string {
  const onInstall = concat([SESSION_INSTALL_MODE_UNSAFE_ENABLE_V1, coder.encode([`${SESSION_TUPLE}[]`], [[sessionValues(spec)]])]);
  const initData = concat([KERNEL_HOOK_NOT_NEEDED_V1, coder.encode(['bytes', 'bytes', 'bytes'], [onInstall, '0x', EXEC_MODE_RULES_V1.outerSelector])]);
  return KERNEL_EXECUTE_IFACE_V1.encodeFunctionData('installModule', [1, getAddress(SMART_SESSIONS), initData]).toLowerCase();
}

function entriesOf(list: ArrayLike<ArrayLike<unknown>>): OwnWalletSessionPolicyEntryV1[] {
  return Array.from(list).map((e) => ({ policy: String(e[0]).toLowerCase(), initData: String(e[1]).toLowerCase() }));
}

/** The Session of an `installModule` call, or `null` when the call is not exactly the grant shape (byte-exact). */
function decodeInstall(data: string): OwnWalletSessionSpecV1 | null {
  try {
    const decoded = KERNEL_EXECUTE_IFACE_V1.decodeFunctionData('installModule', data);
    if (BigInt(decoded[0]) !== BigInt(1) || String(decoded[1]).toLowerCase() !== SMART_SESSIONS) return null;
    const init = String(decoded[2]).toLowerCase();
    if (dataLength(init) < 20 || dataSlice(init, 0, 20) !== KERNEL_HOOK_NOT_NEEDED_V1) return null;
    const [onInstall, hookData, selectorData] = coder.decode(['bytes', 'bytes', 'bytes'], dataSlice(init, 20));
    if (String(hookData) !== '0x' || String(selectorData).toLowerCase() !== EXEC_MODE_RULES_V1.outerSelector) return null;
    const install = String(onInstall).toLowerCase();
    if (dataSlice(install, 0, 1) !== SESSION_INSTALL_MODE_UNSAFE_ENABLE_V1) return null;
    const [sessions] = coder.decode([`${SESSION_TUPLE}[]`], dataSlice(install, 1));
    if (sessions.length !== 1) return null;
    const r = sessions[0];
    if (r[4][0].length !== 0 || r[4][1].length !== 0) return null;
    const spec: OwnWalletSessionSpecV1 = {
      sessionValidator: String(r[0]).toLowerCase(),
      sessionValidatorInitData: String(r[1]).toLowerCase(),
      salt: String(r[2]).toLowerCase(),
      userOpPolicies: entriesOf(r[3]),
      actions: Array.from(r[5] as ArrayLike<ArrayLike<unknown>>).map((a) => ({
        selector: String(a[0]).toLowerCase(),
        target: String(a[1]).toLowerCase(),
        policies: entriesOf(a[2] as ArrayLike<ArrayLike<unknown>>),
      })),
      permitERC4337Paymaster: Boolean(r[6]),
    };
    return installCallData(spec) === data.toLowerCase() ? spec : null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------------------------- reading a spec back

const packedU128 = (data: string, from: number): bigint => BigInt(dataSlice(data, from, from + 16));

/** TimeFrame init data → validUntil (validAfter must be 0). */
function timeFrameOf(initData: string): number | null {
  if (dataLength(initData) !== 32 || packedU128(initData, 16) !== BigInt(0)) return null;
  const v = packedU128(initData, 0);
  return v <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(v) : null;
}

/** The parameters a spec stands for, or the reason it is not one of our templates. */
function paramsOfSpec(spec: OwnWalletSessionSpecV1): OwnWalletSessionParamsV1 {
  const key = decodeSessionValidatorDataV1(spec.sessionValidatorInitData);
  if (!key) throw bad('session_config_layout_invalid');
  const params: Partial<OwnWalletSessionParamsV1> = { sessionPubKeyX: key.pubKeyX, sessionPubKeyY: key.pubKeyY };
  const seen: { validUntil: number | null } = { validUntil: null };
  const note = (v: number | null): void => {
    if (v === null) throw bad('session_not_canonical');
    if (seen.validUntil !== null && seen.validUntil !== v) throw bad('session_not_canonical');
    seen.validUntil = v;
  };
  for (const action of spec.actions) {
    if (action.selector === SESSION_VALUE_SELECTOR_V1 && !params.native) {
      if (action.policies.length !== 3) throw bad('session_action_invalid');
      const [vl, ul, tf] = action.policies;
      if (vl.policy !== POLICY.valueLimit || ul.policy !== POLICY.usageLimit || tf.policy !== POLICY.timeFrame) throw bad('session_policy_not_pinned');
      const total = BigInt(coder.decode(['uint256'], vl.initData)[0]);
      const count = dataLength(ul.initData) === 16 ? Number(packedU128(ul.initData, 0)) : -1;
      note(timeFrameOf(tf.initData));
      params.native = { payee: action.target, totalWei: total.toString(), maxCount: count };
    } else if (action.selector === SESSION_ERC20_TRANSFER_SELECTOR_V1 && !params.token) {
      if (action.policies.length !== 3) throw bad('session_action_invalid');
      const [sl, ua, tf] = action.policies;
      if (sl.policy !== POLICY.erc20SpendingLimit || ua.policy !== POLICY.uniAction || tf.policy !== POLICY.timeFrame) throw bad('session_policy_not_pinned');
      const [tokens, limits] = coder.decode(['address[]', 'uint256[]'], sl.initData);
      if (tokens.length !== 1 || limits.length !== 1 || String(tokens[0]).toLowerCase() !== action.target) throw bad('session_action_invalid');
      const uni = coder.decode([UNI_ACTION_TYPE], ua.initData)[0];
      const rules = uni[1][1] as ArrayLike<ArrayLike<unknown>>;
      const payee = '0x' + String(rules[0][3]).slice(2 + 24).toLowerCase();
      note(timeFrameOf(tf.initData));
      params.token = { payee, perTransfer: BigInt(rules[1][3] as string).toString(), total: BigInt(limits[0]).toString() };
    } else {
      throw bad('session_action_invalid');
    }
  }
  if (seen.validUntil === null) throw bad('session_action_invalid');
  params.validUntil = seen.validUntil;
  return params as OwnWalletSessionParamsV1;
}

/**
 * W2.3 as a check on a decoded Session. `null` when it is exactly what the assembler makes on this testnet for some
 * parameters; else the first reason. Order: validator and policy addresses pinned, layout B, paymaster rule, action
 * targets and payees, then the byte-for-byte rebuild.
 */
function specProblem(spec: OwnWalletSessionSpecV1, chainId: number, account: string): OwnWalletSessionProblemV1 | null {
  if (!ownWalletChainAllowedV1(chainId)) return 'session_chain_not_supported';
  if (spec.sessionValidator !== WEBAUTHN_VALIDATOR) return 'session_validator_not_pinned';
  if (!decodeSessionValidatorDataV1(spec.sessionValidatorInitData)) return 'session_config_layout_invalid';
  const policyAddresses: string[] = spec.userOpPolicies.map((p) => p.policy);
  for (const a of spec.actions) for (const p of a.policies) policyAddresses.push(p.policy);
  if (policyAddresses.some((p) => !POLICY_ADDRESSES.includes(p))) return 'session_policy_not_pinned';
  if (spec.permitERC4337Paymaster !== false || spec.userOpPolicies.length !== 0) return 'session_paymaster_rule_violated';
  const denied = OWN_WALLET_MODULES_V1.map((m) => m.address.toLowerCase());
  denied.push(account.toLowerCase());
  for (const action of spec.actions) {
    if (action.target === ZERO_ADDRESS || denied.includes(action.target)) return 'session_target_not_allowed';
  }
  try {
    const params = paramsOfSpec(spec);
    for (const payee of [params.native ? params.native.payee : undefined, params.token ? params.token.payee : undefined]) {
      if (payee !== undefined && (payee === ZERO_ADDRESS || denied.includes(payee))) return 'session_target_not_allowed';
    }
    const rebuilt = buildSpec(chainId, params, spec.salt);
    return JSON.stringify(rebuilt) === JSON.stringify(spec) ? null : 'session_not_canonical';
  } catch (error) {
    return problemOf(error);
  }
}

export type OwnWalletGrantDecodeV1 =
  | { ok: true; spec: OwnWalletSessionSpecV1; params: OwnWalletSessionParamsV1; permissionId: string }
  | { ok: false; reasonCode: OwnWalletSessionProblemV1; field: string };

const refuse = (reasonCode: OwnWalletSessionProblemV1, field: string): { ok: false; reasonCode: OwnWalletSessionProblemV1; field: string } => ({ ok: false, reasonCode, field });

/**
 * The `data` of the one execution of a `grant_session` UserOp (the account's call on itself) → the session it
 * installs, if and only if that is exactly one of our templates on this chain. Limits are checked too: the count is
 * 1..1000, a limit is at least 1 and below 2^256, a per-transfer cap is not above the total, the key is on the curve.
 */
export function decodeGrantInstallV1(input: { chainId: number; account: string; data: string }): OwnWalletGrantDecodeV1 {
  if (!ownWalletChainAllowedV1(input.chainId)) return refuse('session_chain_not_supported', 'chainId');
  const spec = decodeInstall(String(input.data).toLowerCase());
  if (!spec) return refuse('session_calldata_invalid', 'userOp.callData');
  const problem = specProblem(spec, input.chainId, input.account);
  if (problem) return refuse(problem, 'userOp.callData');
  let params: OwnWalletSessionParamsV1;
  try {
    params = paramsOfSpec(spec);
  } catch {
    return refuse('session_not_canonical', 'userOp.callData');
  }
  if (!p256PointValidV1(params.sessionPubKeyX, params.sessionPubKeyY)) return refuse('session_key_invalid', 'sessionPubKey');
  const limitOk = (v: string): boolean => {
    const n = BigInt(v);
    return n >= BigInt(1) && n <= UINT256_MAX;
  };
  if (params.native) {
    if (!limitOk(params.native.totalWei)) return refuse('session_limit_invalid', 'native.totalWei');
    if (!Number.isInteger(params.native.maxCount) || params.native.maxCount < 1 || params.native.maxCount > SESSION_MAX_COUNT_V1) return refuse('session_limit_invalid', 'native.maxCount');
  }
  if (params.token) {
    if (!limitOk(params.token.total)) return refuse('session_limit_invalid', 'token.total');
    if (!limitOk(params.token.perTransfer) || BigInt(params.token.perTransfer) > BigInt(params.token.total)) return refuse('session_limit_invalid', 'token.perTransfer');
  }
  return { ok: true, spec, params, permissionId: keccak256(coder.encode(['address', 'bytes', 'bytes32'], [getAddress(spec.sessionValidator), spec.sessionValidatorInitData, spec.salt])).toLowerCase() };
}

/** Every pinned contract address this session relies on: the validator, SmartSessions and each policy it uses. */
export function sessionContractAddressesV1(spec: OwnWalletSessionSpecV1): string[] {
  const out: string[] = [spec.sessionValidator, SMART_SESSIONS];
  for (const a of spec.actions) for (const p of a.policies) if (!out.includes(p.policy)) out.push(p.policy);
  return out;
}

/** Expiry bound: in the future and no more than 30 days away (the assembler allows at most 30 days from its own now). */
export function sessionExpiryProblemV1(validUntil: number, nowSeconds: number): OwnWalletSessionProblemV1 | null {
  if (!Number.isInteger(validUntil) || !Number.isInteger(nowSeconds)) return 'session_expiry_invalid';
  if (validUntil <= nowSeconds || validUntil > nowSeconds + SESSION_MAX_LIFETIME_SECONDS_V1) return 'session_expiry_invalid';
  return null;
}
