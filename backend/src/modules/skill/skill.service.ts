import { Injectable, NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { Repository } from 'typeorm';
import { ClawInstalledSkill } from '../../entities/claw-installed-skill.entity';
import { Skill, SkillStatus, SkillPricingType, SkillValueType } from '../../entities/skill.entity';
import { UserInstalledSkill } from '../../entities/user-installed-skill.entity';
import { SkillConverterService } from './skill-converter.service';

type SkillListView = 'summary' | 'full';

const SKILL_SUMMARY_SELECT_FIELDS = [
  'skill.id',
  'skill.name',
  'skill.displayName',
  'skill.category',
  'skill.imageUrl',
  'skill.thumbnailUrl',
] as const;

@Injectable()
export class SkillService {
  constructor(
    @InjectRepository(Skill)
    private skillRepository: Repository<Skill>,
    @InjectRepository(ClawInstalledSkill)
    private clawInstalledSkillRepository: Repository<ClawInstalledSkill>,
    @InjectRepository(UserInstalledSkill)
    private userInstalledSkillRepository: Repository<UserInstalledSkill>,
    private skillConverter: SkillConverterService,
    private configService: ConfigService,
  ) {}

  /**
   * V2.0: 验证 URL 格式
   */
  private isValidUrl(url: string): boolean {
    try {
      const parsed = new URL(url);
      return parsed.protocol === 'http:' || parsed.protocol === 'https:';
    } catch {
      return false;
    }
  }

  private buildFindAllQuery(
    status?: SkillStatus,
    view: SkillListView = 'summary',
    page = 1,
    limit?: number,
  ) {
    const query = this.skillRepository.createQueryBuilder('skill');
    if (status) {
      query.where('skill.status = :status', { status });
    }

    if (view === 'summary') {
      query.select([...SKILL_SUMMARY_SELECT_FIELDS]);
    }

    if (limit) {
      query.skip((page - 1) * limit).take(limit);
    }

    return query;
  }

  async findAll(status?: SkillStatus, view: SkillListView = 'summary', page = 1, limit?: number) {
    return this.buildFindAllQuery(status, view, page, limit).getMany();
  }

  async findById(id: string) {
    return this.findOne(id);
  }

  async findOne(id: string) {
    const skill = await this.skillRepository.findOne({ where: { id } });
    if (!skill) throw new NotFoundException('Skill not found');
    return skill;
  }

  async incrementCallCount(id: string) {
    await this.skillRepository.increment({ id }, 'callCount', 1);
  }


  async create(data: Partial<Skill>, authorId?: string) {
    // 确保必需字段存在
    if (!data.name) {
      throw new BadRequestException('Skill name is required');
    }
    if (!data.description) {
      throw new BadRequestException('Skill description is required');
    }
    
    const skill = this.skillRepository.create({
      ...data,
      authorId: authorId || data.authorId, // 优先使用传入的authorId
    });
    
    // Generate platform schemas automatically if not provided
    if (!skill.platformSchemas) {
      try {
        skill.platformSchemas = {
          openai: this.skillConverter.convertToOpenAI(skill as Skill),
          claude: this.skillConverter.convertToClaude(skill as Skill),
          gemini: this.skillConverter.convertToGemini(skill as Skill),
        };
      } catch (error) {
        console.error('Failed to generate platform schemas:', error);
        // 如果转换失败，设置空对象而不是让整个创建失败
        skill.platformSchemas = {};
      }
    }
    
    return this.skillRepository.save(skill);
  }

  async update(id: string, data: Partial<Skill>) {
    await this.skillRepository.update(id, data);
    return this.findOne(id);
  }

  async remove(id: string) {
    const skill = await this.findOne(id);
    return this.skillRepository.remove(skill);
  }

  async generatePack(id: string, platform: 'openai' | 'claude' | 'gemini' | 'openapi') {
    const skill = await this.findOne(id);
    switch (platform) {
      case 'openai': return this.skillConverter.convertToOpenAI(skill);
      case 'claude': return this.skillConverter.convertToClaude(skill);
      case 'gemini': return this.skillConverter.convertToGemini(skill);
      case 'openapi': return this.skillConverter.convertToOpenAPI(skill);
      default: return skill.platformSchemas;
    }
  }

  async publish(id: string) {
    const skill = await this.findOne(id);
    const baseUrl = this.configService.get('API_BASE_URL', 'http://localhost:3001');
    
    // V2.0: 安全验证 - 非 FREE 的 Skill 必须有有效 endpoint
    const pricing = skill.pricing;
    const isPaid = pricing && pricing.type !== SkillPricingType.FREE;
    
    if (isPaid) {
      const executor = skill.executor;
      const hasValidEndpoint = executor && (
        (executor.type === 'http' && executor.endpoint && this.isValidUrl(executor.endpoint)) ||
        (executor.type === 'internal' && executor.internalHandler) ||
        (executor.type === 'mcp' && executor.mcpServer) ||
        (executor.type === 'contract' && executor.contractAddress)
      );
      
      if (!hasValidEndpoint) {
        throw new BadRequestException(
          'Paid skills must have a valid endpoint configuration. ' +
          'Please provide a valid HTTP endpoint, internal handler, MCP server, or contract address.'
        );
      }
    }
    
    // V2.0: 自动设置 AI 优先级 - ACTION 类型默认为 high
    const updateData: Partial<Skill> = {
      status: SkillStatus.PUBLISHED,
    };
    
    if (skill.valueType === SkillValueType.ACTION && !skill.aiPriority) {
      updateData.aiPriority = 'high';
    }

    // 只要没有显式关闭 UCP，就保持启用或开启
    if (skill.ucpEnabled !== false) {
      updateData.ucpEnabled = true;
      updateData.ucpCheckoutEndpoint = `${baseUrl}/ucp/v1/checkout-sessions`;
    }
    
    // 如果是付费 Skill，且没有显式关闭 X402，则自动启用 X402 协议
    if (isPaid && skill.x402Enabled !== false) {
      updateData.x402Enabled = true;
      updateData.x402ServiceEndpoint = `${baseUrl}/.well-known/x402`;
    } else if (skill.x402Enabled) {
      updateData.x402ServiceEndpoint = `${baseUrl}/.well-known/x402`;
    }
    
    // V3.0: 自动在 Unified Marketplace 上架
    // 发布后 skill.status = PUBLISHED，unified-marketplace 搜索
    // 自动能找到 (它只搜索 status=PUBLISHED 的 skill)
    // 这里添加 marketplace metadata 以确保完整性
    updateData.metadata = {
      ...skill.metadata,
      marketplace: {
        ...(skill.metadata?.marketplace || {}),
        publishedVia: 'skill-publish',
        publishedAt: new Date().toISOString(),
        listings: {
          unifiedMarketplace: true,
        },
      },
    };
    
    return this.update(id, updateData);
  }

  async submitForReview(id: string, userId: string) {
    const skill = await this.skillRepository.findOne({ where: { id, authorId: userId } });
    if (!skill) {
      throw new Error('Skill not found or not authorized');
    }
    if (skill.status !== SkillStatus.DRAFT) {
      throw new Error('Only draft skills can be submitted for review');
    }
    skill.status = SkillStatus.PENDING_REVIEW;
    await this.skillRepository.save(skill);
    return { success: true, message: 'Skill submitted for review', skill };
  }

  async approveSkill(id: string, reviewerId: string) {
    const skill = await this.skillRepository.findOne({ where: { id } });
    if (!skill) {
      throw new Error('Skill not found');
    }
    if (skill.status !== SkillStatus.PENDING_REVIEW) {
      throw new Error('Only pending skills can be approved');
    }
    skill.status = SkillStatus.ACTIVE;
    await this.skillRepository.save(skill);
    return { success: true, message: 'Skill approved and activated', skill };
  }

  async rejectSkill(id: string, reason: string, reviewerId: string) {
    const skill = await this.skillRepository.findOne({ where: { id } });
    if (!skill) {
      throw new Error('Skill not found');
    }
    if (skill.status !== SkillStatus.PENDING_REVIEW) {
      throw new Error('Only pending skills can be rejected');
    }
    skill.status = SkillStatus.REJECTED;
    (skill as any).rejectionReason = reason;
    await this.skillRepository.save(skill);
    return { success: true, message: 'Skill rejected', skill };
  }

  async findByAuthor(authorId: string, page = 1, limit = 20) {
    const [items, total] = await this.skillRepository.findAndCount({
      where: { authorId },
      skip: (page - 1) * limit,
      take: limit,
      order: { createdAt: 'DESC' },
    });
    return { success: true, items, total, page, limit };
  }

  async findMarketplace(page = 1, limit = 20, category?: string, search?: string) {
    const query = this.skillRepository.createQueryBuilder('skill')
      .where('skill.status = :status', { status: SkillStatus.PUBLISHED });
    
    if (category) {
      query.andWhere('skill.category = :category', { category });
    }
    if (search) {
      query.andWhere('(skill.name ILIKE :search OR skill.description ILIKE :search)', { search: `%${search}%` });
    }
    
    query.orderBy('skill.callCount', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);
    
    const [items, total] = await query.getManyAndCount();
    return { success: true, items, total, page, limit };
  }

  /**
   * 获取用户可用的技能（基于已安装插件过滤）
   * 如果 skill 没有 pluginId，则视为公共技能，所有人可用
   * 如果 skill 有 pluginId，则只有安装了该插件的用户可用
   */
  async findAvailableForUser(userPluginIds: string[]): Promise<Skill[]> {
    const query = this.skillRepository.createQueryBuilder('skill')
      .where('skill.status = :status', { status: SkillStatus.PUBLISHED })
      .andWhere(
        '(skill.pluginId IS NULL OR skill.pluginId IN (:...pluginIds))',
        { pluginIds: userPluginIds.length > 0 ? userPluginIds : ['__none__'] }
      );
    
    return query.getMany();
  }

  /**
   * 获取所有公共技能（无需插件）
   */
  async findPublicSkills(): Promise<Skill[]> {
    return this.skillRepository.find({
      where: { 
        status: SkillStatus.PUBLISHED,
        pluginId: null as any,
      },
    });
  }

  // ========== 用户技能安装管理 ==========

  /**
   * 用户安装技能
   */
  async installSkill(userId: string, skillId: string, config?: Record<string, any>): Promise<UserInstalledSkill> {
    // 检查技能是否存在
    const skill = await this.findOne(skillId);
    if (skill.status !== SkillStatus.PUBLISHED) {
      throw new NotFoundException('Skill is not available for installation');
    }

    // 检查是否已安装
    const existing = await this.userInstalledSkillRepository.findOne({
      where: { userId, skillId },
    });
    if (existing) {
      throw new ConflictException('Skill is already installed');
    }

    // 创建安装记录
    const installation = this.userInstalledSkillRepository.create({
      userId,
      skillId,
      isEnabled: true,
      config: config || {},
    });

    return this.userInstalledSkillRepository.save(installation);
  }

  /**
   * 用户卸载技能
   */
  async uninstallSkill(userId: string, skillId: string): Promise<void> {
    const installation = await this.userInstalledSkillRepository.findOne({
      where: { userId, skillId },
    });
    if (!installation) {
      throw new NotFoundException('Skill is not installed');
    }
    await this.userInstalledSkillRepository.remove(installation);
  }

  /**
   * 获取用户已安装的技能
   */
  async findUserInstalledSkills(userId: string, page = 1, limit = 20): Promise<{
    success: boolean;
    items: (Skill & { isEnabled: boolean; config?: Record<string, any>; installedAt: Date })[];
    total: number;
    page: number;
    limit: number;
  }> {
    const [installations, total] = await this.userInstalledSkillRepository.findAndCount({
      where: { userId },
      relations: ['skill'],
      skip: (page - 1) * limit,
      take: limit,
      order: { installedAt: 'DESC' },
    });

    const items = installations.map(inst => ({
      ...inst.skill,
      isEnabled: inst.isEnabled,
      config: inst.config,
      installedAt: inst.installedAt,
    }));

    return { success: true, items, total, page, limit };
  }

  /**
   * 检查用户是否已安装技能
   */
  async isSkillInstalled(userId: string, skillId: string): Promise<boolean> {
    const count = await this.userInstalledSkillRepository.count({
      where: { userId, skillId },
    });
    return count > 0;
  }

  /**
   * 更新已安装技能的配置或启用状态
   */
  async updateInstalledSkill(userId: string, skillId: string, update: { isEnabled?: boolean; config?: Record<string, any> }): Promise<UserInstalledSkill> {
    const installation = await this.userInstalledSkillRepository.findOne({
      where: { userId, skillId },
    });
    if (!installation) {
      throw new NotFoundException('Skill is not installed');
    }

    if (update.isEnabled !== undefined) {
      installation.isEnabled = update.isEnabled;
    }
    if (update.config !== undefined) {
      installation.config = update.config;
    }

    return this.userInstalledSkillRepository.save(installation);
  }

  /**
   * 为指定 Claw 实例安装技能
   */
  async installSkillForInstance(
    instanceId: string,
    skillId: string,
    installedByUserId?: string,
    config?: Record<string, any>,
  ): Promise<ClawInstalledSkill> {
    const skill = await this.findOne(skillId);
    if (skill.status !== SkillStatus.PUBLISHED) {
      throw new NotFoundException('Skill is not available for installation');
    }

    const existing = await this.clawInstalledSkillRepository.findOne({
      where: { instanceId, skillId },
    });
    if (existing) {
      throw new ConflictException('Skill is already installed on this claw');
    }

    const installation = this.clawInstalledSkillRepository.create({
      instanceId,
      installedByUserId,
      skillId,
      isEnabled: true,
      config: config || {},
    });

    return this.clawInstalledSkillRepository.save(installation);
  }

  async uninstallSkillForInstance(instanceId: string, skillId: string): Promise<void> {
    const installation = await this.clawInstalledSkillRepository.findOne({
      where: { instanceId, skillId },
    });
    if (!installation) {
      throw new NotFoundException('Skill is not installed on this claw');
    }
    await this.clawInstalledSkillRepository.remove(installation);
  }

  async findInstanceInstalledSkills(instanceId: string): Promise<ClawInstalledSkill[]> {
    return this.clawInstalledSkillRepository.find({
      where: { instanceId },
      relations: ['skill'],
      order: { installedAt: 'DESC' },
    });
  }

  async findEffectiveInstalledSkillsForInstance(
    instanceId: string,
    fallbackUserId?: string,
  ): Promise<Array<ClawInstalledSkill | UserInstalledSkill>> {
    const instanceInstallations = await this.findInstanceInstalledSkills(instanceId);
    if (!fallbackUserId) {
      return instanceInstallations;
    }

    let userInstallations: UserInstalledSkill[] = [];
    try {
      userInstallations = await this.userInstalledSkillRepository.find({
        where: { userId: fallbackUserId },
        relations: ['skill'],
        order: { installedAt: 'DESC' },
      });
    } catch {
      return instanceInstallations;
    }

    if (instanceInstallations.length === 0) {
      return userInstallations;
    }

    const existingSkillIds = new Set(instanceInstallations.map((installation) => installation.skillId));
    const mergedFallback = userInstallations.filter((installation) => !existingSkillIds.has(installation.skillId));

    return [...instanceInstallations, ...mergedFallback];
  }

  async isSkillInstalledForInstance(instanceId: string, skillId: string): Promise<boolean> {
    const count = await this.clawInstalledSkillRepository.count({
      where: { instanceId, skillId },
    });
    return count > 0;
  }

  async updateInstanceInstalledSkill(
    instanceId: string,
    skillId: string,
    update: { isEnabled?: boolean; config?: Record<string, any> },
  ): Promise<ClawInstalledSkill> {
    const installation = await this.clawInstalledSkillRepository.findOne({
      where: { instanceId, skillId },
    });
    if (!installation) {
      throw new NotFoundException('Skill is not installed on this claw');
    }

    if (update.isEnabled !== undefined) {
      installation.isEnabled = update.isEnabled;
    }
    if (update.config !== undefined) {
      installation.config = update.config;
    }

    return this.clawInstalledSkillRepository.save(installation);
  }

  // ========== V2.0 Playground API ==========

  /**
   * 执行 Playground 演练场
   * 仅支持 logic 层的 Skill，提供 dry-run 模式
   */
  async executePlayground(
    skillId: string,
    params: Record<string, any>,
    dryRun: boolean = true,
  ): Promise<{
    success: boolean;
    result?: any;
    error?: string;
    executionTime?: number;
    dryRun: boolean;
  }> {
    const skill = await this.skillRepository.findOne({ where: { id: skillId } });
    
    if (!skill) {
      throw new NotFoundException('Skill not found');
    }

    // 仅支持 logic 层
    if (skill.layer !== 'logic') {
      return {
        success: false,
        error: 'Playground is only available for logic-type skills',
        dryRun,
      };
    }

    const startTime = Date.now();

    try {
      // Dry-run 模式：仅验证参数，不实际执行
      if (dryRun) {
        // 验证输入参数
        const inputSchema = skill.inputSchema;
        const validationResult = this.validateParams(params, inputSchema);
        
        if (!validationResult.valid) {
          return {
            success: false,
            error: `Parameter validation failed: ${validationResult.errors.join(', ')}`,
            executionTime: Date.now() - startTime,
            dryRun,
          };
        }

        // 生成模拟输出
        const mockOutput = this.generateMockOutput(skill.outputSchema);

        return {
          success: true,
          result: {
            mode: 'dry-run',
            message: 'Parameters validated successfully. This is a simulated response.',
            inputReceived: params,
            simulatedOutput: mockOutput,
          },
          executionTime: Date.now() - startTime,
          dryRun,
        };
      }

      // 真实执行模式
      const executor = skill.executor;
      if (!executor || executor.type !== 'http' || !executor.endpoint) {
        return {
          success: false,
          error: 'Skill has no valid HTTP endpoint configured',
          executionTime: Date.now() - startTime,
          dryRun,
        };
      }

      // 调用实际端点
      const response = await fetch(executor.endpoint, {
        method: executor.method || 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(executor.headers || {}),
        },
        body: JSON.stringify(params),
      });

      const result = await response.json();

      return {
        success: response.ok,
        result,
        executionTime: Date.now() - startTime,
        dryRun,
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message || 'Execution failed',
        executionTime: Date.now() - startTime,
        dryRun,
      };
    }
  }

  /**
   * 验证参数
   */
  private validateParams(
    params: Record<string, any>,
    schema?: any,
  ): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!schema || !schema.properties) {
      return { valid: true, errors: [] };
    }

    // 检查必填字段
    const required = schema.required || [];
    for (const field of required) {
      if (params[field] === undefined || params[field] === null) {
        errors.push(`Missing required field: ${field}`);
      }
    }

    // 检查字段类型
    for (const [key, value] of Object.entries(params)) {
      const propSchema = schema.properties[key];
      if (propSchema && propSchema.type) {
        const actualType = typeof value;
        const expectedType = propSchema.type;
        
        if (expectedType === 'integer' || expectedType === 'number') {
          if (actualType !== 'number') {
            errors.push(`Field ${key} should be ${expectedType}, got ${actualType}`);
          }
        } else if (expectedType === 'string' && actualType !== 'string') {
          errors.push(`Field ${key} should be string, got ${actualType}`);
        } else if (expectedType === 'boolean' && actualType !== 'boolean') {
          errors.push(`Field ${key} should be boolean, got ${actualType}`);
        } else if (expectedType === 'array' && !Array.isArray(value)) {
          errors.push(`Field ${key} should be array`);
        }
      }
    }

    return { valid: errors.length === 0, errors };
  }

  /**
   * 生成模拟输出
   */
  private generateMockOutput(schema?: any): any {
    if (!schema) {
      return { message: 'No output schema defined' };
    }

    if (schema.type === 'object' && schema.properties) {
      const output: Record<string, any> = {};
      for (const [key, prop] of Object.entries(schema.properties) as any[]) {
        if (prop.type === 'string') {
          output[key] = `<mock_${key}>`;
        } else if (prop.type === 'number' || prop.type === 'integer') {
          output[key] = 0;
        } else if (prop.type === 'boolean') {
          output[key] = true;
        } else if (prop.type === 'array') {
          output[key] = [];
        } else {
          output[key] = null;
        }
      }
      return output;
    }

    return { result: '<mock_result>' };
  }

  /**
   * Get detailed statistics for a skill including 7-day and 30-day metrics
   */
  async getSkillStats(id: string) {
    const skill = await this.findOne(id);
    
    // TODO: Replace with real data from analytics/transaction tables
    // For now, return mock data based on skill properties
    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    // Mock data generation based on skill status and callCount
    const isActive = skill.status === SkillStatus.PUBLISHED;
    const baseMultiplier = isActive ? 1 : 0.1;
    const callCount = skill.callCount || 0;
    
    return {
      skillId: id,
      calls7d: Math.floor(callCount * 0.15 * baseMultiplier),
      calls30d: Math.floor(callCount * 0.6 * baseMultiplier),
      revenue7d: skill.pricing?.type === SkillPricingType.FREE ? 0 : Math.floor(callCount * 0.15 * (skill.pricing?.pricePerCall || 0) * 0.9 * baseMultiplier * 100) / 100,
      revenue30d: skill.pricing?.type === SkillPricingType.FREE ? 0 : Math.floor(callCount * 0.6 * (skill.pricing?.pricePerCall || 0) * 0.9 * baseMultiplier * 100) / 100,
      agentCount7d: Math.floor(callCount * 0.05 * baseMultiplier),
      agentCount30d: Math.floor(callCount * 0.2 * baseMultiplier),
      platformsCoverage: {
        ucp: skill.platformSchemas?.gemini ? true : false,
        mcp: skill.platformSchemas?.claude ? true : false,
        acp: skill.platformSchemas?.openai ? true : false,
        x402: false, // Reserved for future
      },
      distributionChannels: [
        { 
          name: 'Claude Skills Registry', 
          key: 'mcp', 
          enabled: !!skill.platformSchemas?.claude,
          calls7d: Math.floor(callCount * 0.05 * baseMultiplier),
        },
        { 
          name: 'ChatGPT / GPTs', 
          key: 'acp', 
          enabled: !!skill.platformSchemas?.openai,
          calls7d: Math.floor(callCount * 0.06 * baseMultiplier),
        },
        { 
          name: 'Google UCP', 
          key: 'ucp', 
          enabled: !!skill.platformSchemas?.gemini,
          calls7d: Math.floor(callCount * 0.02 * baseMultiplier),
        },
        { 
          name: 'Agentrix Marketplace', 
          key: 'marketplace', 
          enabled: true,
          calls7d: Math.floor(callCount * 0.02 * baseMultiplier),
        },
      ],
      updatedAt: new Date().toISOString(),
    };
  }
}
