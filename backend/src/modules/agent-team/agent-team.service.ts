import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import {
  AgentTeamTemplate,
  AgentRoleDefinition,
  TeamTemplateVisibility,
} from '../../entities/agent-team-template.entity';
import {
  AgentAccount,
  AgentAccountStatus,
  AgentType,
} from '../../entities/agent-account.entity';
import {
  Account,
  AccountOwnerType,
  AccountWalletType,
  AccountStatus,
  AccountChainType,
} from '../../entities/account.entity';
import {
  OpenClawInstance,
  OpenClawInstanceStatus,
  OpenClawInstanceType,
} from '../../entities/openclaw-instance.entity';
import * as crypto from 'crypto';

// ========== DTOs ==========

export interface CreateTeamTemplateDto {
  name: string;
  slug: string;
  description?: string;
  iconUrl?: string;
  visibility?: TeamTemplateVisibility;
  tags?: string[];
  roles: AgentRoleDefinition[];
}

export interface ProvisionTeamDto {
  templateId: string;
  /** 自定义团队名称前缀（如 "My Startup"） */
  teamNamePrefix?: string;
  /** 覆盖个别角色配置（按 codename 匹配） */
  roleOverrides?: Record<string, Partial<AgentRoleDefinition>>;
}

export interface ProvisionedTeamResult {
  templateName: string;
  teamSize: number;
  agents: Array<{
    codename: string;
    name: string;
    agentId: string;
    agentUniqueId: string;
    instanceId: string;
    status: string;
  }>;
}

// ========== 默认模板：Agentrix 11-Agent 团队 ==========

