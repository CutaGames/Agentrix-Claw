/**
 * MCP Server Proxy Service
 * 
 * Phase 3: 代理外部 MCP Server，将其能力聚合到 Agentrix Marketplace
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
  SkillPricingType 
} from '../../entities/skill.entity';
import { ExternalSkillMapping, ExternalPlatform, SyncStatus } from '../../entities/external-skill-mapping.entity';
import { ConfigService } from '@nestjs/config';
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { CallToolResultSchema } from "@modelcontextprotocol/sdk/types.js";

export interface MCPServerConfig {
  name: string;
  source: 'anthropic_official' | 'community';
  endpoint: string;
  transport: 'sse' | 'stdio' | 'http';
  description?: string;
  category?: SkillCategory;
  authConfig?: {
    type: 'none' | 'api_key' | 'oauth';
    apiKey?: string;
    oauthConfig?: Record<string, any>;
  };
  pricing?: {
    passthrough: boolean;
    agentrixMarkup?: number;
  };
}

export interface MCPTool {
  name: string;
  description: string;
  inputSchema: Record<string, any>;
}

export interface MCPServerInfo {
  name: string;
  version?: string;
  tools: MCPTool[];
  resources?: any[];
  prompts?: any[];
}

@Injectable()
export class MCPServerProxyService {
  private readonly logger = new Logger(MCPServerProxyService.name);
  
  // 官方 MCP Servers 配置
  private readonly officialMCPServers: MCPServerConfig[] = [
    {
      name: 'filesystem',
      source: 'anthropic_official',
      endpoint: 'npx -y @modelcontextprotocol/server-filesystem',
      transport: 'stdio',
      description: 'File system operations - read, write, list files',
      category: SkillCategory.UTILITY,
    },
    {
      name: 'github',
      source: 'anthropic_official',
      endpoint: 'npx -y @modelcontextprotocol/server-github',
      transport: 'stdio',
      description: 'GitHub API integration - repos, issues, PRs',
      category: SkillCategory.INTEGRATION,
    },
    {
      name: 'brave-search',
      source: 'anthropic_official',
      endpoint: 'npx -y @modelcontextprotocol/server-brave-search',
      transport: 'stdio',
      description: 'Web search using Brave Search API',
      category: SkillCategory.DATA,
    },
    {
      name: 'fetch',
      source: 'anthropic_official',
      endpoint: 'npx -y @modelcontextprotocol/server-fetch',
      transport: 'stdio',
      description: 'Fetch web content from URLs',
      category: SkillCategory.UTILITY,
    },
    {
      name: 'memory',
      source: 'anthropic_official',
      endpoint: 'npx -y @modelcontextprotocol/server-memory',
      transport: 'stdio',
      description: 'Persistent memory storage for conversations',
      category: SkillCategory.UTILITY,
    },
    {
      name: 'postgres',
      source: 'anthropic_official',
      endpoint: 'npx -y @modelcontextprotocol/server-postgres',
      transport: 'stdio',
      description: 'PostgreSQL database operations',
      category: SkillCategory.DATA,
    },
    {
      name: 'puppeteer',
      source: 'anthropic_official',
      endpoint: 'npx -y @modelcontextprotocol/server-puppeteer',
      transport: 'stdio',
      description: 'Browser automation with Puppeteer',
      category: SkillCategory.UTILITY,
    },
    {
      name: 'slack',
      source: 'anthropic_official',
      endpoint: 'npx -y @modelcontextprotocol/server-slack',
      transport: 'stdio',
      description: 'Slack workspace integration',
      category: SkillCategory.INTEGRATION,
    },
    {
      name: 'google-drive',
      source: 'anthropic_official',
      endpoint: 'npx -y @modelcontextprotocol/server-gdrive',
      transport: 'stdio',
      description: 'Google Drive file operations',
      category: SkillCategory.INTEGRATION,
    },
  ];

  constructor(
    @InjectRepository(Skill)
    private skillRepository: Repository<Skill>,
    @InjectRepository(ExternalSkillMapping)
    private externalMappingRepository: Repository<ExternalSkillMapping>,
    private configService: ConfigService,
  ) {}

  /**
   * 获取所有可用的官方 MCP Servers
   */
  getOfficialMCPServers(): MCPServerConfig[] {
    return this.officialMCPServers;
  }

  /**
   * 注册 MCP Server 到 Agentrix
   */
  async registerMCPServer(config: MCPServerConfig): Promise<Skill> {
    this.logger.log(`Registering MCP Server: ${config.name}`);

    // 检查是否已存在
    const existing = await this.externalMappingRepository.findOne({
      where: {
        externalPlatform: ExternalPlatform.CLAUDE_MCP,
        externalId: config.name,
      },
    });

    if (existing) {
      this.logger.log(`MCP Server ${config.name} already registered, updating...`);
      return this.updateMCPServerMapping(existing, config);
    }

    // 创建 Skill
    const skill = new Skill();
    skill.name = `mcp_${config.name}`;
    skill.displayName = `MCP: ${this.formatDisplayName(config.name)}`;
    skill.description = config.description || `MCP Server: ${config.name}`;
    skill.layer = SkillLayer.LOGIC;
    skill.category = config.category || SkillCategory.INTEGRATION;
    skill.source = SkillSource.IMPORTED;
    skill.originalPlatform = SkillOriginalPlatform.CLAUDE;
    skill.status = SkillStatus.PUBLISHED;
    skill.humanAccessible = true;
    skill.tags = ['mcp', config.source, config.name];
    skill.executor = {
      type: 'mcp',
      mcpServer: config.name,
      endpoint: config.endpoint,
    };
    skill.pricing = {
      type: config.pricing?.passthrough ? SkillPricingType.FREE : SkillPricingType.PER_CALL,
      pricePerCall: config.pricing?.agentrixMarkup || 0,
      currency: 'USD',
    };
    skill.platformSchemas = {
      claude: {
        type: 'mcp_server',
        server: config.name,
      },
    };
    skill.authorInfo = {
      id: 'anthropic',
      name: config.source === 'anthropic_official' ? 'Anthropic' : 'Community',
      type: 'platform',
    };

    const savedSkill = await this.skillRepository.save(skill);

    // 创建外部映射
    const mapping = new ExternalSkillMapping();
    mapping.agentrixSkillId = savedSkill.id;
    mapping.externalPlatform = ExternalPlatform.CLAUDE_MCP;
    mapping.externalId = config.name;
    mapping.externalName = config.name;
    mapping.externalEndpoint = config.endpoint;
    mapping.proxyConfig = {
      enabled: true,
      authType: config.authConfig?.type || 'none',
      authConfig: config.authConfig,
    };
    mapping.syncStatus = SyncStatus.ACTIVE;
    mapping.lastSyncedAt = new Date();

    await this.externalMappingRepository.save(mapping);

    this.logger.log(`MCP Server ${config.name} registered successfully`);
    return savedSkill;
  }

  /**
   * 更新 MCP Server 映射
   */
  private async updateMCPServerMapping(
    mapping: ExternalSkillMapping,
    config: MCPServerConfig,
  ): Promise<Skill | null> {
    const skill = await this.skillRepository.findOne({
      where: { id: mapping.agentrixSkillId },
    });

    if (skill) {
      skill.description = config.description || skill.description;
      skill.executor = {
        type: 'mcp',
        mcpServer: config.name,
        endpoint: config.endpoint,
      };
      await this.skillRepository.save(skill);
    }

    mapping.externalEndpoint = config.endpoint;
    mapping.proxyConfig = {
      enabled: true,
      authType: config.authConfig?.type || 'none',
      authConfig: config.authConfig,
    };
    mapping.lastSyncedAt = new Date();
    await this.externalMappingRepository.save(mapping);

    return skill;
  }

  /**
   * 批量注册官方 MCP Servers
   */
  async registerOfficialMCPServers(): Promise<{ success: string[]; failed: string[] }> {
    const success: string[] = [];
    const failed: string[] = [];

    for (const server of this.officialMCPServers) {
      try {
        await this.registerMCPServer(server);
        success.push(server.name);
      } catch (error) {
        this.logger.error(`Failed to register MCP Server ${server.name}:`, error);
        failed.push(server.name);
      }
    }

    return { success, failed };
  }

  /**
   * 代理调用 MCP Server (Client 模式)
   */
  async callTool(
    serverName: string,
    toolName: string,
    params: Record<string, any>,
  ): Promise<any> {
    const mapping = await this.externalMappingRepository.findOne({
      where: {
        externalPlatform: ExternalPlatform.CLAUDE_MCP,
        externalId: serverName,
      },
    });

    if (!mapping) {
      throw new HttpException(
        `MCP Server ${serverName} not found`,
        HttpStatus.NOT_FOUND,
      );
    }

    this.logger.log(`Proxying MCP call: ${serverName}/${toolName} using transport ${mapping.proxyConfig?.transport || 'stdio'}`);

    try {
      // 1. 初始化 Client
      const client = new Client(
        {
          name: "agentrix-proxy-client",
          version: "1.0.0",
        },
        {
          capabilities: {},
        }
      );

      // 2. 根据类型选择 Transport
      let transport;
      const endpoint = mapping.externalEndpoint || mapping.proxyConfig?.endpoint;
      const transportType = mapping.proxyConfig?.transport || 'stdio';

      if (transportType === 'stdio') {
        // 解析 command 和 args
        const parts = endpoint.split(' ');
        const command = parts[0];
        const args = parts.slice(1);
        transport = new StdioClientTransport({
          command,
          args,
        });
      } else if (transportType === 'sse') {
        transport = new SSEClientTransport(new URL(endpoint));
      } else {
        throw new Error(`Unsupported transport type: ${transportType}`);
      }

      // 3. 连接并调用
      await client.connect(transport);
      
      const result = await client.callTool({
        name: toolName,
        arguments: params,
      });

      // 4. 关闭连接
      // 注意：在实际高并发场景下，应该缓存连接池
      if (transportType === 'stdio') {
        await transport.close();
      }

      return result;
    } catch (error) {
      this.logger.error(`Failed to call MCP tool ${serverName}/${toolName}:`, error);
      throw new HttpException(
        `MCP call failed: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * 获取 MCP Server 的工具列表
   */
  async getMCPServerTools(serverName: string): Promise<MCPTool[]> {
    // TODO: 实际获取 MCP Server 的工具列表
    // 需要连接到 MCP Server 并获取其 tools/list

    const server = this.officialMCPServers.find(s => s.name === serverName);
    if (!server) {
      throw new HttpException(
        `MCP Server ${serverName} not found`,
        HttpStatus.NOT_FOUND,
      );
    }

    // 返回预定义的工具列表（实际应该从 MCP Server 动态获取）
    return this.getPreDefinedTools(serverName);
  }

  /**
   * 获取预定义的工具列表
   */
  private getPreDefinedTools(serverName: string): MCPTool[] {
    const toolsMap: Record<string, MCPTool[]> = {
      filesystem: [
        {
          name: 'read_file',
          description: 'Read the contents of a file',
          inputSchema: {
            type: 'object',
            properties: {
              path: { type: 'string', description: 'Path to the file' },
            },
            required: ['path'],
          },
        },
        {
          name: 'write_file',
          description: 'Write content to a file',
          inputSchema: {
            type: 'object',
            properties: {
              path: { type: 'string', description: 'Path to the file' },
              content: { type: 'string', description: 'Content to write' },
            },
            required: ['path', 'content'],
          },
        },
        {
          name: 'list_directory',
          description: 'List contents of a directory',
          inputSchema: {
            type: 'object',
            properties: {
              path: { type: 'string', description: 'Path to the directory' },
            },
            required: ['path'],
          },
        },
      ],
      github: [
        {
          name: 'create_issue',
          description: 'Create a new GitHub issue',
          inputSchema: {
            type: 'object',
            properties: {
              owner: { type: 'string' },
              repo: { type: 'string' },
              title: { type: 'string' },
              body: { type: 'string' },
            },
            required: ['owner', 'repo', 'title'],
          },
        },
        {
          name: 'list_repos',
          description: 'List repositories for a user or organization',
          inputSchema: {
            type: 'object',
            properties: {
              owner: { type: 'string' },
            },
            required: ['owner'],
          },
        },
      ],
      'brave-search': [
        {
          name: 'search',
          description: 'Search the web using Brave Search',
          inputSchema: {
            type: 'object',
            properties: {
              query: { type: 'string', description: 'Search query' },
              count: { type: 'number', description: 'Number of results' },
            },
            required: ['query'],
          },
        },
      ],
      fetch: [
        {
          name: 'fetch_url',
          description: 'Fetch content from a URL',
          inputSchema: {
            type: 'object',
            properties: {
              url: { type: 'string', description: 'URL to fetch' },
            },
            required: ['url'],
          },
        },
      ],
      memory: [
        {
          name: 'store',
          description: 'Store a value in memory',
          inputSchema: {
            type: 'object',
            properties: {
              key: { type: 'string' },
              value: { type: 'string' },
            },
            required: ['key', 'value'],
          },
        },
        {
          name: 'retrieve',
          description: 'Retrieve a value from memory',
          inputSchema: {
            type: 'object',
            properties: {
              key: { type: 'string' },
            },
            required: ['key'],
          },
        },
      ],
    };

    return toolsMap[serverName] || [];
  }

  /**
   * 格式化显示名称
   */
  private formatDisplayName(name: string): string {
    return name
      .split('-')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }

  /**
   * 同步所有 MCP Server 状态
   */
  async syncAllMCPServers(): Promise<void> {
    const mappings = await this.externalMappingRepository.find({
      where: { externalPlatform: ExternalPlatform.CLAUDE_MCP },
    });

    for (const mapping of mappings) {
      try {
        // TODO: 检查 MCP Server 是否可用
        mapping.lastSyncedAt = new Date();
        mapping.syncStatus = SyncStatus.ACTIVE;
        await this.externalMappingRepository.save(mapping);
      } catch (error) {
        this.logger.error(`Failed to sync MCP Server ${mapping.externalId}:`, error);
        mapping.syncStatus = SyncStatus.ERROR;
        await this.externalMappingRepository.save(mapping);
      }
    }
  }
}
