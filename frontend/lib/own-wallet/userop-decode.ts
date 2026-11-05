/**
 * L8-6 own wallet, web side: local decoding of what the owner is asked to sign (design W2.5 (d), W2.6). Pure
 * functions over ethers; no key, no network.
 *
 * Every decoder re-encodes what it decoded and compares bytes, so trailing bytes, non-canonical offsets or padding
 * cannot make the page show one thing while the account executes another. A decoder answers `null` for anything that
 * is not exactly the expected call.
 */
import { AbiCoder, Interface, dataLength, dataSlice, getAddress, solidityPacked, toUtf8String } from 'ethers';
import { EXEC_MODE_RULES_V1, ownWalletModuleV1 } from '../../../shared/types/agent-own-wallet';

const coder = AbiCoder.defaultAbiCoder();

export const KERNEL_EXECUTE_IFACE_V1 = new Interface([
  'function execute(bytes32 execMode, bytes executionCalldata) payable',
  'function installModule(uint256 moduleType, address module, bytes initData) payable',
  'function isModuleInstalled(uint256 moduleType, address module, bytes additionalContext) view returns (bool)',
]);
export const WEBAUTHN_VALIDATOR_IFACE_V1 = new Interface([
  'function addCredential(uint256 pubKeyX, uint256 pubKeyY, bool requireUV)',
  'function removeCredential(uint256 pubKeyX, uint256 pubKeyY)',
  'function getCredentialIds(address account) view returns (bytes32[])',
  'function getCredentialInfo(bytes32 credentialId, address account) view returns (uint256 pubKeyX, uint256 pubKeyY, bool requireUV)',
  'function threshold(address account) view returns (uint256)',
]);
export const SOCIAL_RECOVERY_IFACE_V1 = new Interface([
  'function addGuardian(address guardian)',
  'function removeGuardian(address prevGuardian, address guardian)',
  'function setThreshold(uint256 threshold)',
  'function getGuardians(address account) view returns (address[])',
  'function threshold(address account) view returns (uint256)',
]);
export const SMART_SESSIONS_IFACE_V1 = new Interface([
  'function removeSession(bytes32 permissionId)',
  'function getPermissionIDs(address account) view returns (bytes32[])',
]);
export const ERC8004_REGISTRY_IFACE_V1 = new Interface([
  'function register(string agentURI, (string metadataKey, bytes metadataValue)[] metadata) returns (uint256)',
  'function setAgentURI(uint256 agentId, string newURI)',
  'function setMetadata(uint256 agentId, string metadataKey, bytes metadataValue)',
  'function transferFrom(address from, address to, uint256 tokenId)',
  'function ownerOf(uint256 tokenId) view returns (address)',
]);
export const ERC20_IFACE_V1 = new Interface(['function transfer(address to, uint256 amount) returns (bool)']);

const SOCIAL_RECOVERY = ownWalletModuleV1('socialRecovery').address.toLowerCase();
/** Kernel's "no hook needed" marker for a non-root validator. */
export const KERNEL_HOOK_NOT_NEEDED_V1 = '0x0000000000000000000000000000000000000001';

export interface OwnWalletExecutionV1 {
  target: string;
  value: bigint;
  data: string;
}

export interface OwnWalletExecuteCallV1 {
  callType: 'single' | 'batch';
  executions: OwnWalletExecutionV1[];
}

/**
 * `execute(bytes32 mode, bytes executionCalldata)` → its executions. Single is ERC-7579 packed `target ‖ value ‖ data`;
 * batch is `abi.encode((address,uint256,bytes)[])`. The mode itself is checked by `execModeProblemV1` (shared).
 */
