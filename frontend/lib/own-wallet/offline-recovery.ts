/**
 * L8-6 own wallet, offline recovery tool (design decision 3d, A10, plan S6; R6-L1 item 3): the logic behind the single
 * self-contained HTML file `wallet-origin/offline/offline-recovery.html`. It works when the platform is gone: no
 * Agentrix server, no bundler, no passkey, only a browser and the owner's own public RPC.
 *
 * Steps (all UserOps go straight to `EntryPoint.handleOps`, the transaction is paid and signed by the recovery code's
 * own address, so the address needs a little native coin; the UserOps carry max fees of 0, so the wallet pays nothing):
 * 1. Read the chain: the three pinned modules have the pinned code, the account has code, SocialRecovery is installed,
 *    the guardians and the threshold, the native and the pinned-token balance.
 * 2. Make a software P-256 key (WebCrypto, in memory, not extractable). A recovery UserOp (Kernel nonce key
 *    `mode 0 | type 1 | SocialRecovery | key 0`) carries exactly `execute(single, WebAuthnValidator, 0,
 *    addCredential(x, y, false))`. The recovery code signs `personal_sign(userOpHash)`; the owner can add more guardian
 *    signatures (65 bytes each) when the threshold is above 1. Then `handleOps`.
 * 3. A root UserOp (nonce key 0) moves the native coin and the pinned token (97 USDT, 84532 USDC, R6-L1 item 3) to the
 *    address the owner typed. The software key signs it in the WebAuthn assertion format of the root validator:
 *    `abi.encode(bytes32[] credentialIds, bool usePrecompile = false, WebAuthnAuth[])` (software P-256 verification, as
 *    the chain may have no RIP-7212). Then `handleOps`.
 *
 * What goes into the transaction is built here from the owner's input; the callData is decoded again and compared
 * before anything is signed. The RPC is the only network peer, and an Agentrix host is refused as an RPC.
 * Nothing here is sent anywhere except `eth_*` JSON-RPC to the owner's node. Pure over ethers and WebCrypto; the DOM
 * glue is `wallet-origin/offline/offline-recovery.page.ts`.
 */
import { AbiCoder, HDNodeWallet, Interface, Mnemonic, concat, getAddress, getBytes, keccak256, sha256, solidityPacked, toUtf8Bytes, verifyMessage } from 'ethers';
import { EXEC_MODE_RULES_V1, OWN_WALLET_CHAIN_IDS_V1, OWN_WALLET_PINNED_TOKENS_V1, ownWalletModuleV1, type OwnWalletChainIdV1, type OwnWalletModuleNameV1 } from '../../../shared/types/agent-own-wallet';
import { OwnWalletChainReadError, readGuardiansV1, readSocialRecoveryInstalledV1, readWebAuthnCredentialsV1, type OwnWalletPublicChainReaderV1 } from './public-chain-reader';
import { ERC20_IFACE_V1, KERNEL_EXECUTE_IFACE_V1, WEBAUTHN_VALIDATOR_IFACE_V1, decodeAddCredentialV1, decodeErc20TransferV1, decodeExecuteCallV1, encodeSingleExecutionV1 } from './userop-decode';
import { ownWalletUserOpHashV1, type OwnWalletPackedUserOpV1 } from './userop-hash';
import { bytesToBase64UrlV1, keyFingerprintV1, lowSV1 } from './webauthn';

const coder = AbiCoder.defaultAbiCoder();
const mod = (name: OwnWalletModuleNameV1) => ownWalletModuleV1(name).address.toLowerCase();
const ENTRY_POINT = mod('entryPointV07');
const WEBAUTHN_VALIDATOR = mod('webAuthnValidator');
const SOCIAL_RECOVERY = mod('socialRecovery');

/** Kernel nonce key of a UserOp validated by SocialRecovery (mode 0, validator type 1, SocialRecovery, key 0). */
export const OFFLINE_RECOVERY_NONCE_KEY_V1 = BigInt(solidityPacked(['uint8', 'uint8', 'address', 'uint16'], [0, 1, getAddress(SOCIAL_RECOVERY), 0]));
/** The root UserOp's nonce key (mode 0, type 0, no validator, key 0). */
export const OFFLINE_ROOT_NONCE_KEY_V1 = BigInt(0);

const MODE_SINGLE = '0x' + EXEC_MODE_RULES_V1.callTypes.single + EXEC_MODE_RULES_V1.execTypes.default + '00'.repeat(EXEC_MODE_RULES_V1.reservedBytes);
const MODE_BATCH = '0x' + EXEC_MODE_RULES_V1.callTypes.batch + EXEC_MODE_RULES_V1.execTypes.default + '00'.repeat(EXEC_MODE_RULES_V1.reservedBytes);

/**
 * Gas limits of the two UserOps. Verification of the recovery UserOp is ecrecover (cheap); the root UserOp is verified in
 * software P-256 (2.5M is the order the S2 fixture used with margin). Max fees are 0: the wallet is charged nothing, the
 * recovery code's address pays for the transaction.
 */
export const OFFLINE_GAS_V1 = {
  addKey: { verification: BigInt(800_000), call: BigInt(400_000), preVerification: BigInt(100_000) },
  transfer: { verification: BigInt(2_500_000), call: BigInt(800_000), preVerification: BigInt(100_000) },
} as const;

