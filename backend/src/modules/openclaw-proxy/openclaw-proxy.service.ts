import {
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
  BadGatewayException,
  BadRequestException,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AgentAccount, AgentAccountStatus } from '../../entities/agent-account.entity';
import { AgentMessage, MessageRole, MessageType } from '../../entities/agent-message.entity';
import { AgentSession, SessionStatus } from '../../entities/agent-session.entity';
import { OpenClawInstance, OpenClawInstanceStatus } from '../../entities/openclaw-instance.entity';
import { OpenClawConnectionService } from '../openclaw-connection/openclaw-connection.service';
import { ClaudeIntegrationService } from '../ai-integration/claude/claude-integration.service';
import { GeminiIntegrationService } from '../ai-integration/gemini/gemini-integration.service';
import { OpenAIIntegrationService } from '../ai-integration/openai/openai-integration.service';
import { TokenQuotaService, estimateTokens } from '../token-quota/token-quota.service';
import { SkillExecutorService, ExecutionContext } from '../skill/skill-executor.service';
import { AGENT_PRESET_SKILLS, getDefaultEnabledSkills, PresetSkill } from '../skill/agent-preset-skills.config';
import { SkillService } from '../skill/skill.service';
import { AiProviderService } from '../ai-provider/ai-provider.service';
import { RelayRegistry } from '../openclaw-connection/telegram-bot.service';
import { Response } from 'express';
import { AgentIntelligenceService } from '../agent-intelligence/agent-intelligence.service';
import { emitAgentSyncEvent } from '../agent-intelligence/agent-sync.events';
import { HookService } from '../hooks/hook.service';
import { HookEventType } from '../../entities/hook-config.entity';
import { McpServerRegistryService } from '../mcp-registry/mcp-server-registry.service';

export interface ChatMessageDto {
  message: string | any[];
  sessionId?: string;
  context?: Record<string, any>;
  model?: string;
  voiceId?: string;
  mode?: 'ask' | 'agent' | 'plan';
}

export interface ChatStreamCallbacks {
  signal?: AbortSignal;
  onMeta?: (meta: Record<string, any>) => Promise<void> | void;
  onChunk: (chunk: string) => Promise<void> | void;
  onDone?: () => Promise<void> | void;
}

interface RuntimePermissionProfile {
  agentAccountId?: string;
  agentAccountName?: string;
  agentAccountStatus?: string;
  allowedToolNames: string[];
  deniedToolNames: string[];
}

@Injectable()
export class OpenClawProxyService {
  private readonly logger = new Logger(OpenClawProxyService.name);

  constructor(
    private readonly connectionService: OpenClawConnectionService,
    private readonly tokenQuotaService: TokenQuotaService,
    @Inject(forwardRef(() => ClaudeIntegrationService))
    private readonly claudeIntegrationService: ClaudeIntegrationService,
    @Inject(forwardRef(() => GeminiIntegrationService))
    private readonly geminiIntegrationService: GeminiIntegrationService,
    @Inject(forwardRef(() => OpenAIIntegrationService))
    private readonly openAIIntegrationService: OpenAIIntegrationService,
    @Inject(forwardRef(() => SkillExecutorService))
    private readonly skillExecutorService: SkillExecutorService,
    @Inject(forwardRef(() => SkillService))
    private readonly skillService: SkillService,
    private readonly aiProviderService: AiProviderService,
    @InjectRepository(OpenClawInstance)
    private instanceRepo: Repository<OpenClawInstance>,
    @InjectRepository(AgentAccount)
    private agentAccountRepo: Repository<AgentAccount>,
    @InjectRepository(AgentSession)
    private sessionRepo: Repository<AgentSession>,
    @InjectRepository(AgentMessage)
    private messageRepo: Repository<AgentMessage>,
    @Inject(forwardRef(() => AgentIntelligenceService))
    private readonly intelligenceService: AgentIntelligenceService,
    @Inject(forwardRef(() => HookService))
    private readonly hookService: HookService,
    @Inject(forwardRef(() => McpServerRegistryService))
    private readonly mcpRegistryService: McpServerRegistryService,
  ) {}

  private async ensureOwnedInstance(userId: string, instanceId: string): Promise<OpenClawInstance> {
    return this.connectionService.getInstanceById(userId, instanceId);
  }

  private async resolveInstance(userId: string, instanceId: string): Promise<OpenClawInstance> {
    const instance = await this.ensureOwnedInstance(userId, instanceId);
    if (instance.status !== OpenClawInstanceStatus.ACTIVE) {
      throw new BadGatewayException(`Instance "${instance.name}" is not active (status: ${instance.status})`);
    }
    if (!instance.instanceUrl) {
      throw new BadGatewayException('Instance has no URL configured');
    }
    return instance;
  }

  private isPlatformHosted(instance: OpenClawInstance): boolean {
    return !instance.instanceUrl || !!(instance.capabilities as any)?.platformHosted;
  }

  /**
   * Determine whether a message likely needs tool access.
   * Simple greetings and conversational messages skip tools for ~4x faster response.
   */
  private messageNeedsTools(text: string): boolean {
    const lower = text.toLowerCase().trim();
    // Very short messages (<15 chars) without action keywords are conversational
    if (lower.length < 15) {
      const actionWords = /search|find|buy|pay|install|execute|run|publish|balance|order|skill|product|task|agent|airdrop|token|wallet|price|send|transfer|discover|recommend|marketplace|资金|余额|搜索|安装|执行|购买|支付|发布|查询|技能|商品|任务/;
      if (!actionWords.test(lower)) return false;
    }
    return true;
  }

  private async getOrCreatePlatformHostedSession(
    userId: string,
    instance: OpenClawInstance,
    clientSessionId?: string,
  ): Promise<AgentSession> {
    const resolvedClientSessionId = clientSessionId || `platform-${Date.now()}`;
    const existingSession = await this.sessionRepo.findOne({
      where: {
        userId,
        sessionId: resolvedClientSessionId,
      },
    });

    if (existingSession) {
      const instanceId = existingSession.metadata?.instanceId;
      if (!instanceId || instanceId === instance.id) {
        return existingSession;
      }
    }

    const session = this.sessionRepo.create({
      userId,
      sessionId: resolvedClientSessionId,
      agentId: typeof instance.metadata?.agentAccountId === 'string' ? instance.metadata.agentAccountId : undefined,
      title: instance.name || 'OpenClaw Agent',
      status: SessionStatus.ACTIVE,
      metadata: {
        source: 'openclaw-platform-hosted',
        instanceId: instance.id,
        instanceName: instance.name,
      },
      context: {
        intent: null,
        entities: {},
        userProfile: {},
      },
      lastMessageAt: new Date(),
    });

    return this.sessionRepo.save(session);
  }

  private async savePlatformHostedMessage(
    session: AgentSession,
    userId: string,
    role: MessageRole,
    content: string,
    metadata?: Record<string, any>,
  ): Promise<void> {
    if (!content?.trim()) {
      return;
    }

    const sequenceNumber = (await this.messageRepo.count({ where: { sessionId: session.id } })) + 1;
    const message = this.messageRepo.create({
      session,
      sessionId: session.id,
      userId,
      role,
      type: MessageType.TEXT,
      content,
      metadata,
      sequenceNumber,
    });

    await this.messageRepo.save(message);
    await this.sessionRepo.update(session.id, { lastMessageAt: new Date() });
  }

  private async getPlatformConversationHistory(
    userId: string,
    instanceId: string,
    limit: number = 12,
  ): Promise<AgentMessage[]> {
    const messages = await this.messageRepo
      .createQueryBuilder('message')
      .innerJoinAndSelect('message.session', 'session')
      .where('session.userId = :userId', { userId })
      // Include both ACTIVE sessions and any non-ACTIVE sessions that have recent messages
      .andWhere(`session.metadata ->> 'instanceId' = :instanceId`, { instanceId })
      // Order purely by creation time so newest messages are always found,
      // regardless of per-session sequenceNumber (which resets for each new session)
      .orderBy('message.createdAt', 'DESC')
      .take(limit)
      .getMany();

    return messages.reverse();
  }

  private buildPlatformHistoryMessages(history: AgentMessage[]) {
    return history
      .filter((message) => message.role === MessageRole.USER || message.role === MessageRole.ASSISTANT)
      .filter((message) => !!message.content?.trim())
      .map((message) => ({
        role: message.role as 'user' | 'assistant',
        content: message.content,
      }));
  }

  private async getPlatformHostedHistoryPayload(
    userId: string,
    instanceId: string,
    clientSessionId?: string,
  ) {
    let sessionMessages: AgentMessage[] = [];

    if (clientSessionId) {
      sessionMessages = await this.messageRepo
        .createQueryBuilder('message')
        .innerJoinAndSelect('message.session', 'session')
        .where('session.userId = :userId', { userId })
        .andWhere('session.sessionId = :sessionId', { sessionId: clientSessionId })
        .andWhere(`session.metadata ->> 'instanceId' = :instanceId`, { instanceId })
        .orderBy('message.sequenceNumber', 'ASC')
        .addOrderBy('message.createdAt', 'ASC')
        .take(80)
        .getMany();
    }

    const messages = sessionMessages.length > 0
      ? sessionMessages
      : await this.getPlatformConversationHistory(userId, instanceId, 80);

    return messages.map((message) => ({
      id: message.id,
      role: message.role,
      content: message.content,
      createdAt: message.createdAt,
      metadata: message.metadata,
    }));
  }

