/**
 * Ecosystem Importer Service
 * 
 * 从 Claude MCP 生态和 ChatGPT Actions 生态导入 Skill
 */

import { Injectable, Logger, HttpException, HttpStatus } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { 
  Skill, 
  SkillLayer, 
  SkillCategory, 
  SkillSource, 
  SkillOriginalPlatform, 
  SkillStatus, 
  SkillPricingType,
  SkillInputSchema,
  SkillResourceType,
} from '../../entities/skill.entity';
import { ExternalSkillMapping, ExternalPlatform, SyncStatus } from '../../entities/external-skill-mapping.entity';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

// Claude MCP 官方服务器列表
export const CLAUDE_MCP_SERVERS = [
  {
    id: 'filesystem',
    name: 'File System',
    description: '文件系统操作 - 读取、写入、列出文件',
    descriptionEn: 'File system operations - read, write, list files',
    package: '@modelcontextprotocol/server-filesystem',
    category: SkillCategory.UTILITY,
    tools: [
      { name: 'read_file', description: '读取文件内容', params: { path: 'string' } },
      { name: 'write_file', description: '写入文件内容', params: { path: 'string', content: 'string' } },
      { name: 'list_directory', description: '列出目录内容', params: { path: 'string' } },
    ],
  },
  {
    id: 'github',
    name: 'GitHub',
    description: 'GitHub API 集成 - 仓库、Issue、PR 管理',
    descriptionEn: 'GitHub API integration - repos, issues, PRs',
    package: '@modelcontextprotocol/server-github',
    category: SkillCategory.INTEGRATION,
    tools: [
      { name: 'search_repositories', description: '搜索 GitHub 仓库', params: { query: 'string' } },
      { name: 'get_repository', description: '获取仓库详情', params: { owner: 'string', repo: 'string' } },
      { name: 'list_issues', description: '列出仓库 Issues', params: { owner: 'string', repo: 'string' } },
      { name: 'create_issue', description: '创建 Issue', params: { owner: 'string', repo: 'string', title: 'string', body: 'string' } },
    ],
  },
  {
    id: 'brave-search',
    name: 'Brave Search',
    description: '使用 Brave 搜索引擎进行网络搜索',
    descriptionEn: 'Web search using Brave Search API',
    package: '@modelcontextprotocol/server-brave-search',
    category: SkillCategory.DATA,
    tools: [
      { name: 'brave_web_search', description: '网络搜索', params: { query: 'string', count: 'number' } },
    ],
  },
  {
    id: 'fetch',
    name: 'Web Fetch',
    description: '从 URL 获取网页内容',
    descriptionEn: 'Fetch web content from URLs',
    package: '@modelcontextprotocol/server-fetch',
    category: SkillCategory.UTILITY,
    tools: [
      { name: 'fetch', description: '获取 URL 内容', params: { url: 'string' } },
    ],
  },
  {
    id: 'memory',
    name: 'Memory',
    description: '知识图谱记忆存储',
    descriptionEn: 'Knowledge graph memory storage',
    package: '@modelcontextprotocol/server-memory',
    category: SkillCategory.DATA,
    tools: [
      { name: 'create_entities', description: '创建实体', params: { entities: 'array' } },
      { name: 'create_relations', description: '创建关系', params: { relations: 'array' } },
      { name: 'search_nodes', description: '搜索节点', params: { query: 'string' } },
    ],
  },
  {
    id: 'puppeteer',
    name: 'Puppeteer',
    description: '浏览器自动化 - 截图、PDF、网页交互',
    descriptionEn: 'Browser automation - screenshots, PDF, web interaction',
    package: '@modelcontextprotocol/server-puppeteer',
    category: SkillCategory.UTILITY,
    tools: [
      { name: 'puppeteer_navigate', description: '导航到 URL', params: { url: 'string' } },
      { name: 'puppeteer_screenshot', description: '截取屏幕截图', params: { name: 'string' } },
      { name: 'puppeteer_click', description: '点击元素', params: { selector: 'string' } },
    ],
  },
  {
    id: 'slack',
    name: 'Slack',
    description: 'Slack 消息和频道管理',
    descriptionEn: 'Slack messaging and channel management',
    package: '@modelcontextprotocol/server-slack',
    category: SkillCategory.INTEGRATION,
    tools: [
      { name: 'slack_post_message', description: '发送消息', params: { channel: 'string', text: 'string' } },
      { name: 'slack_list_channels', description: '列出频道', params: {} },
    ],
  },
  {
    id: 'google-drive',
    name: 'Google Drive',
    description: 'Google Drive 文件管理',
    descriptionEn: 'Google Drive file management',
    package: '@modelcontextprotocol/server-gdrive',
    category: SkillCategory.INTEGRATION,
    tools: [
      { name: 'gdrive_search', description: '搜索文件', params: { query: 'string' } },
      { name: 'gdrive_read_file', description: '读取文件', params: { fileId: 'string' } },
    ],
  },
];

