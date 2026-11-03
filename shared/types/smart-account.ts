/**
 * Smart account v1 (L8 D6, testnet only): an ERC-4337 account (Kernel / ERC-7579) whose owner is the person's passkey and
 * whose Agent holds a session key that the chain itself keeps inside a limit. Contract shared by the backend
 * (`erc4337/smart-account.*`, `passkey/`), the web approval card and, later, mobile and desktop.
 *
 * What is true and what is not (said plainly, because the old "MPC wallet" is not like this):
 * - The owner key is a passkey; its private half never leaves the person's device, the server only sees signatures.
 * - The Agent's session key is a key the SERVER keeps (sealed at rest) and signs with. It can only spend inside the
 *   limits written to the chain for it, on the targets listed, until it expires or the owner revokes it. It is not the
 *   account key and cannot change the account, the limits or the owner.
 * - Testnets only. `SMART_ACCOUNT_V1_ENABLED` accepts the chains in `SMART_ACCOUNT_TESTNET_CHAINS_V1` and nothing else:
 *   every other chain id, mainnets included, is refused in code (an allow-list, not a deny-list).
 * - While the switch is on, a new Agent gets a smart account and no new MPC wallet; existing MPC wallets keep working.
 *
 * Switch: `SMART_ACCOUNT_V1_ENABLED`, only the exact '1', default off. Decoders refuse unknown fields and wrong types and
 * answer `{ ok: false, reasonCode, field }`; read the result as `x.ok === false`.
 */
export const SMART_ACCOUNT_V1_FLAG = 'SMART_ACCOUNT_V1_ENABLED';
export const SMART_ACCOUNT_CHAIN_ID_ENV_V1 = 'SMART_ACCOUNT_CHAIN_ID';
export const SMART_ACCOUNT_SCHEMA_VERSION_V1 = 1 as const;

/** The only chains this feature may touch. A test pins that no mainnet is ever added here by accident. */
export const SMART_ACCOUNT_TESTNET_CHAINS_V1 = {
  97: 'bsc-testnet',
  84532: 'base-sepolia',
} as const;
export type SmartAccountChainIdV1 = keyof typeof SMART_ACCOUNT_TESTNET_CHAINS_V1;

export function smartAccountChainAllowedV1(chainId: unknown): chainId is SmartAccountChainIdV1 {
  return typeof chainId === 'number' && Number.isInteger(chainId) && Object.prototype.hasOwnProperty.call(SMART_ACCOUNT_TESTNET_CHAINS_V1, chainId);
}

export type SmartAccountChainResultV1 = { ok: true; chainId: SmartAccountChainIdV1 } | { ok: false; reasonCode: 'chain_not_configured' | 'chain_invalid' | 'chain_not_allowed' };

/** Reads the chain from the environment: unset, not a plain integer, or not an allowed testnet are all refusals. */
export function smartAccountChainFromEnvV1(env: Readonly<Record<string, string | undefined>>): SmartAccountChainResultV1 {
  const raw = env[SMART_ACCOUNT_CHAIN_ID_ENV_V1];
  if (raw === undefined || raw === '') return { ok: false, reasonCode: 'chain_not_configured' };
  if (!/^[1-9][0-9]{0,9}$/.test(raw)) return { ok: false, reasonCode: 'chain_invalid' };
  const chainId = Number(raw);
  return smartAccountChainAllowedV1(chainId) ? { ok: true, chainId } : { ok: false, reasonCode: 'chain_not_allowed' };
}

export const SESSION_KEY_LIMITS_V1 = {
  targetsMax: 20,
  ttlSecondsMin: 60,
  ttlSecondsMax: 30 * 24 * 60 * 60,
  labelMax: 60,
  /** 2^256 - 1 has 78 digits. */
  amountDigitsMax: 78,
} as const;

