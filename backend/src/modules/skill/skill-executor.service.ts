/**
 * Skill Executor Service
 * 
 * 执行 Skill 的统一入口
 */

import { Injectable, Logger, BadRequestException, ForbiddenException, Inject, forwardRef } from '@nestjs/common';
import { Skill, SkillPricingType, SkillLayer, SkillOriginalPlatform, SkillResourceType, SkillValueType } from '../../entities/skill.entity';
import { TaskType } from '../../entities/merchant-task.entity';
import { SkillService } from './skill.service';
import { MCPServerProxyService } from './mcp-server-proxy.service';
import { ClaudeIntegrationService } from '../ai-integration/claude/claude-integration.service';
import { X402AuthorizationService } from '../payment/x402-authorization.service';
import { AgentPaymentService } from '../payment/agent-payment.service';
import { ProductService } from '../product/product.service';
import { WalletService } from '../wallet/wallet.service';
import { AirdropService } from '../auto-earn/airdrop.service';
import { AgentAuthorizationService } from '../agent-authorization/agent-authorization.service';
import { AgentMarketplaceService } from '../marketplace/agent-marketplace.service';
import { UnifiedMarketplaceService } from '../unified-marketplace/unified-marketplace.service';
import { A2AService } from '../a2a/a2a.service';
import { SkillRecommendationService } from './skill-recommendation.service';
import { MerchantTaskService } from '../merchant-task/merchant-task.service';
import { TaskMarketplaceService } from '../merchant-task/task-marketplace.service';
import { SkillCategory, SkillStatus } from '../../entities/skill.entity';
import { OpenClawBridgeService } from '../openclaw-bridge/openclaw-bridge.service';
import { OpenClawSkillHubService } from '../openclaw-bridge/openclaw-skill-hub.service';
import { VideoGenerationService } from '../video-generation/video-generation.service';
import axios from 'axios';

export interface ExecutionContext {
  userId?: string;
  sessionId?: string;
  apiKey?: string;
  platform?: string;
  metadata?: Record<string, any>;
}

export interface ExecutionResult {
  success: boolean;
  data?: any;
  error?: string;
  executionTime?: number;
  skillId?: string;
  skillName?: string;
  billingInfo?: {
    amount: number;
    currency: string;
    paymentId: string;
  };
}

@Injectable()
export class SkillExecutorService {
  private readonly logger = new Logger(SkillExecutorService.name);

  // 内部处理器注册表
  private readonly internalHandlers: Map<string, (params: any, context: ExecutionContext) => Promise<any>> = new Map();

  constructor(
    private readonly skillService: SkillService,
    private readonly mcpProxyService: MCPServerProxyService,
    private readonly x402AuthService: X402AuthorizationService,
    private readonly agentPaymentService: AgentPaymentService,
    @Inject(forwardRef(() => ProductService))
    private readonly productService: ProductService,
    private readonly walletService: WalletService,
    private readonly airdropService: AirdropService,
    private readonly agentAuthorizationService: AgentAuthorizationService,
    private readonly agentMarketplaceService: AgentMarketplaceService,
    private readonly unifiedMarketplaceService: UnifiedMarketplaceService,
    @Inject(forwardRef(() => A2AService))
    private readonly a2aService: A2AService,
    private readonly skillRecommendationService: SkillRecommendationService,
    @Inject(forwardRef(() => MerchantTaskService))
    private readonly merchantTaskService: MerchantTaskService,
    @Inject(forwardRef(() => TaskMarketplaceService))
    private readonly taskMarketplaceService: TaskMarketplaceService,
    @Inject(forwardRef(() => ClaudeIntegrationService))
    private readonly claudeIntegrationService: ClaudeIntegrationService,
    private readonly openClawBridgeService: OpenClawBridgeService,
    private readonly openClawSkillHubService: OpenClawSkillHubService,
    private readonly videoGenerationService: VideoGenerationService,
  ) {
    this.registerDefaultHandlers();
  }

  /**
   * 执行 Skill
   */
  async execute(skillId: string, params: any, context: ExecutionContext = {}): Promise<ExecutionResult> {
    const startTime = Date.now();

    try {
      const skill = await this.skillService.findById(skillId);

      // 1. 处理计费
      let billingInfo = null;
      if (skill.pricing && skill.pricing.type === SkillPricingType.PER_CALL && skill.pricing.pricePerCall > 0) {
        if (!context.userId) {
          throw new BadRequestException('Billing required for this skill but no userId provided');
        }

        // 检查 X402 授权
        const auth = await this.x402AuthService.checkAuthorization(context.userId);
        if (!auth) {
          throw new ForbiddenException('X402 Authorization required for paid skills. Please authorize in settings.');
        }

        if (skill.pricing.pricePerCall > auth.singleLimit) {
          throw new ForbiddenException(`Skill price (${skill.pricing.pricePerCall}) exceeds single transaction limit (${auth.singleLimit})`);
        }

        // 记录支付 (代付模式)
        const payment = await this.agentPaymentService.createAgentPayment({
          agentId: 'x402_system',
          userId: context.userId,
          amount: skill.pricing.pricePerCall,
          currency: skill.pricing.currency || 'USD',
          merchantId: skill.authorId || 'system',
          description: `Skill Execution: ${skill.name}`,
          repaymentMethod: 'system'
        });

        // 立即确认 (原子结算模拟)
        await this.agentPaymentService.confirmAgentPayment(payment.id, 'x402_system', `X402-EXEC-${Date.now()}`);
        
        // 记录使用量
        await this.x402AuthService.recordUsage(auth.id, skill.pricing.pricePerCall);

        billingInfo = {
          amount: skill.pricing.pricePerCall,
          currency: skill.pricing.currency || 'USD',
          paymentId: payment.id,
        };
      }

      // 2. 验证参数
      this.validateParams(skill, params);

      // 3. 执行
      let result: any;
      if (skill.executor.type === 'http') {
        result = await this.executeHttpSkill(skill, params, context);
      } else if (skill.executor.type === 'internal') {
        result = await this.executeInternalSkill(skill, params, context);
      } else if (skill.executor.type === 'mcp') {
        result = await this.executeMcpSkill(skill, params, context);
      } else {
        throw new BadRequestException(`Unknown executor type: ${skill.executor.type}`);
      }

      // 4. 更新调用计数
      await this.skillService.incrementCallCount(skillId);

      return {
        success: true,
        data: result,
        executionTime: Date.now() - startTime,
        skillId: skill.id,
        skillName: skill.name,
        billingInfo,
      };
    } catch (error: any) {
      this.logger.error(`Skill execution failed: ${skillId}`, error.stack);
      return {
        success: false,
        error: error.message || 'Execution failed',
        executionTime: Date.now() - startTime,
        skillId,
      };
    }
  }

  /**
   * 执行 HTTP Skill
   */
  private async executeHttpSkill(skill: Skill, params: any, context: ExecutionContext): Promise<any> {
    const { endpoint, method = 'POST', headers = {} } = skill.executor;

    if (!endpoint) {
      throw new BadRequestException('HTTP executor requires endpoint');
    }

    const response = await axios({
      method: method.toLowerCase(),
      url: endpoint,
      data: params,
      headers: {
        'Content-Type': 'application/json',
        'X-Agentrix-Context': JSON.stringify(context),
        ...headers,
      },
      timeout: 30000, // 30 秒超时
    });

    return response.data;
  }

