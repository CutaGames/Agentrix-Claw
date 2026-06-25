/**
 * Commerce MCP Tools Registration
 * 
 * Unified commerce skill for AI agents: payment + commission + budget pools
 * 
 * Fee Structure:
 * - Pure Crypto: 0% (free)
 * - On-ramp: +0.1%
 * - Off-ramp: +0.1%
 * - Split: 0.3% (min 0.1 USDC)
 */

// ============ Main Commerce Tool ============
export const commerceTool = {
  name: 'commerce',
  description: 'Unified commerce skill: pay, split, budget pool, settlements. Supports multi-party revenue sharing, milestone-based payouts, and on-chain settlements. (统一商业技能：支付、分账、预算池、结算) Example: {"action":"create_split_plan","params":{"name":"My Plan","rules":[{"recipient":"0x...","shareBps":7000,"role":"merchant"}]}}',
  inputSchema: {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        description: 'The commerce action to perform',
        enum: [
          // Split Plan Actions
          'create_split_plan',
          'get_split_plan',
          'update_split_plan',
          'activate_split_plan',
          'archive_split_plan',
          'list_split_plans',
          'preview_allocation',
          // Budget Pool Actions
          'create_budget_pool',
          'get_budget_pool',
          'fund_budget_pool',
          'activate_budget_pool',
          'cancel_budget_pool',
          'list_budget_pools',
          // Milestone Actions
          'create_milestone',
          'get_milestone',
          'start_milestone',
          'submit_milestone',
          'approve_milestone',
          'reject_milestone',
          'release_milestone_funds',
          // Utility Actions
          'calculate_fees',
          'get_fee_structure',
        ],
      },
      mode: {
        type: 'string',
        enum: ['PAY_ONLY', 'SPLIT_ONLY', 'PAY_AND_SPLIT'],
        description: 'Commerce operation mode',
      },
      params: {
        type: 'object',
        description: 'Action-specific parameters',
      },
    },
    required: ['action'],
  },
};

// ============ Split Plan Tool ============
export const splitPlanTool = {
  name: 'split_plan',
  description: 'Create and manage revenue split plans for multi-party transactions. Define how payments are distributed among participants (merchants, agents, referrers). (创建和管理多方交易的分账计划) Example: {"action":"create","name":"Skill Split","productType":"skill","rules":[{"recipient":"0xMerchant","shareBps":7000,"role":"merchant"},{"recipient":"0xAgent","shareBps":2000,"role":"agent"}]}',
  inputSchema: {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        enum: ['create', 'get', 'update', 'activate', 'archive', 'list', 'preview'],
      },
      planId: {
        type: 'string',
        description: 'Split plan ID (for get/update/activate/archive)',
      },
      name: {
        type: 'string',
        description: 'Plan name (for create)',
      },
      productType: {
        type: 'string',
        description: 'Product type: skill, subscription, marketplace, custom',
      },
      rules: {
        type: 'array',
        description: 'Array of split rules defining recipient shares',
        items: {
          type: 'object',
          properties: {
            recipient: { type: 'string', description: 'Wallet address or user ID' },
            shareBps: { type: 'number', description: 'Share in basis points (10000 = 100%)' },
            role: { type: 'string', enum: ['platform', 'merchant', 'agent', 'referrer', 'custom'] },
          },
        },
      },
      feeConfig: {
        type: 'object',
        description: 'Custom fee configuration',
        properties: {
          onrampFeeBps: { type: 'number', description: 'On-ramp fee (default: 10 = 0.1%)' },
          offrampFeeBps: { type: 'number', description: 'Off-ramp fee (default: 10 = 0.1%)' },
          splitFeeBps: { type: 'number', description: 'Split fee (default: 30 = 0.3%)' },
          minSplitFee: { type: 'number', description: 'Min split fee in micro units (default: 100000 = 0.1 USDC)' },
        },
      },
      // Preview parameters
      amount: {
        type: 'string',
        description: 'Amount for allocation preview (in micro units)',
      },
      paymentType: {
        type: 'string',
        enum: ['CRYPTO_DIRECT', 'ONRAMP', 'OFFRAMP', 'MIXED'],
        description: 'Payment type for fee calculation',
      },
    },
    required: ['action'],
  },
};

