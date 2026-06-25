import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { OpenAI } from 'openai';

/**
 * 解析后的支付意图
 */
export interface ParsedPaymentIntent {
  type: 'pay' | 'pay_from_deposit' | 'split_pay' | 'subscribe' | 'tip';
  amount: number;
  currency: string;
  recipientAddress?: string;
  recipientAgentId?: string;
  recipientName?: string;
  
  // Session 关联
  sessionId?: string;
  sessionRef?: string;  // 如 "上周的预存款"
  
  // 任务关联
  taskId?: string;
  taskType?: string;
  taskDescription?: string;
  
  // 分账配置
  splitConfig?: Array<{
    recipient: string;
    share: number;
    role: string;
  }>;
  
  // 元数据
  description?: string;
  confidence: number;  // 0-1
  missingFields?: string[];
  rawIntent?: string;
}

/**
 * 意图解析上下文
 */
export interface IntentContext {
  sessionId?: string;
  taskId?: string;
  previousIntents?: ParsedPaymentIntent[];
  userPreferences?: {
    preferredCurrency?: string;
    defaultPaymentMethod?: string;
  };
}

/**
 * 自然语言意图服务
 * 
 * 功能：
 * 1. LLM 语义解析（替代关键词匹配）
 * 2. Session 上下文关联
 * 3. 混合意图（支付+任务）解析
 * 4. 多轮对话意图累积
 */
@Injectable()
export class NaturalLanguageIntentService {
  private readonly logger = new Logger(NaturalLanguageIntentService.name);
  private openai: OpenAI | null = null;

  // 意图历史缓存（用于多轮对话）
  private intentHistory: Map<string, ParsedPaymentIntent[]> = new Map();

  constructor(
    private readonly configService: ConfigService,
  ) {
    // 初始化 OpenAI 客户端
    const apiKey = this.configService.get('OPENAI_API_KEY');
    if (apiKey) {
      this.openai = new OpenAI({ apiKey });
      this.logger.log('OpenAI client initialized for NL intent parsing');
    } else {
      this.logger.warn('OPENAI_API_KEY not configured, falling back to rule-based parsing');
    }
  }

  /**
   * 解析支付意图
   * 主入口：自然语言 → 结构化意图
   */
  async parsePaymentIntent(
    intentText: string,
    userId: string,
    context?: IntentContext,
  ): Promise<ParsedPaymentIntent> {
    this.logger.log(`解析支付意图: "${intentText}"`);

    // 1. 尝试 LLM 解析
    if (this.openai) {
      try {
        const llmResult = await this.parseWithLLM(intentText, userId, context);
        if (llmResult.confidence >= 0.7) {
          // 保存到历史
          this.saveIntentHistory(userId, llmResult);
          return llmResult;
        }
        this.logger.log(`LLM 置信度较低 (${llmResult.confidence}), 尝试规则增强`);
      } catch (error: any) {
        this.logger.error(`LLM 解析失败: ${error.message}`);
      }
    }

    // 2. 回退到规则引擎
    const ruleResult = this.parseWithRules(intentText, context);
    
    // 3. 尝试从上下文补充缺失信息
    const enrichedResult = await this.enrichFromContext(ruleResult, userId, context);
    
    // 保存到历史
    this.saveIntentHistory(userId, enrichedResult);
    
    return enrichedResult;
  }

  /**
   * LLM 语义解析
   */
  private async parseWithLLM(
    intentText: string,
    userId: string,
    context?: IntentContext,
  ): Promise<ParsedPaymentIntent> {
    const systemPrompt = `你是 Agentrix 支付意图解析引擎。
    
分析用户的自然语言输入，提取支付相关信息。

支持的意图类型:
- pay: 直接支付给某人
- pay_from_deposit: 从预存款/Session扣款
- split_pay: 多方分账支付
- subscribe: 订阅服务
- tip: 打赏/小费

需要提取的字段:
- amount: 金额（数字）
- currency: 币种（USDC/USDT/USD/CNY等）
- recipient: 收款方（地址/名称/AgentID）
- sessionRef: 预存款引用（如"上周存的"、"之前的100U"）
- taskType: 任务类型（翻译/图片编辑/代码审查等）
- description: 支付说明

${context?.previousIntents?.length ? `
用户之前的意图历史:
${JSON.stringify(context.previousIntents.slice(-3), null, 2)}
` : ''}

返回 JSON 格式:
{
  "type": "pay|pay_from_deposit|split_pay|subscribe|tip",
  "amount": 100,
  "currency": "USDC",
  "recipientName": "翻译Agent",
  "sessionRef": "上周的预存款",
  "taskType": "translation",
  "description": "支付翻译服务费",
  "confidence": 0.95,
  "missingFields": []
}

如果某些必要信息缺失，在 missingFields 中列出。`;

    const response = await this.openai!.chat.completions.create({
      model: this.configService.get('OPENAI_MODEL', 'gpt-4-turbo-preview'),
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: intentText },
      ],
      temperature: 0.1,
      response_format: { type: 'json_object' },
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error('LLM 返回空响应');
    }

