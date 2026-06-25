import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TransactionRoute } from './entities/transaction-route.entity';
import { RiskAssessment } from './entities/risk-assessment.entity';
import { FeeEstimate } from './entities/fee-estimate.entity';
import { PaymentService } from '../payment/payment.service';

export interface RoutingContext {
  userId?: string;
  agentId?: string;
  amount: number;
  currency: string;
  sourceChain?: string;
  targetChain?: string;
  paymentMethod?: string;
  kycStatus?: string;
  quickPayAvailable?: boolean;
}

export interface PaymentRoute {
  routeId: string;
  paymentMethod: string;
  sourceChain: string;
  targetChain: string;
  estimatedFee: number;
  feeBreakdown: {
    baseFee: number;
    percentageFee: number;
    gasFee?: number;
    bridgeFee?: number;
    totalFee: number;
  };
  successRate: number;
  avgExecutionTime: number;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
}

export interface RiskAssessmentResult {
  riskScore: number; // 0-100
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  riskFactors: {
    amount: number;
    frequency: number;
    kycStatus: string;
    historyScore: number;
    [key: string]: any;
  };
  recommendation: string;
}

export interface FeeEstimateResult {
  estimatedFee: number;
  feeBreakdown: {
    baseFee: number;
    percentageFee: number;
    gasFee?: number;
    bridgeFee?: number;
    totalFee: number;
  };
  currency: string;
}

export interface TransactionParams {
  chain: string;
  type: 'payment' | 'swap' | 'transfer' | 'bridge';
  from: string;
  to: string;
  amount: string;
  token?: string;
  [key: string]: any;
}

export interface ComplianceResult {
  allowed: boolean;
  reason?: string;
  kycRequired?: boolean;
  amlCheck?: boolean;
}

@Injectable()
export class TransactionFoundationModel {
  private readonly logger = new Logger(TransactionFoundationModel.name);

  constructor(
    @InjectRepository(TransactionRoute)
    private transactionRouteRepository: Repository<TransactionRoute>,
    @InjectRepository(RiskAssessment)
    private riskAssessmentRepository: Repository<RiskAssessment>,
    @InjectRepository(FeeEstimate)
    private feeEstimateRepository: Repository<FeeEstimate>,
    private paymentService: PaymentService,
  ) {}

  /**
   * 1. 支付路由统一API
   * 整合现有 PaymentService 的智能路由，增加手续费估算、风险评分、多链支持
   */
  async routePayment(context: RoutingContext): Promise<PaymentRoute> {
    this.logger.log(`路由支付请求: ${JSON.stringify(context)}`);

    // 1. 获取可用的路由
    const availableRoutes = await this.getAvailableRoutes(context);

    // 2. 为每个路由计算费用和风险
    const routesWithMetrics = await Promise.all(
      availableRoutes.map(async (route) => {
        const feeEstimate = await this.estimateFees({
          routeId: route.id,
          amount: context.amount,
          currency: context.currency,
        });

        const riskAssessment = await this.assessRisk({
          amount: context.amount,
          currency: context.currency,
          route: route,
          userId: context.userId,
          agentId: context.agentId,
        });

        return {
          route,
          feeEstimate,
          riskAssessment,
          score: this.calculateRouteScore(route, feeEstimate, riskAssessment),
        };
      }),
    );

    // 3. 选择最优路由（综合考虑费用、风险、成功率）
    const bestRoute = routesWithMetrics.sort((a, b) => b.score - a.score)[0];

    return {
      routeId: bestRoute.route.id,
      paymentMethod: bestRoute.route.paymentMethod,
      sourceChain: bestRoute.route.sourceChain,
      targetChain: bestRoute.route.targetChain,
      estimatedFee: bestRoute.feeEstimate.estimatedFee,
      feeBreakdown: bestRoute.feeEstimate.feeBreakdown,
      successRate: bestRoute.route.successRate || 95,
      avgExecutionTime: bestRoute.route.avgExecutionTime || 2000,
      riskLevel: bestRoute.riskAssessment.riskLevel,
    };
  }

