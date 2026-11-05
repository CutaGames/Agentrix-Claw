/**
 * L8-6 own wallet v1 (testnet only, every switch default off): the Agent's own ERC-4337 account (Kernel v3.1) whose root
 * key is the owner's wallet passkey on the wallet origin. Contract shared by the backend (`agent-own-wallet/`), the web
 * wallet origin, mobile and desktop.
 *
 * - Chains: BSC testnet 97 first, Base Sepolia 84532 second (E137). Mainnet chain ids are never in the allow-list; the
 *   mainnet branch of the paymaster rule exists as a rule only and nothing is configured for it (A13, A14).
 * - The status of an Agent's own wallet is computed only by `deriveOwnWalletStatusV1` (design 2.0); the backend puts the
 *   result into the card DTO and web / mobile read that field, they do not recompute it.
 * - Hashes, ABI encoding and CREATE2 need ethers and are not in this file (shared has no dependencies); each surface
 *   computes them itself and is pinned by `__fixtures__/agent-own-wallet-vectors.json`.
 * - Decoders refuse unknown fields and wrong types and answer `{ ok: false, reasonCode, field }`; read results as
 *   `x.ok === false`.
 */
export const AGENT_OWN_WALLET_SCHEMA_VERSION_V1 = 1 as const;

/** The only chains an own wallet may live on, 97 first (E137). A test pins that no mainnet is ever added. */
export const OWN_WALLET_CHAIN_IDS_V1 = [97, 84532] as const;
export type OwnWalletChainIdV1 = (typeof OWN_WALLET_CHAIN_IDS_V1)[number];

/** Mainnet chain ids that have rules written for them (paymaster required) but nothing configured. Never allowed. */
export const OWN_WALLET_MAINNET_RULE_CHAIN_IDS_V1 = [56, 8453] as const;

export function ownWalletChainAllowedV1(chainId: unknown): chainId is OwnWalletChainIdV1 {
  return typeof chainId === 'number' && (OWN_WALLET_CHAIN_IDS_V1 as readonly number[]).includes(chainId);
}

function isMainnetRuleChain(chainId: unknown): boolean {
  return typeof chainId === 'number' && (OWN_WALLET_MAINNET_RULE_CHAIN_IDS_V1 as readonly number[]).includes(chainId);
}

// Pinned contracts: addresses and runtime codehashes read on chain (S0 probe 10-29, facts/s0-probe-97.json).
export type OwnWalletModuleNameV1 =
  | 'entryPointV07'
  | 'kernelFactoryV31'
  | 'kernelImplementationV31'
  | 'factoryStaker'
  | 'webAuthnValidator'
  | 'smartSessions'
  | 'socialRecovery'
  | 'uniActionPolicy'
  | 'erc20SpendingLimitPolicy'
  | 'valueLimitPolicy'
  | 'timeFramePolicy'
  | 'usageLimitPolicy'
  | 'erc8004IdentityRegistryProxy'
  | 'erc8004IdentityRegistryImplementation';

export interface OwnWalletPinnedModuleV1 {
  name: OwnWalletModuleNameV1;
  /** Checksummed address; the same on 97 and 84532. */
  address: string;
  /**
   * keccak256 of the runtime code per chain. Equal on both chains except the Kernel implementation, whose code embeds
   * two chain-specific immutables (the cached EIP-712 domain separator and the cached chain id); with those two 32-byte
   * words zeroed the code is byte-identical on 97 and 84532 (facts/s0-kernel-impl-diff.json).
   */
  codehash: Readonly<Record<OwnWalletChainIdV1, string>>;
  /**
   * `official`: the vendor deployed it on that chain. `rehearsal_prep`: missing on 97; the rehearsal preparation step
   * deploys the vendor's initcode with the vendor's salt through the same CREATE2 deployer (E137).
   */
  deployedBy: Readonly<Record<OwnWalletChainIdV1, 'official' | 'rehearsal_prep'>>;
  /** For modules missing on 97: how the vendor deployed it on 84532 (read from the creation transaction). */
  create2?: { deployer: string; salt: string; initcodeHash: string };
}

const both = (hash: string): Readonly<Record<OwnWalletChainIdV1, string>> => ({ 97: hash, 84532: hash });
const OFFICIAL = { 97: 'official', 84532: 'official' } as const;
const PREP_ON_97 = { 97: 'rehearsal_prep', 84532: 'official' } as const;
/** Arachnid's deterministic deployment proxy; has code on 97 and 84532 (S0 probe check 4). */
export const OWN_WALLET_CREATE2_DEPLOYER_V1 = '0x4e59b44847b379578588920ca78fbf26c0b4956c';
const ZERO_SALT = '0x' + '0'.repeat(64);

