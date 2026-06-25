import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UserAxpLedger } from '../../entities/user-axp-ledger.entity';
import { Payment } from '../../entities/payment.entity';
import { AgentAccount } from '../../entities/agent-account.entity';
import { LivingPet } from '../../entities/living-pet.entity';
import { MerchantTask } from '../../entities/merchant-task.entity';
import { TaskBid } from '../../entities/task-bid.entity';
import { AxpModule } from '../axp/axp.module';
import { UnifiedAgentModule } from '../unified-agent/unified-agent.module';
import { PetEarningsService } from './pet-earnings.service';
import { PetEconomicService } from './pet-economic.service';
import { PetAutoEarnService } from './pet-auto-earn.service';
import { PetEarningsController } from './pet-earnings.controller';

/**
 * PetEarningsModule — AI 萌宠赚钱飞轮：收益中心聚合 + 萌宠经济主体 + 半自主接活 + 编排核心。
 * 复用 AxpModule（AXP 账本读）+ Payment/AgentAccount（USDT 集市收入归属）
 * + UnifiedAgentModule/LivingPet（萌宠经济主体绑定）+ MerchantTask/TaskBid（半自主接活）。
 * 注：直接注入 MerchantTask/TaskBid repo（不 import MerchantTaskModule）以规避循环依赖。
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([UserAxpLedger, Payment, AgentAccount, LivingPet, MerchantTask, TaskBid]),
    AxpModule,
    UnifiedAgentModule,
  ],
  controllers: [PetEarningsController],
  providers: [PetEarningsService, PetEconomicService, PetAutoEarnService],
  exports: [PetEarningsService, PetEconomicService, PetAutoEarnService],
})
export class PetEarningsModule {}
