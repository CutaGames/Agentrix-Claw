/**
 * Seed: world_engine_enabled feature flag
 *
 * Seeds the initial `admin_configs` row for the World Engine feature flag.
 * The flag starts OFF (value: "false", rolloutPercentage: 0) so the feature
 * is completely invisible until an admin explicitly enables it.
 *
 * Run: npx ts-node -r tsconfig-paths/register src/seeds/world-engine-flag.seed.ts
 */

import { AppDataSource } from '../config/data-source';
import { AdminConfig, ConfigCategory } from '../entities/admin-config.entity';

async function seedWorldEngineFlag() {
  try {
    if (!AppDataSource.isInitialized) {
      await AppDataSource.initialize();
    }

    const configRepo = AppDataSource.getRepository(AdminConfig);

    const existingFlag = await configRepo.findOne({
      where: { key: 'world_engine_enabled' },
    });

    if (existingFlag) {
      console.log('⚠️  world_engine_enabled flag already exists, skipping seed.');
      console.log(`   Current value: "${existingFlag.value}"`);
      console.log(`   Metadata:`, JSON.stringify(existingFlag.metadata, null, 2));
      return;
    }

    const flag = configRepo.create({
      key: 'world_engine_enabled',
      value: 'false',
      category: ConfigCategory.SYSTEM,
      isPublic: false,
      description: 'World Engine (Reality AI) feature gate',
      metadata: {
        type: 'feature_flag',
        rolloutPercentage: 0,
        rolloutStrategy: 'user_id_hash',
        allowlist: [],
        denylist: [],
        description: 'World Engine (Reality AI) feature gate',
      },
    });

    await configRepo.save(flag);

    console.log('✅ world_engine_enabled flag seeded successfully.');
    console.log('   Key:      world_engine_enabled');
    console.log('   Value:    "false" (OFF)');
    console.log('   Category: system');
    console.log('   Rollout:  0% (completely invisible)');
    console.log('');
    console.log('   To enable for testing, use:');
    console.log('   PUT /admin/system/configs/world_engine_enabled');
    console.log('   { "value": "true", "metadata": { ... "allowlist": ["<user-id>"] } }');
  } catch (error) {
    console.error('❌ Error seeding world_engine_enabled flag:', error);
    throw error;
  } finally {
    if (AppDataSource.isInitialized) {
      await AppDataSource.destroy();
    }
  }
}

seedWorldEngineFlag();
