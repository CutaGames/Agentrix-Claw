import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Account } from '../../entities/account.entity';
import { AccountService } from './account.service';
import { AccountController } from './account.controller';

/**
 * 统一资金账户模块
 * 
 * 提供统一的资金管理能力：
 * - 账户的 CRUD 操作
 * - 充值、提现、转账
 * - 多币种余额管理
 * - 账户冻结与解冻
 */
@Module({
  imports: [TypeOrmModule.forFeature([Account])],
  controllers: [AccountController],
  providers: [AccountService],
  exports: [AccountService],
})
export class AccountModule {}