    const parsed = JSON.parse(content);
    
    return {
      type: parsed.type || 'pay',
      amount: parsed.amount || 0,
      currency: parsed.currency || 'USDC',
      recipientAddress: parsed.recipientAddress,
      recipientAgentId: parsed.recipientAgentId,
      recipientName: parsed.recipientName,
      sessionRef: parsed.sessionRef,
      taskType: parsed.taskType,
      taskDescription: parsed.taskDescription,
      description: parsed.description,
      confidence: parsed.confidence || 0.8,
      missingFields: parsed.missingFields || [],
      rawIntent: intentText,
    };
  }

  /**
   * 规则引擎解析（增强版）
   */
  private parseWithRules(
    intentText: string,
    context?: IntentContext,
  ): ParsedPaymentIntent {
    const lowerText = intentText.toLowerCase();
    const result: ParsedPaymentIntent = {
      type: 'pay',
      amount: 0,
      currency: 'USDC',
      confidence: 0.6,
      missingFields: [],
      rawIntent: intentText,
    };

    // 1. 识别意图类型
    if (this.matchPatterns(lowerText, ['预存', '存的', '余额', 'session', 'deposit'])) {
      result.type = 'pay_from_deposit';
      result.confidence += 0.1;
    } else if (this.matchPatterns(lowerText, ['分账', '分成', 'split', '分给'])) {
      result.type = 'split_pay';
      result.confidence += 0.1;
    } else if (this.matchPatterns(lowerText, ['订阅', 'subscribe', '包月', '包年'])) {
      result.type = 'subscribe';
      result.confidence += 0.1;
    } else if (this.matchPatterns(lowerText, ['打赏', 'tip', '小费', '感谢'])) {
      result.type = 'tip';
      result.confidence += 0.1;
    }

    // 2. 提取金额
    const amountPatterns = [
      /(\d+(?:\.\d+)?)\s*(?:u|usdc|usdt|美元|刀)/i,
      /(\d+(?:\.\d+)?)\s*(?:元|rmb|cny|人民币)/i,
      /支付\s*(\d+(?:\.\d+)?)/,
      /(\d+(?:\.\d+)?)\s*(?:块|元钱)/,
    ];
    
    for (const pattern of amountPatterns) {
      const match = intentText.match(pattern);
      if (match) {
        result.amount = parseFloat(match[1]);
        result.confidence += 0.15;
        
        // 识别币种
        if (match[0].match(/元|rmb|cny|人民币|块/i)) {
          result.currency = 'CNY';
        }
        break;
      }
    }

    // 3. 提取收款方
    const recipientPatterns = [
      /(?:给|支付给|转给|付给)\s*([^\s,，。]+)/,
      /([^\s]+)\s*(?:agent|代理)/i,
      /收款方[：:]\s*([^\s]+)/,
    ];
    
    for (const pattern of recipientPatterns) {
      const match = intentText.match(pattern);
      if (match) {
        const recipient = match[1].trim();
        if (recipient.startsWith('0x')) {
          result.recipientAddress = recipient;
        } else {
          result.recipientName = recipient;
        }
        result.confidence += 0.1;
        break;
      }
    }

    // 4. 提取 Session 引用
    const sessionPatterns = [
      /(?:上周|昨天|之前|上次)\s*(?:存的|预存的|充的)/,
      /session\s*(?:#|号)?\s*(\w+)/i,
      /从\s*(\d+u?)\s*(?:里|中)/i,
    ];
    
    for (const pattern of sessionPatterns) {
      const match = intentText.match(pattern);
      if (match) {
        result.sessionRef = match[0];
        result.type = 'pay_from_deposit';
        result.confidence += 0.1;
        break;
      }
    }

    // 5. 提取任务类型
    const taskTypeMap: Record<string, string> = {
      '翻译': 'translation',
      '修图': 'image_edit',
      '编辑图片': 'image_edit',
      '代码': 'code_review',
      '审查': 'code_review',
      '写作': 'writing',
      '文章': 'writing',
      '设计': 'design',
      '搜索': 'search',
    };
    
    for (const [keyword, taskType] of Object.entries(taskTypeMap)) {
      if (lowerText.includes(keyword)) {
        result.taskType = taskType;
        result.confidence += 0.05;
        break;
      }
    }

    // 6. 检查缺失字段
    if (result.amount === 0) {
      result.missingFields!.push('amount');
    }
    if (!result.recipientAddress && !result.recipientName) {
      result.missingFields!.push('recipient');
    }

    return result;
  }

  /**
   * 从上下文补充信息
   */
  private async enrichFromContext(
    intent: ParsedPaymentIntent,
    userId: string,
    context?: IntentContext,
  ): Promise<ParsedPaymentIntent> {
    // 1. 从历史意图补充
    const history = this.intentHistory.get(userId) || [];
    if (history.length > 0) {
      const lastIntent = history[history.length - 1];
      
      // 如果当前缺少收款方，尝试从上一次意图获取
      if (!intent.recipientAddress && !intent.recipientName && lastIntent.recipientAddress) {
        intent.recipientAddress = lastIntent.recipientAddress;
        intent.recipientName = lastIntent.recipientName;
        this.removeFromMissingFields(intent, 'recipient');
      }
      
      // 如果当前缺少金额但上下文有参考
      if (intent.amount === 0 && lastIntent.amount > 0) {
        // 不直接复制金额，但可以参考
        intent.description = intent.description || `（参考上次金额: ${lastIntent.amount}）`;
      }
    }

    // 2. 从 Session 引用解析实际 Session ID
    if (intent.sessionRef && !intent.sessionId) {
      intent.sessionId = await this.resolveSessionRef(userId, intent.sessionRef);
    }

    // 3. 从用户偏好补充币种
    if (context?.userPreferences?.preferredCurrency && intent.currency === 'USDC') {
      intent.currency = context.userPreferences.preferredCurrency;
    }

    return intent;
  }

  /**
   * 解析 Session 引用到实际 ID
   */
  private async resolveSessionRef(userId: string, sessionRef: string): Promise<string | undefined> {
    // TODO: 查询 ERC8004 Session 记录
    // 根据 sessionRef 中的时间线索（如"上周"）找到对应的 Session
    
    this.logger.log(`解析Session引用: ${sessionRef} for user ${userId}`);
    
    // 临时实现：返回 undefined，让上层处理
    return undefined;
  }

  /**
   * 保存意图历史
   */
  private saveIntentHistory(userId: string, intent: ParsedPaymentIntent): void {
    const history = this.intentHistory.get(userId) || [];
    history.push(intent);
    
    // 只保留最近10条
    if (history.length > 10) {
      history.shift();
    }
    
    this.intentHistory.set(userId, history);
  }

  /**
   * 获取意图历史
   */
  getIntentHistory(userId: string): ParsedPaymentIntent[] {
    return this.intentHistory.get(userId) || [];
  }

  /**
   * 清除意图历史
   */
  clearIntentHistory(userId: string): void {
    this.intentHistory.delete(userId);
  }

  /**
   * 辅助：模式匹配
   */
  private matchPatterns(text: string, patterns: string[]): boolean {
    return patterns.some(p => text.includes(p));
  }

  /**
   * 辅助：从缺失字段列表中移除
   */
  private removeFromMissingFields(intent: ParsedPaymentIntent, field: string): void {
    if (intent.missingFields) {
      intent.missingFields = intent.missingFields.filter(f => f !== field);
    }
  }

  /**
   * 补充缺失信息
   * 用于多轮对话场景
   */
  async completeMissingFields(
    userId: string,
    updates: Record<string, any>,
  ): Promise<ParsedPaymentIntent | null> {
    const history = this.intentHistory.get(userId);
    if (!history || history.length === 0) {
      return null;
    }

    const lastIntent = history[history.length - 1];
    
    // 更新缺失字段
    if (updates.amount !== undefined) {
      lastIntent.amount = updates.amount;
      this.removeFromMissingFields(lastIntent, 'amount');
    }
    if (updates.recipient !== undefined) {
      if (updates.recipient.startsWith('0x')) {
        lastIntent.recipientAddress = updates.recipient;
      } else {
        lastIntent.recipientName = updates.recipient;
      }
      this.removeFromMissingFields(lastIntent, 'recipient');
    }
    if (updates.currency !== undefined) {
      lastIntent.currency = updates.currency;
    }

    // 重新计算置信度
    if (lastIntent.missingFields!.length === 0) {
      lastIntent.confidence = Math.min(lastIntent.confidence + 0.2, 1);
    }

    return lastIntent;
  }
}
