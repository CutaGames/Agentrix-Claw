import { MigrationInterface, QueryRunner } from 'typeorm';

export class FixPayeeTypeEnumDependency1769000001000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    const getPayeeColumnName = async (tableName: string) => {
      const columns = await queryRunner.query(
        `
          SELECT column_name
          FROM information_schema.columns
          WHERE table_schema = 'public'
          AND table_name = $1
          AND column_name IN ('payeeType', 'payee_type')
          ORDER BY column_name
          LIMIT 1
        `,
        [tableName]
      );

      return columns[0]?.column_name as string | undefined;
    };

    const commissionsPayeeColumn = await getPayeeColumnName('commissions');
    const settlementsPayeeColumn = await getPayeeColumnName('commission_settlements');

    if (!commissionsPayeeColumn && !settlementsPayeeColumn) {
      console.warn('⚠️  未找到 payee 字段，跳过 FixPayeeTypeEnumDependency 迁移');
      return;
    }

    const getEnumName = async (tableName: string, columnName: string) => {
      const enumCheck = await queryRunner.query(
        `
          SELECT udt_name 
          FROM information_schema.columns 
          WHERE table_schema = 'public' 
          AND table_name = $1 
          AND column_name = $2
        `,
        [tableName, columnName]
      );

      return enumCheck[0]?.udt_name as string | undefined;
    };

    const commissionsEnumName = commissionsPayeeColumn
      ? await getEnumName('commissions', commissionsPayeeColumn)
      : undefined;
    const settlementsEnumName = settlementsPayeeColumn
      ? await getEnumName('commission_settlements', settlementsPayeeColumn)
      : undefined;

    // Step 3: 先将两个表的列类型都改为 text（这样可以解除对旧枚举类型的依赖）
    if (commissionsPayeeColumn && commissionsEnumName && commissionsEnumName !== 'text') {
      await queryRunner.query(`
        ALTER TABLE "commissions" 
        ALTER COLUMN "${commissionsPayeeColumn}" TYPE text
      `);
    }

    if (settlementsPayeeColumn && settlementsEnumName && settlementsEnumName !== 'text') {
      await queryRunner.query(`
        ALTER TABLE "commission_settlements" 
        ALTER COLUMN "${settlementsPayeeColumn}" TYPE text
      `);
    }

    // Step 4: 删除所有旧的枚举类型（使用 CASCADE 强制删除）
    // 现在列已经是 text 类型，所以可以安全删除枚举类型
    await queryRunner.query(`
      DO $$ BEGIN
        DROP TYPE IF EXISTS "public"."commissions_payeetype_enum_old" CASCADE;
      EXCEPTION WHEN insufficient_privilege THEN
        RAISE NOTICE 'Skip drop commissions_payeetype_enum_old due to privilege';
      END $$;
    `);
    await queryRunner.query(`
      DO $$ BEGIN
        DROP TYPE IF EXISTS "public"."commission_settlements_payeetype_enum" CASCADE;
      EXCEPTION WHEN insufficient_privilege THEN
        RAISE NOTICE 'Skip drop commission_settlements_payeetype_enum due to privilege';
      END $$;
    `);
    await queryRunner.query(`
      DO $$ BEGIN
        DROP TYPE IF EXISTS "public"."commissions_payeetype_enum" CASCADE;
      EXCEPTION WHEN insufficient_privilege THEN
        RAISE NOTICE 'Skip drop commissions_payeetype_enum due to privilege';
      END $$;
    `);

    // Step 5: 创建统一的枚举类型
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "public"."commissions_payeetype_enum" AS ENUM('agent', 'merchant', 'agentrix');
      EXCEPTION WHEN duplicate_object THEN
        RAISE NOTICE 'commissions_payeetype_enum already exists';
      END $$;
    `);

    // Step 6: 将两个表的列都改为使用同一个枚举类型
    if (commissionsPayeeColumn) {
      await queryRunner.query(`
        ALTER TABLE "commissions" 
        ALTER COLUMN "${commissionsPayeeColumn}" TYPE "public"."commissions_payeetype_enum" 
        USING "${commissionsPayeeColumn}"::"public"."commissions_payeetype_enum"
      `);
    }

    if (settlementsPayeeColumn) {
      await queryRunner.query(`
        ALTER TABLE "commission_settlements" 
        ALTER COLUMN "${settlementsPayeeColumn}" TYPE "public"."commissions_payeetype_enum" 
        USING "${settlementsPayeeColumn}"::"public"."commissions_payeetype_enum"
      `);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // 回滚操作：恢复原来的状态
    // 注意：这个回滚可能不完美，因为无法确定原来的枚举类型名称
    await queryRunner.query(`
      DO $$ BEGIN
        ALTER TABLE "commissions" 
        ALTER COLUMN "payee_type" TYPE text;
      EXCEPTION WHEN undefined_column THEN
        BEGIN
          ALTER TABLE "commissions" 
          ALTER COLUMN "payeeType" TYPE text;
        EXCEPTION WHEN undefined_column THEN
          RAISE NOTICE 'commissions payee column not found';
        END;
      END $$;
    `);

    await queryRunner.query(`
      DO $$ BEGIN
        ALTER TABLE "commission_settlements" 
        ALTER COLUMN "payee_type" TYPE text;
      EXCEPTION WHEN undefined_column THEN
        BEGIN
          ALTER TABLE "commission_settlements" 
          ALTER COLUMN "payeeType" TYPE text;
        EXCEPTION WHEN undefined_column THEN
          RAISE NOTICE 'commission_settlements payee column not found';
        END;
      END $$;
    `);

    await queryRunner.query(`
      DO $$ BEGIN
        DROP TYPE IF EXISTS "public"."commissions_payeetype_enum" CASCADE;
      EXCEPTION WHEN insufficient_privilege THEN
        RAISE NOTICE 'Skip drop commissions_payeetype_enum due to privilege';
      END $$;
    `);
  }
}

