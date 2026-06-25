import { DataSource } from 'typeorm';
import { config } from 'dotenv';

config();

export const AppDataSource = new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432', 10),
  // 统一使用与 database.config.ts 相同的默认值
  username: process.env.DB_USERNAME || 'agentrix',
  password: process.env.DB_PASSWORD || 'agentrix_password',
  database: process.env.DB_DATABASE || 'agentrix', // 实际数据库名是 agentrix
  entities: [__dirname + '/../**/*.entity{.ts,.js}'],
  migrations: [__dirname + '/../migrations/*{.ts,.js}'],
  synchronize: false,
  logging: process.env.NODE_ENV === 'development',
});

