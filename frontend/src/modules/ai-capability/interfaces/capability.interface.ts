/**
 * AI Capability 统一能力接口定义
 * 
 * 为 Agentrix Marketplace 所有商品/服务/链上资产/插件建立统一能力 API
 * 供所有 AI 模型（ChatGPT、Claude、Gemini等）调用
 */

/**
 * AI 平台类型
 * 支持动态扩展，不再硬编码特定平台
 */
export type AIPlatform = string; // 改为 string 类型，支持任意平台 ID

/**
 * 能力类型
 */
export type CapabilityType = 'purchase' | 'book' | 'mint' | 'execute' | 'query';

/**
 * OpenAI Function Schema 格式
 */
export interface OpenAIFunctionSchema {
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, any>;
    required: string[];
  };
}

/**
 * Claude Tool Schema 格式
 */
export interface ClaudeToolSchema {
  name: string;
  description: string;
  input_schema: {
    type: 'object';
    properties: Record<string, any>;
    required: string[];
  };
}

/**
 * Gemini Function Schema 格式
 */
export interface GeminiFunctionSchema {
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, any>;
    required: string[];
  };
}

/**
 * 统一 Function Schema（平台无关）
 */
export type FunctionSchema = OpenAIFunctionSchema | ClaudeToolSchema | GeminiFunctionSchema;

/**
 * 能力节点
 */
export interface CapabilityNode {
  id: string;
  productId: string;
  productType: string;
  capabilityType: CapabilityType;
  platform: AIPlatform;
  schema: FunctionSchema;
  executor: string; // 执行器名称或URL
  enabled: boolean;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * 执行上下文
 */
export interface ExecutionContext {
  userId?: string;
  sessionId?: string;
  apiKey?: string;
  capabilityId?: string;
  metadata?: Record<string, any>;
}

/**
 * 执行结果
 */
export interface ExecutionResult {
  success: boolean;
  data?: any;
  error?: string;
  message?: string;
  transactionId?: string;
  orderId?: string;
  paymentId?: string;
}

/**
 * 能力注册选项
 */
export interface CapabilityRegistrationOptions {
  platforms?: AIPlatform[];
  autoEnable?: boolean;
  forceRegenerate?: boolean;
}

/**
 * 系统级能力定义（非商品相关）
 */
export interface SystemCapability {
  id: string;
  name: string;
  description: string;
  category: 'ecommerce' | 'payment' | 'order' | 'logistics' | 'merchant' | 'developer' | 'airdrop' | 'autoearn' | 'agent_management' | 'trading' | 'other';
  executor: string;
  parameters: {
    type: 'object';
    properties: Record<string, any>;
    required?: string[];
  };
  enabled?: boolean;
  externalExposed?: boolean; // 是否对外暴露（供AI平台和SDK调用）
  version?: string;
}


