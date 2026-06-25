import { AppDataSource } from '../config/data-source';

/**
 * 修复迁移记录脚本
 * 如果表已存在但迁移未记录，手动插入迁移记录
 */
async function fixMigrations() {
  try {
    await AppDataSource.initialize();

    // 检查migrations表是否存在
    const migrationsTableExists = await AppDataSource.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'migrations'
      )
    `);

    if (!migrationsTableExists[0].exists) {
      console.log('创建migrations表...');
      await AppDataSource.query(`
        CREATE TABLE migrations (
          id SERIAL PRIMARY KEY,
          timestamp BIGINT NOT NULL,
          name VARCHAR NOT NULL
        )
      `);
    }

    // 检查并插入初始迁移记录（如果表已存在）
    const initialMigration = await AppDataSource.query(`
      SELECT * FROM migrations WHERE name = 'InitialSchema1700000000000'
    `);

    const usersTableExists = await AppDataSource.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'users'
      )
    `);

    if (usersTableExists[0].exists && initialMigration.length === 0) {
      console.log('插入初始迁移记录...');
      await AppDataSource.query(`
        INSERT INTO migrations (timestamp, name) 
        VALUES (1700000000000, 'InitialSchema1700000000000')
      `);
    }

    // 检查并插入其他已存在的迁移记录
    const existingMigrations = [
      { timestamp: 1763025405599, name: 'AddUserFieldsAndNotification1763025405599' },
    ];

    for (const migration of existingMigrations) {
      const exists = await AppDataSource.query(`
        SELECT * FROM migrations WHERE name = $1
      `, [migration.name]);

      if (exists.length === 0) {
        // 检查对应的表是否存在（通过检查notifications表）
        const notificationsTableExists = await AppDataSource.query(`
          SELECT EXISTS (
            SELECT FROM information_schema.tables 
            WHERE table_schema = 'public' 
            AND table_name = 'notifications'
          )
        `);
        
        // 如果表已存在，插入迁移记录
        if (notificationsTableExists[0].exists) {
          console.log(`检查迁移: ${migration.name}`);
          try {
            await AppDataSource.query(`
              INSERT INTO migrations (timestamp, name) 
              VALUES ($1, $2)
            `, [migration.timestamp, migration.name]);
            console.log(`✅ 已插入迁移记录: ${migration.name}`);
          } catch (error: any) {
            if (error.code !== '23505') {
              throw error;
            }
            console.log(`⚠️  迁移记录已存在: ${migration.name}`);
          }
        }
      }
    }

    console.log('\n✅ 迁移记录修复完成');
    console.log('\n现在可以运行新的V3.0迁移:');
    console.log('npm run migration:run');

    await AppDataSource.destroy();
  } catch (error) {
    console.error('修复失败:', error);
    process.exit(1);
  }
}

fixMigrations();

