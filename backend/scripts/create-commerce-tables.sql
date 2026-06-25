-- Commerce Skill Tables Migration
-- 创建分佣计划和预算池相关表

-- ========== 创建 ENUM 类型 ==========
DO $$ BEGIN
  CREATE TYPE "split_plan_status_enum" AS ENUM('draft', 'active', 'archived');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "split_source_enum" AS ENUM('pool', 'platform', 'merchant');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "budget_pool_status_enum" AS ENUM('draft', 'funded', 'active', 'depleted', 'expired', 'cancelled');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "funding_source_enum" AS ENUM('payment', 'wallet', 'credit');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "milestone_status_enum" AS ENUM('pending', 'in_progress', 'pending_review', 'approved', 'rejected', 'released');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "approval_type_enum" AS ENUM('auto', 'manual', 'quality_gate');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- ========== 创建 split_plans 表 ==========
CREATE TABLE IF NOT EXISTS "split_plans" (
  "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
  "name" varchar(100) NOT NULL,
  "description" text,
  "version" integer NOT NULL DEFAULT 1,
  "productType" varchar(50) NOT NULL DEFAULT 'service',
  "rules" jsonb NOT NULL DEFAULT '[]',
  "feeConfig" jsonb NOT NULL DEFAULT '{"onrampFeeBps": 10, "offrampFeeBps": 10, "splitFeeBps": 30, "minSplitFee": 100000}',
  "tiers" jsonb,
  "caps" jsonb,
  "status" split_plan_status_enum NOT NULL DEFAULT 'draft',
  "isSystemTemplate" boolean NOT NULL DEFAULT false,
  "ownerId" uuid,
  "usageCount" integer NOT NULL DEFAULT 0,
  "metadata" jsonb,
  "createdAt" timestamp NOT NULL DEFAULT now(),
  "updatedAt" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "PK_split_plans" PRIMARY KEY ("id")
);

-- split_plans 索引
CREATE INDEX IF NOT EXISTS "IDX_split_plans_owner_status" ON "split_plans" ("ownerId", "status");
CREATE INDEX IF NOT EXISTS "IDX_split_plans_product_status" ON "split_plans" ("productType", "status");

-- ========== 创建 budget_pools 表 ==========
CREATE TABLE IF NOT EXISTS "budget_pools" (
  "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
  "name" varchar(100) NOT NULL,
  "description" text,
  "projectId" varchar(100),
  "totalBudget" decimal(20,6) NOT NULL DEFAULT 0,
  "fundedAmount" decimal(20,6) NOT NULL DEFAULT 0,
  "reservedAmount" decimal(20,6) NOT NULL DEFAULT 0,
  "releasedAmount" decimal(20,6) NOT NULL DEFAULT 0,
  "currency" varchar(10) NOT NULL DEFAULT 'USDC',
  "fundingSource" funding_source_enum NOT NULL DEFAULT 'wallet',
  "splitPlanId" uuid,
  "status" budget_pool_status_enum NOT NULL DEFAULT 'draft',
  "expiresAt" timestamp,
  "ownerId" uuid NOT NULL,
  "metadata" jsonb,
  "createdAt" timestamp NOT NULL DEFAULT now(),
  "updatedAt" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "PK_budget_pools" PRIMARY KEY ("id")
);

-- budget_pools 索引
CREATE INDEX IF NOT EXISTS "IDX_budget_pools_owner_status" ON "budget_pools" ("ownerId", "status");
CREATE INDEX IF NOT EXISTS "IDX_budget_pools_project" ON "budget_pools" ("projectId");

-- ========== 创建 milestones 表 ==========
CREATE TABLE IF NOT EXISTS "milestones" (
  "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
  "name" varchar(200) NOT NULL,
  "description" text,
  "budgetPoolId" uuid NOT NULL,
  "orderId" varchar(100),
  "reservedAmount" decimal(20,6) NOT NULL DEFAULT 0,
  "releasedAmount" decimal(20,6) NOT NULL DEFAULT 0,
  "participants" jsonb NOT NULL DEFAULT '[]',
  "status" milestone_status_enum NOT NULL DEFAULT 'pending',
  "approvalType" approval_type_enum NOT NULL DEFAULT 'manual',
  "qualityGate" jsonb,
  "artifacts" jsonb NOT NULL DEFAULT '[]',
  "reviewedById" uuid,
  "reviewedAt" timestamp,
  "reviewNote" text,
  "releasedAt" timestamp,
  "dueDate" timestamp,
  "sortOrder" integer NOT NULL DEFAULT 0,
  "metadata" jsonb,
  "createdAt" timestamp NOT NULL DEFAULT now(),
  "updatedAt" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "PK_milestones" PRIMARY KEY ("id")
);

-- milestones 索引
CREATE INDEX IF NOT EXISTS "IDX_milestones_pool_status" ON "milestones" ("budgetPoolId", "status");
CREATE INDEX IF NOT EXISTS "IDX_milestones_order" ON "milestones" ("orderId");

-- ========== 添加外键约束 ==========
DO $$ BEGIN
  ALTER TABLE "budget_pools" 
  ADD CONSTRAINT "FK_budget_pools_split_plan" 
  FOREIGN KEY ("splitPlanId") REFERENCES "split_plans"("id") ON DELETE SET NULL;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "milestones" 
  ADD CONSTRAINT "FK_milestones_budget_pool" 
  FOREIGN KEY ("budgetPoolId") REFERENCES "budget_pools"("id") ON DELETE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- ========== 插入默认模板 ==========
INSERT INTO "split_plans" ("id", "name", "description", "productType", "ownerId", "rules", "feeConfig", "status", "isSystemTemplate")
VALUES 
  (
    uuid_generate_v4(),
    '实物商品默认模板',
    '适用于实物商品销售的默认分佣模板',
    'physical',
    NULL,
    '[{"role": "executor", "shareBps": 7000, "source": "pool", "active": true}, {"role": "referrer", "shareBps": 3000, "source": "pool", "active": true}]',
    '{"onrampFeeBps": 10, "offrampFeeBps": 10, "splitFeeBps": 30, "minSplitFee": 100000}',
    'active',
    true
  ),
  (
    uuid_generate_v4(),
    '技能服务默认模板',
    '适用于 AI 技能调用的默认分佣模板',
    'skill',
    NULL,
    '[{"role": "executor", "shareBps": 7000, "source": "pool", "customRoleName": "developer", "active": true}, {"role": "referrer", "shareBps": 3000, "source": "pool", "active": true}]',
    '{"onrampFeeBps": 10, "offrampFeeBps": 10, "splitFeeBps": 30, "minSplitFee": 100000}',
    'active',
    true
  )
ON CONFLICT DO NOTHING;

SELECT 'Commerce tables created successfully!' as result;
