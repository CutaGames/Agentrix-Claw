/**
 * L8-6 S2 hardhat fixture: the pinned on-chain contracts at their real addresses on the local chain (chain id 97).
 *
 * - MIT runtime bytecode is in contract/test/vendor/own-wallet/ (decision A4). GPL / AGPL bytecode (EntryPoint v0.7 and
 *   its SenderCreator, WebAuthnValidator, SmartSessions, SocialRecovery) and the CREATE2 deployer are not in the
 *   repository: `loadVendorCode()` reads them from a public RPC (97 first, then 84532) before the tests and checks the
 *   codehash in manifest.json. A missing or different code fails the test run; nothing is skipped (plan P6).
 * - Storage that the contracts need is replayed with hardhat_setStorageAt; every value is in manifest.json `storage`
 *   with the chain, block and slot it was read from (eth_getStorageAt, S2 read-only script, 10-29).
 * - The Kernel implementation bytecode is the 97 one: its two immutables cache chain id 97 and the 97 EIP-712 domain
 *   separator, which match this local chain.
 * - `chainProfile` 97 keeps FactoryStaker's approval of the v3.1 factory false (its 97 state, E137); 84532 sets it to
 *   the value read on 84532 (true), so both deployment paths can be tested here.
 */
import * as crypto from "crypto";
import * as fs from "fs";
import * as path from "path";
import { ethers, network } from "hardhat";
import {
  AbiCoder,
  Contract,
  Interface,
  JsonRpcProvider,
  SigningKey,
  TypedDataEncoder,
  ZeroAddress,
  concat,
  getAddress,
  getBytes,
  getCreate2Address,
  keccak256,
  sha256,
  solidityPacked,
  toBeHex,
  toQuantity,
  toUtf8Bytes,
} from "ethers";
import { assertSmartAccountTestnet } from "../../scripts/lib/testnet-guard";

export const VENDOR_DIR = path.join(__dirname, "..", "vendor", "own-wallet");
export const VECTORS_FILE = path.join(__dirname, "..", "..", "..", "shared", "types", "__fixtures__", "agent-own-wallet-vectors.json");

export const ENTRY_POINT = "0x0000000071727De22E5E9d8BAf0edAc6f37da032";
export const KERNEL_FACTORY = "0xaac5D4240AF87249B3f71BC8E4A2cae074A3E419";
export const KERNEL_IMPLEMENTATION = "0xBAC849bB641841b44E965fB01A4Bf5F074f84b4D";
export const FACTORY_STAKER = "0xd703aaE79538628d27099B8c4f621bE4CCd142d5";
export const WEBAUTHN_VALIDATOR = "0x0000000000578c4cB0e472a5462da43C495C3F33";
export const SMART_SESSIONS = "0x00000000008bDABA73cD9815d79069c247Eb4bDA";
export const SOCIAL_RECOVERY = "0xA04D053b3C8021e8D5bF641816c42dAA75D8b597";
export const REGISTRY = "0x8004A818BFB912233c491871b3d84c89A494BD9e";
export const CREATE2_DEPLOYER = "0x4e59b44847b379578588920ca78fbf26c0b4956c";
export const DEAD = "0x000000000000000000000000000000000000dEaD";
/** LibClone ERC-1967 proxy initcode hash for the Kernel v3.1 implementation (design 1a). */
export const KERNEL_V31_INIT_CODE_HASH = "0x85d96aa1c9a65886d094915d76ccae85f14027a02c1647dde659f869460f03e6";
export const EXECUTE_SELECTOR = "0xe9ae5c53";
export const MODE_SINGLE = "0x" + "00".repeat(32);
export const MODE_BATCH = "0x01" + "00".repeat(31);
export const MODE_DELEGATECALL = "0xff" + "00".repeat(31);
export const P256_N = 0xffffffff00000000ffffffffffffffffbce6faada7179e84f3b9cac2fc632551n;
export const WALLET_RP_ID = "wallet.agentrix.top";
export const LOGIN_RP_ID = "agentrix.top";

const PUBLIC_RPC: Array<{ chainId: number; url: string }> = [
  { chainId: 97, url: "https://data-seed-prebsc-1-s1.binance.org:8545" },
  { chainId: 84532, url: "https://sepolia.base.org" },
];

export const coder = AbiCoder.defaultAbiCoder();

