import { MigrationInterface, QueryRunner } from 'typeorm';

export class FixPayeeTypeEnumDependency1769000001000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Step 1: 检查 commissions 表当前使用的枚举类型
    const commissionsEnumCheck = await queryRunner.query(`
      SELECT udt_name 
      FROM information_schema.columns 
      WHERE table_schema = 'public' 
      AND table_name = 'commissions' 
      AND column_name = 'payeeType'
    `);

    // Step 2: 检查 commission_settlements 表当前使用的枚举类型
    const settlementsEnumCheck = await queryRunner.query(`
      SELECT udt_name 
      FROM information_schema.columns 
      WHERE table_schema = 'public' 
      AND table_name = 'commission_settlements' 
      AND column_name = 'payeeType'
    `);

    const commissionsEnumName = commissionsEnumCheck[0]?.udt_name;
    const settlementsEnumName = settlementsEnumCheck[0]?.udt_name;

    // Step 3: 先将两个表的列类型都改为 text（这样可以解除对旧枚举类型的依赖）
    if (commissionsEnumName && commissionsEnumName !== 'text') {
      await queryRunner.query(`
        ALTER TABLE "commissions" 
        ALTER COLUMN "payeeType" TYPE text
      `);
    }

    if (settlementsEnumName && settlementsEnumName !== 'text') {
      await queryRunner.query(`
        ALTER TABLE "commission_settlements" 
        ALTER COLUMN "payeeType" TYPE text
      `);
    }

    // Step 4: 删除所有旧的枚举类型（使用 CASCADE 强制删除）
    // 现在列已经是 text 类型，所以可以安全删除枚举类型
    await queryRunner.query(`
      DROP TYPE IF EXISTS "public"."commissions_payeetype_enum_old" CASCADE
    `);
    await queryRunner.query(`
      DROP TYPE IF EXISTS "public"."commission_settlements_payeetype_enum" CASCADE
    `);
    await queryRunner.query(`
      DROP TYPE IF EXISTS "public"."commissions_payeetype_enum" CASCADE
    `);

    // Step 5: 创建统一的枚举类型
    await queryRunner.query(`
      CREATE TYPE "public"."commissions_payeetype_enum" AS ENUM('agent', 'merchant', 'agentrix')
    `);

    // Step 6: 将两个表的列都改为使用同一个枚举类型
    await queryRunner.query(`
      ALTER TABLE "commissions" 
      ALTER COLUMN "payeeType" TYPE "public"."commissions_payeetype_enum" 
      USING "payeeType"::"public"."commissions_payeetype_enum"
    `);

    await queryRunner.query(`
      ALTER TABLE "commission_settlements" 
      ALTER COLUMN "payeeType" TYPE "public"."commissions_payeetype_enum" 
      USING "payeeType"::"public"."commissions_payeetype_enum"
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // 回滚操作：恢复原来的状态
    // 注意：这个回滚可能不完美，因为无法确定原来的枚举类型名称
    await queryRunner.query(`
      ALTER TABLE "commissions" 
      ALTER COLUMN "payeeType" TYPE text
    `);

    await queryRunner.query(`
      ALTER TABLE "commission_settlements" 
      ALTER COLUMN "payeeType" TYPE text
    `);

    await queryRunner.query(`
      DROP TYPE IF EXISTS "public"."commissions_payeetype_enum" CASCADE
    `);
  }
}

