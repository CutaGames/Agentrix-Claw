import { MigrationInterface, QueryRunner } from 'typeorm';

export class SkillEcosystemV21776570400000 implements MigrationInterface {
  name = 'SkillEcosystemV21776570400000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. 创建新的枚举类型
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "skill_layer_enum" AS ENUM ('infra', 'resource', 'logic', 'composite');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);

    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "skill_resource_type_enum" AS ENUM ('physical', 'service', 'digital', 'data', 'logic');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);

    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "skill_source_enum" AS ENUM ('native', 'imported', 'converted');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);

    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "skill_original_platform_enum" AS ENUM ('claude', 'openai', 'gemini', 'grok', 'third_party');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);

    // 2. 扩展 skills 表 - 添加新字段
    await queryRunner.query(`
      ALTER TABLE "skills" 
      ADD COLUMN IF NOT EXISTS "displayName" VARCHAR(200),
      ADD COLUMN IF NOT EXISTS "layer" "skill_layer_enum" DEFAULT 'logic',
      ADD COLUMN IF NOT EXISTS "resourceType" "skill_resource_type_enum",
      ADD COLUMN IF NOT EXISTS "source" "skill_source_enum" DEFAULT 'native',
      ADD COLUMN IF NOT EXISTS "originalPlatform" "skill_original_platform_enum",
      ADD COLUMN IF NOT EXISTS "humanAccessible" BOOLEAN DEFAULT true,
      ADD COLUMN IF NOT EXISTS "compatibleAgents" JSONB DEFAULT '["all"]',
      ADD COLUMN IF NOT EXISTS "permissions" JSONB DEFAULT '["read"]',
      ADD COLUMN IF NOT EXISTS "authorInfo" JSONB,
      ADD COLUMN IF NOT EXISTS "productId" VARCHAR,
      ADD COLUMN IF NOT EXISTS "externalSkillId" VARCHAR
    `);

    // 3. 更新 skills_category_enum 添加新分类
    await queryRunner.query(`
      DO $$ BEGIN
        ALTER TYPE "skills_category_enum" ADD VALUE IF NOT EXISTS 'identity';
        ALTER TYPE "skills_category_enum" ADD VALUE IF NOT EXISTS 'authorization';
        ALTER TYPE "skills_category_enum" ADD VALUE IF NOT EXISTS 'chain';
        ALTER TYPE "skills_category_enum" ADD VALUE IF NOT EXISTS 'asset';
        ALTER TYPE "skills_category_enum" ADD VALUE IF NOT EXISTS 'algorithm';
        ALTER TYPE "skills_category_enum" ADD VALUE IF NOT EXISTS 'analysis';
        ALTER TYPE "skills_category_enum" ADD VALUE IF NOT EXISTS 'workflow';
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);

    // 4. (已移除) 更新 skill_pricing_type_enum - pricing 字段使用 JSONB

    // 5. 创建外部平台枚举
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "external_platform_enum" AS ENUM ('claude_mcp', 'openai_gpt', 'gemini', 'grok', 'zapier', 'plugin_lab', 'other');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);

    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "sync_status_enum" AS ENUM ('active', 'paused', 'error', 'deprecated');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);

    // 6. 创建 external_skill_mappings 表
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "external_skill_mappings" (
        "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "agentrixSkillId" UUID REFERENCES "skills"("id") ON DELETE SET NULL,
        "externalPlatform" "external_platform_enum" NOT NULL,
        "externalId" VARCHAR(200) NOT NULL,
        "externalName" VARCHAR(200) NOT NULL,
        "externalEndpoint" VARCHAR(500),
        "originalSchema" JSONB,
        "proxyConfig" JSONB,
        "syncStatus" "sync_status_enum" DEFAULT 'active',
        "lastSyncedAt" TIMESTAMP,
        "syncError" TEXT,
        "callCount" INTEGER DEFAULT 0,
        "passthroughPricing" BOOLEAN DEFAULT true,
        "agentrixMarkup" DECIMAL(5, 2) DEFAULT 0,
        "createdAt" TIMESTAMP DEFAULT NOW(),
        "updatedAt" TIMESTAMP DEFAULT NOW(),
        UNIQUE("externalPlatform", "externalId")
      )
    `);

    // 7. 创建转换状态枚举
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "conversion_status_enum" AS ENUM ('pending', 'completed', 'failed', 'outdated');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);

    // 8. 创建 product_skill_conversions 表
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "product_skill_conversions" (
        "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "productId" UUID NOT NULL REFERENCES "products"("id") ON DELETE CASCADE,
        "skillId" UUID REFERENCES "skills"("id") ON DELETE SET NULL,
        "status" "conversion_status_enum" DEFAULT 'pending',
        "conversionConfig" JSONB DEFAULT '{"autoSync": true, "useLLMDescription": true}',
        "generatedDescription" TEXT,
        "generatedInputSchema" JSONB,
        "generatedOutputSchema" JSONB,
        "conversionError" TEXT,
        "lastConvertedAt" TIMESTAMP,
        "productLastUpdatedAt" TIMESTAMP,
        "createdAt" TIMESTAMP DEFAULT NOW(),
        "updatedAt" TIMESTAMP DEFAULT NOW(),
        UNIQUE("productId")
      )
    `);

    // 9. 创建调用者类型枚举
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "caller_type_enum" AS ENUM ('agent', 'human', 'system');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);

    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "call_platform_enum" AS ENUM ('agentrix_web', 'agentrix_api', 'claude_mcp', 'openai_gpt', 'gemini', 'grok', 'sdk', 'other');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);

    // 10. 创建 skill_analytics 表
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "skill_analytics" (
        "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "skillId" UUID NOT NULL REFERENCES "skills"("id") ON DELETE CASCADE,
        "callerType" "caller_type_enum" NOT NULL,
        "callerId" VARCHAR(100),
        "platform" "call_platform_enum" DEFAULT 'agentrix_api',
        "executionTimeMs" INTEGER,
        "success" BOOLEAN DEFAULT true,
        "errorMessage" TEXT,
        "inputParams" JSONB,
        "revenueGenerated" DECIMAL(20, 6) DEFAULT 0,
        "commissionAmount" DECIMAL(20, 6) DEFAULT 0,
        "orderId" VARCHAR,
        "sessionId" VARCHAR,
        "userIpHash" VARCHAR(50),
        "userAgent" VARCHAR(500),
        "metadata" JSONB,
        "createdAt" TIMESTAMP DEFAULT NOW()
      )
    `);

    // 11. 创建索引（兼容 snake_case 列名）
    const getColumnName = async (tableName: string, candidates: string[]) => {
      const columns = await queryRunner.query(
        `
          SELECT column_name
          FROM information_schema.columns
          WHERE table_schema = 'public'
          AND table_name = $1
          AND column_name = ANY($2)
          ORDER BY column_name
          LIMIT 1
        `,
        [tableName, candidates]
      );

      return columns[0]?.column_name as string | undefined;
    };

    const skillAnalyticsSkillId = await getColumnName('skill_analytics', ['skillId', 'skill_id']);
    const skillAnalyticsCallerId = await getColumnName('skill_analytics', ['callerId', 'caller_id']);
    const skillAnalyticsCreatedAt = await getColumnName('skill_analytics', ['createdAt', 'created_at']);
    const skillsLayer = await getColumnName('skills', ['layer']);
    const skillsSource = await getColumnName('skills', ['source']);
    const skillsResourceType = await getColumnName('skills', ['resourceType', 'resource_type']);

    if (skillAnalyticsSkillId && skillAnalyticsCreatedAt) {
      await queryRunner.query(`
        CREATE INDEX IF NOT EXISTS "idx_skill_analytics_skill_time" ON "skill_analytics"("${skillAnalyticsSkillId}", "${skillAnalyticsCreatedAt}");
      `);
    }

    if (skillAnalyticsCallerId && skillAnalyticsCreatedAt) {
      await queryRunner.query(`
        CREATE INDEX IF NOT EXISTS "idx_skill_analytics_caller_time" ON "skill_analytics"("${skillAnalyticsCallerId}", "${skillAnalyticsCreatedAt}");
      `);
    }

    if (skillAnalyticsCreatedAt) {
      await queryRunner.query(`
        CREATE INDEX IF NOT EXISTS "idx_skill_analytics_platform_time" ON "skill_analytics"("platform", "${skillAnalyticsCreatedAt}");
      `);
    }

    if (skillsLayer) {
      await queryRunner.query(`
        CREATE INDEX IF NOT EXISTS "idx_skills_layer" ON "skills"("${skillsLayer}");
      `);
    }

    if (skillsSource) {
      await queryRunner.query(`
        CREATE INDEX IF NOT EXISTS "idx_skills_source" ON "skills"("${skillsSource}");
      `);
    }

    if (skillsResourceType) {
      await queryRunner.query(`
        CREATE INDEX IF NOT EXISTS "idx_skills_resource_type" ON "skills"("${skillsResourceType}");
      `);
    }

    // 12. 为现有 Skill 设置默认的 layer 值
    await queryRunner.query(`
      UPDATE "skills" SET 
        "layer" = CASE 
          WHEN "category"::text = 'payment' THEN 'infra'::skill_layer_enum
          WHEN "category"::text = 'commerce' THEN 'resource'::skill_layer_enum
          ELSE 'logic'::skill_layer_enum
        END,
        "source" = 'native'::skill_source_enum,
        "humanAccessible" = true
      WHERE "layer" IS NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // 删除索引
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_skill_analytics_skill_time"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_skill_analytics_caller_time"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_skill_analytics_platform_time"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_skills_layer"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_skills_source"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_skills_resource_type"`);

    // 删除表
    await queryRunner.query(`DROP TABLE IF EXISTS "skill_analytics"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "product_skill_conversions"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "external_skill_mappings"`);

    // 删除 skills 表新增的列
    await queryRunner.query(`
      ALTER TABLE "skills" 
      DROP COLUMN IF EXISTS "displayName",
      DROP COLUMN IF EXISTS "layer",
      DROP COLUMN IF EXISTS "resourceType",
      DROP COLUMN IF EXISTS "source",
      DROP COLUMN IF EXISTS "originalPlatform",
      DROP COLUMN IF EXISTS "humanAccessible",
      DROP COLUMN IF EXISTS "compatibleAgents",
      DROP COLUMN IF EXISTS "permissions",
      DROP COLUMN IF EXISTS "authorInfo",
      DROP COLUMN IF EXISTS "productId",
      DROP COLUMN IF EXISTS "externalSkillId"
    `);

    // 删除枚举类型
    await queryRunner.query(`DROP TYPE IF EXISTS "call_platform_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "caller_type_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "conversion_status_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "sync_status_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "external_platform_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "skill_original_platform_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "skill_source_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "skill_resource_type_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "skill_layer_enum"`);
  }
}
