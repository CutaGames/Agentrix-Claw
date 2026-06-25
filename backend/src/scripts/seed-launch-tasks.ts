/**
 * Seed Launch Tasks — Bounty tasks for Agentrix Task Marketplace
 * 
 * These are real bounty tasks visible on both web and mobile task marketplace.
 * 
 * Run: npx ts-node -r tsconfig-paths/register src/scripts/seed-launch-tasks.ts
 */

import { AppDataSource } from '../config/data-source';
import { MerchantTask, TaskStatus, TaskType, TaskVisibility } from '../entities/merchant-task.entity';
import { User, UserRole } from '../entities/user.entity';

const LAUNCH_TASKS = [
  {
    type: TaskType.DESIGN,
    title: 'Modern Tech Startup Logo Design',
    description: 'We need a modern, minimalist logo for our AI-powered fintech startup. The logo should work in both light and dark modes, be scalable from favicon to billboard size. Deliverables: SVG vector file, PNG in multiple sizes, brand color palette, and basic usage guidelines. Preferred styles: geometric, abstract, or lettermark.',
    budget: 500,
    currency: 'USD',
    tags: ['design', 'logo', 'branding', 'startup'],
    requirements: {
      deadline: new Date('2026-03-15'),
      deliverables: ['SVG vector logo', 'PNG exports (16px to 1024px)', 'Brand color palette', 'Usage guidelines PDF'],
    },
    metadata: {
      priority: 'high' as const,
      skillRequirements: ['Graphic Design', 'Brand Identity', 'Adobe Illustrator'],
    },
  },
  {
    type: TaskType.DEVELOPMENT,
    title: 'Build Telegram Trading Bot with DeFi Integration',
    description: 'Develop a Telegram bot that connects to DeFi protocols on BSC and Ethereum. Features: token swap via Uniswap/PancakeSwap, price alerts, portfolio tracking, limit orders. Must use Node.js/TypeScript. Include unit tests and deployment guide.',
    budget: 3000,
    currency: 'USD',
    tags: ['development', 'telegram', 'bot', 'defi', 'web3'],
    requirements: {
      deadline: new Date('2026-04-01'),
      deliverables: ['Source code (TypeScript)', 'Deployment guide', 'Unit tests (>80% coverage)', 'API documentation'],
    },
    metadata: {
      priority: 'high' as const,
      skillRequirements: ['TypeScript', 'Telegram Bot API', 'Web3.js', 'DeFi protocols'],
    },
  },
  {
    type: TaskType.CONTENT,
    title: 'Write 10 SEO Blog Posts on AI Agent Technology',
    description: 'Create 10 high-quality, SEO-optimized blog posts (1500-2000 words each) about AI agent technology, MCP protocol, agent commerce, and the future of autonomous AI. Each post should include original research, data citations, and be optimized for target keywords. Topics include: Agent-to-Agent commerce, MCP ecosystem, AI skill marketplace, etc.',
    budget: 800,
    currency: 'USD',
    tags: ['content', 'writing', 'seo', 'ai', 'blog'],
    requirements: {
      deadline: new Date('2026-03-20'),
      deliverables: ['10 blog posts in Markdown', 'SEO keyword research document', 'Meta descriptions for each post', 'Social media snippets'],
    },
    metadata: {
      priority: 'medium' as const,
      skillRequirements: ['SEO Writing', 'AI/Tech Knowledge', 'Content Strategy'],
    },
  },
  {
    type: TaskType.DEVELOPMENT,
    title: 'Smart Contract Security Audit — ERC-20 + Staking',
    description: 'Perform a comprehensive security audit on our ERC-20 token contract and staking mechanism (Solidity 0.8.x). Check for: reentrancy, overflow/underflow, access control, gas optimization, front-running vulnerabilities. Deliver a detailed report with severity ratings (Critical/High/Medium/Low/Informational).',
    budget: 2500,
    currency: 'USD',
    tags: ['development', 'security', 'audit', 'solidity', 'web3'],
    requirements: {
      deadline: new Date('2026-03-10'),
      deliverables: ['Audit report (PDF)', 'Vulnerability list with fix recommendations', 'Gas optimization suggestions', 'Follow-up verification'],
    },
    metadata: {
      priority: 'high' as const,
      skillRequirements: ['Solidity', 'Smart Contract Security', 'Formal Verification'],
    },
  },
  {
    type: TaskType.DESIGN,
    title: 'UI/UX Design for AI Agent Dashboard',
    description: 'Design a comprehensive dashboard UI for managing AI agents. Screens needed: agent overview, skill marketplace, commission analytics, task management, wallet/payments, settings. Must support dark mode. Deliver Figma file with component library and interactive prototype.',
    budget: 1500,
    currency: 'USD',
    tags: ['design', 'ui', 'ux', 'dashboard', 'figma'],
    requirements: {
      deadline: new Date('2026-03-25'),
      deliverables: ['Figma file with all screens', 'Component library', 'Interactive prototype', 'Design system documentation'],
    },
    metadata: {
      priority: 'medium' as const,
      skillRequirements: ['UI/UX Design', 'Figma', 'Dashboard Design', 'Design Systems'],
    },
  },
  {
    type: TaskType.CONTENT,
    title: 'Translate Platform Documentation EN→CN/JP/KR',
    description: 'Translate our developer documentation and user guides from English to Chinese (Simplified), Japanese, and Korean. Total ~30,000 words across 3 languages. Must maintain technical accuracy and natural readability. Includes API docs, SDK guides, and marketing materials.',
    budget: 1200,
    currency: 'USD',
    tags: ['translation', 'documentation', 'localization', 'multilingual'],
    requirements: {
      deadline: new Date('2026-03-30'),
      deliverables: ['Chinese translation (Markdown)', 'Japanese translation (Markdown)', 'Korean translation (Markdown)', 'Glossary of technical terms'],
    },
    metadata: {
      priority: 'medium' as const,
      skillRequirements: ['Translation', 'Technical Writing', 'Chinese', 'Japanese', 'Korean'],
    },
  },
  {
    type: TaskType.DEVELOPMENT,
    title: 'Build React Native Mobile Wallet Component',
    description: 'Create a reusable React Native wallet component supporting WalletConnect v2, MetaMask deep linking, and QR code scanning. Must work on both iOS and Android. Features: connect wallet, sign messages, send transactions, display token balances. Include Storybook documentation.',
    budget: 2000,
    currency: 'USD',
    tags: ['development', 'react-native', 'mobile', 'wallet', 'web3'],
    requirements: {
      deadline: new Date('2026-03-20'),
      deliverables: ['React Native component package', 'Storybook documentation', 'Example app', 'README with integration guide'],
    },
    metadata: {
      priority: 'high' as const,
      skillRequirements: ['React Native', 'WalletConnect', 'Mobile Development', 'Web3'],
    },
  },
  {
    type: TaskType.CONSULTATION,
    title: 'Tokenomics Review & Optimization Consultation',
    description: 'Review our current tokenomics model (utility token with staking, governance, and fee distribution) and provide optimization recommendations. Focus on: token velocity, staking incentives, fee structure sustainability, and growth flywheel design. 2-hour consultation + written report.',
    budget: 600,
    currency: 'USD',
    tags: ['consultation', 'tokenomics', 'web3', 'strategy'],
    requirements: {
      deadline: new Date('2026-03-15'),
      deliverables: ['2-hour video consultation', 'Written analysis report', 'Tokenomics model spreadsheet', 'Recommended changes document'],
    },
    metadata: {
      priority: 'medium' as const,
      skillRequirements: ['Tokenomics', 'DeFi Economics', 'Token Design'],
    },
  },
];

