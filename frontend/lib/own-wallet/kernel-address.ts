/**
 * L8-6 own wallet, web side: the account address the wallet origin computes itself (design W1.1, W1.3, W2.6
 * `deploy_setup`, R2-M4, R3-L4). Pure functions over ethers; no key, no network.
 *
 * - `initialize(rootVId = 0x01 ‖ WebAuthnValidator, hook = address(0), validatorData = abi.encode(1, [{x, y, true}]),
 *   hookData = 0x, initConfig = [])`. `initConfig` is always empty, so the address depends only on the wallet passkey
 *   and the salt.
 * - salt = keccak256(abi.encodePacked(prefix, uint32 saltIndex)); no platform id.
 * - address = CREATE2(KernelFactory, keccak256(initData ‖ salt), initCodeHash). 97 and 84532 use the same formula: the
 *   factory has the same address on both, and both deployment paths (97 `KernelFactory.createAccount`, 84532
 *   `FactoryStaker.deployWithFactory`) end in the same factory call.
 * - Pinned by the `kernelAddress` vectors, whose expected addresses came from `eth_call KernelFactory.getAddress` on
 *   97 and 84532 (S2), not from this file. The page shows an address only when the server's address equals the one
 *   computed here from the key in L (W1.1 (c)).
 */
import { AbiCoder, Interface, concat, getCreate2Address, keccak256 } from 'ethers';
import {
  ownWalletModuleV1,
  ownWalletSaltPreimageV1,
  type OwnWalletAccountKindV1,
  type OwnWalletChainIdV1,
} from '../../../shared/types/agent-own-wallet';

/** LibClone ERC-1967 proxy initcode hash of the Kernel v3.1 implementation (design 1a; the backend pins the same). */
export const KERNEL_V31_INIT_CODE_HASH_V1 = '0x85d96aa1c9a65886d094915d76ccae85f14027a02c1647dde659f869460f03e6';

const KERNEL_FACTORY = ownWalletModuleV1('kernelFactoryV31').address.toLowerCase();
const FACTORY_STAKER = ownWalletModuleV1('factoryStaker').address.toLowerCase();
const WEBAUTHN_VALIDATOR = ownWalletModuleV1('webAuthnValidator').address.toLowerCase();
const ZERO_ADDRESS = '0x' + '00'.repeat(20);

/** bytes21 root ValidationId: type 0x01 (validator) ‖ WebAuthnValidator. */
export const OWN_WALLET_ROOT_VALIDATION_ID_V1 = '0x01' + WEBAUTHN_VALIDATOR.slice(2);

/** How the first UserOp deploys the account on each chain (E137): 97 has no FactoryStaker approval for Kernel v3.1. */
export const OWN_WALLET_ACCOUNT_DEPLOY_V1: Readonly<Record<OwnWalletChainIdV1, 'kernel_factory_direct' | 'factory_staker'>> = {
  97: 'kernel_factory_direct',
  84532: 'factory_staker',
};

const coder = AbiCoder.defaultAbiCoder();
export const KERNEL_INITIALIZE_IFACE_V1 = new Interface(['function initialize(bytes21 rootValidator, address hook, bytes validatorData, bytes hookData, bytes[] initConfig)']);
export const KERNEL_FACTORY_IFACE_V1 = new Interface([
  'function createAccount(bytes data, bytes32 salt) payable returns (address)',
  'function deployWithFactory(address factory, bytes createData, bytes32 salt) payable returns (address)',
]);

export interface OwnWalletRootKeyV1 {
  pubKeyX: string;
  pubKeyY: string;
}

const WORD = /^0x[0-9a-fA-F]{64}$/;

/** Lower-case key words; `null` for anything that is not two non-zero 32-byte words. */
export function normalizeRootKeyV1(key: OwnWalletRootKeyV1): OwnWalletRootKeyV1 | null {
  const x = typeof key?.pubKeyX === 'string' ? key.pubKeyX : '';
  const y = typeof key?.pubKeyY === 'string' ? key.pubKeyY : '';
  if (!WORD.test(x) || !WORD.test(y) || BigInt(x) === BigInt(0) || BigInt(y) === BigInt(0)) return null;
  return { pubKeyX: x.toLowerCase(), pubKeyY: y.toLowerCase() };
}

/** `null` for an index outside 0..2^32-1 or an unknown kind. */
export function ownWalletSaltV1(kind: OwnWalletAccountKindV1, saltIndex: number): string | null {
  try {
    return keccak256(ownWalletSaltPreimageV1(kind, saltIndex)).toLowerCase();
  } catch {
    return null;
  }
}

