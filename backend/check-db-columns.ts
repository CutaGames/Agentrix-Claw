
import { DataSource } from 'typeorm';
import { config } from 'dotenv';
import { join } from 'path';

config({ path: join(__dirname, 'src', '.env') });

const AppDataSource = new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  username: process.env.DB_USERNAME || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
  database: process.env.DB_DATABASE || 'paymind',
  entities: [],
  synchronize: false,
});

async function checkColumn() {
  try {
    await AppDataSource.initialize();
    const queryRunner = AppDataSource.createQueryRunner();
    const table = await queryRunner.getTable('commission_settlements_v4');
    if (!table) {
      console.log('Table commission_settlements_v4 does not exist');
      return;
    }
    const column = table.columns.find(c => c.name === 'merchant_id');
    if (column) {
      console.log('Column merchant_id exists!');
    } else {
      console.log('Column merchant_id MISSING!');
      console.log('Existing columns:', table.columns.map(c => c.name).join(', '));
    }
    await AppDataSource.destroy();
  } catch (error) {
    console.error('Error:', error);
  }
}

checkColumn();
