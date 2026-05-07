import { Controller, Get, Post, Body, Query, Req, Res, Logger, Inject, forwardRef } from '@nestjs/common';
import { Request, Response } from 'express';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { ClaudeIntegrationService } from './claude-integration.service';
import { AiProviderService } from '../../ai-provider/ai-provider.service';
import { OpenClawProxyService, UnifiedChatRequestDto } from '../../openclaw-proxy/openclaw-proxy.service';
import { AgentContextService } from '../../agent-context/agent-context.service';
import { AgentIntelligenceService } from '../../agent-intelligence/agent-intelligence.service';
import { RuntimeSeamService } from '../../query-engine/runtime-seam.service';
import { LlmRouterService } from '../../llm-router/llm-router.service';
import { formatSSE, formatSSEDone, type StreamEvent } from '../../query-engine/interfaces/stream-event.interface';

@Controller('claude')
export class ClaudeIntegrationController {
  private readonly logger = new Logger(ClaudeIntegrationController.name);

  constructor(
    private claudeService: ClaudeIntegrationService,
    private jwtService: JwtService,
    private configService: ConfigService,
    private aiProviderService: AiProviderService,
    @Inject(forwardRef(() => OpenClawProxyService))
    private openClawProxyService: OpenClawProxyService,
    private agentContextService: AgentContextService,
    private agentIntelligenceService: AgentIntelligenceService,
    @Inject(forwardRef(() => RuntimeSeamService))
    private runtimeSeamService: RuntimeSeamService,
    private llmRouter: LlmRouterService,
  ) {}

  /**
   * If user picked `model: 'auto'` (the default UX recommendation), classify
   * the prompt and pick the cheapest adequate model. Returns null when no
   * rewrite happened so callers can keep their original choice.
   */
  private resolveAutoModel(
    requestedModel: string | undefined,
    prompt: string,
  ): { model: string; tier: string; reason: string; provider: string; name: string } | null {
    if (!requestedModel || requestedModel.toLowerCase() !== 'auto') return null;
    try {
      const decision = this.llmRouter.route(prompt || '');
      return {
        model: decision.model.id,
        tier: decision.tier,
        reason: decision.reason,
        provider: decision.model.provider,
        name: decision.model.name,
      };
    } catch (e) {
      this.logger.warn(`auto-route failed: ${(e as Error).message}`);
      return null;
    }
  }

  /** Best-effort userId extraction from Bearer token (no guard — stays public). */
  private extractUserIdFromToken(req: Request): string | undefined {
    const auth = req.headers?.authorization;
    if (!auth?.startsWith('Bearer ')) return undefined;
    try {
      const secret = this.configService.get<string>('JWT_SECRET', 'default-secret');
      const payload = this.jwtService.verify(auth.slice(7), { secret });
      return payload?.sub as string | undefined;
    } catch {
      return undefined;
    }
  }

  private initSse(res: Response): void {
    if (res.headersSent) return;
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();
  }

  private writeSse(res: Response, payload: string): void {
    if (res.writableEnded) return;
    res.write(payload);
    if ((res as any).flush) {
      (res as any).flush();
    }
  }

  private extractMessageText(content: string | any[] | undefined): string {
    if (typeof content === 'string') return content;
    if (!Array.isArray(content)) return '';
    return content
      .map((block: any) => typeof block === 'string' ? block : block?.text || '')
      .join(' ')
      .trim();
  }

  private isAssistantCapabilityQuestion(message: string): boolean {
    const text = message.trim().toLowerCase();
    if (!text) return false;

    const marketplaceDiscovery = /(市场|marketplace|openclaw|clawhub|hub|搜索|查找|推荐|发现|安装|购买|find|search|discover|recommend|install|buy)/i.test(text);
    const currentSurfaceHint = /(你|你们|当前|现在|已有|已安装|可用|权限|mode|模式|assistant|agent|you|your|available|current|permission)/i.test(text);
    if (marketplaceDiscovery && !currentSurfaceHint) {
      return false;
    }

    const capabilityTopic = /(工具|技能|权限|能力|功能|模式|tool|tools|skill|skills|permission|permissions|capabilit|modes?)/i.test(text);
    if (!capabilityTopic) return false;

    return /(\bwhat\b|\bwhich\b|\blist\b|\bshow\b|available|can you|could you|你能|你可以|能调用|可以调用|能使用|可以使用|有哪些|哪些|支持哪些|权限是什么|能做什么|可以做什么)/i.test(text);
  }

