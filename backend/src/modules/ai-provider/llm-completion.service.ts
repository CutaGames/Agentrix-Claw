import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';

import { AiProviderService } from './ai-provider.service';
import {
  BedrockIntegrationService,
  BedrockUserCredentials,
} from '../ai-integration/bedrock/bedrock-integration.service';

/**
 * LlmCompletionService — 跨 provider 的"按用户 BYO 单次文本补全"统一入口。
 *
 * 目的(需求:游戏/agent 生成必须**优先用用户自己的 BYO**,而不是退回平台模型):
 *   - 解析用户默认 provider 配置(AiProviderService.getDefaultConfig + getDecryptedKey)。
 *   - 按 provider 家族派发到用户真实的 BYO:
 *       · aws-bedrock(-byok)        → 用户 AWS 凭据走 Bedrock(Anthropic 系)。
 *       · anthropic                  → Anthropic 直连 /v1/messages(x-api-key)。
 *       · gemini                     → Gemini 的 OpenAI 兼容端点。
 *       · copilot-subscription       → 交换会话 token 后走 Copilot OpenAI 兼容端点。
 *       · 其它(openai/deepseek/groq/openrouter/qwen/zhipu/...) → OpenAI 兼容 /chat/completions。
 *   - 无 BYO 配置(或 provider=platform)→ 平台 Bedrock(可指定平台默认模型)。
 *
 * 调用方拿到结果即可判断 modelUsed/byo;生成内容质量不达标(如游戏 HTML 校验不过)由
 * 调用方决定兜底 + 前端提示用户"换更强模型"。本服务只负责"用对的 provider 调对的模型"。
 */

export interface LlmCompletionResult {
  text: string;
  /** 友好模型名(用于展示/审计)。 */
  modelUsed: string;
  /** 实际命中的 provider id(platform / anthropic / openai / gemini / ...)。 */
  provider: string;
  /** 是否走用户自带凭据。 */
  byo: boolean;
}

export interface LlmCompleteOptions {
  userId?: string;
  prompt: string;
  system?: string;
  maxTokens?: number;
  /** 无 BYO 时的平台默认模型(友好名);默认 sonnet(强于 haiku)。 */
  platformModel?: string;
  /** 单次请求超时(ms);大产物(如游戏 HTML)放大。 */
  timeoutMs?: number;
}

/** OpenAI 兼容 provider 的默认 baseUrl(用户 config.baseUrl 优先)。 */
const DEFAULT_BASE_URLS: Record<string, string> = {
  openai: 'https://api.openai.com/v1',
  'chatgpt-subscription': 'https://api.openai.com/v1',
  gemini: 'https://generativelanguage.googleapis.com/v1beta/openai',
  deepseek: 'https://api.deepseek.com/v1',
  groq: 'https://api.groq.com/openai/v1',
  openrouter: 'https://openrouter.ai/api/v1',
  moonshot: 'https://api.moonshot.cn/v1',
  kimi: 'https://api.moonshot.cn/v1',
  zhipu: 'https://open.bigmodel.cn/api/paas/v4',
  minimax: 'https://api.minimaxi.com/v1',
  qwen: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
  dashscope: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
  'copilot-subscription': 'https://api.individual.githubcopilot.com',
};

const PLATFORM_DEFAULT_MODEL = 'claude-sonnet-4-6';

@Injectable()
export class LlmCompletionService {
  private readonly logger = new Logger(LlmCompletionService.name);

  constructor(
    private readonly aiProvider: AiProviderService,
    private readonly bedrock: BedrockIntegrationService,
  ) {}