export const SMART_ACCOUNT_REASON_CODES_V1 = [
  'unsupported_schema_version',
  'unknown_field',
  'missing_field',
  'invalid_type',
  'invalid_value',
  'limits_not_ordered',
  'expiry_invalid',
  'target_invalid',
  'chain_not_configured',
  'chain_invalid',
  'chain_not_allowed',
  'feature_disabled',
  'port_unavailable',
  'not_found',
  'revoked',
  'expired',
  'over_single_limit',
  'over_daily_limit',
  'over_monthly_limit',
  'target_not_allowed',
  'passkey_required',
  'passkey_rejected',
  'account_required',
  'limit_reached',
  'chain_rejected',
] as const;
export type SmartAccountReasonCodeV1 = (typeof SMART_ACCOUNT_REASON_CODES_V1)[number];

export type SmartAccountDecodeResultV1<T> = { ok: true; value: T } | { ok: false; reasonCode: SmartAccountReasonCodeV1; field: string };

/** What the owner asks for when giving an Agent a session key. Amounts are decimal strings of the chain's smallest unit. */
export interface SessionKeyGrantV1 {
  schemaVersion: typeof SMART_ACCOUNT_SCHEMA_VERSION_V1;
  label: string | null;
  /** Each limit is above zero (the validator reads 0 as "no limit", so 0 is never allowed here) and single <= daily <= monthly. */
  singleLimit: string;
  dailyLimit: string;
  monthlyLimit: string;
  /** Lower-case 0x addresses the key may pay; at least one, no repeats. The chain keeps this list too (whitelist only). */
  targets: string[];
  expiresAt: string;
}

export const SESSION_KEY_STATUSES_V1 = ['active', 'revoked', 'expired'] as const;
export type SessionKeyStatusV1 = (typeof SESSION_KEY_STATUSES_V1)[number];

/** What the owner and the Agent get to see of a session key. The key itself is never in any view. */
export interface SessionKeyViewV1 {
  schemaVersion: typeof SMART_ACCOUNT_SCHEMA_VERSION_V1;
  /** `sk_` + 32 lower-case hex. */
  sessionKeyId: string;
  chainId: SmartAccountChainIdV1;
  accountAddress: string;
  keyAddress: string;
  label: string | null;
  singleLimit: string;
  dailyLimit: string;
  monthlyLimit: string;
  targets: string[];
  expiresAt: string;
  status: SessionKeyStatusV1;
  createdAt: string;
  revokedAt: string | null;
}

const ADDRESS_V1 = /^0x[0-9a-f]{40}$/;
const AMOUNT_V1 = /^[1-9][0-9]*$/;
const ISO_V1 = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?Z$/;
const CONTROL_V1 = /[\u0000-\u001f\u007f]/;

export function isSmartAccountAddressV1(value: unknown): value is string {
  return typeof value === 'string' && ADDRESS_V1.test(value) && value !== '0x0000000000000000000000000000000000000000';
}

/** Decimal strings, no sign, no leading zero, 78 digits at most; the order of two of them without BigInt. */
export function compareSmartAccountAmountsV1(a: string, b: string): -1 | 0 | 1 {
  if (a.length !== b.length) return a.length < b.length ? -1 : 1;
  return a === b ? 0 : a < b ? -1 : 1;
}

function fail<T>(reasonCode: SmartAccountReasonCodeV1, field: string): SmartAccountDecodeResultV1<T> {
  return { ok: false, reasonCode, field };
}

const GRANT_KEYS_V1 = ['schemaVersion', 'label', 'singleLimit', 'dailyLimit', 'monthlyLimit', 'targets', 'expiresAt'] as const;