// ChatGPT 官方 Actions 示例
export const CHATGPT_ACTIONS = [
  {
    id: 'dalle',
    name: 'DALL-E',
    description: 'AI 图像生成',
    descriptionEn: 'AI image generation',
    category: SkillCategory.UTILITY,
    endpoint: 'https://api.openai.com/v1/images/generations',
    tools: [
      { name: 'generate_image', description: '生成图像', params: { prompt: 'string', size: 'string', n: 'number' } },
    ],
  },
  {
    id: 'code-interpreter',
    name: 'Code Interpreter',
    description: '代码执行和数据分析',
    descriptionEn: 'Code execution and data analysis',
    category: SkillCategory.UTILITY,
    tools: [
      { name: 'execute_code', description: '执行 Python 代码', params: { code: 'string' } },
      { name: 'analyze_data', description: '分析数据文件', params: { file: 'string' } },
    ],
  },
  {
    id: 'web-browsing',
    name: 'Web Browsing',
    description: '网页浏览和搜索',
    descriptionEn: 'Web browsing and search',
    category: SkillCategory.DATA,
    tools: [
      { name: 'search', description: '搜索网页', params: { query: 'string' } },
      { name: 'browse', description: '浏览网页', params: { url: 'string' } },
    ],
  },
];

export interface EcosystemImportResult {
  ecosystem: 'claude_mcp' | 'chatgpt_actions';
  imported: number;
  skills: Skill[];
  errors: string[];
}

@Injectable()
export class EcosystemImporterService {
  private readonly logger = new Logger(EcosystemImporterService.name);

  constructor(
    @InjectRepository(Skill)
    private skillRepository: Repository<Skill>,
    @InjectRepository(ExternalSkillMapping)
    private externalMappingRepository: Repository<ExternalSkillMapping>,
    private configService: ConfigService,
  ) {}

  /**
   * 获取可导入的 Claude MCP 服务器列表
   */
  async getAvailableMCPServers(): Promise<typeof CLAUDE_MCP_SERVERS> {
    return CLAUDE_MCP_SERVERS;
  }

  /**
   * 获取可导入的 ChatGPT Actions 列表
   */
  async getAvailableChatGPTActions(): Promise<typeof CHATGPT_ACTIONS> {
    return CHATGPT_ACTIONS;
  }

  /**
   * 从 Claude MCP 生态导入 Skill
   */
  async importFromClaudeMCP(serverIds?: string[]): Promise<EcosystemImportResult> {
    const result: EcosystemImportResult = {
      ecosystem: 'claude_mcp',
      imported: 0,
      skills: [],
      errors: [],
    };

    const serversToImport = serverIds 
      ? CLAUDE_MCP_SERVERS.filter(s => serverIds.includes(s.id))
      : CLAUDE_MCP_SERVERS;

    for (const server of serversToImport) {
      try {
        // 检查是否已导入
        const existing = await this.skillRepository.findOne({
          where: { 
            name: `mcp_${server.id}`,
            source: SkillSource.IMPORTED,
          },
        });

        if (existing) {
          this.logger.log(`MCP server ${server.id} already imported, skipping`);
          continue;
        }

        // 创建 Skill
        const skill = await this.createSkillFromMCPServer(server);
        result.skills.push(skill);
        result.imported++;

        // 创建外部映射
        await this.createExternalMapping(skill, server.id, ExternalPlatform.CLAUDE_MCP);

        this.logger.log(`Successfully imported MCP server: ${server.id}`);
      } catch (error) {
        const errorMsg = `Failed to import MCP server ${server.id}: ${error.message}`;
        this.logger.error(errorMsg);
        result.errors.push(errorMsg);
      }
    }

    return result;
  }