export const OWN_WALLET_MODULES_V1: readonly OwnWalletPinnedModuleV1[] = [
  { name: 'entryPointV07', address: '0x0000000071727De22E5E9d8BAf0edAc6f37da032', codehash: both('0x8db5ff695839d655407cc8490bb7a5d82337a86a6b39c3f0258aa6c3b582fc58'), deployedBy: OFFICIAL },
  { name: 'kernelFactoryV31', address: '0xaac5D4240AF87249B3f71BC8E4A2cae074A3E419', codehash: both('0xeecde6f459d0ecadbd5b76e89de74d8187b52d5c71651fdfc007c45d4f2f3ca0'), deployedBy: OFFICIAL },
  {
    name: 'kernelImplementationV31',
    address: '0xBAC849bB641841b44E965fB01A4Bf5F074f84b4D',
    codehash: { 97: '0x3b9d21f26174ee17651b22c51ce5f6092f24bc707b50952acfb7ca42018440a9', 84532: '0x87dd715bf9aac751c41e503e73bab1028713f6be3e5e63b8d9c9de232d7b610d' },
    deployedBy: OFFICIAL,
  },
  { name: 'factoryStaker', address: '0xd703aaE79538628d27099B8c4f621bE4CCd142d5', codehash: both('0x4527f3642a53f1f4ce76beb05f955a8859b7245a1ff20da5be9a518d2fcd64aa'), deployedBy: OFFICIAL },
  { name: 'webAuthnValidator', address: '0x0000000000578c4cB0e472a5462da43C495C3F33', codehash: both('0x20e90e51e309aa65087d303221af3f4b32063a40fb8bfc8a80839b4b2e365f0b'), deployedBy: OFFICIAL },
  { name: 'smartSessions', address: '0x00000000008bDABA73cD9815d79069c247Eb4bDA', codehash: both('0x0a31363c38106cce18a3008234d95376a9f2f8bdc67976eab1d1f5ad3cc91b79'), deployedBy: OFFICIAL },
  { name: 'socialRecovery', address: '0xA04D053b3C8021e8D5bF641816c42dAA75D8b597', codehash: both('0x00124da53e4f8a7502466e1ffe06be4df5002e069e4847b5f55888e2af1a952f'), deployedBy: OFFICIAL },
  { name: 'uniActionPolicy', address: '0x0000006DDA6c463511C4e9B05CFc34C1247fCF1F', codehash: both('0xc58f13d259c69d0db90f611347535e2d5642f3352740b7d58fbf6e6b939670dd'), deployedBy: OFFICIAL },
  { name: 'erc20SpendingLimitPolicy', address: '0x00000088D48cF102A8Cdb0137A9b173f957c6343', codehash: both('0x63622e282e97d97c01523436de281b956d98b66ef8a9c6c28fbcc856d9b73512'), deployedBy: OFFICIAL },
  {
    name: 'valueLimitPolicy',
    address: '0x730DA93267E7E513e932301B47F2ac7D062abC83',
    codehash: both('0xc5efddfaf9a5fad8cb996f1fd03056926af11ebd4496a7a7758e2e4315a7865e'),
    deployedBy: PREP_ON_97,
    create2: { deployer: OWN_WALLET_CREATE2_DEPLOYER_V1, salt: ZERO_SALT, initcodeHash: '0xa3105522375b78cd093e19f11a5e4a3d2bd294213c16993678fbce220e8b3471' },
  },
  {
    name: 'timeFramePolicy',
    address: '0x8177451511dE0577b911C254E9551D981C26dc72',
    codehash: both('0xfe83529b2df328020b49b8e728f62e571e21a38b3b7e59e75d6c6629a38cd87c'),
    deployedBy: PREP_ON_97,
    create2: { deployer: OWN_WALLET_CREATE2_DEPLOYER_V1, salt: ZERO_SALT, initcodeHash: '0xb899a1eb98f5b4670f7715363d426c656ebc3af11f454b32c3e923324c07a88b' },
  },
  {
    name: 'usageLimitPolicy',
    address: '0x1F34eF8311345A3A4a4566aF321b313052F51493',
    codehash: both('0x1996dc03fa5ad5714c3a9a693239dfae75733efe7c27c1398e0c5df6f320aae9'),
    deployedBy: PREP_ON_97,
    create2: { deployer: OWN_WALLET_CREATE2_DEPLOYER_V1, salt: ZERO_SALT, initcodeHash: '0x89a82616b8f2e732852bf3719182e41dcf4a745f181922d008465cd9104372ef' },
  },
  { name: 'erc8004IdentityRegistryProxy', address: '0x8004A818BFB912233c491871b3d84c89A494BD9e', codehash: both('0xd0e45b1d89fa9b6cc7e97c1f155d64180e5c232aaccf9900ef9d4fd738c02b41'), deployedBy: OFFICIAL },
  { name: 'erc8004IdentityRegistryImplementation', address: '0x7274e874ca62410a93bd8bf61c69d8045e399c02', codehash: both('0xa5f9624ea85e45b3f4b8558581f03bfb3e6cefab278d7bf0500ec9bd065dc16f'), deployedBy: OFFICIAL },
];

export function ownWalletModuleV1(name: OwnWalletModuleNameV1): OwnWalletPinnedModuleV1 {
  const found = OWN_WALLET_MODULES_V1.find((m) => m.name === name);
  if (!found) throw new Error(`unknown own wallet module ${name}`);
  return found;
}

