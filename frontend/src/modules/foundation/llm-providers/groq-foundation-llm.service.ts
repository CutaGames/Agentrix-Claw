import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Groq from 'groq-sdk';
import {
  IFoundationLLM,
  IntentRecognitionResult,
  RiskAssessmentResult,
  TransactionCategory,
  RouteSuggestion,
  AssetAnalysis,
  TransactionContext,
  TransactionData,
  RoutingContext,
  RouteOptions,
  AggregatedAssets,
} from '../interfaces/foundation-llm.interface';

/**
 * Groq底座大模型实现（临时）
 * 通过统一接口为Foundation Models提供AI能力
 */
@Injectable()
export class GroqFoundationLLM implements IFoundationLLM {
  private readonly logger = new Logger(GroqFoundationLLM.name);
  private readonly groq: Groq | null;
  private readonly defaultModel = 'llama-3-groq-70b-tool-use';

  constructor(private readonly configService: ConfigService) {
    const apiKey = this.configService.get<string>('GROQ_API_KEY');
    if (!apiKey) {
      this.logger.warn('GROQ_API_KEY not configured, Groq foundation LLM will be disabled');
      this.groq = null;
    } else {
      this.groq = new Groq({ apiKey });
      this.logger.log('Groq foundation LLM initialized');
    }
  }

  /**
   * 意图识别
   */
  async recognizeIntent(
    text: string,
    context?: { userId?: string; history?: any[]; sessionId?: string }
  ): Promise<IntentRecognitionResult> {
    if (!this.groq) {
      throw new Error('Groq API not configured');
    }

    // 收集训练数据（用于优化自建模型）
    await this.collectTrainingData('recognizeIntent', { text, context });

    const prompt = `你是一个交易意图识别专家。分析用户的自然语言输入，识别交易意图。

用户输入: "${text}"

${context?.history ? `历史对话: ${JSON.stringify(context.history.slice(-5))}` : ''}

请返回JSON格式的意图识别结果：
{
  "intent": "dca" | "swap" | "rebalancing" | "arbitrage" | "market_making" | "product_search" | "payment" | "other",
  "entities": {
    "amount": 数字（如果有）,
    "percentage": 百分比（如果有）,
    "fromToken": "代币符号（如果有）",
    "toToken": "代币符号（如果有）",
    "frequency": "daily" | "weekly" | "monthly"（如果有）
  },
  "confidence": 0-100
}`;

    try {
      const response = await this.groq.chat.completions.create({
        model: this.defaultModel,
        messages: [
          { role: 'system', content: '你是一个专业的交易意图识别系统。请准确识别用户意图。' },
          { role: 'user', content: prompt }
        ],
        response_format: { type: 'json_object' },
        temperature: 0.3,
      });

      const result = JSON.parse(response.choices[0].message.content || '{}') as IntentRecognitionResult;
      
      // 记录使用情况
      await this.logUsage('recognizeIntent', result);
      
      return result;
    } catch (error: any) {
      this.logger.error(`意图识别失败: ${error.message}`, error.stack);
      // 返回默认结果
      return {
        intent: 'other',
        entities: {},
        confidence: 0,
      };
    }
  }

  /**
   * 风险评估
   */
  async assessRisk(
    transaction: TransactionContext,
    userHistory?: any[]
  ): Promise<RiskAssessmentResult> {
    if (!this.groq) {
      throw new Error('Groq API not configured');
    }

    const prompt = `分析以下交易的风险：

交易信息：
- 金额: ${transaction.amount} ${transaction.currency}
- 类型: ${transaction.type || 'unknown'}
- 链: ${transaction.chain || 'unknown'}
- 用户KYC状态: ${transaction.kycStatus || 'unknown'}

${userHistory ? `用户历史交易: ${JSON.stringify(userHistory.slice(-10))}` : ''}

请返回JSON格式的风险评估：
{
  "riskScore": 0-100,
  "riskLevel": "low" | "medium" | "high" | "critical",
  "riskFactors": {
    "amount": 风险评分,
    "frequency": 风险评分,
    "kycStatus": 风险评分,
    "historyScore": 风险评分
  },
  "recommendation": "建议文本"
}`;

    try {
      const response = await this.groq.chat.completions.create({
        model: this.defaultModel,
        messages: [
          { role: 'system', content: '你是一个专业的交易风险评估系统。' },
          { role: 'user', content: prompt }
        ],
        response_format: { type: 'json_object' },
        temperature: 0.2,
      });

      return JSON.parse(response.choices[0].message.content || '{}') as RiskAssessmentResult;
    } catch (error: any) {
      this.logger.error(`风险评估失败: ${error.message}`, error.stack);
      // 返回默认结果
      return {
        riskScore: 50,
        riskLevel: 'medium',
        riskFactors: {},
        recommendation: '风险评估失败，请人工审核',
      };
    }
  }

