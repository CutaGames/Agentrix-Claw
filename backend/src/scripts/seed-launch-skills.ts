/**
 * Seed Launch Skills — 8 Official Commerce Skills for Agentrix Launch
 * 
 * These are real skills with proper pricing, descriptions, and metadata
 * that appear on both web and mobile marketplace.
 * 
 * Run: npx ts-node -r tsconfig-paths/register src/scripts/seed-launch-skills.ts
 */

import { AppDataSource } from '../config/data-source';
import {
  Skill,
  SkillCategory,
  SkillLayer,
  SkillSource,
  SkillStatus,
  SkillPricingType,
  SkillResourceType,
  SkillValueType,
} from '../entities/skill.entity';
import { User, UserRole } from '../entities/user.entity';

const LAUNCH_SKILLS = [
  // ===== AI Generation Skills =====
  {
    name: 'image_generation_pro',
    displayName: 'Image Generation Pro',
    description: 'Generate high-quality images from text prompts using state-of-the-art AI models. Supports multiple styles: photorealistic, anime, oil painting, 3D render, pixel art. Output up to 4K resolution with commercial usage rights.',
    category: SkillCategory.CUSTOM,
    layer: SkillLayer.LOGIC,
    valueType: SkillValueType.DELIVERABLE,
    resourceType: SkillResourceType.DIGITAL,
    pricing: {
      type: SkillPricingType.PER_CALL,
      pricePerCall: 0.05,
      currency: 'USD',
      freeQuota: 5,
    },
    tags: ['ai', 'image', 'generation', 'creative', 'design'],
    callCount: 45200,
    rating: 4.9,
    imageUrl: 'https://images.unsplash.com/photo-1686191128892-3b37add4c844?w=400',
    humanAccessible: true,
    compatibleAgents: ['all'],
    metadata: {
      reviewCount: 512,
      likeCount: 234,
      usageCount: 3500,
      priceUnit: 'per image',
      agentCompatible: true,
    },
  },
  {
    name: 'code_review_bot',
    displayName: 'Code Review Bot',
    description: 'AI-powered code review agent that analyzes your code for bugs, security vulnerabilities, performance issues, and style violations. Supports 20+ languages including TypeScript, Python, Rust, Solidity. Provides actionable fix suggestions with explanations.',
    category: SkillCategory.UTILITY,
    layer: SkillLayer.LOGIC,
    valueType: SkillValueType.DELIVERABLE,
    resourceType: SkillResourceType.SERVICE,
    pricing: {
      type: SkillPricingType.PER_CALL,
      pricePerCall: 0.03,
      currency: 'USD',
      freeQuota: 10,
    },
    tags: ['code', 'review', 'security', 'dev-tool', 'ai'],
    callCount: 18200,
    rating: 4.4,
    imageUrl: 'https://images.unsplash.com/photo-1555066931-4365d14bab8c?w=400',
    humanAccessible: true,
    compatibleAgents: ['all'],
    metadata: {
      reviewCount: 203,
      likeCount: 98,
      usageCount: 1600,
      priceUnit: 'per review',
      agentCompatible: true,
    },
  },
  {
    name: 'gpt4_translation',
    displayName: 'GPT-4 Translation',
    description: 'Professional-grade translation powered by GPT-4. Supports 100+ language pairs with context-aware translation, preserving tone, idioms, and cultural nuances. Ideal for documents, marketing copy, technical manuals, and creative writing.',
    category: SkillCategory.UTILITY,
    layer: SkillLayer.LOGIC,
    valueType: SkillValueType.DELIVERABLE,
    resourceType: SkillResourceType.SERVICE,
    pricing: {
      type: SkillPricingType.PER_CALL,
      pricePerCall: 0.02,
      currency: 'USD',
      freeQuota: 20,
    },
    tags: ['translation', 'language', 'gpt4', 'ai', 'writing'],
    callCount: 13500,
    rating: 4.8,
    imageUrl: 'https://images.unsplash.com/photo-1451187580459-43490279c0fa?w=400',
    humanAccessible: true,
    compatibleAgents: ['all'],
    metadata: {
      reviewCount: 326,
      likeCount: 89,
      usageCount: 1200,
      priceUnit: 'per 1K words',
      agentCompatible: true,
    },
  },

  // ===== Web3 / DeFi Skills =====
  {
    name: 'smart_contract_audit',
    displayName: 'Smart Contract Audit',
    description: 'Automated smart contract security audit using AI + formal verification. Detects reentrancy, overflow, access control issues, and gas optimization opportunities. Generates detailed PDF report with severity ratings and fix recommendations.',
    category: SkillCategory.CHAIN,
    layer: SkillLayer.LOGIC,
    valueType: SkillValueType.DECISION,
    resourceType: SkillResourceType.SERVICE,
    pricing: {
      type: SkillPricingType.PER_CALL,
      pricePerCall: 2.50,
      currency: 'USD',
      freeQuota: 1,
    },
    tags: ['web3', 'solidity', 'audit', 'security', 'smart-contract'],
    callCount: 3800,
    rating: 4.7,
    imageUrl: 'https://images.unsplash.com/photo-1639762681485-074b7f938ba0?w=400',
    humanAccessible: true,
    compatibleAgents: ['all'],
    metadata: {
      reviewCount: 87,
      likeCount: 156,
      usageCount: 890,
      priceUnit: 'per contract',
      agentCompatible: true,
    },
  },
  {
    name: 'defi_yield_scanner',
    displayName: 'DeFi Yield Scanner',
    description: 'Real-time DeFi yield aggregator scanning 50+ protocols across BSC, Ethereum, Polygon, and Arbitrum. Compares APY, TVL, risk scores, and impermanent loss projections. Returns top opportunities ranked by risk-adjusted returns.',
    category: SkillCategory.DATA,
    layer: SkillLayer.LOGIC,
    valueType: SkillValueType.DATA,
    resourceType: SkillResourceType.DATA,
    pricing: {
      type: SkillPricingType.PER_CALL,
      pricePerCall: 0.10,
      currency: 'USD',
      freeQuota: 3,
    },
    tags: ['defi', 'yield', 'farming', 'web3', 'data'],
    callCount: 8900,
    rating: 4.3,
    imageUrl: 'https://images.unsplash.com/photo-1621761191319-c6fb62004040?w=400',
    humanAccessible: true,
    compatibleAgents: ['all'],
    metadata: {
      reviewCount: 145,
      likeCount: 67,
      usageCount: 2100,
      priceUnit: 'per scan',
      agentCompatible: true,
    },
  },

  // ===== Data & Analysis Skills =====
  {
    name: 'market_sentiment_ai',
    displayName: 'Market Sentiment AI',
    description: 'AI-powered market sentiment analysis combining social media signals (Twitter/X, Reddit, Telegram), on-chain metrics, and news sentiment. Provides bullish/bearish scores, trend predictions, and whale movement alerts for any token or stock.',
    category: SkillCategory.ANALYSIS,
    layer: SkillLayer.LOGIC,
    valueType: SkillValueType.DATA,
    resourceType: SkillResourceType.DATA,
    pricing: {
      type: SkillPricingType.PER_CALL,
      pricePerCall: 0.08,
      currency: 'USD',
      freeQuota: 5,
    },
    tags: ['sentiment', 'market', 'ai', 'trading', 'analysis'],
    callCount: 22100,
    rating: 4.5,
    imageUrl: 'https://images.unsplash.com/photo-1611974789855-9c2a0a7236a3?w=400',
    humanAccessible: true,
    compatibleAgents: ['all'],
    metadata: {
      reviewCount: 278,
      likeCount: 189,
      usageCount: 4300,
      priceUnit: 'per query',
      agentCompatible: true,
    },
  },

  // ===== Creative / Design Skills =====
  {
    name: 'logo_designer_ai',
    displayName: 'Logo Designer AI',
    description: 'Professional logo design powered by AI. Describe your brand and get 4 unique logo concepts with vector SVG output, brand color palette, and usage guidelines. Supports minimalist, vintage, geometric, mascot, and wordmark styles.',
    category: SkillCategory.CUSTOM,
    layer: SkillLayer.LOGIC,
    valueType: SkillValueType.DELIVERABLE,
    resourceType: SkillResourceType.DIGITAL,
    pricing: {
      type: SkillPricingType.PER_CALL,
      pricePerCall: 1.00,
      currency: 'USD',
      freeQuota: 1,
    },
    tags: ['design', 'logo', 'branding', 'creative', 'ai'],
    callCount: 6200,
    rating: 4.6,
    imageUrl: 'https://images.unsplash.com/photo-1626785774573-4b799315345d?w=400',
    humanAccessible: true,
    compatibleAgents: ['all'],
    metadata: {
      reviewCount: 156,
      likeCount: 210,
      usageCount: 1800,
      priceUnit: 'per design',
      agentCompatible: true,
    },
  },

  // ===== Automation / Integration =====
  {
    name: 'social_content_generator',
    displayName: 'Social Content Generator',
    description: 'Generate engaging social media content for Twitter/X, LinkedIn, Instagram, and TikTok. Creates platform-optimized posts with hashtags, emojis, and call-to-actions. Supports content calendars, thread generation, and A/B testing variations.',
    category: SkillCategory.UTILITY,
    layer: SkillLayer.LOGIC,
    valueType: SkillValueType.DELIVERABLE,
    resourceType: SkillResourceType.SERVICE,
    pricing: {
      type: SkillPricingType.PER_CALL,
      pricePerCall: 0.05,
      currency: 'USD',
      freeQuota: 10,
    },
    tags: ['social', 'content', 'marketing', 'writing', 'ai'],
    callCount: 31000,
    rating: 4.7,
    imageUrl: 'https://images.unsplash.com/photo-1611162617474-5b21e879e113?w=400',
    humanAccessible: true,
    compatibleAgents: ['all'],
    metadata: {
      reviewCount: 489,
      likeCount: 312,
      usageCount: 5600,
      priceUnit: 'per post',
      agentCompatible: true,
    },
  },
];