/** A neutral WebAuthn identity for the software key: the validator cannot check an RP ID or an origin. */
const SOFT_RP_ID = 'offline-recovery';
const SOFT_ORIGIN = 'https://offline-recovery.invalid';
const AUTH_TUPLE = 'tuple(bytes,string,uint256,uint256,uint256,uint256)';

const EP_IFACE = new Interface([
  'function getNonce(address sender, uint192 key) view returns (uint256)',
  'function handleOps((address sender, uint256 nonce, bytes initCode, bytes callData, bytes32 accountGasLimits, uint256 preVerificationGas, bytes32 gasFees, bytes paymasterAndData, bytes signature)[] ops, address beneficiary)',
  'event UserOperationEvent(bytes32 indexed userOpHash, address indexed sender, address indexed paymaster, uint256 nonce, bool success, uint256 actualGasCost, uint256 actualGasUsed)',
]);
const BALANCE_OF_IFACE = new Interface(['function balanceOf(address account) view returns (uint256)']);

// ------------------------------------------------------------------------------------------------ the owner's node

export type OfflineRpcProblemV1 = 'rpc_url_invalid' | 'rpc_url_not_allowed' | 'rpc_unavailable' | 'rpc_chain_mismatch' | 'rpc_answer_invalid' | 'rpc_method_not_allowed' | 'rpc_error';

export class OfflineRpcError extends Error {
  /** `detail` is the node's own error message (cut), for the owner to read; it never contains the URL. */
  constructor(readonly reasonCode: OfflineRpcProblemV1, readonly detail?: string) {
    super(detail ? `${reasonCode}: ${detail}` : reasonCode);
    this.name = 'OfflineRpcError';
  }
}

/** The JSON-RPC methods the tool sends. `eth_sendRawTransaction` is the only one that changes anything. */
export const OFFLINE_RPC_METHODS_V1 = [
  'eth_chainId',
  'eth_blockNumber',
  'eth_getBalance',
  'eth_getCode',
  'eth_call',
  'eth_getTransactionCount',
  'eth_gasPrice',
  'eth_estimateGas',
  'eth_sendRawTransaction',
  'eth_getTransactionReceipt',
] as const;
type OfflineMethod = (typeof OFFLINE_RPC_METHODS_V1)[number];

/** An RPC on an Agentrix host would defeat the point of an offline tool. */
const AGENTRIX_HOST = /(^|\.)agentrix\.[a-z0-9-]+$/i;
const LOOPBACK_HOST = /^(localhost|127\.0\.0\.1|\[::1\])$/;
const HEX = /^0x[0-9a-fA-F]*$/;

export type OfflineRpcTransportV1 = (url: string, body: string) => Promise<string>;

/** The browser transport: a plain POST to the owner's node, no cookies, no referrer, no cache. */
export const offlineFetchTransportV1: OfflineRpcTransportV1 = async (url, body) => {
  const res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body, credentials: 'omit', referrerPolicy: 'no-referrer', cache: 'no-store' });
  if (!res.ok) throw new OfflineRpcError('rpc_unavailable', `HTTP ${res.status}`);
  return res.text();
};

/** `null` when the text is an acceptable RPC URL: https, or http on this computer; never an Agentrix host. */
export function offlineRpcUrlProblemV1(rpcUrl: unknown): 'rpc_url_invalid' | 'rpc_url_not_allowed' | null {
  if (typeof rpcUrl !== 'string' || rpcUrl.length === 0 || rpcUrl.length > 2048) return 'rpc_url_invalid';
  let url: URL;
  try {
    url = new URL(rpcUrl.trim());
  } catch {
    return 'rpc_url_invalid';
  }
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && LOOPBACK_HOST.test(url.hostname))) return 'rpc_url_invalid';
  if (AGENTRIX_HOST.test(url.hostname)) return 'rpc_url_not_allowed';
  return null;
}

/** The node as the tool uses it; also an `OwnWalletPublicChainReaderV1` so the S5a chain reads can be reused. */
export interface OfflineRpcV1 extends OwnWalletPublicChainReaderV1 {
  request(method: string, params: unknown[]): Promise<unknown>;
}