  private buildPlatformToolSchema(skill: PresetSkill) {
    // Per-skill tailored schemas so Claude knows exactly what each tool accepts
    const schemas: Record<string, { properties: Record<string, any>; required?: string[] }> = {
      skill_search: {
        properties: {
          query: { type: 'string', description: 'Search query — keyword, skill name, or description' },
          category: { type: 'string', description: 'Filter by category (e.g. utility, social, finance)' },
          limit: { type: 'number', description: 'Max results to return (default 10)' },
        },
        required: ['query'],
      },
      skill_install: {
        properties: {
          query: { type: 'string', description: 'Skill name or search query to find and install' },
          skillId: { type: 'string', description: 'Direct skill ID or slug if known' },
        },
      },
      skill_execute: {
        properties: {
          query: { type: 'string', description: 'Skill name or search query to find and execute' },
          skillId: { type: 'string', description: 'Direct skill ID or slug if known' },
          input: { type: 'object', description: 'Structured input payload for the skill' },
          prompt: { type: 'string', description: 'Natural-language prompt for prompt-based skills' },
        },
      },
      skill_recommend: {
        properties: {
          intent: { type: 'string', description: 'What the user wants to accomplish' },
          category: { type: 'string', description: 'Preferred category' },
          limit: { type: 'number', description: 'Max recommendations' },
        },
      },
      skill_publish: {
        properties: {
          name: { type: 'string', description: 'Skill name (alphanumeric, underscores, hyphens)' },
          displayName: { type: 'string', description: 'Human-readable display name' },
          description: { type: 'string', description: 'Skill description' },
          category: { type: 'string', description: 'Category: utility, social, finance, etc.' },
          tags: { type: 'array', items: { type: 'string' }, description: 'Tags for discoverability' },
          price: { type: 'number', description: 'Price per call (0 for free)' },
        },
        required: ['name', 'description'],
      },
      search_products: {
        properties: {
          query: { type: 'string', description: 'Search query for physical goods, digital resources, or paid services (NOT skills — use skill_search for skills)' },
          category: { type: 'string', description: 'Product category' },
          limit: { type: 'number', description: 'Max results' },
        },
        required: ['query'],
      },
      marketplace_purchase: {
        properties: {
          skillId: { type: 'string', description: 'Skill ID to purchase' },
          itemId: { type: 'string', description: 'Item ID to purchase' },
          paymentMethod: { type: 'string', description: 'wallet, stripe, quickpay' },
        },
      },
      task_search: {
        properties: {
          query: { type: 'string', description: 'Task search query' },
          category: { type: 'string', description: 'Task category' },
          limit: { type: 'number', description: 'Max results' },
        },
      },
      task_post: {
        properties: {
          title: { type: 'string', description: 'Task title' },
          description: { type: 'string', description: 'Task description and requirements' },
          budget: { type: 'number', description: 'Task budget amount' },
          currency: { type: 'string', description: 'Currency code (USD, CNY)' },
        },
        required: ['title', 'description'],
      },
      task_accept: {
        properties: {
          taskId: { type: 'string', description: 'Task ID to accept' },
        },
        required: ['taskId'],
      },
      task_submit: {
        properties: {
          taskId: { type: 'string', description: 'Task ID' },
          message: { type: 'string', description: 'Submission message or notes' },
          deliverables: { type: 'array', items: { type: 'string' }, description: 'URLs or descriptions of deliverables' },
        },
        required: ['taskId'],
      },
      get_balance: {
        properties: {
          chain: { type: 'string', description: 'Blockchain network (optional, default: all chains)' },
        },
      },
      resource_search: {
        properties: {
          query: { type: 'string', description: 'Search query for resources, services, APIs' },
          category: { type: 'string', description: 'Category filter' },
          limit: { type: 'number', description: 'Max results' },
        },
        required: ['query'],
      },
      create_order: {
        properties: {
          productId: { type: 'string', description: 'Product or resource ID to order' },
          quantity: { type: 'number', description: 'Quantity (default 1)' },
          shippingAddress: { type: 'string', description: 'Shipping address (for physical goods)' },
        },
        required: ['productId'],
      },
      x402_pay: {
        properties: {
          url: { type: 'string', description: 'X402 payment URL or resource endpoint' },
          amount: { type: 'number', description: 'Payment amount' },
          currency: { type: 'string', description: 'Currency (USDC, ETH, etc.)' },
        },
      },
      quickpay_execute: {
        properties: {
          amount: { type: 'number', description: 'Payment amount' },
          currency: { type: 'string', description: 'Currency' },
          recipient: { type: 'string', description: 'Recipient address or agent ID' },
          description: { type: 'string', description: 'Payment description' },
        },
      },
      agent_discover: {
        properties: {
          query: { type: 'string', description: 'Search query for finding agents' },
          capability: { type: 'string', description: 'Required agent capability' },
          limit: { type: 'number', description: 'Max results' },
        },
      },
      agent_invoke: {
        properties: {
          agentId: { type: 'string', description: 'Target agent ID to invoke' },
          task: { type: 'string', description: 'Task description for the agent' },
          input: { type: 'object', description: 'Structured input for the agent' },
        },
        required: ['agentId', 'task'],
      },
      asset_overview: {
        properties: {
          chain: { type: 'string', description: 'Blockchain network filter (optional)' },
        },
      },
      resource_publish: {
        properties: {
          name: { type: 'string', description: 'Resource name' },
          description: { type: 'string', description: 'Detailed description' },
          resourceType: { type: 'string', enum: ['api', 'dataset', 'model', 'workflow', 'service', 'product'], description: 'Resource type' },
          price: { type: 'number', description: 'Price' },
          currency: { type: 'string', description: 'Currency (default USDC)' },
        },
        required: ['name', 'description'],
      },
      web_search: {
        properties: {
          query: { type: 'string', description: 'Search query — factual questions, current events, technical docs, code examples' },
          limit: { type: 'number', description: 'Max results to return (default 5, max 10)' },
        },
        required: ['query'],
      },
      web_fetch: {
        properties: {
          url: { type: 'string', description: 'Full URL to fetch content from (https://...)' },
          maxLength: { type: 'number', description: 'Max characters of extracted text to return (default 8000)' },
        },
        required: ['url'],
      },
      open_url: {
        properties: {
          url: { type: 'string', description: 'URL to open in the user\'s browser (https://...)' },
          title: { type: 'string', description: 'Optional display title for the link' },
        },
        required: ['url'],
      },
      code_eval: {
        properties: {
          code: { type: 'string', description: 'JavaScript code to execute. Has access to Math, JSON, Date, Array, Object, String, Number, RegExp. No network or filesystem access.' },
          language: { type: 'string', enum: ['javascript'], description: 'Language (currently only javascript supported)' },
        },
        required: ['code'],
      },
    };

    const specific = schemas[skill.handlerName];
    return {
      name: skill.handlerName,
      description: skill.description,
      input_schema: {
        type: 'object' as const,
        properties: specific?.properties ?? {
          query: { type: 'string', description: 'Search query or natural-language request' },
          input: { type: 'object', description: 'Structured input payload' },
          params: { type: 'object', description: 'Generic structured params' },
        },
        ...(specific?.required ? { required: specific.required } : {}),
        additionalProperties: true,
      },
    };
  }

  private buildMarketplaceSkillToolName(name: string): string {
    return `installed_${String(name || '')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')}`;
  }

  private getModelFamily(modelId?: string): string | null {
    const normalized = String(modelId || '').toLowerCase();
    if (!normalized) return null;
    if (normalized.includes('opus')) return 'opus';
    if (normalized.includes('sonnet')) return 'sonnet';
    if (normalized.includes('haiku')) return 'haiku';
    if (normalized.includes('gpt')) return 'gpt';
    if (normalized.includes('gemini')) return 'gemini';
    if (normalized.includes('llama')) return 'llama';
    if (normalized.includes('deepseek')) return 'deepseek';
    if (normalized.includes('mistral')) return 'mistral';
    if (normalized.includes('nova')) return 'nova';
    return null;
  }

  private inferProviderFromModelId(modelId?: string): string | undefined {
    if (!modelId) return undefined;

    const catalogProvider = this.aiProviderService
      .getCatalog()
      .find((provider: any) => provider.models?.some((model: any) => model.id === modelId));
    if (catalogProvider) {
      return catalogProvider.id;
    }

    if (['claude-haiku-4-5', 'claude-sonnet-4-6'].includes(modelId)) {
      return 'platform';
    }

    if (modelId === 'claude-opus-4-6') {
      return 'platform';
    }

    if (modelId === 'deepseek-v3') {
      return 'deepseek';
    }

    if (modelId === 'gemini-2.0-flash') {
      return 'gemini';
    }

    if (modelId === 'llama-3.3-70b') {
      return 'meta';
    }

    if (modelId === 'gpt-4o') {
      return 'openai';
    }

    return undefined;
  }

  private normalizeModelForProvider(modelId: string, providerId?: string, fallbackModel?: string): string {
    if (!providerId || providerId === 'platform') {
      return modelId;
    }

    const provider = this.aiProviderService.getCatalog().find((item: any) => item.id === providerId);
    if (!provider?.models?.length) {
      return modelId;
    }

    if (provider.models.some((model: any) => model.id === modelId)) {
      return modelId;
    }

    const family = this.getModelFamily(modelId);
    const familyMatch = family
      ? provider.models.find((model: any) => `${model.id} ${model.label}`.toLowerCase().includes(family))
      : undefined;

    if (familyMatch?.id) {
      return familyMatch.id;
    }

    if (fallbackModel && provider.models.some((model: any) => model.id === fallbackModel)) {
      return fallbackModel;
    }

    return provider.models[0]?.id || modelId;
  }

  private resolveExecutionModelId(modelId: string): string {
    return this.aiProviderService.resolveExecutionModelId(modelId) || modelId;
  }

