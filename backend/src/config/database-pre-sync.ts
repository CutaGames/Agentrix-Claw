import { DataSource } from 'typeorm';
import { config } from 'dotenv';

config();

export async function fixEnumTypesBeforeSync(): Promise<void> {
  const dataSource = new DataSource({
    type: 'postgres',
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    username: process.env.DB_USERNAME || 'agentrix',
    password: process.env.DB_PASSWORD || 'agentrix_password',
    database: process.env.DB_DATABASE || 'agentrix',
    synchronize: false,
    logging: false,
  });

  try {
    await dataSource.initialize();
    const queryRunner = dataSource.createQueryRunner();

    const currentState = await queryRunner.query(`
      SELECT 
        table_name,
        column_name,
        udt_name
      FROM information_schema.columns 
      WHERE table_name IN ('commissions', 'commission_settlements') 
      AND column_name = 'payeeType'
      ORDER BY table_name
    `);

    const commissionsEnum = currentState.find((s) => s.table_name === 'commissions')?.udt_name;
    const settlementsEnum = currentState.find((s) => s.table_name === 'commission_settlements')?.udt_name;

    if (commissionsEnum !== 'commissions_payeetype_enum' || settlementsEnum !== 'commissions_payeetype_enum') {
      console.log('🔧 检测到枚举类型不一致，正在修复...');

      if (commissionsEnum && commissionsEnum !== 'text') {
        await queryRunner.query(`
          ALTER TABLE "commissions" 
          ALTER COLUMN "payeeType" TYPE text
        `);
      }

      if (settlementsEnum && settlementsEnum !== 'text' && settlementsEnum !== commissionsEnum) {
        await queryRunner.query(`
          ALTER TABLE "commission_settlements" 
          ALTER COLUMN "payeeType" TYPE text
        `);
      }

      // 修复旧数据：将 paymind 替换为 agentrix
      await queryRunner.query(`
        UPDATE "commissions" SET "payeeType" = 'agentrix' WHERE "payeeType" = 'paymind'
      `);
      await queryRunner.query(`
        UPDATE "commission_settlements" SET "payeeType" = 'agentrix' WHERE "payeeType" = 'paymind'
      `);

      await queryRunner.query(`
        DROP TYPE IF EXISTS "public"."commissions_payeetype_enum_old" CASCADE
      `);

      await queryRunner.query(`
        DROP TYPE IF EXISTS "public"."commission_settlements_payeetype_enum" CASCADE
      `);

      await queryRunner.query(`
        DROP TYPE IF EXISTS "public"."commissions_payeetype_enum" CASCADE
      `);

      await queryRunner.query(`
        CREATE TYPE "public"."commissions_payeetype_enum" AS ENUM('agent', 'merchant', 'agentrix')
      `);

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

      console.log('✅ 枚举类型已修复');
    }

    // 检查并添加 pay_intents.attribution 列
    const payIntentsColumns = await queryRunner.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'pay_intents' 
      AND column_name = 'attribution'
    `);

    if (payIntentsColumns.length === 0) {
      console.log('🔧 添加 pay_intents.attribution 列...');
      try {
        await queryRunner.query(`
          ALTER TABLE "pay_intents" 
          ADD COLUMN IF NOT EXISTS "attribution" jsonb
        `);
        console.log('✅ pay_intents.attribution 列已添加');
      } catch (e: any) {
        console.log('⚠️  添加 attribution 列失败（可能表不存在）:', e.message);
      }
    }

    await queryRunner.release();
    await dataSource.destroy();
  } catch (error: any) {
    console.error('⚠️  修复枚举类型时出错（可能表不存在）:', error.message);
    try {
      await dataSource.destroy();
    } catch (e) {
      // Silent fail
    }
  }
}

