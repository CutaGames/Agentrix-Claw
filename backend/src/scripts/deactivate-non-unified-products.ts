import { AppDataSource } from '../config/data-source';
import { Product, ProductStatus } from '../entities/product.entity';
import { Repository } from 'typeorm';

/**
 * 下架不符合统一数据标准的商品脚本
 * 将所有不符合标准的商品状态设置为 INACTIVE
 */

/**
 * 检查商品是否符合统一数据标准
 */
function isUnifiedFormat(product: Product): boolean {
  const metadata = product.metadata || {};
  
  // 检查是否有 core 结构
  if (!metadata.core) {
    return false;
  }

  // 检查是否有 media.images 结构
  if (!metadata.core.media || !Array.isArray(metadata.core.media.images)) {
    return false;
  }

  // 检查是否有统一格式的价格信息（在 core.price 或 metadata.price）
  const hasUnifiedPrice = metadata.core.price || (metadata.price && typeof metadata.price === 'object' && 'amount' in metadata.price);

  // 检查是否有统一格式的库存信息（在 core.inventory 或 metadata.inventory）
  const hasUnifiedInventory = metadata.core.inventory || (metadata.inventory && typeof metadata.inventory === 'object' && 'type' in metadata.inventory);

  // 至少要有价格或库存的统一格式
  return hasUnifiedPrice || hasUnifiedInventory;
}

async function deactivateNonUnifiedProducts() {
  try {
    await AppDataSource.initialize();
    console.log('✅ 数据库连接成功');

    const productRepository = AppDataSource.getRepository(Product);

    // 获取所有上架的商品
    const activeProducts = await productRepository.find({
      where: { status: ProductStatus.ACTIVE },
    });

    console.log(`\n📦 找到 ${activeProducts.length} 个上架商品，开始检查...\n`);

    let unifiedCount = 0;
    let deactivatedCount = 0;
    const deactivatedProducts: Array<{ id: string; name: string; reason: string }> = [];

    for (const product of activeProducts) {
      if (isUnifiedFormat(product)) {
        // 符合统一标准，保持上架
        unifiedCount++;
        console.log(`✅ ${product.name} - 符合统一数据标准`);
      } else {
        // 不符合统一标准，下架
        product.status = ProductStatus.INACTIVE;
        await productRepository.save(product);
        deactivatedCount++;
        deactivatedProducts.push({
          id: product.id,
          name: product.name,
          reason: '不符合统一数据标准（缺少 core.media.images 或统一格式的 price/inventory）',
        });
        console.log(`❌ ${product.name} - 不符合统一数据标准，已下架`);
      }
    }

    console.log(`\n📊 处理完成统计:`);
    console.log(`   ✅ 符合标准（保持上架）: ${unifiedCount} 个`);
    console.log(`   ❌ 不符合标准（已下架）: ${deactivatedCount} 个`);

    if (deactivatedProducts.length > 0) {
      console.log(`\n⚠️  已下架的商品列表:`);
      deactivatedProducts.forEach((item, index) => {
        console.log(`   ${index + 1}. ${item.name} (ID: ${item.id})`);
        console.log(`      原因: ${item.reason}`);
      });
    }

    // 统计当前上架商品数量
    const remainingActiveProducts = await productRepository.count({
      where: { status: ProductStatus.ACTIVE },
    });

    console.log(`\n📈 当前上架商品总数: ${remainingActiveProducts} 个`);
    console.log(`\n✅ 所有上架商品现在都符合统一数据标准！`);

    await AppDataSource.destroy();
  } catch (error) {
    console.error('❌ 处理失败:', error);
    process.exit(1);
  }
}

// 执行下架操作
deactivateNonUnifiedProducts();