  private getPlatformOpenAICompatibleCredentials(providerId?: string): {
    apiKey: string;
    baseUrl?: string;
    providerId: string;
  } | undefined {
    if (!providerId || providerId === 'platform') {
      return undefined;
    }

    const provider = this.aiProviderService.getCatalog().find((item: any) => item.id === providerId);
    const providerBaseUrl = typeof provider?.baseUrl === 'string' ? provider.baseUrl : undefined;

    switch (providerId) {
      case 'deepseek': {
        const apiKey = process.env.DEEPSEEK_API_KEY || process.env.deepseek_API_KEY;
        return apiKey
          ? { apiKey, baseUrl: process.env.DEEPSEEK_BASE_URL || providerBaseUrl, providerId }
          : undefined;
      }
      case 'meta': {
        const apiKey = process.env.GROQ_API_KEY;
        return apiKey
          ? { apiKey, baseUrl: process.env.GROQ_BASE_URL || providerBaseUrl, providerId }
          : undefined;
      }
      case 'openai': {
        const apiKey = process.env.OPENAI_API_KEY;
        return apiKey
          ? { apiKey, baseUrl: process.env.OPENAI_BASE_URL || providerBaseUrl, providerId }
          : undefined;
      }
      default:
        return undefined;
    }
  }

  private isOpenAICompatibleProvider(providerId?: string): boolean {
    return [
      'openai',
      'chatgpt-subscription',
      'copilot-subscription',
      'deepseek',
      'xai',
      'meta',
      'moonshot',
      'alibaba',
      'bytedance',
      'minimax',
      'iflytek',
      'zhipu',
    ].includes(String(providerId || ''));
  }

  private toOpenAITools(tools: any[]): any[] {
    return tools.map((tool) => {
      if (tool?.type === 'function' && tool?.function?.name) {
        return tool;
      }

      if (tool?.name && tool?.input_schema) {
        return {
          type: 'function',
          function: {
            name: tool.name,
            description: tool.description,
            parameters: tool.input_schema,
          },
        };
      }

      return tool;
    });
  }

  private formatDirectMarketplaceSearch(
    toolName: 'skill_search' | 'task_search' | 'resource_search',
    searchResult: any,
  ): string | null {
    if (toolName === 'task_search') {
      const tasks = Array.isArray(searchResult?.tasks) ? searchResult.tasks : [];
      if (tasks.length === 0) return null;
      return `Found ${searchResult.total || tasks.length} tasks:\n` + tasks
        .slice(0, 10)
        .map((task: any, index: number) => `${index + 1}. **${task.title || task.id}**${task.budget ? ` - ${task.budget} ${task.currency || ''}` : ''} - ${task.description || 'No description'}`)
        .join('\n');
    }

    if (toolName === 'resource_search') {
      const products = Array.isArray(searchResult?.products) ? searchResult.products : [];
      if (products.length === 0) return null;
      return `Found ${searchResult.total || products.length} resources:\n` + products
        .slice(0, 10)
        .map((product: any, index: number) => `${index + 1}. **${product.name || product.title || product.id}**${product.price ? ` - ${product.price} ${product.currency || ''}` : ''} - ${product.description || 'No description'}`)
        .join('\n');
    }

    const skills = Array.isArray(searchResult?.skills) ? searchResult.skills : [];
    if (skills.length === 0) return null;
    return `Found ${searchResult.total || skills.length} skills:\n` + skills
      .slice(0, 10)
      .map((skill: any, index: number) => `${index + 1}. **${skill.name || skill.id}**${skill.source ? ` [${skill.source}]` : ''} - ${skill.description || 'No description'}`)
      .join('\n');
  }

  private async resolveRuntimePermissionProfile(userId: string, instance: OpenClawInstance): Promise<RuntimePermissionProfile | null> {
    const agentAccountId = typeof instance.metadata?.agentAccountId === 'string'
      ? instance.metadata.agentAccountId
      : undefined;

    if (!agentAccountId) return null;

    const agentAccount = await this.agentAccountRepo.findOne({ where: { id: agentAccountId, ownerId: userId } });
    if (!agentAccount) {
      return null;
    }

    const p = agentAccount.permissions || {} as any;
    const deniedToolNames = new Set<string>();

    // Only fully deny tools for SUSPENDED or REVOKED accounts
    // DRAFT and ACTIVE accounts get full tool access (gated by granular permissions below)
    if (agentAccount.status === AgentAccountStatus.SUSPENDED || agentAccount.status === AgentAccountStatus.REVOKED) {
      AGENT_PRESET_SKILLS.forEach((skill) => deniedToolNames.add(skill.handlerName));
    }

    // Granular permission checks — only deny when EXPLICITLY set to false
    if (p.skillSearchEnabled === false) {
      ['skill_search', 'skill_recommend'].forEach((n) => deniedToolNames.add(n));
    }
    if (p.skillInstallEnabled === false) {
      deniedToolNames.add('skill_install');
    }
    if (p.skillExecuteEnabled === false) {
      deniedToolNames.add('skill_execute');
    }
    if (p.skillPublishEnabled === false) {
      deniedToolNames.add('skill_publish');
    }
    if (p.commerceBrowseEnabled === false) {
      ['search_products', 'resource_search'].forEach((n) => deniedToolNames.add(n));
    }
    if (p.commercePurchaseEnabled === false) {
      ['marketplace_purchase', 'create_order'].forEach((n) => deniedToolNames.add(n));
    }
    if (p.walletReadEnabled === false) {
      ['get_balance', 'asset_overview'].forEach((n) => deniedToolNames.add(n));
    }
    if (p.quickpayEnabled === false) {
      deniedToolNames.add('quickpay_execute');
    }
    if (p.x402PayEnabled === false) {
      deniedToolNames.add('x402_pay');
    }
    if (p.autonomousPaymentEnabled === false) {
      ['create_order', 'x402_pay', 'quickpay_execute', 'marketplace_purchase'].forEach((n) => deniedToolNames.add(n));
    }
    if (p.a2aDiscoverEnabled === false) {
      deniedToolNames.add('agent_discover');
    }
    if (p.a2aInvokeEnabled === false) {
      deniedToolNames.add('agent_invoke');
    }
    if (p.taskSearchEnabled === false) {
      deniedToolNames.add('task_search');
    }
    if (p.taskPostEnabled === false) {
      deniedToolNames.add('task_post');
    }
    if (p.taskAcceptEnabled === false) {
      deniedToolNames.add('task_accept');
    }
    if (p.taskSubmitEnabled === false) {
      deniedToolNames.add('task_submit');
    }
    if (p.resourceSearchEnabled === false) {
      deniedToolNames.add('resource_search');
    }
    if (p.resourcePublishEnabled === false) {
      deniedToolNames.add('resource_publish');
    }
    if (p.webSearchEnabled === false) {
      deniedToolNames.add('search_web');
    }
    if (p.telegramEnabled === false) {
      deniedToolNames.add('agent_invoke');
    }
    if (p.twitterEnabled === false) {
      deniedToolNames.add('resource_publish');
    }

    const allPresetToolNames = AGENT_PRESET_SKILLS.map((skill) => skill.handlerName);
    return {
      agentAccountId: agentAccount.id,
      agentAccountName: agentAccount.name,
      agentAccountStatus: agentAccount.status,
      allowedToolNames: allPresetToolNames.filter((name) => !deniedToolNames.has(name)),
      deniedToolNames: [...deniedToolNames],
    };
  }

