import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { IntentRecord } from './entities/intent-record.entity';
import { StrategyGraph } from './entities/strategy-graph.entity';
import { StrategyGraphService } from './strategy-graph.service';

export interface IntentRecognitionResult {
  intent: string; // 'dca' | 'rebalancing' | 'swap' | 'arbitrage' | 'market_making'
  entities: {
    amount?: number;
    percentage?: number;
    fromToken?: string;
    toToken?: string;
    frequency?: string; // 'daily' | 'weekly' | 'monthly'
    schedule?: string; // Cron表达式
    [key: string]: any;
  };
  confidence: number; // 0-100
}

/**
 * 意图识别引擎
 * 将自然语言转换为交易意图和实体
 */
@Injectable()
export class IntentEngineService {
  private readonly logger = new Logger(IntentEngineService.name);

  constructor(
    @InjectRepository(IntentRecord)
    private intentRecordRepository: Repository<IntentRecord>,
    private strategyGraphService: StrategyGraphService,
  ) {}

  /**
   * 识别交易意图
   * 将自然语言转换为结构化的意图和实体
   */
  async recognizeIntent(
    intentText: string,
    userId: string,
    agentId?: string,
  ): Promise<IntentRecognitionResult> {
    this.logger.log(`识别意图: ${intentText}`);

    // TODO: 集成LLM进行意图识别
    // 当前使用规则引擎作为基础实现

    // 1. 规则引擎识别（基础实现）
    const ruleBasedResult = this.recognizeByRules(intentText);

    // 2. 如果规则引擎置信度低，可以调用LLM
    // if (ruleBasedResult.confidence < 70) {
    //   const llmResult = await this.recognizeByLLM(intentText);
    //   if (llmResult.confidence > ruleBasedResult.confidence) {
    //     return llmResult;
    //   }
    // }

    // 3. 保存意图识别记录
    const intentRecord = await this.intentRecordRepository.save({
      userId,
      agentId,
      intentText,
      recognizedIntent: {
        intent: ruleBasedResult.intent,
        entities: ruleBasedResult.entities,
      },
      confidence: ruleBasedResult.confidence,
    });

    return {
      ...ruleBasedResult,
    };
  }

  /**
   * 规则引擎识别（基础实现）
   */
  private recognizeByRules(intentText: string): IntentRecognitionResult {
    const lowerText = intentText.toLowerCase();
    let intent = 'swap';
    let confidence = 60;
    const entities: any = {};

    // 识别DCA（定投）意图
    if (
      lowerText.includes('定投') ||
      lowerText.includes('dca') ||
      lowerText.includes('定期') ||
      lowerText.includes('每周') ||
      lowerText.includes('每月')
    ) {
      intent = 'dca';
      confidence = 85;

      // 提取频率
      if (lowerText.includes('每周') || lowerText.includes('week')) {
        entities.frequency = 'weekly';
      } else if (lowerText.includes('每月') || lowerText.includes('month')) {
        entities.frequency = 'monthly';
      } else if (lowerText.includes('每天') || lowerText.includes('daily')) {
        entities.frequency = 'daily';
      }
    }

    // 识别调仓（Rebalancing）意图
    if (
      lowerText.includes('调仓') ||
      lowerText.includes('rebalance') ||
      lowerText.includes('调整') ||
      lowerText.includes('换成')
    ) {
      intent = 'rebalancing';
      confidence = 80;

      // 提取百分比
      const percentageMatch = lowerText.match(/(\d+)%/);
      if (percentageMatch) {
        entities.percentage = parseFloat(percentageMatch[1]);
      }
    }

    // 识别套利意图
    if (
      lowerText.includes('套利') ||
      lowerText.includes('arbitrage') ||
      lowerText.includes('价差')
    ) {
      intent = 'arbitrage';
      confidence = 85;
    }

    // 识别做市意图
    if (
      lowerText.includes('做市') ||
      lowerText.includes('market making') ||
      lowerText.includes('提供流动性')
    ) {
      intent = 'market_making';
      confidence = 85;
    }

    // 提取代币
    const tokenPatterns = [
      /(?:换成|换成|买入|卖出)\s*(\w+)/i,
      /(\w+)\s*(?:换成|换成)/i,
      /(BTC|ETH|SOL|USDC|USDT)/i,
    ];

    for (const pattern of tokenPatterns) {
      const match = intentText.match(pattern);
      if (match) {
        if (!entities.toToken) {
          entities.toToken = match[1].toUpperCase();
        } else if (!entities.fromToken) {
          entities.fromToken = match[1].toUpperCase();
        }
      }
    }

    // 提取金额
    const amountPatterns = [
      /(\d+(?:\.\d+)?)\s*(?:USDC|USDT|USD)/i,
      /(\d+(?:\.\d+)?)\s*(?:元|美元)/i,
    ];

    for (const pattern of amountPatterns) {
      const match = intentText.match(pattern);
      if (match) {
        entities.amount = parseFloat(match[1]);
      }
    }

    return {
      intent: intent as any,
      entities,
      confidence,
    };
  }

  /**
   * LLM识别（待实现）
   */
  private async recognizeByLLM(
    intentText: string,
  ): Promise<IntentRecognitionResult> {
    // TODO: 调用GPT-4/Claude进行意图识别
    // const prompt = `分析以下交易意图，提取意图类型和实体：
    // "${intentText}"
    // 
    // 返回JSON格式：
    // {
    //   "intent": "dca|rebalancing|swap|arbitrage|market_making",
    //   "entities": {
    //     "amount": 100,
    //     "percentage": 10,
    //     "fromToken": "USDC",
    //     "toToken": "BTC",
    //     "frequency": "weekly"
    //   },
    //   "confidence": 90
    // }`;

    // const response = await this.llmService.generate(prompt);
    // return JSON.parse(response);

    throw new Error('LLM recognition not implemented');
  }
}