// Pinned tokens (A39 + E137): the only tokens an own wallet accepts from A2A. Anything else is refused.
export interface OwnWalletPinnedTokenV1 {
  symbol: 'USDT' | 'USDC';
  address: string;
  decimals: number;
}

export const OWN_WALLET_PINNED_TOKENS_V1: Readonly<Record<OwnWalletChainIdV1, OwnWalletPinnedTokenV1>> = {
  /** The BSC testnet USDT the platform already pays with (`economy-bsc-usdt-payer.ts` DEFAULT_TOKEN). */
  97: { symbol: 'USDT', address: '0x337610d27c682E347C9cD60BD4b3b107C9d34dDd', decimals: 18 },
  /** Circle USDC on Base Sepolia. */
  84532: { symbol: 'USDC', address: '0x036CbD53842c5426634e7929541eC2318f3dCF7e', decimals: 6 },
};

export function ownWalletTokenPinnedV1(chainId: unknown, token: unknown): boolean {
  if (!ownWalletChainAllowedV1(chainId) || typeof token !== 'string') return false;
  return token.toLowerCase() === OWN_WALLET_PINNED_TOKENS_V1[chainId].address.toLowerCase();
}

/**
 * A39 rule for the settlement stablecoin registry: an entry on a chain with a pinned token must name exactly that token
 * with the pinned decimals. Entries on other chains are not this rule's concern (true).
 */
export function stablecoinEntryMatchesOwnWalletPinV1(entry: { chainId: number; tokenAddress: string; tokenDecimals: number }): boolean {
  if (!ownWalletChainAllowedV1(entry.chainId)) return true;
  const pin = OWN_WALLET_PINNED_TOKENS_V1[entry.chainId];
  return typeof entry.tokenAddress === 'string' && entry.tokenAddress.toLowerCase() === pin.address.toLowerCase() && entry.tokenDecimals === pin.decimals;
}

// Status (design 2.0, coord 10-27). Pure functions, the same on every surface.
export const OWN_WALLET_STATUSES_V1 = ['none', 'pending', 'active', 'lost', 'owner_mismatch'] as const;
export type OwnWalletStatusV1 = (typeof OWN_WALLET_STATUSES_V1)[number];
/** What the card DTO carries: the pure status, or `unavailable` when it could not be read (fail closed). */
export type OwnWalletCardStatusV1 = OwnWalletStatusV1 | 'unavailable';
export const OWN_WALLET_CARD_STATUSES_V1: readonly OwnWalletCardStatusV1[] = [...OWN_WALLET_STATUSES_V1, 'unavailable'];

export type OwnWalletAccountRowStatusV1 = 'counterfactual' | 'deployed' | 'lost';

/** One 2160 `kind='agent'` row of this Agent, on any chain, lost rows included. */
export interface OwnWalletAccountRowV1 {
  chainId: number;
  status: OwnWalletAccountRowStatusV1;
  ownerUserId: string;
  /** `legacy_cutover_confirmed_at` is set. */
  legacyCutoverConfirmed: boolean;
  /** `own_wallet_activated_at` is set (write-once). */
  ownWalletActivated: boolean;
  /** `own_account_switched_at` is set (write-once). */
  ownAccountSwitched: boolean;
}

export interface OwnWalletStatusInputV1 {
  /** `AGENT_OWN_WALLET_CHAIN_ID`. */
  configuredChainId: number;
  /** `agent_accounts.owner_id`. */
  agentOwnerUserId: string;
  /** `hasLegacyCustodyV1(agent)`: `mpc_wallet_id` set, or the owner has any active MPC wallet. */
  hasLegacyCustody: boolean;
  /** The Agent has an old receiving / DID address (`mpcWalletId || externalWalletAddress`). */
  hasLegacyAddress: boolean;
  rows: readonly OwnWalletAccountRowV1[];
}

/** Thrown when the rows break the partial unique key (two non-lost rows on the configured chain). Callers fail closed. */
export class OwnWalletRowsInconsistentError extends Error {
  constructor() {
    super('own_wallet_rows_inconsistent');
    this.name = 'OwnWalletRowsInconsistentError';
  }
}

/**
 * Design 2.0 rules in order: owner_mismatch, none, lost, pending, active. Every input lands in exactly one status.
 * Once activated, a custody wallet written later does not move the status back to pending.
 */
export function deriveOwnWalletStatusV1(input: OwnWalletStatusInputV1): OwnWalletStatusV1 {
  const rows = input.rows;
  if (rows.length > 0 && rows.some((r) => r.ownerUserId !== input.agentOwnerUserId)) return 'owner_mismatch';
  if (rows.length === 0) return 'none';
  const current = rows.filter((r) => r.chainId === input.configuredChainId && r.status !== 'lost');
  if (current.length > 1) throw new OwnWalletRowsInconsistentError();
  if (current.length === 0) return 'lost';
  const n = current[0];
  const deployed = n.status === 'deployed';
  const activated = rows.some((r) => r.ownWalletActivated);
  if (!deployed || (input.hasLegacyCustody && !n.legacyCutoverConfirmed && !activated)) return 'pending';
  return 'active';
}

