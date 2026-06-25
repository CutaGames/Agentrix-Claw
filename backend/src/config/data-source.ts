import { DataSource } from 'typeorm';
import { config } from 'dotenv';
import { SnakeNamingStrategy } from 'typeorm-naming-strategies';

config();

export const AppDataSource = new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432', 10),
  // 统一使用与 database.config.ts 相同的默认值
  username: process.env.DB_USERNAME || 'paymind',
  password: process.env.DB_PASSWORD || 'paymind_password',
  database: process.env.DB_DATABASE || 'paymind', // 实际数据库名是 paymind
  entities: [__dirname + '/../**/*.entity{.ts,.js}'],
  migrations: [__dirname + '/../migrations/*{.ts,.js}'],
  namingStrategy: new SnakeNamingStrategy(),
  synchronize: false,
  logging: process.env.NODE_ENV === 'development',
});

