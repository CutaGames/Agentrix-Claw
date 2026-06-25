import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateCommerceTables1706745600000 implements MigrationInterface {
  name = 'CreateCommerceTables1706745600000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ========== 创建 ENUM 类型 ==========
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "split_plan_status_enum" AS ENUM('draft', 'active', 'archived');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);

    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "split_source_enum" AS ENUM('pool', 'platform', 'merchant');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);

    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "budget_pool_status_enum" AS ENUM('draft', 'funded', 'active', 'depleted', 'expired', 'cancelled');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);

    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "funding_source_enum" AS ENUM('payment', 'wallet', 'credit');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);

    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "milestone_status_enum" AS ENUM('pending', 'in_progress', 'pending_review', 'approved', 'rejected', 'released');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);

    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "approval_type_enum" AS ENUM('auto', 'manual', 'quality_gate');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);

    // ========== 创建 split_plans 表 ==========
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "split_plans" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "name" varchar(100) NOT NULL,
        "description" text,
        "productType" varchar(50) NOT NULL DEFAULT 'skill',
        "ownerId" uuid NOT NULL,
        "rules" jsonb NOT NULL DEFAULT '[]',
        "feeConfig" jsonb NOT NULL DEFAULT '{"onrampFeeBps": 10, "offrampFeeBps": 10, "splitFeeBps": 30, "minSplitFee": 100000}',
        "tiers" jsonb DEFAULT '[]',
        "caps" jsonb DEFAULT '[]',
        "status" "split_plan_status_enum" NOT NULL DEFAULT 'draft',
        "isSystemTemplate" boolean NOT NULL DEFAULT false,
        "version" integer NOT NULL DEFAULT 1,
        "metadata" jsonb DEFAULT '{}',
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_split_plans" PRIMARY KEY ("id")
      )
    `);

    // split_plans 索引 (存在则跳过)
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE INDEX IF NOT EXISTS "IDX_split_plans_owner_status" ON "split_plans" ("ownerId", "status");
      EXCEPTION WHEN undefined_column OR others THEN null; END $$;
    `);
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE INDEX IF NOT EXISTS "IDX_split_plans_product_status" ON "split_plans" ("productType", "status");
      EXCEPTION WHEN undefined_column OR others THEN null; END $$;
    `);

    // split_plans 外键
    await queryRunner.query(`
      DO $$ BEGIN
        ALTER TABLE "split_plans" 
        ADD CONSTRAINT "FK_split_plans_owner" 
        FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE CASCADE;
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);

    // ========== 创建 budget_pools 表 ==========
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "budget_pools" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "name" varchar(200) NOT NULL,
        "description" text,
        "projectId" varchar(100),
        "totalBudget" bigint NOT NULL DEFAULT 0,
        "fundedAmount" bigint NOT NULL DEFAULT 0,
        "reservedAmount" bigint NOT NULL DEFAULT 0,
        "releasedAmount" bigint NOT NULL DEFAULT 0,
        "currency" varchar(10) NOT NULL DEFAULT 'USDC',
        "fundingSource" "funding_source_enum" NOT NULL DEFAULT 'wallet',
        "splitPlanId" uuid,
        "status" "budget_pool_status_enum" NOT NULL DEFAULT 'draft',
        "expiresAt" TIMESTAMP,
        "ownerId" uuid NOT NULL,
        "metadata" jsonb DEFAULT '{}',
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_budget_pools" PRIMARY KEY ("id")
      )
    `);

    // budget_pools 索引 (存在则跳过)
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE INDEX IF NOT EXISTS "IDX_budget_pools_owner_status" ON "budget_pools" ("ownerId", "status");
      EXCEPTION WHEN undefined_column OR others THEN null; END $$;
    `);
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE INDEX IF NOT EXISTS "IDX_budget_pools_project" ON "budget_pools" ("projectId");
      EXCEPTION WHEN undefined_column OR others THEN null; END $$;
    `);

    // budget_pools 外键
    await queryRunner.query(`
      DO $$ BEGIN
        ALTER TABLE "budget_pools" 
        ADD CONSTRAINT "FK_budget_pools_owner" 
        FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE CASCADE;
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);

    await queryRunner.query(`
      DO $$ BEGIN
        ALTER TABLE "budget_pools" 
        ADD CONSTRAINT "FK_budget_pools_split_plan" 
        FOREIGN KEY ("splitPlanId") REFERENCES "split_plans"("id") ON DELETE SET NULL;
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);

    // ========== 创建 milestones 表 ==========
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "milestones" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "name" varchar(200) NOT NULL,
        "description" text,
        "budgetPoolId" uuid NOT NULL,
        "reservedAmount" bigint NOT NULL DEFAULT 0,
        "releasedAmount" bigint NOT NULL DEFAULT 0,
        "status" "milestone_status_enum" NOT NULL DEFAULT 'pending',
        "participants" jsonb NOT NULL DEFAULT '[]',
        "approvalType" "approval_type_enum" NOT NULL DEFAULT 'manual',
        "qualityGate" jsonb DEFAULT '{"minScore": 0, "requiredArtifacts": [], "autoApproveDelay": 0}',
        "artifacts" jsonb DEFAULT '[]',
        "reviewerId" uuid,
        "reviewNote" text,
        "qualityScore" integer,
        "sortOrder" integer NOT NULL DEFAULT 0,
        "dueDate" TIMESTAMP,
        "startedAt" TIMESTAMP,
        "submittedAt" TIMESTAMP,
        "approvedAt" TIMESTAMP,
        "releasedAt" TIMESTAMP,
        "metadata" jsonb DEFAULT '{}',
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_milestones" PRIMARY KEY ("id")
      )
    `);

    // milestones 索引 (存在则跳过)
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE INDEX IF NOT EXISTS "IDX_milestones_pool" ON "milestones" ("budgetPoolId");
      EXCEPTION WHEN undefined_column OR others THEN null; END $$;
    `);
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE INDEX IF NOT EXISTS "IDX_milestones_status" ON "milestones" ("status");
      EXCEPTION WHEN undefined_column OR others THEN null; END $$;
    `);
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE INDEX IF NOT EXISTS "IDX_milestones_sort" ON "milestones" ("budgetPoolId", "sortOrder");
      EXCEPTION WHEN undefined_column OR others THEN null; END $$;
    `);

    // milestones 外键
    await queryRunner.query(`
      DO $$ BEGIN
        ALTER TABLE "milestones" 
        ADD CONSTRAINT "FK_milestones_pool" 
        FOREIGN KEY ("budgetPoolId") REFERENCES "budget_pools"("id") ON DELETE CASCADE;
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);

    await queryRunner.query(`
      DO $$ BEGIN
        ALTER TABLE "milestones" 
        ADD CONSTRAINT "FK_milestones_reviewer" 
        FOREIGN KEY ("reviewerId") REFERENCES "users"("id") ON DELETE SET NULL;
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);

    // ========== 创建默认系统模板 ==========
    // 尝试 camelCase 列（新表），失败则忽略（已存在或列名不同）
    await queryRunner.query(`
      DO $$ BEGIN
        INSERT INTO "split_plans" ("id", "name", "description", "productType", "ownerId", "rules", "feeConfig", "status", "isSystemTemplate")
        SELECT 
          uuid_generate_v4(),
          'Skill 默认模板',
          '适用于技能类商品的默认分佣规则',
          'skill',
          (SELECT id FROM users WHERE role = 'admin' LIMIT 1),
          '[{"recipient": "{{executor}}", "shareBps": 7000, "role": "executor", "source": "platform", "active": true}, {"recipient": "{{referrer}}", "shareBps": 3000, "role": "referrer", "source": "platform", "active": true}]'::jsonb,
          '{"onrampFeeBps": 10, "offrampFeeBps": 10, "splitFeeBps": 30, "minSplitFee": 100000}'::jsonb,
          'active',
          true
        WHERE EXISTS (SELECT 1 FROM users WHERE role = 'admin')
        ON CONFLICT DO NOTHING;
      EXCEPTION WHEN OTHERS THEN null; END $$;
    `);

    console.log('✅ Commerce tables created successfully');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // 删除外键约束
    await queryRunner.query(`ALTER TABLE "milestones" DROP CONSTRAINT IF EXISTS "FK_milestones_reviewer"`);
    await queryRunner.query(`ALTER TABLE "milestones" DROP CONSTRAINT IF EXISTS "FK_milestones_pool"`);
    await queryRunner.query(`ALTER TABLE "budget_pools" DROP CONSTRAINT IF EXISTS "FK_budget_pools_split_plan"`);
    await queryRunner.query(`ALTER TABLE "budget_pools" DROP CONSTRAINT IF EXISTS "FK_budget_pools_owner"`);
    await queryRunner.query(`ALTER TABLE "split_plans" DROP CONSTRAINT IF EXISTS "FK_split_plans_owner"`);

    // 删除表
    await queryRunner.query(`DROP TABLE IF EXISTS "milestones" CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS "budget_pools" CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS "split_plans" CASCADE`);

    // 删除 ENUM 类型
    await queryRunner.query(`DROP TYPE IF EXISTS "approval_type_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "milestone_status_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "funding_source_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "budget_pool_status_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "split_source_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "split_plan_status_enum"`);

    console.log('✅ Commerce tables dropped successfully');
  }
}
