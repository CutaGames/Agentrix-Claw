/**
 * L8-6 own wallet, web side: ERC-4337 v0.7 UserOp forms and hash (design W2.5 (a)-(c), 7.3 wallet routes). Pure
 * functions over ethers; no key, no network.
 *
 * - `OwnWalletUserOpV1` is the unpacked RPC form `GET /wallet-requests/:ref` returns (the backend's 2167 `user_op`):
 *   numbers are decimal strings, byte strings lower-case 0x hex, `signature` is `0x` (unsigned).
 * - `ownWalletUserOpHashV1` is EntryPoint v0.7 `getUserOpHash`. The wallet origin computes it itself and signs its 32
 *   raw bytes; a hash or challenge the server sends is never used (a server hash that differs is a refusal).
 *   Pinned by the `userOpHash` vectors, whose expected values came from `eth_call EntryPoint.getUserOpHash` on 97 and
 *   84532 (S2), not from this file.
 * - `decodeWalletRequestV1` is strict: unknown fields are refused, except the fields a server might add that this
 *   page deliberately never reads (`challenge`, `rpId`, `allowCredentials`, `intent`); those are dropped.
 */
import { AbiCoder, concat, getAddress, keccak256, solidityPacked } from 'ethers';
import { ownWalletChainAllowedV1, ownWalletModuleV1, type OwnWalletChainIdV1 } from '../../../shared/types/agent-own-wallet';

export const OWN_WALLET_ENTRY_POINT_V1 = ownWalletModuleV1('entryPointV07').address.toLowerCase();

/** The purposes the backend can assemble (2167 `purpose`, design 7.3). */
export const OWN_WALLET_PURPOSES_V1 = [
  'deploy_setup',
  'install_recovery',
  'register',
  'revoke_registration',
  'grant_session',
  'revoke_session',
  'add_credential',
  'remove_credential',
  'set_guardians',
  'transfer',
  'recover',
] as const;
export type OwnWalletPurposeV1 = (typeof OWN_WALLET_PURPOSES_V1)[number];

export interface OwnWalletUserOpV1 {
  sender: string;
  nonce: string;
  /** `null` once the account is deployed. */
  factory: string | null;
  factoryData: string;
  callData: string;
  callGasLimit: string;
  verificationGasLimit: string;
  preVerificationGas: string;
  maxFeePerGas: string;
  maxPriorityFeePerGas: string;
  paymaster: string | null;
  paymasterVerificationGasLimit: string;
  paymasterPostOpGasLimit: string;
  paymasterData: string;
  signature: string;
}

export interface OwnWalletPackedUserOpV1 {
  sender: string;
  nonce: bigint;
  initCode: string;
  callData: string;
  accountGasLimits: string;
  preVerificationGas: bigint;
  gasFees: string;
  paymasterAndData: string;
  signature: string;
}

export type OwnWalletFormResultV1<T> = { ok: true; value: T } | { ok: false; reasonCode: string; field: string };

const USER_OP_FIELDS: readonly (keyof OwnWalletUserOpV1)[] = [
  'sender',
  'nonce',
  'factory',
  'factoryData',
  'callData',
  'callGasLimit',
  'verificationGasLimit',
  'preVerificationGas',
  'maxFeePerGas',
  'maxPriorityFeePerGas',
  'paymaster',
  'paymasterVerificationGasLimit',
  'paymasterPostOpGasLimit',
  'paymasterData',
  'signature',
];
const BYTES_FIELDS = ['factoryData', 'callData', 'paymasterData', 'signature'];
const DECIMAL = /^(0|[1-9][0-9]{0,77})$/;
const HEX = /^0x(?:[0-9a-f]{2})*$/;
const ADDRESS = /^0x[0-9a-f]{40}$/;
const UINT128_MAX = (BigInt(1) << BigInt(128)) - BigInt(1);
const UINT256_MAX = (BigInt(1) << BigInt(256)) - BigInt(1);
const MAX_HEX_CHARS = 2 + 2 * 64 * 1024;
const coder = AbiCoder.defaultAbiCoder();

const isPlainObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const refuse = (reasonCode: string, field: string): { ok: false; reasonCode: string; field: string } => ({ ok: false, reasonCode, field });

/** Strict check of the RPC form: no unknown field, lower-case hex, decimal numbers in range, unsigned. */
export function checkOwnWalletUserOpV1(value: unknown): OwnWalletFormResultV1<OwnWalletUserOpV1> {
  if (!isPlainObject(value)) return refuse('userop_malformed', 'userOp');
  for (const key of Object.keys(value)) if (!(USER_OP_FIELDS as readonly string[]).includes(key)) return refuse('userop_malformed', `userOp.${key}`);
  for (const field of USER_OP_FIELDS) {
    const v = value[field];
    const at = `userOp.${field}`;
    if (field === 'factory' || field === 'paymaster') {
      if (v !== null && (typeof v !== 'string' || !ADDRESS.test(v))) return refuse('userop_malformed', at);
    } else if (field === 'sender') {
      if (typeof v !== 'string' || !ADDRESS.test(v)) return refuse('userop_malformed', at);
    } else if (BYTES_FIELDS.includes(field)) {
      if (typeof v !== 'string' || !HEX.test(v) || v.length > MAX_HEX_CHARS) return refuse('userop_malformed', at);
    } else {
      if (typeof v !== 'string' || !DECIMAL.test(v)) return refuse('userop_malformed', at);
      const limit = field === 'nonce' || field === 'preVerificationGas' ? UINT256_MAX : UINT128_MAX;
      if (BigInt(v) > limit) return refuse('userop_malformed', at);
    }
  }
  const op = value as unknown as OwnWalletUserOpV1;
  if (op.factory === null && op.factoryData !== '0x') return refuse('userop_malformed', 'userOp.factoryData');
  if (op.paymaster === null && (op.paymasterData !== '0x' || op.paymasterVerificationGasLimit !== '0' || op.paymasterPostOpGasLimit !== '0')) {
    return refuse('userop_malformed', 'userOp.paymaster');
  }
  if (op.signature !== '0x') return refuse('userop_already_signed', 'userOp.signature');
  return { ok: true, value: { ...op } };
}

/** `paymasterAndData` of the packed form: `0x` without a paymaster. */
export function paymasterAndDataOfV1(op: OwnWalletUserOpV1): string {
  if (op.paymaster === null) return '0x';
  return concat([
    op.paymaster,
    solidityPacked(['uint128', 'uint128'], [BigInt(op.paymasterVerificationGasLimit), BigInt(op.paymasterPostOpGasLimit)]),
    op.paymasterData,
  ]).toLowerCase();
}

/** RPC form → the packed form EntryPoint v0.7 hashes. The input must have passed `checkOwnWalletUserOpV1`. */
export function packOwnWalletUserOpV1(op: OwnWalletUserOpV1): OwnWalletPackedUserOpV1 {
  return {
    sender: op.sender,
    nonce: BigInt(op.nonce),
    initCode: op.factory === null ? '0x' : concat([op.factory, op.factoryData]).toLowerCase(),
    callData: op.callData,
    accountGasLimits: solidityPacked(['uint128', 'uint128'], [BigInt(op.verificationGasLimit), BigInt(op.callGasLimit)]).toLowerCase(),
    preVerificationGas: BigInt(op.preVerificationGas),
    gasFees: solidityPacked(['uint128', 'uint128'], [BigInt(op.maxPriorityFeePerGas), BigInt(op.maxFeePerGas)]).toLowerCase(),
    paymasterAndData: paymasterAndDataOfV1(op),
    signature: op.signature,
  };
}

/** EntryPoint v0.7 `getUserOpHash`: keccak256(abi.encode(keccak256(pack(userOp without signature)), entryPoint, chainId)). */
export function ownWalletUserOpHashV1(packed: OwnWalletPackedUserOpV1, entryPoint: string, chainId: number): string {
  const inner = coder.encode(
    ['address', 'uint256', 'bytes32', 'bytes32', 'bytes32', 'uint256', 'bytes32', 'bytes32'],
    [
      getAddress(packed.sender),
      packed.nonce,
      keccak256(packed.initCode),
      keccak256(packed.callData),
      packed.accountGasLimits,
      packed.preVerificationGas,
      packed.gasFees,
      keccak256(packed.paymasterAndData),
    ],
  );
  return keccak256(coder.encode(['bytes32', 'address', 'uint256'], [keccak256(inner), getAddress(entryPoint), chainId])).toLowerCase();
}

