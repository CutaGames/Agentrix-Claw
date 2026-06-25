import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PaymentMethod } from '../../entities/payment.entity';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';

export interface FeeEstimate {
  paymentMethod: PaymentMethod | string;
  baseAmount: number;
  currency: string;
  estimatedFee: number;
  feeBreakdown: {
    channelFee?: number; // 通道手续费
    gasFee?: number; // Gas费（链上支付）
    exchangeFee?: number; // 汇率转换费
    platformFee?: number; // 平台手续费
    totalFee: number; // 总手续费
  };
  totalCost: number; // 用户需要支付的总金额
  feeRate: number; // 手续费率（百分比）
  estimatedTime?: number; // 预计到账时间（秒）
}

export interface PaymentCostComparison {
  paymentMethod: PaymentMethod | string;
  label: string;
  totalCost: number;
  estimatedFee: number;
  feeRate: number;
  estimatedTime: number;
  available: boolean;
  requiresKYC?: boolean;
  requiresWallet?: boolean;
  badges?: string[];
}

@Injectable()
export class FeeEstimationService {
  private readonly logger = new Logger(FeeEstimationService.name);

  constructor(
    private configService: ConfigService,
  ) {}

  /**
   * 估算Stripe手续费
   * Stripe手续费：2.9% + $0.30（固定费用）
   */
  async estimateStripeFee(
    amount: number,
    currency: string = 'USD',
  ): Promise<FeeEstimate> {
    // Stripe手续费率：2.9%
    const stripeRate = 0.029;
    // 固定费用（根据货币不同）
    const fixedFee = this.getStripeFixedFee(currency);
    
    const channelFee = amount * stripeRate + fixedFee;
    const totalCost = amount + channelFee;
    const feeRate = (channelFee / amount) * 100;

    return {
      paymentMethod: PaymentMethod.STRIPE,
      baseAmount: amount,
      currency,
      estimatedFee: channelFee,
      feeBreakdown: {
        channelFee,
        totalFee: channelFee,
      },
      totalCost,
      feeRate,
      estimatedTime: 60, // Stripe通常1分钟内到账
    };
  }

  /**
   * 获取Stripe固定费用（根据货币）
   */
  private getStripeFixedFee(currency: string): number {
    const fixedFees: Record<string, number> = {
      USD: 0.30,
      EUR: 0.25,
      GBP: 0.20,
      CNY: 2.00,
      JPY: 40,
      // 其他货币默认值
    };
    return fixedFees[currency] || 0.30;
  }

  /**
   * 估算钱包Gas费（EVM链）
   */
  async estimateWalletGasFee(
    chain: 'ethereum' | 'bsc' | 'polygon' | 'base',
    amount: number,
    tokenStandard: 'native' | 'ERC20' = 'ERC20',
  ): Promise<FeeEstimate> {
    // 根据链获取当前gas price（这里使用模拟值，实际应该从RPC获取）
    const gasPrice = await this.getChainGasPrice(chain);
    const priorityFee = '2000000000'; // 2 gwei
    
    // ERC20转账需要约65000 gas，原生代币转账需要约21000 gas
    const gasLimit = tokenStandard === 'ERC20' ? '65000' : '21000';
    
    const gasCost = (parseInt(gasLimit) * (parseInt(gasPrice) + parseInt(priorityFee))) / 1e18;
    const currency = this.getChainCurrency(chain);
    
    // 钱包支付没有通道手续费，只有Gas费
    const totalCost = amount + gasCost;
    const feeRate = (gasCost / amount) * 100;

    return {
      paymentMethod: PaymentMethod.WALLET,
      baseAmount: amount,
      currency,
      estimatedFee: gasCost,
      feeBreakdown: {
        gasFee: gasCost,
        totalFee: gasCost,
      },
      totalCost,
      feeRate,
      estimatedTime: this.getChainConfirmationTime(chain),
    };
  }

  /**
   * 估算钱包Gas费（Solana）
   */
  async estimateSolanaGasFee(amount: number): Promise<FeeEstimate> {
    // Solana交易费用固定约0.000005 SOL
    const solanaFee = 0.000005;
    const solPrice = 100; // 假设SOL价格$100（实际应该从API获取）
    const gasCost = solanaFee * solPrice; // 转换为USD
    
    const totalCost = amount + gasCost;
    const feeRate = (gasCost / amount) * 100;

    return {
      paymentMethod: PaymentMethod.WALLET,
      baseAmount: amount,
      currency: 'SOL',
      estimatedFee: gasCost,
      feeBreakdown: {
        gasFee: gasCost,
        totalFee: gasCost,
      },
      totalCost,
      feeRate,
      estimatedTime: 3, // Solana通常3-5秒确认
    };
  }

  /**
   * 估算X402手续费
   * X402协议：约0.06% + Gas费（批量交易，Gas费分摊）
   */
  async estimateX402Fee(
    amount: number,
    chain: 'ethereum' | 'solana' | 'bsc' | 'polygon' = 'ethereum',
  ): Promise<FeeEstimate> {
    const x402Rate = 0.0006; // 0.06%
    const channelFee = amount * x402Rate;
    
    // X402批量交易，Gas费分摊后很低
    const gasFee = chain === 'solana' ? 0.0001 : 0.001; // 简化处理
    const totalFee = channelFee + gasFee;
    
    const totalCost = amount + totalFee;
    const feeRate = (totalFee / amount) * 100;

    return {
      paymentMethod: PaymentMethod.X402,
      baseAmount: amount,
      currency: this.getChainCurrency(chain),
      estimatedFee: totalFee,
      feeBreakdown: {
        channelFee,
        gasFee,
        totalFee,
      },
      totalCost,
      feeRate,
      estimatedTime: chain === 'solana' ? 5 : 15, // X402通常5-15秒确认
    };
  }