export function createOfflineRpcV1(input: { chainId: OwnWalletChainIdV1; rpcUrl: string; transport?: OfflineRpcTransportV1 }): OfflineRpcV1 {
  const problem = offlineRpcUrlProblemV1(input.rpcUrl);
  if (problem) throw new OfflineRpcError(problem);
  const url = input.rpcUrl.trim();
  const transport = input.transport ?? offlineFetchTransportV1;
  let id = 0;
  let chainChecked: Promise<void> | null = null;

  const raw = async (method: OfflineMethod, params: unknown[]): Promise<unknown> => {
    id += 1;
    let text: string;
    try {
      text = await transport(url, JSON.stringify({ jsonrpc: '2.0', id, method, params }));
    } catch (error) {
      if (error instanceof OfflineRpcError) throw error;
      throw new OfflineRpcError('rpc_unavailable');
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new OfflineRpcError('rpc_answer_invalid');
    }
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) throw new OfflineRpcError('rpc_answer_invalid');
    const answer = parsed as { id?: unknown; result?: unknown; error?: { message?: unknown } };
    if (answer.id !== id) throw new OfflineRpcError('rpc_answer_invalid');
    if (answer.error !== undefined) {
      const message = typeof answer.error?.message === 'string' ? answer.error.message.slice(0, 300) : undefined;
      throw new OfflineRpcError('rpc_error', message);
    }
    if (!('result' in answer)) throw new OfflineRpcError('rpc_answer_invalid');
    return answer.result;
  };

  const ensureChain = (): Promise<void> => {
    if (!chainChecked) {
      chainChecked = raw('eth_chainId', []).then((result) => {
        if (typeof result !== 'string' || !HEX.test(result) || Number(BigInt(result)) !== input.chainId) throw new OfflineRpcError('rpc_chain_mismatch');
      });
      chainChecked.catch(() => {
        chainChecked = null;
      });
    }
    return chainChecked;
  };

  const rpc: OfflineRpcV1 = {
    chainId: input.chainId,
    async request(method, params) {
      if (!(OFFLINE_RPC_METHODS_V1 as readonly string[]).includes(method)) throw new OfflineRpcError('rpc_method_not_allowed');
      await ensureChain();
      return raw(method as OfflineMethod, params);
    },
    async getCode(address) {
      const result = await rpc.request('eth_getCode', [getAddress(address), 'latest']);
      if (typeof result !== 'string' || !HEX.test(result) || result.length % 2 !== 0) throw new OfflineRpcError('rpc_answer_invalid');
      return result.toLowerCase();
    },
    async call(to, data) {
      const result = await rpc.request('eth_call', [{ to: getAddress(to), data }, 'latest']);
      if (typeof result !== 'string' || !HEX.test(result) || result.length % 2 !== 0) throw new OfflineRpcError('rpc_answer_invalid');
      return result.toLowerCase();
    },
  };
  return rpc;
}

async function quantity(rpc: OfflineRpcV1, method: string, params: unknown[]): Promise<bigint> {
  const result = await rpc.request(method, params);
  if (typeof result !== 'string' || !/^0x[0-9a-fA-F]+$/.test(result)) throw new OfflineRpcError('rpc_answer_invalid');
  return BigInt(result);
}

// ------------------------------------------------------------------------------------------------ keys

/**
 * The recovery code (12 words) as a wallet: its address is a guardian and it pays for the transactions. Same rules as
 * `recovery-code.ts` (lower case, single spaces, 12 valid BIP-39 words, default path); that file is not imported on
 * purpose, it reaches the IndexedDB store and the page texts, which the offline file does not need. A test compares the
 * two addresses.
 */
export function offlineRecoveryWalletV1(text: unknown): HDNodeWallet | null {
  const phrase = typeof text === 'string' ? text.trim().toLowerCase().split(/\s+/).filter(Boolean).join(' ') : '';
  if (phrase.split(' ').length !== 12) return null;
  try {
    if (!Mnemonic.isValidMnemonic(phrase)) return null;
    return HDNodeWallet.fromMnemonic(Mnemonic.fromPhrase(phrase));
  } catch {
    return null;
  }
}

/** A software P-256 key that lives in this page's memory only. */
export interface OfflineSoftKeyV1 {
  /** 0x + 64 hex digits each. */
  pubKeyX: string;
  pubKeyY: string;
  fingerprint: string;
  /** ECDSA P-256 over SHA-256 of `message`, low s. */
  sign(message: Uint8Array): Promise<{ r: bigint; s: bigint }>;
}

const hex32 = (b: Uint8Array) => '0x' + Array.from(b, (v) => v.toString(16).padStart(2, '0')).join('');

/** `subtle` is `crypto.subtle`. The private key is not extractable. */
export async function generateSoftKeyV1(subtle: SubtleCrypto): Promise<OfflineSoftKeyV1> {
  const pair = await subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign', 'verify']);
  const jwk = await subtle.exportKey('jwk', pair.publicKey);
  const x = jwk.x ? decodeBase64Url(jwk.x) : null;
  const y = jwk.y ? decodeBase64Url(jwk.y) : null;
  if (!x || !y || x.length !== 32 || y.length !== 32) throw new Error('soft_key_export_failed');
  const pubKeyX = hex32(x);
  const pubKeyY = hex32(y);
  return {
    pubKeyX,
    pubKeyY,
    fingerprint: keyFingerprintV1({ pubKeyX, pubKeyY }),
    async sign(message) {
      const sig = new Uint8Array(await subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, pair.privateKey, message as BufferSource));
      if (sig.length !== 64) throw new Error('soft_key_signature_malformed');
      return { r: BigInt(hex32(sig.subarray(0, 32))), s: lowSV1(BigInt(hex32(sig.subarray(32)))) };
    },
  };
}

function decodeBase64Url(value: string): Uint8Array | null {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) return null;
  const text = value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (value.length % 4)) % 4);
  return Uint8Array.from(atob(text), (c) => c.charCodeAt(0));
}

/** `keccak256(abi.encode(x, y, account))`: the WebAuthnValidator's credential id. */
export function offlineCredentialIdV1(key: { pubKeyX: string; pubKeyY: string }, account: string): string {
  return keccak256(coder.encode(['uint256', 'uint256', 'address'], [BigInt(key.pubKeyX), BigInt(key.pubKeyY), getAddress(account)]));
}