/** `hasOwnWallet` is exactly `active`; design section 2 and the share gate refer only to this. */
export function hasOwnWalletV1(input: OwnWalletStatusInputV1): boolean {
  return deriveOwnWalletStatusV1(input) === 'active';
}

/**
 * Whether the old custody payment paths are stopped. One-way: once activated (or cut over after deployment) it stays
 * stopped through loss, custody written back later and the main switch going off and on again.
 */
export function legacyCustodyStoppedV1(input: OwnWalletStatusInputV1): boolean {
  const status = deriveOwnWalletStatusV1(input);
  if (status === 'active' || status === 'owner_mismatch') return true;
  return input.rows.some((r) => r.ownWalletActivated || (r.status !== 'counterfactual' && r.legacyCutoverConfirmed));
}

/** T1 (A0.6): the DID and the receiving address have switched to the own account. Never switches back. */
export function ownAccountSwitchedV1(input: OwnWalletStatusInputV1): boolean {
  if (legacyCustodyStoppedV1(input)) return true;
  if (input.rows.some((r) => r.ownAccountSwitched)) return true;
  return !input.hasLegacyAddress && input.rows.length > 0;
}

// Execution mode (design W2.5 (d), R3-L6): the outer call and the ERC-7579 ExecMode are fixed.
export const EXEC_MODE_RULES_V1 = {
  /** `execute(bytes32,bytes)`. */
  outerSelector: '0xe9ae5c53',
  /** callType byte: single 0x00, batch 0x01. delegatecall 0xff and static 0xfe are refused. */
  callTypes: { single: '00', batch: '01' },
  /** execType byte: default 0x00 only (a failing batch item reverts the whole batch). try 0x01 is refused. */
  execTypes: { default: '00' },
  /** The other 30 bytes of the mode are zero. */
  reservedBytes: 30,
  /** Session UserOps may only be single. */
  sessionCallTypes: ['00'],
  /** The only self-call (`target == sender`) allowed in a root UserOp: install SocialRecovery as a validator. */
  allowedSelfCalls: [
    { selector: '0x9517e29f', moduleTypeId: 1, module: '0xA04D053b3C8021e8D5bF641816c42dAA75D8b597', purposes: ['deploy_setup', 'install_recovery'] },
    // S7: the owner's root UserOp that installs SmartSessions with one device session (UNSAFE_ENABLE install data).
    { selector: '0x9517e29f', moduleTypeId: 1, module: '0x00000000008bDABA73cD9815d79069c247Eb4bDA', purposes: ['grant_session'] },
  ],
} as const;

export type OwnWalletExecModeProblemV1 =
  | 'calldata_malformed'
  | 'outer_selector_not_allowed'
  | 'call_type_not_allowed'
  | 'exec_type_not_allowed'
  | 'mode_reserved_nonzero'
  | 'session_batch_not_allowed';

const HEX_BYTES = /^0x(?:[0-9a-fA-F]{2})*$/;

/** Checks the outer selector and ExecMode of a UserOp's callData. `null` means allowed. */
export function execModeProblemV1(callData: unknown, options: { session: boolean }): OwnWalletExecModeProblemV1 | null {
  if (typeof callData !== 'string' || !HEX_BYTES.test(callData)) return 'calldata_malformed';
  const hex = callData.slice(2).toLowerCase();
  if (hex.length < 8) return 'calldata_malformed';
  if ('0x' + hex.slice(0, 8) !== EXEC_MODE_RULES_V1.outerSelector) return 'outer_selector_not_allowed';
  // selector + mode + offset + length of the `bytes` argument
  if (hex.length < 2 * (4 + 32 + 32 + 32)) return 'calldata_malformed';
  const mode = hex.slice(8, 8 + 64);
  const callType = mode.slice(0, 2);
  if (callType !== EXEC_MODE_RULES_V1.callTypes.single && callType !== EXEC_MODE_RULES_V1.callTypes.batch) return 'call_type_not_allowed';
  if (mode.slice(2, 4) !== EXEC_MODE_RULES_V1.execTypes.default) return 'exec_type_not_allowed';
  if (!/^0+$/.test(mode.slice(4))) return 'mode_reserved_nonzero';
  if (options.session && !(EXEC_MODE_RULES_V1.sessionCallTypes as readonly string[]).includes(callType)) return 'session_batch_not_allowed';
  return null;
}

// Paymaster and gas caps (design 7.3, R2-M10, R3-L2, A14): per chain.
/** Pinned mainnet paymasters. Empty on purpose: no mainnet paymaster is configured (A14, F section). */
export const OWN_WALLET_MAINNET_PAYMASTER_PINS_V1: Readonly<Record<string, string>> = {};

export type OwnWalletPaymasterProblemV1 =
  | 'paymaster_data_malformed'
  | 'paymaster_not_allowed_on_testnet'
  | 'paymaster_not_configured'
  | 'paymaster_required'
  | 'paymaster_mismatch'
  | 'chain_not_allowed';

/**
 * Testnets: `paymasterAndData` must be empty (`0x`). Mainnet rule chains: it must be non-empty and its first 20 bytes
 * must equal the pinned paymaster; a mainnet chain without a pin is refused. Any other chain is refused.
 */
