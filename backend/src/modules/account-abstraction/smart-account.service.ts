import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  JsonRpcProvider,
  AbiCoder,
  keccak256,
  getBytes,
  concat,
  zeroPadValue,
  toBeHex,
  Contract,
  Interface,
} from 'ethers';
import { BundlerClientService, GasEstimation } from './bundler-client.service';
import { PackedUserOperation } from './paymaster.service';

/**
 * Smart account info
 */
export interface SmartAccountInfo {
  address: string;
  isDeployed: boolean;
  ownerEOA: string;
  chainId: number;
  factoryAddress: string;
  salt: string;
}

/**
 * SimpleAccount factory ABI (subset for counterfactual address + deploy)
 */
const FACTORY_ABI = [
  'function createAccount(address owner, uint256 salt) returns (address)',
  'function getAddress(address owner, uint256 salt) view returns (address)',
];

/**
 * SimpleAccount ABI (subset for execute)
 */
const ACCOUNT_ABI = [
  'function execute(address dest, uint256 value, bytes calldata func)',
  'function executeBatch(address[] calldata dest, uint256[] calldata value, bytes[] calldata func)',
];

/**
 * ERC-20 transfer ABI
 */
const ERC20_ABI = ['function transfer(address to, uint256 amount) returns (bool)'];

/**
 * SmartAccountService — manages ERC-4337 smart account deployment and operations
 * Each user's MPC wallet (EOA) becomes the owner of a counterfactual smart account
 */
@Injectable()
export class SmartAccountService {
  private readonly logger = new Logger(SmartAccountService.name);
  private readonly factoryAddress: string;
  private readonly rpcUrl: string;

  constructor(
    private configService: ConfigService,
    private bundlerClient: BundlerClientService,
  ) {
    this.factoryAddress = this.configService.get<string>('accountAbstraction.accountFactoryAddress', '');
    this.rpcUrl = this.configService.get<string>('relayer.rpcUrl', 'http://localhost:8545');
  }

  /**
   * Get the counterfactual smart account address for a given EOA owner
   * This address is deterministic and doesn't require deployment
   */
  async getCounterfactualAddress(ownerAddress: string, salt: bigint = 0n): Promise<string> {
    if (!this.factoryAddress) {
      throw new Error('Account factory address not configured');
    }

    const provider = new JsonRpcProvider(this.rpcUrl);
    const factory = new Contract(this.factoryAddress, FACTORY_ABI, provider);
    const address = await factory.getFunction('getAddress')(ownerAddress, salt);
    return address as string;
  }

  /**
   * Check if a smart account is already deployed on-chain
   */
  async isDeployed(smartAccountAddress: string): Promise<boolean> {
    const provider = new JsonRpcProvider(this.rpcUrl);
    const code = await provider.getCode(smartAccountAddress);
    return code !== '0x';
  }

  /**
   * Get or compute smart account info for a user
   */
  async getOrComputeSmartAccount(
    ownerAddress: string,
    chainId: number = 97,
    salt: bigint = 0n,
  ): Promise<SmartAccountInfo> {
    const address = await this.getCounterfactualAddress(ownerAddress, salt);
    const deployed = await this.isDeployed(address);

    return {
      address,
      isDeployed: deployed,
      ownerEOA: ownerAddress,
      chainId,
      factoryAddress: this.factoryAddress,
      salt: salt.toString(),
    };
  }

  /**
   * Build the initCode for deploying a smart account via the factory
   * Only needed for accounts that haven't been deployed yet
   */
  buildInitCode(ownerAddress: string, salt: bigint = 0n): string {
    if (!this.factoryAddress) return '0x';

    const iface = new Interface(FACTORY_ABI);
    const createAccountCalldata = iface.encodeFunctionData('createAccount', [ownerAddress, salt]);

    return concat([this.factoryAddress, createAccountCalldata]);
  }

  /**
   * Build callData for a native token (BNB) transfer from the smart account
   */
  buildNativeTransferCallData(to: string, value: bigint): string {
    const iface = new Interface(ACCOUNT_ABI);
    return iface.encodeFunctionData('execute', [to, value, '0x']);
  }

  /**
   * Build callData for an ERC-20 token transfer from the smart account
   */
  buildTokenTransferCallData(
    tokenAddress: string,
    to: string,
    amount: bigint,
  ): string {
    const erc20Iface = new Interface(ERC20_ABI);
    const transferData = erc20Iface.encodeFunctionData('transfer', [to, amount]);

    const accountIface = new Interface(ACCOUNT_ABI);
    return accountIface.encodeFunctionData('execute', [tokenAddress, 0n, transferData]);
  }