const USER_OP_TUPLE = "(address sender,uint256 nonce,bytes initCode,bytes callData,bytes32 accountGasLimits,uint256 preVerificationGas,bytes32 gasFees,bytes paymasterAndData,bytes signature)";
export const EP_IFACE = new Interface([
  `function handleOps(${USER_OP_TUPLE}[] ops, address beneficiary)`,
  `function getUserOpHash(${USER_OP_TUPLE} userOp) view returns (bytes32)`,
  "function getNonce(address sender, uint192 key) view returns (uint256)",
  "function depositTo(address account) payable",
  "function balanceOf(address account) view returns (uint256)",
  "event UserOperationEvent(bytes32 indexed userOpHash, address indexed sender, address indexed paymaster, uint256 nonce, bool success, uint256 actualGasCost, uint256 actualGasUsed)",
  "event AccountDeployed(bytes32 indexed userOpHash, address indexed sender, address factory, address paymaster)",
  "event UserOperationRevertReason(bytes32 indexed userOpHash, address indexed sender, uint256 nonce, bytes revertReason)",
  "error FailedOp(uint256 opIndex, string reason)",
  "error FailedOpWithRevert(uint256 opIndex, string reason, bytes inner)",
]);
export const KERNEL_IFACE = new Interface([
  "function initialize(bytes21 rootValidator, address hook, bytes validatorData, bytes hookData, bytes[] initConfig)",
  "function execute(bytes32 execMode, bytes executionCalldata) payable",
  "function installModule(uint256 moduleType, address module, bytes initData) payable",
  "function isModuleInstalled(uint256 moduleType, address module, bytes additionalContext) view returns (bool)",
  "function isValidSignature(bytes32 hash, bytes signature) view returns (bytes4)",
  "function upgradeTo(address newImplementation) payable",
]);
export const FACTORY_IFACE = new Interface([
  "function createAccount(bytes data, bytes32 salt) payable returns (address)",
  "function getAddress(bytes data, bytes32 salt) view returns (address)",
  "function deployWithFactory(address factory, bytes createData, bytes32 salt) payable returns (address)",
  "function approved(address factory) view returns (bool)",
  "error NotApprovedFactory()",
]);
export const WEBAUTHN_IFACE = new Interface([
  "function validateSignatureWithData(bytes32 hash, bytes signature, bytes data) view returns (bool)",
  "function addCredential(uint256 pubKeyX, uint256 pubKeyY, bool requireUV)",
  "function removeCredential(uint256 pubKeyX, uint256 pubKeyY)",
  "function setThreshold(uint256 threshold)",
  "function threshold(address account) view returns (uint256)",
  "function getCredentialIds(address account) view returns (bytes32[])",
  "function generateCredentialId(uint256 pubKeyX, uint256 pubKeyY, address account) pure returns (bytes32)",
  "function name() pure returns (string)",
  "function version() pure returns (string)",
  "error CannotRemoveCredential()",
  "error InvalidThreshold()",
  "error CredentialAlreadyExists()",
]);
export const RECOVERY_IFACE = new Interface(["function getGuardians(address account) view returns (address[])", "function threshold(address account) view returns (uint256)", "error NotSortedAndUnique()"]);
export const REGISTRY_IFACE = new Interface([
  "function register(string agentURI, (string metadataKey, bytes metadataValue)[] metadata) returns (uint256)",
  "function register(string agentURI) returns (uint256)",
  "function ownerOf(uint256 agentId) view returns (address)",
  "function balanceOf(address owner) view returns (uint256)",
  "function tokenURI(uint256 agentId) view returns (string)",
  "function getMetadata(uint256 agentId, string metadataKey) view returns (bytes)",
  "function setMetadata(uint256 agentId, string metadataKey, bytes metadataValue)",
  "function getAgentWallet(uint256 agentId) view returns (address)",
  "function transferFrom(address from, address to, uint256 tokenId)",
  "function getVersion() pure returns (string)",
  "event Registered(uint256 indexed agentId, string agentURI, address indexed owner)",
]);

export interface ManifestContract {
  name: string;
  address: string;
  readChainId: number;
  codehash: string;
  license: string;
  inRepo: boolean;
  file?: string;
}
export interface ManifestStorage {
  contract: string;
  address: string;
  slot: string;
  value: string;
  readChainId: number;
  what: string;
}
export interface Manifest {
  contracts: ManifestContract[];
  storage: ManifestStorage[];
}

export function readJson<T = any>(file: string): T {
  return JSON.parse(fs.readFileSync(file, "utf8")) as T;
}
export const manifest = (): Manifest => readJson<Manifest>(path.join(VENDOR_DIR, "manifest.json"));
export const vectors = (): any => readJson(VECTORS_FILE);
export const policiesCreate2 = (): any => readJson(path.join(VENDOR_DIR, "policies-create2.json"));

let codeCache: Map<string, string> | null = null;