// ============ Budget Pool Tool ============
export const budgetPoolTool = {
  name: 'budget_pool',
  description: 'Create and manage budget pools for multi-agent collaboration tasks. Supports milestone-based payouts with quality gates. (创建和管理多Agent协作任务的预算池，支持里程碑付款和质量门控) Example: {"action":"create","name":"Dev Task","totalBudget":"1000000000","qualityGate":{"minQualityScore":80,"requiresApproval":true}}',
  inputSchema: {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        enum: ['create', 'get', 'fund', 'activate', 'cancel', 'list'],
      },
      poolId: {
        type: 'string',
        description: 'Budget pool ID',
      },
      name: {
        type: 'string',
        description: 'Pool name',
      },
      totalBudget: {
        type: 'string',
        description: 'Total budget in micro units',
      },
      deadline: {
        type: 'string',
        description: 'Deadline ISO date string',
      },
      qualityGate: {
        type: 'object',
        properties: {
          minQualityScore: { type: 'number', description: 'Min quality score 0-100' },
          requiresApproval: { type: 'boolean', description: 'Requires manual approval' },
          autoReleaseDelay: { type: 'number', description: 'Auto-release delay in seconds' },
        },
      },
      // Funding parameters
      amount: {
        type: 'string',
        description: 'Amount to fund',
      },
      source: {
        type: 'string',
        enum: ['wallet', 'transak', 'external'],
        description: 'Funding source',
      },
    },
    required: ['action'],
  },
};

// ============ Milestone Tool ============
export const milestoneTool = {
  name: 'milestone',
  description: 'Manage milestones within budget pools. Create, start, submit deliverables, approve/reject with quality scores, and release funds for completed work. (管理预算池中的里程碑：创建、启动、提交交付物、审批并释放资金) Example: {"action":"create","poolId":"pool_123","title":"Phase 1 - Design","percentOfPool":3000}',
  inputSchema: {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        enum: ['create', 'get', 'start', 'submit', 'approve', 'reject', 'release'],
      },
      milestoneId: {
        type: 'string',
        description: 'Milestone ID',
      },
      poolId: {
        type: 'string',
        description: 'Parent budget pool ID (for create)',
      },
      title: {
        type: 'string',
        description: 'Milestone title',
      },
      percentOfPool: {
        type: 'number',
        description: 'Percentage of pool budget (in basis points, 10000 = 100%)',
      },
      participants: {
        type: 'array',
        description: 'Milestone participants',
        items: {
          type: 'object',
          properties: {
            address: { type: 'string', description: 'Wallet address' },
            shareBps: { type: 'number', description: 'Share in basis points' },
          },
        },
      },
      // Submit parameters
      deliverableHash: {
        type: 'string',
        description: 'Hash of deliverable for verification',
      },
      artifacts: {
        type: 'array',
        items: { type: 'string' },
        description: 'List of artifact URLs or IPFS hashes',
      },
      // Approve parameters
      qualityScore: {
        type: 'number',
        description: 'Quality score 0-100',
      },
      feedback: {
        type: 'string',
        description: 'Approval feedback',
      },
      // Reject parameters
      reason: {
        type: 'string',
        description: 'Rejection reason',
      },
    },
    required: ['action'],
  },
};

// ============ Fee Calculator Tool ============
export const feeCalculatorTool = {
  name: 'calculate_commerce_fees',
  description: 'Calculate platform fees for a given amount and payment type. Pure crypto: 0% (free). On-ramp: +0.1%. Off-ramp: +0.1%. Split: 0.3% (min 0.1 USDC). (计算平台费用：纯加密货币免费，入金+0.1%，出金+0.1%，分账0.3%) Example: {"amount":10000000,"paymentType":"CRYPTO_DIRECT"}',
  inputSchema: {
    type: 'object',
    properties: {
      amount: {
        type: 'number',
        description: 'Amount in micro units (1 USDC = 1000000)',
      },
      paymentType: {
        type: 'string',
        enum: ['CRYPTO_DIRECT', 'ONRAMP', 'OFFRAMP', 'MIXED'],
        description: 'Payment type: CRYPTO_DIRECT (free), ONRAMP (+0.1%), OFFRAMP (+0.1%), MIXED (both)',
      },
    },
    required: ['amount', 'paymentType'],
  },
};

// ============ Export All Tools ============
// === New tools for Commerce Skill launch (2026-02-08) ===

