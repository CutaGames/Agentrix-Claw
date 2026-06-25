import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
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

    return qb.getMany();
  }

  /**
   * 获取插件详情
   */
  async getPlugin(pluginId: string): Promise<Plugin> {
    const plugin = await this.pluginRepository.findOne({
      where: { id: pluginId, isActive: true },
    });

    if (!plugin) {
      throw new NotFoundException('Plugin not found');
    }

    return plugin;
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
}

