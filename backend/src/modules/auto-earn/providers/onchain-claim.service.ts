/**
 * 链上空投执行服务
 * 支持多链的空投领取和链上交互
 */

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ethers } from 'ethers';
import * as solana from '@solana/web3.js';
import { getChainConfig, ChainConfig } from '../../../config/chains.config';

// Merkle Distributor ABI (通用)
const MERKLE_DISTRIBUTOR_ABI = [
  'function isClaimed(uint256 index) view returns (bool)',
  'function claim(uint256 index, address account, uint256 amount, bytes32[] calldata merkleProof)',
  'event Claimed(uint256 index, address account, uint256 amount)',
];

// Generic Claim ABI
const GENERIC_CLAIM_ABI = [
  'function claim() external',
  'function claim(address account) external',
  'function claimTokens() external',
  'function hasClaimed(address account) view returns (bool)',
];

export interface ClaimResult {
  success: boolean;
  transactionHash?: string;
  claimedAmount?: number;
  error?: string;
  gasUsed?: string;
}

export interface ClaimParams {
  walletAddress: string;
  privateKey?: string; // 可选，用于服务端签名
  contractAddress: string;
  chain: string;
  claimType: 'merkle' | 'direct' | 'signature';
  merkleProof?: string[];
  merkleIndex?: number;
  claimAmount?: string;
  signature?: string;
}

@Injectable()
export class OnchainClaimService {
  private readonly logger = new Logger(OnchainClaimService.name);
  private providers: Map<string, ethers.JsonRpcProvider> = new Map();
  private solanaConnections: Map<string, solana.Connection> = new Map();

  constructor(private configService: ConfigService) {
    this.initializeProviders();
  }

  /**
   * 初始化所有链的 Provider
   */
  private initializeProviders() {
    const chains = ['ethereum', 'bsc', 'polygon', 'arbitrum', 'base', 'solana', 'solana_devnet'];
    
    for (const chainName of chains) {
      const config = getChainConfig(chainName);
      if (!config) continue;

      if (config.isEVM) {
        try {
          const provider = new ethers.JsonRpcProvider(config.rpcUrl);
          this.providers.set(chainName, provider);
        } catch (error) {
          this.logger.warn(`Failed to initialize EVM provider for ${chainName}`);
        }
      } else if (chainName.startsWith('solana')) {
        try {
          const connection = new solana.Connection(config.rpcUrl, 'confirmed');
          this.solanaConnections.set(chainName, connection);
        } catch (error) {
          this.logger.warn(`Failed to initialize Solana connection for ${chainName}`);
        }
      }
    }
  }

  /**
   * 获取链的 Provider
   */
  private getProvider(chain: string): ethers.JsonRpcProvider {
    const provider = this.providers.get(chain);
    if (!provider) {
      const config = getChainConfig(chain);
      if (!config) throw new Error(`Unsupported chain: ${chain}`);
      return new ethers.JsonRpcProvider(config.rpcUrl);
    }
    return provider;
  }

  /**
   * 获取 Solana 连接
   */
  private getSolanaConnection(chain: string): solana.Connection {
    const connection = this.solanaConnections.get(chain);
    if (!connection) {
      const config = getChainConfig(chain);
      if (!config) throw new Error(`Unsupported chain: ${chain}`);
      return new solana.Connection(config.rpcUrl, 'confirmed');
    }
    return connection;
  }

  /**
   * 检查空投是否已领取
   */
  async checkIfClaimed(
    contractAddress: string,
    chain: string,
    walletAddress: string,
    merkleIndex?: number,
  ): Promise<boolean> {
    const config = getChainConfig(chain);
    if (!config) return false;

    if (!config.isEVM) {
      return this.checkIfClaimedSolana(contractAddress, chain, walletAddress);
    }

    try {
      const provider = this.getProvider(chain);
      
      // 尝试不同的检查方式
      const contract = new ethers.Contract(
        contractAddress,
        [...MERKLE_DISTRIBUTOR_ABI, ...GENERIC_CLAIM_ABI],
        provider,
      );

      // 方式1: Merkle Distributor 的 isClaimed
      if (merkleIndex !== undefined) {
        try {
          return await contract.isClaimed(merkleIndex);
        } catch (e) {
          // 忽略
        }
      }

      // 方式2: 通用的 hasClaimed
      try {
        return await contract.hasClaimed(walletAddress);
      } catch (e) {
        // 忽略
      }

      return false;
    } catch (error: any) {
      this.logger.warn(`Check claimed error: ${error.message}`);
      return false;
    }
  }