const AGENTRIX_11_ROLES: AgentRoleDefinition[] = [
  {
    codename: 'ceo',
    name: 'CEO / 首席架构师',
    description: '战略规划、架构设计、团队协调、OKR 制定。团队的大脑和指挥官。',
    preferredModel: 'claude-opus-4-20250514',
    modelTier: '💎 Opus',
    capabilities: ['strategy', 'architecture', 'coordination', 'review'],
    approvalLevel: 'manual',
    spendingLimits: { singleTxLimit: 500, dailyLimit: 2000, monthlyLimit: 20000, currency: 'USDC' },
    initialCreditScore: 800,
  },
  {
    codename: 'dev',
    name: '全栈开发工程师',
    description: '后端 + 前端 + 移动端 + 桌面端全栈开发，代码实现、Bug 修复、数据库迁移。',
    preferredModel: 'claude-sonnet-4-20250514',
    modelTier: '🔥 Standard',
    capabilities: ['coding', 'debugging', 'testing', 'deployment'],
    approvalLevel: 'timeout-auto',
    spendingLimits: { singleTxLimit: 200, dailyLimit: 1000, monthlyLimit: 10000, currency: 'USDC' },
    initialCreditScore: 750,
  },
  {
    codename: 'qa-ops',
    name: 'QA / DevOps 工程师',
    description: '测试、CI/CD 流水线、部署、服务器监控、PM2 管理。',
    preferredModel: 'gpt-4o-mini',
    modelTier: '🆓 Free',
    capabilities: ['testing', 'ci-cd', 'deployment', 'monitoring'],
    approvalLevel: 'auto',
    spendingLimits: { singleTxLimit: 100, dailyLimit: 500, monthlyLimit: 5000, currency: 'USDC' },
    initialCreditScore: 700,
  },
  {
    codename: 'growth',
    name: '增长官',
    description: '用户获取策略、A/B 测试、转化优化、定价分析、竞品分析。',
    preferredModel: 'claude-sonnet-4-20250514',
    modelTier: '🔥 Standard',
    capabilities: ['growth', 'analytics', 'experiments', 'pricing'],
    approvalLevel: 'timeout-auto',
    spendingLimits: { singleTxLimit: 300, dailyLimit: 1500, monthlyLimit: 15000, currency: 'USDC' },
    initialCreditScore: 700,
  },
  {
    codename: 'ops',
    name: '运营主管',
    description: 'OKR 跟踪、数据分析、运营指标、成本追踪、流程优化。',
    preferredModel: 'gpt-4o-mini',
    modelTier: '🆓 Free',
    capabilities: ['operations', 'data-analysis', 'reporting', 'planning'],
    approvalLevel: 'auto',
    spendingLimits: { singleTxLimit: 100, dailyLimit: 500, monthlyLimit: 5000, currency: 'USDC' },
    initialCreditScore: 700,
  },
  {
    codename: 'media',
    name: '社交媒体运营',
    description: 'Twitter/X 内容、技术博客、Newsletter、SEO 优化、双语内容。',
    preferredModel: 'gpt-4o-mini',
    modelTier: '🆓 Free',
    capabilities: ['social-media', 'content', 'seo', 'newsletter'],
    approvalLevel: 'timeout-auto',
    spendingLimits: { singleTxLimit: 50, dailyLimit: 200, monthlyLimit: 2000, currency: 'USDC' },
    initialCreditScore: 650,
  },
  {
    codename: 'ecosystem',
    name: '生态合作经理',
    description: '开发者关系、SDK 文档、技能市场推广、MCP 协议推广、合作伙伴管理。',
    preferredModel: 'claude-haiku-3.5',
    modelTier: '⚡ Budget',
    capabilities: ['developer-relations', 'partnerships', 'sdk', 'marketplace'],
    approvalLevel: 'timeout-auto',
    spendingLimits: { singleTxLimit: 200, dailyLimit: 1000, monthlyLimit: 10000, currency: 'USDC' },
    initialCreditScore: 700,
  },
  {
    codename: 'community',
    name: '社区经理',
    description: 'Discord/Telegram 社区管理、GitHub Issue 分拣、社区活动、FAQ 维护。',
    preferredModel: 'gpt-4o-mini',
    modelTier: '🆓 Free',
    capabilities: ['community', 'moderation', 'events', 'support'],
    approvalLevel: 'auto',
    spendingLimits: { singleTxLimit: 50, dailyLimit: 200, monthlyLimit: 2000, currency: 'USDC' },
    initialCreditScore: 650,
  },
  {
    codename: 'brand',
    name: '品牌设计师',
    description: '品牌声音、落地页文案、产品描述、Pitch Deck、视觉方向。',
    preferredModel: 'gpt-4o-mini',
    modelTier: '🆓 Free',
    capabilities: ['branding', 'copywriting', 'design', 'pitch'],
    approvalLevel: 'auto',
    spendingLimits: { singleTxLimit: 50, dailyLimit: 200, monthlyLimit: 2000, currency: 'USDC' },
    initialCreditScore: 650,
  },
  {
    codename: 'hunter',
    name: '资源猎人',
    description: '寻找免费资源、云积分、GPU 算力、加速器项目、黑客松机会、开源资助。',
    preferredModel: 'gpt-4o-mini',
    modelTier: '🆓 Free',
    capabilities: ['research', 'grants', 'resources', 'accelerators'],
    approvalLevel: 'auto',
    spendingLimits: { singleTxLimit: 50, dailyLimit: 200, monthlyLimit: 2000, currency: 'USDC' },
    initialCreditScore: 650,
  },
  {
    codename: 'treasury',
    name: '资金管理官',
    description: '钱包管理、交易策略、DeFi 收益、赏金猎取、空投监控、质押管理。',
    preferredModel: 'gpt-4o-mini',
    modelTier: '🆓 Free',
    capabilities: ['treasury', 'defi', 'trading', 'staking'],
    approvalLevel: 'manual',
    spendingLimits: { singleTxLimit: 500, dailyLimit: 2000, monthlyLimit: 20000, currency: 'USDC' },
    initialCreditScore: 700,
  },
];

@Injectable()
export class AgentTeamService {
  private readonly logger = new Logger(AgentTeamService.name);

  constructor(
    @InjectRepository(AgentTeamTemplate)
    private readonly templateRepo: Repository<AgentTeamTemplate>,
    @InjectRepository(AgentAccount)
    private readonly agentRepo: Repository<AgentAccount>,
    @InjectRepository(Account)
    private readonly accountRepo: Repository<Account>,
    @InjectRepository(OpenClawInstance)
    private readonly instanceRepo: Repository<OpenClawInstance>,
  ) {}

  // ========== 模板管理 ==========

