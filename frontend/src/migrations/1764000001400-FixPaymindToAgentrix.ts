import { MigrationInterface, QueryRunner } from 'typeorm';

export class FixPaymindToAgentrix1764000001400 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // 注意：由于 TypeORM 的 synchronize 可能在迁移之前运行，
    // 建议先手动执行 fix-paymind-to-agentrix.sql 脚本修复数据
    
    // 检查 commissions 表是否存在
    const commissionsTableExists = await queryRunner.hasTable('commissions');
    if (!commissionsTableExists) {
      console.warn('⚠️  commissions 表不存在，跳过 FixPaymindToAgentrix 迁移');
      return;
    }
    
    // Step 1: 检查是否存在 'paymind' 值的数据（使用 text 转换避免 enum 检查）
    const commissionsWithPaymind = await queryRunner.query(`
      SELECT COUNT(*) as count 
      FROM commissions 
      WHERE "payeeType"::text = 'paymind'
    `);

    // 检查 commission_settlements 表是否存在
    const settlementsTableExists = await queryRunner.hasTable('commission_settlements');
    let settlementsWithPaymind = [{ count: '0' }];
    
    if (settlementsTableExists) {
      settlementsWithPaymind = await queryRunner.query(`
        SELECT COUNT(*) as count 
        FROM commission_settlements 
        WHERE "payeeType"::text = 'paymind'
      `);
    } else {
      console.warn('⚠️  commission_settlements 表不存在，跳过相关查询');
    }

    const commissionsCount = parseInt(commissionsWithPaymind[0]?.count || '0', 10);
    const settlementsCount = parseInt(settlementsWithPaymind[0]?.count || '0', 10);

    console.log(`Found ${commissionsCount} commissions with 'paymind' value`);
    console.log(`Found ${settlementsCount} settlements with 'paymind' value`);

    // Step 2: 更新 commissions 表中的 'paymind' 为 'agentrix'
    // 先将列临时转换为 text，更新数据，再转换回 enum
    if (commissionsCount > 0) {
      // 临时转换为 text
      await queryRunner.query(`
        ALTER TABLE "commissions" 
        ALTER COLUMN "payeeType" TYPE text
      `);
      
      // 更新数据
      await queryRunner.query(`
        UPDATE commissions 
        SET "payeeType" = 'agentrix'
        WHERE "payeeType" = 'paymind'
      `);
      
      console.log(`Updated ${commissionsCount} commissions from 'paymind' to 'agentrix'`);
    }

    // Step 3: 更新 commission_settlements 表中的 'paymind' 为 'agentrix'
    if (settlementsCount > 0) {
      // 临时转换为 text
      await queryRunner.query(`
        ALTER TABLE "commission_settlements" 
        ALTER COLUMN "payeeType" TYPE text
      `);
      
      // 更新数据
      await queryRunner.query(`
        UPDATE commission_settlements 
        SET "payeeType" = 'agentrix'
        WHERE "payeeType" = 'paymind'
      `);
      
      console.log(`Updated ${settlementsCount} settlements from 'paymind' to 'agentrix'`);
    }

    // Step 4: 删除旧的 enum 类型（如果存在）
    await queryRunner.query(`
      DROP TYPE IF EXISTS "public"."commissions_payeetype_enum_old" CASCADE
    `);

    // Step 5: 检查当前 enum 类型
    const currentEnumInfo = await queryRunner.query(`
      SELECT 
        t.typname,
        e.enumlabel
      FROM pg_type t 
      JOIN pg_enum e ON t.oid = e.enumtypid  
      WHERE t.typname = 'commissions_payeetype_enum'
      ORDER BY e.enumsortorder
    `);

    const hasPaymind = currentEnumInfo.some((row: any) => row.enumlabel === 'paymind');
    const hasAgentrix = currentEnumInfo.some((row: any) => row.enumlabel === 'agentrix');

    // Step 6: 如果 enum 包含 'paymind' 但不包含 'agentrix'，需要重建 enum
    if (hasPaymind && !hasAgentrix) {
      console.log('Rebuilding enum type to remove paymind and add agentrix...');
      
      // 如果列已经是 text，跳过；否则转换为 text
      const commissionsColumn = await queryRunner.query(`
        SELECT data_type 
        FROM information_schema.columns 
        WHERE table_name = 'commissions' AND column_name = 'payeeType'
      `);
      
      if (commissionsColumn[0]?.data_type !== 'text') {
        await queryRunner.query(`
          ALTER TABLE "commissions" 
          ALTER COLUMN "payeeType" TYPE text
        `);
      }
      
      // 检查 commission_settlements 表是否存在（使用已声明的变量）
      if (settlementsTableExists) {
        const settlementsColumn = await queryRunner.query(`
          SELECT data_type 
          FROM information_schema.columns 
          WHERE table_name = 'commission_settlements' AND column_name = 'payeeType'
        `);
        
        if (settlementsColumn[0]?.data_type !== 'text') {
          await queryRunner.query(`
            ALTER TABLE "commission_settlements" 
            ALTER COLUMN "payeeType" TYPE text
          `);
        }
      }

      // 删除旧的 enum
      await queryRunner.query(`
        DROP TYPE IF EXISTS "public"."commissions_payeetype_enum" CASCADE
      `);

      // 创建新的 enum
      await queryRunner.query(`
        CREATE TYPE "public"."commissions_payeetype_enum" AS ENUM('agent', 'merchant', 'agentrix')
      `);

      // 恢复列类型
      await queryRunner.query(`
        ALTER TABLE "commissions" 
        ALTER COLUMN "payeeType" TYPE "public"."commissions_payeetype_enum" 
        USING "payeeType"::"public"."commissions_payeetype_enum"
      `);

      // 检查 commission_settlements 表是否存在（使用已声明的变量）
      if (settlementsTableExists) {
        await queryRunner.query(`
          ALTER TABLE "commission_settlements" 
          ALTER COLUMN "payeeType" TYPE "public"."commissions_payeetype_enum" 
          USING "payeeType"::"public"."commissions_payeetype_enum"
        `);
      }
    } else if (!hasAgentrix) {
      // 如果 enum 不存在 'agentrix'，添加它
      await queryRunner.query(`
        ALTER TYPE "public"."commissions_payeetype_enum" ADD VALUE IF NOT EXISTS 'agentrix'
      `);
      
      // 如果列是 text，恢复为 enum
      const commissionsColumn = await queryRunner.query(`
        SELECT data_type 
        FROM information_schema.columns 
        WHERE table_name = 'commissions' AND column_name = 'payeeType'
      `);
      
      if (commissionsColumn[0]?.data_type === 'text') {
        await queryRunner.query(`
          ALTER TABLE "commissions" 
          ALTER COLUMN "payeeType" TYPE "public"."commissions_payeetype_enum" 
          USING "payeeType"::"public"."commissions_payeetype_enum"
        `);
      }
      
      // 检查 commission_settlements 表是否存在（使用已声明的变量）
      if (settlementsTableExists) {
        const settlementsColumn = await queryRunner.query(`
          SELECT data_type 
          FROM information_schema.columns 
          WHERE table_name = 'commission_settlements' AND column_name = 'payeeType'
        `);
        
        if (settlementsColumn[0]?.data_type === 'text') {
          await queryRunner.query(`
            ALTER TABLE "commission_settlements" 
            ALTER COLUMN "payeeType" TYPE "public"."commissions_payeetype_enum" 
            USING "payeeType"::"public"."commissions_payeetype_enum"
          `);
        }
      }
    }

    console.log('Successfully migrated payeeType enum from paymind to agentrix');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // 回滚：将 'agentrix' 改回 'paymind'
    // 注意：这个回滚可能不完整，因为无法区分哪些记录原本是 'paymind'

    // 先恢复 enum 类型（包含 paymind）
    await queryRunner.query(`
      DROP TYPE IF EXISTS "public"."commissions_payeetype_enum" CASCADE
    `);

    await queryRunner.query(`
      CREATE TYPE "public"."commissions_payeetype_enum" AS ENUM('agent', 'merchant', 'paymind')
    `);

    // 修改列类型
    await queryRunner.query(`
      ALTER TABLE "commissions" 
      ALTER COLUMN "payeeType" TYPE "public"."commissions_payeetype_enum" 
      USING "payeeType"::text::"public"."commissions_payeetype_enum"
    `);

    // 检查 commission_settlements 表是否存在
    const settlementsTableExistsInDown = await queryRunner.hasTable('commission_settlements');
    if (settlementsTableExistsInDown) {
      await queryRunner.query(`
        ALTER TABLE "commission_settlements" 
        ALTER COLUMN "payeeType" TYPE "public"."commissions_payeetype_enum" 
        USING "payeeType"::text::"public"."commissions_payeetype_enum"
      `);
    }

    // 将所有 'agentrix' 改回 'paymind'（注意：这可能不准确）
    await queryRunner.query(`
      UPDATE commissions 
      SET "payeeType" = 'paymind' 
      WHERE "payeeType" = 'agentrix'
    `);

    if (settlementsTableExistsInDown) {
      await queryRunner.query(`
        UPDATE commission_settlements 
        SET "payeeType" = 'paymind' 
        WHERE "payeeType" = 'agentrix'
      `);
    }
  }
}
