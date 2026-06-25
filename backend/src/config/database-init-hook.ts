import { DataSource } from 'typeorm';
import { fixEnumTypesBeforeSync } from './database-pre-sync';

export async function onTypeORMInitialized(dataSource: DataSource): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 500));

  try {
    await fixEnumTypesBeforeSync();
    console.log('✅ 枚举类型已修复（TypeORM 初始化后）');
  } catch (error: any) {
    console.warn('⚠️  枚举类型修复失败:', error.message);
  }
}