export function decodeExecuteCallV1(callData: string): OwnWalletExecuteCallV1 | null {
  let mode: string;
  let executionCalldata: string;
  try {
    const args = KERNEL_EXECUTE_IFACE_V1.decodeFunctionData('execute', callData);
    mode = String(args[0]).toLowerCase();
    executionCalldata = String(args[1]).toLowerCase();
    if (KERNEL_EXECUTE_IFACE_V1.encodeFunctionData('execute', [mode, executionCalldata]).toLowerCase() !== callData.toLowerCase()) return null;
  } catch {
    return null;
  }
  const callType = mode.slice(2, 4);
  if (callType === EXEC_MODE_RULES_V1.callTypes.single) {
    if (dataLength(executionCalldata) < 52) return null;
    return {
      callType: 'single',
      executions: [{ target: dataSlice(executionCalldata, 0, 20).toLowerCase(), value: BigInt(dataSlice(executionCalldata, 20, 52)), data: dataSlice(executionCalldata, 52).toLowerCase() }],
    };
  }
  if (callType === EXEC_MODE_RULES_V1.callTypes.batch) {
    try {
      const [calls] = coder.decode(['tuple(address,uint256,bytes)[]'], executionCalldata);
      const executions = (calls as unknown as Array<[string, bigint, string]>).map((c) => ({ target: String(c[0]).toLowerCase(), value: BigInt(c[1]), data: String(c[2]).toLowerCase() }));
      const again = coder.encode(['tuple(address,uint256,bytes)[]'], [executions.map((e) => [getAddress(e.target), e.value, e.data])]).toLowerCase();
      if (again !== executionCalldata) return null;
      return { callType: 'batch', executions };
    } catch {
      return null;
    }
  }
  return null;
}

/** ERC-7579 single execution calldata (the backend assembles the same). */
export function encodeSingleExecutionV1(target: string, value: bigint, data: string): string {
  return solidityPacked(['address', 'uint256', 'bytes'], [getAddress(target), value, data]).toLowerCase();
}

/** Decodes one call of `iface.fn` and requires the bytes to be exactly its canonical encoding. */
export function decodeExactCallV1(iface: Interface, fn: string, data: string): unknown[] | null {
  try {
    const fragment = iface.getFunction(fn);
    if (!fragment || !data.toLowerCase().startsWith(fragment.selector)) return null;
    const args = iface.decodeFunctionData(fragment, data);
    const values = Array.from(args as unknown as unknown[]);
    if (iface.encodeFunctionData(fragment, values).toLowerCase() !== data.toLowerCase()) return null;
    return values;
  } catch {
    return null;
  }
}

export interface OwnWalletRecoveryInstallV1 {
  threshold: number;
  /** In the order they are encoded (W2.6 requires strictly ascending; the check is the caller's). */
  guardians: string[];
}

/**
 * `installModule(1, SocialRecovery, address(1) ‖ abi.encode(abi.encode(threshold, guardians), 0x, 0xe9ae5c53))`, the
 * only self-call a root UserOp may contain (`deploy_setup`, `install_recovery`).
 */
export function decodeSocialRecoveryInstallV1(data: string): OwnWalletRecoveryInstallV1 | null {
  const args = decodeExactCallV1(KERNEL_EXECUTE_IFACE_V1, 'installModule', data);
  if (!args) return null;
  if (BigInt(args[0] as bigint) !== BigInt(1) || String(args[1]).toLowerCase() !== SOCIAL_RECOVERY) return null;
  const initData = String(args[2]).toLowerCase();
  if (dataLength(initData) < 20 || dataSlice(initData, 0, 20).toLowerCase() !== KERNEL_HOOK_NOT_NEEDED_V1) return null;
  try {
    const [validatorData, hookData, selectorData] = coder.decode(['bytes', 'bytes', 'bytes'], dataSlice(initData, 20));
    if (String(hookData) !== '0x' || String(selectorData).toLowerCase() !== EXEC_MODE_RULES_V1.outerSelector) return null;
    const [threshold, guardians] = coder.decode(['uint256', 'address[]'], String(validatorData));
    const list = (guardians as unknown as string[]).map((g) => String(g).toLowerCase());
    const t = BigInt(threshold);
    if (t > BigInt(64)) return null;
    // Byte-exact re-encoding of the whole call.
    const vData = coder.encode(['uint256', 'address[]'], [t, list.map((g) => getAddress(g))]);
    const again = KERNEL_EXECUTE_IFACE_V1.encodeFunctionData('installModule', [
      1,
      getAddress(SOCIAL_RECOVERY),
      solidityPacked(['address', 'bytes'], [KERNEL_HOOK_NOT_NEEDED_V1, coder.encode(['bytes', 'bytes', 'bytes'], [vData, '0x', EXEC_MODE_RULES_V1.outerSelector])]),
    ]);
    if (again.toLowerCase() !== data.toLowerCase()) return null;
    return { threshold: Number(t), guardians: list };
  } catch {
    return null;
  }
}

