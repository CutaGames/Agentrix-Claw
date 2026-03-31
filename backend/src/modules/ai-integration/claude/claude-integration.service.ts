import { Injectable, Logger, Inject, forwardRef } from '@nestjs/common';
import axios from 'axios';
import { ModuleRef } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Product, ProductStatus } from '../../../entities/product.entity';
import { Order } from '../../../entities/order.entity';
import { CapabilityRegistryService } from '../../ai-capability/services/capability-registry.service';
import { CapabilityExecutorService } from '../../ai-capability/services/capability-executor.service';
import { SearchService } from '../../search/search.service';
import { ProductService } from '../../product/product.service';
import { OrderService } from '../../order/order.service';
import { CartService } from '../../cart/cart.service';
import { LogisticsService } from '../../logistics/logistics.service';
import { PayIntentService } from '../../payment/pay-intent.service';
import { PayIntentType } from '../../../entities/pay-intent.entity';
import { OrderStatus } from '../../../entities/order.entity';
import { ModelRouterService, ModelType } from '../model-router/model-router.service';
import { BedrockIntegrationService, BedrockUserCredentials } from '../bedrock/bedrock-integration.service';
import { OpenAIIntegrationService } from '../openai/openai-integration.service';
import { AiProviderService } from '../../ai-provider/ai-provider.service';

/** Credentials resolved from the user's provider config */
export interface UserProviderCredentials {
  apiKey: string;
  secretKey?: string;
  region?: string;
  baseUrl?: string;
  providerId: string;
  model?: string;
}

// 动态导入 Anthropic SDK（如果已安装）
let Anthropic: any;
try {
  Anthropic = require('@anthropic-ai/sdk');
} catch (e) {
  // SDK 未安装，将在运行时提示
}

/**
 * Claude Function Calling 统一接口
 * 
 * 为 Claude 提供统一的 Function Schema，实现电商流程
 * 支持：
 * 1. 搜索商品 (search_agentrix_products)
 * 2. 加入购物车 (add_to_agentrix_cart)
 * 3. 查看购物车 (view_agentrix_cart)
 * 4. 结算购物车 (checkout_agentrix_cart)
 * 5. 购买商品 (buy_agentrix_product)
 * 6. 查询订单 (get_agentrix_order)
 * 7. 支付订单 (pay_agentrix_order)
 */
@Injectable()
export class ClaudeIntegrationService {
  private readonly logger = new Logger(ClaudeIntegrationService.name);
  private readonly anthropic: any;
  private readonly defaultModel: string; // 向后兼容的默认模型
  private openAIIntegrationService: OpenAIIntegrationService | null | undefined;

  constructor(
    private readonly configService: ConfigService,
    @InjectRepository(Product)
    private productRepository: Repository<Product>,
    @InjectRepository(Order)
    private orderRepository: Repository<Order>,
    private capabilityRegistry: CapabilityRegistryService,
    private capabilityExecutor: CapabilityExecutorService,
    private searchService: SearchService,
    private productService: ProductService,
    @Inject(forwardRef(() => OrderService))
    private orderService: OrderService,
    @Inject(forwardRef(() => CartService))
    private cartService: CartService,
    @Inject(forwardRef(() => LogisticsService))
    private logisticsService: LogisticsService,
    @Inject(forwardRef(() => PayIntentService))
    private payIntentService: PayIntentService,
    private modelRouter: ModelRouterService,
    private bedrockService: BedrockIntegrationService,
    private aiProviderService: AiProviderService,
    private moduleRef: ModuleRef,
  ) {
    // 从环境变量读取模型名称（向后兼容）
    this.defaultModel =
      this.configService.get<string>('ANTHROPIC_MODEL') || 'claude-3-opus';

    const apiKey = this.configService.get<string>('ANTHROPIC_API_KEY');
    if (!apiKey) {
      this.logger.warn(
        'ANTHROPIC_API_KEY not configured, Claude integration will be disabled',
      );
      this.anthropic = null;
    } else if (!Anthropic) {
      this.logger.error(
        '@anthropic-ai/sdk not installed. Please run: npm install @anthropic-ai/sdk',
      );
      this.anthropic = null;
    } else {
      this.anthropic = new Anthropic({ apiKey });
      this.logger.log(`Claude integration initialized with model router enabled`);
    }
  }

