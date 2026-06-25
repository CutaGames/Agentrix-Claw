import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AdminConfig } from '../../entities/admin-config.entity';
import { CompanionFeatureFlagService } from './companion-feature-flag.service';
import { CompanionFeatureFlagController } from './companion-feature-flag.controller';

/**
 * CompanionRedesignModule — P-9 wave 16 T24.3.
 *
 * Exposes a single feature-flag endpoint that the mobile boot path uses
 * to gate the new 4-tab IA + companion ball. The flag row lives in
 * `admin_configs` under key `pet_companion_redesign_enabled`.
 *
 * Mass rollout is operated via SQL:
 *   - 1%: UPDATE admin_configs SET metadata = jsonb_set(metadata, '{rolloutPercentage}', '1') WHERE key = 'pet_companion_redesign_enabled';
 *   - 100%: same with '100'
 */
@Module({
  imports: [TypeOrmModule.forFeature([AdminConfig])],
  controllers: [CompanionFeatureFlagController],
  providers: [CompanionFeatureFlagService],
  exports: [CompanionFeatureFlagService],
})
export class CompanionRedesignModule {}