async function fetchCode(entry: ManifestContract): Promise<string> {
  const errors: string[] = [];
  for (const rpc of PUBLIC_RPC) {
    const provider = new JsonRpcProvider(rpc.url, rpc.chainId, { staticNetwork: true });
    try {
      assertSmartAccountTestnet(BigInt(await provider.send("eth_chainId", [])));
      const code: string = await provider.send("eth_getCode", [entry.address, "latest"]);
      if (code !== "0x" && keccak256(code) === entry.codehash) return code;
      errors.push(`${rpc.chainId}: codehash ${code === "0x" ? "none" : keccak256(code)}`);
    } catch (e) {
      errors.push(`${rpc.chainId}: ${(e as Error).message.slice(0, 120)}`);
    } finally {
      provider.destroy();
    }
  }
  throw new Error(`vendor bytecode for ${entry.name} (${entry.license}) could not be read with the pinned codehash ${entry.codehash}: ${errors.join("; ")}`);
}

/** All pinned runtime code by contract name: MIT from the repository, the rest from a public RPC (checked). */
export async function loadVendorCode(): Promise<Map<string, string>> {
  if (codeCache) return codeCache;
  const out = new Map<string, string>();
  for (const entry of manifest().contracts) {
    let code: string;
    if (entry.inRepo) {
      code = readJson<{ runtimeBytecode: string }>(path.join(VENDOR_DIR, entry.file as string)).runtimeBytecode;
      if (keccak256(code) !== entry.codehash) throw new Error(`vendor file ${entry.file} does not match its pinned codehash`);
    } else {
      code = await fetchCode(entry);
    }
    out.set(entry.name, code);
  }
  codeCache = out;
  return out;
}

export interface InstallOptions {
  chainProfile?: 97 | 84532;
  /** Leave the three policies 97 does not have (E137) without code. */
  withoutRehearsalPolicies?: boolean;
}

const REHEARSAL_POLICIES = ["valueLimitPolicy", "timeFramePolicy", "usageLimitPolicy"];

export async function installVendor(options: InstallOptions = {}): Promise<void> {
  const codes = await loadVendorCode();
  for (const entry of manifest().contracts) {
    if (options.withoutRehearsalPolicies && REHEARSAL_POLICIES.includes(entry.name)) continue;
    await network.provider.send("hardhat_setCode", [entry.address, codes.get(entry.name)]);
  }
  for (const s of manifest().storage) {
    let value = s.value;
    if (s.contract === "factoryStaker" && s.what.startsWith("approved[")) value = (options.chainProfile ?? 97) === 84532 ? s.value : "0x" + "00".repeat(32);
    // the slot goes as an RPC quantity (no leading zeros), the value as 32 bytes
    await network.provider.send("hardhat_setStorageAt", [s.address, toQuantity(s.slot), value]);
  }
}

// ------------------------------------------------------------------------------------------------ soft keys

export interface SoftP256 {
  x: bigint;
  y: bigint;
  sign(message: Uint8Array): { r: bigint; s: bigint };
}

/** A P-256 key made with node's crypto; signs ECDSA-P256-SHA256 (hashes the message once, the WebAuthn definition). */
export function newSoftP256(): SoftP256 {
  const { privateKey, publicKey } = crypto.generateKeyPairSync("ec", { namedCurve: "P-256" });
  const jwk = publicKey.export({ format: "jwk" }) as crypto.JsonWebKey;
  const toBig = (v?: string) => BigInt("0x" + Buffer.from(v as string, "base64url").toString("hex"));
  return {
    x: toBig(jwk.x),
    y: toBig(jwk.y),
    sign(message: Uint8Array) {
      const sig = crypto.sign("sha256", Buffer.from(message), { key: privateKey, dsaEncoding: "ieee-p1363" });
      return { r: BigInt("0x" + sig.subarray(0, 32).toString("hex")), s: BigInt("0x" + sig.subarray(32).toString("hex")) };
    },
  };
}

export interface WebAuthnAuth {
  authenticatorData: string;
  clientDataJSON: string;
  challengeIndex: number;
  typeIndex: number;
  r: bigint;
  s: bigint;
}
export const AUTH_TUPLE = "tuple(bytes,string,uint256,uint256,uint256,uint256)";
export const authValues = (a: WebAuthnAuth) => [a.authenticatorData, a.clientDataJSON, a.challengeIndex, a.typeIndex, a.r, a.s];

export interface AssertionOptions {
  rpId?: string;
  /** authenticatorData flags; 0x05 = UP | UV. */
  flags?: number;
  origin?: string;
  /** Device session format (design 1b(b)): fixed authenticatorData and a clientDataJSON with type and challenge only. */
  device?: boolean;
  keepHighS?: boolean;
}

