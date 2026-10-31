/**
 * L8-6 own wallet, web side: what the wallet page reads from the chain itself, through the pinned public node of
 * that chain and never through our backend (design W2.6 column "链", W2.2 (a), A15).
 *
 * - Read-only: only `eth_chainId`, `eth_call`, `eth_getCode`, `eth_blockNumber`. No method that sends anything.
 * - The node's `eth_chainId` is checked before the first read; a different chain fails every read.
 * - The transport is injected (tests); the browser one is `fetch` with no credentials, no referrer, no cache.
 * - A read that fails is an error, never a default: the purpose checks refuse to sign without the fact.
 */
import { AbiCoder, getAddress, keccak256 } from 'ethers';
import { OWN_WALLET_MODULES_V1, ownWalletModuleV1, type OwnWalletChainIdV1, type OwnWalletModuleNameV1 } from '../../../shared/types/agent-own-wallet';
import { ERC8004_REGISTRY_IFACE_V1, KERNEL_EXECUTE_IFACE_V1, SMART_SESSIONS_IFACE_V1, SOCIAL_RECOVERY_IFACE_V1, WEBAUTHN_VALIDATOR_IFACE_V1 } from './userop-decode';

export type OwnWalletRpcTransportV1 = (url: string, body: string) => Promise<string>;

export class OwnWalletChainReadError extends Error {
  constructor(readonly reasonCode: 'rpc_unavailable' | 'rpc_chain_mismatch' | 'rpc_answer_invalid' | 'rpc_method_not_allowed') {
    super(reasonCode);
    this.name = 'OwnWalletChainReadError';
  }
}

const READ_METHODS = ['eth_chainId', 'eth_call', 'eth_getCode', 'eth_blockNumber'] as const;
type ReadMethod = (typeof READ_METHODS)[number];
const HEX = /^0x[0-9a-fA-F]*$/;
const coder = AbiCoder.defaultAbiCoder();

export interface OwnWalletPublicChainReaderV1 {
  readonly chainId: OwnWalletChainIdV1;
  request(method: string, params: unknown[]): Promise<unknown>;
  getCode(address: string): Promise<string>;
  call(to: string, data: string): Promise<string>;
}

/** Browser transport: plain POST, no cookies, no referrer, no cache. */
export const fetchRpcTransportV1: OwnWalletRpcTransportV1 = async (url, body) => {
  const res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body, credentials: 'omit', referrerPolicy: 'no-referrer', cache: 'no-store' });
  if (!res.ok) throw new OwnWalletChainReadError('rpc_unavailable');
  return res.text();
};

