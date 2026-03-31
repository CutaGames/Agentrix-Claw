import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto';
import { UserProviderConfig } from '../../entities/user-provider-config.entity';
import { BedrockIntegrationService } from '../ai-integration/bedrock/bedrock-integration.service';

// ─── Provider & Model Catalog (2026-03-12 latest) ───────────────

export interface ModelDef {
  id: string;
  label: string;
  contextWindow: number;
  costTier: 'free' | 'low' | 'medium' | 'high';
  capabilities: string[];
  multimodal: boolean;
  inputPrice?: string;   // per million tokens, e.g. "$2.50" or "¥2.5"
  outputPrice?: string;
  positioning?: string;  // brief positioning tag
  freeApi?: boolean;
  freeNote?: string;     // e.g. "每日250次"
  premiumMultiplier?: number;  // Copilot premium request multiplier (0=free, 0.25, 0.33, 1, 3, 30)
}

export interface ProviderDef {
  id: string;
  name: string;
  icon: string;
  region: 'international' | 'china';
  currency: string;      // "USD" or "CNY"
  billingType: 'subscription' | 'api-key';  // subscription = 月付/包月订阅, api-key = 按量计费
  requiredFields: string[];
  optionalFields: string[];
  placeholder: Record<string, string>;
  credentialLabel?: string;
  baseUrl?: string;
  models: ModelDef[];
}

interface ResolvedModelCapability {
  providerId?: string;
  model?: ModelDef;
  multimodal: boolean;
}

const PLATFORM_MODEL_ALIASES: Record<string, { label: string; multimodal: boolean }> = {
  'claude-haiku-4-5': { label: 'Claude Haiku 4.5 (平台默认 API)', multimodal: true },
  'claude-sonnet-4-6': { label: 'Claude Sonnet 4.6 (平台默认 API)', multimodal: true },
};

const SUBSCRIPTION_MODEL_ALIASES: Record<string, string> = {
  'chatgpt-sub-gpt-5.4': 'gpt-5.4',
  'chatgpt-sub-gpt-5.3-instant': 'gpt-5.3-instant',
  'chatgpt-sub-gpt-5-mini': 'gpt-5-mini',
  // ── Copilot Subscription (20 models) ──
  'copilot-sub-gpt-5.3-instant': 'gpt-5.3-instant',
  'copilot-sub-gpt-5-mini': 'gpt-5-mini',
  'copilot-sub-gpt-4.1': 'gpt-4.1',
  'copilot-sub-raptor-mini': 'raptor-mini',
  'copilot-sub-grok-code-fast-1': 'grok-code-fast-1',
  'copilot-sub-claude-haiku-4.5': 'claude-haiku-4.5',
  'copilot-sub-gpt-5.4-mini': 'gpt-5.4-mini',
  'copilot-sub-gemini-3-flash': 'gemini-3-flash-preview',
  'copilot-sub-gpt-5.1': 'gpt-5.1',
  'copilot-sub-gpt-5.2': 'gpt-5.2',
  'copilot-sub-gpt-5.2-codex': 'gpt-5.2-codex',
  'copilot-sub-gpt-5.3-codex': 'gpt-5.3-codex',
  'copilot-sub-gpt-5.4': 'gpt-5.4',
  'copilot-sub-claude-sonnet-4': 'claude-sonnet-4',
  'copilot-sub-claude-sonnet-4.5': 'claude-sonnet-4.5',
  'copilot-sub-claude-sonnet-4.6': 'claude-sonnet-4.6',
  'copilot-sub-gemini-2.5-pro': 'gemini-2.5-pro',
  'copilot-sub-gemini-3.1-pro': 'gemini-3.1-pro-preview',
  'copilot-sub-claude-opus-4.5': 'claude-opus-4.5',
  'copilot-sub-claude-opus-4.6': 'claude-opus-4.6',
  // ── Volcengine Savings Plan (火山引擎节省计划) ──
  'volc-plan-doubao-seed-2.0-pro': 'doubao-seed-2.0-pro',
  'volc-plan-doubao-2.0-lite': 'doubao-2.0-lite',
  'volc-plan-doubao-1.5-pro': 'doubao-1.5-pro',
  // ── Alibaba Bailian (阿里百炼资源包) ──
  'bailian-plan-qwen-3.5-max': 'qwen-3.5-max',
  'bailian-plan-qwen-flash': 'qwen-flash',
  'bailian-plan-qwen-3.5-plus': 'qwen-3.5-plus',
  // ── MiniMax Subscription (MiniMax 订阅) ──
  'minimax-plan-m2.5': 'minimax-m2.5',
  'minimax-plan-m1.5-pro': 'minimax-m1.5-pro',
  // ── DeepSeek Plan (DeepSeek 资源包) ──
  'deepseek-plan-v3.2': 'deepseek-v3.2',
  'deepseek-plan-r1': 'deepseek-r1',
  // ── Zhipu Subscription (智谱订阅) ──
  'zhipu-plan-glm-5-opus': 'glm-5-opus',
  'zhipu-plan-glm-4-flash': 'glm-4-flash',
};

