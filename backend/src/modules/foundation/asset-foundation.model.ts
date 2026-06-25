import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AssetAggregation } from './entities/asset-aggregation.entity';
import { TransactionClassification } from './entities/transaction-classification.entity';

export interface AggregatedAssets {
  userId: string;
  totalUsdValue: number;
  assets: {
    chain: string;
    tokenAddress: string;
    tokenSymbol: string;
    balance: string;
    usdValue: number;
  }[];
  fiatAccounts?: FiatAccount[];
}

export interface FiatAccount {
  provider: string; // 'bank' | 'paypal' | 'stripe' | 'revolut' | 'wise'
  accountType: string; // 'checking' | 'savings' | 'credit_card'
  balance: number;
  currency: string;
  lastSyncedAt: Date;
}

export interface TransactionCategory {
  category: string;
  subcategory?: string;
  tags: string[];
  confidence: number;
}

export interface RiskRecommendation {
  riskScore: number; // 0-100
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  recommendations: string[];
  warnings?: string[];
}

export interface AssetHealthReport {
  userId: string;
  reportDate: Date;
  totalAssets: number;
  totalLiabilities: number;
  netWorth: number;
  riskScore: number;
  recommendations: string[];
  assetDistribution: {
    chain: string;
    percentage: number;
    usdValue: number;
  }[];
}

@Injectable()
export class AssetFoundationModel {
  private readonly logger = new Logger(AssetFoundationModel.name);

  constructor(
    @InjectRepository(AssetAggregation)
    private assetAggregationRepository: Repository<AssetAggregation>,
    @InjectRepository(TransactionClassification)
    private transactionClassificationRepository: Repository<TransactionClassification>,
  ) {}

  /**
   * 1. 多链资产读取
   * 整合现有 AssetAggregationService，新增法币账户聚合、链上身份聚合
   */
  async aggregateAssets(userId: string): Promise<AggregatedAssets> {
    this.logger.log(`聚合用户资产: userId=${userId}`);

    // 1. 查询链上资产
    const onChainAssets = await this.assetAggregationRepository.find({
      where: { userId },
    });

    // 2. 聚合法币账户（TODO: 实现法币账户聚合）
    const fiatAccounts = await this.aggregateFiatAccounts(userId);

    // 3. 计算总价值
    const totalUsdValue =
      onChainAssets.reduce((sum, asset) => sum + (asset.usdValue || 0), 0) +
      (fiatAccounts?.reduce((sum, account) => sum + account.balance, 0) || 0);

    return {
      userId,
      totalUsdValue,
      assets: onChainAssets.map((asset) => ({
        chain: asset.chain,
        tokenAddress: asset.tokenAddress,
        tokenSymbol: asset.tokenSymbol,
        balance: asset.balance,
        usdValue: asset.usdValue || 0,
      })),
      fiatAccounts,
    };
  }

  /**
   * 2. 法币账户聚合
   * 新增：银行账户API集成（Plaid、Yodlee）、PayPal、Stripe账户读取
   */
  async aggregateFiatAccounts(userId: string): Promise<FiatAccount[]> {
    this.logger.log(`聚合法币账户: userId=${userId}`);

    // TODO: 实现法币账户聚合
    // 1. 集成 Plaid API（银行账户）
    // 2. 集成 PayPal API
    // 3. 集成 Stripe API
    // 4. 集成 Revolut API
    // 5. 集成 Wise API

    // 当前返回空数组，后续实现
    return [];
  }

  /**
   * 3. 交易分类器（AI Ledger）
   * 使用LLM + 规则引擎，输出收入/支出、类别、标签
   */
  async classifyTransaction(params: {
    transactionId: string;
    userId: string;
    amount: number;
    currency: string;
    description?: string;
    merchantName?: string;
    category?: string;
  }): Promise<TransactionCategory> {
    this.logger.log(`分类交易: transactionId=${params.transactionId}`);

    // 1. 规则引擎分类（基于关键词）
    let category = 'other';
    let subcategory: string | undefined;
    const tags: string[] = [];
    let confidence = 70; // 基础置信度

    // 收入/支出判断
    if (params.amount > 0) {
      category = 'income';
      tags.push('income');
    } else {
      category = 'expense';
      tags.push('expense');
    }

    // 基于描述和商户名称分类
    const description = (params.description || '').toLowerCase();
    const merchantName = (params.merchantName || '').toLowerCase();

    // 餐饮
    if (
      description.includes('restaurant') ||
      description.includes('food') ||
      description.includes('cafe') ||
      merchantName.includes('starbucks') ||
      merchantName.includes('mcdonald')
    ) {
      category = 'expense';
      subcategory = 'food';
      tags.push('food', 'dining');
      confidence = 85;
    }

    // 交通
    if (
      description.includes('uber') ||
      description.includes('taxi') ||
      description.includes('gas') ||
      description.includes('fuel') ||
      merchantName.includes('uber')
    ) {
      category = 'expense';
      subcategory = 'transportation';
      tags.push('transport', 'travel');
      confidence = 85;
    }

    // 购物
    if (
      description.includes('amazon') ||
      description.includes('shop') ||
      description.includes('store') ||
      merchantName.includes('amazon')
    ) {
      category = 'expense';
      subcategory = 'shopping';
      tags.push('shopping', 'retail');
      confidence = 85;
    }

    // 订阅
    if (
      description.includes('subscription') ||
      description.includes('netflix') ||
      description.includes('spotify') ||
      merchantName.includes('netflix')
    ) {
      category = 'expense';
      subcategory = 'subscription';
      tags.push('subscription', 'recurring');
      confidence = 90;
    }

    // TODO: 使用LLM进行更智能的分类
    // const llmResult = await this.llmService.classifyTransaction(params);
    // if (llmResult.confidence > confidence) {
    //   category = llmResult.category;
    //   subcategory = llmResult.subcategory;
    //   tags.push(...llmResult.tags);
    //   confidence = llmResult.confidence;
    // }

    const classification: TransactionCategory = {
      category,
      subcategory,
      tags,
      confidence,
    };

    // 保存分类结果
    await this.transactionClassificationRepository.save({
      transactionId: params.transactionId,
      userId: params.userId,
      category,
      subcategory,
      tags,
      confidence,
    });

    return classification;
  }