/** `nowMs` is given by the caller so the expiry rule is testable. */
export function decodeSessionKeyGrantV1(value: unknown, nowMs: number): SmartAccountDecodeResultV1<SessionKeyGrantV1> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return fail('invalid_type', '$');
  const v = value as Record<string, unknown>;
  if (v.schemaVersion === undefined) return fail('missing_field', 'schemaVersion');
  if (v.schemaVersion !== SMART_ACCOUNT_SCHEMA_VERSION_V1) return fail('unsupported_schema_version', 'schemaVersion');
  for (const key of Object.keys(v)) if (!(GRANT_KEYS_V1 as readonly string[]).includes(key)) return fail('unknown_field', key);
  for (const key of ['singleLimit', 'dailyLimit', 'monthlyLimit', 'targets', 'expiresAt'] as const) if (v[key] === undefined) return fail('missing_field', key);

  let label: string | null = null;
  if (v.label !== undefined && v.label !== null) {
    if (typeof v.label !== 'string') return fail('invalid_type', 'label');
    if (v.label.trim().length === 0 || v.label.length > SESSION_KEY_LIMITS_V1.labelMax || CONTROL_V1.test(v.label)) return fail('invalid_value', 'label');
    label = v.label;
  }
  const amounts: string[] = [];
  for (const key of ['singleLimit', 'dailyLimit', 'monthlyLimit'] as const) {
    if (typeof v[key] !== 'string') return fail('invalid_type', key);
    const text = v[key] as string;
    if (!AMOUNT_V1.test(text) || text.length > SESSION_KEY_LIMITS_V1.amountDigitsMax) return fail('invalid_value', key);
    amounts.push(text);
  }
  if (compareSmartAccountAmountsV1(amounts[0], amounts[1]) > 0 || compareSmartAccountAmountsV1(amounts[1], amounts[2]) > 0) return fail('limits_not_ordered', 'singleLimit');

  if (!Array.isArray(v.targets)) return fail('invalid_type', 'targets');
  if (v.targets.length < 1 || v.targets.length > SESSION_KEY_LIMITS_V1.targetsMax) return fail('target_invalid', 'targets');
  const seen = new Set<string>();
  for (const target of v.targets) {
    if (typeof target !== 'string' || !isSmartAccountAddressV1(target) || seen.has(target)) return fail('target_invalid', 'targets');
    seen.add(target);
  }

  if (typeof v.expiresAt !== 'string') return fail('invalid_type', 'expiresAt');
  if (!ISO_V1.test(v.expiresAt) || !Number.isFinite(Date.parse(v.expiresAt))) return fail('invalid_value', 'expiresAt');
  const ttlMs = Date.parse(v.expiresAt) - nowMs;
  if (ttlMs < SESSION_KEY_LIMITS_V1.ttlSecondsMin * 1000 || ttlMs > SESSION_KEY_LIMITS_V1.ttlSecondsMax * 1000) return fail('expiry_invalid', 'expiresAt');

  return {
    ok: true,
    value: {
      schemaVersion: SMART_ACCOUNT_SCHEMA_VERSION_V1,
      label,
      singleLimit: amounts[0],
      dailyLimit: amounts[1],
      monthlyLimit: amounts[2],
      targets: [...(v.targets as string[])],
      expiresAt: v.expiresAt,
    },
  };
}

/** A spend the Agent wants to make with its session key, checked before anything is signed. */
export interface SessionKeySpendV1 {
  target: string;
  amount: string;
}

/**
 * The same four rules the chain applies (`SpendingLimitValidator`): not revoked, not expired, target on the list, amount
 * within the single limit. Daily and monthly totals are the chain's to keep; the server checks them against its own
 * record only as a first stop. `null` means this check has nothing against it.
 */
export function sessionKeyStopsSpendV1(
  key: Pick<SessionKeyViewV1, 'status' | 'expiresAt' | 'targets' | 'singleLimit'>,
  spend: SessionKeySpendV1,
  nowMs: number,
): SmartAccountReasonCodeV1 | null {
  if (key.status === 'revoked') return 'revoked';
  if (key.status !== 'active' || Date.parse(key.expiresAt) <= nowMs) return 'expired';
  if (!isSmartAccountAddressV1(spend.target) || !key.targets.includes(spend.target)) return 'target_not_allowed';
  if (typeof spend.amount !== 'string' || !/^(0|[1-9][0-9]*)$/.test(spend.amount) || spend.amount.length > SESSION_KEY_LIMITS_V1.amountDigitsMax) return 'over_single_limit';
  if (spend.amount !== '0' && compareSmartAccountAmountsV1(spend.amount, key.singleLimit) > 0) return 'over_single_limit';
  return null;
}

/**
 * What a passkey approval is bound to. The browser signs a challenge made from this text, so an assertion given for one
 * spend cannot approve another: it names the account, the chain, the target, the amount and a digest of the call data.
 * Seven lines (domain, chain, account, target, amount, call data digest, approval reference), `\n` between them, no trailing newline. The challenge is `base64url(sha256(message))`, made by the server.
 */
