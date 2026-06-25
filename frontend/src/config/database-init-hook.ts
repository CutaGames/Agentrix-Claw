import { DataSource } from 'typeorm';
import { fixEnumTypesBeforeSync } from './database-pre-sync';

/**
 * TypeORM 初始化后的钩子
 * 在 synchronize 完成后立即修复枚举类型
 */
export async function onTypeORMInitialized(dataSource: DataSource): Promise<void> {
  // 等待一小段时间，确保 synchronize 完成
  await new Promise(resolve => setTimeout(resolve, 500));
  
  try {
    await fixEnumTypesBeforeSync();
    console.log('✅ 枚举类型已修复（TypeORM 初始化后）');
  } catch (error: any) {
    console.warn('⚠️  枚举类型修复失败:', error.message);
  }
}

