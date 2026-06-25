import { AppDataSource } from '../config/data-source';
import { Skill, SkillCategory, SkillLayer, SkillSource, SkillStatus, SkillPricingType, SkillResourceType, SkillValueType } from '../entities/skill.entity';
import { User, UserRole } from '../entities/user.entity';
import { SkillConverterService } from '../modules/skill/skill-converter.service';

async function seedCoreSkills() {
  try {
    if (!AppDataSource.isInitialized) {
      await AppDataSource.initialize();
    }

    const skillRepo = AppDataSource.getRepository(Skill);
    const userRepo = AppDataSource.getRepository(User);
    
    // Find or create a system user
    let systemUser = await userRepo.findOne({ where: { agentrixId: 'system' } });
    if (!systemUser) {
      const user = new User();
      user.agentrixId = 'system';
      user.email = 'system@agentrix.top';
      user.roles = [UserRole.USER, UserRole.AGENT];
      systemUser = await userRepo.save(user);
    }

    const skillConverter = new SkillConverterService();

    const coreSkills = [
      {
        name: 'agent_discover',
        displayName: 'Discover AI Agents',
        description: 'Search and discover available AI Agents in the Agentrix ecosystem by capability, category, or rating.',
        category: SkillCategory.UTILITY,
        layer: SkillLayer.LOGIC,
        inputSchema: {
          type: 'object',
          properties: {
            query: { type: 'string', description: 'Search term or capability' },
            category: { type: 'string', description: 'Agent category' }
          },
          required: []
        },
        executor: { type: 'internal', internalHandler: 'agent_discover' }
      },
      {
        name: 'agent_invoke',
        displayName: 'Invoke AI Agent',
        description: 'Call another AI Agent to perform a specific task or retrieve information.',
        category: SkillCategory.INTEGRATION,
        layer: SkillLayer.INFRA,
        inputSchema: {
          type: 'object',
          properties: {
            agentId: { type: 'string', description: 'Target Agent ID' },
            task: { type: 'string', description: 'Task description for the agent' },
            params: { type: 'object', description: 'Structured parameters for the task' }
          },
          required: ['agentId', 'task']
        },
        executor: { type: 'internal', internalHandler: 'agent_invoke' }
      },
      {
        name: 'balance_check',
        displayName: 'Check Wallet Balance',
        description: 'Check the current balance of your MPC wallet across supported chains (BSC, Ethereum, etc).',
        category: SkillCategory.PAYMENT,
        layer: SkillLayer.INFRA,
        inputSchema: {
          type: 'object',
          properties: {
            chain: { type: 'string', enum: ['bsc', 'eth', 'polygon', 'all'], default: 'all' }
          },
          required: []
        },
        executor: { type: 'internal', internalHandler: 'get_balance' }
      },
      {
        name: 'onramp_fiat',
        displayName: 'Fiat Top-up (Transak)',
        description: 'Top up your agent wallet using fiat currency via credit card or bank transfer.',
        category: SkillCategory.PAYMENT,
        layer: SkillLayer.INFRA,
        inputSchema: {
          type: 'object',
          properties: {
            fiatAmount: { type: 'number', description: 'Amount to top up' },
            fiatCurrency: { type: 'string', default: 'USD' }
          },
          required: ['fiatAmount']
        },
        executor: { type: 'internal', internalHandler: 'onramp_fiat' }
      },
      {
        name: 'x402_pay',
        displayName: 'X402 Unified Payment',
        description: 'Execute a payment using the X402 unified protocol for agent-to-agent or agent-to-merchant transactions.',
        category: SkillCategory.PAYMENT,
        layer: SkillLayer.INFRA,
        inputSchema: {
          type: 'object',
          properties: {
            amount: { type: 'number', description: 'Amount to pay' },
            currency: { type: 'string', default: 'USDC' },
            merchantId: { type: 'string', description: 'Target merchant or agent ID' }
          },
          required: ['amount']
        },
        executor: { type: 'internal', internalHandler: 'x402_pay' }
      },
      {
        name: 'commission_calculate',
        displayName: 'Commission Calculate',
        description: 'Calculate commission and net amount for a transaction.',
        category: SkillCategory.PAYMENT,
        layer: SkillLayer.INFRA,
        inputSchema: {
          type: 'object',
          properties: {
            amount: { type: 'number', description: 'Total amount' },
            feeRate: { type: 'number', default: 0.05 }
          },
          required: ['amount']
        },
        executor: { type: 'internal', internalHandler: 'commission_calculate' }
      },
      {
        name: 'commission_distribute',
        displayName: 'Commission Distribute',
        description: 'Execute commission distribution for a completed payment.',
        category: SkillCategory.PAYMENT,
        layer: SkillLayer.INFRA,
        inputSchema: {
          type: 'object',
          properties: {
            paymentId: { type: 'string' }
          },
          required: ['paymentId']
        },
        executor: { type: 'internal', internalHandler: 'commission_distribute' }
      },
      {
        name: 'quickpay_execute',
        displayName: 'QuickPay Execute',
        description: 'Fast checkout using pre-authorized account via X402.',
        category: SkillCategory.PAYMENT,
        layer: SkillLayer.INFRA,
        inputSchema: {
          type: 'object',
          properties: {
            amount: { type: 'number' },
            currency: { type: 'string', default: 'USDC' }
          },
          required: ['amount']
        },
        executor: { type: 'internal', internalHandler: 'quickpay_execute' }
      },
      {
        name: 'commerce',
        displayName: 'Unified Commerce',
        description: 'Unified commerce skill: pay, split, budget pool, settlements. Supports multi-party revenue sharing, milestone-based payouts, and on-chain settlements.',
        category: SkillCategory.COMMERCE,
        layer: SkillLayer.COMPOSITE,
        valueType: SkillValueType.ACTION,
        inputSchema: {
          type: 'object',
          properties: {
            action: {
              type: 'string',
              description: 'The commerce action to perform',
              enum: [
                'create_split_plan',
                'get_split_plan',
                'update_split_plan',
                'activate_split_plan',
                'archive_split_plan',
                'list_split_plans',
                'preview_allocation',
                'create_budget_pool',
                'get_budget_pool',
                'fund_budget_pool',
                'activate_budget_pool',
                'cancel_budget_pool',
                'list_budget_pools',
                'create_milestone',
                'get_milestone',
                'start_milestone',
                'submit_milestone',
                'approve_milestone',
                'reject_milestone',
                'release_milestone_funds',
                'calculate_fees',
                'get_fee_structure'
              ]
            },
            mode: {
              type: 'string',
              enum: ['PAY_ONLY', 'SPLIT_ONLY', 'PAY_AND_SPLIT'],
              description: 'Commerce operation mode'
            },
            params: {
              type: 'object',
              description: 'Action-specific parameters'
            }
          },
          required: ['action']
        },
        executor: { type: 'mcp', mcpServer: 'agentrix-mcp-server', internalHandler: 'commerce' },
        pricing: { type: SkillPricingType.FREE },
        tags: ['commerce', 'split', 'budget', 'milestone', 'ucp', 'x402'],
        ucpEnabled: true,
        x402Enabled: true
      }
    ];

    for (const data of coreSkills) {
      const conversionSkill = { ...data } as unknown as Skill;
      const platformSchemas = {
        openai: skillConverter.convertToOpenAI(conversionSkill),
        claude: skillConverter.convertToClaude(conversionSkill),
        gemini: skillConverter.convertToGemini(conversionSkill),
      };
      const existing = await skillRepo.findOne({ where: { name: data.name } });
      if (existing) {
        console.log(`Skill ${data.name} already exists, updating...`);
        Object.assign(existing, {
          ...data,
          platformSchemas,
          authorId: systemUser.id,
          authorInfo: {
            id: systemUser.id,
            name: 'Agentrix Platform',
            type: 'platform'
          }
        });
        await skillRepo.save(existing);
      } else {
        const skill = skillRepo.create({
          ...data,
          platformSchemas,
          source: SkillSource.NATIVE,
          status: SkillStatus.PUBLISHED,
          authorId: systemUser.id,
          authorInfo: {
            id: systemUser.id,
            name: 'Agentrix Platform',
            type: 'platform'
          },
          version: '1.0.0'
        } as any);
        await skillRepo.save(skill);
        console.log(`Skill ${data.name} created.`);
      }
    }

    console.log('Core skills seeding complete!');
  } catch (error) {
    console.error('Error seeding core skills:', error);
  } finally {
    if (AppDataSource.isInitialized) {
      await AppDataSource.destroy();
    }
  }
}

seedCoreSkills();