  /**
   * 执行内部 Skill
   */
  private async executeInternalSkill(skill: Skill, params: any, context: ExecutionContext): Promise<any> {
    const handlerName = skill.executor.internalHandler;

    if (!handlerName) {
      throw new BadRequestException('Internal executor requires handler name');
    }

    const handler = this.internalHandlers.get(handlerName);
    if (!handler) {
      throw new BadRequestException(`Internal handler not found: ${handlerName}`);
    }

    return handler(params, context);
  }

  /**
   * 执行 MCP Skill
   */
  private async executeMcpSkill(skill: Skill, params: any, context: ExecutionContext): Promise<any> {
    if (
      skill.originalPlatform === SkillOriginalPlatform.OPENCLAW
      && skill.executor.mcpServer === 'openclaw'
    ) {
      return this.executeOpenClawHubSkill(skill, params, context);
    }

    const declaredTools = Array.isArray(skill.metadata?.tools) ? skill.metadata.tools : [];
    const claudeSchema = skill.platformSchemas?.claude as Record<string, any> | undefined;
    const serverName =
      claudeSchema?.server
      || skill.metadata?.serverId
      || skill.executor.mcpServer
      || skill.metadata?.package;

    if (!serverName) {
      throw new BadRequestException('MCP executor requires server name');
    }

    let toolName: string | undefined;
    let toolParams: Record<string, any> = params;

    if (typeof params?.action === 'string' && params.action.trim()) {
      toolName = params.action.trim();
      if (params.params && typeof params.params === 'object' && !Array.isArray(params.params)) {
        toolParams = params.params;
      } else {
        const { action, ...rest } = params;
        toolParams = rest;
      }
    } else if (declaredTools.length === 1 && typeof declaredTools[0]?.name === 'string') {
      toolName = declaredTools[0].name;
      toolParams = params?.params && typeof params.params === 'object' && !Array.isArray(params.params)
        ? params.params
        : params;
    } else if (Array.isArray(claudeSchema?.tools) && claudeSchema.tools.length === 1) {
      toolName = claudeSchema.tools[0];
    } else if (typeof skill.metadata?.toolName === 'string' && skill.metadata.toolName.trim()) {
      toolName = skill.metadata.toolName.trim();
    } else if (skill.executor.internalHandler) {
      toolName = skill.executor.internalHandler;
    } else {
      toolName = skill.name.replace(/^mcp_/, '').replace(/^[^_]+_/, '');
    }

    if (!toolName) {
      throw new BadRequestException('MCP executor requires tool name');
    }

    return this.mcpProxyService.callTool(serverName, toolName, toolParams);
  }

