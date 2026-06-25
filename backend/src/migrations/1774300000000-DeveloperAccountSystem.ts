import { MigrationInterface, QueryRunner } from 'typeorm';

export class DeveloperAccountSystem1774300000000 implements MigrationInterface {
  name = 'DeveloperAccountSystem1774300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 创建开发者账户状态枚举
    await queryRunner.query(`
      CREATE TYPE "developer_account_status_enum" AS ENUM (
        'pending', 'active', 'suspended', 'revoked', 'banned'
      )
    `);

    // 创建开发者等级枚举
    await queryRunner.query(`
      CREATE TYPE "developer_tier_enum" AS ENUM (
        'starter', 'professional', 'enterprise', 'partner'
      )
    `);

    // 创建开发者类型枚举
    await queryRunner.query(`
      CREATE TYPE "developer_type_enum" AS ENUM (
        'individual', 'team', 'company', 'agency'
      )
    `);

    // 创建开发者账户表
    await queryRunner.query(`
      CREATE TABLE "developer_accounts" (
        "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "developer_unique_id" varchar NOT NULL UNIQUE,
        "user_id" uuid NOT NULL UNIQUE,
        "name" varchar(100) NOT NULL,
        "description" text,
        "website" varchar,
        "contact_email" varchar,
        "type" "developer_type_enum" NOT NULL DEFAULT 'individual',
        "tier" "developer_tier_enum" NOT NULL DEFAULT 'starter',
        "status" "developer_account_status_enum" NOT NULL DEFAULT 'pending',
        "status_reason" varchar(500),
        
        -- API 访问配置
        "max_api_keys" integer NOT NULL DEFAULT 3,
        "current_api_key_count" integer NOT NULL DEFAULT 0,
        "global_rate_limit" integer NOT NULL DEFAULT 100,
        "daily_request_limit" integer NOT NULL DEFAULT 10000,
        "monthly_request_limit" integer NOT NULL DEFAULT 300000,
        "allowed_scopes" text,
        
        -- SDK & 集成
        "allowed_sdks" text,
        "webhook_url" varchar,
        "webhook_secret" varchar,
        "oauth_callback_urls" text,
        
        -- 收益分成配置
        "default_account_id" uuid,
        "revenue_share_percent" decimal(5,2) NOT NULL DEFAULT 70,
        "min_withdrawal_amount" decimal(18,2) NOT NULL DEFAULT 10,
        "settlement_period_days" integer NOT NULL DEFAULT 7,
        
        -- 统计数据
        "published_skill_count" integer NOT NULL DEFAULT 0,
        "published_agent_count" integer NOT NULL DEFAULT 0,
        "total_api_calls" bigint NOT NULL DEFAULT 0,
        "today_api_calls" integer NOT NULL DEFAULT 0,
        "month_api_calls" integer NOT NULL DEFAULT 0,
        "total_revenue" decimal(18,2) NOT NULL DEFAULT 0,
        "pending_revenue" decimal(18,2) NOT NULL DEFAULT 0,
        "withdrawn_revenue" decimal(18,2) NOT NULL DEFAULT 0,
        "rating" decimal(3,2) NOT NULL DEFAULT 0,
        "rating_count" integer NOT NULL DEFAULT 0,
        
        -- 认证与合规
        "is_email_verified" boolean NOT NULL DEFAULT false,
        "has_signed_agreement" boolean NOT NULL DEFAULT false,
        "agreement_signed_at" timestamp,
        "is_kyc_verified" boolean NOT NULL DEFAULT false,
        "kyc_record_id" uuid,
        
        -- 元数据
        "metadata" jsonb,
        "approved_at" timestamp,
        "approved_by" uuid,
        "last_active_at" timestamp,
        
        "created_at" timestamp NOT NULL DEFAULT now(),
        "updated_at" timestamp NOT NULL DEFAULT now(),
        
        CONSTRAINT "fk_developer_account_user" FOREIGN KEY ("user_id") 
          REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);

    // 创建索引
    await queryRunner.query(`
      CREATE INDEX "idx_developer_accounts_status" ON "developer_accounts" ("status")
    `);
    await queryRunner.query(`
      CREATE INDEX "idx_developer_accounts_tier" ON "developer_accounts" ("tier")
    `);
    await queryRunner.query(`
      CREATE INDEX "idx_developer_accounts_user_id" ON "developer_accounts" ("user_id")
    `);
    await queryRunner.query(`
      CREATE INDEX "idx_developer_accounts_developer_unique_id" ON "developer_accounts" ("developer_unique_id")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // 删除索引
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_developer_accounts_developer_unique_id"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_developer_accounts_user_id"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_developer_accounts_tier"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_developer_accounts_status"`);

    // 删除表
    await queryRunner.query(`DROP TABLE IF EXISTS "developer_accounts"`);

    // 删除枚举类型
    await queryRunner.query(`DROP TYPE IF EXISTS "developer_type_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "developer_tier_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "developer_account_status_enum"`);
  }
}
