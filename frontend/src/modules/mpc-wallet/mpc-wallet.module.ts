import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MPCWallet } from '../../entities/mpc-wallet.entity';
import { MPCWalletService } from './mpc-wallet.service';
import { MPCWalletController } from './mpc-wallet.controller';
import { MPCSignatureService } from './mpc-signature.service';

@Module({
  imports: [TypeOrmModule.forFeature([MPCWallet])],
  controllers: [MPCWalletController],
  providers: [MPCWalletService, MPCSignatureService],
  exports: [MPCWalletService, MPCSignatureService],
})
export class MPCWalletModule {}