/** A WebAuthn assertion over `hash` (the challenge is abi.encode(hash), base64url), low s unless asked otherwise. */
export function assertion(key: SoftP256, hash: string, options: AssertionOptions = {}): WebAuthnAuth {
  const authenticatorData = options.device
    ? concat([sha256(toUtf8Bytes("agentrix-device-session")), "0x01", "0x00000000"])
    : concat([sha256(toUtf8Bytes(options.rpId ?? WALLET_RP_ID)), toBeHex(options.flags ?? 0x05, 1), "0x00000000"]);
  const challenge = Buffer.from(getBytes(hash)).toString("base64url");
  const clientDataJSON = options.device
    ? `{"type":"webauthn.get","challenge":"${challenge}"}`
    : `{"type":"webauthn.get","challenge":"${challenge}","origin":"${options.origin ?? "https://" + WALLET_RP_ID}","crossOrigin":false}`;
  const signed = key.sign(getBytes(concat([authenticatorData, sha256(toUtf8Bytes(clientDataJSON))])));
  const s = !options.keepHighS && signed.s > P256_N / 2n ? P256_N - signed.s : signed.s;
  return { authenticatorData, clientDataJSON, challengeIndex: clientDataJSON.indexOf('"challenge":"'), typeIndex: clientDataJSON.indexOf('"type":"webauthn.get"'), r: signed.r, s };
}

export const credentialIdOf = (key: { x: bigint; y: bigint }, account: string) => keccak256(coder.encode(["uint256", "uint256", "address"], [key.x, key.y, account]));

/** Root signature for the WebAuthnValidator: abi.encode(bytes32[] credIds, bool usePrecompile, WebAuthnAuth[]). */
export function rootSignature(key: SoftP256, account: string, hash: string, usePrecompile = true, options: AssertionOptions = {}): string {
  return coder.encode(["bytes32[]", "bool", `${AUTH_TUPLE}[]`], [[credentialIdOf(key, account)], usePrecompile, [authValues(assertion(key, hash, options))]]);
}

// ------------------------------------------------------------------------------------------------ account encoding

export const ROOT_VALIDATION_ID = "0x01" + WEBAUTHN_VALIDATOR.slice(2).toLowerCase();

export function saltOf(kind: "agent" | "owner_vault", saltIndex: number): string {
  return keccak256(solidityPacked(["string", "uint32"], [kind === "agent" ? "agentrix.agent.v1" : "agentrix.vault.v1", saltIndex]));
}

/** Kernel initialize calldata (design W1.1): root = WebAuthnValidator with one credential, hook 0, initConfig empty. */
export function initDataOf(key: { x: bigint; y: bigint }, initConfig: string[] = []): string {
  const validatorData = coder.encode(["uint256", "tuple(uint256,uint256,bool)[]"], [1, [[key.x, key.y, true]]]);
  return KERNEL_IFACE.encodeFunctionData("initialize", [ROOT_VALIDATION_ID, ZeroAddress, validatorData, "0x", initConfig]);
}

/** The local address formula: CREATE2 by the factory, salt = keccak256(initData ‖ salt), LibClone ERC-1967 initcode. */
export function localKernelAddress(initData: string, salt: string): string {
  return getCreate2Address(KERNEL_FACTORY, keccak256(concat([initData, salt])), KERNEL_V31_INIT_CODE_HASH);
}

/** initCode for 97 (KernelFactory direct, E137) or 84532 (FactoryStaker.deployWithFactory). */
export function initCodeOf(initData: string, salt: string, via: "kernel_factory_direct" | "factory_staker"): string {
  return via === "kernel_factory_direct"
    ? concat([KERNEL_FACTORY, FACTORY_IFACE.encodeFunctionData("createAccount", [initData, salt])])
    : concat([FACTORY_STAKER, FACTORY_IFACE.encodeFunctionData("deployWithFactory", [KERNEL_FACTORY, initData, salt])]);
}

export const singleExecution = (target: string, value: bigint, data: string) => solidityPacked(["address", "uint256", "bytes"], [target, value, data]);
export const executeSingle = (target: string, value: bigint, data: string) => KERNEL_IFACE.encodeFunctionData("execute", [MODE_SINGLE, singleExecution(target, value, data)]);
export function executeBatch(calls: Array<[string, bigint, string]>): string {
  return KERNEL_IFACE.encodeFunctionData("execute", [MODE_BATCH, coder.encode(["tuple(address,uint256,bytes)[]"], [calls])]);
}

/** installModule(1, SocialRecovery, address(1) ‖ abi.encode(abi.encode(threshold, guardians), 0x, 0xe9ae5c53)). */
export function installRecoveryCall(threshold: number, guardians: string[]): string {
  const validatorData = coder.encode(["uint256", "address[]"], [threshold, guardians]);
  const initData = concat(["0x0000000000000000000000000000000000000001", coder.encode(["bytes", "bytes", "bytes"], [validatorData, "0x", EXECUTE_SELECTOR])]);
  return KERNEL_IFACE.encodeFunctionData("installModule", [1, SOCIAL_RECOVERY, initData]);
}

