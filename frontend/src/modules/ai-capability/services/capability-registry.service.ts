import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Product } from '../../../entities/product.entity';
import { PlatformRegistryService } from './platform-registry.service';
import {
  CapabilityNode,
  FunctionSchema,
  AIPlatform,
  CapabilityType,
  CapabilityRegistrationOptions,
  SystemCapability,
} from '../interfaces/capability.interface';

@Injectable()
export class CapabilityRegistryService {
  private readonly logger = new Logger(CapabilityRegistryService.name);
  private readonly cache: Map<string, CapabilityNode[]> = new Map();
  private readonly systemCapabilities: Map<string, SystemCapability> = new Map();

  constructor(
    private platformRegistry: PlatformRegistryService,
    @InjectRepository(Product)
    private productRepository: Repository<Product>,
  ) {
    // 注册默认系统级能力
    this.registerDefaultSystemCapabilities();
  }

  /**
   * 为产品注册能力（自动生成并缓存）
   * 如果不指定平台，则自动注册所有已注册的平台
   */
  async register(
    productId: string,
    platforms?: AIPlatform[],
    options: CapabilityRegistrationOptions = {},
  ): Promise<FunctionSchema[]> {
    const product = await this.productRepository.findOne({
      where: { id: productId },
    });

    if (!product) {
      throw new Error(`Product not found: ${productId}`);
    }

    // 确定能力类型
    const capabilityType = this.determineCapabilityType(product);

    // 确定目标平台：如果未指定，则使用所有已注册的平台
    const targetPlatforms =
      options.platforms || platforms || this.platformRegistry.getAllActivePlatforms();

    // 初始化 schemas 数组
    const schemas: any[] = [];

    for (const platform of targetPlatforms) {
      try {
        // 检查平台是否已注册
        if (!this.platformRegistry.isPlatformRegistered(platform)) {
          this.logger.warn(`Platform ${platform} is not registered, skipping...`);
          continue;
        }

        const adapter = this.platformRegistry.getAdapter(platform);
        const schema = adapter.convertProductToFunction(product, capabilityType);

        // 验证 schema
        if (adapter.validateSchema(schema)) {
          schemas.push(schema);

          // 创建能力节点（内存中，可以后续持久化）
          const capabilityNode: CapabilityNode = {
            id: `${productId}_${platform}_${capabilityType}`,
            productId: product.id,
            productType: product.productType,
            capabilityType,
            platform,
            schema,
            executor: this.getExecutorName(capabilityType),
            enabled: options.autoEnable !== false,
            createdAt: new Date(),
            updatedAt: new Date(),
          };

          // 缓存能力节点
          this.cacheCapability(capabilityNode);
        } else {
          this.logger.warn(`Invalid schema for product ${productId} on platform ${platform}`);
        }
      } catch (error) {
        this.logger.error(
          `Failed to register capability for product ${productId} on platform ${platform}: ${error.message}`,
        );
      }
    }

    // 更新产品的 metadata.aiCompatible 字段
    await this.updateProductMetadata(product, schemas, targetPlatforms);

    return schemas;
  }

  /**
   * 批量注册能力
   * 如果不指定平台，则自动注册所有已注册的平台
   */
  async registerBatch(
    productIds: string[],
    platforms?: AIPlatform[],
    options: CapabilityRegistrationOptions = {},
  ): Promise<Map<string, FunctionSchema[]>> {
    const results = new Map<string, FunctionSchema[]>();

    for (const productId of productIds) {
      try {
        const schemas = await this.register(productId, platforms, options);
        results.set(productId, schemas);
      } catch (error) {
        this.logger.error(`Failed to register capabilities for product ${productId}: ${error.message}`);
        results.set(productId, []);
      }
    }

    return results;
  }

