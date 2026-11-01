/**
 * L8-6 S10: the public verify page `/verify/agent/<chainId>/<agentId>` (design I1-I4, R3-L5, R4-M5, A25, A49), as
 * functions the page, the rehearsal (R9, R12b) and the tests share. The page runs in the visitor's browser, needs no
 * login and calls no Agentrix API: it reads the official ERC-8004 registry through the chain's public node and the
 * registration file the owner signed the digest of, and trusts only those.
 *
 * - The registry must be the pinned one: proxy and implementation code hash, ERC-1967 implementation slot and
 *   `getVersion()`. Anything else and the page gives no verdict (`registry_changed`).
 * - `ownerOf == 0x…dEaD` is "revoked" (I4, one way). A holder other than the account the file URL names, or a registry
 *   `agentWallet` other than the holder, is "transferred".
 * - The holder counts as an Agent's own wallet only when the chain shows it is one: the LibClone ERC-1967 proxy code,
 *   the pinned Kernel v3.1 implementation in its slot, `rootValidator()` = the pinned WebAuthnValidator, and at least
 *   one passkey there. An address in the platform set P (server keys, MPC wallets) is an EOA or another contract and
 *   fails this, so the page needs no copy of P (P is server data and partly private).
 * - The file is fetched only from the registration file base Agentrix hosts (build constant) or read from a
 *   `data:application/json;base64,…` URI; a file elsewhere is not fetched (the visitor's browser does not contact a host
 *   the registrant chose). Digest rule = `registrationFileDigestV1` (`jq -S -c 'del(.registrations)' | sha256sum`).
 * - The platform's EAS certificate (84532 only; 97 has none and shows no such block, E137) is read only when the link
 *   names its uid (`#eas=0x…`) and the build pins the attester; the link may add `easRevoke=pending`, which can only
 *   lower what the page says, never raise it.
 * - Every read goes through `createVerifyChainReaderV1`: `eth_chainId` first, read methods only, no credentials.
 */
import { AbiCoder, Interface, getAddress, keccak256, sha256, solidityPackedKeccak256, toUtf8Bytes, toUtf8String } from 'ethers';
import {
  ERC8004_EAS_CERTIFICATE_SCHEMA_UID_V1,
  ERC8004_EAS_DEPLOYMENTS_V1,
  ERC8004_METADATA_KEYS_V1,
  ERC8004_REGISTRY_IMPLEMENTATION_V1,
  ERC8004_REGISTRY_TESTNET_V1,
  ERC8004_REGISTRY_VERSION_V1,
  ERC8004_REVOKED_HOLDER_V1,
  ERC8004_STATUS_METADATA_V1,
  erc8004AgentRegistryIdV1,
  type Erc8004RegistrationFileV1,
} from '../../../shared/types/agent-erc8004';
import { ownWalletChainAllowedV1, ownWalletModuleV1, type OwnWalletChainIdV1 } from '../../../shared/types/agent-own-wallet';
import { KERNEL_V31_INIT_CODE_HASH_V1, OWN_WALLET_ROOT_VALIDATION_ID_V1 } from './kernel-address';
import {
  OwnWalletChainReadError,
  fetchRpcTransportV1,
  moduleCodeMatchesV1,
  readWebAuthnCredentialsV1,
  type OwnWalletPublicChainReaderV1,
  type OwnWalletRpcTransportV1,
} from './public-chain-reader';
import { canonicalJsonV1, dataUriTextV1, registrationFileDigestV1 } from './registration-file';

/** `NEXT_PUBLIC_AGENT_IDENTITY_VERIFY_V1_ENABLED`, exactly '1'. No prerequisite: the page only reads public data. */
export function agentIdentityVerifyWebEnabledV1(): boolean {
  return process.env.NEXT_PUBLIC_AGENT_IDENTITY_VERIFY_V1_ENABLED === '1';
}

const ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const UID = /^0x[0-9a-fA-F]{64}$/;
const HEX = /^0x[0-9a-fA-F]*$/;

/**
 * The attester the build pins for a chain's platform certificate (`NEXT_PUBLIC_AGENT_EAS_ATTESTER_84532`); `null` when
 * the chain has no EAS or the constant is missing or malformed (then the certificate block is "not checked").
 */
export function easAttesterOfV1(chainId: number): string | null {
  if (!ERC8004_EAS_DEPLOYMENTS_V1[chainId]) return null;
  const raw = chainId === 84532 ? (process.env.NEXT_PUBLIC_AGENT_EAS_ATTESTER_84532 ?? '').trim() : '';
  return ADDRESS.test(raw) && !/^0x0{40}$/.test(raw) ? raw.toLowerCase() : null;
}

