import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * 为 risk_assessments 表添加 decision 字段
 * 处理已有数据：先添加允许NULL的列，更新现有数据，然后添加NOT NULL约束
 */
export class AddDecisionToRiskAssessments1738000003001 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. 创建枚举类型
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "public"."risk_assessments_decision_enum" AS ENUM('approve', 'review', 'reject');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);

    // 2. 先添加允许NULL的列
    await queryRunner.query(`
      ALTER TABLE "risk_assessments" 
      ADD COLUMN IF NOT EXISTS "decision" "public"."risk_assessments_decision_enum";
    `);

    // 3. 更新现有数据，根据 riskLevel 设置默认的 decision 值
    // 注意：表中使用的是驼峰命名 riskLevel，不是 risk_level
    // 先检查 riskLevel 列是否存在
    const hasRiskLevelColumn = await queryRunner.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_schema = 'public' 
      AND table_name = 'risk_assessments' 
      AND column_name = 'riskLevel'
    `);

    if (hasRiskLevelColumn && hasRiskLevelColumn.length > 0) {
      // 如果 riskLevel 列存在，根据它设置 decision
      await queryRunner.query(`
        UPDATE "risk_assessments" 
        SET "decision" = CASE
          WHEN "riskLevel" = 'low' THEN 'approve'::risk_assessments_decision_enum
          WHEN "riskLevel" = 'medium' THEN 'review'::risk_assessments_decision_enum
          WHEN "riskLevel" = 'high' THEN 'review'::risk_assessments_decision_enum
          ELSE 'review'::risk_assessments_decision_enum
        END
        WHERE "decision" IS NULL;
      `);
    } else {
      // 如果 riskLevel 列不存在，直接设置默认值
      console.log('⚠️  riskLevel 列不存在，为所有记录设置默认 decision 值');
      await queryRunner.query(`
        UPDATE "risk_assessments" 
        SET "decision" = 'review'::risk_assessments_decision_enum
        WHERE "decision" IS NULL;
      `);
    }

    // 4. 设置默认值
    await queryRunner.query(`
      ALTER TABLE "risk_assessments" 
      ALTER COLUMN "decision" SET DEFAULT 'review'::risk_assessments_decision_enum;
    `);

    // 5. 添加NOT NULL约束
    await queryRunner.query(`
      ALTER TABLE "risk_assessments" 
      ALTER COLUMN "decision" SET NOT NULL;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // 删除列
    await queryRunner.query(`
      ALTER TABLE "risk_assessments" DROP COLUMN IF EXISTS "decision";
    `);

    // 删除枚举类型（如果不再使用）
    await queryRunner.query(`
      DROP TYPE IF EXISTS "public"."risk_assessments_decision_enum";
    `);
  }
}

