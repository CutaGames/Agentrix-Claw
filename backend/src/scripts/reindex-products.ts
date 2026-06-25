import { AppDataSource } from '../config/data-source';
import { Product } from '../entities/product.entity';
import { Repository } from 'typeorm';
import { VectorDbService } from '../modules/search/vector-db.service';
import { EmbeddingService } from '../modules/search/embedding.service';
import { ConfigService } from '@nestjs/config';
import { CacheService } from '../modules/cache/cache.service';

/**
 * 重新索引所有商品到向量数据库
 * 用于修复商品搜索问题
 */

async function reindexProducts() {
  try {
    await AppDataSource.initialize();
    console.log('✅ 数据库连接成功');

    // 初始化服务（简化版本，直接实例化）
    const configService = new ConfigService();
    const cacheService = new CacheService(configService);
    const embeddingService = new EmbeddingService(configService);
    
    // 等待向量数据库初始化
    const vectorDbService = new VectorDbService(configService, embeddingService);
    await new Promise(resolve => setTimeout(resolve, 1000)); // 等待初始化完成

    const productRepository = AppDataSource.getRepository(Product);

    // 获取所有活跃商品
    const products = await productRepository.find({
      where: { status: 'active' as any },
    });

    console.log(`\n📦 找到 ${products.length} 个活跃商品，开始重新索引...\n`);

    let successCount = 0;
    let failCount = 0;

    for (const product of products) {
      try {
        const currency = (product.metadata as any)?.currency || 'CNY';
        const text = `${product.name} ${product.description || ''}`;

        // 索引到向量数据库
        await vectorDbService.addVector(product.id, text, {
          type: 'product',
          text,
          name: product.name,
          description: product.description || '',
          merchantId: product.merchantId,
          price: product.price,
          currency,
          category: product.category,
          stock: product.stock,
        });

        successCount++;
        if (successCount % 10 === 0) {
          console.log(`✅ 已索引 ${successCount}/${products.length} 个商品...`);
        }
      } catch (error: any) {
        failCount++;
        console.error(`❌ 索引失败: ${product.name} (${product.id})`, error?.message || error);
      }
    }

    console.log(`\n📊 索引完成:`);
    console.log(`   ✅ 成功: ${successCount}`);
    console.log(`   ❌ 失败: ${failCount}`);
    console.log(`   📦 总计: ${products.length}`);

    await AppDataSource.destroy();
    console.log('\n✅ 商品重新索引完成！');
    console.log('💡 提示：如果搜索仍然没有结果，请检查向量数据库配置和 embedding 服务。');
  } catch (error: any) {
    console.error('❌ 重新索引失败:', error?.message || error);
    process.exit(1);
  }
}

reindexProducts();