export const sortedGuardians = (list: string[]) => Array.from(new Set(list.map((a) => a.toLowerCase()))).sort().map((a) => getAddress(a));

/** deploy_setup callData (design 5.1 step 5): execute(batch, [installModule(SocialRecovery), (optional) register]). */
export function deploySetupCallData(account: string, threshold: number, guardians: string[], register?: { uri: string; metadata: Array<[string, string]> }): string {
  const calls: Array<[string, bigint, string]> = [[account, 0n, installRecoveryCall(threshold, guardians)]];
  if (register) calls.push([REGISTRY, 0n, REGISTRY_IFACE.encodeFunctionData("register(string,(string,bytes)[])", [register.uri, register.metadata])]);
  return executeBatch(calls);
}

// ------------------------------------------------------------------------------------------------ user operations

export interface PackedUserOp {
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
export const opValues = (op: PackedUserOp) => [op.sender, op.nonce, op.initCode, op.callData, op.accountGasLimits, op.preVerificationGas, op.gasFees, op.paymasterAndData, op.signature];
export const packUint128s = (high: bigint, low: bigint) => solidityPacked(["uint128", "uint128"], [high, low]);

/** Kernel nonce key: mode(1) ‖ type(1) ‖ validator(20) ‖ key(2); root = 0. */
export function validatorNonceKey(validator: string, type: 1 | 2 = 1): bigint {
  return BigInt(solidityPacked(["uint8", "uint8", "address", "uint16"], [0, type, validator, 0]));
}

export function entryPoint(signer?: any): Contract {
  return new Contract(ENTRY_POINT, EP_IFACE, signer ?? ethers.provider);
}

export interface OpInput {
  sender: string;
  callData: string;
  initCode?: string;
  nonceKey?: bigint;
  verificationGasLimit?: bigint;
  callGasLimit?: bigint;
  paymasterAndData?: string;
}

export async function buildOp(input: OpInput): Promise<PackedUserOp> {
  const nonce: bigint = await entryPoint().getNonce(input.sender, input.nonceKey ?? 0n);
  return {
    sender: input.sender,
    nonce,
    initCode: input.initCode ?? "0x",
    callData: input.callData,
    accountGasLimits: packUint128s(input.verificationGasLimit ?? 2_000_000n, input.callGasLimit ?? 2_000_000n),
    preVerificationGas: 100_000n,
    gasFees: packUint128s(1_000_000_000n, 2_000_000_000n),
    paymasterAndData: input.paymasterAndData ?? "0x",
    signature: "0x",
  };
}

export const userOpHashOf = async (op: PackedUserOp): Promise<string> => entryPoint().getUserOpHash(opValues(op));

/** Signs with the root WebAuthn credential (wallet passkey format). */
export async function signRoot(op: PackedUserOp, key: SoftP256, usePrecompile = true, options: AssertionOptions = {}): Promise<PackedUserOp> {
  return { ...op, signature: rootSignature(key, op.sender, await userOpHashOf(op), usePrecompile, options) };
}

export async function fund(account: string, amount = ethers.parseEther("1")): Promise<void> {
  const [payer] = await ethers.getSigners();
  await (await entryPoint(payer).depositTo(account, { value: amount })).wait();
}

export interface OpOutcome {
  success: boolean;
  userOpHash: string;
  sender: string;
  revertReason?: string;
  deployedBy?: string;
}

/** handleOps from the first signer (the test submitter); returns the UserOperationEvent. */
export async function submit(op: PackedUserOp): Promise<OpOutcome> {
  const [submitter] = await ethers.getSigners();
  const receipt = await (await entryPoint(submitter).handleOps([opValues(op)], submitter.address, { gasLimit: 15_000_000 })).wait();
  let outcome: OpOutcome | undefined;
  let revertReason: string | undefined;
  let deployedBy: string | undefined;
  for (const log of receipt.logs) {
    if (getAddress(log.address) !== getAddress(ENTRY_POINT)) continue;
    const parsed = EP_IFACE.parseLog(log);
    if (parsed?.name === "UserOperationEvent") outcome = { success: parsed.args.success, userOpHash: parsed.args.userOpHash, sender: getAddress(parsed.args.sender) };
    if (parsed?.name === "UserOperationRevertReason") revertReason = parsed.args.revertReason;
    if (parsed?.name === "AccountDeployed") deployedBy = getAddress(parsed.args.factory);
  }
  if (!outcome) throw new Error("no UserOperationEvent");
  return { ...outcome, revertReason, deployedBy };
}

/** The EntryPoint's refusal of a UserOp as "FailedOp:AA24 signature error" (from an eth_call of handleOps). */
export async function refusal(op: PackedUserOp): Promise<string> {
  const [submitter] = await ethers.getSigners();
  try {
    await entryPoint(submitter).handleOps.staticCall([opValues(op)], submitter.address, { gasLimit: 15_000_000 });
  } catch (e: any) {
    const data = e?.data ?? e?.error?.data ?? e?.info?.error?.data;
    const parsed = typeof data === "string" ? EP_IFACE.parseError(data) : null;
    if (parsed) return `${parsed.name}:${parsed.args[1]}`;
    if (e?.revert?.name) return `${e.revert.name}:${e.revert.args?.[1]}`;
    // hardhat also names the custom error in the message: ... FailedOp(0, "AA24 signature error")
    const fromMessage = /FailedOp(?:WithRevert)?\(\d+, "(AA\d\d[^"]*)"/.exec(String(e?.message ?? ""));
    if (fromMessage) return `FailedOp:${fromMessage[1]}`;
    throw e;
  }
  throw new Error("expected the EntryPoint to refuse the UserOp");
}