export function paymasterProblemV1(
  chainId: unknown,
  paymasterAndData: unknown,
  pins: Readonly<Record<string, string>> | null = OWN_WALLET_MAINNET_PAYMASTER_PINS_V1,
): OwnWalletPaymasterProblemV1 | null {
  if (typeof paymasterAndData !== 'string' || !HEX_BYTES.test(paymasterAndData)) return 'paymaster_data_malformed';
  if (ownWalletChainAllowedV1(chainId)) return paymasterAndData === '0x' ? null : 'paymaster_not_allowed_on_testnet';
  if (!isMainnetRuleChain(chainId)) return 'chain_not_allowed';
  const pin = pins ? pins[String(chainId)] : undefined;
  if (typeof pin !== 'string' || !/^0x[0-9a-fA-F]{40}$/.test(pin)) return 'paymaster_not_configured';
  if (paymasterAndData === '0x') return 'paymaster_required';
  if (paymasterAndData.length < 42 || paymasterAndData.slice(0, 42).toLowerCase() !== pin.toLowerCase()) return 'paymaster_mismatch';
  return null;
}

export interface OwnWalletGasCapsV1 {
  verificationGasLimit: string;
  callGasLimit: string;
  preVerificationGas: string;
  maxFeePerGas: string;
  maxPriorityFeePerGas: string;
  /** (verificationGasLimit + callGasLimit + preVerificationGas) x maxFeePerGas, in wei of the native coin. */
  maxTotalFeeWei: string;
}

/** Initial caps (design 7.3); S4 tunes them from rehearsal measurements. Mainnet chains have none on purpose. */
export const OWN_WALLET_GAS_CAPS_V1: Readonly<Record<OwnWalletChainIdV1, OwnWalletGasCapsV1>> = {
  97: { verificationGasLimit: '2000000', callGasLimit: '1000000', preVerificationGas: '1000000', maxFeePerGas: '5000000000', maxPriorityFeePerGas: '2000000000', maxTotalFeeWei: '20000000000000000' },
  84532: { verificationGasLimit: '2000000', callGasLimit: '1000000', preVerificationGas: '1000000', maxFeePerGas: '5000000000', maxPriorityFeePerGas: '1000000000', maxTotalFeeWei: '20000000000000000' },
};

export interface OwnWalletUserOpGasV1 {
  verificationGasLimit: string;
  callGasLimit: string;
  preVerificationGas: string;
  maxFeePerGas: string;
  maxPriorityFeePerGas: string;
}

export type OwnWalletGasProblemV1 = 'gas_caps_not_configured' | 'gas_value_invalid' | 'gas_limits_exceeded';

const DECIMAL = /^(0|[1-9][0-9]{0,77})$/;
const GAS_FIELDS: readonly (keyof OwnWalletUserOpGasV1)[] = ['verificationGasLimit', 'callGasLimit', 'preVerificationGas', 'maxFeePerGas', 'maxPriorityFeePerGas'];

/** `null` when every gas field is a decimal string within this chain's caps. Mainnet and unknown chains are refused. */
export function gasCapsProblemV1(chainId: unknown, gas: OwnWalletUserOpGasV1): OwnWalletGasProblemV1 | null {
  if (!ownWalletChainAllowedV1(chainId)) return 'gas_caps_not_configured';
  const caps = OWN_WALLET_GAS_CAPS_V1[chainId];
  for (const field of GAS_FIELDS) {
    const value: unknown = gas ? gas[field] : undefined;
    if (typeof value !== 'string' || !DECIMAL.test(value)) return 'gas_value_invalid';
  }
  const v = (field: keyof OwnWalletUserOpGasV1): bigint => BigInt(gas[field]);
  for (const field of GAS_FIELDS) if (v(field) > BigInt(caps[field])) return 'gas_limits_exceeded';
  if (v('maxPriorityFeePerGas') > v('maxFeePerGas')) return 'gas_limits_exceeded';
  const total = (v('verificationGasLimit') + v('callGasLimit') + v('preVerificationGas')) * v('maxFeePerGas');
  if (total > BigInt(caps.maxTotalFeeWei)) return 'gas_limits_exceeded';
  return null;
}

// Guardians (R3-M2) and salt (W1.1, W1.3, R3-L4).
export const OWN_WALLET_GUARDIANS_MAX_V1 = 16;

export type OwnWalletGuardianProblemV1 = 'guardian_list_empty' | 'guardian_list_too_long' | 'guardian_address_invalid' | 'guardian_zero_address' | 'guardian_duplicate';

const LOWER_ADDRESS = /^0x[0-9a-f]{40}$/;
const ZERO_ADDRESS = '0x' + '0'.repeat(40);