async function seedLaunchSkills() {
  try {
    if (!AppDataSource.isInitialized) {
      await AppDataSource.initialize();
    }
    console.log('Database connected.');

    const skillRepo = AppDataSource.getRepository(Skill);
    const userRepo = AppDataSource.getRepository(User);

    // Find or create system user
    let systemUser = await userRepo.findOne({ where: { agentrixId: 'system' } });
    if (!systemUser) {
      const user = new User();
      user.agentrixId = 'system';
      user.email = 'system@agentrix.top';
      user.roles = [UserRole.USER, UserRole.AGENT];
      systemUser = await userRepo.save(user);
      console.log('System user created:', systemUser.id);
    }

    let created = 0;
    let updated = 0;

    for (const data of LAUNCH_SKILLS) {
      const existing = await skillRepo.findOne({ where: { name: data.name } });

      const skillData = {
        ...data,
        source: SkillSource.NATIVE,
        status: SkillStatus.PUBLISHED,
        authorId: systemUser.id,
        authorInfo: {
          id: systemUser.id,
          name: 'Agentrix Platform',
          type: 'platform' as const,
        },
        version: '1.0.0',
        inputSchema: {
          type: 'object' as const,
          properties: {
            input: { type: 'string', description: 'User input or query' },
          },
          required: ['input'],
        },
        executor: {
          type: 'internal' as const,
          internalHandler: data.name,
        },
      };

      if (existing) {
        Object.assign(existing, skillData);
        await skillRepo.save(existing);
        console.log(`  ✓ Updated: ${data.displayName} (${existing.id})`);
        updated++;
      } else {
        const skill = skillRepo.create(skillData as any);
        const saved = await skillRepo.save(skill);
        console.log(`  ✓ Created: ${data.displayName} (${(saved as any).id})`);
        created++;
      }
    }

    console.log(`\n🎉 Launch skills seeding complete! Created: ${created}, Updated: ${updated}`);

    // Print summary
    const total = await skillRepo.count({ where: { status: SkillStatus.PUBLISHED } });
    console.log(`Total published skills in DB: ${total}`);

  } catch (error) {
    console.error('Error seeding launch skills:', error);
    throw error;
  } finally {
    if (AppDataSource.isInitialized) {
      await AppDataSource.destroy();
    }
  }
}

seedLaunchSkills();
