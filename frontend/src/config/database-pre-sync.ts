import { DataSource } from 'typeorm';
import { config } from 'dotenv';

config();

/**
 * 修复枚举类型，确保两个表使用相同的枚举类型名称
 * 可以在 TypeORM synchronize 之前或之后调用
 */
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

    // 检查当前状态
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

    const commissionsEnum = currentState.find((s: any) => s.table_name === 'commissions')?.udt_name;
    const settlementsEnum = currentState.find((s: any) => s.table_name === 'commission_settlements')?.udt_name;

    // 如果两个表使用不同的枚举类型，需要修复
    if (commissionsEnum !== 'commissions_payeetype_enum' || settlementsEnum !== 'commissions_payeetype_enum') {
      console.log('🔧 检测到枚举类型不一致，正在修复...');

      // 先将列类型改为 text
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

      // 删除旧的枚举类型
      await queryRunner.query(`
        DROP TYPE IF EXISTS "public"."commissions_payeetype_enum_old" CASCADE
      `);
      await queryRunner.query(`
        DROP TYPE IF EXISTS "public"."commission_settlements_payeetype_enum" CASCADE
      `);
      await queryRunner.query(`
        DROP TYPE IF EXISTS "public"."commissions_payeetype_enum" CASCADE
      `);

      // 创建统一的枚举类型
      await queryRunner.query(`
        CREATE TYPE "public"."commissions_payeetype_enum" AS ENUM('agent', 'merchant', 'agentrix')
      `);

      // 将列改回枚举类型
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

    await queryRunner.release();
    await dataSource.destroy();
  } catch (error: any) {
    console.error('⚠️  修复枚举类型时出错（可能表不存在）:', error.message);
    // 不抛出错误，让 TypeORM 继续初始化
    try {
      await dataSource.destroy();
    } catch (e) {
      // 忽略销毁错误
    }
  }
}