/**
 * The root signature of a UserOp by the software key, in the WebAuthn assertion format of the root validator: flags UP|UV,
 * the challenge is the base64url of the 32 hash bytes, software P-256 verification (`usePrecompile` false).
 */
export async function softRootSignatureV1(key: OfflineSoftKeyV1, account: string, userOpHash: string): Promise<string> {
  const authenticatorData = concat([sha256(toUtf8Bytes(SOFT_RP_ID)), '0x05', '0x00000000']);
  const challenge = bytesToBase64UrlV1(getBytes(userOpHash));
  const clientDataJSON = `{"type":"webauthn.get","challenge":"${challenge}","origin":"${SOFT_ORIGIN}","crossOrigin":false}`;
  const signed = await key.sign(getBytes(concat([authenticatorData, sha256(toUtf8Bytes(clientDataJSON))])));
  const auth = [authenticatorData, clientDataJSON, clientDataJSON.indexOf('"challenge":"'), clientDataJSON.indexOf('"type":"webauthn.get"'), signed.r, signed.s];
  return coder.encode(['bytes32[]', 'bool', `${AUTH_TUPLE}[]`], [[offlineCredentialIdV1(key, account)], false, [auth]]);
}

// ------------------------------------------------------------------------------------------------ the two UserOps

export interface OfflineExecutionV1 {
  target: string;
  value: bigint;
  data: string;
}

/** `execute(single | batch, …)` of the given executions (one → single, several → batch). */
export function offlineExecuteCallDataV1(executions: readonly OfflineExecutionV1[]): string {
  if (executions.length === 0) throw new Error('no_execution');
  if (executions.length === 1) {
    const [e] = executions;
    return KERNEL_EXECUTE_IFACE_V1.encodeFunctionData('execute', [MODE_SINGLE, encodeSingleExecutionV1(e.target, e.value, e.data)]).toLowerCase();
  }
  const batch = coder.encode(['tuple(address,uint256,bytes)[]'], [executions.map((e) => [getAddress(e.target), e.value, e.data])]);
  return KERNEL_EXECUTE_IFACE_V1.encodeFunctionData('execute', [MODE_BATCH, batch]).toLowerCase();
}

/** The recovery UserOp's callData: `addCredential(x, y, false)` of the software key (the key needs no user verification). */
export function offlineAddKeyCallDataV1(key: { pubKeyX: string; pubKeyY: string }): string {
  const add = WEBAUTHN_VALIDATOR_IFACE_V1.encodeFunctionData('addCredential', [BigInt(key.pubKeyX), BigInt(key.pubKeyY), false]);
  return offlineExecuteCallDataV1([{ target: WEBAUTHN_VALIDATOR, value: BigInt(0), data: add.toLowerCase() }]);
}

/** The transfer UserOp's executions: the native coin and the pinned token to `to`, each only when its amount is above 0. */
export function offlineTransferExecutionsV1(chainId: OwnWalletChainIdV1, to: string, amounts: { nativeWei: bigint; tokenAmount: bigint }): OfflineExecutionV1[] {
  const out: OfflineExecutionV1[] = [];
  const token = OWN_WALLET_PINNED_TOKENS_V1[chainId];
  if (amounts.tokenAmount > BigInt(0)) {
    out.push({ target: token.address.toLowerCase(), value: BigInt(0), data: ERC20_IFACE_V1.encodeFunctionData('transfer', [getAddress(to), amounts.tokenAmount]).toLowerCase() });
  }
  if (amounts.nativeWei > BigInt(0)) out.push({ target: getAddress(to).toLowerCase(), value: amounts.nativeWei, data: '0x' });
  return out;
}

export interface OfflineOpPlanV1 {
  op: OwnWalletPackedUserOpV1;
  userOpHash: string;
  /** What the owner is shown; read back out of `callData`, not out of the inputs. */
  shows: { kind: 'add_key'; fingerprint: string } | { kind: 'transfer'; to: string; nativeWei: bigint; tokenAmount: bigint };
}

function packedOp(account: string, nonce: bigint, callData: string, gas: { verification: bigint; call: bigint; preVerification: bigint }): OwnWalletPackedUserOpV1 {
  return {
    sender: getAddress(account).toLowerCase(),
    nonce,
    initCode: '0x',
    callData,
    accountGasLimits: solidityPacked(['uint128', 'uint128'], [gas.verification, gas.call]).toLowerCase(),
    preVerificationGas: gas.preVerification,
    gasFees: solidityPacked(['uint128', 'uint128'], [BigInt(0), BigInt(0)]).toLowerCase(),
    paymasterAndData: '0x',
    signature: '0x',
  };
}

async function nonceOf(rpc: OfflineRpcV1, account: string, key: bigint): Promise<bigint> {
  const result = await rpc.call(ENTRY_POINT, EP_IFACE.encodeFunctionData('getNonce', [getAddress(account), key]));
  if (!/^0x[0-9a-f]{64}$/.test(result)) throw new OfflineRpcError('rpc_answer_invalid');
  return BigInt(result);
}