export const SMART_ACCOUNT_APPROVAL_DOMAIN_V1 = 'agentrix.smart-account.approval.v1' as const;

export interface SmartAccountApprovalRequestV1 {
  chainId: SmartAccountChainIdV1;
  accountAddress: string;
  target: string;
  amount: string;
  /** `sha256:` + 64 lower-case hex of the call data ('0x' for a plain transfer). */
  callDataDigest: string;
  /** The server's one-time reference for this approval. */
  approvalRef: string;
}

export const SMART_ACCOUNT_APPROVAL_REF_PATTERN_V1 = /^saa_[0-9a-f]{32}$/;
const DIGEST_V1 = /^sha256:[0-9a-f]{64}$/;

/** Whether the feature is on and on which chain: the exact '1' for the switch AND an allowed testnet chain id. */
export type SmartAccountStatusV1 = { ok: true; chainId: SmartAccountChainIdV1 } | { ok: false; reasonCode: 'feature_disabled' | 'chain_not_configured' | 'chain_invalid' | 'chain_not_allowed' };

export function smartAccountStatusFromEnvV1(env: Readonly<Record<string, string | undefined>>): SmartAccountStatusV1 {
  if (env[SMART_ACCOUNT_V1_FLAG] !== '1') return { ok: false, reasonCode: 'feature_disabled' };
  return smartAccountChainFromEnvV1(env);
}

export const SESSION_KEY_ID_PATTERN_V1 = /^sk_[0-9a-f]{32}$/;
/** How long a spend approval stays open. */
export const SMART_ACCOUNT_APPROVAL_TTL_MS_V1 = 10 * 60 * 1000;

/** What the Agent (or the owner on its behalf) asks to pay with a session key. Native coin only, plain transfer. */
export interface SmartAccountSpendRequestV1 {
  schemaVersion: typeof SMART_ACCOUNT_SCHEMA_VERSION_V1;
  sessionKeyId: string;
  target: string;
  /** Decimal string of the chain's smallest unit, above zero. */
  amount: string;
}

export function decodeSmartAccountSpendRequestV1(value: unknown): SmartAccountDecodeResultV1<SmartAccountSpendRequestV1> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return fail('invalid_type', '$');
  const v = value as Record<string, unknown>;
  if (v.schemaVersion === undefined) return fail('missing_field', 'schemaVersion');
  if (v.schemaVersion !== SMART_ACCOUNT_SCHEMA_VERSION_V1) return fail('unsupported_schema_version', 'schemaVersion');
  for (const key of Object.keys(v)) if (!['schemaVersion', 'sessionKeyId', 'target', 'amount'].includes(key)) return fail('unknown_field', key);
  for (const key of ['sessionKeyId', 'target', 'amount'] as const) if (v[key] === undefined) return fail('missing_field', key);
  if (typeof v.sessionKeyId !== 'string') return fail('invalid_type', 'sessionKeyId');
  if (!SESSION_KEY_ID_PATTERN_V1.test(v.sessionKeyId)) return fail('invalid_value', 'sessionKeyId');
  if (typeof v.target !== 'string') return fail('invalid_type', 'target');
  if (!isSmartAccountAddressV1(v.target)) return fail('target_invalid', 'target');
  if (typeof v.amount !== 'string') return fail('invalid_type', 'amount');
  if (!AMOUNT_V1.test(v.amount) || v.amount.length > SESSION_KEY_LIMITS_V1.amountDigitsMax) return fail('invalid_value', 'amount');
  return { ok: true, value: { schemaVersion: SMART_ACCOUNT_SCHEMA_VERSION_V1, sessionKeyId: v.sessionKeyId, target: v.target, amount: v.amount } };
}

