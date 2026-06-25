import { DataSource } from 'typeorm';
import { Skill, SkillCategory, SkillStatus, SkillInputSchema } from '../entities/skill.entity';
import { AppDataSource } from '../config/data-source';

async function seed() {
  const dataSource = new DataSource(AppDataSource.options);
  await dataSource.initialize();
  console.log('Data Source has been initialized!');

  const skillRepository = dataSource.getRepository(Skill);

  const coreSkills: Partial<Skill>[] = [
    // Commerce Skills
    {
      name: 'search_products',
      description: 'Search products in Agentrix Marketplace. Supports physical goods, services, and digital assets.',
      category: SkillCategory.COMMERCE,
      status: SkillStatus.PUBLISHED,
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search query (e.g. "CUTA gaming console", "VR")' },
          type: { type: 'string', enum: ['physical', 'service', 'digital', 'x402'], description: 'Product type filter' },
        },
        required: ['query'],
      } as SkillInputSchema,
      executor: {
        type: 'internal',
        internalHandler: 'search_products',
      },
    },
    {
      name: 'get_product_details',
      description: 'Get detailed information about a specific product by ID',
      category: SkillCategory.COMMERCE,
      status: SkillStatus.PUBLISHED,
      inputSchema: {
        type: 'object',
        properties: {
          productId: { type: 'string', description: 'Product ID' },
        },
        required: ['productId'],
      } as SkillInputSchema,
      executor: {
        type: 'internal',
        internalHandler: 'get_product_details',
      },
    },
    {
      name: 'create_order',
      description: 'Create a new order for purchasing a product. Returns order details and checkout URL.',
      category: SkillCategory.COMMERCE,
      status: SkillStatus.PUBLISHED,
      inputSchema: {
        type: 'object',
        properties: {
          productId: { type: 'string', description: 'Product ID to purchase' },
          quantity: { type: 'number', description: 'Quantity to purchase', default: 1 },
        },
        required: ['productId'],
      } as SkillInputSchema,
      executor: {
        type: 'internal',
        internalHandler: 'create_order',
      },
    },

    // Wallet Skills
    {
      name: 'get_balance',
      description: 'Get user wallet balance for a specific chain',
      category: SkillCategory.PAYMENT,
      status: SkillStatus.PUBLISHED,
      inputSchema: {
        type: 'object',
        properties: {
          chain: { type: 'string', description: 'Chain (e.g. bsc, ethereum, solana)', default: 'bsc' },
        },
        required: [],
      } as SkillInputSchema,
      executor: {
        type: 'internal',
        internalHandler: 'get_balance',
      },
    },
    {
      name: 'asset_overview',
      description: 'Get an overview of all assets across different chains and fiat accounts',
      category: SkillCategory.PAYMENT,
      status: SkillStatus.PUBLISHED,
      inputSchema: {
        type: 'object',
        properties: {},
        required: [],
      } as SkillInputSchema,
      executor: {
        type: 'internal',
        internalHandler: 'asset_overview',
      },
    },

    // DeFi / Auto-Earn Skills
    {
      name: 'airdrop_discover',
      description: 'Discover available crypto airdrops and potential opportunities',
      category: SkillCategory.DATA,
      status: SkillStatus.PUBLISHED,
      inputSchema: {
        type: 'object',
        properties: {
          chains: { type: 'array', items: { type: 'string' }, description: 'Chains to scan' },
        },
        required: [],
      } as SkillInputSchema,
      executor: {
        type: 'internal',
        internalHandler: 'airdrop_discover',
      },
    },
    {
      name: 'airdrop_claim',
      description: 'Claim a specific airdrop',
      category: SkillCategory.UTILITY,
      status: SkillStatus.PUBLISHED,
      inputSchema: {
        type: 'object',
        properties: {
          airdropId: { type: 'string', description: 'Airdrop ID to claim' },
        },
        required: ['airdropId'],
      } as SkillInputSchema,
      executor: {
        type: 'internal',
        internalHandler: 'airdrop_claim',
      },
    },
    {
      name: 'dca_strategy_create',
      description: 'Create a Dollar Cost Averaging (DCA) strategy for automatic token purchase',
      category: SkillCategory.UTILITY,
      status: SkillStatus.PUBLISHED,
      inputSchema: {
        type: 'object',
        properties: {
          token: { type: 'string', description: 'Target token symbol' },
          amount: { type: 'number', description: 'Amount in USD per interval' },
          interval: { type: 'string', description: 'Execution interval', enum: ['daily', 'weekly', 'monthly'], default: 'weekly' },
        },
        required: ['token', 'amount'],
      } as SkillInputSchema,
      executor: {
        type: 'internal',
        internalHandler: 'dca_strategy_create',
      },
    },

    // External Integration Skills (HTTP)
    {
      name: 'fetch_crypto_price',
      description: 'Fetch real-time cryptocurrency price from external API',
      category: SkillCategory.DATA,
      status: SkillStatus.PUBLISHED,
      inputSchema: {
        type: 'object',
        properties: {
          ids: { type: 'string', description: 'Token IDs (e.g., bitcoin, ethereum)', default: 'bitcoin' },
          vs_currencies: { type: 'string', description: 'Target currencies (e.g., usd, eur)', default: 'usd' },
        },
        required: ['ids', 'vs_currencies'],
      } as SkillInputSchema,
      executor: {
        type: 'http',
        endpoint: 'https://api.coingecko.com/api/v3/simple/price',
        method: 'GET',
        headers: {
          'Accept': 'application/json'
        }
      },
    },
    {
      name: 'search_news',
      description: 'Search for latest news related to a topic',
      category: SkillCategory.DATA,
      status: SkillStatus.PUBLISHED,
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search query' },
          limit: { type: 'number', description: 'Number of results', default: 5 },
        },
        required: ['query'],
      } as SkillInputSchema,
      executor: {
        type: 'http',
        endpoint: 'https://jsonplaceholder.typicode.com/posts', // Mock endpoint
        method: 'GET',
      },
    },
    {
      name: 'grid_trading_create',
      description: 'Create a Grid Trading strategy for automatic buy/sell within a price range',
      category: SkillCategory.UTILITY,
      status: SkillStatus.PUBLISHED,
      inputSchema: {
        type: 'object',
        properties: {
          pair: { type: 'string', description: 'Trading pair (e.g. ETH/USDC)' },
          lowerPrice: { type: 'number', description: 'Lower price limit' },
          upperPrice: { type: 'number', description: 'Upper price limit' },
          gridCount: { type: 'number', description: 'Number of grids', default: 10 },
          amountPerGrid: { type: 'number', description: 'Investment amount per grid' },
        },
        required: ['pair', 'lowerPrice', 'upperPrice', 'amountPerGrid'],
      } as SkillInputSchema,
      executor: {
        type: 'internal',
        internalHandler: 'grid_trading_create',
      },
    },
    {
      name: 'arbitrage_scan',
      description: 'Scan for arbitrage opportunities across different DEXs',
      category: SkillCategory.DATA,
      status: SkillStatus.PUBLISHED,
      inputSchema: {
        type: 'object',
        properties: {
          minProfit: { type: 'number', description: 'Minimum profit percentage to report', default: 0.5 },
        },
        required: [],
      } as SkillInputSchema,
      executor: {
        type: 'internal',
        internalHandler: 'arbitrage_scan',
      },
    },

    // Auth & Security Skills
    {
      name: 'agent_authorize',
      description: 'Create a payment authorization for an AI Agent with specific limits',
      category: SkillCategory.INTEGRATION,
      status: SkillStatus.PUBLISHED,
      inputSchema: {
        type: 'object',
        properties: {
          agentId: { type: 'string', description: 'Agent ID to authorize' },
          limitAmount: { type: 'number', description: 'Maximum spending limit' },
          currency: { type: 'string', description: 'Currency for the limit', default: 'USD' },
          durationDays: { type: 'number', description: 'Duration of authorization in days', default: 30 },
        },
        required: ['agentId', 'limitAmount'],
      } as SkillInputSchema,
      executor: {
        type: 'internal',
        internalHandler: 'agent_authorize',
      },
    },
    {
      name: 'agent_revoke',
      description: 'Revoke a payment authorization for an AI Agent',
      category: SkillCategory.INTEGRATION,
      status: SkillStatus.PUBLISHED,
      inputSchema: {
        type: 'object',
        properties: {
          agentId: { type: 'string', description: 'Agent ID to revoke' },
        },
        required: ['agentId'],
      } as SkillInputSchema,
      executor: {
        type: 'internal',
        internalHandler: 'agent_revoke',
      },
    },
  ];

  for (const skillData of coreSkills) {
    const existing = await skillRepository.findOne({ where: { name: skillData.name } });
    if (existing) {
      console.log(`Skill ${skillData.name} already exists, updating...`);
      await skillRepository.update(existing.id, skillData);
    } else {
      console.log(`Creating skill ${skillData.name}...`);
      const skill = skillRepository.create(skillData);
      await skillRepository.save(skill);
    }
  }

  console.log('Seeding completed!');
  await dataSource.destroy();
}

seed().catch((error) => {
  console.error('Seeding failed:', error);
  process.exit(1);
});