  /**
   * 2. 交易风险模型
   * 风险评分算法，整合KYC状态、历史交易、金额、频率
   */
  async assessRisk(params: {
    amount: number;
    currency: string;
    route?: TransactionRoute;
    userId?: string;
    agentId?: string;
    transactionId?: string;
  }): Promise<RiskAssessmentResult> {
    this.logger.log(`评估交易风险: ${JSON.stringify(params)}`);

    // 1. 基础风险因子
    let riskScore = 0;
    const riskFactors: any = {
      amount: params.amount,
      frequency: 0,
      kycStatus: 'unknown',
      historyScore: 50,
    };

    // 2. 金额风险（大额交易风险更高）
    if (params.amount > 100000) {
      riskScore += 30;
    } else if (params.amount > 10000) {
      riskScore += 15;
    } else if (params.amount > 1000) {
      riskScore += 5;
    }

    // 3. 用户历史风险（如果有userId）
    if (params.userId) {
      // TODO: 查询用户历史交易，计算频率和历史评分
      // const userHistory = await this.getUserTransactionHistory(params.userId);
      // riskFactors.frequency = userHistory.recentFrequency;
      // riskFactors.historyScore = userHistory.riskScore;
      // riskScore += userHistory.riskScore * 0.3;
    }

    // 4. KYC状态风险
    // TODO: 查询用户KYC状态
    // if (kycStatus === 'verified') {
    //   riskScore -= 20;
    // } else if (kycStatus === 'pending') {
    //   riskScore += 10;
    // } else {
    //   riskScore += 30;
    // }

    // 5. 路由风险
    if (params.route) {
      if (params.route.riskLevel === 'high') {
        riskScore += 20;
      } else if (params.route.riskLevel === 'critical') {
        riskScore += 40;
      }
    }

    // 6. 确定风险等级
    let riskLevel: 'low' | 'medium' | 'high' | 'critical';
    if (riskScore < 30) {
      riskLevel = 'low';
    } else if (riskScore < 60) {
      riskLevel = 'medium';
    } else if (riskScore < 80) {
      riskLevel = 'high';
    } else {
      riskLevel = 'critical';
    }

    // 7. 生成建议
    let recommendation = '';
    if (riskLevel === 'critical') {
      recommendation = '建议暂停交易，进行人工审核';
    } else if (riskLevel === 'high') {
      recommendation = '建议进行额外验证（2FA、KYC）';
    } else if (riskLevel === 'medium') {
      recommendation = '建议使用更安全的支付方式';
    } else {
      recommendation = '风险较低，可以继续';
    }

    const assessment: RiskAssessmentResult = {
      riskScore: Math.min(100, Math.max(0, riskScore)),
      riskLevel,
      riskFactors,
      recommendation,
    };

    // 8. 保存风险评估记录
    if (params.transactionId || params.userId) {
      await this.riskAssessmentRepository.save({
        transactionId: params.transactionId,
        userId: params.userId,
        agentId: params.agentId,
        riskScore: assessment.riskScore,
        riskLevel: assessment.riskLevel,
        riskFactors: assessment.riskFactors,
        recommendation: assessment.recommendation,
      });
    }

    return assessment;
  }

  /**
   * 3. 手续费估算
   * 各通道手续费计算，支持链上Gas费、法币手续费、跨链桥接费
   */
  async estimateFees(params: {
    routeId?: string;
    amount: number;
    currency: string;
    sourceChain?: string;
    targetChain?: string;
    paymentMethod?: string;
  }): Promise<FeeEstimateResult> {
    this.logger.log(`估算手续费: ${JSON.stringify(params)}`);

    let route: TransactionRoute | null = null;

    // 1. 获取路由配置
    if (params.routeId) {
      route = await this.transactionRouteRepository.findOne({
        where: { id: params.routeId },
      });
    } else if (params.sourceChain && params.targetChain && params.paymentMethod) {
      route = await this.transactionRouteRepository.findOne({
        where: {
          sourceChain: params.sourceChain,
          targetChain: params.targetChain,
          paymentMethod: params.paymentMethod,
          isActive: true,
        },
      });
    }

    // 2. 计算手续费
    let baseFee = 0;
    let percentageFee = 0;
    let gasFee = 0;
    let bridgeFee = 0;

    if (route) {
      const feeStructure = route.feeStructure;
      baseFee = feeStructure.baseFee || 0;
      percentageFee = (params.amount * feeStructure.percentageFee) / 100;
      
      // 应用最小和最大费用限制
      if (feeStructure.minFee) {
        percentageFee = Math.max(percentageFee, feeStructure.minFee);
      }
      if (feeStructure.maxFee) {
        percentageFee = Math.min(percentageFee, feeStructure.maxFee);
      }

      // 如果是跨链，计算桥接费
      if (params.sourceChain && params.targetChain && params.sourceChain !== params.targetChain) {
        bridgeFee = params.amount * 0.001; // 0.1% 桥接费
      }

      // 如果是链上交易，估算Gas费
      if (params.sourceChain && ['ethereum', 'bsc', 'polygon'].includes(params.sourceChain)) {
        gasFee = 0.001; // 简化估算，实际应该查询当前Gas价格
      }
    } else {
      // 默认费用结构
      baseFee = 0;
      percentageFee = params.amount * 0.003; // 0.3%
    }

    const totalFee = baseFee + percentageFee + gasFee + bridgeFee;

    const feeEstimate: FeeEstimateResult = {
      estimatedFee: totalFee,
      feeBreakdown: {
        baseFee,
        percentageFee,
        gasFee,
        bridgeFee,
        totalFee,
      },
      currency: params.currency,
    };

    // 3. 保存费用估算记录
    if (route) {
      await this.feeEstimateRepository.save({
        routeId: route.id,
        amount: params.amount.toString(),
        currency: params.currency,
        estimatedFee: totalFee.toString(),
        feeBreakdown: feeEstimate.feeBreakdown,
      });
    }

    return feeEstimate;
  }

