import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PaymasterService } from './paymaster.service';
import { BundlerClientService } from './bundler-client.service';
import { SmartAccountService } from './smart-account.service';
import accountAbstractionConfig from '../../config/account-abstraction.config';

/**
 * AccountAbstractionModule — ERC-4337 infrastructure
 *
 * Provides:
 *  - PaymasterService: validates + signs paymaster data for gasless transactions
 *  - BundlerClientService: submits UserOperations to bundler (Pimlico/Stackup/etc.)
 *  - SmartAccountService: counterfactual address computation, UserOp construction
 *
 * This module does NOT conflict with the existing commission routing.
 * Paymaster only sponsors GAS — actual payment amounts still flow through
 * the ERC-8004 commission contract (CommissionDistributorV2).
 */
@Module({
  imports: [ConfigModule.forFeature(accountAbstractionConfig)],
  providers: [PaymasterService, BundlerClientService, SmartAccountService],
  exports: [PaymasterService, BundlerClientService, SmartAccountService],
})
export class AccountAbstractionModule {}