export function createPublicChainReaderV1(input: { chainId: OwnWalletChainIdV1; rpcUrl: string; transport?: OwnWalletRpcTransportV1 }): OwnWalletPublicChainReaderV1 {
  const transport = input.transport ?? fetchRpcTransportV1;
  if (!/^https:\/\//.test(input.rpcUrl)) throw new OwnWalletChainReadError('rpc_unavailable');
  let id = 0;
  let chainChecked: Promise<void> | null = null;

  const raw = async (method: ReadMethod, params: unknown[]): Promise<unknown> => {
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
    if (answer.id !== id || answer.error !== undefined || !('result' in answer)) throw new OwnWalletChainReadError('rpc_answer_invalid');
    return answer.result;
  };

  const ensureChain = (): Promise<void> => {
    if (!chainChecked) {
      chainChecked = raw('eth_chainId', []).then((result) => {
        if (typeof result !== 'string' || !HEX.test(result) || Number(BigInt(result)) !== input.chainId) throw new OwnWalletChainReadError('rpc_chain_mismatch');
      });
      chainChecked.catch(() => {
        chainChecked = null;
      });
    }
    return chainChecked;
  };

  const reader: OwnWalletPublicChainReaderV1 = {
    chainId: input.chainId,
    async request(method, params) {
      if (!(READ_METHODS as readonly string[]).includes(method)) throw new OwnWalletChainReadError('rpc_method_not_allowed');
      await ensureChain();
      return raw(method as ReadMethod, params);
    },
    async getCode(address) {
      const result = await reader.request('eth_getCode', [getAddress(address), 'latest']);
      if (typeof result !== 'string' || !HEX.test(result) || result.length % 2 !== 0) throw new OwnWalletChainReadError('rpc_answer_invalid');
      return result.toLowerCase();
    },
    async call(to, data) {
      const result = await reader.request('eth_call', [{ to: getAddress(to), data }, 'latest']);
      if (typeof result !== 'string' || !HEX.test(result) || result.length % 2 !== 0) throw new OwnWalletChainReadError('rpc_answer_invalid');
      return result.toLowerCase();
    },
  };
  return reader;
}

const addr = (name: OwnWalletModuleNameV1) => ownWalletModuleV1(name).address;

function decodeOrThrow<T>(fn: () => T): T {
  try {
    return fn();
  } catch {
    throw new OwnWalletChainReadError('rpc_answer_invalid');
  }
}

/** The runtime code at a pinned module's address hashes to this chain's pinned codehash. */
export async function moduleCodeMatchesV1(reader: OwnWalletPublicChainReaderV1, name: OwnWalletModuleNameV1): Promise<boolean> {
  const code = await reader.getCode(addr(name));
  return code !== '0x' && keccak256(code).toLowerCase() === ownWalletModuleV1(name).codehash[reader.chainId].toLowerCase();
}

/** W2.6 `install_recovery`: the account has code, and whether SocialRecovery is installed as a validator. */
export async function readInstallRecoveryFactsV1(reader: OwnWalletPublicChainReaderV1, account: string): Promise<{ deployed: boolean; socialRecoveryInstalled: boolean }> {
  const code = await reader.getCode(account);
  if (code === '0x') return { deployed: false, socialRecoveryInstalled: false };
  return { deployed: true, socialRecoveryInstalled: await readSocialRecoveryInstalledV1(reader, account) };
}

export async function readSocialRecoveryInstalledV1(reader: OwnWalletPublicChainReaderV1, account: string): Promise<boolean> {
  const data = KERNEL_EXECUTE_IFACE_V1.encodeFunctionData('isModuleInstalled', [1, addr('socialRecovery'), '0x']);
  const result = await reader.call(account, data);
  return decodeOrThrow(() => Boolean(KERNEL_EXECUTE_IFACE_V1.decodeFunctionResult('isModuleInstalled', result)[0]));
}

/** W2.6 `grant_session`: is SmartSessions already installed on the account? (A second install reverts: S7 (c).) */
export async function readSmartSessionsInstalledV1(reader: OwnWalletPublicChainReaderV1, account: string): Promise<boolean> {
  const data = KERNEL_EXECUTE_IFACE_V1.encodeFunctionData('isModuleInstalled', [1, addr('smartSessions'), '0x']);
  const result = await reader.call(account, data);
  return decodeOrThrow(() => Boolean(KERNEL_EXECUTE_IFACE_V1.decodeFunctionResult('isModuleInstalled', result)[0]));
}

/**
 * W2.3 / W2.6 `grant_session`: for each pinned contract address, does the code on this chain hash to this chain's pinned
 * codehash? Keyed by lower-case address. An address that is not a pinned module is never looked at; a read that fails
 * leaves the address out (the check then refuses with `chain_fact_missing`, never assumes true).
 */
export async function readPinnedContractsCodeOkV1(reader: OwnWalletPublicChainReaderV1, addresses: readonly string[]): Promise<Record<string, boolean>> {
  const out: Record<string, boolean> = {};
  for (const address of addresses) {
    const lower = address.toLowerCase();
    const module = OWN_WALLET_MODULES_V1.find((m) => m.address.toLowerCase() === lower);
    if (!module) continue;
    try {
      out[lower] = await moduleCodeMatchesV1(reader, module.name);
    } catch {
      // left out on purpose
    }
  }
  return out;
}

/** W2.6 `set_guardians`: the guardians as SocialRecovery lists them, and the threshold. */
export async function readGuardiansV1(reader: OwnWalletPublicChainReaderV1, account: string): Promise<{ guardians: string[]; threshold: number }> {
  const sr = addr('socialRecovery');
  const list = await reader.call(sr, SOCIAL_RECOVERY_IFACE_V1.encodeFunctionData('getGuardians', [getAddress(account)]));
  const t = await reader.call(sr, SOCIAL_RECOVERY_IFACE_V1.encodeFunctionData('threshold', [getAddress(account)]));
  return decodeOrThrow(() => ({
    guardians: (SOCIAL_RECOVERY_IFACE_V1.decodeFunctionResult('getGuardians', list)[0] as unknown as string[]).map((g) => String(g).toLowerCase()),
    threshold: Number(BigInt(SOCIAL_RECOVERY_IFACE_V1.decodeFunctionResult('threshold', t)[0] as bigint)),
  }));
}

/** W2.2 (a), W2.6 `remove_credential`: the account's WebAuthn credentials and threshold, read from the validator. */
export async function readWebAuthnCredentialsV1(
  reader: OwnWalletPublicChainReaderV1,
  account: string,
): Promise<{ threshold: number; credentials: Array<{ id: string; pubKeyX: string; pubKeyY: string; requireUV: boolean }> }> {
  const v = addr('webAuthnValidator');
  const idsRaw = await reader.call(v, WEBAUTHN_VALIDATOR_IFACE_V1.encodeFunctionData('getCredentialIds', [getAddress(account)]));
  const ids = decodeOrThrow(() => (WEBAUTHN_VALIDATOR_IFACE_V1.decodeFunctionResult('getCredentialIds', idsRaw)[0] as unknown as string[]).map((x) => String(x).toLowerCase()));
  if (ids.length > 32) throw new OwnWalletChainReadError('rpc_answer_invalid');
  const credentials: Array<{ id: string; pubKeyX: string; pubKeyY: string; requireUV: boolean }> = [];
  for (const id of ids) {
    const info = await reader.call(v, WEBAUTHN_VALIDATOR_IFACE_V1.encodeFunctionData('getCredentialInfo', [id, getAddress(account)]));
    credentials.push(
      decodeOrThrow(() => {
        const [x, y, uv] = WEBAUTHN_VALIDATOR_IFACE_V1.decodeFunctionResult('getCredentialInfo', info);
        return { id, pubKeyX: '0x' + BigInt(x).toString(16).padStart(64, '0'), pubKeyY: '0x' + BigInt(y).toString(16).padStart(64, '0'), requireUV: Boolean(uv) };
      }),
    );
  }
  const t = await reader.call(v, WEBAUTHN_VALIDATOR_IFACE_V1.encodeFunctionData('threshold', [getAddress(account)]));
  return { threshold: decodeOrThrow(() => Number(BigInt(coder.decode(['uint256'], t)[0]))), credentials };
}

/** W2.6 `revoke_registration`: who holds the ERC-8004 identity NFT. */
export async function readErc8004OwnerV1(reader: OwnWalletPublicChainReaderV1, agentId: bigint): Promise<string> {
  const result = await reader.call(addr('erc8004IdentityRegistryProxy'), ERC8004_REGISTRY_IFACE_V1.encodeFunctionData('ownerOf', [agentId]));
  return decodeOrThrow(() => String(ERC8004_REGISTRY_IFACE_V1.decodeFunctionResult('ownerOf', result)[0]).toLowerCase());
}

/** W2.6 `revoke_registration` / `revoke_session`: the account's session permission ids in SmartSessions. */
export async function readPermissionIdsV1(reader: OwnWalletPublicChainReaderV1, account: string): Promise<string[]> {
  const result = await reader.call(addr('smartSessions'), SMART_SESSIONS_IFACE_V1.encodeFunctionData('getPermissionIDs', [getAddress(account)]));
  return decodeOrThrow(() => (SMART_SESSIONS_IFACE_V1.decodeFunctionResult('getPermissionIDs', result)[0] as unknown as string[]).map((x) => String(x).toLowerCase()));
}