  private async executeOpenClawHubSkill(skill: Skill, params: any, context: ExecutionContext): Promise<any> {
    const slug = String(skill.metadata?.hubSlug || skill.externalSkillId || skill.name || '').trim();
    if (!slug) {
      throw new BadRequestException('OpenClaw Hub skill is missing its slug');
    }

    const version = String(skill.version || '1.0.0');
    const versionUrl = `https://clawhub.ai/api/v1/skills/${encodeURIComponent(slug)}/versions/${encodeURIComponent(version)}`;
    const versionResp = await axios.get(versionUrl, {
      timeout: 15_000,
      headers: { Accept: 'application/json' },
    });

    const files: Array<{ path?: string; size?: number; contentType?: string }> =
      versionResp.data?.version?.files || [];

    const promptFiles = files
      .filter((file) => typeof file.path === 'string')
      .filter((file) => /\.(md|txt)$/i.test(file.path!))
      .slice(0, 5);

    if (promptFiles.length === 0) {
      throw new BadRequestException(`OpenClaw Hub skill ${slug} has no prompt files to execute`);
    }

    const fileSections = await Promise.all(promptFiles.map(async (file) => {
      const fileUrl = `https://clawhub.ai/api/v1/skills/${encodeURIComponent(slug)}/file?path=${encodeURIComponent(file.path!)}&version=${encodeURIComponent(version)}`;
      const resp = await axios.get(fileUrl, {
        timeout: 15_000,
        responseType: 'text',
        headers: { Accept: 'text/plain, text/markdown, application/json' },
      });
      return `# FILE: ${file.path}\n\n${String(resp.data || '').trim()}`;
    }));

    const promptInput =
      params?.prompt
      || params?.input
      || params?.query
      || params?.message
      || params?.idea
      || (typeof params === 'string' ? params : '');

    if (!promptInput) {
      throw new BadRequestException('OpenClaw Hub skill requires a prompt-like input');
    }

    const systemPrompt = [
      `You are executing the OpenClaw/ClawHub skill "${skill.displayName || skill.name}" (slug: ${slug}, version: ${version}).`,
      'Follow the skill files below as the authoritative runtime instructions.',
      'Return only the skill output for the user request. Do not mention internal files unless the skill itself requires it.',
      ...fileSections,
    ].join('\n\n');

    const commandName = fileSections
      .map((section) => section.match(/\/([a-z][a-z0-9_-]*)\s+(?:"|<|'|`)/i)?.[1])
      .find(Boolean);

    const executionInput = commandName
      ? `Execute the skill command /${commandName} with the following input:\n${String(promptInput)}`
      : `Execute this skill with the following input:\n${String(promptInput)}`;

    let result = await this.claudeIntegrationService.chatWithFunctions(
      [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: executionInput },
      ],
      {
        context: { userId: context.userId, sessionId: context.sessionId },
      },
    );

    if (!result?.text?.trim()) {
      result = await this.claudeIntegrationService.chatWithFunctions(
        [
          {
            role: 'system',
            content: `${systemPrompt}\n\nProduce the concrete final output this skill should return for the user's input. Do not leave the response blank.`,
          },
          { role: 'user', content: executionInput },
        ],
        {
          context: { userId: context.userId, sessionId: context.sessionId },
        },
      );
    }

    return {
      success: true,
      output: result?.text || '',
      slug,
      version,
      files: promptFiles.map((file) => file.path),
      executionMode: 'clawhub-prompt-runtime',
    };
  }

  /**
   * 注册内部处理器
   */
  registerHandler(name: string, handler: (params: any, context: ExecutionContext) => Promise<any>): void {
    this.internalHandlers.set(name, handler);
    this.logger.log(`Registered internal handler: ${name}`);
  }

  /**
   * Execute an internal handler by name (public API for proxy/platform tool calls).
   * Used by OpenClaw proxy to execute platform tools on behalf of claw instances.
   */
  async executeInternal(handlerName: string, params: any, context: ExecutionContext): Promise<any> {
    const handler = this.internalHandlers.get(handlerName);
    if (!handler) {
      throw new BadRequestException(`Internal handler not found: ${handlerName}`);
    }
    return handler(params, context);
  }

  /**
   * Get all registered internal handler names.
   */
  getRegisteredHandlerNames(): string[] {
    return Array.from(this.internalHandlers.keys());
  }

  /**
   * 验证参数
   */
  private validateParams(skill: Skill, params: any): void {
    const { required = [] } = skill.inputSchema;

    for (const field of required) {
      if (params[field] === undefined || params[field] === null) {
        throw new BadRequestException(`Missing required parameter: ${field}`);
      }
    }
  }

  /**
   * 注册默认处理器
   */
  private registerDefaultHandlers(): void {
    const normalizeSkillName = (name: string) =>
      String(name || '')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9\u4e00-\u9fa5\s_-]/g, '')
        .replace(/\s+/g, '_')
        .slice(0, 100);

    const normalizeResourceType = (input?: string): SkillResourceType => {
      const value = String(input || '').trim().toLowerCase();
      if (value === 'physical' || value === '实物') return SkillResourceType.PHYSICAL;
      if (value === 'service' || value === '服务') return SkillResourceType.SERVICE;
      if (value === 'data' || value === '数据') return SkillResourceType.DATA;
      if (value === 'logic' || value === '代码' || value === '脚本') return SkillResourceType.LOGIC;
      return SkillResourceType.DIGITAL;
    };

    const normalizeValueType = (input?: string): SkillValueType | undefined => {
      const value = String(input || '').trim().toLowerCase();
      if (!value) return undefined;
      if (value === 'action' || value === '交易' || value === '执行') return SkillValueType.ACTION;
      if (value === 'deliverable' || value === '交付') return SkillValueType.DELIVERABLE;
      if (value === 'decision' || value === '决策') return SkillValueType.DECISION;
      if (value === 'data' || value === '数据') return SkillValueType.DATA;
      return undefined;
    };

    const normalizeTaskType = (input?: string): TaskType => {
      const value = String(input || '').trim().toLowerCase();
      switch (value) {
        case 'consultation':
        case 'consult':
        case 'advisory':
          return TaskType.CONSULTATION;
        case 'design':
        case 'ui':
        case 'ux':
          return TaskType.DESIGN;
        case 'development':
        case 'dev':
        case 'code':
        case 'coding':
          return TaskType.DEVELOPMENT;
        case 'content':
        case 'copywriting':
        case 'writing':
        case 'translation':
          return TaskType.CONTENT;
        case 'custom_service':
        case 'custom':
        case 'service':
          return TaskType.CUSTOM_SERVICE;
        default:
          return TaskType.OTHER;
      }
    };

    const publishMarketplaceItem = async (
      params: any,
      context: ExecutionContext,
      defaults?: { layer?: SkillLayer; resourceType?: SkillResourceType },
    ) => {
      const { name, displayName, description, category, inputSchema, executor, pricing } = params;
      if (!context.userId) throw new ForbiddenException('User context required to publish marketplace items');
      if (!name || !description) throw new BadRequestException('name and description are required');

      const layer = defaults?.layer || (params.layer as SkillLayer) || SkillLayer.LOGIC;
      const isResource = layer === SkillLayer.RESOURCE;
      const resourceType = isResource
        ? (defaults?.resourceType || normalizeResourceType(params.resourceType || params.type))
        : undefined;

      const skill = await this.skillService.create({
        name: normalizeSkillName(name),
        displayName: displayName || name,
        description,
        category: (category as SkillCategory) || (isResource ? SkillCategory.COMMERCE : SkillCategory.UTILITY),
        layer,
        resourceType,
        valueType: normalizeValueType(params.valueType),
        source: params.source,
        status: SkillStatus.PUBLISHED,
        inputSchema: inputSchema || { type: 'object', properties: {}, required: [] },
        outputSchema: params.outputSchema || { type: 'object', properties: { result: { type: 'string' } } },
        executor: executor || { type: 'http', endpoint: params.endpoint || '' },
        pricing: pricing || {
          type: params.price && Number(params.price) > 0 ? SkillPricingType.PER_CALL : SkillPricingType.FREE,
          pricePerCall: params.price ? Number(params.price) : 0,
          currency: params.currency || 'USD',
        },
        version: params.version || '1.0.0',
        tags: params.tags || [],
        humanAccessible: params.humanAccessible ?? true,
        metadata: {
          ...(params.metadata || {}),
          sourceCommand: params.sourceCommand,
          publishType: isResource ? 'resource' : 'skill',
        },
        imageUrl: params.imageUrl,
        thumbnailUrl: params.thumbnailUrl,
      }, context.userId);

      return {
        success: true,
        itemId: skill.id,
        skillId: skill.id,
        name: skill.name,
        displayName: skill.displayName,
        layer: skill.layer,
        resourceType: skill.resourceType,
        message: `${isResource ? 'Resource' : 'Skill'} "${skill.displayName}" published to marketplace`,
        marketplaceUrl: `${process.env.FRONTEND_URL || 'https://www.agentrix.top'}/skill/${skill.id}`,
      };
    };

    const resolveMarketplaceSkill = async (
      params: any,
      options?: { preferLayer?: SkillLayer; resourceOnly?: boolean },
    ): Promise<{ id: string; name?: string; source?: string } | null> => {
      const directId = params.skillId || params.itemId || params.listingId || params.id;
      if (directId) {
        return { id: String(directId) };
      }

      const query = String(params.query || params.name || params.title || '').trim();
      if (!query) {
        return null;
      }

      const requestedLayer = options?.resourceOnly
        ? SkillLayer.RESOURCE
        : options?.preferLayer;

      try {
        const unified = await this.unifiedMarketplaceService.search({
          query,
          page: 1,
          limit: Number(params.limit || 5),
          layer: requestedLayer ? [requestedLayer] : undefined,
        });
        const first = unified.items?.[0];
        if (first?.id) {
          return {
            id: String(first.id),
            name: first.displayName || first.name,
            source: first.originalPlatform || first.source,
          };
        }
      } catch (err: any) {
        this.logger.warn(`Unified marketplace resolve failed for "${query}": ${err.message}`);
      }

      if (!options?.resourceOnly) {
        try {
          const marketplace = await this.skillService.findMarketplace(1, Number(params.limit || 5), params.category, query);
          const first = marketplace.items?.[0];
          if (first?.id) {
            return {
              id: String(first.id),
              name: first.displayName || first.name,
              source: first.originalPlatform || first.source,
            };
          }
        } catch (err: any) {
          this.logger.warn(`Native marketplace resolve failed for "${query}": ${err.message}`);
        }
      }

      if (!options?.resourceOnly) {
        try {
          const hubResult = await this.openClawSkillHubService.getSkills({
            query,
            limit: Number(params.limit || 5),
          });
          const first = hubResult.items?.[0];
          if (first?.id) {
            return {
              id: String(first.id),
              name: first.displayName || first.name,
              source: 'openclaw_hub',
            };
          }
        } catch (err: any) {
          this.logger.warn(`OpenClaw hub resolve failed for "${query}": ${err.message}`);
        }
      }

      if (options?.resourceOnly) {
        try {
          const productSearch = await this.internalHandlers.get('search_products')?.(
            {
              query,
              category: params.category,
              resourceType: params.resourceType || params.type,
              limit: Number(params.limit || 5),
            },
            {} as ExecutionContext,
          );
          const first = productSearch?.products?.[0];
          if (first?.skillId || first?.id) {
            return {
              id: String(first.skillId || first.id),
              name: first.name,
              source: 'resource_search',
            };
          }
        } catch (err: any) {
          this.logger.warn(`Resource search resolve failed for "${query}": ${err.message}`);
        }
      }

      return null;
    };

    // ============ 电商类 Handlers ============
    
    // 搜索商品 - 搜索统一市场（RESOURCE + Hub fallback）
    this.registerHandler('search_products', async (params, context) => {
      try {
        const requestedType = params.resourceType || params.type;
        const limit = params.limit || 20;
        // 1. 搜索 RESOURCE 层（商品/资源）
        const searchResult = await this.unifiedMarketplaceService.search({
          query: params.query,
          layer: [SkillLayer.RESOURCE],
          resourceType: requestedType ? [normalizeResourceType(requestedType)] : undefined,
          category: params.category ? [params.category as SkillCategory] : undefined,
          page: 1,
          limit,
        });

        let allItems: any[] = searchResult.items || [];

        // 2. Fallback: if RESOURCE returns few results, also search Hub skills
        if (allItems.length < 3) {
          try {
            const hub = await this.openClawSkillHubService.getSkills({
              query: params.query,
              category: params.category,
              limit,
              page: 1,
              sortBy: 'downloads',
              sortOrder: 'DESC',
            });
            const hubItems = (hub.items || []).map(h => ({
              ...h,
              _isHub: true,
            }));
            allItems = [...allItems, ...hubItems];
          } catch (e: any) {
            this.logger.warn(`search_products hub fallback failed: ${e.message}`);
          }
        }
        
        const formattedProducts = allItems.slice(0, limit).map(skill => ({
          id: skill.id || skill.hubSlug,
          name: skill.displayName || skill.name,
          description: skill.description,
          price: skill.pricing?.pricePerCall || 0,
          currency: skill.pricing?.currency || 'USD',
          type: skill._isHub ? 'skill' : (skill.resourceType || 'service'),
          category: skill.category,
          stock: 999,
          image: skill.imageUrl || skill.thumbnailUrl,
          checkoutUrl: `${process.env.FRONTEND_URL || 'https://www.agentrix.top'}/pay/checkout?skillId=${skill.id}`,
          skillId: skill.id || skill.hubSlug,
          source: skill._isHub ? 'openclaw_hub' : (skill.originalPlatform || 'native'),
        }));
        
        return {
          products: formattedProducts,
          total: formattedProducts.length,
          message: formattedProducts.length > 0 
            ? `Found ${formattedProducts.length} products matching "${params.query}"`
            : `No products found for "${params.query}". Try browsing the marketplace.`
        };
      } catch (error) {
        console.error('search_products error:', error);
        return {
          products: [],
          total: 0,
          message: `Search failed: ${error.message}`
        };
      }
    });

    this.registerHandler('resource_search', async (params, context) => {
      return this.internalHandlers.get('search_products')?.(params, context);
    });

    // 创建订单 - 真实实现
    this.registerHandler('create_order', async (params, context) => {
      const product = await this.productService.getProduct(params.productId);
      const quantity = params.quantity || 1;
      const totalPrice = Number(product.price) * quantity;
      
      return {
        success: true,
        product: {
          id: product.id,
          name: product.name,
          price: product.price,
          currency: product.metadata?.currency || 'CNY'
        },
        quantity: quantity,
        totalPrice: totalPrice,
        checkoutUrl: `https://agentrix.top/pay/checkout?productId=${product.id}&quantity=${quantity}`,
        message: `Order created for ${quantity}x ${product.name}. Total: ${totalPrice} ${product.metadata?.currency || 'CNY'}.`
      };
    });

    // 查询余额 - 真实实现
    this.registerHandler('get_balance', async (params, context) => {
      const userId = params.userId || context.userId;
      if (!userId) {
        return { error: 'userId is required', balance: 0, currency: 'USDT' };
      }
      const balance = await this.walletService.getWalletBalance(userId, params.chain);
      return balance;
    });

    // ============ 资产类 Handlers ============
    
    // 资产总览
    this.registerHandler('asset_overview', async (params, context) => {
      const userId = params.userId || context.userId;
      if (!userId) {
        return { error: 'userId is required' };
      }
      
      // 获取钱包余额
      const walletBalance = await this.walletService.getWalletBalance(userId, 'all');
      
      // 获取 X402 授权状态
      let x402Status = null;
      try {
        x402Status = await this.x402AuthService.checkAuthorization(userId);
      } catch (e) {
        // 用户可能没有 X402 授权
      }
      
      return {
        success: true,
        userId,
        wallet: walletBalance,
        x402Authorization: x402Status ? {
          enabled: true,
          dailyLimit: x402Status.dailyLimit,
          singleLimit: x402Status.singleLimit,
          usedToday: x402Status.usedToday,
          remaining: x402Status.dailyLimit - x402Status.usedToday,
        } : { enabled: false },
        message: '资产总览获取成功'
      };
    });

    // ============ 空投类 Handlers ============
    
    // 空投发现
    this.registerHandler('airdrop_discover', async (params, context) => {
      const userId = params.userId || context.userId;
      if (!userId) {
        return { error: 'userId is required', airdrops: [] };
      }
      const airdrops = await this.airdropService.discoverAirdrops(userId);
      return {
        success: true,
        airdrops,
        total: airdrops.length,
        message: airdrops.length > 0 
          ? `发现 ${airdrops.length} 个可领取的空投`
          : '暂无可领取的空投'
      };
    });

    // 空投领取
    this.registerHandler('airdrop_claim', async (params, context) => {
      const userId = params.userId || context.userId;
      if (!userId) {
        return { error: 'userId is required' };
      }
      if (!params.airdropId) {
        return { error: 'airdropId is required' };
      }
      
      try {
        const result = await this.airdropService.claimAirdrop(userId, params.airdropId);
        return {
          success: true,
          ...result,
          message: '空投领取成功'
        };
      } catch (error: any) {
        return {
          success: false,
          error: error.message,
          message: '空投领取失败'
        };
      }
    });

    // ============ 授权类 Handlers ============
    
    // 撤销授权
    this.registerHandler('agent_revoke', async (params, context) => {
      const userId = params.userId || context.userId;
      if (!userId) {
        return { error: 'userId is required' };
      }
      if (!params.authorizationId) {
        return { error: 'authorizationId is required' };
      }
      
      try {
        await this.agentAuthorizationService.revokeAuthorization(params.authorizationId);
        return {
          success: true,
          message: '授权已成功撤销'
        };
      } catch (error: any) {
        return {
          success: false,
          error: error.message,
          message: '撤销授权失败'
        };
      }
    });

    // 获取授权列表
    this.registerHandler('agent_authorizations', async (params, context) => {
      const userId = params.userId || context.userId;
      if (!userId) {
        return { error: 'userId is required', authorizations: [] };
      }
      
      const authorizations = await this.agentAuthorizationService.getAuthorizationsByUserId(userId);
      return {
        success: true,
        authorizations,
        total: authorizations.length,
        message: `找到 ${authorizations.length} 个授权记录`
      };
    });

    // ============ 工具类 Handlers ============
    
    // Echo 测试处理器
    this.registerHandler('echo', async (params, context) => {
      return {
        echo: params,
        context: {
          userId: context.userId,
          platform: context.platform,
        },
        timestamp: new Date().toISOString(),
      };
    });

    // ============ Core Platform Skills (Strategic Plan Section 4) ============

    // 发现可用 Agent
    this.registerHandler('agent_discover', async (params, context) => {
      const results = await this.agentMarketplaceService.searchAgents({
        keyword: params.query,
        category: params.category,
        page: params.page || 1,
        pageSize: params.limit || 10
      });
      return {
        success: true,
        ...results,
        message: `Found ${results.total} agents matching your request.`
      };
    });

    // 调用/委托任务给 Agent (Real A2A message passing)
    this.registerHandler('agent_invoke', async (params, context) => {
      this.logger.log(`Invoking agent ${params.agentId} with task: ${params.task}`);

      const task = await this.a2aService.createTask({
        requesterAgentId: params.requesterAgentId || context.metadata?.agentId || 'system',
        targetAgentId: params.agentId,
        requesterUserId: context.userId,
        title: params.task || params.title || 'A2A Task',
        description: params.description || params.task || '',
        taskType: params.taskType,
        params: params.params,
        priority: params.priority,
        maxPrice: params.maxPrice ? String(params.maxPrice) : undefined,
        currency: params.currency,
        paymentMethod: params.paymentMethod,
        mandateId: params.mandateId,
        budgetPoolId: params.budgetPoolId,
        skillId: params.skillId,
        deadline: params.deadline,
        callback: params.callback,
        parentTaskId: params.parentTaskId,
        metadata: params.metadata,
      });

      return {
        success: true,
        message: `Task delegated to agent ${params.agentId}`,
        taskId: task.id,
        jobId: task.id,
        status: task.status,
        createdAt: task.createdAt,
      };
    });

    this.registerHandler('agent_delegate', async (params, context) => {
      return this.internalHandlers.get('agent_invoke')(params, context);
    });

    // 充值/法币入金 (Transak)
    this.registerHandler('onramp_fiat', async (params, context) => {
      const { fiatAmount, fiatCurrency = 'USD', cryptoCurrency = 'USDC' } = params;
      const walletAddress = params.walletAddress || context.metadata?.walletAddress;
      
      const transakUrl = `https://global.transak.com/?apiKey=${process.env.TRANSAK_API_KEY || 'demo'}&fiatAmount=${fiatAmount}&fiatCurrency=${fiatCurrency}&cryptoCurrencyCode=${cryptoCurrency}&walletAddress=${walletAddress || ''}&network=bsc`;
      
      return {
        success: true,
        checkoutUrl: transakUrl,
        message: `Checkout URL generated for ${fiatAmount} ${fiatCurrency}`
      };
    });

    // X402 协议支付
    this.registerHandler('x402_pay', async (params, context) => {
      const userId = params.userId || context.userId;
      if (!userId) {
        throw new BadRequestException('userId is required');
      }

      // 这里直接调用支付服务的 A2A 支付逻辑
      const payment = await this.agentPaymentService.createAgentPayment({
        agentId: params.agentId || 'direct_pay',
        userId: userId,
        amount: params.amount,
        currency: params.currency || 'USDC',
        merchantId: params.merchantId || 'system',
        description: params.description || 'X402 Protocol Payment',
        repaymentMethod: 'system'
      });

      return {
        success: true,
        paymentId: payment.id,
        status: payment.status,
        message: `X402 payment created successfully`
      };
    });

    // 计算分账金额
    this.registerHandler('commission_calculate', async (params, context) => {
      const { amount, feeRate = 0.05 } = params;
      const commission = Number(amount) * Number(feeRate);
      return {
        success: true,
        originalAmount: amount,
        feeRate,
        commission,
        netAmount: Number(amount) - commission
      };
    });

    // 执行分账 (Placeholder)
    this.registerHandler('commission_distribute', async (params, context) => {
      this.logger.log(`Distributing commission for payment: ${params.paymentId}`);
      return {
        success: true,
        paymentId: params.paymentId,
        distributed: true,
        timestamp: new Date().toISOString()
      };
    });

    // QuickPay 快捷支付 (基于 X402)
    this.registerHandler('quickpay_execute', async (params, context) => {
      // 实际上就是一种简化的 x402_pay 调用
      return this.internalHandlers.get('x402_pay')(params, context);
    });

    // ────────────────────────────────────────────────────────
    // P1: Agent 自主 Skill 管理
    // ────────────────────────────────────────────────────────

    /**
     * skill_search — Agent searches the marketplace + ClawHub for skills
     * Params: { query: string, category?: string, limit?: number }
     */
    this.registerHandler('skill_search', async (params, context) => {
      const query = params.query || params.name || params.title || '';
      const { category, limit = 25 } = params;
      if (!query) throw new BadRequestException('query is required for skill_search');

      // 1. Search local published skills
      const marketplace = await this.skillService.findMarketplace(1, limit, category, query);

      // 2. Also search unified marketplace (includes ClawHub bridge)
      let unifiedItems: any[] = [];
      try {
        const unified = await this.unifiedMarketplaceService.search({
          query,
          category: category as any,
          limit,
          page: 1,
        });
        unifiedItems = unified.items || [];
      } catch (e) {
        this.logger.warn(`Unified marketplace search failed: ${e.message}`);
      }

      let hubItems: any[] = [];
      let sourceTotals = {
        localMarketplace: marketplace.total || marketplace.items?.length || 0,
        unifiedMarketplace: unifiedItems.length,
        openClawHub: 0,
      };
      try {
        const hub = await this.openClawSkillHubService.getSkills({
          query,
          category,
          limit,
          page: 1,
          sortBy: 'downloads',
          sortOrder: 'DESC',
        });
        hubItems = hub.items || [];
        sourceTotals = {
          ...sourceTotals,
          openClawHub: hubItems.length,
        };
      } catch (e: any) {
        this.logger.warn(`OpenClaw hub search failed: ${e.message}`);
      }

      // Merge and deduplicate by id
      const seen = new Set<string>();
      const results: any[] = [];
      for (const skill of [...(marketplace.items || []), ...unifiedItems, ...hubItems]) {
        const id = skill.id || skill.skillId || skill.hubSlug || skill.key;
        if (id && !seen.has(id)) {
          seen.add(id);
          const isHub = skill.hubSlug || skill.source === 'openclaw_hub' || skill.originalPlatform === 'openclaw';
          results.push({
            id,
            name: skill.name || skill.displayName,
            description: skill.description?.substring(0, 200),
            category: skill.category,
            rating: skill.rating ?? 0,
            callCount: skill.callCount ?? skill.hubStats?.downloads ?? 0,
            pricing: skill.pricing ?? { type: 'free' },
            source: isHub ? 'openclaw_hub' : (skill.originalPlatform || skill.source || 'native'),
            tags: skill.tags ?? [],
          });
        }
      }

      return {
        query,
        category: category || 'all',
        total: results.length,
        skills: results.slice(0, limit),
        totals: {
          returned: results.length,
          ...sourceTotals,
        },
      };
    });

    /**
     * skill_install — Agent installs a skill for the user
     * Params: { skillId?: string, query?: string, config?: Record<string,any> }
     */
    this.registerHandler('skill_install', async (params, context) => {
      const { config } = params;
      const resolvedSkill = await resolveMarketplaceSkill(params, { preferLayer: SkillLayer.LOGIC });
      const skillId = resolvedSkill?.id;
      if (!skillId) throw new BadRequestException('skillId or query is required for skill_install');
      if (!context.userId) throw new ForbiddenException('User context required to install skills');

      const instanceId = typeof context.metadata?.instanceId === 'string'
        ? context.metadata.instanceId
        : undefined;

      if (instanceId) {
        // Detect hub skills: check source or look up in hub cache
        const isHubSkill = resolvedSkill?.source === 'openclaw_hub'
          || resolvedSkill?.source === 'openclaw'
          || await this.openClawSkillHubService.getSkillById(skillId).then(s => !!s).catch(() => false);

        if (isHubSkill) {
          const installed = await this.openClawBridgeService.installHubSkillToInstance(context.userId, instanceId, skillId);
          return {
            success: true,
            alreadyInstalled: false,
            scope: 'claw',
            instanceId,
            skillId,
            message: installed.message,
            source: 'openclaw_hub',
          };
        }

        const alreadyInstalled = await this.skillService.isSkillInstalledForInstance(instanceId, skillId);
        if (alreadyInstalled) {
          return {
            success: true,
            alreadyInstalled: true,
            scope: 'claw',
            instanceId,
            message: `Skill ${resolvedSkill?.name || skillId} is already installed on this claw`,
          };
        }

        const installed = await this.skillService.installSkillForInstance(instanceId, skillId, context.userId, config);
        return {
          success: true,
          alreadyInstalled: false,
          scope: 'claw',
          instanceId,
          installId: installed.id,
          skillId: installed.skillId,
          message: `Skill ${resolvedSkill?.name || skillId} installed successfully on this claw`,
        };
      }

      // Check if already installed
      const alreadyInstalled = await this.skillService.isSkillInstalled(context.userId, skillId);
      if (alreadyInstalled) {
        return {
          success: true,
          alreadyInstalled: true,
          message: `Skill ${resolvedSkill?.name || skillId} is already installed`,
        };
      }

      const installed = await this.skillService.installSkill(context.userId, skillId, config);
      return {
        success: true,
        alreadyInstalled: false,
        installId: installed.id,
        skillId: installed.skillId,
        message: `Skill ${resolvedSkill?.name || skillId} installed successfully`,
      };
    });

    /**
     * skill_execute — Execute a marketplace skill directly from the claw
     * Params: { skillId?: string, query?: string, input?: Record<string, any> }
     */
    this.registerHandler('skill_execute', async (params, context) => {
      const resolvedSkill = await resolveMarketplaceSkill(params, { preferLayer: SkillLayer.LOGIC });
      const skillId = resolvedSkill?.id;
      if (!skillId) throw new BadRequestException('skillId or query is required for skill_execute');

      const execInput = params.input || params.params || {};

      // OpenClaw Hub skills: resolve the DB entity and use the hub execution path
      const isHubSource = resolvedSkill?.source === 'openclaw_hub' || resolvedSkill?.source === 'openclaw';
      if (isHubSource || await this.openClawSkillHubService.getSkillById(skillId).then(s => !!s).catch(() => false)) {
        const hubSkill = await this.openClawSkillHubService.getSkillBySlug(skillId)
          ?? await this.openClawSkillHubService.getSkillById(skillId);
        if (hubSkill?.id) {
          try {
            const dbSkill = await this.skillService.findById(hubSkill.id);
            if (dbSkill) {
              const hubResult = await this.executeOpenClawHubSkill(dbSkill, { ...execInput, prompt: execInput.prompt || execInput.input || params.query }, context);
              return { success: true, skillId, skillName: resolvedSkill?.name, executedAt: new Date().toISOString(), result: hubResult };
            }
          } catch { /* fall through to unified marketplace */ }
        }
      }

      // Native / synced skills: look up by UUID in the unified marketplace
      try {
        const result = await this.unifiedMarketplaceService.executeSkill(skillId, execInput, context.userId);
        return { success: true, skillId, skillName: resolvedSkill?.name, executedAt: new Date().toISOString(), result };
      } catch (err: any) {
        // Fallback: if unified marketplace can't find by ID (e.g. slug passed), try execute() path
        if (String(err?.message).includes('not found')) {
          const result = await this.execute(skillId, execInput, context);
          return { success: true, skillId, skillName: resolvedSkill?.name, executedAt: new Date().toISOString(), result };
        }
        throw err;
      }
    });

    /**
     * skill_recommend — Agent gets personalized skill recommendations
     * Params: { intent?: string, category?: string, limit?: number }
     */
    this.registerHandler('skill_recommend', async (params, context) => {
      const { intent, category, limit = 5 } = params;

      const result = await this.skillRecommendationService.getRecommendations(
        {
          userId: context.userId,
          userIntent: intent,
          preferredCategories: category ? [category] : undefined,
        },
        limit,
      );

      return {
        recommendations: result.recommendations.map((r) => ({
          id: r.skill.id,
          name: r.skill.name || r.skill.displayName,
          description: r.skill.description?.substring(0, 200),
          category: r.skill.category,
          score: r.score,
          reason: r.reason,
          matchType: r.matchType,
          pricing: r.skill.pricing,
        })),
        total: result.recommendations.length,
        generatedAt: result.generatedAt,
      };
    });

    // ────────────────────────────────────────────────────────
    // P2-1: Agent 自主 Marketplace 购买
    // ────────────────────────────────────────────────────────

    /**
     * marketplace_purchase — Agent purchases a skill/product from marketplace
     * Params: { skillId?: string, query?: string, paymentMethod?: 'wallet'|'x402', quantity?: number }
     */
    this.registerHandler('marketplace_purchase', async (params, context) => {
      const { paymentMethod = 'wallet', quantity = 1, autoInstall = true } = params;
      const resolvedSkill = await resolveMarketplaceSkill(params, {
        preferLayer: params.resourceType || params.type ? SkillLayer.RESOURCE : undefined,
        resourceOnly: !!(params.resourceType || params.type),
      });
      const skillId = resolvedSkill?.id;
      if (!skillId) throw new BadRequestException('skillId or query is required for marketplace_purchase');
      if (!context.userId) throw new ForbiddenException('User context required for purchases');

      // 1. Find the skill/product
      let skill: Skill | null;
      try {
        skill = await this.skillService.findOne(skillId);
      } catch {
        skill = null;
      }

      if (!skill) {
        return { success: false, error: `Skill ${skillId} not found in marketplace` };
      }

      // 2. Check if free — install logic skills, confirm purchase for resource goods
      if (!skill.pricing || skill.pricing.type === SkillPricingType.FREE) {
        const instanceId = typeof context.metadata?.instanceId === 'string'
          ? context.metadata.instanceId
          : undefined;

        if (skill.layer === SkillLayer.RESOURCE) {
          return {
            success: true,
            message: `Free resource "${skill.displayName || skill.name}" is ready to use`,
            cost: 0,
            skillId,
            layer: skill.layer,
            resourceType: skill.resourceType,
          };
        }

        if (instanceId && autoInstall !== false) {
          const isHubSkill = resolvedSkill?.source === 'openclaw_hub' || resolvedSkill?.source === 'openclaw'
            || await this.openClawSkillHubService.getSkillById(skillId).then(s => !!s).catch(() => false);
          if (isHubSkill) {
            const installed = await this.openClawBridgeService.installHubSkillToInstance(context.userId, instanceId, skillId);
            return {
              success: true,
              message: installed.message,
              cost: 0,
              scope: 'claw',
              instanceId,
              source: 'openclaw_hub',
            };
          }

          const alreadyInstalled = await this.skillService.isSkillInstalledForInstance(instanceId, skillId);
          if (alreadyInstalled) {
            return {
              success: true,
              message: 'Skill is free and already installed on this claw',
              cost: 0,
              scope: 'claw',
              instanceId,
            };
          }

          const installed = await this.skillService.installSkillForInstance(instanceId, skillId, context.userId);
          return {
            success: true,
            message: `Free skill "${skill.displayName || skill.name}" installed successfully on this claw`,
            installId: installed.id,
            cost: 0,
            scope: 'claw',
            instanceId,
          };
        }

        const alreadyInstalled = await this.skillService.isSkillInstalled(context.userId, skillId);
        if (alreadyInstalled) {
          return { success: true, message: 'Skill is free and already installed', cost: 0 };
        }
        const installed = await this.skillService.installSkill(context.userId, skillId);
        return {
          success: true,
          message: `Free skill "${skill.displayName || skill.name}" installed successfully`,
          installId: installed.id,
          cost: 0,
        };
      }

      // 3. Paid skill — check balance
      const price = (skill.pricing.pricePerCall || 0) * quantity;
      const currency = skill.pricing.currency || 'USDC';

      try {
        const balanceResult = await this.walletService.getWalletBalance(context.userId);
        const available = Number(balanceResult?.balance || 0);

        if (available < price) {
          return {
            success: false,
            error: `Insufficient balance. Required: ${price} ${currency}, Available: ${available} ${currency}`,
            required: price,
            available,
            currency,
          };
        }
      } catch {
        // If wallet check fails, proceed with payment attempt
      }

      // 4. For paid skills, create a payment intent and return checkout info
      // Actual on-chain payment happens client-side; we prepare the intent here
      try {
        const checkoutUrl = `${process.env.FRONTEND_URL || 'https://www.agentrix.top'}/pay/checkout?skillId=${encodeURIComponent(skillId)}&quantity=${quantity}&method=${encodeURIComponent(String(paymentMethod))}`;
        return {
          success: true,
          requiresPayment: true,
          message: `Skill "${skill.displayName || skill.name}" costs ${price} ${currency}. Complete checkout to install.`,
          skillId,
          skillName: skill.displayName || skill.name,
          layer: skill.layer,
          resourceType: skill.resourceType,
          cost: price,
          currency,
          checkoutUrl,
          paymentMethod,
        };
      } catch (err: any) {
        return { success: false, error: `Purchase setup failed: ${err.message}`, cost: price, currency };
      }
    });

    // ────────────────────────────────────────────────────────
    // P2-2: Agent 自主发布 Skill
    // ────────────────────────────────────────────────────────

    /**
     * skill_publish — Agent publishes a new skill to the marketplace
     * Params: { name, displayName, description, category, inputSchema, executor, pricing? }
     */
    this.registerHandler('skill_publish', async (params, context) => {
      try {
        return await publishMarketplaceItem(params, context, { layer: SkillLayer.LOGIC });
      } catch (err: any) {
        return { success: false, error: `Failed to publish skill: ${err.message}` };
      }
    });

    /**
     * resource_publish — Agent publishes a resource/goods listing to marketplace
     * Params: { name, description, price?, currency?, resourceType?, category?, executor? }
     */
    this.registerHandler('resource_publish', async (params, context) => {
      try {
        return await publishMarketplaceItem(params, context, {
          layer: SkillLayer.RESOURCE,
          resourceType: normalizeResourceType(params.resourceType || params.type),
        });
      } catch (err: any) {
        return { success: false, error: `Failed to publish resource: ${err.message}` };
      }
    });

    // ────────────────────────────────────────────────────────
    // P2-3: Agent 自主任务管理 (Post/Accept/Submit)
    // ────────────────────────────────────────────────────────

    /**
     * task_post — Agent posts a task/bounty to the task marketplace
     * Params: { title, description, budget, currency?, type?, deadline?, deliverables? }
     */
    this.registerHandler('task_post', async (params, context) => {
      const { title, description, budget, currency, type, deadline, deliverables } = params;
      if (!context.userId) throw new ForbiddenException('User context required to post tasks');
      if (!title || !description || !budget) {
        throw new BadRequestException('title, description, and budget are required');
      }

      try {
        const task = await this.taskMarketplaceService.publishTask(context.userId, {
          type: normalizeTaskType(type),
          title,
          description,
          budget: Number(budget),
          currency: currency || 'USDC',
          visibility: params.visibility || 'public',
          requirements: {
            deadline: deadline ? new Date(deadline) : undefined,
            deliverables: deliverables || [],
          },
        });

        return {
          success: true,
          taskId: task.id,
          title: task.title,
          status: task.status,
          budget: task.budget,
          message: `Task "${title}" posted to marketplace with budget ${budget} ${currency || 'USDC'}`,
        };
      } catch (err: any) {
        return { success: false, error: `Failed to post task: ${err.message}` };
      }
    });

    /**
     * task_accept — Agent accepts an available task from the marketplace
     * Params: { taskId: string }
     */
    this.registerHandler('task_accept', async (params, context) => {
      const { taskId } = params;
      if (!context.userId) throw new ForbiddenException('User context required to accept tasks');
      if (!taskId) throw new BadRequestException('taskId is required');

      try {
        const task = await this.merchantTaskService.acceptTask(context.userId, taskId);
        return {
          success: true,
          taskId: task.id,
          title: task.title,
          status: task.status,
          message: `Task "${task.title}" accepted`,
        };
      } catch (err: any) {
        return { success: false, error: `Failed to accept task: ${err.message}` };
      }
    });

    /**
     * task_submit — Agent submits deliverables / marks a task as complete
     * Params: { taskId: string, message?: string, attachments?: string[] }
     */
    this.registerHandler('task_submit', async (params, context) => {
      const { taskId, message, attachments } = params;
      if (!context.userId) throw new ForbiddenException('User context required to submit tasks');
      if (!taskId) throw new BadRequestException('taskId is required');

      try {
        // First update progress with deliverable message
        if (message || attachments) {
          await this.merchantTaskService.updateTaskProgress(context.userId, taskId, {
            currentStep: 'submitted',
            message: message || 'Task deliverables submitted',
            attachments,
            percentage: 100,
          });
        }

        // Then mark as completed
        const task = await this.merchantTaskService.completeTask(context.userId, taskId);
        return {
          success: true,
          taskId: task.id,
          title: task.title,
          status: task.status,
          message: `Task "${task.title}" submitted and marked complete`,
        };
      } catch (err: any) {
        return { success: false, error: `Failed to submit task: ${err.message}` };
      }
    });

    /**
     * task_search — Search available tasks on the marketplace
     * Params: { query?: string, type?: string, minBudget?: number, maxBudget?: number, limit?: number }
     */
    this.registerHandler('task_search', async (params, context) => {
      const { query, type, minBudget, maxBudget, limit = 10 } = params;

      try {
        const result = await this.taskMarketplaceService.searchTasks({
          query,
          type: type ? [type] : undefined,
          budgetMin: minBudget ? Number(minBudget) : undefined,
          budgetMax: maxBudget ? Number(maxBudget) : undefined,
          limit,
          page: 1,
        });

        return {
          tasks: result.items?.map((t: any) => ({
            id: t.id,
            title: t.title,
            description: t.description?.substring(0, 200),
            budget: t.budget,
            currency: t.currency,
            type: t.type,
            status: t.status,
            deadline: t.requirements?.deadline,
          })) || [],
          total: result.total || 0,
          query: query || 'all',
        };
      } catch (err: any) {
        return { tasks: [], total: 0, error: `Task search failed: ${err.message}` };
      }
    });

    // ────────────────────────────────────────────────────────
    // Web Search & Fetch Tools
    // ────────────────────────────────────────────────────────

    /**
     * web_search — Search the web for real-time information
     * Uses Tavily API (if TAVILY_API_KEY set) or DuckDuckGo HTML as fallback
     */
    this.registerHandler('web_search', async (params, _context) => {
      const { query, limit = 5 } = params;
      if (!query) throw new BadRequestException('query is required for web_search');

      const tavilyKey = process.env.TAVILY_API_KEY;
      if (tavilyKey) {
        try {
          const resp = await axios.post('https://api.tavily.com/search', {
            api_key: tavilyKey,
            query,
            max_results: Math.min(Number(limit), 10),
            include_answer: true,
            search_depth: 'basic',
          }, { timeout: 15000 });
          return {
            success: true,
            answer: resp.data.answer || null,
            results: (resp.data.results || []).map((r: any) => ({
              title: r.title,
              url: r.url,
              snippet: r.content?.substring(0, 500),
            })),
            query,
            source: 'tavily',
          };
        } catch (err: any) {
          this.logger.warn(`Tavily search failed, falling back to DuckDuckGo: ${err.message}`);
        }
      }

      // Fallback: DuckDuckGo HTML Lite
      try {
        const resp = await axios.get('https://html.duckduckgo.com/html/', {
          params: { q: query },
          headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Agentrix/1.0)' },
          timeout: 10000,
        });
        const html = resp.data as string;
        const results: { title: string; url: string; snippet: string }[] = [];
        const resultRegex = /<a[^>]+class="result__a"[^>]+href="([^"]*)"[^>]*>(.*?)<\/a>[\s\S]*?<a[^>]+class="result__snippet"[^>]*>(.*?)<\/a>/gi;
        let match: RegExpExecArray | null;
        while ((match = resultRegex.exec(html)) !== null && results.length < Math.min(Number(limit), 10)) {
          const url = decodeURIComponent((match[1] || '').replace(/.*uddg=/, '').replace(/&.*/, ''));
          const title = (match[2] || '').replace(/<[^>]*>/g, '').trim();
          const snippet = (match[3] || '').replace(/<[^>]*>/g, '').trim();
          if (url && title) results.push({ title, url, snippet });
        }
        return { success: true, results, query, source: 'duckduckgo' };
      } catch (err: any) {
        return { success: false, results: [], query, error: `Web search failed: ${err.message}` };
      }
    });

    /**
     * web_fetch — Fetch and extract readable text from a URL
     */
    this.registerHandler('web_fetch', async (params, _context) => {
      const { url, maxLength = 8000 } = params;
      if (!url) throw new BadRequestException('url is required for web_fetch');

      // Basic URL validation
      try { new URL(url); } catch { throw new BadRequestException('Invalid URL format'); }

      try {
        const resp = await axios.get(url, {
          timeout: 15000,
          maxContentLength: 2 * 1024 * 1024, // 2MB max
          headers: {
            'User-Agent': 'Mozilla/5.0 (compatible; Agentrix/1.0)',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,text/plain;q=0.8',
          },
          responseType: 'text',
        });

        const contentType = String(resp.headers?.['content-type'] || '');
        let text: string;

        if (contentType.includes('application/json')) {
          text = JSON.stringify(resp.data, null, 2);
        } else if (contentType.includes('text/plain')) {
          text = String(resp.data);
        } else {
          // HTML → extract text
          const html = String(resp.data);
          // Remove script, style, nav, header, footer
          text = html
            .replace(/<script[\s\S]*?<\/script>/gi, '')
            .replace(/<style[\s\S]*?<\/style>/gi, '')
            .replace(/<nav[\s\S]*?<\/nav>/gi, '')
            .replace(/<header[\s\S]*?<\/header>/gi, '')
            .replace(/<footer[\s\S]*?<\/footer>/gi, '')
            .replace(/<[^>]+>/g, ' ')
            .replace(/&nbsp;/g, ' ')
            .replace(/&amp;/g, '&')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&quot;/g, '"')
            .replace(/&#39;/g, "'")
            .replace(/\s+/g, ' ')
            .trim();
        }

        const truncated = text.length > Number(maxLength);
        return {
          success: true,
          url,
          contentType: contentType.split(';')[0].trim(),
          text: text.substring(0, Number(maxLength)),
          truncated,
          originalLength: text.length,
        };
      } catch (err: any) {
        return {
          success: false,
          url,
          error: `Failed to fetch URL: ${err.message}`,
        };
      }
    });

    /**
     * open_url — Return a URL for the client to open in the user's browser
     */
    this.registerHandler('open_url', async (params, _context) => {
      const { url, title } = params;
      if (!url) throw new BadRequestException('url is required for open_url');
      try { new URL(url); } catch { throw new BadRequestException('Invalid URL format'); }
      return {
        success: true,
        action: 'open_url',
        url,
        title: title || url,
        message: `Opening ${title || url} in browser`,
      };
    });

    /**
     * video_generate — Submit or query an asynchronous video generation task
     */
    this.registerHandler('video_generate', async (params, context) => {
      return this.videoGenerationService.executeTool(params || {}, context);
    });

    /**
     * code_eval — Execute JavaScript in a sandboxed VM with timeout
     */
    this.registerHandler('code_eval', async (params, _context) => {
      const { code } = params;
      if (!code) throw new BadRequestException('code is required for code_eval');
      if (typeof code !== 'string' || code.length > 10000) {
        throw new BadRequestException('code must be a string under 10000 characters');
      }

      // Block dangerous patterns
      const forbidden = [
        /\brequire\s*\(/i,
        /\bimport\s+/i,
        /\bprocess\b/i,
        /\bglobal\b/i,
        /\b__dirname\b/i,
        /\b__filename\b/i,
        /\bchild_process\b/i,
        /\bexecSync\b/i,
        /\bspawnSync\b/i,
      ];
      for (const pattern of forbidden) {
        if (pattern.test(code)) {
          return { success: false, error: `Forbidden pattern detected: ${pattern.source}` };
        }
      }

      try {
        const vm = require('vm');
        const sandbox = {
          Math, JSON, Date, Array, Object, String, Number, RegExp,
          parseInt, parseFloat, isNaN, isFinite,
          console: { log: (...args: any[]) => outputs.push(args.map(String).join(' ')) },
        };
        const outputs: string[] = [];
        const context = vm.createContext(sandbox);
        const result = vm.runInContext(code, context, { timeout: 5000 });
        return {
          success: true,
          result: result !== undefined ? String(result) : undefined,
          output: outputs.length > 0 ? outputs.join('\n') : undefined,
          type: typeof result,
        };
      } catch (err: any) {
        return {
          success: false,
          error: err.message,
          name: err.name,
        };
      }
    });
  }
}
