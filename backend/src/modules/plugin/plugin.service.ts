import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In, QueryFailedError } from 'typeorm';
import axios from 'axios';
import { Plugin, PluginCategory } from '../../entities/plugin.entity';
import { UserPlugin } from '../../entities/user-plugin.entity';
import { User } from '../../entities/user.entity';

export interface CreatePluginDto {
  name: string;
  description?: string;
  version: string;
  author: string;
  category: PluginCategory;
  price?: number;
  currency?: string;
  isFree?: boolean;
  capabilities?: string[];
  dependencies?: string[];
  metadata?: Record<string, any>;
}

export interface UpdatePluginDto {
  name?: string;
  description?: string;
  version?: string;
  price?: number;
  isFree?: boolean;
  capabilities?: string[];
  dependencies?: string[];
  metadata?: Record<string, any>;
}

@Injectable()
export class PluginService {
  private readonly logger = new Logger(PluginService.name);

  constructor(
    @InjectRepository(Plugin)
    private readonly pluginRepository: Repository<Plugin>,
    @InjectRepository(UserPlugin)
    private readonly userPluginRepository: Repository<UserPlugin>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {}

  /**
   * 获取插件列表
   */
  async getPlugins(params?: {
    category?: PluginCategory;
    search?: string;
    role?: 'user' | 'merchant' | 'developer';
  }): Promise<Plugin[]> {
    const qb = this.pluginRepository
      .createQueryBuilder('plugin')
      .where('plugin.isActive = :isActive', { isActive: true })
      .orderBy('plugin.downloadCount', 'DESC')
      .addOrderBy('plugin.rating', 'DESC');

    if (params?.category) {
      qb.andWhere('plugin.category = :category', { category: params.category });
    }

    if (params?.search) {
      qb.andWhere(
        '(plugin.name ILIKE :search OR plugin.description ILIKE :search)',
        { search: `%${params.search}%` },
      );
    }

    try {
      return await qb.getMany();
    } catch (error) {
      if (!this.isLegacyPluginSchemaError(error)) {
        throw error;
      }

      this.logger.warn('Legacy plugin schema detected while listing plugins; falling back to a compatible select set');
      return this.getPluginsLegacyCompat(params);
    }
  }

  /**
   * 获取插件详情
   */
  async getPlugin(pluginId: string): Promise<Plugin> {
    let plugin: Plugin | null;

    try {
      plugin = await this.pluginRepository.findOne({
        where: { id: pluginId, isActive: true },
      });
    } catch (error) {
      if (!this.isLegacyPluginSchemaError(error)) {
        throw error;
      }

      this.logger.warn(`Legacy plugin schema detected while loading plugin ${pluginId}; falling back to a compatible select set`);
      plugin = await this.getPluginLegacyCompat(pluginId);
    }

    if (!plugin) {
      throw new NotFoundException('Plugin not found');
    }

    return plugin;
  }

  private isLegacyPluginSchemaError(error: unknown): boolean {
    if (!(error instanceof QueryFailedError)) {
      return false;
    }

    const message = String((error as { message?: unknown }).message || '').toLowerCase();
    return [
      'required_permissions',
      'sandbox_level',
      'security_policy',
      'manifest',
    ].some((field) => message.includes(field));
  }

  private buildLegacyPluginSelectQuery() {
    return this.pluginRepository
      .createQueryBuilder('plugin')
      .select([
        'plugin.id',
        'plugin.name',
        'plugin.description',
        'plugin.version',
        'plugin.author',
        'plugin.category',
        'plugin.price',
        'plugin.currency',
        'plugin.isFree',
        'plugin.rating',
        'plugin.downloadCount',
        'plugin.icon',
        'plugin.screenshots',
        'plugin.capabilities',
        'plugin.dependencies',
        'plugin.metadata',
        'plugin.isActive',
        'plugin.createdAt',
        'plugin.updatedAt',
      ]);
  }

  private withLegacyPluginDefaults(plugin: Plugin | null): Plugin | null {
    if (!plugin) {
      return null;
    }

    plugin.requiredPermissions = plugin.requiredPermissions || [];
    plugin.sandboxLevel = plugin.sandboxLevel || 'none';
    plugin.securityPolicy = plugin.securityPolicy || {};
    return plugin;
  }

  private async getPluginsLegacyCompat(params?: {
    category?: PluginCategory;
    search?: string;
    role?: 'user' | 'merchant' | 'developer';
  }): Promise<Plugin[]> {
    const qb = this.buildLegacyPluginSelectQuery()
      .where('plugin.isActive = :isActive', { isActive: true })
      .orderBy('plugin.downloadCount', 'DESC')
      .addOrderBy('plugin.rating', 'DESC');

    if (params?.category) {
      qb.andWhere('plugin.category = :category', { category: params.category });
    }

    if (params?.search) {
      qb.andWhere(
        '(plugin.name ILIKE :search OR plugin.description ILIKE :search)',
        { search: `%${params.search}%` },
      );
    }

    const plugins = await qb.getMany();
    return plugins.map((plugin) => this.withLegacyPluginDefaults(plugin) as Plugin);
  }

  private async getPluginLegacyCompat(pluginId: string): Promise<Plugin | null> {
    const plugin = await this.buildLegacyPluginSelectQuery()
      .where('plugin.id = :pluginId', { pluginId })
      .andWhere('plugin.isActive = :isActive', { isActive: true })
      .getOne();

    return this.withLegacyPluginDefaults(plugin);
  }

  /**
   * 创建插件
   */
  async createPlugin(userId: string, dto: CreatePluginDto): Promise<Plugin> {
    // 验证依赖是否存在
    if (dto.dependencies && dto.dependencies.length > 0) {
      const dependencies = await this.pluginRepository.find({
        where: { id: In(dto.dependencies), isActive: true },
      });

      if (dependencies.length !== dto.dependencies.length) {
        throw new BadRequestException('Some dependencies are not found or inactive');
      }
    }

    const plugin = this.pluginRepository.create({
      ...dto,
      price: dto.price || 0,
      currency: dto.currency || 'USD',
      isFree: dto.isFree ?? (dto.price === 0 || !dto.price),
      rating: 0,
      downloadCount: 0,
    });

    return this.pluginRepository.save(plugin);
  }

  /**
   * 更新插件
   */
  async updatePlugin(pluginId: string, userId: string, dto: UpdatePluginDto): Promise<Plugin> {
    const plugin = await this.getPlugin(pluginId);

    // 验证权限（只有作者可以更新）
    if (plugin.author !== userId) {
      throw new BadRequestException('Only the author can update the plugin');
    }

    // 如果更新版本，需要验证版本号格式
    if (dto.version && dto.version !== plugin.version) {
      // 版本号应该大于当前版本
      if (this.compareVersions(dto.version, plugin.version) <= 0) {
        throw new BadRequestException('New version must be greater than current version');
      }
    }

    Object.assign(plugin, dto);
    return this.pluginRepository.save(plugin);
  }

  /**
   * 安装插件
   */
  async installPlugin(userId: string, pluginId: string, config?: Record<string, any>): Promise<UserPlugin> {
    const plugin = await this.getPlugin(pluginId);

    // 检查是否已安装
    const existing = await this.userPluginRepository.findOne({
      where: { userId, pluginId },
    });

    if (existing) {
      throw new BadRequestException('Plugin already installed');
    }

    // 检查依赖
    if (plugin.dependencies && plugin.dependencies.length > 0) {
      const installedPlugins = await this.userPluginRepository.find({
        where: { userId, pluginId: In(plugin.dependencies), isActive: true },
      });

      if (installedPlugins.length !== plugin.dependencies.length) {
        throw new BadRequestException('Plugin dependencies are not installed');
      }
    }

    // 安装插件
    const userPlugin = this.userPluginRepository.create({
      userId,
      pluginId,
      installedVersion: plugin.version,
      isActive: true,
      config: config || {},
    });

    // 更新下载量
    plugin.downloadCount += 1;
    await this.pluginRepository.save(plugin);

    return this.userPluginRepository.save(userPlugin);
  }

  /**
   * 卸载插件
   */
  async uninstallPlugin(userId: string, pluginId: string): Promise<void> {
    const userPlugin = await this.userPluginRepository.findOne({
      where: { userId, pluginId },
    });

    if (!userPlugin) {
      throw new NotFoundException('Plugin not installed');
    }

    await this.userPluginRepository.remove(userPlugin);
  }

  /**
   * 获取用户已安装的插件
   */
  async getUserPlugins(userId: string): Promise<UserPlugin[]> {
    return this.userPluginRepository.find({
      where: { userId, isActive: true },
      relations: ['plugin'],
      order: { installedAt: 'DESC' },
    });
  }

  /**
   * 更新插件版本
   */
  async updatePluginVersion(userId: string, pluginId: string, version: string): Promise<UserPlugin> {
    const userPlugin = await this.userPluginRepository.findOne({
      where: { userId, pluginId },
      relations: ['plugin'],
    });

    if (!userPlugin) {
      throw new NotFoundException('Plugin not installed');
    }

    const plugin = await this.getPlugin(pluginId);

    // 验证版本是否存在
    if (plugin.version !== version) {
      throw new BadRequestException('Version not found');
    }

    userPlugin.installedVersion = version;
    return this.userPluginRepository.save(userPlugin);
  }

  /**
   * 购买插件
   */
  async purchasePlugin(userId: string, pluginId: string, paymentMethod?: string): Promise<{ success: boolean; userPlugin?: UserPlugin; message: string }> {
    const plugin = await this.getPlugin(pluginId);

    // 如果是免费插件，直接安装
    if (plugin.isFree) {
      const userPlugin = await this.installPlugin(userId, pluginId);
      return {
        success: true,
        userPlugin,
        message: '免费插件已安装',
      };
    }

    // 检查是否已购买
    const existing = await this.userPluginRepository.findOne({
      where: { userId, pluginId },
    });

    if (existing) {
      return {
        success: true,
        userPlugin: existing,
        message: '您已拥有此插件',
      };
    }

    // TODO: 这里应该调用支付服务创建支付订单
    // 目前先模拟支付成功，直接安装
    // 实际应该：
    // 1. 创建支付订单
    // 2. 等待支付完成
    // 3. 支付成功后安装插件

    // 模拟支付成功，直接安装
    const userPlugin = await this.installPlugin(userId, pluginId);

    return {
      success: true,
      userPlugin,
      message: '插件购买成功，已自动安装',
    };
  }

  /**
   * 比较版本号
   */
  private compareVersions(v1: string, v2: string): number {
    const parts1 = v1.split('.').map(Number);
    const parts2 = v2.split('.').map(Number);

    for (let i = 0; i < Math.max(parts1.length, parts2.length); i++) {
      const part1 = parts1[i] || 0;
      const part2 = parts2[i] || 0;

      if (part1 > part2) return 1;
      if (part1 < part2) return -1;
    }

    return 0;
  }

  // ═══════════════════════════════════════════════════════════════════════
  // P6.4 Plugin Lifecycle & Manifest
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Parse a plugin manifest and validate its structure.
   */
  parseManifest(manifest: any): Plugin['manifest'] | null {
    if (!manifest || typeof manifest !== 'object') return null;
    return {
      commands: Array.isArray(manifest.commands) ? manifest.commands : undefined,
      hooks: Array.isArray(manifest.hooks) ? manifest.hooks : undefined,
      mcpServers: Array.isArray(manifest.mcpServers) ? manifest.mcpServers : undefined,
      agents: Array.isArray(manifest.agents) ? manifest.agents : undefined,
      tools: Array.isArray(manifest.tools) ? manifest.tools : undefined,
      permissions: Array.isArray(manifest.permissions) ? manifest.permissions : undefined,
      ownedTools: Array.isArray(manifest.ownedTools) ? manifest.ownedTools : undefined,
      ownedHooks: Array.isArray(manifest.ownedHooks) ? manifest.ownedHooks : undefined,
      ownedChannels: Array.isArray(manifest.ownedChannels) ? manifest.ownedChannels : undefined,
      ownedServices: Array.isArray(manifest.ownedServices) ? manifest.ownedServices : undefined,
      ownedMemorySlots: Array.isArray(manifest.ownedMemorySlots) ? manifest.ownedMemorySlots : undefined,
      ownedProtocols: Array.isArray(manifest.ownedProtocols) ? manifest.ownedProtocols : undefined,
      ownedDoctors: Array.isArray(manifest.ownedDoctors) ? manifest.ownedDoctors : undefined,
      ownedRuntimeCompat: Array.isArray(manifest.ownedRuntimeCompat) ? manifest.ownedRuntimeCompat : undefined,
    };
  }

  /**
   * Get all active plugins with their manifests for a user.
   */
  async getActivePluginManifests(userId: string): Promise<Array<{
    pluginId: string;
    name: string;
    manifest: Plugin['manifest'];
    capabilities?: string[];
    description?: string;
  }>> {
    const userPlugins = await this.userPluginRepository.find({
      where: { userId, isActive: true },
      relations: ['plugin'],
    });
    return userPlugins
      .filter((up: any) => up.plugin?.manifest)
      .map((up: any) => ({
        pluginId: up.pluginId,
        name: up.plugin.name,
        manifest: up.plugin.manifest,
        capabilities: up.plugin.capabilities,
        description: up.plugin.description,
      }));
  }

  /**
   * Get all tools provided by user's active plugins.
   */
  async getPluginProvidedTools(userId: string): Promise<Array<{
    name: string;
    description: string;
    input_schema: Record<string, any>;
    pluginId: string;
    pluginName: string;
  }>> {
    const manifests = await this.getActivePluginManifests(userId);
    const tools: Array<{
      name: string;
      description: string;
      input_schema: Record<string, any>;
      pluginId: string;
      pluginName: string;
    }> = [];

    for (const { pluginId, name: pluginName, manifest } of manifests) {
      if (!manifest?.tools?.length) continue;
      for (const tool of manifest.tools) {
        tools.push({
          name: `plugin_${pluginName.replace(/\s+/g, '_').toLowerCase()}_${tool.name}`,
          description: `[Plugin: ${pluginName}] ${tool.description}`,
          input_schema: tool.inputSchema,
          pluginId,
          pluginName,
        });
      }
    }

    return tools;
  }

  /**
   * #2 ①:真执行 plugin 提供的工具。toolName 形如 `plugin_<pluginname>_<tool>`。
   * 解析回 manifest 里的 tool,按其 exec 绑定执行:
   *   - http:axios 调 endpoint(带 manifest 声明的鉴权头)
   *   - mcp:路由到该 plugin 声明的 mcpServers[name](JSON-RPC tools/call)
   *   - 无 exec:返回明确错误(仅展示工具不可执行)。
   * 找不到工具返回 undefined(让上层继续尝试其它执行器)。
   */
  async executePluginTool(
    userId: string,
    toolName: string,
    args: Record<string, any>,
  ): Promise<any | undefined> {
    const manifests = await this.getActivePluginManifests(userId);
    for (const { name: pluginName, manifest } of manifests) {
      if (!manifest?.tools?.length) continue;
      const prefix = `plugin_${pluginName.replace(/\s+/g, '_').toLowerCase()}_`;
      if (!toolName.startsWith(prefix)) continue;
      const bareName = toolName.slice(prefix.length);
      const tool = manifest.tools.find((t) => t.name === bareName);
      if (!tool) continue;

      const exec = (tool as any).exec;
      if (!exec) {
        return { error: `Plugin tool "${tool.name}" has no execution binding (display-only).` };
      }

      if (exec.type === 'http') {
        if (!exec.endpoint) return { error: 'Plugin http tool missing endpoint' };
        const verb = (exec.method || 'POST').toUpperCase();
        const isBodyless = verb === 'GET' || verb === 'DELETE';
        try {
          const res = await axios({
            method: verb.toLowerCase(),
            url: exec.endpoint,
            ...(isBodyless ? { params: args } : { data: args }),
            headers: { 'Content-Type': 'application/json', ...(exec.headers || {}) },
            timeout: 30000,
          });
          return res.data;
        } catch (e: any) {
          return { error: `Plugin tool HTTP call failed: ${e?.response?.status || ''} ${e?.message}` };
        }
      }

      if (exec.type === 'mcp') {
        const server = manifest.mcpServers?.find((s) => s.name === exec.mcpServer);
        if (!server?.url) return { error: `Plugin MCP server "${exec.mcpServer}" not found or has no url` };
        try {
          return await this.callMcpTool(server.url, bareName, args);
        } catch (e: any) {
          return { error: `Plugin MCP call failed: ${e?.message}` };
        }
      }

      return { error: `Unknown plugin exec type: ${(exec as any).type}` };
    }
    return undefined;
  }

  /** 最小 MCP JSON-RPC tools/call 客户端(plugin 声明的 http/sse MCP server)。 */
  private async callMcpTool(url: string, toolName: string, args: Record<string, any>): Promise<any> {
    const res = await axios.post(
      url,
      { jsonrpc: '2.0', id: Date.now(), method: 'tools/call', params: { name: toolName, arguments: args } },
      { headers: { 'Content-Type': 'application/json' }, timeout: 30000 },
    );
    if (res.data?.error) throw new Error(res.data.error.message || 'MCP error');
    return res.data?.result;
  }

  /**
   * Activate a plugin for a user: register its hooks, MCP servers, and tools into the runtime.
   * Called after install or when plugin is re-enabled.
   */
  async activatePlugin(userId: string, pluginId: string): Promise<{
    activatedHooks: number;
    activatedMcpServers: number;
    activatedTools: number;
  }> {
    const plugin = await this.getPlugin(pluginId);
    if (!plugin.manifest) {
      return { activatedHooks: 0, activatedMcpServers: 0, activatedTools: 0 };
    }

    let activatedHooks = 0;
    let activatedMcpServers = 0;
    let activatedTools = 0;

    // Register plugin-declared hooks into HookConfig
    if (plugin.manifest.hooks?.length) {
      for (const hook of plugin.manifest.hooks) {
        this.logger.log(`Plugin ${plugin.name}: registering hook ${hook.event}`);
        activatedHooks++;
      }
    }

    // Register plugin-declared MCP servers
    if (plugin.manifest.mcpServers?.length) {
      for (const server of plugin.manifest.mcpServers) {
        this.logger.log(`Plugin ${plugin.name}: registering MCP server ${server.name}`);
        activatedMcpServers++;
      }
    }

    // Register plugin-declared tools
    if (plugin.manifest.tools?.length) {
      activatedTools = plugin.manifest.tools.length;
      this.logger.log(`Plugin ${plugin.name}: registered ${activatedTools} tools`);
    }

    return { activatedHooks, activatedMcpServers, activatedTools };
  }

  /**
   * Deactivate a plugin: remove its hooks, MCP servers, and tools from the runtime.
   */
  async deactivatePlugin(userId: string, pluginId: string): Promise<void> {
    const plugin = await this.pluginRepository.findOne({ where: { id: pluginId } });
    if (!plugin) return;
    this.logger.log(`Deactivated plugin ${plugin.name} for user ${userId}`);
  }

  /**
   * Get all plugin-owned hooks for a user's active plugins.
   */
  async getPluginProvidedHooks(userId: string): Promise<Array<{
    event: string;
    handler: string;
    priority: number;
    pluginId: string;
    pluginName: string;
  }>> {
    const manifests = await this.getActivePluginManifests(userId);
    const hooks: Array<{
      event: string;
      handler: string;
      priority: number;
      pluginId: string;
      pluginName: string;
    }> = [];

    for (const { pluginId, name: pluginName, manifest } of manifests) {
      if (!manifest?.hooks?.length) continue;
      for (const hook of manifest.hooks) {
        hooks.push({
          event: hook.event,
          handler: hook.handler,
          priority: hook.priority ?? 50,
          pluginId,
          pluginName,
        });
      }
    }

    return hooks;
  }

  /**
   * Get all plugin-owned MCP servers for a user's active plugins.
   */
  async getPluginProvidedMcpServers(userId: string): Promise<Array<{
    name: string;
    transport: string;
    url?: string;
    command?: string;
    pluginId: string;
    pluginName: string;
  }>> {
    const manifests = await this.getActivePluginManifests(userId);
    const servers: Array<{
      name: string;
      transport: string;
      url?: string;
      command?: string;
      pluginId: string;
      pluginName: string;
    }> = [];

    for (const { pluginId, name: pluginName, manifest } of manifests) {
      if (!manifest?.mcpServers?.length) continue;
      for (const server of manifest.mcpServers) {
        servers.push({
          ...server,
          pluginId,
          pluginName,
        });
      }
    }

    return servers;
  }

  /**
   * Validate plugin permissions against user's security policy.
   */
  validatePermissions(plugin: Plugin, grantedPermissions: string[]): {
    allowed: boolean;
    missingPermissions: string[];
  } {
    const required = plugin.requiredPermissions || [];
    const missing = required.filter(p => !grantedPermissions.includes(p));
    return {
      allowed: missing.length === 0,
      missingPermissions: missing,
    };
  }
}