/** Plans the recovery UserOp that adds the software key. Fails closed if the callData does not decode back to exactly that. */
export async function planAddKeyV1(rpc: OfflineRpcV1, account: string, key: OfflineSoftKeyV1): Promise<OfflineOpPlanV1> {
  const callData = offlineAddKeyCallDataV1(key);
  const decoded = decodeExecuteCallV1(callData);
  const added = decoded && decoded.callType === 'single' && decoded.executions.length === 1 && decoded.executions[0].target === WEBAUTHN_VALIDATOR && decoded.executions[0].value === BigInt(0) ? decodeAddCredentialV1(decoded.executions[0].data) : null;
  if (!added || BigInt(added.pubKeyX) !== BigInt(key.pubKeyX) || BigInt(added.pubKeyY) !== BigInt(key.pubKeyY) || added.requireUV !== false) throw new Error('callData_mismatch');
  const op = packedOp(account, await nonceOf(rpc, account, OFFLINE_RECOVERY_NONCE_KEY_V1), callData, OFFLINE_GAS_V1.addKey);
  return { op, userOpHash: ownWalletUserOpHashV1(op, ENTRY_POINT, rpc.chainId), shows: { kind: 'add_key', fingerprint: key.fingerprint } };
}

/** Plans the root UserOp that moves the funds. The executions are decoded again and must be exactly what the owner asked. */
export async function planTransferV1(rpc: OfflineRpcV1, account: string, to: string, amounts: { nativeWei: bigint; tokenAmount: bigint }): Promise<OfflineOpPlanV1> {
  const executions = offlineTransferExecutionsV1(rpc.chainId, to, amounts);
  if (executions.length === 0) throw new Error('nothing_to_move');
  const callData = offlineExecuteCallDataV1(executions);
  const decoded = decodeExecuteCallV1(callData);
  if (!decoded || decoded.executions.length !== executions.length) throw new Error('callData_mismatch');
  let nativeWei = BigInt(0);
  let tokenAmount = BigInt(0);
  const token = OWN_WALLET_PINNED_TOKENS_V1[rpc.chainId].address.toLowerCase();
  const dest = getAddress(to).toLowerCase();
  for (const e of decoded.executions) {
    if (e.target === token && e.value === BigInt(0)) {
      const t = decodeErc20TransferV1(e.data);
      if (!t || t.to.toLowerCase() !== dest) throw new Error('callData_mismatch');
      tokenAmount += t.amount;
    } else if (e.target === dest && e.data === '0x') {
      nativeWei += e.value;
    } else {
      throw new Error('callData_mismatch');
    }
  }
  if (nativeWei !== amounts.nativeWei || tokenAmount !== amounts.tokenAmount) throw new Error('callData_mismatch');
  const op = packedOp(account, await nonceOf(rpc, account, OFFLINE_ROOT_NONCE_KEY_V1), callData, OFFLINE_GAS_V1.transfer);
  return { op, userOpHash: ownWalletUserOpHashV1(op, ENTRY_POINT, rpc.chainId), shows: { kind: 'transfer', to: dest, nativeWei, tokenAmount } };
}

// ------------------------------------------------------------------------------------------------ guardian signatures

export type OfflineSignatureProblemV1 = 'signature_malformed' | 'signer_not_guardian' | 'threshold_not_met';

export type OfflineSignaturesV1 =
  | { ok: true; signature: string; signers: string[] }
  | { ok: false; reasonCode: OfflineSignatureProblemV1; index?: number; have?: number; need?: number };

/** A 65-byte signature, v 27/28 (a wallet answering v 0/1 is moved to 27/28; it is the same signature). */
export function normalizeGuardianSignatureV1(value: unknown): string | null {
  if (typeof value !== 'string' || !/^0x[0-9a-fA-F]{130}$/.test(value.trim())) return null;
  const sig = value.trim().toLowerCase();
  const v = parseInt(sig.slice(130, 132), 16);
  if (v === 27 || v === 28) return sig;
  if (v === 0 || v === 1) return sig.slice(0, 130) + (v + 27).toString(16);
  return null;
}

/**
 * Collects `threshold` signatures of distinct guardians over `personal_sign(userOpHash)`. A signature that is malformed
 * or by an address that is not a guardian refuses the whole set (the owner pasted something wrong); the same signer twice
 * counts once.
 */
export function assembleGuardianSignaturesV1(input: { userOpHash: string; guardians: readonly string[]; threshold: number; signatures: readonly unknown[] }): OfflineSignaturesV1 {
  const guardians = input.guardians.map((g) => g.toLowerCase());
  const seen = new Set<string>();
  const chosen: string[] = [];
  const signers: string[] = [];
  for (let i = 0; i < input.signatures.length; i += 1) {
    const sig = normalizeGuardianSignatureV1(input.signatures[i]);
    if (!sig) return { ok: false, reasonCode: 'signature_malformed', index: i };
    let signer: string;
    try {
      signer = verifyMessage(getBytes(input.userOpHash), sig).toLowerCase();
    } catch {
      return { ok: false, reasonCode: 'signature_malformed', index: i };
    }
    if (!guardians.includes(signer)) return { ok: false, reasonCode: 'signer_not_guardian', index: i };
    if (seen.has(signer)) continue;
    seen.add(signer);
    chosen.push(sig);
    signers.push(signer);
  }
  if (chosen.length < input.threshold) return { ok: false, reasonCode: 'threshold_not_met', have: chosen.length, need: input.threshold };
  return { ok: true, signature: concat(chosen.slice(0, input.threshold)), signers: signers.slice(0, input.threshold) };
}

