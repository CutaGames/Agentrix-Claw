import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AgentAccount } from '../../entities/agent-account.entity';
import { AgentSpendingRecord } from '../../entities/agent-spending-record.entity';
import { Account } from '../../entities/account.entity';
import { AgentAccountService } from './agent-account.service';
import { AgentAccountController } from './agent-account.controller';
import { AgentAccountResetScheduler } from './agent-account-reset.scheduler';
import {
  AgentWalletService,
  PlaceholderMpcWalletProvider,
  MPC_WALLET_PROVIDER,
} from './agent-wallet.service';
import { AgentKeyService } from './agent-key.service';
import { AgentOnchainIdentityService } from './agent-onchain-identity.service';
import { AgentModule } from '../agent/agent.module';
import { MPCWalletModule } from '../mpc-wallet/mpc-wallet.module';
import { RelayerModule } from '../relayer/relayer.module';
import { AgentAuthorizationModule } from '../agent-authorization/agent-authorization.module';

/**
 * AI Agent 账户模块
 * 
 * 提供 AI Agent 独立账户的管理能力：
 * - Agent 账户的 CRUD 操作
 * - 信用评分管理
 * - 支出限额控制
 * - 资金账户关联
 * - 链上身份注册（ERC-8004 + EAS）
 * - MPC 钱包自动挂载
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([AgentAccount, Account, AgentSpendingRecord]),
    forwardRef(() => AgentModule),
    forwardRef(() => MPCWalletModule),
    forwardRef(() => RelayerModule),
    forwardRef(() => AgentAuthorizationModule),
  ],
  controllers: [AgentAccountController],
  providers: [
    AgentAccountService,
    AgentAccountResetScheduler,
    PlaceholderMpcWalletProvider,
    { provide: MPC_WALLET_PROVIDER, useExisting: PlaceholderMpcWalletProvider },
    AgentWalletService,
    AgentKeyService,
    AgentOnchainIdentityService,
  ],
  exports: [
    AgentAccountService,
    AgentWalletService,
    AgentKeyService,
    AgentOnchainIdentityService,
    TypeOrmModule,
  ],
})
export class AgentAccountModule {}
