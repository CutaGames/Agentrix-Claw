import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Payment, PaymentStatus } from '../../entities/payment.entity';

export type Chain = 'solana' | 'ethereum' | 'base' | 'polygon' | 'arbitrum' | 'optimism' | 'bsc';
export type TokenStandard = 'SPL' | 'ERC20' | 'ERC4337' | 'native';

export interface CryptoPaymentRequest {
  chain: Chain;
  tokenAddress?: string;
  tokenStandard?: TokenStandard;
  amount: string;
  recipient: string;
  payer: string;
  priorityFee?: string;
  metadata?: Record<string, any>;
}

export interface GasEstimate {
  gasLimit?: string;
  gasPrice?: string;
  priorityFee?: string;
  totalCost: string;
  currency: string;
}

export interface TransactionBuildRequest {
  chain: Chain;
  tokenAddress?: string;
  tokenStandard?: TokenStandard;
  amount: string;
  recipient: string;
  payer: string;
}

export interface BuiltTransaction {
  transaction: string; // Serialized transaction (base64 or hex)
  chain: Chain;
  requiredSignatures: string[];
  estimatedGas?: GasEstimate;
}

@Injectable()
export class CryptoPaymentService {
  private readonly logger = new Logger(CryptoPaymentService.name);

  constructor(
    @InjectRepository(Payment)
    private paymentRepository: Repository<Payment>,
    private configService: ConfigService,
  ) {}

  /**
   * Estimate gas/fees for a crypto payment
   */
  async estimateGas(request: CryptoPaymentRequest): Promise<GasEstimate> {
    this.logger.log(`Estimating gas for ${request.chain} payment`);

    // 根据链类型估算Gas
    switch (request.chain) {
      case 'solana':
        return this.estimateSolanaGas(request);
      case 'ethereum':
      case 'base':
      case 'polygon':
      case 'arbitrum':
      case 'optimism':
      case 'bsc':
        return this.estimateEVMGas(request);
      default:
        throw new BadRequestException(`Unsupported chain: ${request.chain}`);
    }
  }

  /**
   * Build a payment transaction
   */
  async buildTransaction(request: TransactionBuildRequest): Promise<BuiltTransaction> {
    this.logger.log(`Building transaction for ${request.chain}`);

    switch (request.chain) {
      case 'solana':
        return this.buildSolanaTransaction(request);
      case 'ethereum':
      case 'base':
      case 'polygon':
      case 'arbitrum':
      case 'optimism':
      case 'bsc':
        return this.buildEVMTransaction(request);
      default:
        throw new BadRequestException(`Unsupported chain: ${request.chain}`);
    }
  }

  /**
   * Create a crypto payment record
   */
  async createPayment(
    userId: string,
    request: CryptoPaymentRequest,
  ): Promise<Payment> {
    // 创建支付记录
    const payment = this.paymentRepository.create({
      userId,
      amount: parseFloat(request.amount),
      currency: this.getChainCurrency(request.chain),
      paymentMethod: 'wallet' as any,
      description: `Crypto payment on ${request.chain}`,
      status: PaymentStatus.PENDING,
      metadata: {
        chain: request.chain,
        tokenAddress: request.tokenAddress,
        tokenStandard: request.tokenStandard || (request.chain === 'solana' ? 'SPL' : 'ERC20'),
        recipient: request.recipient,
        payer: request.payer,
        ...request.metadata,
      },
    });

    return this.paymentRepository.save(payment);
  }

  /**
   * Submit signed transaction
   */
  async submitSignedTransaction(
    paymentId: string,
    signedTransaction: string,
    signature?: string,
  ): Promise<Payment> {
    const payment = await this.paymentRepository.findOne({
      where: { id: paymentId },
    });

    if (!payment) {
      throw new BadRequestException('Payment not found');
    }

    // 这里应该调用链上服务提交交易
    // 暂时模拟交易哈希
    const transactionHash = signature || `0x${Buffer.from(signedTransaction).toString('hex').substring(0, 64)}`;

    payment.status = PaymentStatus.PROCESSING;
    payment.transactionHash = transactionHash;
    payment.metadata = {
      ...payment.metadata,
      signedTransaction,
      submittedAt: new Date().toISOString(),
    };

    // TODO: 实际提交到链上
    // 这里应该调用相应的链服务（Solana/EVM）提交交易
    // 提交成功后更新状态为COMPLETED

    return this.paymentRepository.save(payment);
  }