/** `initialize` calldata with one wallet passkey as root and an empty `initConfig`. The key must be normalized. */
export function encodeKernelInitializeV1(key: OwnWalletRootKeyV1): string {
  const validatorData = coder.encode(['uint256', 'tuple(uint256,uint256,bool)[]'], [1, [[key.pubKeyX, key.pubKeyY, true]]]);
  return KERNEL_INITIALIZE_IFACE_V1.encodeFunctionData('initialize', [OWN_WALLET_ROOT_VALIDATION_ID_V1, ZERO_ADDRESS, validatorData, '0x', []]).toLowerCase();
}

/** The counterfactual address, lower-case. */
export function kernelAccountAddressV1(initData: string, salt: string): string {
  return getCreate2Address(KERNEL_FACTORY, keccak256(concat([initData, salt])), KERNEL_V31_INIT_CODE_HASH_V1).toLowerCase();
}

export interface OwnWalletLocalAccountV1 {
  kind: OwnWalletAccountKindV1;
  saltIndex: number;
  initData: string;
  salt: string;
  accountAddress: string;
}

/** Everything the page computes from its own key and the index; `null` when the key or index is invalid. */
export function localAccountOfV1(input: { kind: OwnWalletAccountKindV1; saltIndex: number } & OwnWalletRootKeyV1): OwnWalletLocalAccountV1 | null {
  const key = normalizeRootKeyV1(input);
  const salt = ownWalletSaltV1(input.kind, input.saltIndex);
  if (!key || !salt) return null;
  const initData = encodeKernelInitializeV1(key);
  return { kind: input.kind, saltIndex: input.saltIndex, initData, salt, accountAddress: kernelAccountAddressV1(initData, salt) };
}

export type OwnWalletAccountProblemV1 =
  | 'local_key_invalid'
  | 'factory_not_pinned'
  | 'factory_data_malformed'
  | 'factory_call_not_allowed'
  | 'inner_factory_not_pinned'
  | 'init_data_malformed'
  | 'root_validator_not_pinned'
  | 'hook_not_zero'
  | 'root_key_mismatch'
  | 'require_uv_missing'
  | 'hook_data_not_empty'
  | 'init_config_not_empty'
  | 'salt_mismatch'
  | 'init_data_mismatch'
  | 'sender_mismatch'
  | 'address_mismatch';

export type OwnWalletAccountCheckV1 = { ok: true; accountAddress: string } | { ok: false; reasonCode: OwnWalletAccountProblemV1; field: string };

const no = (reasonCode: OwnWalletAccountProblemV1, field: string): { ok: false; reasonCode: OwnWalletAccountProblemV1; field: string } => ({ ok: false, reasonCode, field });

/** Decodes `initialize(...)` and checks each part against the pinned form and the local key. */
function checkInitialize(initData: string, key: OwnWalletRootKeyV1): { ok: true } | { ok: false; reasonCode: OwnWalletAccountProblemV1; field: string } {
  let args: ReturnType<typeof KERNEL_INITIALIZE_IFACE_V1.decodeFunctionData>;
  try {
    args = KERNEL_INITIALIZE_IFACE_V1.decodeFunctionData('initialize', initData);
  } catch {
    return no('init_data_malformed', 'factoryData.initData');
  }
  if (String(args[0]).toLowerCase() !== OWN_WALLET_ROOT_VALIDATION_ID_V1) return no('root_validator_not_pinned', 'factoryData.initData.rootValidator');
  if (String(args[1]).toLowerCase() !== ZERO_ADDRESS) return no('hook_not_zero', 'factoryData.initData.hook');
  let threshold: bigint;
  let creds: Array<[bigint, bigint, boolean]>;
  try {
    const decoded = coder.decode(['uint256', 'tuple(uint256,uint256,bool)[]'], String(args[2]));
    threshold = BigInt(decoded[0]);
    creds = (decoded[1] as unknown as Array<[bigint, bigint, boolean]>).map((c) => [BigInt(c[0]), BigInt(c[1]), Boolean(c[2])]);
  } catch {
    return no('init_data_malformed', 'factoryData.initData.validatorData');
  }
  if (threshold !== BigInt(1) || creds.length !== 1) return no('root_key_mismatch', 'factoryData.initData.validatorData');
  if (creds[0][0] !== BigInt(key.pubKeyX) || creds[0][1] !== BigInt(key.pubKeyY)) return no('root_key_mismatch', 'factoryData.initData.validatorData');
  if (creds[0][2] !== true) return no('require_uv_missing', 'factoryData.initData.validatorData');
  if (String(args[3]) !== '0x') return no('hook_data_not_empty', 'factoryData.initData.hookData');
  if ((args[4] as unknown as unknown[]).length !== 0) return no('init_config_not_empty', 'factoryData.initData.initConfig');
  // Byte-exact: no trailing bytes, no non-canonical offsets.
  if (initData.toLowerCase() !== encodeKernelInitializeV1(key)) return no('init_data_mismatch', 'factoryData.initData');
  return { ok: true };
}