/** A guardian list is 1-16 distinct, non-zero, lower-case addresses. `null` means valid. */
export function guardianListProblemV1(list: unknown): OwnWalletGuardianProblemV1 | null {
  if (!Array.isArray(list) || list.length === 0) return 'guardian_list_empty';
  if (list.length > OWN_WALLET_GUARDIANS_MAX_V1) return 'guardian_list_too_long';
  const seen = new Set<string>();
  for (const item of list) {
    if (typeof item !== 'string' || !LOWER_ADDRESS.test(item)) return 'guardian_address_invalid';
    if (item === ZERO_ADDRESS) return 'guardian_zero_address';
    if (seen.has(item)) return 'guardian_duplicate';
    seen.add(item);
  }
  return null;
}

/** Ascending by 20-byte value, duplicates dropped. For lower-case fixed-width hex the value order is the string order. */
export function sortGuardiansV1(list: readonly string[]): string[] {
  return Array.from(new Set(list.map((a) => a.toLowerCase()))).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}

export const OWN_WALLET_ACCOUNT_KINDS_V1 = ['agent', 'owner_vault'] as const;
export type OwnWalletAccountKindV1 = (typeof OWN_WALLET_ACCOUNT_KINDS_V1)[number];

/** Salt prefixes. The salt never contains a platform id (R3-L4); the index is per owner, per chain, per kind. */
export const OWN_WALLET_SALT_PREFIXES_V1: Readonly<Record<OwnWalletAccountKindV1, string>> = {
  agent: 'agentrix.agent.v1',
  owner_vault: 'agentrix.vault.v1',
};
export const OWN_WALLET_SALT_INDEX_MAX_V1 = 4294967295;

/** `abi.encodePacked(prefix, uint32 saltIndex)` as 0x hex; the salt is keccak256 of it (computed by each surface). */
export function ownWalletSaltPreimageV1(kind: OwnWalletAccountKindV1, saltIndex: number): string {
  if (!Number.isInteger(saltIndex) || saltIndex < 0 || saltIndex > OWN_WALLET_SALT_INDEX_MAX_V1) throw new Error('salt_index_invalid');
  const prefix = OWN_WALLET_SALT_PREFIXES_V1[kind];
  if (typeof prefix !== 'string') throw new Error('salt_kind_invalid');
  let hex = '0x';
  for (let i = 0; i < prefix.length; i += 1) hex += prefix.charCodeAt(i).toString(16).padStart(2, '0');
  return hex + saltIndex.toString(16).padStart(8, '0');
}

/** Card DTO `wallet.label` (R3-L3). */
export const OWN_WALLET_LABELS_V1 = ['own_account', 'legacy_custody', 'external'] as const;
export type OwnWalletLabelV1 = (typeof OWN_WALLET_LABELS_V1)[number];

/**
 * Card DTO `ownWallet` (design 7.1 R-b, R6-L2). Present only with `AGENT_OWN_WALLET_V1_ENABLED=1`; with the switch off
 * the card has no such key. The address is a counterfactual / deployed account address: the main site shows only its
 * short form until the wallet origin checked it on this device (W1.2).
 */
export interface OwnWalletCardV1 {
  status: OwnWalletCardStatusV1;
  /**
   * `pending` / `active`: the live account on the configured chain. `lost`: the newest lost account, shown greyed out
   * (no copy, no deposit, design 5.5). Absent for `none`, `owner_mismatch`, `unavailable`.
   */
  chainId?: number;
  accountAddress?: string;
  accountStatus?: OwnWalletAccountRowStatusV1;
  explorerUrl?: string;
  /** Read from the chain; absent when there is no account or the read failed (then `balancesStale` is true). */
  balances?: { native: { symbol: string; wei: string }; token: { symbol: string; address: string; decimals: number; amount: string } };
  balancesStale?: boolean;
  /**
   * S11a: what the chain says about recovery (SocialRecovery installed and the guardian list not empty), `pending` /
   * `active` only. Absent when the read failed or was not made: the card then says nothing about recovery, never
   * "not set".
   */
  recovery?: { enabled: boolean };
}

/** The old wallet of an Agent that has an own wallet: shown as a separate line, never as the Agent's wallet. */
export interface OwnWalletLegacyCustodyV1 {
  type: 'mpc' | 'external';
  address: string;
  label: Exclude<OwnWalletLabelV1, 'own_account'>;
}

/**
 * The old wallet line (R-b, design 2.0 key): the Agent's `mpcWalletId`, else the owner's active MPC wallet (the one the
 * old payment paths sign with), else the external wallet the owner connected; `null` when there is none. Only the
 * MPC sources are "legacy custody (the platform can move it)"; an external wallet is labelled `external` (R3-L3).
 */
export function legacyCustodyOfV1(
  agent: { mpcWalletId?: string | null; externalWalletAddress?: string | null },
  ownerCustodyAddress?: string | null,
): OwnWalletLegacyCustodyV1 | null {
  if (typeof agent.mpcWalletId === 'string' && agent.mpcWalletId.length > 0) return { type: 'mpc', address: agent.mpcWalletId, label: 'legacy_custody' };
  if (typeof ownerCustodyAddress === 'string' && ownerCustodyAddress.length > 0) return { type: 'mpc', address: ownerCustodyAddress, label: 'legacy_custody' };
  if (typeof agent.externalWalletAddress === 'string' && agent.externalWalletAddress.length > 0) return { type: 'external', address: agent.externalWalletAddress, label: 'external' };
  return null;
}