  /**
   * Build a complete unsigned UserOperation for a USDC transfer
   * The caller must sign this and add paymasterAndData
   */
  async buildTransferUserOp(
    ownerAddress: string,
    to: string,
    amount: bigint,
    chainId: number = 97,
  ): Promise<Partial<PackedUserOperation>> {
    const usdcAddress = this.configService.get<string>('relayer.usdcAddress', '');
    if (!usdcAddress) {
      throw new Error('USDC address not configured');
    }

    const smartAccount = await this.getOrComputeSmartAccount(ownerAddress, chainId);
    const initCode = smartAccount.isDeployed ? '0x' : this.buildInitCode(ownerAddress);

    // Build the token transfer calldata
    const callData = this.buildTokenTransferCallData(usdcAddress, to, amount);

    // Get nonce from EntryPoint (would need EntryPoint contract call)
    const nonce = await this.getNonce(smartAccount.address, chainId);

    const userOp: Partial<PackedUserOperation> = {
      sender: smartAccount.address,
      nonce: toBeHex(nonce),
      initCode,
      callData,
      // Gas limits will be estimated by bundler
      preVerificationGas: toBeHex(100_000n),
      paymasterAndData: '0x',
      signature: '0x', // placeholder — must be signed by owner
    };

    // Try to estimate gas via bundler
    try {
      const gasEstimate = await this.bundlerClient.estimateUserOperationGas(userOp, chainId);
      userOp.accountGasLimits = this.packGasLimits(
        BigInt(gasEstimate.verificationGasLimit),
        BigInt(gasEstimate.callGasLimit),
      );
      userOp.preVerificationGas = gasEstimate.preVerificationGas;
    } catch (err) {
      this.logger.warn(`Gas estimation failed, using defaults: ${err}`);
      // Conservative defaults
      userOp.accountGasLimits = this.packGasLimits(200_000n, 100_000n);
      userOp.preVerificationGas = toBeHex(100_000n);
    }

    return userOp;
  }

  /**
   * Build a batch UserOperation for multiple transfers
   */
  buildBatchTransferCallData(
    tokenAddress: string,
    recipients: string[],
    amounts: bigint[],
  ): string {
    if (recipients.length !== amounts.length) {
      throw new Error('Recipients and amounts arrays must have same length');
    }

    const erc20Iface = new Interface(ERC20_ABI);
    const dests: string[] = [];
    const values: bigint[] = [];
    const funcs: string[] = [];

    for (let i = 0; i < recipients.length; i++) {
      dests.push(tokenAddress);
      values.push(0n);
      funcs.push(erc20Iface.encodeFunctionData('transfer', [recipients[i], amounts[i]]));
    }

    const accountIface = new Interface(ACCOUNT_ABI);
    return accountIface.encodeFunctionData('executeBatch', [dests, values, funcs]);
  }

  // ─── Private helpers ───

  private async getNonce(smartAccountAddress: string, chainId: number): Promise<bigint> {
    // EntryPoint.getNonce(address sender, uint192 key) → uint256
    // For simplicity, return 0 for undeployed accounts
    // Full implementation would call EntryPoint contract
    try {
      const entryPoints = this.configService.get<Record<number, string>>(
        'accountAbstraction.entryPoints',
        {},
      );
      const entryPointAddress = entryPoints[chainId] || '0x0000000071727De22E5E9d8BAf0edAc6f37da032';

      const provider = new JsonRpcProvider(this.rpcUrl);
      const entryPoint = new Contract(
        entryPointAddress,
        ['function getNonce(address sender, uint192 key) view returns (uint256)'],
        provider,
      );
      return await entryPoint.getNonce(smartAccountAddress, 0);
    } catch {
      return 0n;
    }
  }

  /**
   * Pack verificationGasLimit and callGasLimit into a single bytes32
   * accountGasLimits = verificationGasLimit (16 bytes, left) | callGasLimit (16 bytes, right)
   */
  private packGasLimits(verificationGasLimit: bigint, callGasLimit: bigint): string {
    const coder = AbiCoder.defaultAbiCoder();
    const left = zeroPadValue(toBeHex(verificationGasLimit), 16);
    const right = zeroPadValue(toBeHex(callGasLimit), 16);
    return concat([left, right]);
  }
}
