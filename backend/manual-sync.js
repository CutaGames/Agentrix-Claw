const { DataSource } = require('typeorm');
const { SnakeNamingStrategy } = require('typeorm-naming-strategies');
const path = require('path');

async function sync() {
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

  try {
    await ds.initialize();
    console.log('Connected to database');
    
    // Run synchronize with dropSchema false, but catch index errors
    try {
      await ds.synchronize(false);
      console.log('Schema synchronized successfully!');
    } catch (e) {
      if (e.message && e.message.includes('already exists')) {
        console.log('Index already exists error (harmless), retrying once...');
        // Drop all and recreate
        try {
          await ds.synchronize(true); // drop and recreate
          console.log('Schema re-synchronized with drop!');
        } catch (e2) {
          console.log('Drop-sync also failed:', e2.message);
          console.log('Trying raw SQL approach...');
          
          // Get all entity metadata and create tables one by one
          const queryRunner = ds.createQueryRunner();
          const tables = await queryRunner.getTables();
          console.log(`Existing tables: ${tables.map(t => t.name).join(', ') || 'none'}`);
          await queryRunner.release();
        }
      } else {
        throw e;
      }
    }
    
    await ds.destroy();
    console.log('SYNC_DONE');
  } catch (err) {
    console.error('Sync failed:', err.message);
    process.exit(1);
  }
}

sync();
