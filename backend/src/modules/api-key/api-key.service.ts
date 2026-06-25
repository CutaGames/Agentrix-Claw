import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan } from 'typeorm';
import { ApiKey, ApiKeyStatus, ApiKeyMode } from '../../entities/api-key.entity';
import * as crypto from 'crypto';

/**
 * API Key 服务
 * 负责生成、验证、管理 API Keys
 * 
 * 支持两种类型的 Key：
 * 1. 平台级 Key (Platform Key) - 用于 GPTs/第三方集成，配置在环境变量中
 * 2. 用户级 Key (User Key) - 用于开发者/商户 API 调用，存储在数据库中
 */
@Injectable()
export class ApiKeyService {
  private readonly logger = new Logger(ApiKeyService.name);
  
  // API Key 前缀
  private readonly KEY_PREFIX = 'agx_';
  
  // 平台级 API Key 前缀
  private readonly PLATFORM_KEY_PREFIX = 'agx_platform_';
  private readonly GPTS_KEY_PREFIX = 'agx_gpts_';
  
  // 缓存验证结果（减少数据库查询）
  private readonly validationCache = new Map<string, { userId: string; expiresAt: number; mode: ApiKeyMode }>();
  private readonly CACHE_TTL = 5 * 60 * 1000; // 5分钟缓存
  
  // 平台级 API Keys（从环境变量加载，或使用默认值）
  private readonly platformKeys: Set<string>;

  constructor(
    @InjectRepository(ApiKey)
    private apiKeyRepository: Repository<ApiKey>,
  ) {
    // 初始化平台级 Keys
    this.platformKeys = this.loadPlatformKeys();
    this.logger.log(`Loaded ${this.platformKeys.size} platform API keys`);
  }
  
  /**
   * 加载平台级 API Keys
   * 从环境变量 PLATFORM_API_KEYS 加载（逗号分隔）
   * 如果未配置，使用默认的测试 Key
   */
  private loadPlatformKeys(): Set<string> {
    const keys = new Set<string>();
    
    // 从环境变量加载
    const envKeys = process.env.PLATFORM_API_KEYS;
    if (envKeys) {
      envKeys.split(',').forEach(key => {
        const trimmedKey = key.trim();
        if (trimmedKey) {
          keys.add(trimmedKey);
        }
      });
    }
    
    // 添加默认的 GPTs 平台 Key（用于测试和开发）
    // 生产环境应该通过环境变量配置
    const defaultGptsKey = process.env.GPTS_PLATFORM_KEY || 'agx_gpts_platform_2024_xK9mP3nQ7rT2wY5z';
    keys.add(defaultGptsKey);
    
    return keys;
  }
  
  /**
   * 验证是否为平台级 API Key
   */
  isPlatformKey(apiKey: string): boolean {
    return this.platformKeys.has(apiKey) ||
           apiKey.startsWith(this.PLATFORM_KEY_PREFIX) ||
           apiKey.startsWith(this.GPTS_KEY_PREFIX);
  }
  
  /**
   * 验证平台级 API Key
   * 返回 true 如果 Key 有效
   */
  validatePlatformKey(apiKey: string): boolean {
    // 检查是否在允许列表中
    if (this.platformKeys.has(apiKey)) {
      return true;
    }
    
    // 检查是否为有效的平台 Key 格式
    if (apiKey.startsWith(this.GPTS_KEY_PREFIX) || apiKey.startsWith(this.PLATFORM_KEY_PREFIX)) {
      // 平台 Key 格式验证：至少 30 个字符
      if (apiKey.length >= 30) {
        this.logger.log(`Accepting platform key: ${apiKey.substring(0, 15)}...`);
        return true;
      }
    }
    
    return false;
  }

  /**
   * 生成新的 API Key
   */
  async createApiKey(
    userId: string,
    name: string,
    options?: {
      expiresInDays?: number;
      scopes?: string[];
      rateLimit?: number;
      allowedOrigins?: string[];
      metadata?: Record<string, any>;
      mode?: ApiKeyMode;
    },
  ): Promise<{ apiKey: string; apiKeyRecord: ApiKey }> {
    const mode = options?.mode || ApiKeyMode.PRODUCTION;
    const prefix = mode === ApiKeyMode.SANDBOX ? 'agx_test_' : 'agx_live_';

    // 生成随机 Key
    const randomBytes = crypto.randomBytes(32);
    const apiKey = prefix + randomBytes.toString('base64url');
    
    // 计算哈希（用于存储）
    const keyHash = this.hashKey(apiKey);
    
    // Key 前缀（用于显示）
    const keyPrefix = apiKey.substring(0, 12) + '...';
    
    // 计算过期时间
    let expiresAt: Date | null = null;
    if (options?.expiresInDays) {
      expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + options.expiresInDays);
    }
    
    // 创建记录
    const apiKeyRecord = this.apiKeyRepository.create({
      keyHash,
      keyPrefix,
      name,
      userId,
      status: ApiKeyStatus.ACTIVE,
      mode,
      expiresAt,
      scopes: options?.scopes || ['read', 'search', 'order', 'payment'],
      rateLimit: options?.rateLimit || 60,
      allowedOrigins: options?.allowedOrigins || null,
      metadata: options?.metadata || null,
    });
    
    await this.apiKeyRepository.save(apiKeyRecord);
    
    this.logger.log(`Created ${mode} API Key for user ${userId}: ${keyPrefix}`);
    
