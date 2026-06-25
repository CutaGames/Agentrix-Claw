import { AppDataSource } from '../config/data-source';
import { Product, ProductStatus, ProductType } from '../entities/product.entity';
import { Repository } from 'typeorm';

/**
 * 商品数据迁移脚本
 * 1. 下架所有不符合统一数据标准的商品
 * 2. 将符合标准的商品迁移到统一数据格式
 */

interface UnifiedProductData {
  // 检查商品是否符合统一数据标准
  isUnifiedFormat: boolean;
  // 需要迁移的字段
  needsMigration: boolean;
  // 迁移后的数据
  migratedData?: any;
}

/**
 * 检查商品是否符合统一数据标准
 */
function checkUnifiedStandard(product: Product): UnifiedProductData {
  const metadata = product.metadata || {};
  const hasCoreMedia = metadata.core?.media?.images && Array.isArray(metadata.core.media.images);
  const hasPriceObject = typeof product.price === 'number'; // 旧格式是数字，新格式应该是对象
  const hasInventoryObject = false; // 旧格式没有inventory对象

  // 检查是否有统一格式的price对象（在metadata中）
  const hasUnifiedPrice = metadata.core?.price || metadata.price?.amount;

  // 检查是否有统一格式的inventory对象
  const hasUnifiedInventory = metadata.core?.inventory || metadata.inventory;

  // 如果metadata中有core结构，说明可能是统一格式
  const hasCoreStructure = metadata.core !== undefined;

  // 判断是否符合统一标准
  const isUnifiedFormat = hasCoreStructure && (hasUnifiedPrice || hasUnifiedInventory);

  // 判断是否需要迁移
  const needsMigration = !isUnifiedFormat || !hasCoreMedia;

  return {
    isUnifiedFormat,
    needsMigration,
  };
}

/**
 * 将旧格式商品迁移到统一数据标准
 */
function migrateToUnifiedFormat(product: Product): any {
  const metadata = product.metadata || {};
  const currency = metadata.currency || 'CNY';

  // 确定库存类型
  let inventoryType: 'finite' | 'unlimited' | 'digital' = 'finite';
  if (product.productType === ProductType.SERVICE) {
    inventoryType = 'unlimited';
  } else if (product.productType === ProductType.NFT || product.productType === ProductType.FT || product.productType === ProductType.GAME_ASSET) {
    inventoryType = 'digital';
  }

  // 构建统一格式的metadata
  const unifiedMetadata: any = {
    core: {
      media: {
        images: metadata.image
          ? [
              {
                url: metadata.image,
                type: 'thumbnail' as const,
              },
            ]
          : [],
      },
      // 价格信息（统一格式）
      price: {
        amount: product.price,
        currency: currency,
      },
      // 库存信息（统一格式）
      inventory: {
        type: inventoryType,
        quantity: inventoryType === 'finite' ? product.stock : undefined,
      },
    },
    // 保留原有的typeSpecific数据
    typeSpecific: {
      ...(metadata.typeSpecific || {}),
      // 如果metadata中有其他字段，也保留
      ...(Object.keys(metadata).filter(k => !['core', 'currency', 'image'].includes(k)).reduce((acc, key) => {
        if (key !== 'core' && key !== 'currency' && key !== 'image') {
          acc[key] = metadata[key];
        }
        return acc;
      }, {} as any)),
    },
    // 保留扩展字段
    extensions: {
      ...(metadata.extensions || {}),
      // 保留旧字段用于兼容
      currency: currency,
      ...(metadata.image ? { image: metadata.image } : {}),
      ...(product.commissionRate ? { commissionRate: product.commissionRate } : {}),
    },
    // 保留AI兼容字段（如果存在）
    ...(metadata.aiCompatible ? { aiCompatible: metadata.aiCompatible } : {}),
  };

  return {
    ...product,
    metadata: unifiedMetadata,
  };
}

async function migrateProducts() {
  try {
    await AppDataSource.initialize();
    console.log('✅ 数据库连接成功');

    const productRepository = AppDataSource.getRepository(Product);

    // 获取所有商品
    const allProducts = await productRepository.find({
      where: {},
    });

    console.log(`\n📦 找到 ${allProducts.length} 个商品，开始检查...\n`);

    let unifiedCount = 0;
    let migratedCount = 0;
    let deactivatedCount = 0;
    const deactivatedProducts: string[] = [];

    for (const product of allProducts) {
      const checkResult = checkUnifiedStandard(product);

      if (checkResult.isUnifiedFormat && !checkResult.needsMigration) {
        // 已经是统一格式，无需处理
        unifiedCount++;
        console.log(`✅ ${product.name} - 已符合统一数据标准`);
      } else if (checkResult.needsMigration) {
        // 需要迁移或下架
        try {
          // 尝试迁移到统一格式
          const migratedData = migrateToUnifiedFormat(product);

          // 更新商品
          product.metadata = migratedData.metadata;
          product.status = ProductStatus.ACTIVE; // 保持上架状态

          await productRepository.save(product);
          migratedCount++;
          console.log(`🔄 ${product.name} - 已迁移到统一数据标准`);
        } catch (error) {
          // 迁移失败，下架商品
          product.status = ProductStatus.INACTIVE;
          await productRepository.save(product);
          deactivatedCount++;
          deactivatedProducts.push(product.name);
          console.log(`❌ ${product.name} - 迁移失败，已下架`);
        }
      }
    }

    console.log(`\n📊 迁移完成统计:`);
    console.log(`   ✅ 已符合标准: ${unifiedCount} 个`);
    console.log(`   🔄 已迁移: ${migratedCount} 个`);
    console.log(`   ❌ 已下架: ${deactivatedCount} 个`);

    if (deactivatedProducts.length > 0) {
      console.log(`\n⚠️  已下架的商品列表:`);
      deactivatedProducts.forEach((name, index) => {
        console.log(`   ${index + 1}. ${name}`);
      });
    }

    // 统计当前上架商品数量
    const activeProducts = await productRepository.count({
      where: { status: ProductStatus.ACTIVE },
    });

    console.log(`\n📈 当前上架商品总数: ${activeProducts} 个`);
    console.log(`\n✅ 所有上架商品现在都符合统一数据标准！`);

    await AppDataSource.destroy();
  } catch (error) {
    console.error('❌ 迁移失败:', error);
    process.exit(1);
  }
}

// 执行迁移
migrateProducts();