/**
 * Share gate G, the server part (design 6a (iii)): condition 1 (`hasOwnWallet`, status `active`) and condition 2 (the
 * ERC-8004 registration confirmed and re-checked on chain, S8b). Condition 3 (this device checked the address) is the
 * client's. `registrationOpen` false means the registration switch is off: the client shows appendix C item 16.
 */
export interface OwnWalletShareGateV1 {
  ownWalletActive: boolean;
  registrationConfirmed: boolean;
  registrationOpen: boolean;
}

/** Both server conditions of G hold. The share button still needs the client's device check. */
export function shareGateServerSatisfiedV1(gate: OwnWalletShareGateV1): boolean {
  return gate.ownWalletActive === true && gate.registrationConfirmed === true && gate.registrationOpen === true;
}

// `GET /api/agent-own-wallet/summary` (web onboarding, agent-account page, T9 task panel, mobile).
export const OWN_WALLET_REGISTRATION_SUMMARY_V1 = ['none', 'submitted', 'confirmed', 'revoked', 'failed'] as const;
export type OwnWalletRegistrationSummaryV1 = (typeof OWN_WALLET_REGISTRATION_SUMMARY_V1)[number];

export interface OwnWalletSummaryAgentV1 {
  agentId: string;
  ownWalletStatus: OwnWalletCardStatusV1;
  registration: OwnWalletRegistrationSummaryV1;
  /** `null` on chains without EAS (97, E137): no certificate line is shown at all. */
  easCertificate: boolean | null;
}

export interface OwnWalletSummaryV1 {
  agents: OwnWalletSummaryAgentV1[];
}