  /**
   * 获取指定平台的所有能力
   */
  async getAllCapabilities(platform: AIPlatform): Promise<FunctionSchema[]> {
    // 从缓存获取
    const cached = this.getCachedCapabilities(platform);
    if (cached.length > 0) {
      return cached.map((node) => node.schema);
    }

    // 如果缓存为空，从数据库加载所有活跃商品并注册
    const activeProducts = await this.productRepository.find({
      where: { status: 'active' as any },
    });

    const allSchemas: FunctionSchema[] = [];
    // 使用所有已注册的平台
    const allPlatforms = this.platformRegistry.getAllActivePlatforms();
    for (const product of activeProducts) {
      try {
        const schemas = await this.register(product.id, allPlatforms);
        allSchemas.push(...schemas.filter((s) => {
          // 过滤出指定平台的 schema（通过检查 schema 格式判断）
          // 这里简化处理，实际应该通过平台 ID 匹配
          return true; // 暂时返回所有，后续可以优化
        }));
      } catch (error) {
        this.logger.warn(`Failed to load capability for product ${product.id}: ${error.message}`);
      }
    }

    return allSchemas;
  }

  /**
   * 获取指定产品的所有能力
   */
  async getProductCapabilities(productId: string, platform?: AIPlatform): Promise<FunctionSchema[]> {
    const product = await this.productRepository.findOne({
      where: { id: productId },
    });

    if (!product) {
      return [];
    }

    // 从 metadata 读取已生成的能力
    const metadata = product.metadata || {};
    const aiCompatible = metadata.aiCompatible || {};

    if (platform) {
      // 返回指定平台的能力
      const platformSchema = aiCompatible[platform];
      return platformSchema ? [platformSchema.function || platformSchema] : [];
    } else {
      // 返回所有平台的能力
      const schemas: FunctionSchema[] = [];
      if (aiCompatible.openai) {
        schemas.push(aiCompatible.openai.function);
      }
      if (aiCompatible.claude) {
        schemas.push(aiCompatible.claude);
      }
      if (aiCompatible.gemini) {
        schemas.push(aiCompatible.gemini);
      }
      return schemas.filter(Boolean);
    }
  }

  /**
   * 确定产品的能力类型
   */
  private determineCapabilityType(product: Product): CapabilityType {
    switch (product.productType) {
      case 'physical':
        return 'purchase';
      case 'service':
        return 'book';
      case 'nft':
      case 'ft':
      case 'game_asset':
        return 'mint';
      default:
        return 'purchase';
    }
  }

  /**
   * 获取执行器名称
   */
  private getExecutorName(capabilityType: CapabilityType): string {
    return `executor_${capabilityType}`;
  }

  /**
   * 缓存能力节点
   */
  private cacheCapability(capability: CapabilityNode): void {
    const key = `${capability.platform}_${capability.productId}`;
    const existing = this.cache.get(key) || [];
    const index = existing.findIndex((c) => c.id === capability.id);
    if (index >= 0) {
      existing[index] = capability;
    } else {
      existing.push(capability);
    }
    this.cache.set(key, existing);
  }

  /**
   * 从缓存获取能力
   */
  private getCachedCapabilities(platform: AIPlatform): CapabilityNode[] {
    const allCapabilities: CapabilityNode[] = [];
    for (const [key, capabilities] of this.cache.entries()) {
      if (key.startsWith(`${platform}_`)) {
        allCapabilities.push(...capabilities);
      }
    }
    return allCapabilities;
  }

  /**
   * 更新产品的 metadata.aiCompatible 字段
   */
  private async updateProductMetadata(
    product: Product,
    schemas: FunctionSchema[],
    platforms: AIPlatform[],
  ): Promise<void> {
    const metadata = product.metadata || {};
    const aiCompatible = metadata.aiCompatible || {};

    // 按平台组织 schema
    for (let i = 0; i < platforms.length; i++) {
      const platform = platforms[i];
      const schema = schemas[i];

      if (schema) {
        // 动态存储，支持任意平台
      // 使用平台 ID 作为 key
      if (!aiCompatible[platform]) {
        aiCompatible[platform] = {};
      }
      
      // 根据平台类型存储不同格式
      // OpenAI 格式使用 function 字段
      if (platform === 'openai' && 'parameters' in schema) {
        aiCompatible[platform] = {
          function: schema as any,
        };
      } else if (platform === 'claude' && 'input_schema' in schema) {
        // Claude 格式直接存储
        aiCompatible[platform] = schema as any;
      } else {
        // 其他平台统一存储
        aiCompatible[platform] = schema as any;
      }
      }
    }

    // 更新产品
    product.metadata = {
      ...metadata,
      aiCompatible,
    };

    await this.productRepository.save(product);
  }