  /**
   * 从 ChatGPT Actions 生态导入 Skill
   */
  async importFromChatGPTActions(actionIds?: string[]): Promise<EcosystemImportResult> {
    const result: EcosystemImportResult = {
      ecosystem: 'chatgpt_actions',
      imported: 0,
      skills: [],
      errors: [],
    };

    const actionsToImport = actionIds 
      ? CHATGPT_ACTIONS.filter(a => actionIds.includes(a.id))
      : CHATGPT_ACTIONS;

    for (const action of actionsToImport) {
      try {
        // 检查是否已导入
        const existing = await this.skillRepository.findOne({
          where: { 
            name: `gpt_${action.id}`,
            source: SkillSource.IMPORTED,
          },
        });

        if (existing) {
          this.logger.log(`ChatGPT action ${action.id} already imported, skipping`);
          continue;
        }

        // 创建 Skill
        const skill = await this.createSkillFromChatGPTAction(action);
        result.skills.push(skill);
        result.imported++;

        // 创建外部映射
        await this.createExternalMapping(skill, action.id, ExternalPlatform.OPENAI_GPT);

        this.logger.log(`Successfully imported ChatGPT action: ${action.id}`);
      } catch (error) {
        const errorMsg = `Failed to import ChatGPT action ${action.id}: ${error.message}`;
        this.logger.error(errorMsg);
        result.errors.push(errorMsg);
      }
    }

    return result;
  }

  /**
   * 从 MCP Server 创建 Skill
   */
  private async createSkillFromMCPServer(server: typeof CLAUDE_MCP_SERVERS[0]): Promise<Skill> {
    const inputSchema = this.generateInputSchemaFromTools(server.tools);

    const skillData: Partial<Skill> = {
      name: `mcp_${server.id}`,
      displayName: `${server.name} (MCP)`,
      description: server.description,
      version: '1.0.0',
      category: server.category,
      layer: SkillLayer.LOGIC,
      source: SkillSource.IMPORTED,
      originalPlatform: SkillOriginalPlatform.CLAUDE,
      status: SkillStatus.PUBLISHED,
      inputSchema,
      executor: {
        type: 'mcp',
        mcpServer: `${server.package}`,
      },
      pricing: {
        type: SkillPricingType.FREE,
        pricePerCall: 0,
        currency: 'USD',
      },
      tags: ['mcp', 'claude', server.category],
      humanAccessible: true,
      compatibleAgents: ['claude', 'all'],
      permissions: ['read'],
      authorInfo: {
        id: 'anthropic',
        name: 'Anthropic',
        type: 'platform',
      },
      platformSchemas: {
        claude: {
          type: 'mcp_server',
          server: server.id,
          tools: server.tools.map(t => t.name),
        },
      },
      metadata: {
        ecosystem: 'claude_mcp',
        package: server.package,
        tools: server.tools,
      },
    };

    const skill = this.skillRepository.create(skillData);
    return this.skillRepository.save(skill);
  }

