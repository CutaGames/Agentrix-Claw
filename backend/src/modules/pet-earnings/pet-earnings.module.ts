import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UserAxpLedger } from '../../entities/user-axp-ledger.entity';
import { Payment } from '../../entities/payment.entity';
import { AgentAccount } from '../../entities/agent-account.entity';
import { LivingPet } from '../../entities/living-pet.entity';
import { AxpModule } from '../axp/axp.module';
import { UnifiedAgentModule } from '../unified-agent/unified-agent.module';
import { PetEarningsService } from './pet-earnings.service';
import { PetEconomicService } from './pet-economic.service';
import { PetEarningsController } from './pet-earnings.controller';

/**
 * PetEarningsModule — AI 萌宠赚钱飞轮：收益中心聚合 + 萌宠经济主体 + 编排核心。
 * 复用 AxpModule（AXP 账本读）+ Payment/AgentAccount（USDT 集市收入归属）
 * + UnifiedAgentModule/LivingPet（萌宠经济主体绑定）。
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([UserAxpLedger, Payment, AgentAccount, LivingPet]),
    AxpModule,
    UnifiedAgentModule,
  ],
  controllers: [PetEarningsController],
  providers: [PetEarningsService, PetEconomicService],
  exports: [PetEarningsService, PetEconomicService],
})
export class PetEarningsModule {}