  private async buildPlatformHostedTools(userId: string, instance: OpenClawInstance): Promise<{
    additionalTools: any[];
    onToolCall: (name: string, args: any) => Promise<any>;
  }> {
    const permissionProfile = await this.resolveRuntimePermissionProfile(userId, instance);
    const installations = await this.skillService.findEffectiveInstalledSkillsForInstance(instance.id, userId);
    const enabledInstallations = installations.filter((installation: any) => installation?.isEnabled && installation?.skill);

    const presetTools = AGENT_PRESET_SKILLS
      .filter((skill) => skill.enabledByDefault || skill.handlerName === 'skill_publish' || skill.handlerName === 'resource_publish')
      .filter((skill) => !permissionProfile?.deniedToolNames.includes(skill.handlerName))
      .map((skill) => this.buildPlatformToolSchema(skill));
    const installedToolEntries = enabledInstallations.map((installation: any) => {
      const skill = installation.skill;
      return {
        toolName: this.buildMarketplaceSkillToolName(skill.displayName || skill.name || skill.id),
        skill,
        schema: {
          name: this.buildMarketplaceSkillToolName(skill.displayName || skill.name || skill.id),
          description: skill.description || `Execute installed marketplace skill ${skill.displayName || skill.name}`,
          input_schema: skill.inputSchema || {
            type: 'object' as const,
            properties: {
              input: { type: 'string' },
            },
            additionalProperties: true,
          },
        },
      };
    });

    const installedToolMap = new Map(installedToolEntries.map((entry) => [entry.toolName, entry.skill]));

    // P4/P5 Intelligence tools
    const intelligenceTools = [
      {
        name: 'save_memory',
        description: 'Save a fact, preference, or decision that should be remembered for future conversations. Use this when the user expresses a preference, makes a decision, or provides important context.',
        input_schema: {
          type: 'object' as const,
          properties: {
            key: { type: 'string', description: 'A short key identifying the memory (e.g. "preferred_language", "project_name")' },
            value: { type: 'string', description: 'The value/content to remember' },
            scope: { type: 'string', enum: ['session', 'user'], description: 'session = this chat only, user = permanent across all chats' },
          },
          required: ['key', 'value'],
        },
      },
      {
        name: 'create_subtask',
        description: 'Create a sub-task that can be delegated to another agent session or device. Use when a complex task can be broken into parallel work.',
        input_schema: {
          type: 'object' as const,
          properties: {
            title: { type: 'string', description: 'Short title for the subtask' },
            description: { type: 'string', description: 'Detailed description of what the subtask should accomplish' },
            assignedDeviceType: { type: 'string', enum: ['desktop', 'mobile', 'any'], description: 'Which device type should handle this subtask' },
          },
          required: ['title', 'description'],
        },
      },
    ];

    return {
      additionalTools: [
        ...presetTools,
        ...installedToolEntries.map((entry) => entry.schema),
        ...intelligenceTools,
      ],
      onToolCall: async (name: string, args: any) => {
        const preset = AGENT_PRESET_SKILLS.find((skill) => skill.handlerName === name);
        const ctx: ExecutionContext = {
          userId,
          sessionId: undefined,
          metadata: {
            instanceId: instance.id,
            source: 'platform-hosted-chat',
            agentAccountId: permissionProfile?.agentAccountId,
            permissionProfile,
          },
        };

        if (permissionProfile?.deniedToolNames.includes(name)) {
          throw new ForbiddenException(`Tool ${name} is disabled by the bound Agent Account permission profile.`);
        }

        // P6.1: Pre-tool-use hook
        try {
          const preResults = await this.hookService.executeHooks({
            userId,
            sessionId: ctx.sessionId || '',
            eventType: HookEventType.PRE_TOOL_USE,
            toolName: name,
            toolArgs: args,
          });
          if (this.hookService.hasBlockingResult(preResults)) {
            return { blocked: true, reason: 'Blocked by pre-tool-use hook' };
          }
          const mods = this.hookService.getMergedModifications(preResults);
          if (mods) Object.assign(args, mods);
        } catch (err: any) {
          this.logger.warn(`Pre-tool hook error: ${err.message}`);
        }

        // P4/P5 Intelligence tool handlers
        if (name === 'save_memory') {
          const { MemoryType, MemoryScope } = await import('../../entities/agent-memory.entity');
          const scope = args.scope === 'user' ? MemoryScope.USER : MemoryScope.SESSION;
          const mem = this.intelligenceService['memoryRepo'].create({
            sessionId: args.sessionId || undefined,
            key: args.key,
            value: { content: args.value },
            type: MemoryType.ENTITY,
            scope,
            metadata: { importance: 0.7 },
          });
          await this.intelligenceService['memoryRepo'].save(mem);
          emitAgentSyncEvent(userId, 'agent:memory_update', '', { action: 'saved', key: args.key });
          return { saved: true, key: args.key, scope: args.scope || 'session' };
        }

        if (name === 'create_subtask') {
          const subtask = await this.intelligenceService.createSubtask(
            args.parentSessionId || '',
            userId,
            args.title,
            args.description,
            args.assignedDeviceType,
          );
          emitAgentSyncEvent(userId, 'agent:subtask_update', '', { action: 'created', subtask });
          return { created: true, subtaskId: subtask.id, title: subtask.title };
        }

        if (preset) {
          const result = await this.skillExecutorService.executeInternal(name, args || {}, ctx);
          // P6.1: Post-tool-use hook
          this.hookService.executeHooks({
            userId, sessionId: ctx.sessionId || '', eventType: HookEventType.POST_TOOL_USE,
            toolName: name, toolArgs: args, toolResult: result,
          }).catch(() => {});
          return result;
        }

        const installedSkill = installedToolMap.get(name);
        if (installedSkill) {
          const result = await this.skillExecutorService.execute(installedSkill.id, args || {}, ctx);
          this.hookService.executeHooks({
            userId, sessionId: ctx.sessionId || '', eventType: HookEventType.POST_TOOL_USE,
            toolName: name, toolArgs: args, toolResult: result,
          }).catch(() => {});
          return result;
        }

        // P6.3: MCP server tool execution
        if (name.startsWith('mcp_')) {
          try {
            const mcpTools = await this.mcpRegistryService.getUserMcpTools(userId);
            const mcpTool = mcpTools.find(t => t.name === name);
            if (mcpTool) {
              // Extract the original tool name (strip the mcp_servername_ prefix)
              const originalName = name.replace(/^mcp_[^_]+_/, '');
              const result = await this.mcpRegistryService.executeToolCall(mcpTool.mcpServerId, originalName, args);
              this.hookService.executeHooks({
                userId, sessionId: ctx.sessionId || '', eventType: HookEventType.POST_TOOL_USE,
                toolName: name, toolArgs: args, toolResult: result,
              }).catch(() => {});
              return result;
            }
          } catch (err: any) {
            return { error: `MCP tool call failed: ${err.message}` };
          }
        }

        return undefined;
      },
    };
  }