/** What the server gives the web page to ask for the passkey: the fields to show, and the challenge to sign. */
export interface SmartAccountApprovalStartV1 {
  schemaVersion: typeof SMART_ACCOUNT_SCHEMA_VERSION_V1;
  approvalRef: string;
  chainId: SmartAccountChainIdV1;
  chainLabel: string;
  accountAddress: string;
  target: string;
  amount: string;
  /** `base64url(sha256(message))`; the browser signs this, so the assertion is good for this spend only. */
  challenge: string;
  rpId: string;
  allowCredentialIds: string[];
  timeoutMs: number;
  expiresAt: string;
}

/** The browser's answer, all base64url without padding. */
export interface SmartAccountPasskeyAssertionV1 {
  credentialId: string;
  clientDataJSON: string;
  authenticatorData: string;
  signature: string;
}

export interface SmartAccountApprovalFinishV1 {
  schemaVersion: typeof SMART_ACCOUNT_SCHEMA_VERSION_V1;
  approvalRef: string;
  assertion: SmartAccountPasskeyAssertionV1;
}

const B64URL_V1 = /^[A-Za-z0-9_-]{1,2048}$/;

export function decodeSmartAccountApprovalFinishV1(value: unknown): SmartAccountDecodeResultV1<SmartAccountApprovalFinishV1> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return fail('invalid_type', '$');
  const v = value as Record<string, unknown>;
  if (v.schemaVersion === undefined) return fail('missing_field', 'schemaVersion');
  if (v.schemaVersion !== SMART_ACCOUNT_SCHEMA_VERSION_V1) return fail('unsupported_schema_version', 'schemaVersion');
  for (const key of Object.keys(v)) if (!['schemaVersion', 'approvalRef', 'assertion'].includes(key)) return fail('unknown_field', key);
  if (v.approvalRef === undefined) return fail('missing_field', 'approvalRef');
  if (v.assertion === undefined) return fail('missing_field', 'assertion');
  if (typeof v.approvalRef !== 'string') return fail('invalid_type', 'approvalRef');
  if (!SMART_ACCOUNT_APPROVAL_REF_PATTERN_V1.test(v.approvalRef)) return fail('invalid_value', 'approvalRef');
  if (typeof v.assertion !== 'object' || v.assertion === null || Array.isArray(v.assertion)) return fail('invalid_type', 'assertion');
  const a = v.assertion as Record<string, unknown>;
  const keys = ['credentialId', 'clientDataJSON', 'authenticatorData', 'signature'] as const;
  for (const key of Object.keys(a)) if (!(keys as readonly string[]).includes(key)) return fail('unknown_field', `assertion.${key}`);
  for (const key of keys) {
    if (a[key] === undefined) return fail('missing_field', `assertion.${key}`);
    if (typeof a[key] !== 'string') return fail('invalid_type', `assertion.${key}`);
    if (!B64URL_V1.test(a[key] as string)) return fail('invalid_value', `assertion.${key}`);
  }
  return {
    ok: true,
    value: {
      schemaVersion: SMART_ACCOUNT_SCHEMA_VERSION_V1,
      approvalRef: v.approvalRef,
      assertion: {
        credentialId: a.credentialId as string,
        clientDataJSON: a.clientDataJSON as string,
        authenticatorData: a.authenticatorData as string,
        signature: a.signature as string,
      },
    },
  };
}

export function smartAccountApprovalMessageV1(request: SmartAccountApprovalRequestV1): string | null {
  if (!smartAccountChainAllowedV1(request.chainId)) return null;
  if (!isSmartAccountAddressV1(request.accountAddress) || !isSmartAccountAddressV1(request.target)) return null;
  if (typeof request.amount !== 'string' || !/^(0|[1-9][0-9]*)$/.test(request.amount) || request.amount.length > SESSION_KEY_LIMITS_V1.amountDigitsMax) return null;
  if (typeof request.callDataDigest !== 'string' || !DIGEST_V1.test(request.callDataDigest)) return null;
  if (typeof request.approvalRef !== 'string' || !SMART_ACCOUNT_APPROVAL_REF_PATTERN_V1.test(request.approvalRef)) return null;
  return [SMART_ACCOUNT_APPROVAL_DOMAIN_V1, String(request.chainId), request.accountAddress, request.target, request.amount, `${request.callDataDigest}\n${request.approvalRef}`].join('\n');
}
