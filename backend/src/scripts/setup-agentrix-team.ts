/**
 * Agentrix Team Setup Script
 * 
 * 职责:
 * 1. 创建 "Agentrix Global HQ" 工作空间
 * 2. 初始化 4 个核心小队领袖 Agent (Architect, Coder, Marketing, BD)
 * 3. 为每个 Agent 创建独立账户并分配模拟资金
 */

import { AppDataSource } from '../config/data-source';
import { Workspace, WorkspaceType, WorkspaceStatus, WorkspacePlan } from '../entities/workspace.entity';
import { AgentAccount, AgentAccountStatus, AgentType } from '../entities/agent-account.entity';
import { Account, AccountOwnerType, AccountWalletType, AccountStatus, AccountChainType } from '../entities/account.entity';
import { User, UserRole, UserStatus } from '../entities/user.entity';

async function setupAgentrixTeam() {
  console.log('🚀 开始搭建 Agentrix "1+N" 团队自动化套件...\n');

  try {
    if (!AppDataSource.isInitialized) {
      await AppDataSource.initialize();
      console.log('✅ 数据库连接成功\n');
    }

    const workspaceRepo = AppDataSource.getRepository(Workspace);
    const agentRepo = AppDataSource.getRepository(AgentAccount);
    const accountRepo = AppDataSource.getRepository(Account);
    const userRepo = AppDataSource.getRepository(User);

    // 1. 获取或创建 CEO 用户 (人类 Leader)
    let ceoUser = await userRepo.findOne({ where: { email: 'ceo@agentrix.io' } } as any) as User;
    if (!ceoUser) {
      const newUser = userRepo.create({
        email: 'ceo@agentrix.io',
        agentrixId: 'ceo_human_leader',
        roles: [UserRole.DEVELOPER, UserRole.MERCHANT],
        status: UserStatus.ACTIVE,
      } as any);
      ceoUser = await userRepo.save(newUser as any) as User;
      console.log('👤 CEO (人类 Leader) 账户已就位');
    }

    // 2. 创建 Global HQ 工作空间
    let hqWorkspace = await workspaceRepo.findOne({ where: { slug: 'agentrix-hq' } });
    if (!hqWorkspace) {
      const newHq = workspaceRepo.create({
        name: 'Agentrix Global HQ',
        slug: 'agentrix-hq',
        description: 'Command center for Agentrix project development and ecosystem growth.',
        ownerId: ceoUser.id,
        type: WorkspaceType.ORGANIZATION,
        plan: WorkspacePlan.BUSINESS,
        status: WorkspaceStatus.ACTIVE,
        maxMembers: 50,
        maxAgents: 100,
        maxStorageMB: 10240,
      });
      hqWorkspace = await workspaceRepo.save(newHq);
      console.log('🏢 "Agentrix Global HQ" 工作空间已建立');
    }

    // 3. 初始化核心 Agent 小队
    const agentSquads = [
      {
        name: 'Lead Architect Agent',
        type: AgentType.PLATFORM,
        desc: 'Responsible for UCP/X402 protocol evolution and system architecture.',
        uniqueId: 'AGENT-ARCHITECT-001',
      },
      {
        name: 'Senior Coder Agent',
        type: AgentType.PLATFORM,
        desc: 'Expert in NestJS/Next.js. Handles feature implementation and bug fixes.',
        uniqueId: 'AGENT-CODER-001',
      },
      {
        name: 'Global Growth Agent',
        type: AgentType.PLATFORM,
        desc: 'Handles Twitter/Discord marketing and community engagement.',
        uniqueId: 'AGENT-GROWTH-001',
      },
      {
        name: 'Ecosystem BD Agent',
        type: AgentType.PLATFORM,
        desc: 'In charge of global merchant onboarding and API integration.',
        uniqueId: 'AGENT-BD-001',
      }
    ];

    for (const squad of agentSquads) {
      let agent = await agentRepo.findOne({ where: { agentUniqueId: squad.uniqueId } });
      if (!agent) {
        // 创建 Agent Account
        const newAgent = agentRepo.create({
          agentUniqueId: squad.uniqueId,
          name: squad.name,
          description: squad.desc,
          ownerId: ceoUser.id,
          agentType: squad.type,
          status: AgentAccountStatus.ACTIVE,
          creditScore: 800,
          spendingLimits: {
            singleTxLimit: 100,
            dailyLimit: 500,
            monthlyLimit: 10000,
            currency: 'USDC'
          }
        } as any);
        agent = await agentRepo.save(newAgent as any) as AgentAccount;

        // 为 Agent 创建资金账户
        const fundingAccount = accountRepo.create({
          accountId: `ACC-AGENT-${squad.uniqueId.replace('AGENT-', '')}`,
          name: `${squad.name} Funding Account`,
          ownerId: agent.id,
          ownerType: AccountOwnerType.AGENT,
          walletType: AccountWalletType.VIRTUAL,
          chainType: AccountChainType.MULTI,
          balance: 1000.0, // 初始 1000 USDC 模拟资金
          currency: 'USDC',
          status: AccountStatus.ACTIVE,
          isDefault: true,
        } as any);
        await accountRepo.save(fundingAccount as any);

        console.log(`🤖 Agent [${squad.name}] 已入驻，资金账户已激活 (Balance: 1000 USDC)`);
      }
    }

    console.log('\n✨ Agentrix "1+N" 团队搭建完成！');
    console.log('--------------------------------------------------');
    console.log(`CEO   : ${ceoUser.email}`);
    console.log(`HQ    : ${hqWorkspace.name} (${hqWorkspace.slug})`);
    console.log('Agents: 4 核心小队领袖已激活');
    console.log('--------------------------------------------------');
    console.log('提示: 请运行 `test-onboarding-flows.ts` 验证入驻流程。');

  } catch (error) {
    console.error('❌ 搭建失败:', error);
  } finally {
    process.exit();
  }
}

setupAgentrixTeam();