  /**
   * 初始化默认模板（启动时调用）
   */
  async ensureDefaultTemplates(): Promise<void> {
    const existing = await this.templateRepo.findOne({ where: { slug: 'agentrix-11' } });
    if (!existing) {
      const template = this.templateRepo.create({
        slug: 'agentrix-11',
        name: 'Agentrix 标准 11-Agent 团队',
        description: '包含 CEO、开发、QA、增长、运营、媒体、生态、社区、品牌、资源猎人、资金管理共 11 个 Agent 角色的完整团队配置。适用于科技创业公司、DAO 组织、Web3 项目。',
        visibility: TeamTemplateVisibility.OFFICIAL,
        tags: ['official', 'startup', 'web3', 'full-team'],
        roles: AGENTRIX_11_ROLES,
        teamSize: AGENTRIX_11_ROLES.length,
      });
      await this.templateRepo.save(template);
      this.logger.log('默认模板 "agentrix-11" 已创建');
    }

    // 精简版 4-Agent 模板
    const mini = await this.templateRepo.findOne({ where: { slug: 'starter-4' } });
    if (!mini) {
      const starterRoles = AGENTRIX_11_ROLES.filter(r =>
        ['ceo', 'dev', 'growth', 'ops'].includes(r.codename)
      );
      const template = this.templateRepo.create({
        slug: 'starter-4',
        name: '精简 4-Agent 入门团队',
        description: '包含 CEO、开发、增长、运营 4 个核心角色。适合个人开发者或小型项目快速上手。',
        visibility: TeamTemplateVisibility.OFFICIAL,
        tags: ['official', 'starter', 'minimal'],
        roles: starterRoles,
        teamSize: starterRoles.length,
      });
      await this.templateRepo.save(template);
      this.logger.log('默认模板 "starter-4" 已创建');
    }
  }

  /**
   * 获取所有可用模板
   */
  async listTemplates(includePrivate = false): Promise<AgentTeamTemplate[]> {
    const where: any = {};
    if (!includePrivate) {
      where.visibility = TeamTemplateVisibility.PUBLIC;
    }
    return this.templateRepo.find({
      where: [
        { visibility: TeamTemplateVisibility.PUBLIC },
        { visibility: TeamTemplateVisibility.OFFICIAL },
        ...(includePrivate ? [{ visibility: TeamTemplateVisibility.PRIVATE }] : []),
      ],
      order: {
        visibility: 'ASC', // OFFICIAL first
        usageCount: 'DESC',
      },
    });
  }

  /**
   * 根据 slug 获取模板
   */
  async getTemplate(slug: string): Promise<AgentTeamTemplate> {
    const template = await this.templateRepo.findOne({ where: { slug } });
    if (!template) {
      throw new NotFoundException(`模板 "${slug}" 不存在`);
    }
    return template;
  }

  /**
   * 创建自定义模板
   */
  async createTemplate(dto: CreateTeamTemplateDto, creatorId: string): Promise<AgentTeamTemplate> {
    const existing = await this.templateRepo.findOne({ where: { slug: dto.slug } });
    if (existing) {
      throw new BadRequestException(`slug "${dto.slug}" 已被使用`);
    }

    const template = this.templateRepo.create({
      ...dto,
      creatorId,
      teamSize: dto.roles.length,
      visibility: dto.visibility || TeamTemplateVisibility.PRIVATE,
    });
    return this.templateRepo.save(template);
  }

  // ========== 团队创建 ==========