  /**
   * 检查 Solana 空投是否已领取
   */
  private async checkIfClaimedSolana(
    contractAddress: string,
    chain: string,
    walletAddress: string,
  ): Promise<boolean> {
    try {
      const connection = this.getSolanaConnection(chain);
      const userPublicKey = new solana.PublicKey(walletAddress);
      
      // Solana 的空投通常通过 Token Account 是否存在或特定的 PDA 来判断
      // 这里暂时返回 false，因为 Solana 空投领取逻辑差异很大，需要针对具体项目实现
      return false;
    } catch (error) {
      this.logger.error(`Check Solana claimed status failed: ${error.message}`);
      return false;
    }
  }

  /**
   * 估算领取 Gas 费用
   */
  async estimateClaimGas(params: ClaimParams): Promise<{
    gasLimit: bigint;
    gasPrice: bigint;
    estimatedCost: string;
    estimatedCostUSD: number;
  }> {
    const provider = this.getProvider(params.chain);
    const chainConfig = getChainConfig(params.chain);
    
    if (!chainConfig) {
      throw new Error(`Unsupported chain: ${params.chain}`);
    }

    const contract = new ethers.Contract(
      params.contractAddress,
      [...MERKLE_DISTRIBUTOR_ABI, ...GENERIC_CLAIM_ABI],
      provider,
    );

    let gasLimit: bigint;

    try {
      if (params.claimType === 'merkle' && params.merkleProof && params.merkleIndex !== undefined) {
        gasLimit = await contract.claim.estimateGas(
          params.merkleIndex,
          params.walletAddress,
          params.claimAmount || '0',
          params.merkleProof,
        );
      } else {
        // 直接领取
        gasLimit = await contract.claim.estimateGas();
      }
    } catch (error) {
      // 使用默认 gas limit
      gasLimit = BigInt(150000);
    }

    const feeData = await provider.getFeeData();
    const gasPrice = feeData.gasPrice || BigInt(0);

    const estimatedCost = ethers.formatEther(gasLimit * gasPrice);
    
    // 估算 USD 价格（需要获取实时价格）
    const nativePrice = await this.getNativeTokenPrice(params.chain);
    const estimatedCostUSD = parseFloat(estimatedCost) * nativePrice;

    return {
      gasLimit,
      gasPrice,
      estimatedCost,
      estimatedCostUSD,
    };
  }

  /**
   * 生成领取交易数据（用于前端签名）
   */
  async buildClaimTransaction(params: ClaimParams): Promise<{
    to: string;
    data: string;
    value?: string;
    gasLimit?: string;
    chainId?: number | string;
    isSolana?: boolean;
  }> {
    const chainConfig = getChainConfig(params.chain);
    if (!chainConfig) {
      throw new Error(`Unsupported chain: ${params.chain}`);
    }

    if (!chainConfig.isEVM) {
      return this.buildClaimTransactionSolana(params);
    }

    const contract = new ethers.Contract(
      params.contractAddress,
      [...MERKLE_DISTRIBUTOR_ABI, ...GENERIC_CLAIM_ABI],
    );

    let data: string;

    if (params.claimType === 'merkle' && params.merkleProof && params.merkleIndex !== undefined) {
      data = contract.interface.encodeFunctionData('claim', [
        params.merkleIndex,
        params.walletAddress,
        params.claimAmount || '0',
        params.merkleProof,
      ]);
    } else {
      data = contract.interface.encodeFunctionData('claim', []);
    }

    const gasEstimate = await this.estimateClaimGas(params);

    return {
      to: params.contractAddress,
      data,
      value: '0x0',
      gasLimit: gasEstimate.gasLimit.toString(),
      chainId: chainConfig.chainId as number,
    };
  }

  /**
   * 生成 Solana 领取交易数据
   */
  private async buildClaimTransactionSolana(params: ClaimParams): Promise<any> {
    // 对于 Solana，我们返回一个 Base64 编码的交易
    // 这需要根据具体的 Solana 空投程序实现
    return {
      to: params.contractAddress,
      data: '', // Base64 encoded transaction
      isSolana: true,
      chainId: 'mainnet-beta',
      instructions: '请在 Solana 钱包中确认领取交易',
    };
  }