/** What the wallet origin reads for one request. There is no challenge: the page hashes `userOp` itself. */
export interface OwnWalletWalletRequestV1 {
  userOp: OwnWalletUserOpV1;
  entryPoint: string;
  chainId: OwnWalletChainIdV1;
  purpose: OwnWalletPurposeV1;
  accountAddress: string;
  expiresAt: string;
  /** Only to compare: a server hash that differs from the local one refuses the request (W2.5 (c)). */
  serverUserOpHash: string | null;
}

const REQUEST_FIELDS = ['userOp', 'entryPoint', 'chainId', 'purpose', 'accountAddress', 'expiresAt', 'userOpHash'];
/** Fields a server might add that the page never reads (W2.5 (c), H2: the RP ID and challenge are local only). */
export const OWN_WALLET_IGNORED_SERVER_FIELDS_V1 = ['challenge', 'rpId', 'allowCredentials', 'intent'] as const;
const HASH = /^0x[0-9a-f]{64}$/;
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;

/** Strict decoder for `GET /api/agent-own-wallet/wallet-requests/:ref`. */
export function decodeWalletRequestV1(value: unknown): OwnWalletFormResultV1<OwnWalletWalletRequestV1> {
  if (!isPlainObject(value)) return refuse('request_malformed', '$');
  for (const key of Object.keys(value)) {
    if (REQUEST_FIELDS.includes(key)) continue;
    if ((OWN_WALLET_IGNORED_SERVER_FIELDS_V1 as readonly string[]).includes(key)) continue;
    return refuse('request_malformed', key);
  }
  for (const key of ['userOp', 'entryPoint', 'chainId', 'purpose', 'accountAddress', 'expiresAt']) if (!(key in value)) return refuse('request_malformed', key);
  const op = checkOwnWalletUserOpV1(value.userOp);
  if (op.ok === false) return op;
  const entryPoint = value.entryPoint;
  if (typeof entryPoint !== 'string' || !/^0x[0-9a-fA-F]{40}$/.test(entryPoint)) return refuse('request_malformed', 'entryPoint');
  const chainId = value.chainId;
  if (!ownWalletChainAllowedV1(chainId)) return refuse('chain_not_allowed', 'chainId');
  const purpose = value.purpose;
  if (typeof purpose !== 'string' || !(OWN_WALLET_PURPOSES_V1 as readonly string[]).includes(purpose)) return refuse('request_malformed', 'purpose');
  const accountAddress = value.accountAddress;
  if (typeof accountAddress !== 'string' || !ADDRESS.test(accountAddress)) return refuse('request_malformed', 'accountAddress');
  const expiresAt = value.expiresAt;
  if (typeof expiresAt !== 'string' || !ISO.test(expiresAt) || Number.isNaN(Date.parse(expiresAt))) return refuse('request_malformed', 'expiresAt');
  let serverUserOpHash: string | null = null;
  if ('userOpHash' in value && value.userOpHash !== null) {
    if (typeof value.userOpHash !== 'string' || !HASH.test(value.userOpHash)) return refuse('request_malformed', 'userOpHash');
    serverUserOpHash = value.userOpHash;
  }
  return {
    ok: true,
    value: {
      userOp: op.value,
      entryPoint: entryPoint.toLowerCase(),
      chainId,
      purpose: purpose as OwnWalletPurposeV1,
      accountAddress,
      expiresAt,
      serverUserOpHash,
    },
  };
}

/** The local hash of a decoded request (the WebAuthn challenge is its 32 raw bytes). */
export function walletRequestUserOpHashV1(request: OwnWalletWalletRequestV1): string {
  return ownWalletUserOpHashV1(packOwnWalletUserOpV1(request.userOp), request.entryPoint, request.chainId);
}