  /**
   * Estimate Solana gas
   */
  private async estimateSolanaGas(request: CryptoPaymentRequest): Promise<GasEstimate> {
    // Solana使用compute units，不是gas
    // 基础交易费用约0.000005 SOL
    const baseFee = 0.000005;
    const priorityFee = request.priorityFee ? parseFloat(request.priorityFee) : 0.000001;

    return {
      priorityFee: priorityFee.toString(),
      totalCost: (baseFee + priorityFee).toString(),
      currency: 'SOL',
    };
  }

  /**
   * Estimate EVM gas
   */
  private async estimateEVMGas(request: CryptoPaymentRequest): Promise<GasEstimate> {
    // ERC20转账需要约65000 gas，原生代币转账需要约21000 gas
    const gasLimit = request.tokenStandard === 'ERC20' ? '65000' : '21000';
    
    // 根据链获取当前gas price（这里使用模拟值）
    const gasPrice = this.getChainGasPrice(request.chain);
    const priorityFee = request.priorityFee || '2000000000'; // 2 gwei

    const totalCost = (parseInt(gasLimit) * (parseInt(gasPrice) + parseInt(priorityFee))) / 1e18;

    return {
      gasLimit,
      gasPrice,
      priorityFee,
      totalCost: totalCost.toString(),
      currency: this.getChainCurrency(request.chain),
    };
  }

  /**
   * Build Solana transaction
   */
  private async buildSolanaTransaction(request: TransactionBuildRequest): Promise<BuiltTransaction> {
    // 这里应该使用@solana/web3.js构建实际交易
    // 暂时返回模拟数据
    const transaction = Buffer.from(JSON.stringify({
      chain: request.chain,
      type: request.tokenStandard || 'SPL',
      amount: request.amount,
      recipient: request.recipient,
      payer: request.payer,
      timestamp: Date.now(),
    })).toString('base64');

    const gasEstimate = await this.estimateSolanaGas({
      ...request,
      priorityFee: '0.000001',
    });

    return {
      transaction,
      chain: request.chain,
      requiredSignatures: [request.payer],
      estimatedGas: gasEstimate,
    };
  }

  /**
   * Build EVM transaction
   */
  private async buildEVMTransaction(request: TransactionBuildRequest): Promise<BuiltTransaction> {
    // 这里应该使用ethers.js或web3.js构建实际交易
    // 暂时返回模拟数据
    const transaction = {
      chain: request.chain,
      type: request.tokenStandard || 'ERC20',
      amount: request.amount,
      recipient: request.recipient,
      payer: request.payer,
      timestamp: Date.now(),
    };

    const gasEstimate = await this.estimateEVMGas({
      ...request,
      priorityFee: '2000000000',
    });

    return {
      transaction: Buffer.from(JSON.stringify(transaction)).toString('hex'),
      chain: request.chain,
      requiredSignatures: [request.payer],
      estimatedGas: gasEstimate,
    };
  }

  /**
   * Get chain currency
   */
  private getChainCurrency(chain: Chain): string {
    const currencyMap: Record<Chain, string> = {
      solana: 'SOL',
      ethereum: 'ETH',
      base: 'ETH',
      polygon: 'MATIC',
      arbitrum: 'ETH',
      optimism: 'ETH',
      bsc: 'BNB',
    };
    return currencyMap[chain] || 'ETH';
  }

  /**
   * Get chain gas price (in wei/gwei)
   */
  private getChainGasPrice(chain: Chain): string {
    // 模拟gas price，实际应该从链上获取
    const gasPriceMap: Record<Chain, string> = {
      solana: '5000', // Solana使用lamports，约0.000005 SOL
      ethereum: '30000000000', // 30 gwei
      base: '1000000000', // 1 gwei
      polygon: '30000000000', // 30 gwei
      arbitrum: '100000000', // 0.1 gwei
      optimism: '100000000', // 0.1 gwei
      bsc: '5000000000', // 5 gwei
    };
    return gasPriceMap[chain] || '20000000000';
  }
}