export interface DeployedAccount {
  key: SoftP256;
  address: string;
  initData: string;
  salt: string;
  guardians: string[];
}

/** Builds, signs and submits a deploy_setup UserOp on the 97 path; returns the deployed account. */
export async function deployAccount(options: { saltIndex?: number; guardians?: string[]; threshold?: number; register?: { uri: string; metadata: Array<[string, string]> }; via?: "kernel_factory_direct" | "factory_staker" } = {}): Promise<DeployedAccount & { outcome: OpOutcome }> {
  const key = newSoftP256();
  const initData = initDataOf(key);
  const salt = saltOf("agent", options.saltIndex ?? 0);
  const address = localKernelAddress(initData, salt);
  const guardians = options.guardians ?? sortedGuardians([ethers.Wallet.createRandom().address, ethers.Wallet.createRandom().address]);
  await fund(address);
  const op = await buildOp({ sender: address, initCode: initCodeOf(initData, salt, options.via ?? "kernel_factory_direct"), callData: deploySetupCallData(address, options.threshold ?? 1, guardians, options.register) });
  const outcome = await submit(await signRoot(op, key));
  return { key, address, initData, salt, guardians, outcome };
}

export async function codeAt(address: string): Promise<string> {
  return ethers.provider.getCode(address);
}

/** Mocha hooks: snapshot, install the vendor contracts, and revert after the file (registry ids do not leak). */
export function useVendor(options: InstallOptions = {}): void {
  let snapshot: string;
  before(async function () {
    this.timeout(300_000);
    snapshot = await network.provider.send("evm_snapshot", []);
    await installVendor(options);
  });
  after(async function () {
    await network.provider.send("evm_revert", [snapshot]);
  });
}

export async function snapshot(): Promise<string> {
  return network.provider.send("evm_snapshot", []);
}
export async function revertTo(id: string): Promise<void> {
  await network.provider.send("evm_revert", [id]);
}

export async function isRecoveryInstalled(account: string): Promise<boolean> {
  return new Contract(account, KERNEL_IFACE, ethers.provider).isModuleInstalled(1, SOCIAL_RECOVERY, "0x");
}

/** A root-signed UserOp from an already deployed account. */
export async function rootOp(account: DeployedAccount, callData: string, extra: Partial<OpInput> = {}): Promise<PackedUserOp> {
  return signRoot(await buildOp({ sender: account.address, callData, ...extra }), account.key);
}

// ------------------------------------------------------------------------------------------------ recovery (guardians)

export const RECOVERY_NONCE_KEY = validatorNonceKey(SOCIAL_RECOVERY, 1);

/** Guardian signatures: personal_sign of the 32-byte userOpHash, r ‖ s ‖ v each (design 5.4, A43). */
export async function guardianSignature(op: PackedUserOp, guardians: Array<{ signMessage(m: Uint8Array): Promise<string> }>): Promise<string> {
  const hash = getBytes(await userOpHashOf(op));
  return concat(await Promise.all(guardians.map((g) => g.signMessage(hash))));
}

/** WebAuthnValidator.addCredential(x, y, true) as a single execution (what a recovery UserOp carries). */
export function addCredentialExecution(key: { x: bigint; y: bigint }): string {
  return executeSingle(WEBAUTHN_VALIDATOR, 0n, WEBAUTHN_IFACE.encodeFunctionData("addCredential", [key.x, key.y, true]));
}

// ------------------------------------------------------------------------------------------------ sessions