  /**
   * 获取 Claude Function Calling 的 Function Schemas
   */
  async getFunctionSchemas(): Promise<any[]> {
    // 1. 获取系统级能力（电商流程等），只返回外部暴露的能力
    const systemSchemas = this.capabilityRegistry.getSystemCapabilitySchemas(
      ['claude'],
      true,
    );

    // 2. 转换为 Claude 格式
    const claudeTools = systemSchemas.map((schema) => {
      // FunctionSchema 可能是 OpenAIFunctionSchema, ClaudeToolSchema 或 GeminiFunctionSchema
      if ('input_schema' in schema) {
        // 已经是 ClaudeToolSchema
        return {
          name: schema.name,
          description: schema.description,
          input_schema: schema.input_schema,
        };
      } else {
        // OpenAIFunctionSchema 或 GeminiFunctionSchema，需要转换
        return {
          name: schema.name,
          description: schema.description,
          input_schema: {
            type: 'object',
            properties: schema.parameters?.properties || {},
            required: schema.parameters?.required || [],
          },
        };
      }
    });

    // 3. 添加基础功能（向后兼容）
    const basicTools = [
      {
        name: 'search_web',
        description: 'Search the web for up-to-date information on any topic. Use this when the user asks about recent events, facts, or anything that requires current information.',
        input_schema: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: 'The search query',
            },
          },
          required: ['query'],
        },
      },
      {
        name: 'search_agentrix_products',
        description: 'Search Agentrix Marketplace for products, goods, and services. Also searches installable AI skills and tools when no products match. Use for any marketplace search query.',
        input_schema: {
          type: 'object',
          properties: {
            query: { type: 'string', description: '搜索查询（必需）' },
            category: { type: 'string', description: '商品分类（可选）' },
            priceMin: { type: 'number', description: '最低价格（可选）' },
            priceMax: { type: 'number', description: '最高价格（可选）' },
            currency: {
              type: 'string',
              description: '货币类型（可选，如 USD、CNY）',
            },
            inStock: {
              type: 'boolean',
              description: '是否仅显示有库存商品（可选）',
            },
          },
          required: ['query'],
        },
      },
      {
        name: 'add_to_agentrix_cart',
        description: '将商品加入购物车',
        input_schema: {
          type: 'object',
          properties: {
            product_id: {
              type: 'string',
              description: '商品ID、商品名称或商品 slug（任选其一）',
            },
            product_name: {
              type: 'string',
              description: '商品名称或 slug（可选，未提供 product_id 时可用）',
            },
            quantity: {
              type: 'number',
              description: '数量（可选，默认：1）',
              minimum: 1,
            },
          },
          required: [],
        },
      },
      {
        name: 'view_agentrix_cart',
        description: '查看当前购物车内容',
        input_schema: {
          type: 'object',
          properties: {},
          required: [],
        },
      },
      {
        name: 'checkout_agentrix_cart',
        description: '结算购物车，创建订单',
        input_schema: {
          type: 'object',
          properties: {},
          required: [],
        },
      },
      {
        name: 'buy_agentrix_product',
        description:
          '购买 Agentrix Marketplace 中的商品。支持实物商品、服务、NFT等。',
        input_schema: {
          type: 'object',
          properties: {
            product_id: {
              type: 'string',
              description: '商品ID、商品名称或商品 slug（任选其一）',
            },
            product_name: {
              type: 'string',
              description: '商品名称或 slug（可选，未提供 product_id 时可用）',
            },
            quantity: {
              type: 'number',
              description: '购买数量（默认：1）',
              minimum: 1,
            },
            shipping_address: {
              type: 'string',
              description: '收货地址（实物商品需要）',
            },
            appointment_time: {
              type: 'string',
              description: '预约时间（服务类商品需要，ISO 8601格式）',
            },
            contact_info: {
              type: 'string',
              description: '联系方式（服务类商品需要）',
            },
            wallet_address: {
              type: 'string',
              description: '接收NFT的钱包地址（NFT类商品需要）',
            },
            chain: {
              type: 'string',
              enum: ['ethereum', 'polygon', 'solana', 'bsc'],
              description: '区块链网络（NFT类商品需要）',
            },
          },
          required: [],
        },
      },
      {
        name: 'get_agentrix_order',
        description: '查询 Agentrix 订单状态和详情',
        input_schema: {
          type: 'object',
          properties: {
            order_id: { type: 'string', description: '订单ID' },
          },
          required: ['order_id'],
        },
      },
      {
        name: 'pay_agentrix_order',
        description: '支付订单',
        input_schema: {
          type: 'object',
          properties: {
            order_id: { type: 'string', description: '订单ID（必需）' },
            payment_method: {
              type: 'string',
              description: '支付方式（可选，如 USDC、SOL、Visa、Apple Pay）',
            },
          },
          required: ['order_id'],
        },
      },
    ];

    // Skill tools — always available so LLM can search/install/execute skills
    // even when called from /api/claude/chat (no additionalTools/preset skills)
    const skillTools = [
      {
        name: 'skill_search',
        description: 'Search for installable AI skills, tools, and plugins across the marketplace and OpenClaw Hub. ALWAYS use this when the user asks about skills, tools, or capabilities.',
        input_schema: {
          type: 'object',
          properties: {
            query: { type: 'string', description: 'Search query — keyword, skill name, or description' },
            category: { type: 'string', description: 'Filter by category (e.g. utility, social, finance, integration)' },
            limit: { type: 'number', description: 'Max results to return (default 10)' },
          },
          required: ['query'],
        },
      },
      {
        name: 'skill_install',
        description: 'Install a skill from the marketplace or OpenClaw Hub for the user. Call skill_search first to find the skill.',
        input_schema: {
          type: 'object',
          properties: {
            query: { type: 'string', description: 'Skill name or search query to find and install' },
            skillId: { type: 'string', description: 'Direct skill ID if known' },
          },
        },
      },
      {
        name: 'skill_execute',
        description: 'Execute an installed or hub skill directly. Call skill_search first if you need to find it.',
        input_schema: {
          type: 'object',
          properties: {
            query: { type: 'string', description: 'Skill name or search query to find and execute' },
            skillId: { type: 'string', description: 'Direct skill ID if known' },
            prompt: { type: 'string', description: 'Natural-language prompt for the skill' },
            input: { type: 'object', description: 'Structured input payload for the skill' },
          },
        },
      },
    ];

    // Task marketplace tools
    const taskTools = [
      {
        name: 'task_search',
        description: 'Search the task marketplace for available tasks, bounties, gigs, and freelance work. Use when user asks about tasks, jobs, or bounties.',
        input_schema: {
          type: 'object',
          properties: {
            query: { type: 'string', description: 'Search keyword for tasks' },
            type: { type: 'string', enum: ['custom_service', 'consultation', 'design', 'development', 'content', 'other'], description: 'Task type filter' },
            minBudget: { type: 'number', description: 'Minimum budget filter' },
            maxBudget: { type: 'number', description: 'Maximum budget filter' },
            limit: { type: 'number', description: 'Max results (default 10)' },
          },
        },
      },
      {
        name: 'task_post',
        description: 'Post a new task or bounty to the task marketplace. Requires title, description, and budget.',
        input_schema: {
          type: 'object',
          properties: {
            title: { type: 'string', description: 'Task title' },
            description: { type: 'string', description: 'Detailed task description' },
            budget: { type: 'number', description: 'Budget amount' },
            currency: { type: 'string', description: 'Currency (default USDC)' },
            type: { type: 'string', enum: ['custom_service', 'consultation', 'design', 'development', 'content', 'other'], description: 'Task type' },
            deadline: { type: 'string', description: 'Deadline (ISO 8601 date)' },
          },
          required: ['title', 'description', 'budget'],
        },
      },
      {
        name: 'task_accept',
        description: 'Accept a task from the task marketplace.',
        input_schema: {
          type: 'object',
          properties: {
            taskId: { type: 'string', description: 'Task ID to accept' },
          },
          required: ['taskId'],
        },
      },
      {
        name: 'task_submit',
        description: 'Submit deliverables for an accepted task to mark it complete.',
        input_schema: {
          type: 'object',
          properties: {
            taskId: { type: 'string', description: 'Task ID' },
            message: { type: 'string', description: 'Submission message or notes' },
          },
          required: ['taskId'],
        },
      },
    ];

    // Publish & marketplace tools
    const publishTools = [
      {
        name: 'skill_publish',
        description: 'Publish a new AI skill to the marketplace. The skill will be listed as a LOGIC-layer skill.',
        input_schema: {
          type: 'object',
          properties: {
            name: { type: 'string', description: 'Skill name (unique identifier)' },
            displayName: { type: 'string', description: 'Display name shown to users' },
            description: { type: 'string', description: 'Detailed skill description' },
            category: { type: 'string', description: 'Category (e.g. utility, finance, social)' },
            tags: { type: 'array', items: { type: 'string' }, description: 'Tags for discovery' },
            price: { type: 'number', description: 'Price (0 for free)' },
          },
          required: ['name', 'description'],
        },
      },
      {
        name: 'resource_publish',
        description: 'Publish a resource, product, API service, or high-value workflow to the marketplace.',
        input_schema: {
          type: 'object',
          properties: {
            name: { type: 'string', description: 'Resource name' },
            description: { type: 'string', description: 'Detailed description' },
            resourceType: { type: 'string', enum: ['api', 'dataset', 'model', 'workflow', 'service', 'product'], description: 'Resource type' },
            price: { type: 'number', description: 'Price' },
            currency: { type: 'string', description: 'Currency (default USDC)' },
            category: { type: 'string', description: 'Category' },
          },
          required: ['name', 'description'],
        },
      },
      {
        name: 'marketplace_purchase',
        description: 'Purchase a skill or resource from the marketplace using wallet balance.',
        input_schema: {
          type: 'object',
          properties: {
            skillId: { type: 'string', description: 'Skill/resource ID to purchase' },
            query: { type: 'string', description: 'Or search by name to find and purchase' },
            paymentMethod: { type: 'string', description: 'Payment method (default USDC)' },
          },
        },
      },
    ];

    // Share tools
    const shareTools = [
      {
        name: 'share_content',
        description: 'Generate a shareable link or poster for a skill, product, task, or any marketplace item. Returns a share URL and optional poster image data.',
        input_schema: {
          type: 'object',
          properties: {
            itemType: { type: 'string', enum: ['skill', 'product', 'task', 'resource'], description: 'Type of item to share' },
            itemId: { type: 'string', description: 'ID of the item to share' },
            title: { type: 'string', description: 'Title for the share card' },
            description: { type: 'string', description: 'Description for the share card' },
            format: { type: 'string', enum: ['link', 'poster', 'both'], description: 'Share format (default: both)' },
          },
          required: ['itemType', 'itemId'],
        },
      },
    ];

    // Wallet & finance tools
    const walletTools = [
      {
        name: 'get_balance',
        description: 'Check the agent wallet balance and available funds across all chains. ALWAYS call this when the user asks about their balance, funds, or wallet.',
        input_schema: {
          type: 'object',
          properties: {
            chain: { type: 'string', description: 'Blockchain network to check (optional, checks all if omitted)' },
            currency: { type: 'string', description: 'Specific token/currency to check (optional)' },
          },
        },
      },
      {
        name: 'asset_overview',
        description: 'Get a comprehensive overview of wallet assets including balances across chains, protocol positions, and portfolio summary.',
        input_schema: {
          type: 'object',
          properties: {
            includeProtocols: { type: 'boolean', description: 'Include DeFi protocol positions (default true)' },
          },
        },
      },
    ];

    // Agent-to-Agent (A2A) tools
    const agentTools = [
      {
        name: 'agent_discover',
        description: 'Discover other agents on the Agentrix network. Search by capability, name, or specialty.',
        input_schema: {
          type: 'object',
          properties: {
            query: { type: 'string', description: 'Search query — capability, agent name, or specialty' },
            capability: { type: 'string', description: 'Filter by specific capability' },
            limit: { type: 'number', description: 'Max results (default 10)' },
          },
        },
      },
      {
        name: 'agent_invoke',
        description: 'Invoke another agent to perform a task via the A2A protocol. Use agent_discover first to find suitable agents.',
        input_schema: {
          type: 'object',
          properties: {
            agentId: { type: 'string', description: 'Target agent ID' },
            task: { type: 'string', description: 'Task description for the agent' },
            input: { type: 'object', description: 'Structured input data for the agent' },
            maxBudget: { type: 'number', description: 'Maximum budget for the task (optional)' },
          },
          required: ['agentId', 'task'],
        },
      },
    ];

    // Advanced commerce tools
    const advancedCommerceTools = [
      {
        name: 'resource_search',
        description: 'Search for resources, APIs, datasets, models, and services on the marketplace.',
        input_schema: {
          type: 'object',
          properties: {
            query: { type: 'string', description: 'Search query' },
            resourceType: { type: 'string', enum: ['api', 'dataset', 'model', 'workflow', 'service', 'product'], description: 'Resource type filter' },
            limit: { type: 'number', description: 'Max results (default 10)' },
          },
          required: ['query'],
        },
      },
      {
        name: 'create_order',
        description: 'Create a new order for a product, service, or resource on the marketplace.',
        input_schema: {
          type: 'object',
          properties: {
            itemId: { type: 'string', description: 'Product/resource ID' },
            itemType: { type: 'string', enum: ['product', 'skill', 'resource', 'service'], description: 'Type of item' },
            quantity: { type: 'number', description: 'Quantity (default 1)' },
            paymentMethod: { type: 'string', description: 'Payment method (e.g. USDC, SOL)' },
          },
          required: ['itemId'],
        },
      },
      {
        name: 'x402_pay',
        description: 'Execute an x402 protocol payment for paywalled content or API access.',
        input_schema: {
          type: 'object',
          properties: {
            url: { type: 'string', description: 'The x402-protected resource URL' },
            maxAmount: { type: 'number', description: 'Maximum payment amount willing to authorize' },
            currency: { type: 'string', description: 'Payment currency (default USDC)' },
          },
          required: ['url'],
        },
      },
      {
        name: 'quickpay_execute',
        description: 'Execute a quick payment or transfer between wallets. Supports crypto and fiat payment rails.',
        input_schema: {
          type: 'object',
          properties: {
            to: { type: 'string', description: 'Recipient address or username' },
            amount: { type: 'number', description: 'Amount to send' },
            currency: { type: 'string', description: 'Currency (default USDC)' },
            memo: { type: 'string', description: 'Payment memo/note' },
          },
          required: ['to', 'amount'],
        },
      },
    ];

    return [...claudeTools, ...basicTools, ...skillTools, ...taskTools, ...publishTools, ...shareTools, ...walletTools, ...agentTools, ...advancedCommerceTools];
  }

  /** Lazily get SkillExecutorService to avoid circular dependency */
  private getSkillExecutor(): any {
    try {
      const { SkillExecutorService } = require('../../skill/skill-executor.service');
      return this.moduleRef.get(SkillExecutorService, { strict: false });
    } catch {
      return null;
    }
  }

  /**
   * 执行 Function Call（与 Gemini 服务类似）
   */

  private async doWebSearch(query: string): Promise<string> {
    try {
      const axios = require('axios');
      const encoded = encodeURIComponent(query);
      const decodeEntities = (input: string) => input
        .replace(/&amp;/g, '&')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>');

      if (/(news|headline|headlines|latest|current|recent)/i.test(query)) {
        const newsResp = await axios.get(
          `https://news.google.com/rss/search?q=${encoded}`,
          {
            timeout: 10_000,
            headers: {
              'Accept-Encoding': 'identity',
              'User-Agent': 'Mozilla/5.0 (compatible; AgentrixBot/1.0; +https://agentrix.top)',
            },
          },
        );
        const xml = typeof newsResp.data === 'string' ? newsResp.data : '';
        const items = Array.from(
          xml.matchAll(/<item>[\s\S]*?<title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>[\s\S]*?<link>(.*?)<\/link>/gi),
        ).slice(0, 5);
        if (items.length > 0) {
          const lines = items.map((match, index) => `${index + 1}. ${decodeEntities(match[1] || '')}\n   ${decodeEntities(match[2] || '')}`);
          return `Top news results for "${query}":\n${lines.join('\n')}`;
        }
      }

      const htmlResp = await axios.get(
        `https://html.duckduckgo.com/html/?q=${encoded}`,
        {
          timeout: 10_000,
          headers: {
            'Accept-Encoding': 'identity',
            'User-Agent': 'Mozilla/5.0 (compatible; AgentrixBot/1.0; +https://agentrix.top)',
          },
        },
      );

      const html = typeof htmlResp.data === 'string' ? htmlResp.data : '';
      const matches = Array.from(
        html.matchAll(/<a[^>]*class="[^"]*result__a[^"]*"[^>]*href="([^"]+)"[^>]*>(.*?)<\/a>/gis),
      ).slice(0, 5);

      if (matches.length > 0) {
        const lines = matches.map((match, index) => {
          const url = decodeEntities(match[1] || '');
          const title = decodeEntities((match[2] || '').replace(/<[^>]+>/g, '').trim());
          return `${index + 1}. ${title}\n   ${url}`;
        });
        return `Top web results for "${query}":\n${lines.join('\n')}`;
      }

      const resp = await axios.get(
        `https://api.duckduckgo.com/?q=${encoded}&format=json&no_html=1&skip_disambig=1`,
        { timeout: 8000, headers: { 'Accept-Encoding': 'identity' } },
      );
      const data = resp.data;
      const abstract = data.AbstractText || '';
      const relatedTopics: string[] = (data.RelatedTopics || [])
        .filter((t: any) => t.Text)
        .slice(0, 5)
        .map((t: any) => t.Text);

      if (!abstract && relatedTopics.length === 0) {
        return `No web results found for: "${query}".`;
      }

      let result = '';
      if (abstract) result += `Summary: ${abstract}\n\n`;
      if (relatedTopics.length > 0) result += `Related:\n` + relatedTopics.map(t => `- ${t}`).join('\n');
      return result.trim();
    } catch (e: any) {
      return `Search failed: ${e.message}`;
    }
  }

  private extractToolResultText(toolResult: any): string {
    const rawContent = toolResult?.content ?? toolResult;
    let parsed = rawContent;

    if (typeof rawContent === 'string') {
      try {
        parsed = JSON.parse(rawContent);
      } catch {
        parsed = rawContent;
      }
    }

    if (typeof parsed === 'string') {
      return parsed;
    }

    if (parsed?.result && typeof parsed.result === 'string') {
      return parsed.result;
    }

    if (typeof parsed?.message === 'string' && !parsed?.data) {
      return parsed.message;
    }

    if (typeof parsed?.error === 'string') {
      return `Tool error: ${parsed.error}`;
    }

    if (parsed?.data !== undefined) {
      return typeof parsed.data === 'string'
        ? parsed.data
        : JSON.stringify(parsed.data, null, 2);
    }

    return JSON.stringify(parsed, null, 2);
  }

  private buildToolFallbackText(toolResults: any[]): string {
    const parts = toolResults
      .map((result, index) => {
        const text = this.extractToolResultText(result)?.trim();
        if (!text) return '';
        return toolResults.length === 1 ? text : `Tool ${index + 1} result:\n${text}`;
      })
      .filter(Boolean);

    return parts.join('\n\n').trim();
  }

  private looksLikeToolAccessRefusal(text?: string): boolean {
    if (!text) return false;
    return /(?:don't|do not|can't|cannot|unable to|lack)\b.{0,50}\b(?:web|internet|browse|search|real-time|current information|access)|(?:tool|web search|search tool).{0,20}(?:not available|unavailable)/i.test(text);
  }

  /** Strip raw XML tool_use tags that leak into text when tools are absent from the API call */
  private stripToolUseXml(text: string): string {
    return text
      .replace(/<\/?tool_use>/g, '')
      .replace(/<tool_name>[\s\S]*?<\/tool_name>/g, '')
      .replace(/<tool_parameters>[\s\S]*?<\/tool_parameters>/g, '')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  async executeFunctionCall(
    functionName: string,
    parameters: Record<string, any>,
    context: {
      userId?: string;
      sessionId?: string;
    },
  ): Promise<any> {
    this.logger.log(`执行 Claude Function: ${functionName}`, parameters);

    try {
      // 复用 Gemini 服务的执行逻辑（电商流程相同）
      if (functionName === 'search_web') {
      const query = parameters.query || parameters.q || JSON.stringify(parameters);
      const result = await this.doWebSearch(query);
      return { success: true, result };
    }
    switch (functionName) {
        case 'search_agentrix_products': {
          const productResult = await this.capabilityExecutor.execute(
            'executor_search',
            parameters as {
              query: string;
              category?: string;
              priceMin?: number;
              priceMax?: number;
              currency?: string;
              inStock?: boolean;
            },
            {
              userId: context.userId,
              sessionId: context.sessionId,
            },
          );
          // If product search returned nothing, also search the skills table as fallback
          // (covers agent chat fallback path that only has standard tools)
          const hasProducts = (productResult?.data?.products?.length ?? 0) > 0;
          if (!hasProducts && parameters.query) {
            try {
              const q = `%${String(parameters.query).toLowerCase().replace(/[%_]/g, '')}%`;
              const skills = await this.productRepository.query(
                `SELECT id, name, display_name, description, category, external_skill_id FROM skills
                 WHERE status = 'published'
                   AND (LOWER(name) LIKE $1 OR LOWER(display_name) LIKE $1 OR LOWER(description) LIKE $1)
                 ORDER BY call_count DESC NULLS LAST
                 LIMIT 10`,
                [q],
              );
              if (skills.length > 0) {
                return {
                  success: true,
                  data: {
                    products: skills.map((s: any) => ({
                      id: s.id,
                      name: s.display_name || s.name,
                      description: s.description?.substring(0, 200),
                      category: s.category || 'skill',
                      type: 'skill',
                      source: s.external_skill_id ? 'openclaw_hub' : 'marketplace',
                    })),
                    query: parameters.query,
                    total: skills.length,
                  },
                  message: `Found ${skills.length} skills matching "${parameters.query}"`,
                };
              }
            } catch (skillErr: any) {
              this.logger.warn(`Skill fallback search failed: ${skillErr.message}`);
            }
          }
          return productResult;
        }

        case 'add_to_agentrix_cart':
          return await this.addToCart(
            parameters as { product_id: string; quantity?: number },
            context,
          );

        case 'view_agentrix_cart':
          return await this.viewCart(context);

        case 'checkout_agentrix_cart':
          return await this.checkoutCart(context);

        case 'buy_agentrix_product':
          return await this.buyProduct(
            parameters as {
              product_id: string;
              quantity?: number;
              shipping_address?: string;
              appointment_time?: string;
              contact_info?: string;
              wallet_address?: string;
              chain?: string;
            },
            context,
          );

        case 'get_agentrix_order':
          return await this.getOrder(parameters as { order_id: string }, context);

        case 'pay_agentrix_order':
          return await this.payOrder(
            parameters as { order_id: string; payment_method?: string },
            context,
          );

        case 'skill_search':
        case 'skill_install':
        case 'skill_execute':
        case 'task_search':
        case 'task_post':
        case 'task_accept':
        case 'task_submit':
        case 'skill_publish':
        case 'resource_publish':
        case 'marketplace_purchase': {
          const executor = this.getSkillExecutor();
          if (!executor) {
            return { success: false, error: 'Skill service unavailable' };
          }
          try {
            const result = await executor.executeInternal(functionName, parameters, {
              userId: context.userId,
              metadata: {},
            });
            return { success: true, data: result };
          } catch (skillErr: any) {
            return { success: false, error: skillErr.message };
          }
        }

        case 'share_content': {
          const { itemType, itemId, title, description, format = 'both' } = parameters;
          const baseUrl = this.configService.get<string>('APP_URL', 'https://agentrix.top');
          const shareUrl = `${baseUrl}/share/${itemType}/${itemId}`;
          const result: any = {
            success: true,
            shareUrl,
            itemType,
            itemId,
            message: `Share link generated for ${itemType}: ${shareUrl}`,
          };
          if (format === 'poster' || format === 'both') {
            result.poster = {
              title: title || `Agentrix ${itemType}`,
              description: description || '',
              qrCodeUrl: shareUrl,
              template: 'default',
              instruction: 'Use this information to create a share card. The QR code should link to the share URL.',
            };
          }
          return result;
        }

        default:
          throw new Error(`未知的 Function: ${functionName}`);
      }
    } catch (error: any) {
      this.logger.error(`执行 Function 失败: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Handle chat via Bedrock with user's own AWS credentials (SigV4) or platform token.
   * Shared logic for both user-credential and platform-fallback Bedrock paths.
   */
  private async handleBedrockChat(
    messages: Array<{ role: 'user' | 'assistant' | 'system'; content: any }>,
    mergedTools: any[],
    options: any,
    userCredentials?: BedrockUserCredentials,
  ): Promise<any> {
    const _t0 = Date.now();
    const _lap = (label: string) => this.logger.log(`⏱ BR ${label}: ${Date.now() - _t0}ms`);
    const modelId = options.model || 'claude-haiku-4-5';
    const maxToolRounds = options.maxToolRounds ?? 5;
    this.logger.log(`Bedrock chat: ${modelId}, tools=${mergedTools.length}, userCreds=${!!userCredentials}, maxToolRounds=${maxToolRounds}`);

    const bedrockTools = mergedTools.map(t => ({
      name: t.name,
      description: t.description,
      parameters: t.input_schema || t.parameters,
    }));

    let currentMessages = [...messages];
    let allToolCalls: any[] = [];
    let lastText = '';

    for (let round = 0; round <= maxToolRounds; round++) {
      const llmResult = await this.bedrockService.chatWithFunctions(currentMessages, {
        model: modelId,
        tools: bedrockTools,
        userCredentials,
        onChunk: options?.onChunk,
        ...(round > 0 ? { maxTokens: 4096 } : {}),
      });
      _lap(`LLM call #${round + 1} (toolCalls=${llmResult.functionCalls?.length || 0})`);

      lastText = llmResult.text || '';

      // No tool calls → done
      if (!llmResult.functionCalls || llmResult.functionCalls.length === 0) {
        return { text: this.stripToolUseXml(lastText), toolCalls: allToolCalls.length > 0 ? allToolCalls : null };
      }

      // Max rounds reached → return what we have
      if (round === maxToolRounds) {
        this.logger.warn(`Bedrock agent loop: max ${maxToolRounds} tool rounds reached, returning partial result`);
        return { text: this.stripToolUseXml(lastText), toolCalls: allToolCalls };
      }

      // Execute tool calls
      const toolNames = llmResult.functionCalls.map((tc: any) => tc.function?.name || tc.name).join(', ');
      this.logger.log(`Bedrock round ${round + 1}: tool call(s): ${toolNames}`);
      allToolCalls.push(...llmResult.functionCalls);

      if (options?.onChunk) {
        options.onChunk(`[Tool Call] ${toolNames}`);
      }

      const toolResults: any[] = [];
      for (const tc of llmResult.functionCalls) {
        const fnName = tc.function?.name || tc.name;
        const fnArgs = tc.function?.arguments
          ? (typeof tc.function.arguments === 'string' ? JSON.parse(tc.function.arguments) : tc.function.arguments)
          : tc.input || {};
        if (options?.onChunk) options.onChunk(`\n[Tool Start] ${fnName}`);
        try {
          let result: any;
          if (options?.onToolCall) {
            result = await options.onToolCall(fnName, fnArgs);
          }
          if (result === undefined) {
            result = await this.executeFunctionCall(fnName, fnArgs, options?.context || {});
          }
          toolResults.push({
            type: 'tool_result',
            tool_use_id: tc.id || `tool-${Date.now()}`,
            content: JSON.stringify(result),
          });
          if (options?.onChunk) options.onChunk(`\n[Tool Done] ${fnName}`);
        } catch (err: any) {
          toolResults.push({
            type: 'tool_result',
            tool_use_id: tc.id || `tool-${Date.now()}`,
            content: JSON.stringify({ success: false, error: err.message }),
          });
          if (options?.onChunk) options.onChunk(`\n[Tool Error] ${fnName}: ${err.message}`);
        }
      }
      _lap(`round ${round + 1} tool execution done`);

      // Build follow-up messages for next round
      const lastUserContent = [...messages].reverse().find(m => m.role === 'user')?.content || '';
      const lastUserMessage = typeof lastUserContent === 'string'
        ? lastUserContent
        : Array.isArray(lastUserContent)
          ? lastUserContent.filter((b: any) => b.type === 'text').map((b: any) => b.text).join('\n')
          : String(lastUserContent);

      const truncatedResults = toolResults.map(r => {
        const s = r.content;
        return s.length > 2000 ? s.slice(0, 2000) + '...[truncated]' : s;
      });

      currentMessages = [
        ...currentMessages,
        { role: 'assistant' as const, content: llmResult.text || 'I used the available tools and received the results.' },
        {
          role: 'user' as const,
          content:
            `Answer the original request using the tool results below. Be concise and direct. ` +
            `Do not say you lack web access or tool access when tool results are present. ` +
            `Do NOT output <tool_use> XML tags — if you need to call another tool, use the provided tool API.\n\n` +
            `Original request:\n${lastUserMessage}\n\n` +
            `Tool results:\n${truncatedResults.join('\n')}`,
        },
      ];
    }

    // Shouldn't reach here, but safety return
    return { text: this.stripToolUseXml(lastText), toolCalls: allToolCalls.length > 0 ? allToolCalls : null };
  }

  /**
   * 调用 Claude API（带 Function Calling）
   */
  private async sanitizeContentForAnthropic(content: any): Promise<any> {
    if (!Array.isArray(content)) return content;
    return Promise.all(content.map(async (block: any) => {
      if (block.type === 'image_url' && block.image_url?.url) {
        return this.fetchImageAsBase64Block(block.image_url.url);
      }
      if (block.type === 'image' && block.source?.type === 'url' && block.source?.url) {
        return this.fetchImageAsBase64Block(block.source.url);
      }
      if (block.type === 'input_audio') {
        return { type: 'text', text: `[Audio attachment: ${block.input_audio?.url || 'audio'}]` };
      }
      return block;
    }));
  }

  private extractAttachmentUrlsFromText(content: string): string[] {
    const imageUrlPattern = /URL:\s*(https?:\/\/\S+\.(?:jpg|jpeg|png|gif|webp)(?:\?\S*)?)/gi;
    const imageUrls: string[] = [];
    let match: RegExpExecArray | null;
    while ((match = imageUrlPattern.exec(content)) !== null) {
      imageUrls.push(match[1]);
    }
    return imageUrls;
  }

  private downgradeContentForTextOnlyModel(content: any): any {
    if (typeof content === 'string') {
      const imageUrls = this.extractAttachmentUrlsFromText(content);
      if (imageUrls.length === 0) {
        return content;
      }
      return `${content}\n\n[Attachment fallback]\nThe current model cannot inspect image pixels directly. Work from the attachment metadata and ask the user for a visual description when image details are required.\n${imageUrls.map((url, index) => `${index + 1}. Image URL: ${url}`).join('\n')}`;
    }

    if (!Array.isArray(content)) {
      return content;
    }

    const textFragments: string[] = [];
    const attachmentLines: string[] = [];

    content.forEach((block: any) => {
      if (block?.type === 'text' && typeof block.text === 'string') {
        textFragments.push(block.text);
        return;
      }

      if (block?.type === 'image_url' && block.image_url?.url) {
        attachmentLines.push(`Image URL: ${block.image_url.url}`);
        return;
      }

      if (block?.type === 'image' && block.source?.url) {
        attachmentLines.push(`Image URL: ${block.source.url}`);
        return;
      }

      if (block?.type === 'input_audio' && block.input_audio?.url) {
        attachmentLines.push(`Audio URL: ${block.input_audio.url}`);
        return;
      }

      try {
        textFragments.push(JSON.stringify(block));
      } catch {
        textFragments.push(String(block));
      }
    });

    if (attachmentLines.length === 0) {
      return textFragments.join('\n').trim();
    }

    const prefix = textFragments.join('\n').trim();
    return `${prefix ? `${prefix}\n\n` : ''}[Attachment fallback]\nThe current model cannot inspect image or media bytes directly. Work from the attachment metadata below and ask the user for extra description when needed.\n${attachmentLines.map((line, index) => `${index + 1}. ${line}`).join('\n')}`;
  }

  private normalizeMessagesForModelCapabilities(
    messages: Array<{ role: 'user' | 'assistant' | 'system'; content: any }>,
    modelId: string,
    providerId?: string,
  ) {
    if (this.aiProviderService.supportsMultimodal(modelId, providerId)) {
      return messages;
    }

    return messages.map((message) => {
      if (message.role !== 'user') {
        return message;
      }

      return {
        ...message,
        content: this.downgradeContentForTextOnlyModel(message.content),
      };
    });
  }

  private readonly maxInlineImageBytes = 5 * 1024 * 1024;

  private buildOversizedImageFallback(url: string, mediaType: string, sizeBytes: number) {
    const sizeMb = (sizeBytes / (1024 * 1024)).toFixed(2);
    return {
      type: 'text',
      text: `[Image attachment omitted: ${mediaType}, ${sizeMb} MB after download exceeds inline model limit. URL: ${url}]`,
    };
  }

  private async fetchImageAsBase64Block(url: string): Promise<any> {
    try {
      const resp = await axios.get(url, { responseType: 'arraybuffer', timeout: 15000 });
      const buffer = Buffer.from(resp.data);
      
      // Some storage engines might return the URL string directly instead of pixels
      const textData = buffer.toString('utf8');
      if (textData.startsWith('http://') || textData.startsWith('https://')) {
        this.logger.log(`URL returned a redirect URL, fetching actual image: ${textData}`);
        return this.fetchImageAsBase64Block(textData.trim());
      }

      const contentType = resp.headers['content-type'] || 'image/png';
      const mediaType = contentType.split(';')[0].trim();
      if (buffer.length > this.maxInlineImageBytes) {
        this.logger.warn(
          `Image too large for Claude inline upload (${buffer.length} bytes raw, url: ${url}). Falling back to text metadata.`,
        );
        return this.buildOversizedImageFallback(url, mediaType, buffer.length);
      }
      return {
        type: 'image',
        source: { type: 'base64', media_type: mediaType, data: buffer.toString('base64') },
      };
    } catch (err: any) {
      this.logger.warn(`Failed to fetch image for base64 conversion: ${err.message} (url: ${url})`);
      return { type: 'text', text: `[Image: ${url}]` };
    }
  }

  async chatWithFunctions(
    messages: Array<{ role: 'user' | 'assistant' | 'system'; content: any }>,
    options?: {
      model?: string;
      temperature?: number;
      maxTokens?: number;
      context?: { userId?: string; sessionId?: string };
      userApiKey?: string; // 用户提供的 API Key（可选）— backward compat
      userCredentials?: UserProviderCredentials; // Full provider credentials (preferred)
      enableModelRouting?: boolean; // 是否启用模型路由（默认启用）
      additionalTools?: any[]; //HQ 专属工具箱支持
      onToolCall?: (name: string, args: any) => Promise<any>;
      /** When provided, use streaming mode and emit text deltas through this callback */
      onChunk?: (text: string) => void;
      /** P7.1: Enable extended thinking for supported models */
      enableThinking?: boolean;
      /** P7.1: Token budget for thinking blocks (default 1024) */
      thinkingBudget?: number;
    },
  ): Promise<any> {
    // When caller provides additionalTools (even empty []), use ONLY those.
    // Empty [] means "no tools" for simple messages (4x faster Bedrock response).
    // Undefined/missing means use standard tools from getFunctionSchemas().
    let mergedTools: any[];
    if (options?.additionalTools !== undefined) {
      const seenNames = new Set<string>();
      mergedTools = (options.additionalTools || []).filter((t: any) => {
        if (seenNames.has(t.name)) return false;
        seenNames.add(t.name);
        return true;
      });
    } else {
      mergedTools = await this.getFunctionSchemas();
    }
    // ── Provider-aware routing ──
    const creds = options?.userCredentials;
    const isBedrockProvider = creds?.providerId?.startsWith('bedrock');
    const canUsePlatformFallback = !creds;

    // Route 1: User has Bedrock credentials → SigV4 path
    if (isBedrockProvider && creds?.secretKey) {
      return this.handleBedrockChat(messages, mergedTools, options || {}, {
        accessKeyId: creds.apiKey,
        secretAccessKey: creds.secretKey,
        region: creds.region || 'us-east-1',
      });
    }

    // Route 2: No platform Anthropic key AND no user direct API key → platform Bedrock fallback
    const userDirectKey = (creds && !isBedrockProvider) ? creds.apiKey : options?.userApiKey;
    if (!this.anthropic && !userDirectKey) {
      try {
        return await this.handleBedrockChat(messages, mergedTools, options || {});
      } catch (bedrockErr: any) {
        this.logger.error(`Bedrock fallback failed: ${bedrockErr.message}`);
        if (canUsePlatformFallback) {
          const openAIFallback = await this.tryOpenAIPlatformFallback(
            messages,
            options,
            `bedrock fallback failed: ${bedrockErr.message}`,
          );
          if (openAIFallback) {
            return openAIFallback;
          }
        }
        throw new Error(
          `AI service error: ${bedrockErr.message}`,
        );
      }
    }

    // Route 3: 如果用户提供了 Anthropic/直接 API Key，创建新的 Anthropic 实例
    const anthropicClient = userDirectKey
      ? new Anthropic({ apiKey: userDirectKey })
      : this.anthropic;

    try {
      // Reuse mergedTools from above, ensuring Anthropic SDK input_schema format
      const tools = mergedTools.map(t => {
        if (t.input_schema) return t;
        return { name: t.name, description: t.description, input_schema: t.parameters };
      });

      const hasFunctionCalling = tools.length > 0;

      // 智能模型路由：根据任务复杂度选择模型
      let selectedModel: string;
      let routingDecision;

      const enableRouting = options?.enableModelRouting !== false; // 默认启用

      if (enableRouting && !options?.model) {
        // 使用模型路由服务选择最合适的模型
        routingDecision = this.modelRouter.routeModel(
          ModelType.CLAUDE,
          messages,
          {
            hasFunctionCalling,
            contextLength: messages.reduce(
              (sum, msg) => sum + (msg.content?.length || 0),
              0,
            ),
            overrideModel: options?.model,
          },
        );
        selectedModel = routingDecision.model;
        this.logger.log(
          `模型路由决策: ${routingDecision.model} (${routingDecision.complexity}) - ${routingDecision.reason}`,
        );
      } else {
        // 使用用户指定的模型或默认模型
        selectedModel = options?.model || this.defaultModel;
        this.logger.log(`使用指定模型: ${selectedModel}`);
      }

      const effectiveProviderId = creds?.providerId;
      const normalizedMessages = this.normalizeMessagesForModelCapabilities(
        messages,
        selectedModel,
        effectiveProviderId,
      );

      // 转换消息格式（Claude 使用不同的格式）
      const systemMessages = normalizedMessages.filter((msg) => msg.role === 'system');
      const systemPrompt = systemMessages
        .map((msg) => msg.content)
        .join('\n');

      const conversationMessages = await Promise.all(normalizedMessages
        .filter((msg) => msg.role !== 'system')
        .map(async (msg) => ({
          role: msg.role === 'assistant' ? 'assistant' : 'user',
          content: await this.sanitizeContentForAnthropic(msg.content),
        })));

      // 调用 Claude API — streaming mode when onChunk provided
      const apiParams: Record<string, any> = {
        model: selectedModel,
        max_tokens: options?.maxTokens || 2048,
        temperature: options?.temperature || 0.7,
        system: systemPrompt || undefined,
        messages: conversationMessages,
        tools: hasFunctionCalling ? tools : undefined,
      };

      // P7.1: Enable extended thinking for supported models
      const supportsThinking = /claude-3-5-sonnet|claude-3-opus|claude-4|claude-sonnet-4|claude-opus-4/i.test(selectedModel);
      if (supportsThinking && options?.enableThinking) {
        apiParams.thinking = { type: 'enabled', budget_tokens: options.thinkingBudget || 1024 };
        // Extended thinking requires temperature=1 and no max_tokens override for thinking
        delete apiParams.temperature;
      }

      let response: any;
      if (options?.onChunk) {
        const stream = anthropicClient.messages.stream(apiParams as any);
        // P7.1: Handle thinking blocks in the stream
        stream.on('contentBlockStart' as any, (block: any) => {
          if (block?.content_block?.type === 'thinking') {
            options.onChunk!('[Thinking]');
          }
        });
        stream.on('contentBlockDelta' as any, (delta: any) => {
          if (delta?.delta?.type === 'thinking_delta') {
            options.onChunk!(`[Think] ${delta.delta.thinking}`);
          }
        });
        stream.on('contentBlockStop' as any, (block: any) => {
          if (block?.content_block?.type === 'thinking') {
            options.onChunk!('[/Thinking]');
          }
        });
        stream.on('text', (text: string) => {
          options.onChunk!(text);
        });
        response = await stream.finalMessage();
      } else {
        response = await anthropicClient.messages.create(apiParams);
      }

      // Multi-turn agent loop for Anthropic direct API
      const maxToolRounds = 5;
      let allToolCalls: any[] = [];
      let currentConversationMessages = [...conversationMessages];

      for (let round = 0; round <= maxToolRounds; round++) {
        const textContent = response.content.find((item: any) => item.type === 'text');
        const text = textContent?.text || '';

        const toolUses = response.content.filter((item: any) => item.type === 'tool_use');

        // No tool calls → done
        if (!toolUses || toolUses.length === 0) {
          return { text, toolCalls: allToolCalls.length > 0 ? allToolCalls : null };
        }

        // Max rounds reached
        if (round === maxToolRounds) {
          this.logger.warn(`Anthropic agent loop: max ${maxToolRounds} tool rounds reached`);
          return { text, toolCalls: allToolCalls };
        }

        this.logger.log(`Anthropic round ${round + 1}: ${toolUses.length} tool call(s): ${toolUses.map((t: any) => t.name).join(', ')}`);

        if (options?.onChunk) {
          options.onChunk(`[Tool Call] ${toolUses.map((t: any) => t.name).join(', ')}`);
        }

        // Execute tool calls
        const toolResults = await Promise.all(
          toolUses.map(async (toolUse: any) => {
            const functionName = toolUse.name;
            const parameters = toolUse.input || {};
            if (options?.onChunk) {
              options.onChunk(`[Tool Start] ${functionName}`);
            }
            try {
              let result: any;
              if (options?.onToolCall) {
                result = await options.onToolCall(functionName, parameters);
              }
              if (result === undefined) {
                result = await this.executeFunctionCall(functionName, parameters, options?.context || {});
              }
              if (options?.onChunk) {
                options.onChunk(`[Tool Done] ${functionName}`);
              }
              return { type: 'tool_result', tool_use_id: toolUse.id, content: JSON.stringify(result) };
            } catch (error: any) {
              if (options?.onChunk) {
                options.onChunk(`[Tool Error] ${functionName}: ${error.message}`);
              }
              return { type: 'tool_result', tool_use_id: toolUse.id, content: JSON.stringify({ success: false, error: error.message }) };
            }
          }),
        );

        allToolCalls.push(...toolUses.map((toolUse: any) => ({ name: toolUse.name, input: toolUse.input })));

        // Build messages for next round
        currentConversationMessages = [
          ...currentConversationMessages,
          { role: 'assistant' as const, content: response.content },
          { role: 'user' as const, content: toolResults },
        ];

        const nextParams = {
          model: selectedModel,
          max_tokens: options?.maxTokens || 4096,
          temperature: options?.temperature || 0.7,
          system: systemPrompt || undefined,
          tools: hasFunctionCalling ? apiParams.tools : undefined,
          messages: currentConversationMessages,
        };

        if (options?.onChunk) {
          const nextStream = anthropicClient.messages.stream(nextParams as any);
          nextStream.on('text', (t: string) => { options.onChunk!(t); });
          response = await nextStream.finalMessage();
        } else {
          response = await anthropicClient.messages.create(nextParams);
        }
      }

      // Safety fallback
      const finalText = response.content?.find((item: any) => item.type === 'text')?.text || '';
      return { text: finalText, toolCalls: allToolCalls.length > 0 ? allToolCalls : null };
    } catch (error: any) {
      this.logger.error(`Claude API调用失败: ${error.message}`, error.stack);
      if (canUsePlatformFallback && !userDirectKey) {
        const openAIFallback = await this.tryOpenAIPlatformFallback(
          messages,
          options,
          `claude api failed: ${error.message}`,
        );
        if (openAIFallback) {
          return openAIFallback;
        }
      }
      throw error;
    }
  }

  private getOpenAIIntegrationService(): OpenAIIntegrationService | null {
    if (this.openAIIntegrationService !== undefined) {
      return this.openAIIntegrationService;
    }

    try {
      this.openAIIntegrationService = this.moduleRef.get(OpenAIIntegrationService, {
        strict: false,
      });
    } catch (error: any) {
      this.logger.warn(`OpenAI fallback unavailable: ${error.message}`);
      this.openAIIntegrationService = null;
    }

    return this.openAIIntegrationService;
  }

  private normalizeToolsForOpenAI(tools?: any[]): any[] | undefined {
    if (!tools?.length) {
      return undefined;
    }

    return tools.map((tool) => {
      if (tool.type === 'function' && tool.function) {
        return tool;
      }

      if (tool.input_schema) {
        return {
          type: 'function',
          function: {
            name: tool.name,
            description: tool.description,
            parameters: tool.input_schema,
          },
        };
      }

      return {
        type: 'function',
        function: {
          name: tool.name,
          description: tool.description,
          parameters: tool.parameters || tool.inputSchema || { type: 'object', properties: {} },
        },
      };
    });
  }

  private async tryOpenAIPlatformFallback(
    messages: Array<{ role: 'user' | 'assistant' | 'system'; content: any }>,
    options:
      | {
          model?: string;
          temperature?: number;
          maxTokens?: number;
          context?: { userId?: string; sessionId?: string };
          userApiKey?: string;
          userCredentials?: UserProviderCredentials;
          enableModelRouting?: boolean;
          additionalTools?: any[];
          onToolCall?: (name: string, args: any) => Promise<any>;
        }
      | undefined,
    reason: string,
  ): Promise<any | null> {
    const openAIService = this.getOpenAIIntegrationService();
    if (!openAIService) {
      return null;
    }

    const fallbackModel =
      this.configService.get<string>('OPENAI_FALLBACK_MODEL') ||
      this.configService.get<string>('OPENAI_MODEL') ||
      'gpt-4o';

    this.logger.warn(
      `Falling back to OpenAI model ${fallbackModel} because ${reason}`,
    );

    try {
      return await openAIService.chatWithFunctions(messages, {
        model: fallbackModel,
        temperature: options?.temperature,
        maxTokens: options?.maxTokens,
        context: options?.context,
        additionalTools: this.normalizeToolsForOpenAI(options?.additionalTools),
        onToolCall: options?.onToolCall,
      });
    } catch (fallbackError: any) {
      this.logger.error(
        `OpenAI platform fallback failed: ${fallbackError.message}`,
        fallbackError.stack,
      );
      return null;
    }
  }

  // 以下方法与 Gemini 服务相同，可以复用
  private normalizeProductReference(value?: string): string | null {
    const normalized = String(value || '').trim();
    return normalized ? normalized : null;
  }

  private looksLikeUuid(value: string): boolean {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    );
  }

  private async resolveProductFromReference(params: {
    product_id?: string;
    product_name?: string;
  }): Promise<Product> {
    const references = [
      this.normalizeProductReference(params.product_id),
      this.normalizeProductReference(params.product_name),
    ].filter((value, index, list): value is string => !!value && list.indexOf(value) === index);

    if (references.length === 0) {
      throw new Error('缺少商品标识，请提供 product_id 或 product_name');
    }

    for (const reference of references) {
      if (!this.looksLikeUuid(reference)) {
        continue;
      }

      try {
        return await this.productService.getProduct(reference);
      } catch {
        // Fall through to name/slug lookup.
      }
    }

    for (const reference of references) {
      const normalized = reference.toLowerCase();

      const exactMatch = await this.productRepository
        .createQueryBuilder('product')
        .where('product.status = :status', { status: ProductStatus.ACTIVE })
        .andWhere(
          '(LOWER(product.name) = :normalized OR LOWER(product.externalId) = :normalized)',
          { normalized },
        )
        .orderBy('product.stock', 'DESC')
        .addOrderBy('product.createdAt', 'DESC')
        .getOne();

      if (exactMatch) {
        return exactMatch;
      }

      const fuzzyPattern = `%${normalized}%`;
      const fuzzyMatch = await this.productRepository
        .createQueryBuilder('product')
        .where('product.status = :status', { status: ProductStatus.ACTIVE })
        .andWhere(
          '(LOWER(product.name) LIKE :pattern OR LOWER(product.externalId) LIKE :pattern)',
          { pattern: fuzzyPattern },
        )
        .orderBy('product.stock', 'DESC')
        .addOrderBy('product.createdAt', 'DESC')
        .getOne();

      if (fuzzyMatch) {
        return fuzzyMatch;
      }
    }

    throw new Error(
      `商品不存在：${references.join(' / ')}。请先搜索商品，或提供准确的商品 ID、名称或 slug。`,
    );
  }

  private async addToCart(
    params: { product_id?: string; product_name?: string; quantity?: number },
    context: { userId?: string; sessionId?: string },
  ): Promise<any> {
    const { quantity = 1 } = params;
    const cartIdentifier = context.userId || context.sessionId;
    const isSessionId = !context.userId;

    if (!cartIdentifier) {
      throw new Error('无法识别用户身份');
    }

    const product = await this.resolveProductFromReference(params);

    const cart = await this.cartService.addToCart(
      cartIdentifier,
      product.id,
      quantity,
      isSessionId,
    );

    return {
      success: true,
      message: `已将 ${product.name} 加入购物车`,
      data: {
        cart,
        product: {
          id: product.id,
          name: product.name,
          price: product.price,
        },
      },
    };
  }

  private async viewCart(
    context: { userId?: string; sessionId?: string },
  ): Promise<any> {
    const cartIdentifier = context.userId || context.sessionId;
    const isSessionId = !context.userId;

    if (!cartIdentifier) {
      throw new Error('无法识别用户身份');
    }

    const cart = await this.cartService.getCartWithProducts(
      cartIdentifier,
      isSessionId,
    );

    return {
      success: true,
      data: {
        cart,
        itemCount: cart.items?.length || 0,
        totalAmount:
          cart.items?.reduce(
            (sum, item) => sum + (item.product?.price || 0) * item.quantity,
            0,
          ) || 0,
      },
    };
  }

  private async checkoutCart(
    context: { userId?: string; sessionId?: string },
  ): Promise<any> {
    const cartIdentifier = context.userId || context.sessionId;
    const isSessionId = !context.userId;

    if (!cartIdentifier) {
      throw new Error('无法识别用户身份');
    }

    if (!context.userId) {
      throw new Error('结算需要登录');
    }

    const cart = await this.cartService.getCartWithProducts(
      cartIdentifier,
      isSessionId,
    );
    if (!cart.items || cart.items.length === 0) {
      throw new Error('购物车为空');
    }

    const orderItems = cart.items.map((item) => ({
      productId: item.productId,
      quantity: item.quantity,
      price: item.product?.price || 0,
    }));

    const totalAmount = cart.items.reduce(
      (sum, item) => sum + (item.product?.price || 0) * item.quantity,
      0,
    );

    const order = await this.orderService.createOrder(context.userId, {
      merchantId: cart.items[0]?.product?.merchantId || '',
      productId: cart.items[0]?.productId || '',
      amount: totalAmount,
      currency: 'CNY',
      metadata: {
        items: orderItems,
        fromCart: true,
      },
    });

    return {
      success: true,
      message: '订单创建成功',
      data: {
        order,
        orderId: order.id,
      },
    };
  }

  private async buyProduct(
    params: {
      product_id?: string;
      product_name?: string;
      quantity?: number;
      shipping_address?: string;
      appointment_time?: string;
      contact_info?: string;
      wallet_address?: string;
      chain?: string;
    },
    context: { userId?: string; sessionId?: string },
  ): Promise<any> {
    const {
      product_id,
      quantity = 1,
      shipping_address,
      appointment_time,
      contact_info,
      wallet_address,
      chain,
    } = params;

    if (!context.userId) {
      throw new Error('购买需要登录');
    }

    const product = await this.resolveProductFromReference(params);

    const order = await this.orderService.createOrder(context.userId, {
      merchantId: product.merchantId,
      productId: product.id,
      amount: Number(product.price) * quantity,
      currency: (product.metadata as any)?.currency || 'CNY',
      metadata: {
        quantity,
        shippingAddress: shipping_address,
        appointmentTime: appointment_time,
        contactInfo: contact_info,
        walletAddress: wallet_address,
        chain,
      },
    });

    return {
      success: true,
      message: '订单创建成功',
      data: {
        order,
        orderId: order.id,
        product: {
          id: product.id,
          name: product.name,
          price: product.price,
        },
      },
    };
  }

  private async getOrder(
    params: { order_id: string },
    context: { userId?: string; sessionId?: string },
  ): Promise<any> {
    const { order_id } = params;

    if (!context.userId) {
      throw new Error('查询订单需要登录');
    }

    const order = await this.orderService.getOrder(context.userId, order_id);
    if (!order) {
      throw new Error('订单不存在');
    }

    return {
      success: true,
      data: {
        order,
        status: order.status,
        items: order.items || [],
        totalAmount: order.amount,
      },
    };
  }

  private async payOrder(
    params: { order_id: string; payment_method?: string },
    context: { userId?: string; sessionId?: string },
  ): Promise<any> {
    const { order_id, payment_method = 'crypto' } = params;

    if (!context.userId) {
      throw new Error('支付需要登录');
    }

    const order = await this.orderService.getOrder(context.userId, order_id);
    if (!order) {
      throw new Error('订单不存在');
    }

    if (order.status !== OrderStatus.PENDING) {
      throw new Error(`订单状态为 ${order.status}，无法支付`);
    }

    const payIntent = await this.payIntentService.createPayIntent(
      context.userId,
      {
        orderId: order_id,
        amount: order.amount,
        currency: order.currency || 'CNY',
        type: PayIntentType.ORDER_PAYMENT,
        paymentMethod: {
          type: payment_method || 'crypto',
        },
        metadata: {
          paymentMethod: payment_method,
        } as any,
      },
    );

    return {
      success: true,
      message: '支付意图创建成功',
      data: {
        payIntent,
        paymentId: payIntent.id,
        order,
      },
    };
  }
}

