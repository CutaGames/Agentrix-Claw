import { DataSource } from 'typeorm';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';

dotenv.config({ path: path.join(__dirname, '../../.env') });

const AppDataSource = new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  username: process.env.DB_USERNAME || 'agentrix',
  password: process.env.DB_PASSWORD || 'agentrix',
  database: process.env.DB_DATABASE || 'agentrix',
  synchronize: false,
  logging: true,
});

async function runFix() {
  try {
    await AppDataSource.initialize();
    console.log('Data Source has been initialized!');

    const sqlPath = path.join(__dirname, '../../fix-all-tables.sql');
    const sql = fs.readFileSync(sqlPath, 'utf8');
    
    // Split by DO $$ to execute blocks if needed, but TypeORM query can handle multiple statements
    await AppDataSource.query(sql);
    
    console.log('✅ All tables and columns have been fixed successfully!');
    await AppDataSource.destroy();
  } catch (err) {
    console.error('❌ Error during database fix:', err);
    process.exit(1);
  }
}

runFix();
