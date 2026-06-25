import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * 修复 risk_assessments 表的 riskLevel 字段
 * 处理从 enum 类型转换为 varchar 类型，并更新现有 NULL 值
 */
export class FixRiskLevelInRiskAssessments1738000003002 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. 先检查列是否存在和类型
    const table = await queryRunner.getTable('risk_assessments');
    const riskLevelColumn = table?.findColumnByName('riskLevel');
    const hasRiskLevelColumn = !!riskLevelColumn;
    
    // 2. 如果列存在且是枚举类型，先转换为 varchar
    if (hasRiskLevelColumn && (riskLevelColumn?.type === 'enum' || riskLevelColumn?.type === 'simple-enum')) {
      // 先确保允许NULL
      await queryRunner.query(`
        ALTER TABLE "risk_assessments" 
        ALTER COLUMN "riskLevel" DROP NOT NULL;
      `);
      
      // 将枚举类型转换为 varchar
      await queryRunner.query(`
        ALTER TABLE "risk_assessments"
        ALTER COLUMN "riskLevel" TYPE varchar(20)
        USING "riskLevel"::text;
      `);
    } else if (!hasRiskLevelColumn) {
      // 如果列不存在，添加允许NULL的列
      await queryRunner.query(`
        ALTER TABLE "risk_assessments" 
        ADD COLUMN "riskLevel" character varying(20);
      `);
    } else {
      // 如果列存在且已经是 varchar，确保允许NULL
      await queryRunner.query(`
        ALTER TABLE "risk_assessments" 
        ALTER COLUMN "riskLevel" DROP NOT NULL;
      `);
    }

    // 3. 更新现有 NULL 值，根据 riskScore 设置默认值
    // 先检查 riskScore 列是否存在
    const hasRiskScoreColumn = table?.findColumnByName('riskScore');
    if (hasRiskScoreColumn) {
      await queryRunner.query(`
        UPDATE "risk_assessments" 
        SET "riskLevel" = CASE
          WHEN "riskScore" < 30 THEN 'low'
          WHEN "riskScore" < 60 THEN 'medium'
          WHEN "riskScore" < 80 THEN 'high'
          ELSE 'critical'
        END
        WHERE "riskLevel" IS NULL;
      `);
    } else {
      // 如果 riskScore 列不存在，设置默认值
      console.log('⚠️  riskScore 列不存在，为所有记录设置默认 riskLevel 值');
      await queryRunner.query(`
        UPDATE "risk_assessments" 
        SET "riskLevel" = 'medium'
        WHERE "riskLevel" IS NULL;
      `);
    }

    // 3. 如果 riskLevel 列不存在，尝试从 risk_level 列复制数据
    const hasRiskLevelOld = table?.findColumnByName('risk_level');
    if (hasRiskLevelOld) {
      await queryRunner.query(`
        UPDATE "risk_assessments" 
        SET "riskLevel" = LOWER("risk_level"::text)
        WHERE "riskLevel" IS NULL AND "risk_level" IS NOT NULL;
      `);
    }

    // 4. 设置默认值
    await queryRunner.query(`
      ALTER TABLE "risk_assessments" 
      ALTER COLUMN "riskLevel" SET DEFAULT 'medium';
    `);

    // 5. 添加 NOT NULL 约束（如果所有数据都已更新）
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM "risk_assessments" WHERE "riskLevel" IS NULL
        ) THEN
          ALTER TABLE "risk_assessments" 
          ALTER COLUMN "riskLevel" SET NOT NULL;
        END IF;
      END $$;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // 回滚：恢复为允许NULL
    await queryRunner.query(`
      ALTER TABLE "risk_assessments" 
      ALTER COLUMN "riskLevel" DROP NOT NULL;
    `);
  }
}