export type OwnWalletDecodeReasonV1 = 'invalid_type' | 'unknown_field' | 'missing_field' | 'invalid_value';
export type OwnWalletDecodeResultV1<T> = { ok: true; value: T } | { ok: false; reasonCode: OwnWalletDecodeReasonV1; field: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const isPlainObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const fail = (reasonCode: OwnWalletDecodeReasonV1, field: string): { ok: false; reasonCode: OwnWalletDecodeReasonV1; field: string } => ({ ok: false, reasonCode, field });

/** Strict decoder for the summary response; at most 500 Agents. */
export function decodeOwnWalletSummaryV1(value: unknown): OwnWalletDecodeResultV1<OwnWalletSummaryV1> {
  if (!isPlainObject(value)) return fail('invalid_type', '$');
  for (const key of Object.keys(value)) if (key !== 'agents') return fail('unknown_field', key);
  if (!('agents' in value)) return fail('missing_field', 'agents');
  const list = value.agents;
  if (!Array.isArray(list) || list.length > 500) return fail('invalid_type', 'agents');
  const agents: OwnWalletSummaryAgentV1[] = [];
  const keys = ['agentId', 'ownWalletStatus', 'registration', 'easCertificate'];
  for (let i = 0; i < list.length; i += 1) {
    const item: unknown = list[i];
    const at = `agents[${i}]`;
    if (!isPlainObject(item)) return fail('invalid_type', at);
    for (const key of Object.keys(item)) if (!keys.includes(key)) return fail('unknown_field', `${at}.${key}`);
    for (const key of keys) if (!(key in item)) return fail('missing_field', `${at}.${key}`);
    const { agentId, ownWalletStatus, registration, easCertificate } = item;
    if (typeof agentId !== 'string' || !UUID.test(agentId)) return fail('invalid_value', `${at}.agentId`);
    if (typeof ownWalletStatus !== 'string' || !(OWN_WALLET_CARD_STATUSES_V1 as readonly string[]).includes(ownWalletStatus)) return fail('invalid_value', `${at}.ownWalletStatus`);
    if (typeof registration !== 'string' || !(OWN_WALLET_REGISTRATION_SUMMARY_V1 as readonly string[]).includes(registration)) return fail('invalid_value', `${at}.registration`);
    if (easCertificate !== null && typeof easCertificate !== 'boolean') return fail('invalid_type', `${at}.easCertificate`);
    const eas: boolean | null = easCertificate === null ? null : easCertificate === true;
    agents.push({ agentId, ownWalletStatus: ownWalletStatus as OwnWalletCardStatusV1, registration: registration as OwnWalletRegistrationSummaryV1, easCertificate: eas });
  }
  return { ok: true, value: { agents } };
}

/**
 * S7: the local intent I of `grant_session`, as the desktop puts it in the wallet origin link
 * (`#ref=…&t=…&intent=<base64url(JSON)>`, never in a request). It is the `params` of `POST /userops` plus `v`, `purpose`
 * and the Agent id; the wallet origin compares what it decodes from the UserOp with it, and with its own record L.
 * The desktop's per-day limit is deliberately not here: it stays on that computer. Numbers are decimal strings except
 * `validUntil` (unix seconds) and `maxCount`.
 */
export interface OwnWalletGrantSessionIntentV1 {
  v: 1;
  purpose: 'grant_session';
  agentId?: string;
  deviceId: string;
  sessionPubKeyX: string;
  sessionPubKeyY: string;
  validUntil: number;
  native?: { payee: string; perTxWei: string; totalWei: string; maxCount: number };
  token?: { payee: string; perTransfer: string; total: string };
}

/**
 * S11a (A3 fallback, coord 10-31): the owner's view of one device-signed payment
 * (`GET /api/agent-own-wallet/sessions/payments?accountId=`, web and desktop). The device signs it with its session key;
 * when it has not within 15 minutes the request expires and nothing was sent (`device_offline`). Nothing falls back by
 * itself: the owner may approve the same payment with the wallet passkey, which is a NEW root `transfer` request they
 * start (`POST /userops`, purpose `transfer`, params `{ to, amount, asset }`).
 */
export const OWN_WALLET_SESSION_PAYMENT_OUTCOMES_V1 = ['waiting_device', 'device_offline', 'submitted', 'confirmed', 'failed'] as const;
export type OwnWalletSessionPaymentOutcomeV1 = (typeof OWN_WALLET_SESSION_PAYMENT_OUTCOMES_V1)[number];

export interface OwnWalletSessionPaymentViewV1 {
  requestRef: string;
  chainId: number;
  asset: 'native' | 'token';
  /** Lower-case address. */
  to: string;
  /** Decimal string, in wei or the pinned token's smallest unit. */
  amount: string;
  outcome: OwnWalletSessionPaymentOutcomeV1;
  txHash: string | null;
  expiresAt: string;
}

/** The outcome of a stored request state; `null` for a state a device-signed payment never has. */
export function sessionPaymentOutcomeV1(state: unknown): OwnWalletSessionPaymentOutcomeV1 | null {
  switch (state) {
    case 'pending':
      return 'waiting_device';
    case 'expired':
      return 'device_offline';
    case 'signed':
    case 'submitted':
      return 'submitted';
    case 'confirmed':
      return 'confirmed';
    case 'reverted':
    case 'failed':
      return 'failed';
    default:
      return null;
  }
}

const SESSION_PAYMENT_REF = /^owr_[0-9a-f]{32}$/;
const SESSION_PAYMENT_ADDRESS = /^0x[0-9a-f]{40}$/;
const SESSION_PAYMENT_AMOUNT = /^[1-9][0-9]{0,77}$/;
const SESSION_PAYMENT_TX = /^0x[0-9a-f]{64}$/;

/** Strict decoder for `{ payments: [...] }`; at most 50 payments, testnet chains only. */
export function decodeOwnWalletSessionPaymentsV1(value: unknown): OwnWalletDecodeResultV1<{ payments: OwnWalletSessionPaymentViewV1[] }> {
  if (!isPlainObject(value)) return fail('invalid_type', '$');
  for (const key of Object.keys(value)) if (key !== 'payments') return fail('unknown_field', key);
  const list = value.payments;
  if (!Array.isArray(list) || list.length > 50) return fail('invalid_type', 'payments');
  const keys = ['requestRef', 'chainId', 'asset', 'to', 'amount', 'outcome', 'txHash', 'expiresAt'];
  const payments: OwnWalletSessionPaymentViewV1[] = [];
  for (let i = 0; i < list.length; i += 1) {
    const item: unknown = list[i];
    const at = `payments[${i}]`;
    if (!isPlainObject(item)) return fail('invalid_type', at);
    for (const key of Object.keys(item)) if (!keys.includes(key)) return fail('unknown_field', `${at}.${key}`);
    for (const key of keys) if (!(key in item)) return fail('missing_field', `${at}.${key}`);
    const { requestRef, chainId, asset, to, amount, outcome, txHash, expiresAt } = item;
    if (typeof requestRef !== 'string' || !SESSION_PAYMENT_REF.test(requestRef)) return fail('invalid_value', `${at}.requestRef`);
    if (typeof chainId !== 'number' || !ownWalletChainAllowedV1(chainId)) return fail('invalid_value', `${at}.chainId`);
    if (asset !== 'native' && asset !== 'token') return fail('invalid_value', `${at}.asset`);
    if (typeof to !== 'string' || !SESSION_PAYMENT_ADDRESS.test(to)) return fail('invalid_value', `${at}.to`);
    if (typeof amount !== 'string' || !SESSION_PAYMENT_AMOUNT.test(amount)) return fail('invalid_value', `${at}.amount`);
    if (typeof outcome !== 'string' || !(OWN_WALLET_SESSION_PAYMENT_OUTCOMES_V1 as readonly string[]).includes(outcome)) return fail('invalid_value', `${at}.outcome`);
    if (txHash !== null && (typeof txHash !== 'string' || !SESSION_PAYMENT_TX.test(txHash))) return fail('invalid_value', `${at}.txHash`);
    if (typeof expiresAt !== 'string' || !Number.isFinite(Date.parse(expiresAt))) return fail('invalid_value', `${at}.expiresAt`);
    payments.push({ requestRef, chainId, asset: asset as 'native' | 'token', to, amount, outcome: outcome as OwnWalletSessionPaymentOutcomeV1, txHash: txHash as string | null, expiresAt });
  }
  return { ok: true, value: { payments } };
}