  /**
   * 注册系统级能力（非商品相关）
   */
  registerSystemCapability(capability: SystemCapability): void {
    this.systemCapabilities.set(capability.id, capability);
    this.logger.log(`系统级能力已注册: ${capability.id} (${capability.name})`);
  }

  /**
   * 获取所有系统级能力
   */
  getSystemCapabilities(): SystemCapability[] {
    return Array.from(this.systemCapabilities.values()).filter(c => c.enabled !== false);
  }

  /**
   * 获取系统级能力的 Function Schemas（所有平台）
   * @param platforms 平台列表，如果不指定则使用所有已注册的平台
   * @param externalOnly 是否只返回外部暴露的能力（供AI平台和SDK调用）
   */
  getSystemCapabilitySchemas(platforms?: AIPlatform[], externalOnly?: boolean): FunctionSchema[] {
    const targetPlatforms = platforms || this.platformRegistry.getAllActivePlatforms();
    const schemas: FunctionSchema[] = [];

    // 获取系统能力，如果externalOnly为true，只返回externalExposed为true的能力
    const capabilities = this.getSystemCapabilities().filter(cap => {
      if (externalOnly) {
        return cap.externalExposed === true;
      }
      return true;
    });

    for (const capability of capabilities) {
      for (const platform of targetPlatforms) {
        try {
          const adapter = this.platformRegistry.getAdapter(platform);
          const schema = adapter.convertSystemCapabilityToFunction(capability);
          if (adapter.validateSchema(schema)) {
            schemas.push(schema);
          }
        } catch (error) {
          this.logger.warn(`Failed to convert system capability ${capability.id} for platform ${platform}`);
        }
      }
    }

    return schemas;
  }