export interface OwnWalletRegisterCallV1 {
  agentURI: string;
  metadata: Array<{ key: string; value: string }>;
}

/** ERC-8004 `register(string agentURI, (string,bytes)[] metadata)`. */
export function decodeRegisterCallV1(data: string): OwnWalletRegisterCallV1 | null {
  const args = decodeExactCallV1(ERC8004_REGISTRY_IFACE_V1, 'register', data);
  if (!args) return null;
  const metadata = Array.from(args[1] as unknown as Array<[string, string]>).map((m) => ({ key: String(m[0]), value: String(m[1]).toLowerCase() }));
  return { agentURI: String(args[0]), metadata };
}

export interface OwnWalletCredentialCallV1 {
  pubKeyX: string;
  pubKeyY: string;
  requireUV?: boolean;
}

const word = (v: unknown): string => '0x' + BigInt(v as bigint).toString(16).padStart(64, '0');

/** WebAuthnValidator `addCredential(x, y, requireUV)`. */
export function decodeAddCredentialV1(data: string): Required<OwnWalletCredentialCallV1> | null {
  const args = decodeExactCallV1(WEBAUTHN_VALIDATOR_IFACE_V1, 'addCredential', data);
  if (!args) return null;
  return { pubKeyX: word(args[0]), pubKeyY: word(args[1]), requireUV: Boolean(args[2]) };
}

/** WebAuthnValidator `removeCredential(x, y)`. */
export function decodeRemoveCredentialV1(data: string): OwnWalletCredentialCallV1 | null {
  const args = decodeExactCallV1(WEBAUTHN_VALIDATOR_IFACE_V1, 'removeCredential', data);
  if (!args) return null;
  return { pubKeyX: word(args[0]), pubKeyY: word(args[1]) };
}

/** ERC-20 `transfer(to, amount)`. */
export function decodeErc20TransferV1(data: string): { to: string; amount: bigint } | null {
  const args = decodeExactCallV1(ERC20_IFACE_V1, 'transfer', data);
  if (!args) return null;
  return { to: String(args[0]).toLowerCase(), amount: BigInt(args[1] as bigint) };
}

export type OwnWalletGuardianOpV1 =
  | { op: 'add'; guardian: string }
  | { op: 'remove'; prevGuardian: string; guardian: string }
  | { op: 'set_threshold'; threshold: number };

/** One SocialRecovery configuration call (`set_guardians`). */
export function decodeGuardianOpV1(data: string): OwnWalletGuardianOpV1 | null {
  const add = decodeExactCallV1(SOCIAL_RECOVERY_IFACE_V1, 'addGuardian', data);
  if (add) return { op: 'add', guardian: String(add[0]).toLowerCase() };
  const remove = decodeExactCallV1(SOCIAL_RECOVERY_IFACE_V1, 'removeGuardian', data);
  if (remove) return { op: 'remove', prevGuardian: String(remove[0]).toLowerCase(), guardian: String(remove[1]).toLowerCase() };
  const set = decodeExactCallV1(SOCIAL_RECOVERY_IFACE_V1, 'setThreshold', data);
  if (set) {
    const t = BigInt(set[0] as bigint);
    if (t > BigInt(64)) return null;
    return { op: 'set_threshold', threshold: Number(t) };
  }
  return null;
}