const publishToMarketplaceTool = {
  name: 'publish_to_marketplace',
  description: 'Publish a skill, product, service, or task to Agentrix Marketplace (www.agentrix.top). Supports automatic split plan creation and budget pool setup. Platform fee: 0.3% on transactions. Free for wallet payments. (发布技能/商品/服务/任务到Agentrix市场，支持自动创建分账计划和预算池) Example: {"type":"skill","name":"AI Translator","description":"Real-time translation","pricing":{"model":"per_call","price":0.01}}',
  inputSchema: {
    type: 'object' as const,
    properties: {
      type: { type: 'string', enum: ['skill', 'product', 'service', 'task'], description: 'Type of item to publish' },
      name: { type: 'string', description: 'Name of the item (3-100 chars)' },
      description: { type: 'string', description: 'Detailed description (10-5000 chars)' },
      category: { type: 'string', enum: ['payment', 'commerce', 'data', 'utility', 'integration', 'ai', 'defi', 'nft', 'social', 'other'], description: 'Category' },
      pricing: { type: 'object', properties: { model: { type: 'string', enum: ['free', 'per_call', 'subscription', 'one_time', 'revenue_share'] }, price: { type: 'number' }, currency: { type: 'string' } }, required: ['model'] },
      splitPlan: { type: 'object', properties: { template: { type: 'string', enum: ['physical', 'service', 'virtual', 'nft', 'skill', 'agent_task'] }, rules: { type: 'array' } } },
      budgetPool: { type: 'object', properties: { totalBudget: { type: 'number' }, currency: { type: 'string' }, milestones: { type: 'array' } } },
      tags: { type: 'array', description: 'Tags for discoverability' },
      visibility: { type: 'string', enum: ['public', 'private', 'unlisted'] },
    },
    required: ['type', 'name', 'description'],
  },
};

const searchMarketplaceTool = {
  name: 'search_marketplace',
  description: 'Search Agentrix Marketplace for skills, products, services, and tasks. Supports natural language queries, filtering, and sorting. Returns results optimized for AI agents. (搜索Agentrix市场的技能、商品、服务和任务，支持自然语言查询) Example: {"query":"payment integration","type":"skill","sortBy":"popular"}',
  inputSchema: {
    type: 'object' as const,
    properties: {
      query: { type: 'string', description: 'Search query (natural language supported)' },
      type: { type: 'string', enum: ['all', 'skill', 'product', 'service', 'task'], description: 'Filter by type. Default: all' },
      category: { type: 'string', enum: ['payment', 'commerce', 'data', 'utility', 'integration', 'ai', 'defi', 'nft', 'social'] },
      priceMin: { type: 'number', description: 'Min price USD' },
      priceMax: { type: 'number', description: 'Max price USD' },
      sortBy: { type: 'string', enum: ['relevance', 'popular', 'newest', 'price_low', 'price_high', 'rating'] },
      page: { type: 'number' },
      limit: { type: 'number', description: 'Max 50. Default: 10' },
    },
    required: ['query'],
  },
};

const executeSkillTool = {
  name: 'execute_skill',
  description: 'Execute a skill from Agentrix Marketplace by ID. Free skills execute immediately. Paid skills require payment via wallet (free, user pays gas), balance, or X402 auto payment for autonomous agents. (按ID执行市场技能，免费技能立即执行，付费技能支持钱包/余额/X402自动支付) Example: {"skillId":"skill_abc123","params":{"text":"Hello"},"paymentMethod":"x402_auto","maxPrice":1.0}',
  inputSchema: {
    type: 'object' as const,
    properties: {
      skillId: { type: 'string', description: 'Skill ID from search results' },
      params: { type: 'object', description: 'Skill-specific input parameters' },
      paymentMethod: { type: 'string', enum: ['wallet', 'balance', 'x402_auto'], description: 'Payment method. Default: balance' },
      maxPrice: { type: 'number', description: 'Max price safety limit (USD)' },
    },
    required: ['skillId'],
  },
};

export const commerceMcpTools = [
  commerceTool,
  splitPlanTool,
  budgetPoolTool,
  milestoneTool,
  feeCalculatorTool,
  publishToMarketplaceTool,
  searchMarketplaceTool,
  executeSkillTool,
];

/**
 * Get tool by name
 */
export function getCommerceTool(name: string) {
  return commerceMcpTools.find((t) => t.name === name);
}

/**
 * Get all commerce tool names
 */
export function getCommerceToolNames(): string[] {
  return commerceMcpTools.map((t) => t.name);
}