  private buildCapabilityReply(args: { mode?: string; platform?: string; model?: string }): string {
    const mode = args.mode || 'ask';
    const platform = args.platform || 'web';
    const model = args.model || '当前选择模型';
    const desktopLine = platform === 'desktop'
      ? '桌面端在 Agent/Plan 模式且授权后，可以使用桌面工作区工具，例如读取文件、列目录、检查代码、执行允许的命令、浏览器/网页、git/构建/测试等。'
      : '在移动端/网页端，我会按当前实例权限使用平台工具、技能、记忆、团队和多模态能力。';

    return [
      `当前入口：/claude/chat，模式：${mode}，平台：${platform}，模型：${model}。`,
      'Ask 模式用于快速问答，默认不执行外部工具；Agent 模式用于需要工具的任务；Plan 模式用于长任务拆解和持续执行。',
      desktopLine,
      '平台工具包括：技能搜索/安装/执行（需要明确技能名或 skillId）、任务市场、订单/支付/钱包、资源/商品搜索、A2A agent 调用、内容分享，以及实例启用的 marketplace skills。',
      '普通“你能调用哪些工具/技能/权限？”这类能力问题只会返回说明，不会触发 skill_execute。',
    ].join('\n');
  }

  /**
   * 获取 Claude Function Schemas
   * GET /api/claude/functions
   */
  @Get('functions')
  async getFunctions() {
    const functions = await this.claudeService.getFunctionSchemas();
    return {
      functions,
      count: functions.length,
    };
  }

  /**
   * 执行 Function Call
   * POST /api/claude/function-call
   */
  @Post('function-call')
  async executeFunctionCall(
    @Req() req: Request,
    @Body()
    body: {
      function: {
        name: string;
        arguments: string | Record<string, any>;
      };
      context?: {
        userId?: string;
        sessionId?: string;
      };
    },
  ) {
    const { function: func, context = {} } = body;

    // Extract userId from JWT if not already in context
    if (!context.userId) {
      context.userId = this.extractUserIdFromToken(req);
    }

    let parameters: Record<string, any> = {};
    try {
      if (typeof func.arguments === 'string') {
        parameters = JSON.parse(func.arguments);
      } else {
        parameters = func.arguments;
      }
    } catch (error) {
      return {
        success: false,
        error: 'INVALID_ARGUMENTS',
        message: '参数格式错误',
      };
    }

    const result = await this.claudeService.executeFunctionCall(
      func.name,
      parameters,
      context,
    );

    return result;
  }

  /**
   * 快速测试接口
   * GET /api/claude/test?query={query}
   */
  @Get('test')
  async testSearch(@Query('query') query: string) {
    if (!query) {
      return { error: 'Query parameter is required' };
    }

    const result = await this.claudeService.executeFunctionCall(
      'search_agentrix_products',
      { query },
      {},
    );

    return result;
  }