  /**
   * 交易分类
   */
  async classifyTransaction(
    transaction: TransactionData,
    userContext?: any
  ): Promise<TransactionCategory> {
    if (!this.groq) {
      throw new Error('Groq API not configured');
    }

    const prompt = `对以下交易进行分类：

交易数据：
${JSON.stringify(transaction)}

请返回JSON格式的分类结果：
{
  "category": "支付" | "转账" | "交易" | "空投" | "其他",
  "subcategory": "具体子分类",
  "tags": ["标签1", "标签2"],
  "confidence": 0-100
}`;

    try {
      const response = await this.groq.chat.completions.create({
        model: this.defaultModel,
        messages: [
          { role: 'system', content: '你是一个专业的交易分类系统（AI Ledger）。' },
          { role: 'user', content: prompt }
        ],
        response_format: { type: 'json_object' },
        temperature: 0.3,
      });

      return JSON.parse(response.choices[0].message.content || '{}') as TransactionCategory;
    } catch (error: any) {
      this.logger.error(`交易分类失败: ${error.message}`, error.stack);
      return {
        category: '其他',
        tags: [],
        confidence: 0,
      };
    }
  }

  /**
   * 路由建议
   */
  async suggestPaymentRoute(
    context: RoutingContext,
    options?: RouteOptions[]
  ): Promise<RouteSuggestion> {
    if (!this.groq) {
      throw new Error('Groq API not configured');
    }

    const prompt = `基于以下上下文，建议最优支付路由：

上下文：
- 金额: ${context.amount} ${context.currency}
- 源链: ${context.sourceChain || 'unknown'}
- 目标链: ${context.targetChain || 'unknown'}
- 支付方式: ${context.paymentMethod || 'unknown'}
- KYC状态: ${context.kycStatus || 'unknown'}

${options ? `可选路由: ${JSON.stringify(options)}` : ''}

请返回JSON格式的路由建议：
{
  "recommendedRoute": {
    "paymentMethod": "支付方式",
    "sourceChain": "源链",
    "targetChain": "目标链",
    "estimatedFee": 估算费用,
    "successRate": 成功率（0-100）
  },
  "alternatives": [可选替代路由],
  "reasoning": "推荐理由"
}`;

    try {
      const response = await this.groq.chat.completions.create({
        model: this.defaultModel,
        messages: [
          { role: 'system', content: '你是一个专业的支付路由建议系统。' },
          { role: 'user', content: prompt }
        ],
        response_format: { type: 'json_object' },
        temperature: 0.3,
      });

      return JSON.parse(response.choices[0].message.content || '{}') as RouteSuggestion;
    } catch (error: any) {
      this.logger.error(`路由建议失败: ${error.message}`, error.stack);
      return {
        recommendedRoute: {
          paymentMethod: context.paymentMethod || 'wallet',
          sourceChain: context.sourceChain || 'ethereum',
          targetChain: context.targetChain || 'ethereum',
          estimatedFee: 0,
          successRate: 95,
        },
        reasoning: '路由建议失败，使用默认路由',
      };
    }
  }

  /**
   * 资产分析
   */
  async analyzeAssets(
    assets: AggregatedAssets,
    userContext?: any
  ): Promise<AssetAnalysis> {
    if (!this.groq) {
      throw new Error('Groq API not configured');
    }

    const prompt = `分析以下资产配置的健康度和风险：

资产数据：
${JSON.stringify(assets)}

请返回JSON格式的分析结果：
{
  "riskScore": 0-100,
  "riskLevel": "low" | "medium" | "high" | "critical",
  "recommendations": ["建议1", "建议2"],
  "warnings": ["警告1", "警告2"]（可选）,
  "distribution": [{"chain": "链名", "percentage": 百分比, "usdValue": 价值}]
}`;

    try {
      const response = await this.groq.chat.completions.create({
        model: this.defaultModel,
        messages: [
          { role: 'system', content: '你是一个专业的资产分析系统。' },
          { role: 'user', content: prompt }
        ],
        response_format: { type: 'json_object' },
        temperature: 0.3,
      });

      return JSON.parse(response.choices[0].message.content || '{}') as AssetAnalysis;
    } catch (error: any) {
      this.logger.error(`资产分析失败: ${error.message}`, error.stack);
      return {
        riskScore: 50,
        riskLevel: 'medium',
        recommendations: ['资产分析失败，请人工审核'],
      };
    }
  }

  /**
   * 获取模型信息
   */
  getModelInfo() {
    return {
      provider: 'groq',
      modelName: this.defaultModel,
      version: '1.0',
      isTemporary: true, // 标记为临时实现
    };
  }

  /**
   * 收集训练数据（用于优化自建模型）
   */
  private async collectTrainingData(method: string, data: any) {
    // TODO: 保存到数据库，用于训练自建模型
    // await this.trainingDataRepository.save({
    //   method,
    //   input: data,
    //   timestamp: new Date(),
    // });
    this.logger.debug(`收集训练数据: ${method}`, { data });
  }

  /**
   * 记录使用情况
   */
  private async logUsage(method: string, result: any) {
    // TODO: 记录使用统计，用于分析模型效果
    this.logger.debug(`记录使用情况: ${method}`, { result });
  }
}

