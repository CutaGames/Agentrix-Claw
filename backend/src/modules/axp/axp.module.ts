import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UserAxpLedger } from '../../entities/user-axp-ledger.entity';
import { UserAxpBalance } from '../../entities/user-axp-balance.entity';
import { AxpService } from './axp.service';
import { AxpController } from './axp.controller';

@Module({
  imports: [TypeOrmModule.forFeature([UserAxpLedger, UserAxpBalance])],
  controllers: [AxpController],
  providers: [AxpService],
  exports: [AxpService],
})
export class AxpModule {}