  /**
   * 4. 风险建议
   * 资产健康度评分、杠杆风险、偿付能力分析、投资建议
   */
  async assessAssetRisk(assets: AggregatedAssets): Promise<RiskRecommendation> {
    this.logger.log(`评估资产风险: userId=${assets.userId}`);

    let riskScore = 0;
    const recommendations: string[] = [];
    const warnings: string[] = [];

    // 1. 资产集中度风险
    if (assets.assets.length > 0) {
      const maxAssetPercentage =
        (Math.max(...assets.assets.map((a) => a.usdValue)) / assets.totalUsdValue) * 100;
      if (maxAssetPercentage > 80) {
        riskScore += 30;
        warnings.push('资产过度集中，建议分散投资');
      } else if (maxAssetPercentage > 60) {
        riskScore += 15;
        recommendations.push('建议增加资产多样性');
      }
    }

    // 2. 链集中度风险
    const chainDistribution = new Map<string, number>();
    assets.assets.forEach((asset) => {
      const current = chainDistribution.get(asset.chain) || 0;
      chainDistribution.set(asset.chain, current + asset.usdValue);
    });

    const maxChainPercentage =
      (Math.max(...Array.from(chainDistribution.values())) / assets.totalUsdValue) * 100;
    if (maxChainPercentage > 90) {
      riskScore += 20;
      warnings.push('资产过度集中在单一链上，存在单点故障风险');
    }

    // 3. 资产规模风险
    if (assets.totalUsdValue < 1000) {
      riskScore += 10;
      recommendations.push('资产规模较小，建议增加储蓄');
    } else if (assets.totalUsdValue > 1000000) {
      riskScore += 5;
      recommendations.push('资产规模较大，建议考虑专业资产管理');
    }

    // 4. 确定风险等级
    let riskLevel: 'low' | 'medium' | 'high' | 'critical';
    if (riskScore < 20) {
      riskLevel = 'low';
    } else if (riskScore < 50) {
      riskLevel = 'medium';
    } else if (riskScore < 70) {
      riskLevel = 'high';
    } else {
      riskLevel = 'critical';
    }

    // 5. 生成建议
    if (riskLevel === 'low') {
      recommendations.push('资产配置健康，继续保持');
    } else if (riskLevel === 'medium') {
      recommendations.push('建议优化资产配置，降低风险');
    } else if (riskLevel === 'high') {
      recommendations.push('风险较高，建议咨询专业财务顾问');
    } else {
      recommendations.push('风险极高，建议立即调整资产配置');
    }

    return {
      riskScore: Math.min(100, riskScore),
      riskLevel,
      recommendations,
      warnings: warnings.length > 0 ? warnings : undefined,
    };
  }

  /**
   * 5. 资产健康度报告
   * 自动生成报告，包含资产分布、负债结构、风险指标
   */
  async generateHealthReport(userId: string): Promise<AssetHealthReport> {
    this.logger.log(`生成资产健康度报告: userId=${userId}`);

    // 1. 聚合资产
    const assets = await this.aggregateAssets(userId);

    // 2. 评估风险
    const riskAssessment = await this.assessAssetRisk(assets);

    // 3. 计算资产分布
    const chainDistribution = new Map<string, number>();
    assets.assets.forEach((asset) => {
      const current = chainDistribution.get(asset.chain) || 0;
      chainDistribution.set(asset.chain, current + asset.usdValue);
    });

    const assetDistribution = Array.from(chainDistribution.entries()).map(([chain, usdValue]) => ({
      chain,
      percentage: (usdValue / assets.totalUsdValue) * 100,
      usdValue,
    }));

    // 4. 计算负债（TODO: 实现负债查询）
    const totalLiabilities = 0; // TODO: 查询用户负债

    // 5. 生成报告
    const report: AssetHealthReport = {
      userId,
      reportDate: new Date(),
      totalAssets: assets.totalUsdValue,
      totalLiabilities,
      netWorth: assets.totalUsdValue - totalLiabilities,
      riskScore: riskAssessment.riskScore,
      recommendations: riskAssessment.recommendations,
      assetDistribution,
    };

    return report;
  }
}