    // 返回原始 Key（只有这一次机会看到完整 Key）
    return { apiKey, apiKeyRecord };
  }

  /**
   * 验证 API Key
   * 返回关联的用户 ID，如果无效则抛出异常
   * 
   * 验证顺序：
   * 1. 检查是否为平台级 Key（GPTs/第三方集成）
   * 2. 检查缓存
   * 3. 查询数据库验证用户级 Key
   */
  async validateApiKey(apiKey: string): Promise<{ userId: string; scopes: string[]; isPlatform: boolean; mode: ApiKeyMode }> {
    if (!apiKey) {
      throw new UnauthorizedException('API Key is required');
    }
    
    // 1. 首先检查是否为平台级 Key
    if (this.validatePlatformKey(apiKey)) {
      this.logger.debug(`Platform API Key validated: ${apiKey.substring(0, 15)}...`);
      return { 
        userId: 'platform', 
        scopes: ['read', 'search', 'order', 'payment'],
        isPlatform: true,
        mode: ApiKeyMode.PRODUCTION
      };
    }
    
    // 2. 检查缓存
    const cached = this.validationCache.get(apiKey);
    if (cached && cached.expiresAt > Date.now()) {
      return { 
        userId: cached.userId, 
        scopes: ['read', 'search', 'order', 'payment'], 
        isPlatform: false,
        mode: cached.mode || ApiKeyMode.PRODUCTION
      };
    }
    
    // 3. 计算哈希并查询数据库
    const keyHash = this.hashKey(apiKey);
    
    // 查找 Key
    const apiKeyRecord = await this.apiKeyRepository.findOne({
      where: { keyHash },
    });
    
    if (!apiKeyRecord) {
      this.logger.warn(`Invalid API Key attempted: ${apiKey.substring(0, 12)}...`);
      throw new UnauthorizedException('Invalid API Key');
    }
    
    // 检查状态
    if (apiKeyRecord.status !== ApiKeyStatus.ACTIVE) {
      throw new UnauthorizedException(`API Key is ${apiKeyRecord.status}`);
    }
    
    // 检查过期
    if (apiKeyRecord.expiresAt && apiKeyRecord.expiresAt < new Date()) {
      apiKeyRecord.status = ApiKeyStatus.EXPIRED;
      await this.apiKeyRepository.save(apiKeyRecord);
      throw new UnauthorizedException('API Key has expired');
    }
    
    // 更新最后使用时间（异步，不阻塞验证）
    this.apiKeyRepository.update(apiKeyRecord.id, { lastUsedAt: new Date() }).catch(err => {
      this.logger.error(`Failed to update lastUsedAt for API Key ${apiKeyRecord.id}: ${err.message}`);
    });
    
    // 写入缓存
    this.validationCache.set(apiKey, {
      userId: apiKeyRecord.userId,
      expiresAt: Date.now() + 1000 * 60 * 5, // 5 分钟缓存
      mode: apiKeyRecord.mode
    });
    
    return { 
      userId: apiKeyRecord.userId, 
      scopes: apiKeyRecord.scopes, 
      isPlatform: false,
      mode: apiKeyRecord.mode
    };
  }

  /**
   * 从请求头中提取 API Key
   * 支持多种 Header 名称
   */
  extractApiKeyFromHeaders(headers: Record<string, string | string[] | undefined>): string | null {
    // 支持的 Header 名称（按优先级）
    const headerNames = [
      'x-api-key',
      'agentrix-api-key',
      'authorization',
    ];
    
    for (const name of headerNames) {
      const value = headers[name] || headers[name.toLowerCase()];
      if (value) {
        const headerValue = Array.isArray(value) ? value[0] : value;
        
        // 处理 Bearer token 格式
        if (name === 'authorization' && headerValue.toLowerCase().startsWith('bearer ')) {
          return headerValue.substring(7);
        }
        
        return headerValue;
      }
    }
    
    return null;
  }

  /**
   * 获取用户的所有 API Keys
   */
  async getUserApiKeys(userId: string): Promise<ApiKey[]> {
    return this.apiKeyRepository.find({
      where: { userId },
      order: { createdAt: 'DESC' },
    });
  }

  /**
   * 撤销 API Key
   */
  async revokeApiKey(userId: string, keyId: string): Promise<void> {
    const result = await this.apiKeyRepository.update(
      { id: keyId, userId },
      { status: ApiKeyStatus.REVOKED },
    );
    
    if (result.affected === 0) {
      throw new Error('API Key not found or not owned by user');
    }
    
    this.logger.log(`Revoked API Key ${keyId} for user ${userId}`);
  }

  /**
   * 删除 API Key
   */
  async deleteApiKey(userId: string, keyId: string): Promise<void> {
    const result = await this.apiKeyRepository.delete({ id: keyId, userId });
    
    if (result.affected === 0) {
      throw new Error('API Key not found or not owned by user');
    }
    
    this.logger.log(`Deleted API Key ${keyId} for user ${userId}`);
  }

  /**
   * 清理过期的 Keys
   */
  async cleanupExpiredKeys(): Promise<number> {
    const result = await this.apiKeyRepository.update(
      {
        status: ApiKeyStatus.ACTIVE,
        expiresAt: LessThan(new Date()),
      },
      { status: ApiKeyStatus.EXPIRED },
    );
    
    if (result.affected && result.affected > 0) {
      this.logger.log(`Marked ${result.affected} API Keys as expired`);
    }
    
    return result.affected || 0;
  }

  /**
   * 计算 Key 的哈希值
   */
  private hashKey(apiKey: string): string {
    return crypto.createHash('sha256').update(apiKey).digest('hex');
  }
}