  /**
   * 注册默认系统级能力
   */
  private registerDefaultSystemCapabilities(): void {
    // 电商流程
    this.registerSystemCapability({
      id: 'search_products',
      name: 'search_agentrix_products',
      description: '搜索 Agentrix Marketplace 中的商品',
      category: 'ecommerce',
      executor: 'executor_search',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: '搜索查询' },
          category: { type: 'string', description: '商品分类' },
          priceMin: { type: 'number', description: '最低价格' },
          priceMax: { type: 'number', description: '最高价格' },
        },
        required: ['query'],
      },
      enabled: true,
    });

    this.registerSystemCapability({
      id: 'add_to_cart',
      name: 'add_to_agentrix_cart',
      description: '将商品加入购物车',
      category: 'ecommerce',
      executor: 'executor_cart',
      parameters: {
        type: 'object',
        properties: {
          product_id: { type: 'string', description: '商品ID' },
          quantity: { type: 'number', description: '数量' },
        },
        required: ['product_id'],
      },
      enabled: true,
    });

    this.registerSystemCapability({
      id: 'checkout_cart',
      name: 'checkout_agentrix_cart',
      description: '结算购物车',
      category: 'ecommerce',
      executor: 'executor_checkout',
      parameters: {
        type: 'object',
        properties: {},
      },
      enabled: true,
    });

    this.registerSystemCapability({
      id: 'view_cart',
      name: 'view_agentrix_cart',
      description: '查看购物车',
      category: 'ecommerce',
      executor: 'executor_cart',
      parameters: {
        type: 'object',
        properties: {},
      },
      enabled: true,
    });

    this.registerSystemCapability({
      id: 'track_logistics',
      name: 'track_agentrix_logistics',
      description: '查询订单物流信息',
      category: 'logistics',
      executor: 'executor_logistics',
      parameters: {
        type: 'object',
        properties: {
          order_id: { type: 'string', description: '订单ID' },
        },
        required: ['order_id'],
      },
      enabled: true,
    });

    this.registerSystemCapability({
      id: 'compare_prices',
      name: 'compare_agentrix_prices',
      description: '比较商品价格，显示最低价、最高价、平均价格和最佳性价比',
      category: 'ecommerce',
      executor: 'executor_price_comparison',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: '商品查询（可选，如果不提供则使用最近搜索结果）' },
        },
      },
      enabled: true,
    });

    this.registerSystemCapability({
      id: 'pay_order',
      name: 'pay_agentrix_order',
      description: '支付订单，为待支付订单创建支付链接',
      category: 'ecommerce',
      executor: 'executor_payment',
      parameters: {
        type: 'object',
        properties: {
          order_id: { type: 'string', description: '订单ID（可选，如果不提供则使用最近的待支付订单）' },
        },
      },
      enabled: true,
    });

    // ========== 个人Agent能力 ==========
    
    // Airdrop能力
    this.registerSystemCapability({
      id: 'discover_airdrops',
      name: 'discover_agentrix_airdrops',
      description: '发现可领取的空投机会。自动扫描链上数据、社交媒体、项目公告等，发现新的空投机会。',
      category: 'airdrop',
      executor: 'executor_airdrop',
      parameters: {
        type: 'object',
        properties: {
          chain: { type: 'string', description: '区块链网络（可选，如ethereum、solana、bsc等）' },
        },
      },
      enabled: true, // 默认启用，后续可通过配置控制
      externalExposed: true, // 允许外部AI平台和SDK调用
    });

    this.registerSystemCapability({
      id: 'get_airdrops',
      name: 'get_agentrix_airdrops',
      description: '获取用户的空投列表。返回所有已发现的空投机会，包括状态、奖励金额、领取条件等。',
      category: 'airdrop',
      executor: 'executor_airdrop',
      parameters: {
        type: 'object',
        properties: {
          status: { 
            type: 'string', 
            enum: ['monitoring', 'eligible', 'claimed', 'expired', 'failed'],
            description: '空投状态筛选（可选）' 
          },
        },
      },
      enabled: true,
      externalExposed: true, // 允许外部AI平台和SDK调用
    });

    this.registerSystemCapability({
      id: 'check_airdrop_eligibility',
      name: 'check_agentrix_airdrop_eligibility',
      description: '检查空投是否符合领取条件。验证用户是否满足所有要求（Twitter关注、Discord加入、钱包验证等）。',
      category: 'airdrop',
      executor: 'executor_airdrop',
      parameters: {
        type: 'object',
        properties: {
          airdrop_id: { type: 'string', description: '空投ID' },
        },
        required: ['airdrop_id'],
      },
      enabled: true,
      externalExposed: true, // 允许外部AI平台和SDK调用
    });

    this.registerSystemCapability({
      id: 'claim_airdrop',
      name: 'claim_agentrix_airdrop',
      description: '领取空投。自动执行领取流程，包括验证资格、调用领取API、记录交易哈希等。',
      category: 'airdrop',
      executor: 'executor_airdrop',
      parameters: {
        type: 'object',
        properties: {
          airdrop_id: { type: 'string', description: '空投ID' },
        },
        required: ['airdrop_id'],
      },
      enabled: true,
      externalExposed: true, // 允许外部AI平台和SDK调用
    });

    // AutoEarn能力
    this.registerSystemCapability({
      id: 'get_auto_earn_tasks',
      name: 'get_agentrix_auto_earn_tasks',
      description: '获取Auto-Earn任务列表。返回所有可用的自动收益任务，包括空投、任务、策略、推荐等。',
      category: 'autoearn',
      executor: 'executor_autoearn',
      parameters: {
        type: 'object',
        properties: {
          type: { 
            type: 'string', 
            enum: ['airdrop', 'task', 'strategy', 'referral'],
            description: '任务类型筛选（可选）' 
          },
        },
      },
      enabled: true,
      externalExposed: true, // 允许外部AI平台和SDK调用
    });

    this.registerSystemCapability({
      id: 'execute_auto_earn_task',
      name: 'execute_agentrix_auto_earn_task',
      description: '执行Auto-Earn任务。自动完成任务要求，领取奖励。',
      category: 'autoearn',
      executor: 'executor_autoearn',
      parameters: {
        type: 'object',
        properties: {
          task_id: { type: 'string', description: '任务ID' },
        },
        required: ['task_id'],
      },
      enabled: true,
      externalExposed: true, // 允许外部AI平台和SDK调用
    });

    this.registerSystemCapability({
      id: 'get_auto_earn_stats',
      name: 'get_agentrix_auto_earn_stats',
      description: '获取Auto-Earn统计数据。返回总收益、完成任务数、各类型收益分布等统计信息。',
      category: 'autoearn',
      executor: 'executor_autoearn',
      parameters: {
        type: 'object',
        properties: {},
      },
      enabled: true,
      externalExposed: true, // 允许外部AI平台和SDK调用
    });

    this.registerSystemCapability({
      id: 'toggle_auto_earn_strategy',
      name: 'toggle_agentrix_auto_earn_strategy',
      description: '启动或停止Auto-Earn策略。控制自动收益策略的启用状态。',
      category: 'autoearn',
      executor: 'executor_autoearn',
      parameters: {
        type: 'object',
        properties: {
          strategy_id: { type: 'string', description: '策略ID' },
          enabled: { type: 'boolean', description: '是否启用' },
        },
        required: ['strategy_id', 'enabled'],
      },
      enabled: true,
      externalExposed: true, // 允许外部AI平台调用
    });

    // ========== Phase 2 功能能力 ==========
    
    // Agent授权管理能力
    this.registerSystemCapability({
      id: 'create_agent_authorization',
      name: 'create_agentrix_agent_authorization',
      description: '创建Agent授权，设置限额和权限。可以控制Agent执行特定操作的权限，包括单次限额、每日限额、策略级权限等。',
      category: 'agent_management',
      executor: 'executor_agent_auth',
      parameters: {
        type: 'object',
        properties: {
          agentId: { type: 'string', description: 'Agent ID' },
          authorizationType: { 
            type: 'string', 
            enum: ['trading', 'airdrop', 'autoearn', 'all'],
            description: '授权类型'
          },
          singleLimit: { type: 'number', description: '单次限额（USD）' },
          dailyLimit: { type: 'number', description: '每日限额（USD）' },
          strategyPermissions: {
            type: 'array',
            description: '策略级权限配置',
            items: {
              type: 'object',
              properties: {
                strategyType: { type: 'string' },
                allowed: { type: 'boolean' },
                maxAmount: { type: 'number' }
              }
            }
          }
        },
        required: ['agentId', 'authorizationType'],
      },
      enabled: true,
      externalExposed: true, // 允许外部AI平台和SDK调用
    });

    this.registerSystemCapability({
      id: 'get_agent_authorization',
      name: 'get_agentrix_agent_authorization',
      description: '查询Agent授权信息。获取指定Agent的授权状态、限额、权限配置等。',
      category: 'agent_management',
      executor: 'executor_agent_auth',
      parameters: {
        type: 'object',
        properties: {
          agentId: { type: 'string', description: 'Agent ID' },
        },
        required: ['agentId'],
      },
      enabled: true,
      externalExposed: true,
    });

    this.registerSystemCapability({
      id: 'update_agent_authorization',
      name: 'update_agentrix_agent_authorization',
      description: '更新Agent授权。修改授权限额、权限配置等。',
      category: 'agent_management',
      executor: 'executor_agent_auth',
      parameters: {
        type: 'object',
        properties: {
          authorizationId: { type: 'string', description: '授权ID' },
          singleLimit: { type: 'number', description: '单次限额（USD，可选）' },
          dailyLimit: { type: 'number', description: '每日限额（USD，可选）' },
          strategyPermissions: {
            type: 'array',
            description: '策略级权限配置（可选）',
            items: {
              type: 'object',
              properties: {
                strategyType: { type: 'string' },
                allowed: { type: 'boolean' },
                maxAmount: { type: 'number' }
              }
            }
          }
        },
        required: ['authorizationId'],
      },
      enabled: true,
      externalExposed: true,
    });

    // 原子结算能力
    this.registerSystemCapability({
      id: 'create_atomic_settlement',
      name: 'create_agentrix_atomic_settlement',
      description: '创建原子结算。确保跨链或多资产交易要么全部成功，要么全部回滚。适用于空投领取、代币交换等需要原子性的操作。',
      category: 'trading',
      executor: 'executor_atomic_settlement',
      parameters: {
        type: 'object',
        properties: {
          transactions: {
            type: 'array',
            description: '交易列表',
            items: {
              type: 'object',
              properties: {
                chain: { type: 'string', description: '区块链网络' },
                action: { type: 'string', description: '操作类型（如claim_airdrop、swap等）' },
                params: { type: 'object', description: '操作参数' }
              },
              required: ['chain', 'action']
            }
          },
          condition: {
            type: 'string',
            enum: ['all_or_none', 'partial'],
            description: '执行条件：all_or_none表示全部成功或全部回滚，partial允许部分成功'
          }
        },
        required: ['transactions', 'condition'],
      },
      enabled: true,
      externalExposed: true,
    });

    this.registerSystemCapability({
      id: 'execute_atomic_settlement',
      name: 'execute_agentrix_atomic_settlement',
      description: '执行原子结算。执行已创建的原子结算，确保所有交易按条件执行。',
      category: 'trading',
      executor: 'executor_atomic_settlement',
      parameters: {
        type: 'object',
        properties: {
          settlementId: { type: 'string', description: '结算ID' },
        },
        required: ['settlementId'],
      },
      enabled: true,
      externalExposed: true,
    });

    this.registerSystemCapability({
      id: 'get_atomic_settlement_status',
      name: 'get_agentrix_atomic_settlement_status',
      description: '查询原子结算状态。获取结算的执行状态、交易结果等。',
      category: 'trading',
      executor: 'executor_atomic_settlement',
      parameters: {
        type: 'object',
        properties: {
          settlementId: { type: 'string', description: '结算ID' },
        },
        required: ['settlementId'],
      },
      enabled: true,
      externalExposed: true,
    });

    // 多DEX最优执行能力
    this.registerSystemCapability({
      id: 'get_best_execution',
      name: 'get_agentrix_best_execution',
      description: '获取多DEX最优执行路径。自动在多个DEX（Jupiter、Uniswap、Raydium等）中寻找最优价格和执行路径。',
      category: 'trading',
      executor: 'executor_best_execution',
      parameters: {
        type: 'object',
        properties: {
          fromToken: { type: 'string', description: '源代币地址或符号' },
          toToken: { type: 'string', description: '目标代币地址或符号' },
          amount: { type: 'string', description: '数量' },
          chain: { type: 'string', description: '区块链网络（如ethereum、solana、bsc）' },
          dexes: {
            type: 'array',
            description: 'DEX列表（可选，默认所有）',
            items: { type: 'string' }
          }
        },
        required: ['fromToken', 'toToken', 'amount'],
      },
      enabled: true,
      externalExposed: true,
    });

    this.registerSystemCapability({
      id: 'execute_best_swap',
      name: 'execute_agentrix_best_swap',
      description: '执行最优代币交换。使用多DEX聚合找到最优路径并执行交换。',
      category: 'trading',
      executor: 'executor_best_execution',
      parameters: {
        type: 'object',
        properties: {
          fromToken: { type: 'string', description: '源代币地址或符号' },
          toToken: { type: 'string', description: '目标代币地址或符号' },
          amount: { type: 'string', description: '数量' },
          chain: { type: 'string', description: '区块链网络' },
          slippageTolerance: { type: 'number', description: '滑点容忍度（百分比，可选，默认0.5）' }
        },
        required: ['fromToken', 'toToken', 'amount', 'chain'],
      },
      enabled: true,
      externalExposed: true,
    });

    // 意图交易能力
    this.registerSystemCapability({
      id: 'create_intent_strategy',
      name: 'create_agentrix_intent_strategy',
      description: '通过自然语言创建交易策略。将用户的自然语言意图转换为可执行的交易策略，支持定投、调仓、套利等策略。',
      category: 'trading',
      executor: 'executor_intent_strategy',
      parameters: {
        type: 'object',
        properties: {
          intentText: { 
            type: 'string', 
            description: '用户意图文本，如"帮我把10%资产换成BTC，每周自动定投"'
          },
          userId: { type: 'string', description: '用户ID' }
        },
        required: ['intentText', 'userId'],
      },
      enabled: true,
      externalExposed: true,
    });

    this.registerSystemCapability({
      id: 'get_strategy_status',
      name: 'get_agentrix_strategy_status',
      description: '查询交易策略状态。获取策略的执行状态、历史记录、收益等。',
      category: 'trading',
      executor: 'executor_intent_strategy',
      parameters: {
        type: 'object',
        properties: {
          strategyId: { type: 'string', description: '策略ID' },
        },
        required: ['strategyId'],
      },
      enabled: true,
      externalExposed: true,
    });
  }
}


