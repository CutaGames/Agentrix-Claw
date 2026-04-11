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
  ) {}

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
      });
    }

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: 'messages array is required and must not be empty' });
    }

    const lastUserMessage = [...messages].reverse().find((message) => message.role === 'user');
    const lastUserText = typeof lastUserMessage?.content === 'string'
      ? lastUserMessage.content
      : Array.isArray(lastUserMessage?.content)
        ? lastUserMessage.content
          .map((block: any) => typeof block === 'string' ? block : block?.text || '')
          .join(' ')
        : '';

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