// ------------------------------------------------------------------------------------------------ reading the chain

export type OfflineFactsProblemV1 = 'account_invalid' | 'module_not_pinned' | 'account_not_deployed' | 'recovery_not_installed' | 'no_guardians';

export interface OfflineFactsV1 {
  chainId: OwnWalletChainIdV1;
  account: string;
  guardians: string[];
  threshold: number;
  nativeWei: bigint;
  token: { symbol: string; address: string; decimals: number; amount: bigint };
}

export type OfflineFactsResultV1 = { ok: true; facts: OfflineFactsV1 } | { ok: false; reasonCode: OfflineFactsProblemV1; module?: OwnWalletModuleNameV1 };

/** Tests give a fake node whose fake code has its own hashes; the page never passes this, so the pinned table decides. */
export interface OfflineReadOptionsV1 {
  codehashOf?: (name: OwnWalletModuleNameV1) => string;
}

/** Step 1. Every read that fails throws (`OfflineRpcError`): a failed read is never "no recovery". */
export async function readOfflineFactsV1(rpc: OfflineRpcV1, accountText: string, options: OfflineReadOptionsV1 = {}): Promise<OfflineFactsResultV1> {
  let account: string;
  try {
    account = getAddress(accountText.trim()).toLowerCase();
  } catch {
    return { ok: false, reasonCode: 'account_invalid' };
  }
  for (const name of ['entryPointV07', 'webAuthnValidator', 'socialRecovery'] as const) {
    const code = await rpc.getCode(ownWalletModuleV1(name).address);
    const expected = options.codehashOf ? options.codehashOf(name) : ownWalletModuleV1(name).codehash[rpc.chainId];
    if (code === '0x' || keccak256(code).toLowerCase() !== expected.toLowerCase()) return { ok: false, reasonCode: 'module_not_pinned', module: name };
  }
  if ((await rpc.getCode(account)) === '0x') return { ok: false, reasonCode: 'account_not_deployed' };
  if (!(await wrapChainRead(() => readSocialRecoveryInstalledV1(rpc, account)))) return { ok: false, reasonCode: 'recovery_not_installed' };
  const { guardians, threshold } = await wrapChainRead(() => readGuardiansV1(rpc, account));
  if (guardians.length === 0 || threshold < 1) return { ok: false, reasonCode: 'no_guardians' };
  const nativeWei = await quantity(rpc, 'eth_getBalance', [getAddress(account), 'latest']);
  const pinned = OWN_WALLET_PINNED_TOKENS_V1[rpc.chainId];
  const raw = await rpc.call(pinned.address, BALANCE_OF_IFACE.encodeFunctionData('balanceOf', [getAddress(account)]));
  if (!/^0x[0-9a-f]{64}$/.test(raw)) throw new OfflineRpcError('rpc_answer_invalid');
  return { ok: true, facts: { chainId: rpc.chainId, account, guardians, threshold, nativeWei, token: { symbol: pinned.symbol, address: pinned.address.toLowerCase(), decimals: pinned.decimals, amount: BigInt(raw) } } };
}

/** The shared S5a readers throw `OwnWalletChainReadError`; the tool has one error type for the owner to read. */
async function wrapChainRead<T>(read: () => Promise<T>): Promise<T> {
  try {
    return await read();
  } catch (error) {
    if (error instanceof OwnWalletChainReadError) throw new OfflineRpcError('rpc_answer_invalid');
    throw error;
  }
}

/** Whether the software key is one of the account's credentials now. */
export async function softKeyAddedV1(rpc: OfflineRpcV1, account: string, key: OfflineSoftKeyV1): Promise<boolean> {
  const { credentials } = await wrapChainRead(() => readWebAuthnCredentialsV1(rpc, account));
  return credentials.some((c) => BigInt(c.pubKeyX) === BigInt(key.pubKeyX) && BigInt(c.pubKeyY) === BigInt(key.pubKeyY));
}

// ------------------------------------------------------------------------------------------------ sending

/** What signs and pays for a transaction: the recovery code's wallet (injected, tests use a plain wallet). */
export interface OfflinePayerV1 {
  address: string;
  signTransaction(tx: { type: 0; chainId: number; nonce: number; gasPrice: bigint; gasLimit: bigint; to: string; value: bigint; data: string }): Promise<string>;
}

export type OfflineSubmitProblemV1 = 'payer_balance_low' | 'userop_rejected' | 'send_failed' | 'receipt_timeout' | 'transaction_failed';

export type OfflineSubmitResultV1 =
  | { ok: true; txHash: string; userOpSuccess: boolean }
  | { ok: false; reasonCode: OfflineSubmitProblemV1; detail?: string; txHash?: string };

export interface OfflineSubmitDepsV1 {
  rpc: OfflineRpcV1;
  payer: OfflinePayerV1;
  sleep(ms: number): Promise<void>;
  now(): number;
  /** Default 5 minutes. */
  receiptTimeoutMs?: number;
  pollMs?: number;
}