  /**
   * 执行领取（服务端签名 - 用于 MPC 钱包）
   */
  async executeClaimWithPrivateKey(
    params: ClaimParams & { privateKey: string },
  ): Promise<ClaimResult> {
    const config = getChainConfig(params.chain);
    if (!config) return { success: false, error: `Unsupported chain: ${params.chain}` };

    if (!config.isEVM) {
      return this.executeClaimSolana(params);
    }

    try {
      const provider = this.getProvider(params.chain);
      const wallet = new ethers.Wallet(params.privateKey, provider);

      const contract = new ethers.Contract(
        params.contractAddress,
        [...MERKLE_DISTRIBUTOR_ABI, ...GENERIC_CLAIM_ABI],
        wallet,
      );

      let tx: ethers.TransactionResponse;

      if (params.claimType === 'merkle' && params.merkleProof && params.merkleIndex !== undefined) {
        tx = await contract.claim(
          params.merkleIndex,
          params.walletAddress,
          params.claimAmount || '0',
          params.merkleProof,
        );
      } else {
        tx = await contract.claim();
      }

      this.logger.log(`Claim transaction sent: ${tx.hash}`);

      // 等待确认
      const receipt = await tx.wait();

      if (receipt && receipt.status === 1) {
        return {
          success: true,
          transactionHash: tx.hash,
          gasUsed: receipt.gasUsed.toString(),
        };
      } else {
        return {
          success: false,
          transactionHash: tx.hash,
          error: 'Transaction reverted',
        };
      }
    } catch (error: any) {
      this.logger.error(`Claim execution failed: ${error.message}`);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * 执行 Solana 空投领取
   */
  private async executeClaimSolana(params: ClaimParams & { privateKey: string }): Promise<ClaimResult> {
    try {
      const connection = this.getSolanaConnection(params.chain);
      
      // 服务端签名领取
      // 注意：Solana 私钥通常是 64 字节的 Uint8Array (SecretKey)
      // 这里假设传入的是 Base58 编码或 Hex 编码的私钥
      let secretKey: Uint8Array;
      try {
        secretKey = Buffer.from(params.privateKey, 'hex');
      } catch (e) {
        // 尝试 Base58 (Solana 常用)
        // 需要 bs58 库，如果没有安装，这里会报错
        // 暂时假设是 Hex
        secretKey = Buffer.from(params.privateKey, 'hex');
      }

      const keypair = solana.Keypair.fromSecretKey(secretKey);
      
      // 构建 Solana 交易 (示例)
      const transaction = new solana.Transaction();
      // TODO: 添加具体的空投领取指令 (Instruction)
      // 这需要针对具体的 Solana 空投程序 (如 Jup.ag, Pyth 等) 实现
      
      // 暂时返回模拟成功，因为没有具体的 Instruction
      this.logger.warn(`Solana claim instruction not implemented for ${params.contractAddress}`);
      
      return {
        success: false,
        error: 'Solana claim instruction not implemented for this contract',
      };
    } catch (error: any) {
      this.logger.error(`Solana claim execution failed: ${error.message}`);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * 提交用户签名的交易
   */
  async submitSignedTransaction(
    chain: string,
    signedTransaction: string,
  ): Promise<ClaimResult> {
    try {
      const provider = this.getProvider(chain);
      const tx = await provider.broadcastTransaction(signedTransaction);
      
      this.logger.log(`Transaction broadcasted: ${tx.hash}`);
      
      const receipt = await tx.wait();

      if (receipt && receipt.status === 1) {
        return {
          success: true,
          transactionHash: tx.hash,
          gasUsed: receipt.gasUsed.toString(),
        };
      } else {
        return {
          success: false,
          transactionHash: tx.hash,
          error: 'Transaction reverted',
        };
      }
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * 获取原生代币价格
   */
  private async getNativeTokenPrice(chain: string): Promise<number> {
    const priceMap: Record<string, string> = {
      ethereum: 'ethereum',
      bsc: 'binancecoin',
      polygon: 'matic-network',
      arbitrum: 'ethereum',
      base: 'ethereum',
    };

    const coinId = priceMap[chain];
    if (!coinId) return 0;

    try {
      const response = await fetch(
        `https://api.coingecko.com/api/v3/simple/price?ids=${coinId}&vs_currencies=usd`,
      );
      const data = await response.json();
      return data[coinId]?.usd || 0;
    } catch (error) {
      // 返回默认价格
      const defaultPrices: Record<string, number> = {
        ethereum: 2500,
        binancecoin: 300,
        'matic-network': 0.8,
      };
      return defaultPrices[coinId] || 0;
    }
  }

  /**
   * 监听领取事件
   */
  async watchClaimEvents(
    contractAddress: string,
    chain: string,
    callback: (event: any) => void,
  ): Promise<void> {
    const provider = this.getProvider(chain);
    const contract = new ethers.Contract(
      contractAddress,
      MERKLE_DISTRIBUTOR_ABI,
      provider,
    );

    contract.on('Claimed', (index, account, amount, event) => {
      callback({
        index: index.toString(),
        account,
        amount: ethers.formatEther(amount),
        transactionHash: event.transactionHash,
      });
    });
  }
}