  /**
   * 从 ChatGPT Action 创建 Skill
   */
  private async createSkillFromChatGPTAction(action: typeof CHATGPT_ACTIONS[0]): Promise<Skill> {
    const inputSchema = this.generateInputSchemaFromTools(action.tools);

    const skillData: Partial<Skill> = {
      name: `gpt_${action.id}`,
      displayName: `${action.name} (GPT)`,
      description: action.description,
      version: '1.0.0',
      category: action.category,
      layer: SkillLayer.LOGIC,
      source: SkillSource.IMPORTED,
      originalPlatform: SkillOriginalPlatform.OPENAI,
      status: SkillStatus.PUBLISHED,
      inputSchema,
      executor: {
        type: 'http',
        endpoint: (action as any).endpoint || '',
        method: 'POST',
      },
      pricing: {
        type: SkillPricingType.FREE,
        pricePerCall: 0,
        currency: 'USD',
      },
      tags: ['chatgpt', 'openai', action.category],
      humanAccessible: true,
      compatibleAgents: ['openai', 'all'],
      permissions: ['read'],
      authorInfo: {
        id: 'openai',
        name: 'OpenAI',
        type: 'platform',
      },
      platformSchemas: {
        openai: {
          type: 'function',
          functions: action.tools.map(t => ({
            name: t.name,
            description: t.description,
            parameters: {
              type: 'object',
              properties: Object.fromEntries(
                Object.entries(t.params).map(([k, v]) => [k, { type: v }])
              ),
            },
          })),
        },
      },
      metadata: {
        ecosystem: 'chatgpt_actions',
        tools: action.tools,
      },
    };

    const skill = this.skillRepository.create(skillData);
    return this.skillRepository.save(skill);
  }

