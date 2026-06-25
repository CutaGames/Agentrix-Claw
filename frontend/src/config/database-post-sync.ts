import { DataSource } from 'typeorm';
import { config } from 'dotenv';
import { fixEnumTypesBeforeSync } from './database-pre-sync';

config();

/**
 * 在 TypeORM synchronize 之后修复枚举类型
 * 确保即使 TypeORM 创建了新的枚举类型，也能统一为同一个枚举类型
 */
export async function fixEnumTypesAfterSync(): Promise<void> {
  // 等待一小段时间，确保 TypeORM 的 synchronize 完成
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  // 运行修复逻辑
  await fixEnumTypesBeforeSync();
}