export const SESSION_NONCE_KEY = validatorNonceKey(SMART_SESSIONS, 1);
export const VALUE_SELECTOR = "0xffffffff";
export const SMART_SESSIONS_IFACE = new Interface([
  "function removeSession(bytes32 permissionId)",
  "function isPermissionEnabled(bytes32 permissionId, address account) view returns (bool)",
]);
const POLICY_DATA = "tuple(address,bytes)";
export const SESSION_TUPLE = `tuple(address,bytes,bytes32,${POLICY_DATA}[],tuple(tuple(bytes32,string[])[],${POLICY_DATA}[]),tuple(bytes4,address,${POLICY_DATA}[])[],bool)`;
const PARAM_RULE = "tuple(uint8,uint64,bool,bytes32,tuple(uint256,uint256))";

export function policyAddress(name: string): string {
  const found = manifest().contracts.find((c) => c.name === name);
  if (!found) throw new Error(`no pinned contract ${name}`);
  return getAddress(found.address);
}

export const valueLimitInit = (limit: bigint) => coder.encode(["uint256"], [limit]);
/**
 * The pinned TimeFramePolicy (0x8177…dc72, the Oct 2024 source verified on Base Sepolia Blockscout) reads
 * validUntil = uint48(uint128(bytes16(initData[0:16]))) and validAfter = uint48(uint128(bytes16(initData[16:32]))),
 * so its init data is 32 bytes: uint128 validUntil ‖ uint128 validAfter. 12 bytes (the later main-branch layout)
 * reverts on the slice (S2-fix, facts/s2fix-timeframe-probe.json).
 */
export const timeFrameInit = (validUntil: number, validAfter = 0) => solidityPacked(["uint128", "uint128"], [validUntil, validAfter]);
export const usageLimitInit = (limit: number) => solidityPacked(["uint128"], [limit]);
export const spendingLimitInit = (token: string, limit: bigint) => coder.encode(["address[]", "uint256[]"], [[token], [limit]]);

/** UniAction: transfer(to, amount) with to == payee and amount <= perTransfer (ParamCondition EQUAL = 0, LESS_THAN_OR_EQUAL = 4). */
export function uniActionTransferInit(payee: string, perTransfer: bigint): string {
  const empty = [0, 0, false, "0x" + "00".repeat(32), [0, 0]];
  const rules = Array.from({ length: 16 }, () => empty);
  rules[0] = [0, 0, false, zeroPadAddress(payee), [0, 0]];
  rules[1] = [4, 32, false, toBeHex(perTransfer, 32), [0, 0]];
  return coder.encode([`tuple(uint256,tuple(uint256,${PARAM_RULE}[16]))`], [[0, [2, rules]]]);
}
const zeroPadAddress = (a: string) => "0x" + "00".repeat(12) + a.slice(2).toLowerCase();

export interface SessionSpec {
  device: SoftP256;
  salt?: string;
  userOpPolicies?: Array<[string, string]>;
  actions: Array<[string, string, Array<[string, string]>]>;
  permitERC4337Paymaster?: boolean;
  /** Overrides the session validator config (only the negative test uses the canonical 384-byte one). */
  validatorData?: string;
}

/** SmartSessions v1.0.0 stores at most this much sessionValidatorInitData (flatbytes bb0859e8: `> 32 * 10` reverts). */
export const SMART_SESSIONS_CONFIG_MAX_BYTES = 320;
/** The `account` the session config binds the credential id to in layout B (it doubles as the threshold word). */
export const SESSION_CONFIG_ACCOUNT = "0x0000000000000000000000000000000000000001";

/**
 * sessionValidatorData, layout B (coord 10-29 19:3x; design 1b(a) + the 320-byte note): a non-canonical but valid ABI
 * encoding of abi.encode(WebAuthVerificationContext, address) in 10 words, because the canonical one is 12 words
 * (384 bytes) and SmartSessions v1.0.0 refuses to store it. Words:
 *   [0x00 ctx offset → usePrecompile = false, 0x01 account = address(1) = threshold 1, 0x80 ids offset, 0xc0 creds offset,
 *    1, credentialId(x, y, address(1)), 1, x, y, 0 = requireUV false].
 * One device credential, requireUV false, threshold 1, software P-256 verification. The account binding of a session
 * comes from SmartSessions' per-account storage, not from this field (session.test.ts proves it).
 */
export function sessionValidatorData(device: { x: bigint; y: bigint }): string {
  const word = (v: bigint | number | string) => toBeHex(v, 32);
  return concat([word(0), word(1), word(0x80), word(0xc0), word(1), credentialIdOf(device, SESSION_CONFIG_ACCOUNT), word(1), word(device.x), word(device.y), word(0)]);
}

/** The canonical 12-word (384-byte) encoding, kept only for the negative test: SmartSessions v1.0.0 cannot store it. */
export function canonicalSessionValidatorData(device: { x: bigint; y: bigint }): string {
  return coder.encode(["tuple(bool,uint256,bytes32[],tuple(uint256,uint256,bool)[])", "address"], [[true, 1, [credentialIdOf(device, ZeroAddress)], [[device.x, device.y, false]]], ZeroAddress]);
}