/** Route parameters: an allowed testnet and a decimal token id below 2^256. `null` otherwise (the page 404s). */
export function verifyRouteParamsV1(chainId: unknown, agentId: unknown): { chainId: OwnWalletChainIdV1; agentId: string } | null {
  if (typeof chainId !== 'string' || typeof agentId !== 'string') return null;
  if (!/^[1-9][0-9]{0,9}$/.test(chainId) || !/^(0|[1-9][0-9]{0,77})$/.test(agentId)) return null;
  const chain = Number(chainId);
  if (!ownWalletChainAllowedV1(chain)) return null;
  if (BigInt(agentId) >= BigInt('0x1' + '0'.repeat(64))) return null;
  return { chainId: chain, agentId };
}

/** The link fragment: `eas=<uid>` (a pointer, checked on chain) and `easRevoke=pending` (the platform's own word). */
export function parseVerifyFragmentV1(hash: string): { easUid: string | null; revokePendingSaid: boolean } {
  const text = typeof hash === 'string' ? hash.replace(/^#/, '') : '';
  const params = new URLSearchParams(text);
  const uid = (params.get('eas') ?? '').trim();
  return {
    easUid: UID.test(uid) && !/^0x0{64}$/.test(uid) ? uid.toLowerCase() : null,
    revokePendingSaid: params.get('easRevoke') === 'pending',
  };
}

// ---------------------------------------------------------------------------------------------------------------------
// Chain reader for this page: the wallet page's reader plus `eth_getStorageAt` and a call that tells a revert apart.

export interface OwnWalletVerifyReaderV1 extends OwnWalletPublicChainReaderV1 {
  storageAt(address: string, slot: string): Promise<string>;
  /** `eth_call` where a revert (no such token) is an answer and any other failure throws. */
  tryCall(to: string, data: string): Promise<{ reverted: true } | { reverted: false; data: string }>;
}

const VERIFY_READ_METHODS = ['eth_chainId', 'eth_call', 'eth_getCode', 'eth_getStorageAt'] as const;
type VerifyReadMethod = (typeof VERIFY_READ_METHODS)[number];

class VerifyRevertedError extends Error {
  constructor() {
    super('reverted');
    this.name = 'VerifyRevertedError';
  }
}

/** A JSON-RPC error that says the call reverted (geth code 3; BSC and others answer -32000 "execution reverted"). */
function isRevertError(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;
  const e = error as { code?: unknown; message?: unknown };
  return e.code === 3 || (typeof e.message === 'string' && /revert/i.test(e.message));
}

export function createVerifyChainReaderV1(input: { chainId: OwnWalletChainIdV1; rpcUrl: string; transport?: OwnWalletRpcTransportV1 }): OwnWalletVerifyReaderV1 {
  const transport = input.transport ?? fetchRpcTransportV1;
  if (!/^https:\/\//.test(input.rpcUrl)) throw new OwnWalletChainReadError('rpc_unavailable');
  let id = 0;
  let chainChecked: Promise<void> | null = null;

  const raw = async (method: VerifyReadMethod, params: unknown[]): Promise<unknown> => {
    id += 1;
    let text: string;
    try {
      text = await transport(input.rpcUrl, JSON.stringify({ jsonrpc: '2.0', id, method, params }));
    } catch (error) {
      if (error instanceof OwnWalletChainReadError) throw error;
      throw new OwnWalletChainReadError('rpc_unavailable');
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new OwnWalletChainReadError('rpc_answer_invalid');
    }
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) throw new OwnWalletChainReadError('rpc_answer_invalid');
    const answer = parsed as { id?: unknown; result?: unknown; error?: unknown };
    if (answer.id !== id) throw new OwnWalletChainReadError('rpc_answer_invalid');
    if (answer.error !== undefined) {
      if (method === 'eth_call' && isRevertError(answer.error)) throw new VerifyRevertedError();
      throw new OwnWalletChainReadError('rpc_answer_invalid');
    }
    if (!('result' in answer)) throw new OwnWalletChainReadError('rpc_answer_invalid');
    return answer.result;
  };

  const ensureChain = (): Promise<void> => {
    if (!chainChecked) {
      chainChecked = raw('eth_chainId', []).then((result) => {
        if (typeof result !== 'string' || !HEX.test(result) || result.length < 3 || Number(BigInt(result)) !== input.chainId) throw new OwnWalletChainReadError('rpc_chain_mismatch');
      });
      chainChecked.catch(() => {
        chainChecked = null;
      });
    }
    return chainChecked;
  };

  const hexResult = (result: unknown): string => {
    if (typeof result !== 'string' || !HEX.test(result) || result.length % 2 !== 0) throw new OwnWalletChainReadError('rpc_answer_invalid');
    return result.toLowerCase();
  };

  const reader: OwnWalletVerifyReaderV1 = {
    chainId: input.chainId,
    async request(method, params) {
      if (!(VERIFY_READ_METHODS as readonly string[]).includes(method)) throw new OwnWalletChainReadError('rpc_method_not_allowed');
      await ensureChain();
      try {
        return await raw(method as VerifyReadMethod, params);
      } catch (error) {
        if (error instanceof VerifyRevertedError) throw new OwnWalletChainReadError('rpc_answer_invalid');
        throw error;
      }
    },
    async getCode(address) {
      return hexResult(await reader.request('eth_getCode', [getAddress(address), 'latest']));
    },
    async call(to, data) {
      return hexResult(await reader.request('eth_call', [{ to: getAddress(to), data }, 'latest']));
    },
    async storageAt(address, slot) {
      const value = hexResult(await reader.request('eth_getStorageAt', [getAddress(address), slot, 'latest']));
      if (value.length !== 66) throw new OwnWalletChainReadError('rpc_answer_invalid');
      return value;
    },
    async tryCall(to, data) {
      await ensureChain();
      try {
        return { reverted: false, data: hexResult(await raw('eth_call', [{ to: getAddress(to), data }, 'latest'])) };
      } catch (error) {
        if (error instanceof VerifyRevertedError) return { reverted: true };
        throw error;
      }
    },
  };
  return reader;
}

// ---------------------------------------------------------------------------------------------------------------------
// Facts on chain.

/** `bytes32(uint256(keccak256('eip1967.proxy.implementation')) - 1)`. */
export const ERC1967_IMPLEMENTATION_SLOT_V1 = '0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc';
/**
 * The runtime code KernelFactory deploys for every account: Solady LibClone's ERC-1967 proxy (61 bytes). Its initcode
 * with the pinned Kernel v3.1 implementation hashes to `KERNEL_V31_INIT_CODE_HASH_V1` (a test re-derives it).
 */
export const KERNEL_PROXY_RUNTIME_V1 = '0x363d3d373d3d363d7f360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc545af43d6000803e6038573d6000fd5b3d6000f3';
/** LibClone's initcode around the implementation address and the runtime above. */
export const KERNEL_PROXY_INITCODE_PARTS_V1 = { prefix: '0x603d3d8160223d3973', suffix: '0x60095155f3' } as const;
export { KERNEL_V31_INIT_CODE_HASH_V1 };

export const VERIFY_REGISTRY_IFACE_V1 = new Interface([
  'function ownerOf(uint256 tokenId) view returns (address)',
  'function tokenURI(uint256 tokenId) view returns (string)',
  'function getMetadata(uint256 agentId, string metadataKey) view returns (bytes)',
  'function getAgentWallet(uint256 agentId) view returns (address)',
  'function getVersion() pure returns (string)',
]);
export const VERIFY_KERNEL_IFACE_V1 = new Interface(['function rootValidator() view returns (bytes21)']);
export const VERIFY_EAS_IFACE_V1 = new Interface([
  'function getAttestation(bytes32 uid) view returns ((bytes32 uid, bytes32 schema, uint64 time, uint64 expirationTime, uint64 revocationTime, bytes32 refUID, address recipient, address attester, bool revocable, bytes data))',
]);

const coder = AbiCoder.defaultAbiCoder();
const REGISTRY = ownWalletModuleV1('erc8004IdentityRegistryProxy').address;
const DEAD = ERC8004_REVOKED_HOLDER_V1.toLowerCase();
const ZERO_ADDRESS = '0x' + '0'.repeat(40);

function decoded<T>(fn: () => T): T {
  try {
    return fn();
  } catch {
    throw new OwnWalletChainReadError('rpc_answer_invalid');
  }
}

export type RegistryProblemV1 = 'registry_code_mismatch' | 'registry_implementation_mismatch' | 'registry_version_mismatch';

/** I1: the registry is the pinned proxy, pointing at the pinned implementation, answering version 2.0.0. */
export async function registryProblemV1(reader: OwnWalletVerifyReaderV1): Promise<RegistryProblemV1 | null> {
  if (!(await moduleCodeMatchesV1(reader, 'erc8004IdentityRegistryProxy'))) return 'registry_code_mismatch';
  const slot = await reader.storageAt(REGISTRY, ERC1967_IMPLEMENTATION_SLOT_V1);
  if (!/^0x0{24}/.test(slot) || '0x' + slot.slice(26) !== ERC8004_REGISTRY_IMPLEMENTATION_V1.toLowerCase()) return 'registry_implementation_mismatch';
  if (!(await moduleCodeMatchesV1(reader, 'erc8004IdentityRegistryImplementation'))) return 'registry_implementation_mismatch';
  const raw = await reader.call(REGISTRY, VERIFY_REGISTRY_IFACE_V1.encodeFunctionData('getVersion', []));
  const version = decoded(() => String(VERIFY_REGISTRY_IFACE_V1.decodeFunctionResult('getVersion', raw)[0]));
  return version === ERC8004_REGISTRY_VERSION_V1 ? null : 'registry_version_mismatch';
}

export type OwnAccountProblemV1 = 'no_code' | 'not_kernel_proxy' | 'implementation_not_pinned' | 'modules_not_pinned' | 'root_validator_not_webauthn' | 'no_credentials';
export type OwnAccountFactsV1 = { ok: true; credentials: Array<{ pubKeyX: string; pubKeyY: string }> } | { ok: false; reasonCode: OwnAccountProblemV1 };

/**
 * Whether the chain shows `address` is an own wallet account (Kernel v3.1 rooted in the pinned WebAuthnValidator, with
 * at least one passkey). `modulesPinned`: the Kernel implementation and the WebAuthnValidator have their pinned code
 * on this chain (read once per page). A failed read throws.
 */
export async function ownAccountFactsV1(reader: OwnWalletVerifyReaderV1, address: string, modulesPinned: boolean): Promise<OwnAccountFactsV1> {
  const code = await reader.getCode(address);
  if (code === '0x') return { ok: false, reasonCode: 'no_code' };
  if (code !== KERNEL_PROXY_RUNTIME_V1) return { ok: false, reasonCode: 'not_kernel_proxy' };
  const slot = await reader.storageAt(address, ERC1967_IMPLEMENTATION_SLOT_V1);
  if (!/^0x0{24}/.test(slot) || '0x' + slot.slice(26) !== ownWalletModuleV1('kernelImplementationV31').address.toLowerCase()) return { ok: false, reasonCode: 'implementation_not_pinned' };
  if (!modulesPinned) return { ok: false, reasonCode: 'modules_not_pinned' };
  const root = await reader.call(address, VERIFY_KERNEL_IFACE_V1.encodeFunctionData('rootValidator', []));
  const rootId = decoded(() => String(VERIFY_KERNEL_IFACE_V1.decodeFunctionResult('rootValidator', root)[0]).toLowerCase());
  if (rootId !== OWN_WALLET_ROOT_VALIDATION_ID_V1) return { ok: false, reasonCode: 'root_validator_not_webauthn' };
  const { credentials } = await readWebAuthnCredentialsV1(reader, address);
  if (credentials.length === 0) return { ok: false, reasonCode: 'no_credentials' };
  return { ok: true, credentials: credentials.map((c) => ({ pubKeyX: c.pubKeyX, pubKeyY: c.pubKeyY })) };
}

/** Appendix C item 28: the Agent account and the vault share at least one passkey. */
export function sameKeysV1(a: OwnAccountFactsV1, b: OwnAccountFactsV1 | null): boolean {
  if (a.ok === false || !b || b.ok === false) return false;
  const keys = new Set(a.credentials.map((c) => `${c.pubKeyX}:${c.pubKeyY}`));
  return b.credentials.some((c) => keys.has(`${c.pubKeyX}:${c.pubKeyY}`));
}

// ---------------------------------------------------------------------------------------------------------------------
// The whole check.

export type AgentIdentityVerdictV1 =
  | 'confirmed'
  | 'revoked'
  | 'revoke_pending'
  | 'transferred'
  | 'not_own_account'
  | 'file_mismatch'
  | 'chain_only'
  | 'registry_changed'
  | 'not_found'
  | 'unavailable';

export type AgentIdentityProblemV1 =
  | RegistryProblemV1
  | `holder_${OwnAccountProblemV1}`
  | 'holder_not_file_account'
  | 'agent_wallet_differs'
  | 'onchain_digest_missing'
  | 'file_not_hosted_by_agentrix'
  | 'file_unavailable'
  | 'file_invalid'
  | 'file_digest_mismatch'
  | 'registration_not_listed'
  | 'registration_agent_id_mismatch';

export type AgentIdentityFileStateV1 = 'ok' | 'not_hosted_by_agentrix' | 'unavailable' | 'invalid';

export type AgentIdentityCertificateV1 =
  | { status: 'not_checked'; reasonCode: 'no_uid_in_link' | 'attester_not_configured' }
  | { status: 'valid'; uid: string; attester: string }
  | { status: 'revoked'; uid: string }
  | { status: 'revoke_pending'; uid: string }
  | { status: 'mismatch'; uid: string; reasonCode: 'not_found' | 'schema' | 'attester' | 'recipient' | 'data' }
  | { status: 'unavailable'; uid: string };

export interface AgentIdentityVerifyResultV1 {
  verdict: AgentIdentityVerdictV1;
  chainId: OwnWalletChainIdV1;
  agentId: string;
  registry: string;
  problems: AgentIdentityProblemV1[];
  holder?: string;
  agentURI?: string;
  /** The account named in an Agentrix registration file URL; `null` for another URL or a `data:` URI. */
  fileAccount?: string | null;
  agentWallet?: string;
  onchainDigest?: string | null;
  onchainStatus?: string | null;
  ownerVault?: string | null;
  holderIsOwnAccount?: boolean;
  /** Appendix C item 28, only when the holder is an own account. */
  sameKeysAsVault?: boolean;
  file?: { state: AgentIdentityFileStateV1; digest?: string; active?: boolean; cardUrl?: string; name?: string };
  /** `null` on chains without EAS (97): no certificate block at all. */
  certificate: AgentIdentityCertificateV1 | null;
}

export interface AgentIdentityVerifyInputV1 {
  chainId: OwnWalletChainIdV1;
  agentId: string;
  reader: OwnWalletVerifyReaderV1;
  /** Base of the registration files Agentrix hosts (`NEXT_PUBLIC_AGENT_ERC8004_FILE_BASE_URL`); '' = none. */
  fileBaseUrl: string;
  /** GET of a registration file, no credentials, no referrer. Throws on any failure. */
  fetchText: (url: string) => Promise<string>;
  link?: { easUid: string | null; revokePendingSaid: boolean };
  /** `easAttesterOfV1(chainId)`. */
  easAttester?: string | null;
}

const FILE_BASE = /^https:\/\/[^\s?#]+[^/\s?#]$/;

/** The account an Agentrix file URL names, `null` for any other URI. */
export function fileAccountOfV1(agentURI: string, fileBaseUrl: string, chainId: number): string | null {
  if (!FILE_BASE.test(fileBaseUrl)) return null;
  const prefix = `${fileBaseUrl}/${chainId}/`;
  if (!agentURI.startsWith(prefix)) return null;
  const m = /^(0x[0-9a-f]{40})\/registration\.json$/.exec(agentURI.slice(prefix.length));
  return m ? m[1] : null;
}

/** Browser GET of a registration file: no cookies, no referrer, no cache, no redirect, at most 64 KiB. */
export async function fetchRegistrationFileTextV1(url: string): Promise<string> {
  const res = await fetch(url, { method: 'GET', credentials: 'omit', referrerPolicy: 'no-referrer', cache: 'no-store', redirect: 'error' });
  if (!res.ok) throw new Error('file_unavailable');
  const text = await res.text();
  if (text.length > 64 * 1024) throw new Error('file_too_large');
  return text;
}

/** Metadata anyone holding the token can write: shown as text when it is UTF-8, else as the hex it is. */
function utf8OrHex(bytes: string): string {
  try {
    return toUtf8String(bytes);
  } catch {
    return bytes;
  }
}

function bytesMetadata(raw: string): string {
  return decoded(() => String(VERIFY_REGISTRY_IFACE_V1.decodeFunctionResult('getMetadata', raw)[0]).toLowerCase());
}

function digestWithActive(file: Erc8004RegistrationFileV1, active: boolean): string {
  const rest: Record<string, unknown> = { ...file, active };
  delete rest.registrations;
  return sha256(toUtf8Bytes(canonicalJsonV1(rest))).toLowerCase();
}

export async function verifyAgentIdentityV1(input: AgentIdentityVerifyInputV1): Promise<AgentIdentityVerifyResultV1> {
  const { reader, chainId } = input;
  const agentId = BigInt(input.agentId);
  const eas = ERC8004_EAS_DEPLOYMENTS_V1[chainId] ?? null;
  const result: AgentIdentityVerifyResultV1 = {
    verdict: 'unavailable',
    chainId,
    agentId: agentId.toString(),
    registry: getAddress(ERC8004_REGISTRY_TESTNET_V1),
    problems: [],
    certificate: eas ? { status: 'not_checked', reasonCode: 'no_uid_in_link' } : null,
  };
  if (reader.chainId !== chainId) return result;
  const call = (fn: string, args: unknown[]) => reader.call(REGISTRY, VERIFY_REGISTRY_IFACE_V1.encodeFunctionData(fn, args));
  try {
    const registryProblem = await registryProblemV1(reader);
    if (registryProblem) {
      result.verdict = 'registry_changed';
      result.problems.push(registryProblem);
      return result;
    }
    const owner = await reader.tryCall(REGISTRY, VERIFY_REGISTRY_IFACE_V1.encodeFunctionData('ownerOf', [agentId]));
    if (owner.reverted === true) {
      result.verdict = 'not_found';
      return result;
    }
    const holder = decoded(() => String(VERIFY_REGISTRY_IFACE_V1.decodeFunctionResult('ownerOf', owner.data)[0]).toLowerCase());
    const uriRaw = await call('tokenURI', [agentId]);
    const uri = decoded(() => String(VERIFY_REGISTRY_IFACE_V1.decodeFunctionResult('tokenURI', uriRaw)[0]));
    const walletRaw = await call('getAgentWallet', [agentId]);
    const agentWallet = decoded(() => String(VERIFY_REGISTRY_IFACE_V1.decodeFunctionResult('getAgentWallet', walletRaw)[0]).toLowerCase());
    const digestBytes = bytesMetadata(await call('getMetadata', [agentId, ERC8004_METADATA_KEYS_V1.fileDigest]));
    const vaultBytes = bytesMetadata(await call('getMetadata', [agentId, ERC8004_METADATA_KEYS_V1.ownerVault]));
    const statusBytes = bytesMetadata(await call('getMetadata', [agentId, ERC8004_STATUS_METADATA_V1.key]));
    result.holder = holder;
    result.agentURI = uri;
    result.agentWallet = agentWallet;
    result.onchainDigest = /^0x[0-9a-f]{64}$/.test(digestBytes) ? digestBytes : null;
    result.ownerVault = /^0x[0-9a-f]{40}$/.test(vaultBytes) ? vaultBytes : null;
    result.onchainStatus = statusBytes === '0x' ? null : utf8OrHex(statusBytes);
    result.fileAccount = fileAccountOfV1(uri, input.fileBaseUrl, chainId);

    const file = await readFileV1(uri, input);
    result.file = file.view;

    const revoked = holder === DEAD;
    const certificateAccount = result.fileAccount ?? (revoked ? null : holder);
    if (eas) result.certificate = await certificateOfV1(reader, eas.eas, input, { chainId, agentId, account: certificateAccount });

    if (revoked) {
      result.verdict = 'revoked';
      return result;
    }
    if (result.fileAccount !== null && holder !== result.fileAccount) {
      result.problems.push('holder_not_file_account');
      result.verdict = 'transferred';
      return result;
    }
    if (agentWallet !== holder) {
      result.problems.push('agent_wallet_differs');
      result.verdict = 'transferred';
      return result;
    }
    const modulesPinned = (await moduleCodeMatchesV1(reader, 'kernelImplementationV31')) && (await moduleCodeMatchesV1(reader, 'webAuthnValidator'));
    const holderFacts = await ownAccountFactsV1(reader, holder, modulesPinned);
    result.holderIsOwnAccount = holderFacts.ok === true;
    if (holderFacts.ok === false) {
      result.problems.push(`holder_${holderFacts.reasonCode}` as AgentIdentityProblemV1);
      result.verdict = 'not_own_account';
      return result;
    }
    const vaultFacts = result.ownerVault && result.ownerVault !== ZERO_ADDRESS ? await ownAccountFactsV1(reader, result.ownerVault, modulesPinned) : null;
    result.sameKeysAsVault = sameKeysV1(holderFacts, vaultFacts);

    if (result.onchainDigest === null) {
      result.problems.push('onchain_digest_missing');
      result.verdict = 'file_mismatch';
      return result;
    }
    if (file.state === 'not_hosted_by_agentrix' || file.state === 'unavailable') {
      result.problems.push(file.state === 'unavailable' ? 'file_unavailable' : 'file_not_hosted_by_agentrix');
      result.verdict = 'chain_only';
      return result;
    }
    if (file.state === 'invalid' || !file.file) {
      result.problems.push('file_invalid');
      result.verdict = 'file_mismatch';
      return result;
    }
    let pendingRevocation = false;
    if (file.digest !== result.onchainDigest) {
      // The DID was revoked and the owner has not signed the on-chain revocation yet: the server already serves the
      // signed file with `active: false` (appendix C item 18). Anything else is a changed file.
      if (file.file.active === false && digestWithActive(file.file, true) === result.onchainDigest) pendingRevocation = true;
      else {
        result.problems.push('file_digest_mismatch');
        result.verdict = 'file_mismatch';
        return result;
      }
    }
    const registrationProblem = registrationsProblemV1(file.file, chainId, agentId);
    if (registrationProblem) {
      result.problems.push(registrationProblem);
      result.verdict = 'file_mismatch';
      return result;
    }
    result.verdict = pendingRevocation ? 'revoke_pending' : 'confirmed';
    return result;
  } catch {
    result.verdict = 'unavailable';
    return result;
  }
}

/** I3: the file lists this token under the pinned registry, and no other token id there. */
export function registrationsProblemV1(file: Erc8004RegistrationFileV1, chainId: number, agentId: bigint): 'registration_not_listed' | 'registration_agent_id_mismatch' | null {
  const registryId = erc8004AgentRegistryIdV1(chainId).toLowerCase();
  const mine = (file.registrations ?? []).filter((r) => r.agentRegistry.toLowerCase() === registryId);
  if (mine.length === 0) return 'registration_not_listed';
  return mine.every((r) => BigInt(r.agentId) === agentId) ? null : 'registration_agent_id_mismatch';
}

async function readFileV1(
  uri: string,
  input: AgentIdentityVerifyInputV1,
): Promise<{ state: AgentIdentityFileStateV1; file?: Erc8004RegistrationFileV1; digest?: string; view: NonNullable<AgentIdentityVerifyResultV1['file']> }> {
  let text: string | null = dataUriTextV1(uri);
  if (text === null) {
    if (fileAccountOfV1(uri, input.fileBaseUrl, input.chainId) === null) return { state: 'not_hosted_by_agentrix', view: { state: 'not_hosted_by_agentrix' } };
    try {
      text = await input.fetchText(uri);
    } catch {
      return { state: 'unavailable', view: { state: 'unavailable' } };
    }
  }
  const checked = registrationFileDigestV1(text);
  if (checked.ok === false) return { state: 'invalid', view: { state: 'invalid' } };
  const web = checked.file.services.find((s) => s.name === 'web');
  const view: NonNullable<AgentIdentityVerifyResultV1['file']> = { state: 'ok', digest: checked.digest, active: checked.file.active, name: checked.file.name };
  if (web && /^https:\/\//.test(web.endpoint)) view.cardUrl = web.endpoint;
  return { state: 'ok', file: checked.file, digest: checked.digest, view };
}

async function certificateOfV1(
  reader: OwnWalletVerifyReaderV1,
  easAddress: string,
  input: AgentIdentityVerifyInputV1,
  expected: { chainId: number; agentId: bigint; account: string | null },
): Promise<AgentIdentityCertificateV1> {
  const uid = input.link?.easUid ?? null;
  if (!uid) return { status: 'not_checked', reasonCode: 'no_uid_in_link' };
  const attester = input.easAttester ?? null;
  if (!attester) return { status: 'not_checked', reasonCode: 'attester_not_configured' };
  let a: { uid: string; schema: string; revocationTime: bigint; recipient: string; attester: string; data: string };
  try {
    const raw = await reader.call(easAddress, VERIFY_EAS_IFACE_V1.encodeFunctionData('getAttestation', [uid]));
    const [t] = VERIFY_EAS_IFACE_V1.decodeFunctionResult('getAttestation', raw);
    a = { uid: String(t.uid).toLowerCase(), schema: String(t.schema).toLowerCase(), revocationTime: BigInt(t.revocationTime), recipient: String(t.recipient).toLowerCase(), attester: String(t.attester).toLowerCase(), data: String(t.data).toLowerCase() };
  } catch {
    return { status: 'unavailable', uid };
  }
  if (a.uid !== uid) return { status: 'mismatch', uid, reasonCode: 'not_found' };
  if (a.schema !== ERC8004_EAS_CERTIFICATE_SCHEMA_UID_V1) return { status: 'mismatch', uid, reasonCode: 'schema' };
  if (a.attester !== attester.toLowerCase()) return { status: 'mismatch', uid, reasonCode: 'attester' };
  let fields: { chainId: bigint; registry: string; agentId: bigint; account: string };
  try {
    const [c, r, id, acct] = coder.decode(['uint256', 'address', 'uint256', 'address', 'bytes32'], a.data);
    fields = { chainId: BigInt(c), registry: String(r).toLowerCase(), agentId: BigInt(id), account: String(acct).toLowerCase() };
  } catch {
    return { status: 'mismatch', uid, reasonCode: 'data' };
  }
  if (fields.chainId !== BigInt(expected.chainId) || fields.registry !== REGISTRY.toLowerCase() || fields.agentId !== expected.agentId) return { status: 'mismatch', uid, reasonCode: 'data' };
  if (a.recipient !== fields.account || (expected.account !== null && a.recipient !== expected.account)) return { status: 'mismatch', uid, reasonCode: 'recipient' };
  if (a.revocationTime !== BigInt(0)) return { status: 'revoked', uid };
  if (input.link?.revokePendingSaid === true) return { status: 'revoke_pending', uid };
  return { status: 'valid', uid, attester: a.attester };
}

/** The certificate schema UID rule, so a test can re-derive the pinned value. */
export function easSchemaUidOfV1(schema: string): string {
  return solidityPackedKeccak256(['string', 'address', 'bool'], [schema, ZERO_ADDRESS, true]).toLowerCase();
}

/** keccak256 of the proxy initcode for an implementation (the test compares it with the pinned init code hash). */
export function kernelProxyInitCodeHashV1(implementation: string): string {
  return keccak256(KERNEL_PROXY_INITCODE_PARTS_V1.prefix + implementation.slice(2).toLowerCase() + KERNEL_PROXY_INITCODE_PARTS_V1.suffix.slice(2) + KERNEL_PROXY_RUNTIME_V1.slice(2)).toLowerCase();
}

// ---------------------------------------------------------------------------------------------------------------------
// Command-line steps (design I3: the same conclusion with curl, jq, sha256sum and xxd, without this page).

export interface VerifyCliStepV1 {
  id: 'setup' | 'owner' | 'uri' | 'digest' | 'file_digest' | 'registrations' | 'implementation' | 'certificate';
  command: string;
}

const word = (n: bigint) => n.toString(16).padStart(64, '0');

export function verifyCliStepsV1(input: { chainId: OwnWalletChainIdV1; agentId: string; rpcUrl: string; agentURI?: string; easUid?: string | null }): VerifyCliStepV1[] {
  const id = BigInt(input.agentId);
  const reg = getAddress(ERC8004_REGISTRY_TESTNET_V1);
  const ownerOf = VERIFY_REGISTRY_IFACE_V1.encodeFunctionData('ownerOf', [id]);
  const tokenURI = VERIFY_REGISTRY_IFACE_V1.encodeFunctionData('tokenURI', [id]);
  const digest = VERIFY_REGISTRY_IFACE_V1.encodeFunctionData('getMetadata', [id, ERC8004_METADATA_KEYS_V1.fileDigest]);
  const uri = input.agentURI && /^https:\/\/[^\s'"`$\\]+$/.test(input.agentURI) ? input.agentURI : '<tokenURI>';
  const steps: VerifyCliStepV1[] = [
    {
      id: 'setup',
      command: [
        `RPC='${input.rpcUrl}'`,
        `REG=${reg}`,
        `call() { curl -s "$RPC" -H 'content-type: application/json' -d "{\\"jsonrpc\\":\\"2.0\\",\\"id\\":1,\\"method\\":\\"eth_call\\",\\"params\\":[{\\"to\\":\\"$1\\",\\"data\\":\\"$2\\"},\\"latest\\"]}" | jq -r .result; }`,
      ].join('\n'),
    },
    { id: 'owner', command: `call $REG ${ownerOf} | cut -c 27-` },
    { id: 'uri', command: `call $REG ${tokenURI} | cut -c 131- | xxd -r -p | tr -d '\\000'; echo` },
    { id: 'digest', command: `call $REG ${digest} | cut -c 131-194` },
    { id: 'file_digest', command: `curl -s '${uri}' | jq -S -c -j 'del(.registrations)' | sha256sum` },
    { id: 'registrations', command: `curl -s '${uri}' | jq -c '.registrations'   # agentId ${id.toString()}, agentRegistry ${erc8004AgentRegistryIdV1(input.chainId)}` },
    {
      id: 'implementation',
      command: `curl -s "$RPC" -H 'content-type: application/json' -d '{"jsonrpc":"2.0","id":1,"method":"eth_getStorageAt","params":["${reg}","${ERC1967_IMPLEMENTATION_SLOT_V1}","latest"]}' | jq -r .result | cut -c 27-   # ${ERC8004_REGISTRY_IMPLEMENTATION_V1.slice(2).toLowerCase()}`,
    },
  ];
  const eas = ERC8004_EAS_DEPLOYMENTS_V1[input.chainId];
  if (eas && input.easUid && UID.test(input.easUid)) {
    // getAttestation's answer: word 0 is the tuple offset, then uid, schema, time, expirationTime, revocationTime.
    const data = VERIFY_EAS_IFACE_V1.encodeFunctionData('getAttestation', [input.easUid]);
    steps.push({ id: 'certificate', command: `call ${eas.eas} ${data} | cut -c ${2 + 5 * 64 + 1}-${2 + 6 * 64}   # revocationTime: ${word(BigInt(0))} = not revoked` });
  }
  return steps;
}