  /**
   * 估算跨链桥接费
   */
  async estimateBridgeFee(
    fromChain: string,
    toChain: string,
    amount: number,
  ): Promise<FeeEstimate> {
    // 跨链桥接费通常较高，约0.1-0.5%
    const bridgeRate = 0.003; // 0.3%
    const bridgeFee = amount * bridgeRate;
    
    // 跨链还需要两边的Gas费
    const gasFee = 0.005; // 简化处理
    const totalFee = bridgeFee + gasFee;
    
    const totalCost = amount + totalFee;
    const feeRate = (totalFee / amount) * 100;

    return {
      paymentMethod: 'bridge',
      baseAmount: amount,
      currency: 'USDC',
      estimatedFee: totalFee,
      feeBreakdown: {
        channelFee: bridgeFee,
        gasFee,
        totalFee,
      },
      totalCost,
      feeRate,
      estimatedTime: 300, // 跨链通常需要5分钟左右
    };
  }

  /**
   * 获取所有支付方式的总成本对比
   */
  async getAllPaymentCosts(
    amount: number,
    currency: string = 'USD',
    targetCurrency?: string, // 目标货币（如果涉及转换）
    chain?: string, // 如果使用链上支付，指定链
  ): Promise<PaymentCostComparison[]> {
    const comparisons: PaymentCostComparison[] = [];

    // 1. Stripe支付
    try {
      const stripeEstimate = await this.estimateStripeFee(amount, currency);
      comparisons.push({
        paymentMethod: PaymentMethod.STRIPE,
        label: 'Stripe支付',
        totalCost: stripeEstimate.totalCost,
        estimatedFee: stripeEstimate.estimatedFee,
        feeRate: stripeEstimate.feeRate,
        estimatedTime: stripeEstimate.estimatedTime || 60,
        available: true,
        requiresKYC: true,
        badges: ['快速', '安全'],
      });
    } catch (error) {
      this.logger.warn(`Stripe手续费估算失败: ${error.message}`);
    }

    // 2. 钱包支付（如果指定了链）
    if (chain) {
      try {
        const chainType = chain as 'ethereum' | 'bsc' | 'polygon' | 'base';
        const walletEstimate = await this.estimateWalletGasFee(chainType, amount);
        comparisons.push({
          paymentMethod: PaymentMethod.WALLET,
          label: '钱包支付',
          totalCost: walletEstimate.totalCost,
          estimatedFee: walletEstimate.estimatedFee,
          feeRate: walletEstimate.feeRate,
          estimatedTime: walletEstimate.estimatedTime || 60,
          available: true,
          requiresWallet: true,
          badges: ['去中心化', '低手续费'],
        });
      } catch (error) {
        this.logger.warn(`钱包手续费估算失败: ${error.message}`);
      }
    }

    // 3. X402支付
    try {
      const x402Estimate = await this.estimateX402Fee(
        amount,
        (chain as any) || 'ethereum',
      );
      comparisons.push({
        paymentMethod: PaymentMethod.X402,
        label: 'X402协议',
        totalCost: x402Estimate.totalCost,
        estimatedFee: x402Estimate.estimatedFee,
        feeRate: x402Estimate.feeRate,
        estimatedTime: x402Estimate.estimatedTime || 15,
        available: true,
        requiresWallet: true,
        badges: ['超低手续费', '快速确认'],
      });
    } catch (error) {
      this.logger.warn(`X402手续费估算失败: ${error.message}`);
    }

    // 按总成本排序（最便宜的在前）
    comparisons.sort((a, b) => a.totalCost - b.totalCost);

    return comparisons;
  }

  /**
   * 获取链的Gas Price（模拟值，实际应该从RPC获取）
   */
  private async getChainGasPrice(chain: string): Promise<string> {
    // 这里使用模拟值，实际应该从RPC节点获取实时gas price
    const gasPrices: Record<string, string> = {
      ethereum: '30000000000', // 30 gwei
      bsc: '3000000000', // 3 gwei
      polygon: '30000000000', // 30 gwei
      base: '1000000000', // 1 gwei
    };
    return gasPrices[chain] || '30000000000';
  }

  /**
   * 获取链的货币符号
   */
  private getChainCurrency(chain: string): string {
    const currencies: Record<string, string> = {
      ethereum: 'ETH',
      bsc: 'BNB',
      polygon: 'MATIC',
      base: 'ETH',
      solana: 'SOL',
    };
    return currencies[chain] || 'ETH';
  }

  /**
   * 获取链的确认时间（秒）
   */
  private getChainConfirmationTime(chain: string): number {
    const times: Record<string, number> = {
      ethereum: 60, // 约1分钟
      bsc: 3, // 约3秒
      polygon: 2, // 约2秒
      base: 2, // 约2秒
      solana: 3, // 约3秒
    };
    return times[chain] || 60;
  }
}