  /**
   * 单次文本补全。优先使用用户 BYO provider/模型;无配置则平台 Bedrock。
   * 任何 provider 错误向上抛出(由调用方决定兜底)。
   */
  async complete(opts: LlmCompleteOptions): Promise<LlmCompletionResult> {
    const maxTokens = opts.maxTokens ?? 2000;
    const timeoutMs = opts.timeoutMs ?? 240_000;
    const platformModel = opts.platformModel ?? PLATFORM_DEFAULT_MODEL;

    // 1) 无 userId → 平台 Bedrock。
    if (!opts.userId) {
      return this.platformBedrock(opts, platformModel, maxTokens);
    }

    // 2) 解析用户默认 provider 配置。
    let cfg: { providerId: string; selectedModel: string } | null = null;
    try {
      const c = await this.aiProvider.getDefaultConfig(opts.userId);
      if (c) cfg = { providerId: c.providerId, selectedModel: c.selectedModel };
    } catch { /* fall through */ }

    if (!cfg || cfg.providerId === 'platform') {
      return this.platformBedrock(opts, platformModel, maxTokens);
    }

    const providerId = cfg.providerId;
    // 解析凭据(apiKey/secretKey/baseUrl/region)。
    let creds: { apiKey: string; secretKey?: string; baseUrl?: string; region?: string; model: string } | null = null;
    try {
      creds = await this.aiProvider.getDecryptedKey(opts.userId, providerId);
    } catch { creds = null; }

    if (!creds || !creds.apiKey) {
      // BYO 配置存在但拿不到 key → 平台兜底。
      this.logger.warn(`BYO provider ${providerId} has no usable key; using platform Bedrock.`);
      return this.platformBedrock(opts, platformModel, maxTokens);
    }

    // 执行模型 id(订阅别名 → 真实模型 id)。
    const friendlyModel = cfg.selectedModel;
    const execModel = this.aiProvider.resolveExecutionModelId(friendlyModel) || friendlyModel;

    // 3) 按 provider 家族派发到用户 BYO。
    try {
      // AWS Bedrock BYO(用户自带 AWS 凭据)。
      if (providerId === 'aws-bedrock' || providerId === 'aws-bedrock-byok' || (creds.secretKey && creds.region)) {
        const userCredentials: BedrockUserCredentials = {
          accessKeyId: creds.apiKey,
          secretAccessKey: creds.secretKey!,
          region: creds.region || 'us-east-1',
        };
        const text = await this.bedrock.invokeModel(opts.prompt, execModel, userCredentials, maxTokens);
        return { text, modelUsed: friendlyModel, provider: providerId, byo: true };
      }

      // Anthropic 直连。
      if (providerId === 'anthropic') {
        const text = await this.anthropicComplete(creds.apiKey, execModel, opts, maxTokens, timeoutMs, creds.baseUrl);
        return { text, modelUsed: friendlyModel, provider: providerId, byo: true };
      }

      // Copilot 订阅:先换会话 token,再走 OpenAI 兼容端点(带 Copilot 头)。
      if (providerId === 'copilot-subscription') {
        const sessionToken = await this.aiProvider.exchangeCopilotToken(creds.apiKey);
        const baseUrl = creds.baseUrl || DEFAULT_BASE_URLS['copilot-subscription'];
        const text = await this.openAiCompatComplete(sessionToken, execModel, opts, maxTokens, timeoutMs, baseUrl, {
          'Editor-Version': 'vscode/1.100.0',
          'Copilot-Integration-Id': 'vscode-chat',
        });
        return { text, modelUsed: friendlyModel, provider: providerId, byo: true };
      }

      // 其它一律按 OpenAI 兼容端点(含 gemini / deepseek / groq / openrouter / qwen / zhipu / ...)。
      const baseUrl = creds.baseUrl || DEFAULT_BASE_URLS[providerId] || DEFAULT_BASE_URLS.openai;
      const text = await this.openAiCompatComplete(creds.apiKey, execModel, opts, maxTokens, timeoutMs, baseUrl);
      return { text, modelUsed: friendlyModel, provider: providerId, byo: true };
    } catch (e: any) {
      this.logger.warn(`BYO completion via ${providerId} (${friendlyModel}) failed: ${e?.message ?? e}`);
      throw e;
    }
  }

  /** 平台 Bedrock 补全(无 BYO 时)。 */
  private async platformBedrock(
    opts: LlmCompleteOptions,
    platformModel: string,
    maxTokens: number,
  ): Promise<LlmCompletionResult> {
    const prompt = opts.system ? `${opts.system}\n\n${opts.prompt}` : opts.prompt;
    const text = await this.bedrock.invokeModel(prompt, platformModel, undefined, maxTokens);
    return { text, modelUsed: platformModel, provider: 'platform-bedrock', byo: false };
  }

  /** Anthropic 直连 /v1/messages。 */
  private async anthropicComplete(
    apiKey: string,
    model: string,
    opts: LlmCompleteOptions,
    maxTokens: number,
    timeoutMs: number,
    baseUrl?: string,
  ): Promise<string> {
    const url = `${(baseUrl || 'https://api.anthropic.com').replace(/\/$/, '')}/v1/messages`;
    const body: any = {
      model,
      max_tokens: Math.min(maxTokens, 64000),
      messages: [{ role: 'user', content: opts.prompt }],
    };
    if (opts.system) body.system = opts.system;
    const resp = await axios.post(url, body, {
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      timeout: timeoutMs,
    });
    const blocks = resp.data?.content;
    if (Array.isArray(blocks)) {
      return blocks.map((b: any) => (b?.type === 'text' ? b.text : '')).join('');
    }
    return '';
  }

  /** OpenAI 兼容 /chat/completions(openai / gemini / deepseek / groq / copilot / ...)。 */
  private async openAiCompatComplete(
    apiKey: string,
    model: string,
    opts: LlmCompleteOptions,
    maxTokens: number,
    timeoutMs: number,
    baseUrl: string,
    extraHeaders?: Record<string, string>,
  ): Promise<string> {
    const url = `${baseUrl.replace(/\/$/, '')}/chat/completions`;
    const messages: any[] = [];
    if (opts.system) messages.push({ role: 'system', content: opts.system });
    messages.push({ role: 'user', content: opts.prompt });
    const body: any = {
      model,
      messages,
      max_tokens: maxTokens,
      temperature: 0.8,
    };
    const resp = await axios.post(url, body, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        ...(extraHeaders || {}),
      },
      timeout: timeoutMs,
    });
    return resp.data?.choices?.[0]?.message?.content ?? '';
  }
}
