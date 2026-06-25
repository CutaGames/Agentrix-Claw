import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UserController } from './user.controller';
import { UserService } from './user.service';
import { User } from '../../entities/user.entity';
import { MerchantProfile } from '../../entities/merchant-profile.entity';
import { ReferralModule } from '../referral/referral.module';
import { DeveloperAccountModule } from '../developer-account/developer-account.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([User, MerchantProfile]),
    forwardRef(() => ReferralModule),
    forwardRef(() => DeveloperAccountModule),
  ],
  controllers: [UserController],
  providers: [UserService],
  exports: [UserService, TypeOrmModule],
})
export class UserModule {}

