import { Injectable, OnModuleInit } from '@nestjs/common';
import { TypeOrmOptionsFactory, TypeOrmModuleOptions } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { onTypeORMInitialized } from './database-init-hook';

@Injectable()
export class DatabaseConfig implements TypeOrmOptionsFactory, OnModuleInit {
  constructor(private configService: ConfigService) {}

  async onModuleInit() {
    // 在模块初始化后，等待 TypeORM 初始化完成
    // 然后修复枚举类型
    const dataSource = new DataSource({
      type: 'postgres',
      host: this.configService.get<string>('DB_HOST', 'localhost'),
      port: this.configService.get<number>('DB_PORT', 5432),
      username: this.configService.get<string>('DB_USERNAME', 'agentrix'),
      password: this.configService.get<string>('DB_PASSWORD', 'agentrix_password'),
      database: this.configService.get<string>('DB_DATABASE', 'agentrix'),
      synchronize: false,
    });

    // 等待 TypeORM 主连接初始化完成
    setTimeout(async () => {
      try {
        await onTypeORMInitialized(dataSource);
      } catch (error: any) {
        // 忽略错误，因为可能 DataSource 还没有初始化
      }
    }, 3000);
  }

  createTypeOrmOptions(): TypeOrmModuleOptions {
    const shouldSync = 
      this.configService.get<string>('NODE_ENV') === 'test' || 
      this.configService.get<string>('NODE_ENV') === 'development' ||
      this.configService.get<string>('DB_SYNC') === 'true';

    return {
      type: 'postgres',
      host: this.configService.get<string>('DB_HOST', 'localhost'),
      port: this.configService.get<number>('DB_PORT', 5432),
      username: this.configService.get<string>('DB_USERNAME', 'agentrix'),
      password: this.configService.get<string>('DB_PASSWORD', 'agentrix_password'),
      database: this.configService.get<string>('DB_DATABASE', 'agentrix'), // 实际数据库名是 agentrix
      entities: [__dirname + '/../**/*.entity{.ts,.js}'],
      migrations: [__dirname + '/../migrations/*{.ts,.js}'],
      // ⚠️ 警告：synchronize 在生产环境有数据丢失风险！
      // 仅在开发/测试环境使用，生产环境必须使用 migrations
      // 如果启用 synchronize，请先运行: npm run fix:payee-type-enum
      synchronize: shouldSync,
      logging: this.configService.get<string>('NODE_ENV') === 'development',
      retryAttempts: 3,
      retryDelay: 3000,
      autoLoadEntities: true,
      connectTimeoutMS: 10000, // 10秒连接超时
      extra: {
        max: 10,
        connectionTimeoutMillis: 10000,
      },
      // 在 synchronize 之后执行修复
      subscribers: [],
      // 使用自定义的初始化逻辑
      ...(shouldSync && {
        // 在连接建立后，synchronize 之前修复
        // 注意：TypeORM 没有直接的 beforeSynchronize 钩子，所以我们使用 onModuleInit
      }),
    };
  }
}

