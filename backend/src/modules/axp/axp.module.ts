import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UserAxpLedger } from '../../entities/user-axp-ledger.entity';
import { UserAxpBalance } from '../../entities/user-axp-balance.entity';
import { AxpService } from './axp.service';
import { CheckinService } from './checkin.service';
import { AxpController } from './axp.controller';
import { AxpRedeemService } from './redeem.service';
import { AxpExpiryService } from './axp-expiry.service';
import { NotificationModule } from '../notification/notification.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([UserAxpLedger, UserAxpBalance]),
    NotificationModule,
  ],
  controllers: [AxpController],
  providers: [AxpService, CheckinService, AxpRedeemService, AxpExpiryService],
  exports: [AxpService, CheckinService, AxpRedeemService, AxpExpiryService],
})
export class AxpModule {}
