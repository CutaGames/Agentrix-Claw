import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AgentAccount } from '../../entities/agent-account.entity';
import { WalletProjectionService } from './wallet-projection.service';
import { WalletProjectionController } from './wallet-projection.controller';

/**
 * WalletProjectionModule — 顿领 §5.3 跨端钱包投影
 *   GET /api/v1/wallet/projection    read-only 聚合
 */
@Module({
  imports: [TypeOrmModule.forFeature([AgentAccount])],
  controllers: [WalletProjectionController],
  providers: [WalletProjectionService],
  exports: [WalletProjectionService],
})
export class WalletProjectionModule {}