/**
 * `EntryPoint.handleOps([op], payer)` as a legacy transaction signed by the payer. The node's own gas estimate runs the
 * whole call first, so a UserOp the EntryPoint would refuse (a wrong signature, a used nonce) is reported with the node's
 * message before anything is sent. Then it waits for the receipt and reads `UserOperationEvent.success` for this hash.
 */
export async function submitHandleOpsV1(deps: OfflineSubmitDepsV1, op: OwnWalletPackedUserOpV1, userOpHash: string): Promise<OfflineSubmitResultV1> {
  const { rpc, payer } = deps;
  const data = EP_IFACE.encodeFunctionData('handleOps', [[[op.sender, op.nonce, op.initCode, op.callData, op.accountGasLimits, op.preVerificationGas, op.gasFees, op.paymasterAndData, op.signature]], getAddress(payer.address)]);
  const from = getAddress(payer.address);
  let estimate: bigint;
  try {
    estimate = await quantity(rpc, 'eth_estimateGas', [{ from, to: getAddress(ENTRY_POINT), data }]);
  } catch (error) {
    if (error instanceof OfflineRpcError && error.reasonCode === 'rpc_error') return { ok: false, reasonCode: 'userop_rejected', detail: error.detail };
    throw error;
  }
  const gasLimit = (estimate * BigInt(13)) / BigInt(10) + BigInt(50_000);
  const gasPrice = await quantity(rpc, 'eth_gasPrice', []);
  const balance = await quantity(rpc, 'eth_getBalance', [from, 'latest']);
  if (balance < gasLimit * gasPrice) return { ok: false, reasonCode: 'payer_balance_low', detail: `need ${(gasLimit * gasPrice).toString()} wei, have ${balance.toString()} wei` };
  const nonce = Number(await quantity(rpc, 'eth_getTransactionCount', [from, 'pending']));
  const raw = await payer.signTransaction({ type: 0, chainId: rpc.chainId, nonce, gasPrice, gasLimit, to: getAddress(ENTRY_POINT), value: BigInt(0), data });
  let txHash: string;
  try {
    const sent = await rpc.request('eth_sendRawTransaction', [raw]);
    if (typeof sent !== 'string' || !/^0x[0-9a-fA-F]{64}$/.test(sent)) throw new OfflineRpcError('rpc_answer_invalid');
    txHash = sent.toLowerCase();
  } catch (error) {
    if (error instanceof OfflineRpcError && error.reasonCode === 'rpc_error') return { ok: false, reasonCode: 'send_failed', detail: error.detail };
    throw error;
  }
  const deadline = deps.now() + (deps.receiptTimeoutMs ?? 300_000);
  for (;;) {
    const receipt = (await rpc.request('eth_getTransactionReceipt', [txHash])) as { status?: string; logs?: Array<{ address?: string; topics?: string[]; data?: string }> } | null;
    if (receipt) {
      if (receipt.status !== '0x1') return { ok: false, reasonCode: 'transaction_failed', txHash };
      return { ok: true, txHash, userOpSuccess: userOpSucceeded(receipt.logs ?? [], userOpHash) };
    }
    if (deps.now() >= deadline) return { ok: false, reasonCode: 'receipt_timeout', txHash };
    await deps.sleep(deps.pollMs ?? 3000);
  }
}

function userOpSucceeded(logs: Array<{ address?: string; topics?: string[]; data?: string }>, userOpHash: string): boolean {
  for (const log of logs) {
    if (typeof log.address !== 'string' || log.address.toLowerCase() !== ENTRY_POINT || !Array.isArray(log.topics) || typeof log.data !== 'string') continue;
    try {
      const parsed = EP_IFACE.parseLog({ topics: log.topics, data: log.data });
      if (parsed?.name === 'UserOperationEvent' && String(parsed.args.userOpHash).toLowerCase() === userOpHash.toLowerCase()) return Boolean(parsed.args.success);
    } catch {
      // not an EntryPoint event we know
    }
  }
  return false;
}

// ------------------------------------------------------------------------------------------------ the two actions

export type OfflineActionProblemV1 =
  | OfflineFactsProblemV1
  | OfflineSignatureProblemV1
  | OfflineSubmitProblemV1
  | 'recovery_code_invalid'
  | 'recovery_code_not_this_wallet'
  | 'key_not_added'
  | 'userop_failed'
  | 'destination_invalid'
  | 'nothing_to_move';

export type OfflineActionResultV1<T> = ({ ok: true } & T) | { ok: false; reasonCode: OfflineActionProblemV1; detail?: string; index?: number; have?: number; need?: number; module?: OwnWalletModuleNameV1; txHash?: string };

