import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MPCWallet } from '../../entities/mpc-wallet.entity';
import { MPCWalletService } from './mpc-wallet.service';
import { MPCWalletController } from './mpc-wallet.controller';
import { MPCSignatureService } from './mpc-signature.service';
import { MPCShardProtectionService } from './mpc-shard-protection.service';

@Module({
  imports: [TypeOrmModule.forFeature([MPCWallet])],
  controllers: [MPCWalletController],
  providers: [MPCWalletService, MPCSignatureService, MPCShardProtectionService],
  exports: [MPCWalletService, MPCSignatureService, MPCShardProtectionService],
})
export class MPCWalletModule {}