export const PROVIDER_CATALOG: ProviderDef[] = [
  // ─── 🌍 International ───
  {
    id: 'openai', name: 'OpenAI', icon: '🧠', region: 'international', currency: 'USD', billingType: 'api-key',
    requiredFields: ['apiKey'], optionalFields: ['baseUrl'],
    placeholder: { apiKey: 'sk-proj-...' },
    models: [
      { id: 'gpt-5.4', label: 'GPT-5.4 (旗舰)', contextWindow: 1000000, costTier: 'high', capabilities: ['chat', 'vision', 'function_calling'], multimodal: true, inputPrice: '$2.50', outputPrice: '$15.00', positioning: '全能旗舰/电脑操作/Agent' },
      { id: 'gpt-5.3-instant', label: 'GPT-5.3 Instant', contextWindow: 270000, costTier: 'medium', capabilities: ['chat', 'vision', 'function_calling'], multimodal: true, inputPrice: '$1.75', outputPrice: '$14.00', positioning: '日常对话/性价比' },
      { id: 'gpt-5-mini', label: 'GPT-5 mini', contextWindow: 270000, costTier: 'low', capabilities: ['chat', 'vision', 'function_calling'], multimodal: true, inputPrice: '$0.25', outputPrice: '$2.00', positioning: '极致低成本/高并发' },
    ],
  },
  {
    id: 'chatgpt-subscription', name: 'ChatGPT Subscription', icon: '💬', region: 'international', currency: 'USD', billingType: 'subscription',
    requiredFields: ['apiKey'], optionalFields: ['baseUrl'],
    credentialLabel: 'Subscription Token',
    placeholder: {
      apiKey: 'chatgpt-session-or-relay-token',
      baseUrl: 'https://your-openclaw-relay.example.com/v1',
    },
    models: [
      { id: 'chatgpt-sub-gpt-5.4', label: 'GPT-5.4 via ChatGPT Subscription', contextWindow: 1000000, costTier: 'free', capabilities: ['chat', 'vision', 'function_calling'], multimodal: true, positioning: '使用你的 ChatGPT 订阅额度' },
      { id: 'chatgpt-sub-gpt-5.3-instant', label: 'GPT-5.3 Instant via ChatGPT Subscription', contextWindow: 270000, costTier: 'free', capabilities: ['chat', 'vision', 'function_calling'], multimodal: true, positioning: '订阅直连/快速响应' },
      { id: 'chatgpt-sub-gpt-5-mini', label: 'GPT-5 mini via ChatGPT Subscription', contextWindow: 270000, costTier: 'free', capabilities: ['chat', 'vision', 'function_calling'], multimodal: true, positioning: '订阅低成本高并发' },
    ],
  },
  {
    id: 'copilot-subscription', name: 'GitHub Copilot Subscription', icon: '🪟', region: 'international', currency: 'USD', billingType: 'subscription',
    requiredFields: ['apiKey'], optionalFields: ['baseUrl'],
    credentialLabel: 'Copilot Token',
    baseUrl: 'https://api.individual.githubcopilot.com',
    placeholder: {
      apiKey: 'ghu_xxxx... (GitHub OAuth Token)',
      baseUrl: 'https://api.individual.githubcopilot.com',
    },
    models: [
      // ── 🆓 Free Tier (0x multiplier, all plans) ──
      { id: 'copilot-sub-gpt-4.1', label: 'GPT-4.1', contextWindow: 1047576, costTier: 'free', capabilities: ['chat', 'vision', 'function_calling'], multimodal: true, premiumMultiplier: 0, positioning: '🆓 免费 · 全能通用/百万上下文' },
      { id: 'copilot-sub-gpt-5-mini', label: 'GPT-5 mini', contextWindow: 270000, costTier: 'free', capabilities: ['chat', 'vision', 'function_calling'], multimodal: true, premiumMultiplier: 0, positioning: '🆓 免费 · 极致低成本/高并发' },
      { id: 'copilot-sub-raptor-mini', label: 'Raptor mini', contextWindow: 128000, costTier: 'free', capabilities: ['chat', 'function_calling'], multimodal: false, premiumMultiplier: 0, positioning: '🆓 免费 · 微软自研/轻量' },
      // ── ⚡ Budget Tier (0.25x–0.33x) ──
      { id: 'copilot-sub-grok-code-fast-1', label: 'Grok Code Fast 1', contextWindow: 128000, costTier: 'low', capabilities: ['chat', 'function_calling'], multimodal: false, premiumMultiplier: 0.25, positioning: '⚡ 0.25x · 代码专用/极速' },
      { id: 'copilot-sub-claude-haiku-4.5', label: 'Claude Haiku 4.5', contextWindow: 200000, costTier: 'low', capabilities: ['chat', 'vision', 'function_calling'], multimodal: true, premiumMultiplier: 0.33, positioning: '⚡ 0.33x · 轻量/快速/全Free计划可用' },
      { id: 'copilot-sub-gpt-5.4-mini', label: 'GPT-5.4 mini', contextWindow: 270000, costTier: 'low', capabilities: ['chat', 'vision', 'function_calling'], multimodal: true, premiumMultiplier: 0.33, positioning: '⚡ 0.33x · 新一代mini/高性价比' },
      { id: 'copilot-sub-gemini-3-flash', label: 'Gemini 3 Flash', contextWindow: 1000000, costTier: 'low', capabilities: ['chat', 'vision', 'function_calling'], multimodal: true, premiumMultiplier: 0.33, positioning: '⚡ 0.33x · 百万上下文/极速' },
      { id: 'copilot-sub-gpt-5.3-instant', label: 'GPT-5.3 Instant', contextWindow: 270000, costTier: 'low', capabilities: ['chat', 'vision', 'function_calling'], multimodal: true, premiumMultiplier: 0.33, positioning: '⚡ 0.33x · 日常对话/性价比' },
      // ── 🔥 Standard Tier (1x multiplier, Pro/Pro+) ──
      { id: 'copilot-sub-gpt-5.1', label: 'GPT-5.1', contextWindow: 270000, costTier: 'medium', capabilities: ['chat', 'vision', 'function_calling'], multimodal: true, premiumMultiplier: 1, positioning: '🔥 1x · 推理增强/上一代旗舰' },
      { id: 'copilot-sub-gpt-5.2', label: 'GPT-5.2', contextWindow: 270000, costTier: 'medium', capabilities: ['chat', 'vision', 'function_calling'], multimodal: true, premiumMultiplier: 1, positioning: '🔥 1x · 代码+推理/均衡' },
      { id: 'copilot-sub-gpt-5.2-codex', label: 'GPT-5.2 Codex', contextWindow: 270000, costTier: 'medium', capabilities: ['chat', 'function_calling'], multimodal: false, premiumMultiplier: 1, positioning: '🔥 1x · 代码生成专用' },
      { id: 'copilot-sub-gpt-5.3-codex', label: 'GPT-5.3 Codex', contextWindow: 270000, costTier: 'medium', capabilities: ['chat', 'function_calling'], multimodal: false, premiumMultiplier: 1, positioning: '🔥 1x · 最新Codex/代码专精' },
      { id: 'copilot-sub-gpt-5.4', label: 'GPT-5.4', contextWindow: 1000000, costTier: 'medium', capabilities: ['chat', 'vision', 'function_calling'], multimodal: true, premiumMultiplier: 1, positioning: '🔥 1x · OpenAI旗舰/电脑操作/Agent' },
      { id: 'copilot-sub-claude-sonnet-4', label: 'Claude Sonnet 4', contextWindow: 200000, costTier: 'medium', capabilities: ['chat', 'vision', 'function_calling'], multimodal: true, premiumMultiplier: 1, positioning: '🔥 1x · Anthropic均衡/工具调用' },
      { id: 'copilot-sub-claude-sonnet-4.5', label: 'Claude Sonnet 4.5', contextWindow: 200000, costTier: 'medium', capabilities: ['chat', 'vision', 'function_calling'], multimodal: true, premiumMultiplier: 1, positioning: '🔥 1x · 混合推理/创意写作' },
      { id: 'copilot-sub-claude-sonnet-4.6', label: 'Claude Sonnet 4.6', contextWindow: 200000, costTier: 'medium', capabilities: ['chat', 'vision', 'function_calling'], multimodal: true, premiumMultiplier: 1, positioning: '🔥 1x · 最新Sonnet/接近旗舰' },
      { id: 'copilot-sub-gemini-2.5-pro', label: 'Gemini 2.5 Pro', contextWindow: 1000000, costTier: 'medium', capabilities: ['chat', 'vision', 'function_calling'], multimodal: true, premiumMultiplier: 1, positioning: '🔥 1x · 百万上下文/长文档分析' },
      { id: 'copilot-sub-gemini-3.1-pro', label: 'Gemini 3.1 Pro', contextWindow: 1000000, costTier: 'medium', capabilities: ['chat', 'vision', 'function_calling'], multimodal: true, premiumMultiplier: 1, positioning: '🔥 1x · Google最新旗舰' },
      // ── 💎 Premium Tier (3x+ multiplier, Pro+ only) ──
      { id: 'copilot-sub-claude-opus-4.5', label: 'Claude Opus 4.5', contextWindow: 200000, costTier: 'high', capabilities: ['chat', 'vision', 'function_calling'], multimodal: true, premiumMultiplier: 3, positioning: '💎 3x · 深度推理/扩展思考' },
      { id: 'copilot-sub-claude-opus-4.6', label: 'Claude Opus 4.6', contextWindow: 200000, costTier: 'high', capabilities: ['chat', 'vision', 'function_calling'], multimodal: true, premiumMultiplier: 3, positioning: '💎 3x · Anthropic旗舰/最强推理' },
    ],
  },
  {
    id: 'gemini', name: 'Google Gemini', icon: '✨', region: 'international', currency: 'USD', billingType: 'api-key',
    requiredFields: ['apiKey'], optionalFields: [],
    placeholder: { apiKey: 'AIzaSy...' },
    models: [
      { id: 'gemini-3.1-ultra', label: 'Gemini 3.1 Ultra (最强)', contextWindow: 20000000, costTier: 'high', capabilities: ['chat', 'vision', 'function_calling'], multimodal: true, inputPrice: '$4.00', outputPrice: '$20.00', positioning: '科学/视频/超长上下文' },
      { id: 'gemini-3.1-pro', label: 'Gemini 3.1 Pro', contextWindow: 1000000, costTier: 'medium', capabilities: ['chat', 'vision', 'function_calling'], multimodal: true, inputPrice: '$2.00', outputPrice: '$12.00', positioning: '全能商用/性价比之王' },
      { id: 'gemini-3.1-flash-lite', label: 'Gemini 3.1 Flash-Lite', contextWindow: 1000000, costTier: 'low', capabilities: ['chat', 'vision', 'function_calling'], multimodal: true, inputPrice: '$0.25', outputPrice: '$1.50', positioning: '极速/超低成本/高频', freeApi: true, freeNote: '2.5系列免费' },
      { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash (免费)', contextWindow: 1000000, costTier: 'free', capabilities: ['chat', 'vision', 'function_calling'], multimodal: true, positioning: '个人免费API首选', freeApi: true, freeNote: '每日250次' },
    ],
  },
  {
    id: 'anthropic', name: 'Anthropic (Claude)', icon: '🤖', region: 'international', currency: 'USD', billingType: 'api-key',
    requiredFields: ['apiKey'], optionalFields: ['baseUrl'],
    placeholder: { apiKey: 'sk-ant-api03-...' },
    models: [
      { id: 'claude-opus-4-20250514', label: 'Claude Opus 4.6 (最强)', contextWindow: 1000000, costTier: 'high', capabilities: ['chat', 'vision', 'function_calling'], multimodal: true, inputPrice: '$5.00', outputPrice: '$25.00', positioning: '深度推理/代码/长文本' },
      { id: 'claude-sonnet-4-20250514', label: 'Claude Sonnet 4.6', contextWindow: 1000000, costTier: 'medium', capabilities: ['chat', 'vision', 'function_calling'], multimodal: true, inputPrice: '$3.00', outputPrice: '$15.00', positioning: '均衡/默认/接近旗舰' },
      { id: 'claude-3-5-haiku-20241022', label: 'Claude Haiku 4.5', contextWindow: 200000, costTier: 'low', capabilities: ['chat', 'vision', 'function_calling'], multimodal: true, inputPrice: '$1.00', outputPrice: '$5.00', positioning: '轻量/快速/成本1/3' },
    ],
  },
  {
    id: 'xai', name: 'xAI (Grok)', icon: '🚀', region: 'international', currency: 'USD', billingType: 'api-key',
    requiredFields: ['apiKey'], optionalFields: ['baseUrl'],
    placeholder: { apiKey: 'xai-...' },
    baseUrl: 'https://api.x.ai/v1',
    models: [
      { id: 'grok-4.2-beta', label: 'Grok 4.2 Beta', contextWindow: 512000, costTier: 'medium', capabilities: ['chat', 'vision', 'function_calling'], multimodal: true, inputPrice: '$1.50', outputPrice: '$7.50', positioning: '实时信息/硬核推理' },
    ],
  },
  {
    id: 'meta', name: 'Meta (Llama)', icon: '🦙', region: 'international', currency: 'USD', billingType: 'api-key',
    requiredFields: ['apiKey'], optionalFields: [],
    placeholder: { apiKey: 'gsk_...' },
    baseUrl: 'https://api.groq.com/openai/v1',
    models: [
      { id: 'llama-4-maverick', label: 'Llama 4 Maverick', contextWindow: 1000000, costTier: 'free', capabilities: ['chat', 'vision', 'function_calling'], multimodal: true, positioning: '私有化部署/极致性价比', freeApi: true, freeNote: '开源免费(via Groq)' },
    ],
  },
  {
    id: 'bedrock', name: 'AWS Bedrock (国际区)', icon: '☁️', region: 'international', currency: 'USD', billingType: 'api-key',
    requiredFields: ['apiKey', 'secretKey', 'region'], optionalFields: [],
    credentialLabel: 'AWS Access Key ID',
    placeholder: { apiKey: 'AKIA... / ASIA...', secretKey: 'wJal...', region: 'us-east-1' },
    models: [
      // ── Anthropic Claude ──
      { id: 'us.anthropic.claude-opus-4-20250514-v1:0', label: 'Claude Opus 4.6', contextWindow: 1000000, costTier: 'high', capabilities: ['chat', 'vision', 'function_calling'], multimodal: true, inputPrice: '$5.00', outputPrice: '$25.00', positioning: '深度推理/代码/长文本' },
      { id: 'us.anthropic.claude-sonnet-4-20250514-v1:0', label: 'Claude Sonnet 4.6', contextWindow: 1000000, costTier: 'medium', capabilities: ['chat', 'vision', 'function_calling'], multimodal: true, inputPrice: '$3.00', outputPrice: '$15.00', positioning: '均衡/默认/接近旗舰' },
      { id: 'us.anthropic.claude-haiku-4-5-20251001-v1:0', label: 'Claude Haiku 4.5', contextWindow: 200000, costTier: 'low', capabilities: ['chat', 'vision', 'function_calling'], multimodal: true, inputPrice: '$1.00', outputPrice: '$5.00', positioning: '轻量/快速/成本1/3' },
    ],
  },
  {
    id: 'bedrock-cn', name: 'AWS Bedrock (中国区)', icon: '☁️', region: 'china', currency: 'CNY', billingType: 'api-key',
    requiredFields: ['apiKey', 'secretKey', 'region'], optionalFields: [],
    credentialLabel: 'AWS Access Key ID',
    placeholder: { apiKey: 'AKIA... / ASIA...', secretKey: 'wJal...', region: 'cn-northwest-1' },
    models: [
      { id: 'anthropic.claude-sonnet-4-20250514-v1:0', label: 'Claude Sonnet 4.6 (中国区)', contextWindow: 200000, costTier: 'medium', capabilities: ['chat', 'vision', 'function_calling'], multimodal: true, inputPrice: '¥21.0', outputPrice: '¥105.0', positioning: '均衡/默认/中国区可用' },
      { id: 'anthropic.claude-3-5-haiku-20241022-v1:0', label: 'Claude Haiku 4.5 (中国区)', contextWindow: 200000, costTier: 'low', capabilities: ['chat', 'vision', 'function_calling'], multimodal: true, inputPrice: '¥5.6', outputPrice: '¥35.0', positioning: '轻量/快速/中国区可用' },
    ],
  },
  // ─── 🔄 China Subscription Plans ───
  {
    id: 'volcengine-plan', name: '火山引擎节省计划', icon: '🌋', region: 'china', currency: 'CNY', billingType: 'subscription',
    requiredFields: ['apiKey'], optionalFields: ['baseUrl'],
    credentialLabel: 'API Key (节省计划)',
    placeholder: {
      apiKey: 'sk-...',
      baseUrl: 'https://ark.cn-beijing.volces.com/api/v3',
    },
    baseUrl: 'https://ark.cn-beijing.volces.com/api/v3',
    models: [
      { id: 'volc-plan-doubao-seed-2.0-pro', label: '豆包 Seed 2.0 Pro (节省计划)', contextWindow: 256000, costTier: 'free', capabilities: ['chat', 'vision', 'function_calling'], multimodal: true, positioning: '节省计划包月/综合最强' },
      { id: 'volc-plan-doubao-2.0-lite', label: '豆包 2.0 Lite (节省计划)', contextWindow: 256000, costTier: 'free', capabilities: ['chat', 'vision', 'function_calling'], multimodal: true, positioning: '节省计划包月/轻量高速' },
      { id: 'volc-plan-doubao-1.5-pro', label: '豆包 1.5 Pro (节省计划)', contextWindow: 128000, costTier: 'free', capabilities: ['chat', 'function_calling'], multimodal: false, positioning: '节省计划包月/上代旗舰' },
    ],
  },
  {
    id: 'bailian-plan', name: '阿里百炼资源包', icon: '🐜', region: 'china', currency: 'CNY', billingType: 'subscription',
    requiredFields: ['apiKey'], optionalFields: ['baseUrl'],
    credentialLabel: 'API Key (百炼资源包)',
    placeholder: {
      apiKey: 'sk-...',
      baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    },
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    models: [
      { id: 'bailian-plan-qwen-3.5-max', label: 'Qwen 3.5 Max (资源包)', contextWindow: 252000, costTier: 'free', capabilities: ['chat', 'vision', 'function_calling'], multimodal: true, positioning: '资源包/开源综合第一' },
      { id: 'bailian-plan-qwen-flash', label: 'Qwen Flash (资源包)', contextWindow: 256000, costTier: 'free', capabilities: ['chat', 'vision', 'function_calling'], multimodal: true, positioning: '资源包/极速低成本' },
      { id: 'bailian-plan-qwen-3.5-plus', label: 'Qwen 3.5 Plus (资源包)', contextWindow: 131072, costTier: 'free', capabilities: ['chat', 'vision', 'function_calling'], multimodal: true, positioning: '资源包/均衡高性价比' },
    ],
  },
  {
    id: 'minimax-plan', name: 'MiniMax 订阅', icon: '🤖', region: 'china', currency: 'CNY', billingType: 'subscription',
    requiredFields: ['apiKey'], optionalFields: ['baseUrl'],
    credentialLabel: 'API Key (订阅)',
    placeholder: {
      apiKey: 'eyJ...',
      baseUrl: 'https://api.minimax.chat/v1',
    },
    baseUrl: 'https://api.minimax.chat/v1',
    models: [
      { id: 'minimax-plan-m2.5', label: 'MiniMax M2.5 (订阅)', contextWindow: 205000, costTier: 'free', capabilities: ['chat', 'vision', 'function_calling'], multimodal: true, positioning: '订阅包月/全球调用量王' },
      { id: 'minimax-plan-m1.5-pro', label: 'MiniMax M1.5 Pro (订阅)', contextWindow: 128000, costTier: 'free', capabilities: ['chat', 'function_calling'], multimodal: false, positioning: '订阅包月/上代旗舰' },
    ],
  },
  {
    id: 'deepseek-plan', name: 'DeepSeek 资源包', icon: '🔬', region: 'china', currency: 'CNY', billingType: 'subscription',
    requiredFields: ['apiKey'], optionalFields: ['baseUrl'],
    credentialLabel: 'API Key (资源包)',
    placeholder: {
      apiKey: 'sk-...',
      baseUrl: 'https://api.deepseek.com',
    },
    baseUrl: 'https://api.deepseek.com',
    models: [
      { id: 'deepseek-plan-v3.2', label: 'DeepSeek V3.2 (资源包)', contextWindow: 128000, costTier: 'free', capabilities: ['chat', 'vision', 'function_calling'], multimodal: true, positioning: '资源包/理科推理/极致性价比' },
      { id: 'deepseek-plan-r1', label: 'DeepSeek R1 (资源包)', contextWindow: 128000, costTier: 'free', capabilities: ['chat', 'function_calling'], multimodal: false, positioning: '资源包/深度推理/数学竞赛' },
    ],
  },
  {
    id: 'zhipu-plan', name: '智谱 AI 订阅', icon: '🧪', region: 'china', currency: 'CNY', billingType: 'subscription',
    requiredFields: ['apiKey'], optionalFields: [],
    credentialLabel: 'API Key (订阅)',
    placeholder: { apiKey: 'zhipu-api-key...' },
    baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    models: [
      { id: 'zhipu-plan-glm-5-opus', label: 'GLM-5 Opus (订阅)', contextWindow: 200000, costTier: 'free', capabilities: ['chat', 'vision', 'function_calling'], multimodal: true, positioning: '订阅/MoE旗舰/代码工具强' },
      { id: 'zhipu-plan-glm-4-flash', label: 'GLM-4 Flash (订阅)', contextWindow: 128000, costTier: 'free', capabilities: ['chat', 'function_calling'], multimodal: false, positioning: '订阅/极速/高并发' },
    ],
  },
  // ─── 🇨🇳 China (API Pay-per-use) ───
  {
    id: 'bytedance', name: '字节跳动 (豆包)', icon: '🔥', region: 'china', currency: 'CNY', billingType: 'api-key',
    requiredFields: ['apiKey'], optionalFields: ['baseUrl'],
    placeholder: { apiKey: 'sk-...' },
    baseUrl: 'https://ark.cn-beijing.volces.com/api/v3',
    models: [
      { id: 'doubao-seed-2.0-pro', label: '豆包 Seed 2.0 Pro (最强)', contextWindow: 256000, costTier: 'high', capabilities: ['chat', 'vision', 'function_calling'], multimodal: true, inputPrice: '¥3.2', outputPrice: '¥16.0', positioning: '国产综合第一/多模态' },
      { id: 'doubao-2.0-lite', label: '豆包 2.0 Lite', contextWindow: 256000, costTier: 'low', capabilities: ['chat', 'vision', 'function_calling'], multimodal: true, inputPrice: '¥0.6', outputPrice: '¥3.6', positioning: '轻量/高性价比' },
    ],
  },
  {
    id: 'alibaba', name: '阿里通义千问 (Qwen)', icon: '🐜', region: 'china', currency: 'CNY', billingType: 'api-key',
    requiredFields: ['apiKey'], optionalFields: ['baseUrl'],
    placeholder: { apiKey: 'sk-...' },
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    models: [
      { id: 'qwen-3.5-max', label: 'Qwen 3.5 Max (最强)', contextWindow: 252000, costTier: 'medium', capabilities: ['chat', 'vision', 'function_calling'], multimodal: true, inputPrice: '¥2.5', outputPrice: '¥10.0', positioning: '开源榜第一/全能', freeApi: true, freeNote: '新用户100万免费' },
      { id: 'qwen-flash', label: 'Qwen Flash', contextWindow: 256000, costTier: 'low', capabilities: ['chat', 'vision', 'function_calling'], multimodal: true, inputPrice: '¥0.15', outputPrice: '¥1.5', positioning: '极速/超低成本' },
    ],
  },
  {
    id: 'zhipu', name: '智谱 AI (GLM)', icon: '🧪', region: 'china', currency: 'CNY', billingType: 'api-key',
    requiredFields: ['apiKey'], optionalFields: [],
    placeholder: { apiKey: 'zhipu-api-key...' },
    baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    models: [
      { id: 'glm-5-opus', label: 'GLM-5 Opus (最强)', contextWindow: 200000, costTier: 'medium', capabilities: ['chat', 'vision', 'function_calling'], multimodal: true, inputPrice: '¥2.8', outputPrice: '¥11.2', positioning: 'MoE/代码/工具调用强', freeApi: true, freeNote: '新用户500万免费' },
    ],
  },
  {
    id: 'moonshot', name: '月之暗面 (Kimi)', icon: '🌙', region: 'china', currency: 'CNY', billingType: 'api-key',
    requiredFields: ['apiKey'], optionalFields: [],
    placeholder: { apiKey: 'sk-...' },
    baseUrl: 'https://api.moonshot.cn/v1',
    models: [
      { id: 'kimi-k2.5', label: 'Kimi K2.5 (最强)', contextWindow: 256000, costTier: 'high', capabilities: ['chat', 'vision', 'function_calling'], multimodal: true, inputPrice: '¥4.0', outputPrice: '¥21.0', positioning: '长文本/多智能体/数学', freeApi: true, freeNote: '新用户100万token免费' },
    ],
  },
  {
    id: 'minimax', name: 'MiniMax', icon: '🤖', region: 'china', currency: 'CNY', billingType: 'api-key',
    requiredFields: ['apiKey'], optionalFields: ['baseUrl'],
    placeholder: { apiKey: 'eyJ...' },
    baseUrl: 'https://api.minimax.chat/v1',
    models: [
      { id: 'minimax-m2.5', label: 'MiniMax M2.5', contextWindow: 205000, costTier: 'low', capabilities: ['chat', 'vision', 'function_calling'], multimodal: true, inputPrice: '¥0.5', outputPrice: '¥2.2', positioning: '全球调用量第一/Agent/低成本' },
    ],
  },
  {
    id: 'deepseek', name: 'DeepSeek', icon: '🔬', region: 'china', currency: 'CNY', billingType: 'api-key',
    requiredFields: ['apiKey'], optionalFields: ['baseUrl'],
    placeholder: { apiKey: 'sk-...' },
    baseUrl: 'https://api.deepseek.com',
    models: [
      { id: 'deepseek-v3.2', label: 'DeepSeek V3.2 (最强)', contextWindow: 128000, costTier: 'medium', capabilities: ['chat', 'vision', 'function_calling'], multimodal: true, inputPrice: '¥2.0', outputPrice: '¥3.0', positioning: '理科推理/极致性价比' },
    ],
  },
  {
    id: 'baidu', name: '百度文心', icon: '🐻', region: 'china', currency: 'CNY', billingType: 'api-key',
    requiredFields: ['apiKey', 'secretKey'], optionalFields: [],
    placeholder: { apiKey: 'app-key...', secretKey: 'app-secret...' },
    models: [
      { id: 'ernie-6.0', label: '文心一言 6.0 (最强)', contextWindow: 128000, costTier: 'high', capabilities: ['chat', 'vision', 'function_calling'], multimodal: true, inputPrice: '¥4.0', outputPrice: '¥16.0', positioning: '中文/合规/医疗/数学' },
      { id: 'ernie-3.5-turbo', label: 'ERNIE 3.5 Turbo (免费)', contextWindow: 128000, costTier: 'free', capabilities: ['chat', 'function_calling'], multimodal: false, positioning: '文本对话/免费入门', freeApi: true, freeNote: '永久免费' },
    ],
  },
  {
    id: 'iflytek', name: '科大讯飞 (星火)', icon: '🗣️', region: 'china', currency: 'CNY', billingType: 'api-key',
    requiredFields: ['apiKey'], optionalFields: [],
    placeholder: { apiKey: 'Bearer token...' },
    baseUrl: 'https://spark-api-open.xf-yun.com/v1',
    models: [
      { id: 'spark-x1', label: '星火 X1 (最强)', contextWindow: 128000, costTier: 'medium', capabilities: ['chat', 'vision', 'function_calling'], multimodal: true, inputPrice: '¥3.0', outputPrice: '¥12.0', positioning: '语音/教育/医疗垂直', freeApi: true, freeNote: '每月200万免费' },
    ],
  },
];

// ─── Service ────────────────────────────────────────────────────

@Injectable()
export class AiProviderService {
  private readonly logger = new Logger(AiProviderService.name);
  private readonly encKey: Buffer;

  constructor(
    @InjectRepository(UserProviderConfig)
    private readonly repo: Repository<UserProviderConfig>,
    private readonly configService: ConfigService,
    private readonly bedrockIntegrationService: BedrockIntegrationService,
  ) {
    const secret = this.configService.get<string>('PROVIDER_ENCRYPTION_KEY') || 'agentrix-default-provider-key-2026';
    this.encKey = scryptSync(secret, 'agentrix-salt', 32);
  }

  // ─── Encryption helpers ──────────

  private encrypt(plaintext: string): string {
    const iv = randomBytes(16);
    const cipher = createCipheriv('aes-256-gcm', this.encKey, iv);
    const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return [iv.toString('hex'), encrypted.toString('hex'), tag.toString('hex')].join(':');
  }

  private decrypt(ciphertext: string): string {
    const [ivHex, encHex, tagHex] = ciphertext.split(':');
    if (!ivHex || !encHex || !tagHex) throw new Error('Invalid encrypted data');
    const decipher = createDecipheriv('aes-256-gcm', this.encKey, Buffer.from(ivHex, 'hex'));
    decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
    return decipher.update(Buffer.from(encHex, 'hex')) + decipher.final('utf8');
  }

  // ─── Copilot Token Exchange & Cache ──────────
  // ghu_* tokens are long-lived but Copilot API needs a session token (~30 min)
  private copilotTokenCache = new Map<string, { token: string; expiresAt: number }>();

  /**
   * Exchange a GitHub OAuth token (ghu_*) for a Copilot API session token.
   * Caches results and auto-refreshes when expired.
   */
  async exchangeCopilotToken(ghuToken: string): Promise<string> {
    // If the token doesn't look like a GitHub OAuth token, return as-is
    if (!ghuToken.startsWith('ghu_') && !ghuToken.startsWith('gho_') && !ghuToken.startsWith('ghp_')) {
      return ghuToken;
    }

    const cached = this.copilotTokenCache.get(ghuToken);
    if (cached && cached.expiresAt > Date.now() + 60_000) { // 1 min buffer
      return cached.token;
    }

    try {
      const resp = await fetch('https://api.github.com/copilot_internal/v2/token', {
        headers: {
          'Authorization': `token ${ghuToken}`,
          'User-Agent': 'GithubCopilot/1.300.0',
          'Editor-Version': 'vscode/1.100.0',
          'Editor-Plugin-Version': 'copilot/1.300.0',
        },
      });

      if (!resp.ok) {
        const body = await resp.text().catch(() => '');
        this.logger.warn(`Copilot token exchange failed: ${resp.status} ${body}`);
        throw new BadRequestException(
          `Copilot token 交换失败 (${resp.status})。请确认 GitHub 账户已开通 Copilot 订阅，并重新输入 Token。`,
        );
      }

      const data = await resp.json() as { token: string; expires_at?: number };
      const expiresAt = data.expires_at
        ? data.expires_at * 1000
        : Date.now() + 25 * 60 * 1000; // default 25 min if no expiry

      this.copilotTokenCache.set(ghuToken, { token: data.token, expiresAt });
      this.logger.log(`Copilot session token exchanged, expires in ${Math.round((expiresAt - Date.now()) / 60000)} min`);
      return data.token;
    } catch (err: any) {
      if (err instanceof BadRequestException) throw err;
      this.logger.error(`Copilot token exchange error: ${err.message}`);
      // Fallback: return original token (might work if it's already a session token)
      return ghuToken;
    }
  }

  // ─── Catalog ──────────

  getCatalog(): ProviderDef[] {
    return PROVIDER_CATALOG;
  }

  getProviderDef(providerId: string): ProviderDef | undefined {
    return PROVIDER_CATALOG.find(p => p.id === providerId);
  }

  resolveModelCapability(modelId?: string, providerId?: string): ResolvedModelCapability {
    if (!modelId) {
      return { providerId, multimodal: false };
    }

    if (!providerId || providerId === 'platform') {
      const platformModel = PLATFORM_MODEL_ALIASES[modelId];
      if (platformModel) {
        return {
          providerId: 'platform',
          multimodal: platformModel.multimodal,
        };
      }
    }

    if (providerId && providerId !== 'platform') {
      const provider = this.getProviderDef(providerId);
      const exact = provider?.models.find(model => model.id === modelId);
      if (exact) {
        return { providerId, model: exact, multimodal: exact.multimodal };
      }
    }

    for (const provider of PROVIDER_CATALOG) {
      const exact = provider.models.find(model => model.id === modelId);
      if (exact) {
        return { providerId: provider.id, model: exact, multimodal: exact.multimodal };
      }
    }

    return { providerId, multimodal: false };
  }

  resolveExecutionModelId(modelId?: string): string | undefined {
    if (!modelId) {
      return undefined;
    }

    return SUBSCRIPTION_MODEL_ALIASES[modelId] || modelId;
  }

  supportsMultimodal(modelId?: string, providerId?: string): boolean {
    return this.resolveModelCapability(modelId, providerId).multimodal;
  }

  // ─── CRUD ──────────

  async getUserConfigs(userId: string) {
    const configs = await this.repo.find({ where: { userId }, order: { createdAt: 'ASC' } });
    return configs.map(c => ({
      id: c.id,
      providerId: c.providerId,
      selectedModel: c.selectedModel,
      baseUrl: c.baseUrl,
      region: c.region,
      isActive: c.isActive,
      isDefault: c.metadata?.isDefault === true,
      lastTestedAt: c.lastTestedAt,
      lastTestResult: c.lastTestResult,
      apiKeyPrefix: this.getKeyPrefix(c),
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
    }));
  }

  private getKeyPrefix(config: UserProviderConfig): string {
    try {
      const key = this.decrypt(config.encryptedApiKey);
      return key.length > 8 ? key.slice(0, 4) + '...' + key.slice(-4) : '****';
    } catch {
      return '****';
    }
  }

  async upsertConfig(userId: string, dto: {
    providerId: string;
    apiKey: string;
    secretKey?: string;
    baseUrl?: string;
    region?: string;
    selectedModel: string;
  }) {
    const provider = this.getProviderDef(dto.providerId);
    if (!provider) throw new BadRequestException(`Unknown provider: ${dto.providerId}`);

    const validModelIds = provider.models.map(m => m.id);
    if (!validModelIds.includes(dto.selectedModel)) {
      throw new BadRequestException(`Invalid model "${dto.selectedModel}" for provider "${dto.providerId}"`);
    }

    let config = await this.repo.findOne({ where: { userId, providerId: dto.providerId } });
    if (!config) {
      config = this.repo.create({ userId, providerId: dto.providerId });
    }

    config.encryptedApiKey = dto.apiKey === '__saved__' && config.encryptedApiKey
      ? config.encryptedApiKey
      : this.encrypt(dto.apiKey);
    config.encryptedSecretKey = dto.secretKey === '__saved__' && config.encryptedSecretKey
      ? config.encryptedSecretKey
      : dto.secretKey ? this.encrypt(dto.secretKey) : undefined;
    config.baseUrl = dto.baseUrl || undefined;
    config.region = dto.region || undefined;
    config.selectedModel = dto.selectedModel;
    config.isActive = true;

    await this.repo.save(config);

    // Auto-set as default if this is the first config
    const allConfigs = await this.repo.find({ where: { userId } });
    const hasDefault = allConfigs.some(c => c.metadata?.isDefault === true);
    if (!hasDefault) {
      config.metadata = { ...(config.metadata || {}), isDefault: true };
      await this.repo.save(config);
    }

    return { id: config.id, providerId: config.providerId, selectedModel: config.selectedModel };
  }

  async deleteConfig(userId: string, providerId: string) {
    const config = await this.repo.findOne({ where: { userId, providerId } });
    if (!config) throw new NotFoundException(`No config found for provider "${providerId}"`);

    const wasDefault = config.metadata?.isDefault === true;
    await this.repo.delete({ userId, providerId });

    // If deleted config was default, promote next config
    if (wasDefault) {
      const remaining = await this.repo.find({ where: { userId, isActive: true }, order: { createdAt: 'ASC' } });
      if (remaining.length > 0) {
        remaining[0].metadata = { ...(remaining[0].metadata || {}), isDefault: true };
        await this.repo.save(remaining[0]);
      }
    }

    return { success: true };
  }

  // ─── Default provider ──────────

  async setDefaultProvider(userId: string, providerId: string) {
    const configs = await this.repo.find({ where: { userId } });
    const target = configs.find(c => c.providerId === providerId);
    if (!target) throw new NotFoundException(`No config found for provider "${providerId}"`);

    for (const c of configs) {
      const shouldBeDefault = c.providerId === providerId;
      if ((c.metadata?.isDefault === true) !== shouldBeDefault) {
        c.metadata = { ...(c.metadata || {}), isDefault: shouldBeDefault };
        await this.repo.save(c);
      }
    }
    return { success: true, defaultProvider: providerId };
  }

  async getDefaultConfig(userId: string): Promise<UserProviderConfig | null> {
    const configs = await this.repo.find({ where: { userId, isActive: true } });
    return configs.find(c => c.metadata?.isDefault === true) || configs[0] || null;
  }

  /** Get decrypted API key for a user + provider (used internally by chat flow) */
  async getDecryptedKey(userId: string, providerId: string): Promise<{ apiKey: string; secretKey?: string; baseUrl?: string; region?: string; model: string } | null> {
    const config = await this.repo.findOne({ where: { userId, providerId, isActive: true } });
    if (!config) return null;
    try {
      return {
        apiKey: this.decrypt(config.encryptedApiKey),
        secretKey: config.encryptedSecretKey ? this.decrypt(config.encryptedSecretKey) : undefined,
        baseUrl: config.baseUrl || undefined,
        region: config.region || undefined,
        model: config.selectedModel,
      };
    } catch {
      return null;
    }
  }

  // ─── Test connectivity ──────────

  /** Get all models available to the user: platform default + user's configured provider models */
  async getAvailableModels(userId: string): Promise<Array<{ id: string; label: string; provider: string; providerId: string; costTier: string; billingType: 'platform' | 'subscription' | 'api-key'; positioning?: string; isDefault?: boolean }>> {
    const models: Array<{ id: string; label: string; provider: string; providerId: string; costTier: string; billingType: 'platform' | 'subscription' | 'api-key'; positioning?: string; isDefault?: boolean }> = [];
    const seenLabels = new Set<string>();

    // Platform default model (always available)
    models.push({
      id: 'claude-haiku-4-5',
      label: 'Claude Haiku 4.5 (平台默认 API)',
      provider: 'Agentrix Platform',
      providerId: 'platform',
      costTier: 'free_trial',
      billingType: 'platform',
      positioning: '平台默认/免费额度',
      isDefault: true,
    });
    seenLabels.add('claude haiku 4.5');

    // User's configured provider models
    const configs = await this.repo.find({ where: { userId, isActive: true } });
    for (const config of configs) {
      const providerDef = this.getProviderDef(config.providerId);
      if (!providerDef) continue;
      for (const model of providerDef.models) {
        const normalizedLabel = model.label.replace(/\s*\([^)]*\)\s*$/g, '').trim().toLowerCase();
        const label = seenLabels.has(normalizedLabel)
          ? `${model.label} (${providerDef.name})`
          : model.label;
        seenLabels.add(normalizedLabel);
        models.push({
          id: model.id,
          label,
          provider: providerDef.name,
          providerId: config.providerId,
          costTier: model.costTier,
          billingType: providerDef.billingType,
          positioning: model.positioning,
        });
      }
    }

    return models;
  }

  async testProvider(userId: string, dto: { providerId: string; apiKey: string; secretKey?: string; baseUrl?: string; region?: string; model: string }): Promise<{ success: boolean; latencyMs: number; error?: string }> {
    const provider = this.getProviderDef(dto.providerId);
    if (!provider) throw new BadRequestException(`Unknown provider: ${dto.providerId}`);

    // Resolve actual credentials when __saved__ placeholder is sent
    if (dto.apiKey === '__saved__') {
      const saved = await this.getDecryptedKey(userId, dto.providerId);
      if (!saved) throw new BadRequestException('No saved credentials found for this provider');
      dto = { ...dto, apiKey: saved.apiKey, secretKey: saved.secretKey || dto.secretKey, baseUrl: dto.baseUrl || saved.baseUrl };
    }

    const start = Date.now();
    try {
      await this.doTestCall(dto);
      const latencyMs = Date.now() - start;

      const config = await this.repo.findOne({ where: { userId, providerId: dto.providerId } });
      if (config) {
        config.lastTestedAt = new Date();
        config.lastTestResult = 'success';
        await this.repo.save(config);
      }

      return { success: true, latencyMs };
    } catch (err: any) {
      const latencyMs = Date.now() - start;

      const config = await this.repo.findOne({ where: { userId, providerId: dto.providerId } });
      if (config) {
        config.lastTestedAt = new Date();
        config.lastTestResult = 'failed';
        await this.repo.save(config);
      }

      return { success: false, latencyMs, error: err.message || 'Connection failed' };
    }
  }

  private async doTestCall(dto: { providerId: string; apiKey: string; secretKey?: string; baseUrl?: string; region?: string; model: string }): Promise<void> {
    const testMessage = [{ role: 'user', content: 'Say "hello" in one word.' }];

    switch (dto.providerId) {
      case 'anthropic': {
        const url = (dto.baseUrl || 'https://api.anthropic.com') + '/v1/messages';
        const resp = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-api-key': dto.apiKey, 'anthropic-version': '2023-06-01' },
          body: JSON.stringify({ model: dto.model, max_tokens: 10, messages: testMessage }),
          signal: AbortSignal.timeout(15000),
        });
        if (!resp.ok) throw new Error(`HTTP ${resp.status}: ${await resp.text().then(t => t.slice(0, 200))}`);
        break;
      }
      case 'openai':
      case 'chatgpt-subscription':
      case 'copilot-subscription':
      case 'deepseek':
      case 'deepseek-plan':
      case 'xai':
      case 'meta':
      case 'moonshot':
      case 'alibaba':
      case 'bailian-plan':
      case 'bytedance':
      case 'volcengine-plan':
      case 'minimax':
      case 'minimax-plan':
      case 'iflytek':
      case 'zhipu':
      case 'zhipu-plan': {
        // All OpenAI-compatible APIs
        const defaultUrls: Record<string, string> = {
          openai: 'https://api.openai.com/v1',
          'chatgpt-subscription': '',
          'copilot-subscription': 'https://api.individual.githubcopilot.com',
          deepseek: 'https://api.deepseek.com',
          'deepseek-plan': 'https://api.deepseek.com',
          xai: 'https://api.x.ai/v1',
          meta: 'https://api.groq.com/openai/v1',
          moonshot: 'https://api.moonshot.cn/v1',
          alibaba: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
          'bailian-plan': 'https://dashscope.aliyuncs.com/compatible-mode/v1',
          bytedance: 'https://ark.cn-beijing.volces.com/api/v3',
          'volcengine-plan': 'https://ark.cn-beijing.volces.com/api/v3',
          minimax: 'https://api.minimax.chat/v1',
          'minimax-plan': 'https://api.minimax.chat/v1',
          iflytek: 'https://spark-api-open.xf-yun.com/v1',
          zhipu: 'https://open.bigmodel.cn/api/paas/v4',
          'zhipu-plan': 'https://open.bigmodel.cn/api/paas/v4',
        };
        const base = dto.baseUrl || defaultUrls[dto.providerId] || 'https://api.openai.com/v1';
        if (dto.providerId === 'chatgpt-subscription' && !dto.baseUrl) {
          if (!dto.apiKey || dto.apiKey.trim().length < 8) {
            throw new Error('Subscription token is required');
          }
          this.logger.log(`Skipping remote probe for ${dto.providerId} without baseUrl; token format accepted`);
          break;
        }
        // For copilot-subscription, discover actual model names and validate availability
        if (dto.providerId === 'copilot-subscription') {
          // Exchange ghu_* token for Copilot session token
          dto = { ...dto, apiKey: await this.exchangeCopilotToken(dto.apiKey) };
          let copilotModelIds: string[] = [];
          try {
            const modelsResp = await fetch(`${base}/models`, {
              headers: {
                'Authorization': `Bearer ${dto.apiKey}`,
                'Editor-Version': 'vscode/1.100.0',
                'Editor-Plugin-Version': 'copilot/1.300.0',
                'Copilot-Integration-Id': 'vscode-chat',
              },
              signal: AbortSignal.timeout(10000),
            });
            if (modelsResp.ok) {
              const modelsData = await modelsResp.json();
              copilotModelIds = (modelsData.data || []).map((m: any) => m.id);
              this.logger.log(`Copilot available models (${copilotModelIds.length}): ${copilotModelIds.join(', ')}`);
            } else {
              const errBody = await modelsResp.text().catch(() => '');
              this.logger.warn(`Copilot /models returned ${modelsResp.status}: ${errBody.slice(0, 200)}`);
            }
          } catch (e) {
            this.logger.warn(`Failed to list Copilot models: ${(e as Error).message}`);
          }

          const resolvedModel = this.resolveExecutionModelId(dto.model);
          // If model not in available list, give a clear diagnosis
          if (copilotModelIds.length > 0 && !copilotModelIds.includes(resolvedModel)) {
            // Check if a base version of the model is available (e.g. claude-sonnet-4 instead of claude-sonnet-4.6)
            const family = resolvedModel.replace(/-[\d.]+(-preview)?$/, '');
            const available = copilotModelIds.filter(m => m.startsWith(family));
            const hint = available.length > 0
              ? `同系列可用: ${available.join(', ')}`
              : `当前可用 ${copilotModelIds.length} 个模型`;
            throw new Error(
              `模型 "${resolvedModel}" 当前不可用。Copilot token 可能已过期或高级模型配额已用完。` +
              `请在 VS Code 中刷新 Copilot token 后重试。(${hint})`
            );
          }

          this.logger.log(`Testing ${dto.providerId} model: ${dto.model} -> resolved: ${resolvedModel} at ${base}`);
          // GPT-5.4 models require the /responses API instead of /chat/completions
          const useResponsesApi = resolvedModel.includes('gpt-5.4');
          const copilotHeaders: Record<string, string> = {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${dto.apiKey}`,
            'Editor-Version': 'vscode/1.100.0',
            'Editor-Plugin-Version': 'copilot/1.300.0',
            'Copilot-Integration-Id': 'vscode-chat',
          };
          if (useResponsesApi) {
            const resp = await fetch(`${base}/responses`, {
              method: 'POST',
              headers: copilotHeaders,
              body: JSON.stringify({ model: resolvedModel, input: 'Say hello', max_output_tokens: 50 }),
              signal: AbortSignal.timeout(20000),
            });
            if (!resp.ok) {
              const errText = await resp.text().then(t => t.slice(0, 300));
              throw new Error(`HTTP ${resp.status}: ${errText}`);
            }
          } else {
            const resp = await fetch(`${base}/chat/completions`, {
              method: 'POST',
              headers: copilotHeaders,
              body: JSON.stringify({ model: resolvedModel, max_tokens: 10, messages: testMessage }),
              signal: AbortSignal.timeout(15000),
            });
            if (!resp.ok) {
              const errText = await resp.text().then(t => t.slice(0, 300));
              throw new Error(`HTTP ${resp.status}: ${errText}`);
            }
          }
          break;
        }
        const resolvedModel = this.resolveExecutionModelId(dto.model);
        this.logger.log(`Testing ${dto.providerId} model: ${dto.model} -> resolved: ${resolvedModel} at ${base}`);
        const resp = await fetch(`${base}/chat/completions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${dto.apiKey}` },
          body: JSON.stringify({ model: resolvedModel, max_tokens: 10, messages: testMessage }),
          signal: AbortSignal.timeout(15000),
        });
        if (!resp.ok) throw new Error(`HTTP ${resp.status}: ${await resp.text().then(t => t.slice(0, 200))}`);
        break;
      }
      case 'gemini': {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${dto.model}:generateContent?key=${dto.apiKey}`;
        const resp = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ contents: [{ parts: [{ text: 'Say hello' }] }], generationConfig: { maxOutputTokens: 10 } }),
          signal: AbortSignal.timeout(15000),
        });
        if (!resp.ok) throw new Error(`HTTP ${resp.status}: ${await resp.text().then(t => t.slice(0, 200))}`);
        break;
      }
      case 'bedrock':
      case 'bedrock-cn': {
        if (!dto.apiKey || !dto.secretKey || !dto.region) {
          throw new Error('AWS Access Key, Secret Key, and Region are all required');
        }
        if (dto.apiKey.length < 16) throw new Error('Invalid AWS Access Key format');
        if (dto.secretKey.length < 16) throw new Error('Invalid AWS Secret Key format');
        const result = await this.bedrockIntegrationService.chatWithFunctions(
          [{ role: 'user', content: 'Say hello in one word.' }],
          {
            model: dto.model,
            userCredentials: {
              accessKeyId: dto.apiKey,
              secretAccessKey: dto.secretKey,
              region: dto.region,
            },
          },
        );
        if (!result?.text?.trim()) {
          throw new Error('Bedrock returned an empty response');
        }
        break;
      }
      case 'baidu': {
        if (!dto.apiKey || !dto.secretKey) throw new Error('API Key and Secret Key are required for Baidu');
        const tokenUrl = `https://aip.baidubce.com/oauth/2.0/token?grant_type=client_credentials&client_id=${encodeURIComponent(dto.apiKey)}&client_secret=${encodeURIComponent(dto.secretKey)}`;
        const tokenResp = await fetch(tokenUrl, { method: 'POST', signal: AbortSignal.timeout(10000) });
        if (!tokenResp.ok) throw new Error(`Token request failed: HTTP ${tokenResp.status}`);
        const tokenData = await tokenResp.json() as any;
        if (!tokenData.access_token) throw new Error('Failed to get access token');
        break;
      }
      default:
        throw new Error(`Test not implemented for provider: ${dto.providerId}`);
    }
  }
}