/** Step 2. The recovery code signs, `extraSignatures` are other guardians' `personal_sign` signatures of the shown hash. */
export async function runAddKeyV1(
  deps: OfflineSubmitDepsV1,
  input: { facts: OfflineFactsV1; key: OfflineSoftKeyV1; phrase: string; extraSignatures: readonly unknown[]; onPlan?: (plan: OfflineOpPlanV1) => void },
): Promise<OfflineActionResultV1<{ txHash: string; plan: OfflineOpPlanV1 }>> {
  const wallet = offlineRecoveryWalletV1(input.phrase);
  if (!wallet) return { ok: false, reasonCode: 'recovery_code_invalid' };
  if (wallet.address.toLowerCase() !== deps.payer.address.toLowerCase()) return { ok: false, reasonCode: 'recovery_code_not_this_wallet' };
  const plan = await planAddKeyV1(deps.rpc, input.facts.account, input.key);
  input.onPlan?.(plan);
  // The pasted signatures come first so that an `index` in a refusal is the owner's line number; the recovery code's own
  // signature (when its address is a guardian) goes last. The order of signatures does not matter to SocialRecovery.
  const signatures: unknown[] = [...input.extraSignatures];
  if (input.facts.guardians.includes(wallet.address.toLowerCase())) signatures.push(await wallet.signMessage(getBytes(plan.userOpHash)));
  const collected = assembleGuardianSignaturesV1({ userOpHash: plan.userOpHash, guardians: input.facts.guardians, threshold: input.facts.threshold, signatures });
  if (collected.ok === false) return { ok: false, reasonCode: collected.reasonCode, ...(collected.index !== undefined ? { index: collected.index } : {}), ...(collected.have !== undefined ? { have: collected.have, need: collected.need } : {}) };
  const signed: OwnWalletPackedUserOpV1 = { ...plan.op, signature: collected.signature };
  const sent = await submitHandleOpsV1(deps, signed, plan.userOpHash);
  if (sent.ok === false) return { ok: false, reasonCode: sent.reasonCode, ...(sent.detail ? { detail: sent.detail } : {}), ...(sent.txHash ? { txHash: sent.txHash } : {}) };
  if (!sent.userOpSuccess) return { ok: false, reasonCode: 'userop_failed', txHash: sent.txHash };
  if (!(await softKeyAddedV1(deps.rpc, input.facts.account, input.key))) return { ok: false, reasonCode: 'key_not_added', txHash: sent.txHash };
  return { ok: true, txHash: sent.txHash, plan };
}

/** Step 3. Moves what is on the account to `to`; `moveNative` / `moveToken` are the owner's choices. */
export async function runTransferV1(
  deps: OfflineSubmitDepsV1,
  input: { facts: OfflineFactsV1; key: OfflineSoftKeyV1; to: string; moveNative: boolean; moveToken: boolean; onPlan?: (plan: OfflineOpPlanV1) => void; readOptions?: OfflineReadOptionsV1 },
): Promise<OfflineActionResultV1<{ txHash: string; plan: OfflineOpPlanV1 }>> {
  let to: string;
  try {
    to = getAddress(input.to.trim()).toLowerCase();
  } catch {
    return { ok: false, reasonCode: 'destination_invalid' };
  }
  if (to === input.facts.account) return { ok: false, reasonCode: 'destination_invalid' };
  // Read the balances again: the first step may have taken a while, and what is moved is what is there now.
  const fresh = await readOfflineFactsV1(deps.rpc, input.facts.account, input.readOptions);
  if (fresh.ok === false) return { ok: false, reasonCode: fresh.reasonCode, ...(fresh.module ? { module: fresh.module } : {}) };
  const amounts = { nativeWei: input.moveNative ? fresh.facts.nativeWei : BigInt(0), tokenAmount: input.moveToken ? fresh.facts.token.amount : BigInt(0) };
  if (amounts.nativeWei === BigInt(0) && amounts.tokenAmount === BigInt(0)) return { ok: false, reasonCode: 'nothing_to_move' };
  const plan = await planTransferV1(deps.rpc, input.facts.account, to, amounts);
  input.onPlan?.(plan);
  const signed: OwnWalletPackedUserOpV1 = { ...plan.op, signature: await softRootSignatureV1(input.key, input.facts.account, plan.userOpHash) };
  const sent = await submitHandleOpsV1(deps, signed, plan.userOpHash);
  if (sent.ok === false) return { ok: false, reasonCode: sent.reasonCode, ...(sent.detail ? { detail: sent.detail } : {}), ...(sent.txHash ? { txHash: sent.txHash } : {}) };
  if (!sent.userOpSuccess) return { ok: false, reasonCode: 'userop_failed', txHash: sent.txHash };
  return { ok: true, txHash: sent.txHash, plan };
}

/** The chains the tool serves, with the pinned token the third step lists (97 USDT, 84532 USDC; R6-L1 item 3). */
export function offlineTokenListV1(): Array<{ chainId: OwnWalletChainIdV1; symbol: string; address: string; decimals: number }> {
  return OWN_WALLET_CHAIN_IDS_V1.map((chainId) => ({ chainId, ...OWN_WALLET_PINNED_TOKENS_V1[chainId] }));
}

/** `1234500000` with 6 decimals → `1234.5`. */
export function formatUnitsTextV1(amount: bigint, decimals: number): string {
  const text = amount.toString().padStart(decimals + 1, '0');
  const whole = text.slice(0, text.length - decimals);
  const fraction = text.slice(text.length - decimals).replace(/0+$/, '');
  return fraction ? `${whole}.${fraction}` : whole;
}

/** The 18-decimal native coin of both chains (tBNB, Base Sepolia ETH). */
export const formatNativeV1 = (wei: bigint) => formatUnitsTextV1(wei, 18);
