import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UserAxpLedger } from '../../entities/user-axp-ledger.entity';
import { Payment } from '../../entities/payment.entity';
import { AgentAccount } from '../../entities/agent-account.entity';
import { AxpModule } from '../axp/axp.module';
import { PetEarningsService } from './pet-earnings.service';
import { PetEarningsController } from './pet-earnings.controller';

/**
 * PetEarningsModule — AI 萌宠赚钱飞轮：收益中心聚合 + 编排核心。
 * 复用 AxpModule（AXP 账本读）+ Payment/AgentAccount（USDT 集市收入归属）。
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([UserAxpLedger, Payment, AgentAccount]),
    AxpModule,
  ],
  controllers: [PetEarningsController],
  providers: [PetEarningsService],
  exports: [PetEarningsService],
})
export class PetEarningsModule {}
