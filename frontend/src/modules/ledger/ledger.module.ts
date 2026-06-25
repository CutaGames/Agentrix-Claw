import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LedgerController } from './ledger.controller';
import { LedgerService } from './ledger.service';
import { Payment } from '../../entities/payment.entity';
import { Commission } from '../../entities/commission.entity';
import { CommissionSettlement } from '../../entities/commission-settlement.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Payment, Commission, CommissionSettlement])],
  controllers: [LedgerController],
  providers: [LedgerService],
  exports: [LedgerService],
})
export class LedgerModule {}

