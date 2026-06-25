import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MerchantReferral } from '../../entities/merchant-referral.entity';
import { ReferralCommission } from '../../entities/referral-commission.entity';
import { ReferralLinkEntity } from '../../entities/referral-link.entity';
import { Payment } from '../../entities/payment.entity';
import { ReferralService } from './referral.service';
import { ReferralCommissionService } from './referral-commission.service';
import { ReferralLinkService } from './referral-link.service';
import { ReferralController } from './referral.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([MerchantReferral, ReferralCommission, ReferralLinkEntity, Payment]),
  ],
  controllers: [ReferralController],
  providers: [
    ReferralService,
    ReferralCommissionService,
    ReferralLinkService,
  ],
  exports: [
    ReferralService,
    ReferralCommissionService,
    ReferralLinkService,
  ],
})
export class ReferralModule {}