  private extractSkillIntentQuery(message: string): string {
    let q = String(message || '')
      .replace(/(?:帮我|请|麻烦|能否|可以|could you|please)/gi, ' ')
      .replace(/(?:在|从)?\s*(?:openclaw|clawhub)\s*(?:hub|市场|marketplace)?/gi, ' ')
      .replace(/(?:install|add|enable|search|find|look for|retrieve|use|browse|list|show|装上|安装|添加|启用|搜索|检索|查找|找一下|找找|浏览|看看|有什么|有哪些)/gi, ' ')
      .replace(/(?:任务市场|资源市场|技能市场|marketplace|market|hub|skill|skills|技能|任务|task|tasks|资源|resource|resources)/gi, ' ')
      .replace(/(?:里的|里面的|里面|中的|中|里|上|一下|一下子)/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (!q || q === 'skill' || q === 'skills' || q === '技能' || q === '任务' || q === '资源') {
      q = String(message || '')
        .replace(/(?:帮我|请|麻烦|能否|可以|could you|please)/gi, ' ')
        .replace(/(?:在|从)?\s*(?:openclaw|clawhub)\s*(?:hub|市场|marketplace)?/gi, ' ')
        .replace(/(?:install|add|enable|search|find|look for|retrieve|use|browse|list|show|装上|安装|添加|启用|搜索|检索|查找|找一下|找找|浏览|看看|有什么|有哪些)/gi, ' ')
        .replace(/(?:skill|skills|技能|任务|task|tasks|资源|resource|resources|市场|marketplace|hub)/gi, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    }
    return q;
  }

  private async tryHandleDirectSkillIntent(
    userId: string,
    instance: OpenClawInstance,
    message: string,
    sessionId?: string,
  ): Promise<{
    sessionId: string;
    reply: { id: string; role: 'assistant'; content: string; createdAt: string };
    toolCalls: any[];
    platformHosted: true;
  } | null> {
    const normalized = String(message || '').toLowerCase();
    const mentionsMarketplace = /(openclaw|clawhub|技能|skill|市场|marketplace|hub|任务|task|resources?|资源)/i.test(message);
    if (!mentionsMarketplace) return null;

    const wantsTaskSearch = /(任务|task|tasks|bounty|悬赏)/i.test(message);
    const wantsResourceSearch = /(资源|resource|resources|商品|服务|service|products?|goods|api|dataset)/i.test(message);
    const wantsSkillSearch = /(技能|skill|skills|plugin|插件|tool|tools|capabilit)/i.test(message)
      || /(openclaw|clawhub|hub)/i.test(message);

    const ctx: ExecutionContext = {
      userId,
      sessionId: sessionId || `platform-${Date.now()}`,
      metadata: { instanceId: instance.id, source: 'platform-hosted-chat' },
    };

    const query = this.extractSkillIntentQuery(message) || message.trim();

    if (/(install|add|enable|装上|安装|添加|启用)/i.test(normalized)) {
      try {
        const installResult = await this.skillExecutorService.executeInternal('skill_install', { query }, ctx);
        return {
          sessionId: ctx.sessionId!,
          reply: {
            id: `assistant-${Date.now()}`,
            role: 'assistant',
            content: installResult?.message || `Skill ${query} installed successfully.`,
            createdAt: new Date().toISOString(),
          },
          toolCalls: [{ name: 'skill_install', input: { query }, output: installResult }],
          platformHosted: true,
        };
      } catch (err: any) {
        this.logger.warn(`Direct skill install intent failed: ${err.message}`);
        return null;
      }
    }

    if (/(search|find|look for|retrieve|搜索|搜一下|搜搜|检索|查找|找一下|找找|浏览|看看|有什么|有哪些|browse|list|show)/i.test(normalized)) {
      try {
        const toolName = wantsTaskSearch
          ? 'task_search'
          : wantsResourceSearch && !wantsSkillSearch
            ? 'resource_search'
            : wantsSkillSearch
              ? 'skill_search'
              : null;

        if (!toolName) {
          return null;
        }

        const searchResult = await this.skillExecutorService.executeInternal(toolName, { query, limit: 10 }, ctx);
        const content = this.formatDirectMarketplaceSearch(toolName, searchResult);
        if (!content) {
          return null;
        }

        return {
          sessionId: ctx.sessionId!,
          reply: {
            id: `assistant-${Date.now()}`,
            role: 'assistant',
            content,
            createdAt: new Date().toISOString(),
          },
          toolCalls: [{ name: toolName, input: { query, limit: 10 }, output: searchResult }],
          platformHosted: true,
        };
      } catch (err: any) {
        this.logger.warn(`Direct skill search intent failed: ${err.message}`);
        return null; // fall through to LLM path
      }
    }

    if (/(execute|run|call|invoke|执行|运行|调用|用一下)/i.test(normalized)) {
      try {
        const executeResult = await this.skillExecutorService.executeInternal('skill_execute', { query }, ctx);
        return {
          sessionId: ctx.sessionId!,
          reply: {
            id: `assistant-${Date.now()}`,
            role: 'assistant',
            content: executeResult?.result?.output || executeResult?.message || `Skill executed successfully.`,
            createdAt: new Date().toISOString(),
          },
          toolCalls: [{ name: 'skill_execute', input: { query }, output: executeResult }],
          platformHosted: true,
        };
      } catch (err: any) {
        return {
          sessionId: ctx.sessionId!,
          reply: {
            id: `assistant-${Date.now()}`,
            role: 'assistant',
            content: `Failed to execute skill "${query}": ${err.message}`,
            createdAt: new Date().toISOString(),
          },
          toolCalls: [],
          platformHosted: true,
        };
      }
    }

    return null;
  }

  /**
   * Parse user message for image attachment URLs and build Claude multimodal content blocks.
   * If images are found, returns an array of content blocks; otherwise returns the plain string.
   */
  private buildUserContent(message: string): string | Array<{ type: string; [k: string]: any }> {
    const imageUrlPattern = /URL:\s*(https?:\/\/\S+\.(?:jpg|jpeg|png|gif|webp)(?:\?\S*)?)/gi;
    const imageUrls: string[] = [];
    let match: RegExpExecArray | null;
    while ((match = imageUrlPattern.exec(message)) !== null) {
      imageUrls.push(match[1]);
    }

    if (imageUrls.length === 0) {
      return message;
    }

    // Build multimodal content blocks — use URL format; the Bedrock service
    // will convert to base64 automatically before calling the API.
    const contentBlocks: Array<{ type: string; [k: string]: any }> = [];
    for (const url of imageUrls) {
      contentBlocks.push({
        type: 'image',
        source: { type: 'url', url },
      });
    }
    contentBlocks.push({ type: 'text', text: message });
    return contentBlocks;
  }

  private async runPlatformHostedChat(
    userId: string,
    instance: OpenClawInstance,
    dto: ChatMessageDto,
    streamingCallbacks?: { onChunk: (text: string) => void },
  ) {
    const _t0 = Date.now();
    const _lap = (label: string) => this.logger.log(`⏱ ${label}: ${Date.now() - _t0}ms`);
    const sessionId = dto.sessionId || `platform-${Date.now()}`;
    const messageText = Array.isArray(dto.message)
      ? dto.message.filter((b: any) => b.type === 'text').map((b: any) => b.text).join('\n')
      : dto.message;
    const session = await this.getOrCreatePlatformHostedSession(userId, instance, sessionId);
    _lap('getOrCreateSession');
    const directSkillIntent = await this.tryHandleDirectSkillIntent(userId, instance, messageText, sessionId);
    _lap('tryHandleDirectSkillIntent');
    if (directSkillIntent) {
      await this.savePlatformHostedMessage(session, userId, MessageRole.USER, messageText, {
        source: 'platform-hosted-chat',
        instanceId: instance.id,
        directSkillIntent: true,
      });
      await this.savePlatformHostedMessage(session, userId, MessageRole.ASSISTANT, directSkillIntent.reply.content, {
        source: 'platform-hosted-chat',
        instanceId: instance.id,
        toolCalls: directSkillIntent.toolCalls,
      });
      return directSkillIntent;
    }

    const [
      { additionalTools, onToolCall },
      permissionProfile,
      defaultConfig,
      persistedHistory,
    ] = await Promise.all([
      this.buildPlatformHostedTools(userId, instance),
      this.resolveRuntimePermissionProfile(userId, instance),
      this.aiProviderService.getDefaultConfig(userId),
      this.getPlatformConversationHistory(userId, instance.id),
    ]);
    _lap(`parallelQueries (tools=${additionalTools.length}, history=${persistedHistory.length})`);

    // Skip tools for simple conversational messages to avoid 4-5s Bedrock tool processing overhead.
    // Tools will still be available for messages that likely need them.
    // 'ask' mode always skips tools; 'agent'/'plan' respect the heuristic.
    const needsTools = dto.mode !== 'ask' && this.messageNeedsTools(messageText);
    const effectiveTools = needsTools ? additionalTools : [];
    const effectiveOnToolCall = needsTools ? onToolCall : undefined;
    if (!needsTools) {
      const reason = dto.mode === 'ask' ? 'ask mode' : 'simple message detected';
      this.logger.log(`⚡ Skipping ${additionalTools.length} tools: ${reason}`);
    }

    // Resolve model & provider FIRST so we can inject identity into system prompt
    const agentAccount = permissionProfile?.agentAccountId
      ? await this.agentAccountRepo.findOne({ where: { id: permissionProfile.agentAccountId } })
      : null;
    let resolvedModel = agentAccount?.preferredModel || dto.model || defaultConfig?.selectedModel || (instance.capabilities as any)?.activeModel || process.env.DEFAULT_MODEL || 'claude-haiku-4-5';
    let resolvedProvider = agentAccount?.preferredProvider || undefined;
    const requestedProvider = this.inferProviderFromModelId(dto.model);
    const modelBoundProvider = this.inferProviderFromModelId(resolvedModel);

    // Explicit chat model selection must win over any stored default provider.
    if (dto.model && requestedProvider) {
      resolvedProvider = requestedProvider === 'platform' ? undefined : requestedProvider;
    } else if (modelBoundProvider) {
      resolvedProvider = modelBoundProvider === 'platform' ? undefined : modelBoundProvider;
    } else if (!resolvedProvider && defaultConfig) {
      resolvedProvider = defaultConfig.providerId;
      if (!agentAccount?.preferredModel && !dto.model) {
        resolvedModel = defaultConfig.selectedModel;
      }
    }

    if (resolvedProvider) {
      resolvedModel = this.normalizeModelForProvider(resolvedModel, resolvedProvider, defaultConfig?.selectedModel);
    }

    // If user has a custom provider config for this provider, extract full credentials
    let userCredentials: { apiKey: string; secretKey?: string; region?: string; baseUrl?: string; providerId: string; model?: string } | undefined;
    if (resolvedProvider) {
      const providerConfig = await this.aiProviderService.getDecryptedKey(userId, resolvedProvider);
      if (providerConfig) {
        // Fill in catalog baseUrl when user didn't configure one (e.g. copilot-subscription, chatgpt-subscription)
        let effectiveBaseUrl = providerConfig.baseUrl;
        if (!effectiveBaseUrl) {
          const catalogEntry = this.aiProviderService.getCatalog().find((p: any) => p.id === resolvedProvider);
          if (typeof catalogEntry?.baseUrl === 'string' && catalogEntry.baseUrl) {
            effectiveBaseUrl = catalogEntry.baseUrl;
            this.logger.debug(`Using catalog baseUrl for ${resolvedProvider}: ${effectiveBaseUrl}`);
          }
        }
        userCredentials = { ...providerConfig, baseUrl: effectiveBaseUrl, providerId: resolvedProvider };
      } else {
        const platformCredentials = this.getPlatformOpenAICompatibleCredentials(resolvedProvider);
        if (platformCredentials) {
          userCredentials = platformCredentials;
        }
      }
    }

    // Resolve a human-friendly model label for the system prompt
    const catalog = this.aiProviderService.getCatalog();
    const resolvedModelLabel = catalog
      .flatMap((p: any) => p.models)
      .find((m: any) => m.id === resolvedModel)?.label || resolvedModel;

    // For simple messages without tools, use minimal history to reduce input tokens
    // (12 history msgs with tool results can add 5000+ tokens → 4s extra latency)
    const effectiveHistory = needsTools
      ? persistedHistory
      : persistedHistory.slice(-4);

    // ── P4: Agent Intelligence ─────────────────────────────────────
    // P4.1 Plan Mode: detect if we're in an active plan or generating one
    const activePlan = this.intelligenceService.getActivePlan(sessionId);
    const planApproval = activePlan?.status === 'awaiting_approval' && /^(approve|ok|go|批准|执行|是的|开始|yes|确认)/i.test(messageText);
    const planRejection = activePlan?.status === 'awaiting_approval' && /^(reject|no|拒绝|修改|取消|不)/i.test(messageText);

    let planModeSystemAddition = '';
    if (planApproval && activePlan) {
      this.intelligenceService.approvePlan(sessionId);
      const step = this.intelligenceService.advancePlan(sessionId);
      if (step) {
        planModeSystemAddition = this.intelligenceService.buildPlanExecutionPrompt(activePlan);
      }
    } else if (planRejection && activePlan) {
      this.intelligenceService.rejectPlan(sessionId, messageText);
      planModeSystemAddition = '\n## Plan Rejected\nThe user rejected or wants changes to the plan. Ask them what they want to modify.\n';
    } else if (!activePlan && this.intelligenceService.detectPlanIntent(messageText)) {
      planModeSystemAddition = this.intelligenceService.getPlanModeSystemPrompt();
    } else if (activePlan?.status === 'executing') {
      // If plan is executing and we get a non-special message, continue execution
      const step = this.intelligenceService.advancePlan(sessionId);
      if (step) {
        planModeSystemAddition = this.intelligenceService.buildPlanExecutionPrompt(activePlan);
      }
    }

    // P4.2 Auto-Memory: load relevant memories into context
    let memoryContext = '';
    try {
      const memories = await this.intelligenceService.getRelevantMemories(
        session.id, userId, agentAccount?.id,
      );
      memoryContext = this.intelligenceService.buildMemoryContext(memories);
    } catch (err: any) {
      this.logger.warn(`Memory load failed: ${err.message}`);
    }

    // P4.3 Compaction: check if history needs compaction
    const historyMessages = this.buildPlatformHistoryMessages(effectiveHistory);
    if (this.intelligenceService.needsCompaction([...historyMessages, { role: 'user', content: messageText }])) {
      this.logger.log(`💾 Conversation needs compaction (session=${sessionId})`);
      const { compacted, result: compactionResult } = await this.intelligenceService.compactHistory(historyMessages);
      historyMessages.splice(0, historyMessages.length, ...compacted as typeof historyMessages);
      // Persist compaction in background
      this.intelligenceService.persistCompaction(session.id, compactionResult.summary).catch(
        (err) => this.logger.warn(`Compaction persist failed: ${err.message}`),
      );
      emitAgentSyncEvent(userId, 'agent:context_usage', sessionId, {
        compacted: true,
        ...compactionResult,
      });
    }

    const messages = [
      {
        role: 'system' as const,
        content: (needsTools
          ? (`You are "${instance.name || 'Agent'}", the user's personal AI agent with marketplace abilities.\n\n` +
          `## Available Tools\n` +
          `- skill_search/skill_install/skill_execute/skill_recommend/skill_publish: Marketplace skill lifecycle\n` +
          `- resource_publish: Publish APIs/datasets/workflows\n` +
          `- search_products/resource_search/create_order: Commerce\n` +
          `- get_balance/asset_overview/x402_pay/quickpay_execute: Payments\n` +
          `- task_search/task_post/task_accept/task_submit: Task marketplace\n` +
          `- agent_discover/agent_invoke: Agent-to-Agent delegation\n\n` +
          `## Rules\n` +
          `1. ALWAYS use tools when asked to search/install/execute/buy/publish skills. Never claim lack of marketplace access.\n` +
          `2. The client renders images (![alt](url)), audio (TTS button), files, and attachments. Never say "text-only" or "unsupported".\n` +
          `3. For image generation: skill_search → skill_install → skill_execute → include URL in reply.\n` +
          `4. Include media URLs in replies for rich rendering. Summarize tool results clearly.\n` +
          `5. Reply in the user's language, stay concise.\n` +
          `6. For balance/funds queries: call get_balance or asset_overview. Never guess.\n` +
          `${permissionProfile
            ? `7. Bound to Agent Account "${permissionProfile.agentAccountName}" (${permissionProfile.agentAccountStatus}). Disabled: ${permissionProfile.deniedToolNames.length > 0 ? permissionProfile.deniedToolNames.join(', ') : 'none'}.`
            : '7. No Agent Account bound.'}\n` +
          `8. Model: ${resolvedModelLabel}. Identify truthfully when asked.\n` +
          `9. Use prior conversation context when relevant.`)
          : (`You are "${instance.name || 'Agent'}", the user's personal AI agent. Reply concisely in the user's language. Model: ${resolvedModelLabel}.`))
          + memoryContext + planModeSystemAddition,
      },
      ...historyMessages,
      { role: 'user' as const, content: Array.isArray(dto.message) ? dto.message : this.buildUserContent(dto.message) },
    ];

    const executionModel = this.resolveExecutionModelId(resolvedModel);
    _lap(`pre-LLM (model=${executionModel}, provider=${resolvedProvider || 'platform'}, msgs=${messages.length})`);

    // ── P6.1 Pre-message hooks ──────────────────────────────────────
    try {
      const preHookResults = await this.hookService.executeHooks({
        userId,
        sessionId,
        eventType: HookEventType.MESSAGE_PRE,
        message: messageText,
        model: executionModel,
      });
      if (this.hookService.hasBlockingResult(preHookResults)) {
        return {
          sessionId,
          reply: {
            id: `assistant-${Date.now()}`,
            role: 'assistant',
            content: 'Message blocked by pre-message hook.',
            createdAt: new Date().toISOString(),
          },
          toolCalls: null,
          platformHosted: true,
        };
      }
    } catch (err: any) {
      this.logger.warn(`Pre-message hook error: ${err.message}`);
    }

    // ── P6.3 MCP Server tools injection ─────────────────────────────
    try {
      const mcpTools = await this.mcpRegistryService.getUserMcpTools(userId);
      if (mcpTools.length > 0 && needsTools) {
        for (const mcpTool of mcpTools) {
          effectiveTools.push({
            name: mcpTool.name,
            description: mcpTool.description,
            input_schema: mcpTool.input_schema,
          });
        }
        this.logger.log(`Injected ${mcpTools.length} MCP server tools`);
      }
    } catch (err: any) {
      this.logger.warn(`MCP tools injection failed: ${err.message}`);
    }

    let result: any;
    if (resolvedProvider === 'gemini') {
      result = await this.geminiIntegrationService.chatWithFunctions(messages as Array<{ role: 'user' | 'assistant' | 'system'; content: string }>, {
        model: executionModel,
        context: { userId, sessionId },
        additionalTools: effectiveTools,
        onToolCall: effectiveOnToolCall,
        userApiKey: userCredentials?.apiKey,
      });
    } else if (this.isOpenAICompatibleProvider(resolvedProvider)) {
      result = await this.openAIIntegrationService.chatWithFunctions(messages, {
        model: executionModel,
        context: { userId, sessionId },
        additionalTools: this.toOpenAITools(effectiveTools),
        onToolCall: effectiveOnToolCall,
        userApiKey: userCredentials?.apiKey,
        userBaseURL: userCredentials?.baseUrl,
      });
    } else {
      result = await this.claudeIntegrationService.chatWithFunctions(messages, {
        model: executionModel,
        context: { userId, sessionId },
        additionalTools: effectiveTools,
        onToolCall: effectiveOnToolCall,
        userCredentials: userCredentials
          ? { ...userCredentials, model: executionModel }
          : undefined,
        onChunk: streamingCallbacks?.onChunk,
      });
    }

    _lap(`LLM done (toolCalls=${result?.toolCalls?.length || 0})`);
    const text = result?.text || '';
    const inputTokens = estimateTokens(messageText);
    const outputTokens = estimateTokens(text);
    this.tokenQuotaService.deductTokens(userId, inputTokens, outputTokens).catch(
      (err) => this.logger.warn(`Token deduct failed: ${err.message}`),
    );

    // ── P4 Post-LLM hooks ──────────────────────────────────────────
    // P4.1 Plan Mode: parse plan from response
    const parsedPlan = this.intelligenceService.parsePlanFromResponse(text);
    if (parsedPlan) {
      this.intelligenceService.setActivePlan(sessionId, parsedPlan);
      emitAgentSyncEvent(userId, 'agent:plan_update', sessionId, parsedPlan);
    }
    // Mark step done if we were executing a plan
    if (activePlan?.status === 'executing') {
      const completedStep = this.intelligenceService.completeStep(sessionId, text.substring(0, 500));
      if (completedStep) {
        emitAgentSyncEvent(userId, 'agent:plan_update', sessionId, this.intelligenceService.getActivePlan(sessionId));
      }
    }

    // P4.2 Auto-Memory: extract memories in background
    this.intelligenceService.extractAndSaveMemories(
      session.id, userId, agentAccount?.id, messageText, text,
    ).catch((err) => this.logger.warn(`Memory extraction failed: ${err.message}`));

    // P4.4 Auto-title session on first message
    if (persistedHistory.length === 0) {
      this.intelligenceService.autoTitleSession(session.id, messageText).catch(
        (err) => this.logger.warn(`Auto-title failed: ${err.message}`),
      );
    }

    // P5.1 Cross-device sync: broadcast chat update
    emitAgentSyncEvent(userId, 'agent:session_update', sessionId, {
      type: 'new_message',
      model: executionModel,
      hasToolCalls: (result?.toolCalls?.length || 0) > 0,
    });

    // ── P6.1 Post-message hooks ─────────────────────────────────────
    this.hookService.executeHooks({
      userId,
      sessionId,
      eventType: HookEventType.MESSAGE_POST,
      message: text,
      model: executionModel,
      metadata: { toolCalls: result?.toolCalls },
    }).catch((err: any) => this.logger.warn(`Post-message hook error: ${err.message}`));

    await this.savePlatformHostedMessage(session, userId, MessageRole.USER, messageText, {
      source: 'platform-hosted-chat',
      instanceId: instance.id,
      model: executionModel,
    });
    await this.savePlatformHostedMessage(session, userId, MessageRole.ASSISTANT, text, {
      source: 'platform-hosted-chat',
      instanceId: instance.id,
      model: executionModel,
      toolCalls: result?.toolCalls || null,
      plan: parsedPlan || undefined,
    });

    return {
      sessionId,
      resolvedModel: executionModel,
      resolvedModelLabel,
      reply: {
        id: `assistant-${Date.now()}`,
        role: 'assistant',
        content: text,
        createdAt: new Date().toISOString(),
      },
      toolCalls: result?.toolCalls || null,
      plan: parsedPlan || this.intelligenceService.getActivePlan(sessionId) || null,
      platformHosted: true,
    };
  }

  private async streamPlatformHostedChat(
    userId: string,
    instance: OpenClawInstance,
    dto: ChatMessageDto,
    res: Response,
  ): Promise<void> {
    if (!res.headersSent) {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no');
      res.flushHeaders();
    }

    try {
      let textBytesStreamed = 0;
      const result = await this.runPlatformHostedChat(userId, instance, dto, {
        onChunk: (chunk) => {
          if (res.writableEnded) return;
          // Track how much actual text (not markers) was streamed
          if (!chunk.startsWith('[Tool Call]') && !chunk.startsWith('[Tool Done]')) {
            textBytesStreamed += chunk.length;
          }
          res.write(`data: ${JSON.stringify({ chunk })}\n\n`);
          if ((res as any).flush) (res as any).flush();
        },
      });

      // Send model meta after call completes
      const resultAny = result as any;
      if (resultAny?.resolvedModel && !res.writableEnded) {
        res.write(`data: ${JSON.stringify({ meta: { resolvedModel: resultAny.resolvedModel, resolvedModelLabel: resultAny.resolvedModelLabel } })}\n\n`);
        if ((res as any).flush) (res as any).flush();
      }

      // If LLM text wasn't fully streamed (streaming failed or non-streaming provider),
      // emit the full text now. This covers: Gemini, OpenAI, Bedrock streaming fallback,
      // and tool-call paths where [Tool Call] markers were sent but the 2nd LLM response wasn't.
      const fullText = result.reply?.content || '';
      if (fullText && textBytesStreamed < fullText.length * 0.5 && !res.writableEnded) {
        const fallbackChunks = fullText.match(/.{1,80}/gs) || [fullText];
        for (const c of fallbackChunks) {
          if (res.writableEnded) break;
          res.write(`data: ${JSON.stringify({ chunk: c })}\n\n`);
          if ((res as any).flush) (res as any).flush();
        }
      }

      if (!res.writableEnded) {
        res.write('data: [DONE]\n\n');
      }
    } catch (err: any) {
      this.logger.error(`Platform-hosted stream error: ${err.message}`);
      if (!res.writableEnded) {
        res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`);
      }
    } finally {
      if (!res.writableEnded) res.end();
    }
  }

  private async streamPlatformHostedChatToCallbacks(
    userId: string,
    instance: OpenClawInstance,
    dto: ChatMessageDto,
    callbacks: ChatStreamCallbacks,
  ): Promise<void> {
    this.logger.debug(`streamPlatformHostedChatToCallbacks start: instance=${instance.id} session=${dto.sessionId || ''}`);
    const result = await this.runPlatformHostedChat(userId, instance, dto, {
      onChunk: (chunk) => {
        if (callbacks.signal?.aborted) return;
        this.logger.debug(`streamPlatformHostedChatToCallbacks chunk: instance=${instance.id} chunk=${chunk.slice(0, 80)}`);
        callbacks.onChunk(chunk);
      },
    });
    const resultAny = result as any;

    if (resultAny.resolvedModel && callbacks.onMeta) {
      await callbacks.onMeta({
        resolvedModel: resultAny.resolvedModel,
        resolvedModelLabel: resultAny.resolvedModelLabel,
      });
    }

    if (!callbacks.signal?.aborted) {
      this.logger.debug(`streamPlatformHostedChatToCallbacks done: instance=${instance.id}`);
      await callbacks.onDone?.();
    }
  }

  private async consumeUpstreamSseChunk(
    payload: string,
    callbacks: ChatStreamCallbacks,
  ): Promise<boolean> {
    const trimmed = payload.trim();
    if (!trimmed) {
      return false;
    }

    if (trimmed === '[DONE]') {
      await callbacks.onDone?.();
      return true;
    }

    try {
      const parsed = JSON.parse(trimmed);
      if (parsed?.meta && callbacks.onMeta) {
        await callbacks.onMeta(parsed.meta);
      }
      if (typeof parsed?.chunk === 'string' && parsed.chunk.length > 0) {
        await callbacks.onChunk(parsed.chunk);
      }
      if (parsed?.error) {
        throw new BadGatewayException(parsed.error);
      }
      return false;
    } catch (error) {
      if (error instanceof BadGatewayException) {
        throw error;
      }

      await callbacks.onChunk(trimmed);
      return false;
    }
  }

  async streamChatToCallbacks(
    userId: string,
    instanceId: string,
    dto: ChatMessageDto,
    callbacks: ChatStreamCallbacks,
  ): Promise<void> {
    const instance = await this.ensureOwnedInstance(userId, instanceId);
    this.logger.debug(`streamChatToCallbacks resolved instance ${instance.id} platformHosted=${this.isPlatformHosted(instance)}`);
    if (this.isPlatformHosted(instance)) {
      return this.streamPlatformHostedChatToCallbacks(userId, instance, dto, callbacks);
    }

    const resolvedInstance = await this.resolveInstance(userId, instanceId);
    const url = `${resolvedInstance.instanceUrl}/api/chat/stream`;
    const upstreamResp = await fetch(url, {
      method: 'POST',
      headers: { ...this.buildHeaders(resolvedInstance), Accept: 'text/event-stream' },
      body: JSON.stringify({
        message: dto.message,
        sessionId: dto.sessionId,
        model: dto.model || (resolvedInstance.capabilities as any)?.activeModel || process.env.DEFAULT_MODEL || 'claude-haiku-4-5',
      }),
      signal: callbacks.signal || AbortSignal.timeout(180_000),
    });

    if (!upstreamResp.ok || !upstreamResp.body) {
      const text = await upstreamResp.text().catch(() => 'Instance stream unavailable');
      throw new BadGatewayException(text || 'Instance stream unavailable');
    }

    const reader = upstreamResp.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let streamDone = false;

    while (!streamDone) {
      if (callbacks.signal?.aborted) {
        try { await reader.cancel(); } catch {}
        return;
      }

      const { done, value } = await reader.read();
      if (done) {
        break;
      }

      buffer += decoder.decode(value, { stream: true });

      let boundary = buffer.indexOf('\n\n');
      while (boundary >= 0) {
        const rawEvent = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);
        const dataLines = rawEvent
          .split('\n')
          .filter((line) => line.startsWith('data:'))
          .map((line) => line.slice(5).trimStart());

        if (dataLines.length > 0) {
          streamDone = await this.consumeUpstreamSseChunk(dataLines.join('\n'), callbacks);
        }

        if (streamDone || callbacks.signal?.aborted) {
          try { await reader.cancel(); } catch {}
          return;
        }

        boundary = buffer.indexOf('\n\n');
      }
    }

    if (!callbacks.signal?.aborted) {
      await callbacks.onDone?.();
    }
  }

  private buildHeaders(instance: OpenClawInstance): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    };
    if (instance.instanceToken) {
      headers['Authorization'] = `Bearer ${instance.instanceToken}`;
    }
    return headers;
  }

  /** Proxy a chat message to the instance and return full JSON response */
  async sendChat(userId: string, instanceId: string, dto: ChatMessageDto) {
    // Check quota before forwarding (throws ForbiddenException if exhausted)
    await this.tokenQuotaService.getOrCreateCurrentQuota(userId);

    const instance = await this.ensureOwnedInstance(userId, instanceId);
    if (this.isPlatformHosted(instance)) {
      return this.runPlatformHostedChat(userId, instance, dto);
    }

    const resolvedInstance = await this.resolveInstance(userId, instanceId);
    const url = `${resolvedInstance.instanceUrl}/api/chat`;

    try {
      const resp = await fetch(url, {
        method: 'POST',
        headers: this.buildHeaders(resolvedInstance),
        body: JSON.stringify({
          message: dto.message,
          sessionId: dto.sessionId,
          context: dto.context,
          model: dto.model || (resolvedInstance.capabilities as any)?.activeModel || process.env.DEFAULT_MODEL || 'claude-haiku-4-5',
        }),
        signal: AbortSignal.timeout(30_000),
      });

      if (!resp.ok) {
        const text = await resp.text().catch(() => '');
        throw new BadGatewayException(`Instance returned ${resp.status}: ${text}`);
      }

      const result = await resp.json();

      // Deduct tokens (estimate = prompt + response text length / 4)
      const msgText = Array.isArray(dto.message)
        ? dto.message.filter((b: any) => b.type === 'text').map((b: any) => b.text).join('\n')
        : dto.message;
      const inputTokens = estimateTokens(msgText);
      const outputTokens = estimateTokens(
        typeof result?.reply === 'string' ? result.reply :
        typeof result?.message === 'string' ? result.message : '',
      );
      this.tokenQuotaService.deductTokens(userId, inputTokens, outputTokens).catch(
        err => this.logger.warn(`Token deduct failed: ${err.message}`),
      );

      return result;
    } catch (err: any) {
      if (err instanceof BadGatewayException || err instanceof ForbiddenException) throw err;
      this.logger.error(`Proxy chat error for instance ${instanceId}: ${err.message}`);
      throw new BadGatewayException(`Failed to reach OpenClaw instance: ${err.message}`);
    }
  }

  /** Stream a chat response back via Server-Sent Events (SSE) */
  async streamChat(
    userId: string,
    instanceId: string,
    dto: ChatMessageDto,
    res: Response,
  ): Promise<void> {
    const instance = await this.ensureOwnedInstance(userId, instanceId);
    if (this.isPlatformHosted(instance)) {
      return this.streamPlatformHostedChat(userId, instance, dto, res);
    }

    const resolvedInstance = await this.resolveInstance(userId, instanceId);
    const url = `${resolvedInstance.instanceUrl}/api/chat/stream`;

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    try {
      const upstreamResp = await fetch(url, {
        method: 'POST',
        headers: { ...this.buildHeaders(resolvedInstance), Accept: 'text/event-stream' },
        body: JSON.stringify({
          message: dto.message,
          sessionId: dto.sessionId,
          model: dto.model || (resolvedInstance.capabilities as any)?.activeModel || process.env.DEFAULT_MODEL || 'claude-haiku-4-5',
        }),
        signal: AbortSignal.timeout(60_000),
      });

      if (!upstreamResp.ok || !upstreamResp.body) {
        res.write(`data: ${JSON.stringify({ error: 'Instance stream unavailable' })}\n\n`);
        res.end();
        return;
      }

      const reader = upstreamResp.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        res.write(chunk);
        if ((res as any).flush) (res as any).flush();
      }
    } catch (err: any) {
      this.logger.error(`Proxy stream error: ${err.message}`);
      if (!res.writableEnded) {
        res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`);
      }
    } finally {
      if (!res.writableEnded) res.end();
    }
  }

  /** Get chat history from the instance */
  async getChatHistory(userId: string, instanceId: string, sessionId?: string) {
    const instance = await this.ensureOwnedInstance(userId, instanceId);
    if (this.isPlatformHosted(instance)) {
      return this.getPlatformHostedHistoryPayload(userId, instance.id, sessionId);
    }
    if (instance.status !== OpenClawInstanceStatus.ACTIVE) {
      throw new BadGatewayException(`Instance "${instance.name}" is not active (status: ${instance.status})`);
    }
    if (!instance.instanceUrl) {
      throw new BadGatewayException('Instance has no URL configured');
    }
    const url = sessionId
      ? `${instance.instanceUrl}/api/sessions/${sessionId}/history`
      : `${instance.instanceUrl}/api/sessions`;

    try {
      const resp = await fetch(url, {
        headers: this.buildHeaders(instance),
        signal: AbortSignal.timeout(10_000),
      });
      if (!resp.ok) return [];
      return resp.json();
    } catch {
      return [];
    }
  }

  /** Get installed skills from the instance */
  async getInstanceSkills(userId: string, instanceId: string) {
    const instance = await this.ensureOwnedInstance(userId, instanceId);
    if (this.isPlatformHosted(instance)) {
      const installations = await this.skillService.findEffectiveInstalledSkillsForInstance(instanceId, userId);
      return installations
        .filter((installation: any) => !!installation?.skill)
        .map((installation: any) => ({
          id: installation.skill.id,
          name: installation.skill.displayName || installation.skill.name,
          enabled: installation.isEnabled,
          version: installation.skill.version || '1.0.0',
          description: installation.skill.description,
          installedAt: installation.installedAt,
          source: 'marketplace',
          platformHosted: true,
        }));
    }

    const resolvedInstance = await this.resolveInstance(userId, instanceId);
    try {
      const resp = await fetch(`${resolvedInstance.instanceUrl}/api/skills`, {
        headers: this.buildHeaders(resolvedInstance),
        signal: AbortSignal.timeout(10_000),
      });
      if (!resp.ok) return [];
      return resp.json();
    } catch {
      return [];
    }
  }

  /** Toggle a skill on/off */
  async toggleSkill(userId: string, instanceId: string, skillId: string, enabled: boolean) {
    const instance = await this.ensureOwnedInstance(userId, instanceId);
    if (this.isPlatformHosted(instance)) {
      const isInstalledOnInstance = await this.skillService.isSkillInstalledForInstance(instanceId, skillId);
      if (isInstalledOnInstance) {
        await this.skillService.updateInstanceInstalledSkill(instanceId, skillId, { isEnabled: enabled });
      } else {
        await this.skillService.updateInstalledSkill(userId, skillId, { isEnabled: enabled });
      }
      return { success: true, platformHosted: true, enabled };
    }

    const resolvedInstance = await this.resolveInstance(userId, instanceId);
    try {
      const resp = await fetch(`${resolvedInstance.instanceUrl}/api/skills/${skillId}/toggle`, {
        method: 'POST',
        headers: this.buildHeaders(resolvedInstance),
        body: JSON.stringify({ enabled }),
        signal: AbortSignal.timeout(10_000),
      });
      return { success: resp.ok };
    } catch {
      return { success: false };
    }
  }

  /** Push-install a skill package to the instance */
  async installSkill(userId: string, instanceId: string, skillPackageUrl: string, skillId: string) {
    const instance = await this.connectionService.getInstanceById(userId, instanceId);

    if (this.isPlatformHosted(instance)) {
      try {
        await this.skillService.installSkillForInstance(instanceId, skillId, userId);
      } catch (error: any) {
        if (!String(error?.message || '').includes('already installed')) {
          throw error;
        }
      }

      return {
        success: true,
        status: 200,
        pendingDeploy: false,
        platformHosted: true,
        skillActive: true,
        message: `Skill is now active on "${instance.name}" and available in chat immediately.`,
      };
    }

    // Allow install even if instance is not fully connected yet
    // The install record is created in /skills/{id}/install (step 1).
    // Step 2: push to instance via HTTP (cloud) or WebSocket relay (local).
    if (!instance.instanceUrl) {
      // No HTTP URL — try relay (local agents connect via WebSocket)
      if (instance.relayConnected) {
        try {
          RelayRegistry.emitToAgent(instanceId, {
            type: 'install-skill',
            skillId,
            packageUrl: skillPackageUrl,
          });
          return {
            success: true,
            status: 200,
            message: 'Skill install sent to your local agent via relay.',
            pendingDeploy: false,
          };
        } catch (err: any) {
          this.logger.warn(`Relay install to ${instanceId} failed: ${err.message}`);
        }
      }
      return {
        success: true,
        status: 200,
        message: 'Skill saved to your account. It will sync when your agent reconnects.',
        pendingDeploy: true,
      };
    }
    if (instance.status !== OpenClawInstanceStatus.ACTIVE) {
      return {
        success: true,
        status: 200,
        message: `Skill saved. Agent "${instance.name}" will sync when active.`,
        pendingDeploy: true,
      };
    }

    try {
      const resp = await fetch(`${instance.instanceUrl}/api/skills/install`, {
        method: 'POST',
        headers: this.buildHeaders(instance),
        body: JSON.stringify({ packageUrl: skillPackageUrl, skillId }),
        signal: AbortSignal.timeout(30_000),
      });
      return { success: resp.ok, status: resp.status };
    } catch (err: any) {
      // Instance unreachable — try relay fallback if connected
      this.logger.warn(`Skill push to instance ${instanceId} failed: ${err.message}`);
      if (instance.relayConnected) {
        try {
          RelayRegistry.emitToAgent(instanceId, {
            type: 'install-skill',
            skillId,
            packageUrl: skillPackageUrl,
          });
          return { success: true, status: 200, message: 'Skill install sent via relay.' };
        } catch (_) {}
      }
      return {
        success: true,
        status: 200,
        message: 'Skill saved. Push to agent failed — it will sync when agent reconnects.',
        pendingDeploy: true,
      };
    }
  }

  /** Restart the instance process */
  async restartInstance(userId: string, instanceId: string) {
    const instance = await this.resolveInstance(userId, instanceId);
    try {
      const resp = await fetch(`${instance.instanceUrl}/api/admin/restart`, {
        method: 'POST',
        headers: this.buildHeaders(instance),
        signal: AbortSignal.timeout(10_000),
      });
      return { success: resp.ok };
    } catch {
      return { success: false };
    }
  }

  /** Proxy GET /status from the instance */
  async getInstanceStatus(userId: string, instanceId: string) {
    const instance = await this.ensureOwnedInstance(userId, instanceId);
    if (this.isPlatformHosted(instance)) {
      return {
        online: true,
        status: 200,
        platformHosted: true,
        model: (instance.capabilities as any)?.activeModel || process.env.DEFAULT_MODEL || 'claude-haiku-4-5',
      };
    }

    const resolvedInstance = await this.resolveInstance(userId, instanceId);
    try {
      const resp = await fetch(`${resolvedInstance.instanceUrl}/api/health`, {
        headers: this.buildHeaders(resolvedInstance),
        signal: AbortSignal.timeout(5_000),
      });
      const data = resp.ok ? await resp.json().catch(() => ({})) : {};
      return { online: resp.ok, status: resp.status, ...data };
    } catch {
      return { online: false };
    }
  }

  // ═══════════════════════════════════════════════════════════
  // Platform Tools — Execute Agentrix platform skills through the claw proxy
  // ═══════════════════════════════════════════════════════════

  /**
   * Get available platform tools for this claw instance.
   * Returns preset skills + any user-installed skills as tool definitions.
   */
  async getAvailablePlatformTools(userId: string, instanceId: string) {
    // Validate ownership
    const instance = await this.ensureOwnedInstance(userId, instanceId);

    // Preset skills available to all claws
    const presets = AGENT_PRESET_SKILLS.map((s) => ({
      name: s.handlerName,
      displayName: s.displayName,
      description: s.description,
      category: s.category,
      enabledByDefault: s.enabledByDefault,
      icon: s.icon,
      type: 'platform' as const,
    }));

    const installations = await this.skillService.findEffectiveInstalledSkillsForInstance(instance.id, userId);
    const installedTools = installations
      .filter((installation: any) => !!installation?.skill)
      .map((installation: any) => ({
        name: this.buildMarketplaceSkillToolName(installation.skill.displayName || installation.skill.name || installation.skill.id),
        displayName: installation.skill.displayName || installation.skill.name,
        description: installation.skill.description,
        category: installation.skill.category,
        enabledByDefault: installation.isEnabled,
        icon: '⚡',
        type: 'installed-skill' as const,
        skillId: installation.skill.id,
      }));

    return {
      tools: [...presets, ...installedTools],
      total: presets.length + installedTools.length,
      defaultEnabled: getDefaultEnabledSkills().map((s) => s.handlerName),
    };
  }

  /**
   * Execute a platform tool on behalf of the claw.
   * The claw (OpenClaw instance) or mobile app can call this to execute
   * Agentrix platform capabilities (skill search, install, purchase, publish, etc.)
   */
  async executePlatformTool(
    userId: string,
    instanceId: string,
    toolName: string,
    params: Record<string, any>,
  ) {
    // Validate instance ownership
    await this.ensureOwnedInstance(userId, instanceId);

    // Validate tool name exists as a registered handler
    const presetNames = AGENT_PRESET_SKILLS.map((s) => s.handlerName);
    if (!presetNames.includes(toolName)) {
      throw new BadRequestException(
        `Unknown platform tool: "${toolName}". Available: ${presetNames.join(', ')}`,
      );
    }

    const context: ExecutionContext = {
      userId,
      sessionId: params._sessionId,
      metadata: { instanceId, source: 'openclaw-proxy' },
    };

    const startTime = Date.now();

    try {
      const result = await this.skillExecutorService.executeInternal(toolName, params, context);
      return {
        success: true,
        tool: toolName,
        result,
        executionTime: Date.now() - startTime,
      };
    } catch (err: any) {
      this.logger.error(`Platform tool "${toolName}" execution failed: ${err.message}`);
      return {
        success: false,
        tool: toolName,
        error: err.message,
        executionTime: Date.now() - startTime,
      };
    }
  }

  /**
   * Batch-execute multiple platform tools (for agent autonomous workflows).
   */
  async executePlatformToolBatch(
    userId: string,
    instanceId: string,
    calls: Array<{ tool: string; params: Record<string, any> }>,
  ) {
    await this.ensureOwnedInstance(userId, instanceId);

    const results = [];
    for (const call of calls) {
      try {
        const result = await this.executePlatformTool(userId, instanceId, call.tool, call.params);
        results.push(result);
      } catch (err: any) {
        results.push({ success: false, tool: call.tool, error: err.message });
      }
    }

    return {
      results,
      total: calls.length,
      succeeded: results.filter((r) => r.success).length,
      failed: results.filter((r) => !r.success).length,
    };
  }
}