  /**
   * 对话接口（带 Function Calling）
   * POST /api/claude/chat
   * 
   * 支持用户提供自己的 Anthropic API Key
   */
  @Post('chat')
  async chat(
    @Req() req: Request,
    @Res() res: Response,
    @Body()
    body: {
      messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string | any[] }>;
      anthropicApiKey?: string; // 用户提供的 API Key（可选）
      sessionId?: string;
      agentId?: string;
      mode?: 'ask' | 'agent' | 'plan';
      platform?: 'desktop' | 'mobile' | 'web';
      deviceId?: string;
      context?: {
        userId?: string;
        sessionId?: string;
      };
      stream?: boolean;
      options?: {
        model?: string;
        temperature?: number;
        maxTokens?: number;
        enableModelRouting?: boolean; // 是否启用模型路由（默认启用）
      };
    },
  ) {
    const { messages, anthropicApiKey, context = {}, options, sessionId, agentId, mode, platform, deviceId } = body;
    const wantsStream = body.stream === true || String(req.headers?.accept || '').includes('text/event-stream');
    const startMs = Date.now();

    const emitStructured = (event: StreamEvent) => {
      this.writeSse(res, formatSSE(event));
    };

    const emitMeta = (meta: Record<string, any>) => {
      this.writeSse(res, `data: ${JSON.stringify({ meta })}\n\n`);
    };

    if (!context.sessionId && sessionId) {
      context.sessionId = sessionId;
    }

    // Extract userId from JWT if not already in context
    if (!context.userId) {
      context.userId = this.extractUserIdFromToken(req);
    }

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: 'messages array is required and must not be empty' });
    }

    const lastUserMessage = [...messages].reverse().find((message) => message.role === 'user');
    const lastUserText = this.extractMessageText(lastUserMessage?.content);

    // P2-#9 — Auto routing. When client sets options.model='auto', classify the
    // prompt and rewrite to the cheapest adequate model BEFORE forwarding.
    const autoDecision = this.resolveAutoModel(options?.model, lastUserText);
    if (autoDecision) {
      body.options = { ...(body.options || {}), model: autoDecision.model };
      if (options) options.model = autoDecision.model;
      this.logger.log(
        `[auto-route] tier=${autoDecision.tier} model=${autoDecision.name} (${autoDecision.model}) reason=${autoDecision.reason}`,
      );
    }

    if (context.userId) {
      const compatibilityPayload: UnifiedChatRequestDto = {
        ...body,
        sessionId: context.sessionId || sessionId,
        agentId,
        mode,
        platform,
        deviceId,
        context,
      };

      if (wantsStream) {
        if (autoDecision) {
          this.initSse(res);
          emitMeta({
            autoRouted: true,
            model: autoDecision.model,
            modelName: autoDecision.name,
            provider: autoDecision.provider,
            tier: autoDecision.tier,
            reason: autoDecision.reason,
          });
        }
        await this.openClawProxyService.streamDefaultChat(context.userId, compatibilityPayload, res);
        return;
      }

      const proxied = await this.openClawProxyService.sendDefaultChat(context.userId, compatibilityPayload);
      const text = proxied?.reply?.content || proxied?.text || proxied?.content || proxied?.message || '';

      return res.json({
        ...proxied,
        text,
        content: text,
        message: text,
        reply: proxied?.reply || {
          id: `assistant-${Date.now()}`,
          role: 'assistant',
          content: text,
          createdAt: new Date().toISOString(),
        },
        via: 'openclaw-proxy',
        autoRouted: autoDecision
          ? {
              model: autoDecision.model,
              modelName: autoDecision.name,
              provider: autoDecision.provider,
              tier: autoDecision.tier,
              reason: autoDecision.reason,
            }
          : undefined,
      });
    }

    // If the client already provides a system message, use it as-is.
    // Otherwise inject the layered context via RuntimeSeamService (P0 unified contract).
    const hasClientSystemMessage = messages.some(m => m.role === 'system');

    let baseMessages: typeof messages;
    if (hasClientSystemMessage) {
      baseMessages = messages;
    } else {
      // P0: Use RuntimeSeamService for consistent context across both chat paths
      const seamContext = await this.runtimeSeamService.buildRuntimeContext({
        userId: context.userId || '',
        sessionId: context.sessionId || `claude-${Date.now()}`,
        agentId,
        message: lastUserText,
        needsTools: mode !== 'ask',
        model: options?.model,
        modelLabel: options?.model || 'AI',
        mode,
        platform,
      });

      if (seamContext.hookBlocked) {
        const blockedResult = {
          text: seamContext.hookBlockMessage || 'Message blocked by pre-message hook.',
          toolCalls: null,
          stopReason: 'hook_blocked',
        };

        if (wantsStream) {
          this.initSse(res);
          emitStructured({ type: 'text_delta', text: blockedResult.text });
          emitStructured({
            type: 'done',
            reason: 'end_turn',
            totalDurationMs: Date.now() - startMs,
            totalInputTokens: 0,
            totalOutputTokens: 0,
          });
          this.writeSse(res, formatSSEDone());
          res.end();
          return;
        }

        return res.json(blockedResult);
      }

      baseMessages = [
        { role: 'system' as const, content: seamContext.systemPrompt },
        ...messages,
      ];
    }

    // Convert image attachment URLs in user messages to Claude multimodal content blocks
    const allMessages = baseMessages.map(m => {
      if (m.role !== 'user' || typeof m.content !== 'string') return m;
      const imageUrlPattern = /URL:\s*(https?:\/\/\S+\.(?:jpg|jpeg|png|gif|webp)(?:\?\S*)?)/gi;
      const imageUrls: string[] = [];
      let match: RegExpExecArray | null;
      while ((match = imageUrlPattern.exec(m.content)) !== null) {
        imageUrls.push(match[1]);
      }
      if (imageUrls.length === 0) return m;
      const contentBlocks: any[] = [];
      for (const url of imageUrls) {
        contentBlocks.push({ type: 'image', source: { type: 'url', url } });
      }
      contentBlocks.push({ type: 'text', text: m.content });
      return { ...m, content: contentBlocks };
    });

    // Resolve user provider credentials from DB if user is authenticated
    let userCreds: { apiKey: string; secretKey?: string; region?: string; baseUrl?: string; providerId: string; model?: string } | undefined;
    if (context.userId) {
      try {
        const defaultConfig = await this.aiProviderService.getDefaultConfig(context.userId);
        if (defaultConfig) {
          const decrypted = await this.aiProviderService.getDecryptedKey(context.userId, defaultConfig.providerId);
          if (decrypted) {
            userCreds = { ...decrypted, providerId: defaultConfig.providerId };
          }
        }
      } catch (e) {
        this.logger.warn(`Failed to resolve user credentials for userId=${context.userId}: ${e.message}`);
      }
    }

    const chatOptions: {
      model?: string;
      temperature?: number;
      maxTokens?: number;
      enableModelRouting?: boolean;
      context: { userId?: string; sessionId?: string };
      userApiKey?: string;
      userCredentials?: { apiKey: string; secretKey?: string; region?: string; baseUrl?: string; providerId: string; model?: string };
      additionalTools?: any[];
      onToolCall?: (name: string, args: any) => Promise<any>;
      onChunk?: (text: string) => void;
    } = {
      ...options,
      context,
      userApiKey: anthropicApiKey,
      userCredentials: userCreds,
    };

    let streamedTextBytes = 0;
    const toolCallIds = new Map<string, string>();

    const emitClaudeChunk = (chunk: string) => {
      if (!chunk) return;

      const trimmed = chunk.trim();
      if (!trimmed) return;

      if (trimmed === '[Thinking]' || trimmed === '[/Thinking]') {
        return;
      }

      const thinkingMatch = trimmed.match(/^\[Think\]\s*(.*)$/s);
      if (thinkingMatch) {
        emitStructured({ type: 'thinking', text: thinkingMatch[1] || '' });
        return;
      }

      const toolStartMatch = trimmed.match(/^\[Tool Start\]\s*(.+)$/s);
      if (toolStartMatch) {
        const toolName = toolStartMatch[1].trim() || 'tool';
        const toolCallId = `claude-tool-${Date.now()}-${toolCallIds.size + 1}`;
        toolCallIds.set(toolName, toolCallId);
        emitStructured({ type: 'tool_start', toolCallId, toolName, input: {} });
        return;
      }

      const toolDoneMatch = trimmed.match(/^\[Tool Done\]\s*(.+)$/s);
      if (toolDoneMatch) {
        const toolName = toolDoneMatch[1].trim() || 'tool';
        const toolCallId = toolCallIds.get(toolName) || `claude-tool-${Date.now()}-${toolCallIds.size + 1}`;
        emitStructured({ type: 'tool_result', toolCallId, toolName, success: true, result: null, durationMs: 0 });
        return;
      }

      const toolErrorMatch = trimmed.match(/^\[Tool Error\]\s*([^:]+):\s*(.+)$/s);
      if (toolErrorMatch) {
        const toolName = toolErrorMatch[1].trim() || 'tool';
        const toolCallId = toolCallIds.get(toolName) || `claude-tool-${Date.now()}-${toolCallIds.size + 1}`;
        emitStructured({
          type: 'tool_error',
          toolCallId,
          toolName,
          error: toolErrorMatch[2].trim(),
          retriable: false,
        });
        return;
      }

      if (trimmed.startsWith('[Tool Call]')) {
        return;
      }

      streamedTextBytes += chunk.length;
      emitStructured({ type: 'text_delta', text: chunk });
    };

    if (wantsStream) {
      this.initSse(res);
      chatOptions.onChunk = emitClaudeChunk;
    }

    if (mode === 'ask') {
      chatOptions.additionalTools = [];
    } else if (platform === 'desktop' && context.userId) {
      const shouldUseTools = this.openClawProxyService.shouldUseTools(mode, lastUserText);
      if (shouldUseTools) {
        const desktopBridge = this.openClawProxyService.buildDesktopToolBridge(
          context.userId,
          deviceId,
          context.sessionId,
        );
        const baseTools = await this.claudeService.getFunctionSchemas();
        chatOptions.additionalTools = [...baseTools, ...desktopBridge.additionalTools];
        chatOptions.onToolCall = desktopBridge.onToolCall;
        this.logger.log(`🖥️ Desktop Claude chat detected — injected ${desktopBridge.additionalTools.length} desktop tools`);
      } else {
        chatOptions.additionalTools = [];
      }
    }

    let result: any;
    try {
      result = await this.claudeService.chatWithFunctions(allMessages, chatOptions);
    } catch (error: any) {
      this.logger.error(`Claude chat failed: ${error.message}`, error.stack);

      if (wantsStream) {
        if (!res.headersSent) {
          this.initSse(res);
        }
        emitStructured({ type: 'error', error: error.message || 'Claude chat failed', retriable: false });
        this.writeSse(res, formatSSEDone());
        res.end();
        return;
      }

      return res.status(500).json({ error: error.message || 'Claude chat failed' });
    }

    // P0: Post-process via RuntimeSeamService (hooks + memory flush)
    if (context.userId && context.sessionId && typeof result?.text === 'string') {
      this.runtimeSeamService.postProcess(
        {
          userId: context.userId,
          sessionId: context.sessionId,
          agentId,
          message: lastUserText,
          model: options?.model,
        },
        result.text,
        result?.toolCalls,
      ).catch((err: Error) => {
        this.logger.warn(`RuntimeSeam postProcess failed: ${err.message}`);
      });
    }

    if (context.sessionId && context.userId && lastUserText && typeof result?.text === 'string' && result.text.trim()) {
      this.agentIntelligenceService.extractAndSaveMemories(
        context.sessionId,
        context.userId,
        agentId,
        lastUserText,
        result.text,
      ).catch((err: Error) => {
        this.logger.warn(`Claude chat memory extraction failed: ${err.message}`);
      });
    }

    if (wantsStream) {
      const fullText = typeof result?.text === 'string' ? result.text : '';
      if (fullText && streamedTextBytes < fullText.length * 0.5) {
        const fallbackChunks = fullText.match(/.{1,80}/gs) || [fullText];
        for (const chunk of fallbackChunks) {
          emitStructured({ type: 'text_delta', text: chunk });
        }
      }

      if (options?.model) {
        emitMeta({ resolvedModel: options.model, resolvedModelLabel: options.model });
      }

      const doneReason =
        result?.stopReason === 'max_tokens'
        || result?.stopReason === 'stop_sequence'
        || result?.stopReason === 'abort'
        || result?.stopReason === 'error'
        || result?.stopReason === 'tool_use'
        || result?.stopReason === 'end_turn'
          ? result.stopReason
          : 'end_turn';

      emitStructured({
        type: 'done',
        reason: doneReason,
        totalDurationMs: Date.now() - startMs,
        totalInputTokens: 0,
        totalOutputTokens: 0,
      });
      this.writeSse(res, formatSSEDone());
      res.end();
      return;
    }

    return res.json(result);
  }
}