  /**
   * 从模板一键创建 Agent 团队
   * 
   * 为指定用户创建模板中定义的所有 Agent：
   * 1. 每个 Agent 获得独立 AgentAccount
   * 2. 每个 Agent 自动创建虚拟资金账户（初始 100 USDC）
   * 3. Agent 的 metadata 中记录 teamTemplateSlug 和 codename
   */
  async provisionTeam(
    ownerId: string,
    dto: ProvisionTeamDto,
  ): Promise<ProvisionedTeamResult> {
    const template = await this.templateRepo.findOne({ where: { id: dto.templateId } });
    if (!template) {
      throw new NotFoundException('模板不存在');
    }

    // 检查是否已经用该模板创建过团队
    const existingAgent = await this.agentRepo.findOne({
      where: {
        ownerId,
        metadata: { teamTemplateSlug: template.slug } as any,
      },
    });

    // 退而用更可靠的方式检查 — 查找该用户所有 agent 中 metadata 包含此 template slug 的（排除已解散的）
    const allAgents = await this.agentRepo.find({ where: { ownerId } });
    const alreadyProvisioned = allAgents.some(
      a => a.metadata?.teamTemplateSlug === template.slug && a.status !== AgentAccountStatus.REVOKED
    );

    if (alreadyProvisioned) {
      throw new BadRequestException(`您已经使用模板 "${template.name}" 创建过团队`);
    }

    const prefix = dto.teamNamePrefix || '';
    const results: ProvisionedTeamResult['agents'] = [];

    for (const role of template.roles) {
      // 应用角色覆盖
      const overrides = dto.roleOverrides?.[role.codename] || {};
      const finalRole = { ...role, ...overrides };

      const agentUniqueId = `AGT-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
      const agentName = prefix
        ? `${prefix} — ${finalRole.name}`
        : finalRole.name;

      // 创建 Agent Account
      const agent = this.agentRepo.create({
        agentUniqueId,
        name: agentName,
        description: finalRole.description,
        avatarUrl: finalRole.avatarUrl,
        ownerId,
        agentType: AgentType.PERSONAL,
        status: AgentAccountStatus.ACTIVE,
        creditScore: finalRole.initialCreditScore || 500,
        preferredModel: finalRole.preferredModel,
        preferredProvider: finalRole.preferredProvider,
        capabilities: finalRole.capabilities,
        spendingLimits: finalRole.spendingLimits || {
          singleTxLimit: 100,
          dailyLimit: 500,
          monthlyLimit: 5000,
          currency: 'USDC',
        },
        metadata: {
          teamTemplateSlug: template.slug,
          codename: finalRole.codename,
          modelTier: finalRole.modelTier,
          approvalLevel: finalRole.approvalLevel,
        },
      } as any);

      const savedAgent = await this.agentRepo.save(agent as any) as AgentAccount;

      // 创建虚拟资金账户
      const fundingAccount = this.accountRepo.create({
        accountId: `ACC-${savedAgent.agentUniqueId}`,
        name: `${agentName} 资金账户`,
        ownerId: savedAgent.id,
        ownerType: AccountOwnerType.AGENT,
        walletType: AccountWalletType.VIRTUAL,
        chainType: AccountChainType.MULTI,
        currency: 'USDC',
        status: AccountStatus.ACTIVE,
        isDefault: true,
      } as any);
      const savedAccount = await this.accountRepo.save(fundingAccount as any);

      // 关联默认账户
      savedAgent.defaultAccountId = (savedAccount as any).id;
      savedAgent.activatedAt = new Date();
      await this.agentRepo.save(savedAgent);

      // 创建关联的 OpenClaw Instance（CLOUD 类型）
      const instance = this.instanceRepo.create({
        userId: ownerId,
        name: agentName,
        instanceType: OpenClawInstanceType.CLOUD,
        status: OpenClawInstanceStatus.ACTIVE,
        personality: finalRole.description,
        agentAccountId: savedAgent.id,
        defaultModel: finalRole.preferredModel,
        delegationLevel: finalRole.approvalLevel === 'manual' ? 'representative' : 'assistant',
        capabilities: finalRole.capabilities ? Object.fromEntries(finalRole.capabilities.map(c => [c, true])) : undefined,
        metadata: {
          teamTemplateSlug: template.slug,
          codename: finalRole.codename,
          modelTier: finalRole.modelTier,
        },
      } as any);
      const savedInstance = await this.instanceRepo.save(instance) as unknown as OpenClawInstance;

      results.push({
        codename: finalRole.codename,
        name: agentName,
        agentId: savedAgent.id,
        agentUniqueId: savedAgent.agentUniqueId,
        instanceId: savedInstance.id,
        status: savedAgent.status,
      });

      this.logger.log(`Agent [${finalRole.codename}] ${agentName} 创建成功: ${savedAgent.agentUniqueId} (instance: ${savedInstance.id})`);
    }

    // 更新模板使用计数
    template.usageCount += 1;
    await this.templateRepo.save(template);

    return {
      templateName: template.name,
      teamSize: results.length,
      agents: results,
    };
  }

  /**
   * 获取用户已创建的团队列表
   */
  async getMyTeams(ownerId: string): Promise<Array<{
    templateSlug: string;
    templateName: string;
    agents: Array<{
      id: string;
      codename: string;
      name: string;
      agentUniqueId: string;
      status: string;
      creditScore: number;
      modelTier?: string;
      instanceId?: string;
    }>;
  }>> {
    const allAgents = await this.agentRepo.find({
      where: { ownerId },
      order: { createdAt: 'ASC' },
    });

    // 查找所有关联的 OpenClaw 实例
    const agentIds = allAgents.map(a => a.id);
    const instances = agentIds.length > 0
      ? await this.instanceRepo.find({ where: { agentAccountId: In(agentIds) } })
      : [];
    const instanceByAccountId = new Map(instances.map(i => [i.agentAccountId, i]));

    // 按 teamTemplateSlug 分组（排除已解散的）
    const teamMap = new Map<string, AgentAccount[]>();
    for (const agent of allAgents) {
      const slug = agent.metadata?.teamTemplateSlug;
      if (slug && agent.status !== AgentAccountStatus.REVOKED) {
        if (!teamMap.has(slug)) teamMap.set(slug, []);
        teamMap.get(slug)!.push(agent);
      }
    }

    const results = [];
    for (const [slug, agents] of teamMap) {
      const template = await this.templateRepo.findOne({ where: { slug } });
      results.push({
        templateSlug: slug,
        templateName: template?.name || slug,
        agents: agents.map(a => ({
          id: a.id,
          codename: a.metadata?.codename || 'unknown',
          name: a.name,
          agentUniqueId: a.agentUniqueId,
          status: a.status,
          creditScore: Number(a.creditScore),
          modelTier: a.metadata?.modelTier,
          instanceId: instanceByAccountId.get(a.id)?.id,
        })),
      });
    }

    return results;
  }

  /**
   * 解散团队（批量撤销属于同一模板的 Agent）
   */
  async disbandTeam(ownerId: string, templateSlug: string): Promise<{ disbanded: number }> {
    const allAgents = await this.agentRepo.find({ where: { ownerId } });
    const teamAgents = allAgents.filter(
      a => a.metadata?.teamTemplateSlug === templateSlug
    );

    if (teamAgents.length === 0) {
      throw new NotFoundException(`未找到模板 "${templateSlug}" 对应的团队`);
    }

    let disbanded = 0;
    for (const agent of teamAgents) {
      if (agent.status !== AgentAccountStatus.REVOKED) {
        agent.status = AgentAccountStatus.REVOKED;
        agent.statusReason = '团队解散';
        await this.agentRepo.save(agent);

        // 同时暂停关联的 OpenClaw 实例
        await this.instanceRepo.update(
          { agentAccountId: agent.id },
          { status: OpenClawInstanceStatus.PAUSED },
        );

        disbanded++;
      }
    }

    return { disbanded };
  }

  /**
   * 绑定已有 OpenClaw 实例到团队角色
   */
  async bindInstanceToRole(
    ownerId: string,
    templateSlug: string,
    codename: string,
    instanceId: string,
  ): Promise<{ agentId: string; instanceId: string }> {
    // 查找该角色对应的 AgentAccount
    const allAgents = await this.agentRepo.find({ where: { ownerId } });
    const roleAgent = allAgents.find(
      a => a.metadata?.teamTemplateSlug === templateSlug
        && a.metadata?.codename === codename
        && a.status !== AgentAccountStatus.REVOKED,
    );
    if (!roleAgent) {
      throw new NotFoundException(`角色 "${codename}" 不存在于团队 "${templateSlug}" 中`);
    }

    // 验证实例归属
    const instance = await this.instanceRepo.findOneBy({ id: instanceId });
    if (!instance || instance.userId !== ownerId) {
      throw new NotFoundException('OpenClaw 实例不存在');
    }

    // 解除实例的旧绑定（如有）
    if (instance.agentAccountId && instance.agentAccountId !== roleAgent.id) {
      this.logger.warn(`实例 ${instanceId} 从 ${instance.agentAccountId} 重新绑定到 ${roleAgent.id}`);
    }

    // 绑定
    instance.agentAccountId = roleAgent.id;
    instance.metadata = {
      ...(instance.metadata || {}),
      teamTemplateSlug: templateSlug,
      codename,
      agentAccountId: roleAgent.id,
    };
    await this.instanceRepo.save(instance);

    return { agentId: roleAgent.id, instanceId: instance.id };
  }
}