/**
 * W2.6 `deploy_setup` hard checks on `factory` / `factoryData` / `sender`: the chain's pinned deployment path, the
 * pinned root validator with exactly the key in L (UV required), no hook, empty hook data and `initConfig`, the salt
 * from L's index, and `sender` equal to the address computed here.
 */
export function checkAccountFactoryV1(input: {
  chainId: OwnWalletChainIdV1;
  factory: string | null;
  factoryData: string;
  sender: string;
  local: { kind: OwnWalletAccountKindV1; saltIndex: number } & OwnWalletRootKeyV1;
}): OwnWalletAccountCheckV1 {
  const key = normalizeRootKeyV1(input.local);
  const salt = ownWalletSaltV1(input.local.kind, input.local.saltIndex);
  if (!key || !salt) return no('local_key_invalid', 'local');
  const deploy = OWN_WALLET_ACCOUNT_DEPLOY_V1[input.chainId];
  const factory = typeof input.factory === 'string' ? input.factory.toLowerCase() : '';
  let initData: string;
  let usedSalt: string;
  try {
    if (deploy === 'kernel_factory_direct') {
      if (factory !== KERNEL_FACTORY) return no('factory_not_pinned', 'factory');
      if (!input.factoryData.startsWith(KERNEL_FACTORY_IFACE_V1.getFunction('createAccount').selector)) return no('factory_call_not_allowed', 'factoryData');
      const args = KERNEL_FACTORY_IFACE_V1.decodeFunctionData('createAccount', input.factoryData);
      initData = String(args[0]).toLowerCase();
      usedSalt = String(args[1]).toLowerCase();
      if (KERNEL_FACTORY_IFACE_V1.encodeFunctionData('createAccount', [initData, usedSalt]).toLowerCase() !== input.factoryData.toLowerCase()) return no('factory_data_malformed', 'factoryData');
    } else {
      if (factory !== FACTORY_STAKER) return no('factory_not_pinned', 'factory');
      if (!input.factoryData.startsWith(KERNEL_FACTORY_IFACE_V1.getFunction('deployWithFactory').selector)) return no('factory_call_not_allowed', 'factoryData');
      const args = KERNEL_FACTORY_IFACE_V1.decodeFunctionData('deployWithFactory', input.factoryData);
      if (String(args[0]).toLowerCase() !== KERNEL_FACTORY) return no('inner_factory_not_pinned', 'factoryData.factory');
      initData = String(args[1]).toLowerCase();
      usedSalt = String(args[2]).toLowerCase();
      if (KERNEL_FACTORY_IFACE_V1.encodeFunctionData('deployWithFactory', [KERNEL_FACTORY, initData, usedSalt]).toLowerCase() !== input.factoryData.toLowerCase()) return no('factory_data_malformed', 'factoryData');
    }
  } catch {
    return no('factory_data_malformed', 'factoryData');
  }
  const init = checkInitialize(initData, key);
  if (init.ok === false) return init;
  if (usedSalt !== salt) return no('salt_mismatch', 'factoryData.salt');
  const address = kernelAccountAddressV1(initData, salt);
  if (input.sender.toLowerCase() !== address) return no('sender_mismatch', 'sender');
  return { ok: true, accountAddress: address };
}

/**
 * Whether the page may show (and let the owner copy, fund or share) an address the server gave: only when it equals
 * the address computed from the key in L with L's kind and index (W1.1 (c), W1.2). Anything else shows no address.
 */
export function displayableAccountAddressV1(serverAddress: unknown, local: { kind: OwnWalletAccountKindV1; saltIndex: number } & OwnWalletRootKeyV1): string | null {
  if (typeof serverAddress !== 'string' || !/^0x[0-9a-fA-F]{40}$/.test(serverAddress)) return null;
  const mine = localAccountOfV1(local);
  if (!mine) return null;
  return serverAddress.toLowerCase() === mine.accountAddress ? mine.accountAddress : null;
}

/**
 * `POST /wallet-requests/:ref/credential` answers what the server computed for the new key; the page recomputes it
 * and refuses any difference (then it does not write L and shows no address).
 */
export function checkServerAccountV1(
  server: { accountAddress: string; initData: string; salt: string; saltIndex: number; kind: OwnWalletAccountKindV1 },
  key: OwnWalletRootKeyV1,
): { ok: true; account: OwnWalletLocalAccountV1 } | { ok: false; reasonCode: OwnWalletAccountProblemV1; field: string } {
  const mine = localAccountOfV1({ kind: server.kind, saltIndex: server.saltIndex, ...key });
  if (!mine) return no('local_key_invalid', 'local');
  if (String(server.initData).toLowerCase() !== mine.initData) return no('init_data_mismatch', 'initData');
  if (String(server.salt).toLowerCase() !== mine.salt) return no('salt_mismatch', 'salt');
  if (String(server.accountAddress).toLowerCase() !== mine.accountAddress) return no('address_mismatch', 'accountAddress');
  return { ok: true, account: mine };
}
