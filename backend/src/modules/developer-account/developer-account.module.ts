import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { DeveloperAccount } from '../../entities/developer-account.entity';
import { User } from '../../entities/user.entity';
import { Account } from '../../entities/account.entity';
import { ApiKey } from '../../entities/api-key.entity';
import { DeveloperAccountService } from './developer-account.service';
import { DeveloperAccountController } from './developer-account.controller';
import { DeveloperAccountSchedulerService } from './developer-account-scheduler.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([DeveloperAccount, User, Account, ApiKey]),
    ScheduleModule.forRoot(),
  ],
  controllers: [DeveloperAccountController],
  providers: [DeveloperAccountService, DeveloperAccountSchedulerService],
  exports: [DeveloperAccountService],
})
export class DeveloperAccountModule {}