/** SmartSessions `removeSession(permissionId)`. */
export function decodeRemoveSessionV1(data: string): string | null {
  const args = decodeExactCallV1(SMART_SESSIONS_IFACE_V1, 'removeSession', data);
  return args ? String(args[0]).toLowerCase() : null;
}

export type OwnWalletRegistryCallV1 =
  | { fn: 'setAgentURI'; agentId: bigint; uri: string }
  | { fn: 'setMetadata'; agentId: bigint; key: string; value: string }
  | { fn: 'transferFrom'; from: string; to: string; agentId: bigint };

/** The registry calls `revoke_registration` may contain. */
export function decodeRegistryCallV1(data: string): OwnWalletRegistryCallV1 | null {
  const uri = decodeExactCallV1(ERC8004_REGISTRY_IFACE_V1, 'setAgentURI', data);
  if (uri) return { fn: 'setAgentURI', agentId: BigInt(uri[0] as bigint), uri: String(uri[1]) };
  const meta = decodeExactCallV1(ERC8004_REGISTRY_IFACE_V1, 'setMetadata', data);
  if (meta) return { fn: 'setMetadata', agentId: BigInt(meta[0] as bigint), key: String(meta[1]), value: String(meta[2]).toLowerCase() };
  const transfer = decodeExactCallV1(ERC8004_REGISTRY_IFACE_V1, 'transferFrom', data);
  if (transfer) return { fn: 'transferFrom', from: String(transfer[0]).toLowerCase(), to: String(transfer[1]).toLowerCase(), agentId: BigInt(transfer[2] as bigint) };
  return null;
}

/** Metadata bytes as UTF-8 text; `null` when they are not valid UTF-8. */
export function metadataTextV1(value: string): string | null {
  try {
    return toUtf8String(value);
  } catch {
    return null;
  }
}

export interface OwnWalletKernelNonceV1 {
  /** Validation mode byte: 0x00 default, 0x01 enable, 0x02 install. */
  mode: number;
  /** Validation type byte: 0x00 root, 0x01 validator, 0x02 permission. */
  vType: number;
  /** The 20 identifier bytes (zero for root). */
  validator: string;
  nonceKey: number;
  sequence: bigint;
}

/** Kernel v3 nonce: mode(1) ‖ type(1) ‖ validator(20) ‖ key(2) ‖ sequence(8). */
export function decodeKernelNonceV1(nonce: string): OwnWalletKernelNonceV1 | null {
  if (!/^(0|[1-9][0-9]{0,77})$/.test(nonce)) return null;
  const n = BigInt(nonce);
  if (n >= BigInt(1) << BigInt(256)) return null;
  const hex = n.toString(16).padStart(64, '0');
  return {
    mode: parseInt(hex.slice(0, 2), 16),
    vType: parseInt(hex.slice(2, 4), 16),
    validator: '0x' + hex.slice(4, 44),
    nonceKey: parseInt(hex.slice(44, 48), 16),
    sequence: BigInt('0x' + hex.slice(48)),
  };
}

const ZERO_VALIDATOR = '0x' + '00'.repeat(20);

/** The UserOp is validated by the root validator (the wallet passkey): default mode, root type, key 0. */
export function isRootNonceV1(nonce: string): boolean {
  const d = decodeKernelNonceV1(nonce);
  return !!d && d.mode === 0 && d.vType === 0 && d.validator === ZERO_VALIDATOR && d.nonceKey === 0;
}

/** The UserOp is validated by SocialRecovery as a plain validator (recovery code or guardians, design 5.4). */
export function isRecoveryNonceV1(nonce: string): boolean {
  const d = decodeKernelNonceV1(nonce);
  return !!d && d.mode === 0 && d.vType === 1 && d.validator === SOCIAL_RECOVERY && d.nonceKey === 0;
}
