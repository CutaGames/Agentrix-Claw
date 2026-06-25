import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PackedUserOperation } from './paymaster.service';

/**
 * UserOperationReceipt from bundler
 */
export interface UserOperationReceipt {
  userOpHash: string;
  entryPoint: string;
  sender: string;
  nonce: string;
  paymaster: string;
  actualGasCost: string;
  actualGasUsed: string;
  success: boolean;
  logs: any[];
  receipt: {
    transactionHash: string;
    blockNumber: number;
    blockHash: string;
    gasUsed: string;
  };
}

/**
 * Gas estimation from bundler
 */
export interface GasEstimation {
  preVerificationGas: string;
  verificationGasLimit: string;
  callGasLimit: string;
  paymasterVerificationGasLimit?: string;
  paymasterPostOpGasLimit?: string;
}

/**
 * BundlerClientService — submits UserOperations to an ERC-4337 bundler
 * Supports Stackup, Pimlico, Alchemy, or any standard eth_sendUserOperation endpoint
 */
@Injectable()
export class BundlerClientService {
  private readonly logger = new Logger(BundlerClientService.name);
  private readonly bundlerUrl: string;
  private readonly apiKey: string;
  private readonly entryPointAddress: string;

  constructor(private configService: ConfigService) {
    this.bundlerUrl = this.configService.get<string>('accountAbstraction.bundlerUrl', '');
    this.apiKey = this.configService.get<string>('accountAbstraction.bundlerApiKey', '');
    this.entryPointAddress = this.configService.get<string>(
      'accountAbstraction.entryPointAddress',
      '0x0000000071727De22E5E9d8BAf0edAc6f37da032',
    );
  }

  /**
   * Send a UserOperation to the bundler for inclusion
   */
  async sendUserOperation(
    userOp: PackedUserOperation,
    chainId: number = 97,
  ): Promise<string> {
    const entryPoint = this.getEntryPointForChain(chainId);
    this.logger.log(`Submitting UserOp sender=${userOp.sender} to chain ${chainId}`);

    const response = await this.jsonRpcCall('eth_sendUserOperation', [userOp, entryPoint]);
    const userOpHash = response as string;
    this.logger.log(`UserOp submitted: ${userOpHash}`);
    return userOpHash;
  }

  /**
   * Wait for a UserOperation receipt (poll-based)
   */
  async getUserOperationReceipt(
    userOpHash: string,
    timeoutMs: number = 60_000,
    pollIntervalMs: number = 2_000,
  ): Promise<UserOperationReceipt | null> {
    const start = Date.now();

    while (Date.now() - start < timeoutMs) {
      try {
        const receipt = await this.jsonRpcCall('eth_getUserOperationReceipt', [userOpHash]);
        if (receipt) {
          this.logger.log(`UserOp receipt received: tx=${(receipt as UserOperationReceipt).receipt.transactionHash}`);
          return receipt as UserOperationReceipt;
        }
      } catch {
        // Receipt not available yet
      }

      await this.sleep(pollIntervalMs);
    }

    this.logger.warn(`UserOp ${userOpHash} receipt timeout after ${timeoutMs}ms`);
    return null;
  }

  /**
   * Estimate gas for a UserOperation via the bundler
   */
  async estimateUserOperationGas(
    userOp: Partial<PackedUserOperation>,
    chainId: number = 97,
  ): Promise<GasEstimation> {
    const entryPoint = this.getEntryPointForChain(chainId);
    const estimation = await this.jsonRpcCall('eth_estimateUserOperationGas', [userOp, entryPoint]);
    return estimation as GasEstimation;
  }

  /**
   * Get supported EntryPoint addresses from the bundler
   */
  async getSupportedEntryPoints(): Promise<string[]> {
    return (await this.jsonRpcCall('eth_supportedEntryPoints', [])) as string[];
  }

  /**
   * Check if bundler is configured and reachable
   */
  async isAvailable(): Promise<boolean> {
    if (!this.bundlerUrl) return false;
    try {
      const entryPoints = await this.getSupportedEntryPoints();
      return entryPoints.length > 0;
    } catch {
      return false;
    }
  }

  // ─── Private helpers ───

  private getEntryPointForChain(chainId: number): string {
    const chainEntryPoints = this.configService.get<Record<number, string>>(
      'accountAbstraction.entryPoints',
      {},
    );
    return chainEntryPoints[chainId] || this.entryPointAddress;
  }

  private async jsonRpcCall(method: string, params: any[]): Promise<unknown> {
    if (!this.bundlerUrl) {
      throw new Error('Bundler URL not configured');
    }

    const url = this.apiKey ? `${this.bundlerUrl}/${this.apiKey}` : this.bundlerUrl;

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: Date.now(),
        method,
        params,
      }),
    });

    if (!response.ok) {
      throw new Error(`Bundler HTTP ${response.status}: ${await response.text()}`);
    }

    const json = (await response.json()) as { result?: unknown; error?: { code: number; message: string } };

    if (json.error) {
      throw new Error(`Bundler RPC error ${json.error.code}: ${json.error.message}`);
    }

    return json.result;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