  /**
   * 4. 多链交易构造
   * 统一交易构造接口，支持EVM、Solana、TON、BTC
   */
  async buildTransaction(
    chain: string,
    type: 'payment' | 'swap' | 'transfer' | 'bridge',
    params: TransactionParams,
  ): Promise<any> {
    this.logger.log(`构建交易: chain=${chain}, type=${type}`);

    // TODO: 根据链类型和交易类型构造交易
    // 当前返回基础结构，后续需要实现具体的交易构造逻辑

    const transaction = {
      chain,
      type,
      from: params.from,
      to: params.to,
      amount: params.amount,
      token: params.token,
      timestamp: Date.now(),
    };

    // EVM链（Ethereum、BSC、Polygon等）
    if (['ethereum', 'bsc', 'polygon', 'arbitrum', 'optimism'].includes(chain)) {
      return {
        ...transaction,
        gasLimit: '21000',
        gasPrice: '20000000000', // 20 gwei
        nonce: 0, // TODO: 查询实际nonce
      };
    }

    // Solana
    if (chain === 'solana') {
      return {
        ...transaction,
        recentBlockhash: '', // TODO: 获取实际blockhash
        feePayer: params.from,
      };
    }

    // 其他链
    return transaction;
  }

  /**
   * 5. 合规检查模型
   * 整合KYC/AML分类器，自动合规检查
   */
  async checkCompliance(params: {
    userId?: string;
    agentId?: string;
    amount: number;
    currency: string;
    transaction: any;
  }): Promise<ComplianceResult> {
    this.logger.log(`合规检查: ${JSON.stringify(params)}`);

    // TODO: 实现合规检查逻辑
    // 1. 检查KYC状态
    // 2. AML检查
    // 3. 制裁名单检查
    // 4. 大额交易报告

    // 当前简化实现
    const result: ComplianceResult = {
      allowed: true,
      kycRequired: params.amount > 10000,
      amlCheck: params.amount > 50000,
    };

    if (params.amount > 100000) {
      result.allowed = false;
      result.reason = '交易金额过大，需要人工审核';
    }

    return result;
  }

  // ========== 私有辅助方法 ==========

  private async getAvailableRoutes(context: RoutingContext): Promise<TransactionRoute[]> {
    // 查询可用的路由
    const routes = await this.transactionRouteRepository.find({
      where: {
        isActive: true,
        ...(context.sourceChain && { sourceChain: context.sourceChain }),
        ...(context.targetChain && { targetChain: context.targetChain }),
        ...(context.paymentMethod && { paymentMethod: context.paymentMethod }),
      },
      order: {
        successRate: 'DESC',
      },
      take: 10,
    });

    // 如果没有找到，返回默认路由
    if (routes.length === 0) {
      return [
        {
          id: 'default',
          sourceChain: context.sourceChain || 'ethereum',
          targetChain: context.targetChain || 'ethereum',
          paymentMethod: context.paymentMethod || 'wallet',
          feeStructure: {
            baseFee: 0,
            percentageFee: 0.003,
            minFee: 0.01,
          },
          riskLevel: 'medium',
          successRate: 95,
          avgExecutionTime: 2000,
          isActive: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        } as TransactionRoute,
      ];
    }

    return routes;
  }

  private calculateRouteScore(
    route: TransactionRoute,
    feeEstimate: FeeEstimateResult,
    riskAssessment: RiskAssessmentResult,
  ): number {
    // 综合评分算法
    // 成功率权重: 40%
    // 费用权重: 30%
    // 风险权重: 20%
    // 执行时间权重: 10%

    const successScore = (route.successRate || 95) * 0.4;
    const feeScore = (1 - feeEstimate.estimatedFee / 100) * 100 * 0.3; // 费用越低分数越高
    const riskScore = (100 - riskAssessment.riskScore) * 0.2; // 风险越低分数越高
    const timeScore = (1 - (route.avgExecutionTime || 2000) / 10000) * 100 * 0.1; // 时间越短分数越高

    return successScore + feeScore + riskScore + timeScore;
  }
}