  /**
   * 从工具列表生成输入 Schema
   */
  private generateInputSchemaFromTools(tools: Array<{ name: string; description: string; params: Record<string, string> }>): SkillInputSchema {
    // 如果只有一个工具，直接使用其参数
    if (tools.length === 1) {
      const tool = tools[0];
      return {
        type: 'object',
        properties: Object.fromEntries(
          Object.entries(tool.params).map(([key, type]) => [
            key,
            { type, description: `Parameter: ${key}` },
          ])
        ),
        required: Object.keys(tool.params),
      };
    }

    // 多个工具，添加 action 选择
    return {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          description: '要执行的操作',
          enum: tools.map(t => t.name),
        },
        params: {
          type: 'object',
          description: '操作参数',
        },
      },
      required: ['action'],
    };
  }

  /**
   * 创建外部映射记录
   */
  private async createExternalMapping(
    skill: Skill, 
    externalId: string, 
    platform: ExternalPlatform
  ): Promise<ExternalSkillMapping> {
    const mapping = this.externalMappingRepository.create({
      agentrixSkillId: skill.id,
      externalPlatform: platform,
      externalId: externalId,
      externalName: skill.displayName,
      syncStatus: SyncStatus.ACTIVE,
      lastSyncedAt: new Date(),
    });

    return this.externalMappingRepository.save(mapping);
  }

  /**
   * 同步所有已导入的生态 Skill
   */
  async syncAllEcosystemSkills(): Promise<{ synced: number; errors: string[] }> {
    const result = { synced: 0, errors: [] as string[] };

    const mappings = await this.externalMappingRepository.find({
      where: { syncStatus: SyncStatus.ACTIVE },
      relations: ['agentrixSkill'],
    });

    for (const mapping of mappings) {
      try {
        // 更新同步时间
        mapping.lastSyncedAt = new Date();
        await this.externalMappingRepository.save(mapping);
        result.synced++;
      } catch (error) {
        result.errors.push(`Failed to sync ${mapping.externalId}: ${error.message}`);
      }
    }

    return result;
  }

  /**
   * V2.1: 从 X402 服务发现导入 Skill
   * 扫描外部 X402 服务并导入为 Skill
   */
  async importFromX402Services(serviceUrls?: string[]): Promise<EcosystemImportResult> {
    const result: EcosystemImportResult = {
      ecosystem: 'claude_mcp' as any, // Use existing enum
      imported: 0,
      skills: [],
      errors: [],
    };

    // 默认扫描的 X402 服务 URL 列表
    const defaultX402Services = [
      'https://api.x402.io/.well-known/pay',
      'https://pay.coinbase.com/.well-known/pay',
    ];

    const servicesToScan = serviceUrls || defaultX402Services;

    for (const serviceUrl of servicesToScan) {
      try {
        // 尝试获取 X402 服务发现信息
        const response = await axios.get(serviceUrl, { timeout: 5000 });
        const serviceInfo = response.data;

        if (!serviceInfo.services) {
          this.logger.warn(`No services found at ${serviceUrl}`);
          continue;
        }

        for (const service of serviceInfo.services) {
          const existingSkill = await this.skillRepository.findOne({
            where: {
              name: `x402_${service.id}`,
              source: SkillSource.IMPORTED,
            },
          });

          if (existingSkill) {
            this.logger.log(`X402 service ${service.id} already imported, skipping`);
            continue;
          }

          // 创建 Skill
          const skill = await this.createSkillFromX402Service(service, serviceUrl);
          result.skills.push(skill);
          result.imported++;

          // 创建外部映射
          await this.createExternalMapping(skill, service.id, ExternalPlatform.OTHER);
          
          this.logger.log(`Successfully imported X402 service: ${service.id}`);
        }
      } catch (error) {
        const errorMsg = `Failed to scan X402 service at ${serviceUrl}: ${error.message}`;
        this.logger.warn(errorMsg);
        result.errors.push(errorMsg);
      }
    }

    return result;
  }

  /**
   * 从 X402 服务创建 Skill
   */
  private async createSkillFromX402Service(service: any, sourceUrl: string): Promise<Skill> {
    const skillData: Partial<Skill> = {
      name: `x402_${service.id}`,
      displayName: service.name || service.id,
      description: service.description || `X402 service: ${service.id}`,
      version: '1.0.0',
      category: SkillCategory.PAYMENT,
      layer: SkillLayer.INFRA,
      source: SkillSource.IMPORTED,
      originalPlatform: SkillOriginalPlatform.THIRD_PARTY,
      status: SkillStatus.DRAFT, // 待审批
      inputSchema: {
        type: 'object',
        properties: {
          amount: { type: 'number', description: '支付金额' },
          currency: { type: 'string', description: '货币类型' },
        },
        required: ['amount'],
      },
      executor: {
        type: 'http',
        endpoint: service.endpoint || sourceUrl,
        method: 'POST',
      },
      pricing: {
        type: SkillPricingType.PER_CALL,
        pricePerCall: service.price || 0,
        currency: service.currency || 'USD',
      },
      tags: ['x402', 'payment', 'micropayment'],
      humanAccessible: true,
      compatibleAgents: ['all'],
      permissions: ['payment'],
      authorInfo: {
        id: 'x402',
        name: service.provider || 'X402 Protocol',
        type: 'platform',
      },
      x402Enabled: true,
      x402ServiceEndpoint: service.endpoint || sourceUrl,
      ucpEnabled: true,
      metadata: {
        ecosystem: 'x402',
        sourceUrl,
        originalService: service,
      },
    };

    const skill = this.skillRepository.create(skillData);
    return this.skillRepository.save(skill);
  }

  /**
   * V2.1: 从 UCP 商户发现导入 Skill
   * 扫描外部 UCP 商户并导入商品为 Skill
   */
  async importFromUCPMerchants(merchantUrls?: string[]): Promise<EcosystemImportResult> {
    const result: EcosystemImportResult = {
      ecosystem: 'chatgpt_actions' as any, // Use existing enum for compatibility
      imported: 0,
      skills: [],
      errors: [],
    };

    // 默认扫描的 UCP 商户 URL 列表
    const defaultMerchantUrls = [
      'https://api.agentrix.io/.well-known/ucp',
      'https://shop.universal-commerce-protocol.org/.well-known/ucp',
      'https://demo.ucp.dev/.well-known/ucp',
    ];

    const merchantsToScan = merchantUrls || defaultMerchantUrls;

    for (const merchantUrl of merchantsToScan) {
      try {
        // 获取 UCP 商户配置
        const response = await axios.get(merchantUrl, { timeout: 5000 });
        const ucpProfile = response.data;

        if (!ucpProfile.ucp?.services) {
          this.logger.warn(`No UCP services found at ${merchantUrl}`);
          continue;
        }

        // 从商户的购物服务导入商品
        const shoppingService = ucpProfile.ucp.services['dev.ucp.shopping'];
        if (shoppingService?.rest?.endpoint) {
          try {
            // 获取商户商品列表
            const productsRes = await axios.get(`${shoppingService.rest.endpoint}/products`, { timeout: 5000 });
            const products = productsRes.data?.items || productsRes.data || [];

            for (const product of products) {
              const existingSkill = await this.skillRepository.findOne({
                where: {
                  name: `ucp_${product.id}`,
                  source: SkillSource.IMPORTED,
                },
              });

              if (existingSkill) {
                this.logger.log(`UCP product ${product.id} already imported, skipping`);
                continue;
              }

              // 创建 Skill
              const skill = await this.createSkillFromUCPProduct(product, merchantUrl);
              result.skills.push(skill);
              result.imported++;

              // 创建外部映射
              await this.createExternalMapping(skill, product.id, ExternalPlatform.OTHER);
              
              this.logger.log(`Successfully imported UCP product: ${product.id}`);
            }
          } catch (productError) {
            this.logger.warn(`Failed to fetch products from ${merchantUrl}: ${productError.message}`);
          }
        }
      } catch (error) {
        const errorMsg = `Failed to scan UCP merchant at ${merchantUrl}: ${error.message}`;
        this.logger.warn(errorMsg);
        result.errors.push(errorMsg);
      }
    }

    return result;
  }

  /**
   * 从 UCP 商品创建 Skill
   */
  private async createSkillFromUCPProduct(product: any, sourceUrl: string): Promise<Skill> {
    const resourceType = this.mapProductTypeToResourceType(product.type);
    
    const skillData: Partial<Skill> = {
      name: `ucp_${product.id}`,
      displayName: product.name || product.id,
      description: product.description || `UCP product: ${product.name}`,
      version: '1.0.0',
      category: SkillCategory.COMMERCE,
      layer: SkillLayer.RESOURCE,
      resourceType,
      source: SkillSource.IMPORTED,
      originalPlatform: SkillOriginalPlatform.THIRD_PARTY,
      status: SkillStatus.DRAFT, // 待审批
      inputSchema: {
        type: 'object',
        properties: {
          quantity: { type: 'number', description: '购买数量', default: 1 },
          options: { type: 'object', description: '商品选项' },
        },
        required: ['quantity'],
      },
      executor: {
        type: 'http',
        endpoint: `${sourceUrl.replace('/.well-known/ucp', '')}/checkout`,
        method: 'POST',
      },
      pricing: {
        type: SkillPricingType.REVENUE_SHARE,
        pricePerCall: product.price || 0,
        currency: product.currency || 'USD',
        commissionRate: 2.2, // Default Agentrix commission
      },
      tags: ['ucp', 'commerce', product.type || 'product'],
      humanAccessible: true,
      compatibleAgents: ['all'],
      permissions: ['read', 'payment'],
      authorInfo: {
        id: product.merchantId || 'unknown',
        name: product.merchantName || 'UCP Merchant',
        type: 'merchant',
      },
      ucpEnabled: true,
      ucpCheckoutEndpoint: `${sourceUrl.replace('/.well-known/ucp', '')}/checkout`,
      imageUrl: product.image || product.images?.[0],
      thumbnailUrl: product.thumbnail || product.image || product.images?.[0],
      metadata: {
        ecosystem: 'ucp',
        sourceUrl,
        originalProduct: product,
        image: product.image || product.images?.[0],
        images: product.images || [],
      },
    };

    const skill = this.skillRepository.create(skillData);
    return this.skillRepository.save(skill);
  }

  /**
   * 映射商品类型到资源类型
   */
  private mapProductTypeToResourceType(productType: string): SkillResourceType {
    const typeMap: Record<string, SkillResourceType> = {
      physical: SkillResourceType.PHYSICAL,
      service: SkillResourceType.SERVICE,
      digital: SkillResourceType.DIGITAL,
      nft: SkillResourceType.DIGITAL,
      data: SkillResourceType.DATA,
    };
    return typeMap[productType?.toLowerCase()] || SkillResourceType.PHYSICAL;
  }
}
