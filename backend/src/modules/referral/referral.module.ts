import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MerchantReferral } from '../../entities/merchant-referral.entity';
import { ReferralCommission } from '../../entities/referral-commission.entity';
import { ReferralLinkEntity } from '../../entities/referral-link.entity';
import { UserReferral } from '../../entities/user-referral.entity';
import { Payment } from '../../entities/payment.entity';
import { ReferralService } from './referral.service';
import { ReferralCommissionService } from './referral-commission.service';
import { ReferralLinkService } from './referral-link.service';
import { ReferralFlywheelService } from './referral-flywheel.service';
import { ReferralController } from './referral.controller';
import { AxpModule } from '../axp/axp.module';
import { FeeResolverService } from '../commission/fee-resolver.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([MerchantReferral, ReferralCommission, ReferralLinkEntity, UserReferral, Payment]),
    AxpModule,
  ],
  controllers: [ReferralController],
  providers: [
    ReferralService,
    ReferralCommissionService,
    ReferralLinkService,
    ReferralFlywheelService,
    // FeeResolverService 无注入依赖（纯读 financial-architecture.config），
    // 直接作为 provider 避免 import CommissionModule 引入循环依赖。
    FeeResolverService,
  ],
  exports: [
    ReferralService,
    ReferralCommissionService,
    ReferralLinkService,
    ReferralFlywheelService,
  ],
})
export class ReferralModule {}

