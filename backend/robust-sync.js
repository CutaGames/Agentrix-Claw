const { DataSource } = require('typeorm');
const { SnakeNamingStrategy } = require('typeorm-naming-strategies');
const path = require('path');

async function robustSync() {
  const ds = new DataSource({
    type: 'postgres',
    host: 'localhost',
    port: 5432,
    username: 'agentrix',
    password: 'agentrix_secure_2024',
    database: 'paymind',
    entities: [path.join(__dirname, 'dist/**/*.entity.js')],
    synchronize: false,
    namingStrategy: new SnakeNamingStrategy(),
    logging: false,
  });

  await ds.initialize();
  console.log('Connected to database');

  const queryRunner = ds.createQueryRunner();
  
  // Get the SQL that TypeORM would run for synchronize
  const sqlInMemoryStatements = await ds.driver.createSchemaBuilder().log();
  
  const upQueries = sqlInMemoryStatements.upQueries || [];
  console.log(`Total schema queries: ${upQueries.length}`);
  
  let success = 0, skipped = 0, failed = 0;
  
  for (const q of upQueries) {
    try {
      // Add IF NOT EXISTS for CREATE INDEX statements
      let sql = q.query;
      if (sql.match(/^CREATE\s+(UNIQUE\s+)?INDEX\s+/i) && !sql.includes('IF NOT EXISTS')) {
        sql = sql.replace(/^CREATE\s+(UNIQUE\s+)?INDEX\s+/i, 'CREATE $1INDEX IF NOT EXISTS ');
      }
      
      const params = q.parameters || [];
      await queryRunner.query(sql, params);
      success++;
    } catch (err) {
      if (err.message && (err.message.includes('already exists') || err.message.includes('duplicate key'))) {
        skipped++;
      } else {
        console.error(`FAILED: ${q.query.substring(0, 100)}...`);
        console.error(`  Error: ${err.message}`);
        failed++;
      }
    }
  }
  
  console.log(`Results: ${success} success, ${skipped} skipped (already exists), ${failed} failed`);
  
  await queryRunner.release();
  await ds.destroy();
  
  if (failed > 0) {
    console.log('WARNING: Some queries failed but schema should be usable');
  }
  console.log('ROBUST_SYNC_DONE');
}

robustSync().catch(err => {
  console.error('Fatal error:', err.message);
  process.exit(1);
});