export function sessionValues(spec: SessionSpec): unknown[] {
  return [WEBAUTHN_VALIDATOR, spec.validatorData ?? sessionValidatorData(spec.device), spec.salt ?? "0x" + "00".repeat(32), spec.userOpPolicies ?? [], [[], []], spec.actions, spec.permitERC4337Paymaster ?? false];
}

export function permissionIdOf(spec: SessionSpec): string {
  const v = sessionValues(spec);
  return keccak256(coder.encode(["address", "bytes", "bytes32"], [v[0], v[1], v[2]]));
}

/** Root UserOp that installs SmartSessions with these sessions (UNSAFE_ENABLE install data: no ERC-7484 registry call). */
export function installSessionsCall(account: string, specs: SessionSpec[]): string {
  const onInstall = concat(["0x02", coder.encode([`${SESSION_TUPLE}[]`], [specs.map(sessionValues)])]);
  const initData = concat(["0x0000000000000000000000000000000000000001", coder.encode(["bytes", "bytes", "bytes"], [onInstall, "0x", EXECUTE_SELECTOR])]);
  return executeSingle(account, 0n, KERNEL_IFACE.encodeFunctionData("installModule", [1, SMART_SESSIONS, initData]));
}

/** Session UserOp signature: USE mode 0x00 ‖ permissionId ‖ abi.encode(WebAuthnAuth[1]) in the device format. */
export async function signSession(op: PackedUserOp, permissionId: string, device: SoftP256, options: AssertionOptions = {}): Promise<PackedUserOp> {
  const auth = assertion(device, await userOpHashOf(op), { device: true, ...options });
  return { ...op, signature: concat(["0x00", permissionId, coder.encode([`${AUTH_TUPLE}[]`], [[authValues(auth)]])]) };
}

export async function sessionOp(account: string, permissionId: string, device: SoftP256, callData: string, extra: Partial<OpInput> = {}): Promise<PackedUserOp> {
  return signSession(await buildOp({ sender: account, callData, nonceKey: SESSION_NONCE_KEY, ...extra }), permissionId, device);
}

export async function latestTimestamp(): Promise<number> {
  const block = await ethers.provider.getBlock("latest");
  return Number(block?.timestamp ?? 0);
}

export async function increaseTime(seconds: number): Promise<void> {
  await network.provider.send("evm_increaseTime", [seconds]);
  await network.provider.send("evm_mine", []);
}

// ------------------------------------------------------------------------------------------------ ERC-1271

export const ERC1271_MAGIC = "0x1626ba7e";

/** Kernel v3.1 wraps the hash: EIP-712 Kernel(bytes32 hash) under the account's domain (name Kernel, version 0.3.1). */
export async function kernelWrappedHash(account: string, hash: string): Promise<string> {
  const { chainId } = await ethers.provider.getNetwork();
  return TypedDataEncoder.hash({ name: "Kernel", version: "0.3.1", chainId, verifyingContract: account }, { Kernel: [{ name: "hash", type: "bytes32" }] }, { hash });
}

/** true only when isValidSignature returns the magic value; a revert counts as not valid. */
export async function isMagic(account: string, hash: string, signature: string): Promise<boolean> {
  try {
    return (await new Contract(account, KERNEL_IFACE, ethers.provider).isValidSignature(hash, signature)) === ERC1271_MAGIC;
  } catch {
    return false;
  }
}

// ------------------------------------------------------------------------------------------------ server-side keys

/** A key that is not the account's root: signs a P-256-style (r, s) over the WebAuthn message on its own curve. */
export interface ForeignKey {
  label: string;
  signWebAuthn(message: Uint8Array): { r: bigint; s: bigint };
  wallet?: { address: string; signMessage(m: Uint8Array): Promise<string> };
}

export function secp256k1ServerKey(label: string): ForeignKey {
  const wallet = ethers.Wallet.createRandom();
  const signing = new SigningKey(wallet.privateKey);
  return {
    label,
    wallet,
    signWebAuthn(message: Uint8Array) {
      const sig = signing.sign(sha256(message));
      return { r: BigInt(sig.r), s: BigInt(sig.s) };
    },
  };
}

export function p256ForeignKey(label: string, key: SoftP256 = newSoftP256()): ForeignKey {
  return { label, signWebAuthn: (m) => key.sign(m) };
}

/** A WebAuthn assertion over `hash` signed by a foreign key (well formed, so the validator answers instead of reverting). */
export function foreignAssertion(key: ForeignKey, hash: string, options: AssertionOptions = {}): WebAuthnAuth {
  const fake: SoftP256 = { x: 1n, y: 1n, sign: (m) => key.signWebAuthn(m) };
  return assertion(fake, hash, options);
}