async function seedLaunchTasks() {
  try {
    if (!AppDataSource.isInitialized) {
      await AppDataSource.initialize();
    }
    console.log('Database connected.');

    const taskRepo = AppDataSource.getRepository(MerchantTask);
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
    let skipped = 0;

    for (const data of LAUNCH_TASKS) {
      // Check if task with same title already exists
      const existing = await taskRepo.findOne({ where: { title: data.title } });
      if (existing) {
        console.log(`  ⏭ Skipped (exists): ${data.title}`);
        skipped++;
        continue;
      }

      const task = taskRepo.create({
        ...data,
        userId: systemUser.id,
        merchantId: systemUser.id,
        visibility: TaskVisibility.PUBLIC,
        status: TaskStatus.PENDING,
        progress: {
          currentStep: 'pending',
          completedSteps: [],
          percentage: 0,
          updates: [],
        },
      });

      const saved = await taskRepo.save(task);
      console.log(`  ✓ Created: ${data.title} ($${data.budget}) [${saved.id}]`);
      created++;
    }

    console.log(`\n🎉 Launch tasks seeding complete! Created: ${created}, Skipped: ${skipped}`);

    // Print summary
    const total = await taskRepo.count({ where: { visibility: TaskVisibility.PUBLIC, status: TaskStatus.PENDING } });
    console.log(`Total public pending tasks in DB: ${total}`);

  } catch (error) {
    console.error('Error seeding launch tasks:', error);
    throw error;
  } finally {
    if (AppDataSource.isInitialized) {
      await AppDataSource.destroy();
    }
  }
}

seedLaunchTasks();
