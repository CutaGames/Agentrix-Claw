/**
 * 多资产类型商品种子数据
 * 包含实物、服务、NFT、FT、游戏资产、RWA等多种类型
 */

import { DataSource } from 'typeorm';
import { Product, ProductType, ProductStatus } from '../../entities/product.entity';

export const multiAssetProductsSeed = async (dataSource: DataSource) => {
  const productRepository = dataSource.getRepository(Product);

  const products = [
    // ============ 实物商品 ============
    {
      name: 'Apple AirPods Pro 2',
      description: '第二代 AirPods Pro，配备 H2 芯片，提供更强大的主动降噪和自适应通透模式',
      price: 1899,
      currency: 'CNY',
      productType: ProductType.PHYSICAL,
      status: ProductStatus.ACTIVE,
      stock: 100,
      category: '数码配件',
      image: 'https://store.storeimages.cdn-apple.com/8756/as-images.apple.com/is/MQD83?wid=1144&hei=1144&fmt=jpeg&qlt=90&.v=1660803972361',
      metadata: {
        brand: 'Apple',
        color: '白色',
        warranty: '1年',
      },
    },
    {
      name: 'Sony WH-1000XM5 头戴式耳机',
      description: '业界领先的降噪技术，30小时续航，舒适佩戴',
      price: 2999,
      currency: 'CNY',
      productType: ProductType.PHYSICAL,
      status: ProductStatus.ACTIVE,
      stock: 50,
      category: '数码配件',
      image: 'https://images.unsplash.com/photo-1618366712010-f4ae9c647dcb?w=400',
      metadata: {
        brand: 'Sony',
        color: '黑色',
        warranty: '2年',
      },
    },

    // ============ 服务类商品 ============
    {
      name: 'AI编程助手 - 月度订阅',
      description: '专业AI编程助手服务，支持代码补全、代码审查、Bug修复等功能',
      price: 99,
      currency: 'CNY',
      productType: ProductType.SERVICE,
      status: ProductStatus.ACTIVE,
      stock: 999999, // 服务类商品库存无限
      category: 'AI服务',
      image: 'https://images.unsplash.com/photo-1677442136019-21780ecad995?w=400',
      metadata: {
        serviceType: 'subscription',
        duration: '30天',
        features: ['代码补全', '代码审查', 'Bug修复', '文档生成'],
        apiCalls: 10000,
      },
    },
    {
      name: '区块链智能合约审计服务',
      description: '专业团队对智能合约进行安全审计，包含漏洞检测、代码优化建议',
      price: 5000,
      currency: 'USDT',
      productType: ProductType.SERVICE,
      status: ProductStatus.ACTIVE,
      stock: 10,
      category: '区块链服务',
      image: 'https://images.unsplash.com/photo-1639762681485-074b7f938ba0?w=400',
      metadata: {
        serviceType: 'one-time',
        duration: '7天',
        deliverables: ['审计报告', '漏洞修复建议', '代码优化方案'],
      },
    },
    {
      name: '1对1 Web3开发咨询',
      description: '资深Web3开发者提供1小时一对一技术咨询',
      price: 200,
      currency: 'USDT',
      productType: ProductType.SERVICE,
      status: ProductStatus.ACTIVE,
      stock: 50,
      category: '咨询服务',
      image: 'https://images.unsplash.com/photo-1552664730-d307ca884978?w=400',
      metadata: {
        serviceType: 'consultation',
        duration: '1小时',
        format: '视频会议',
      },
    },

    // ============ NFT 资产 ============
    {
      name: 'Cyber Punk Avatar #1024',
      description: '独一无二的赛博朋克风格头像NFT，限量10000个',
      price: 0.5,
      currency: 'ETH',
      productType: ProductType.NFT,
      status: ProductStatus.ACTIVE,
      stock: 1, // NFT是唯一的
      category: 'PFP NFT',
      image: 'https://images.unsplash.com/photo-1634973357973-f2ed2657db3c?w=400',
      metadata: {
        tokenAddress: '0x1234567890abcdef1234567890abcdef12345678',
        tokenId: '1024',
        chainId: 1,
        chainName: 'Ethereum',
        standard: 'ERC-721',
        attributes: [
          { trait_type: 'Background', value: 'Neon City' },
          { trait_type: 'Eyes', value: 'Laser' },
          { trait_type: 'Rarity', value: 'Rare' },
        ],
      },
    },
    {
      name: 'GameFi Land Plot #A-42',
      description: '元宇宙游戏中的虚拟土地，位于黄金地段',
      price: 2.5,
      currency: 'ETH',
      productType: ProductType.NFT,
      status: ProductStatus.ACTIVE,
      stock: 1,
      category: '虚拟地产',
      image: 'https://images.unsplash.com/photo-1614064641938-3bbee52942c7?w=400',
      metadata: {
        tokenAddress: '0xabcdef1234567890abcdef1234567890abcdef12',
        tokenId: '42',
        chainId: 137,
        chainName: 'Polygon',
        standard: 'ERC-721',
        location: 'Zone A, Plot 42',
        size: '100x100 meters',
      },
    },
    {
      name: 'Digital Art: Sunset Dreams',
      description: '著名数字艺术家创作的限量版数字艺术品',
      price: 1.2,
      currency: 'ETH',
      productType: ProductType.NFT,
      status: ProductStatus.ACTIVE,
      stock: 1,
      category: '数字艺术',
      image: 'https://images.unsplash.com/photo-1549490349-8643362247b5?w=400',
      metadata: {
        tokenAddress: '0x9876543210fedcba9876543210fedcba98765432',
        tokenId: '888',
        chainId: 1,
        chainName: 'Ethereum',
        standard: 'ERC-721',
        artist: 'Digital Dreams Studio',
        edition: '1/1',
      },
    },

    // ============ FT 同质化代币 ============
    {
      name: 'AGX Token - 1000枚',
      description: 'Agentrix平台治理代币，持有可参与平台治理投票',
      price: 100,
      currency: 'USDT',
      productType: ProductType.FT,
      status: ProductStatus.ACTIVE,
      stock: 1000000,
      category: '治理代币',
      image: 'https://images.unsplash.com/photo-1621761191319-c6fb62004040?w=400',
      metadata: {
        tokenAddress: '0xc23453b4842FDc4360A0a3518E2C0f51a2069386',
        chainId: 97,
        chainName: 'BSC Testnet',
        standard: 'ERC-20',
        amount: 1000,
        symbol: 'AGX',
        decimals: 18,
      },
    },
    {
      name: 'GAME Coin - 5000枚',
      description: '游戏内通用货币，可用于购买游戏道具和装备',
      price: 50,
      currency: 'USDT',
      productType: ProductType.FT,
      status: ProductStatus.ACTIVE,
      stock: 10000000,
      category: '游戏代币',
      image: 'https://images.unsplash.com/photo-1612198188060-c7c2a3b66eae?w=400',
      metadata: {
        tokenAddress: '0xfedcba0987654321fedcba0987654321fedcba09',
        chainId: 56,
        chainName: 'BSC',
        standard: 'ERC-20',
        amount: 5000,
        symbol: 'GAME',
        decimals: 18,
      },
    },

    // ============ 游戏资产 ============
    {
      name: '传奇武器: 龙之怒',
      description: 'MMORPG游戏中的传奇级武器，攻击力+500，附带火焰伤害',
      price: 299,
      currency: 'USDT',
      productType: ProductType.GAME_ASSET,
      status: ProductStatus.ACTIVE,
      stock: 5,
      category: '游戏装备',
      image: 'https://images.unsplash.com/photo-1578662996442-48f60103fc96?w=400',
      metadata: {
        gameId: 'dragon-realm',
        gameName: 'Dragon Realm Online',
        itemType: 'weapon',
        rarity: 'legendary',
        stats: {
          attack: 500,
          fireDamage: 100,
          critRate: 15,
        },
        level: 60,
        tradeable: true,
      },
    },
    {
      name: '稀有坐骑: 凤凰',
      description: '飞行坐骑，移动速度+200%，可在空中飞行',
      price: 199,
      currency: 'USDT',
      productType: ProductType.GAME_ASSET,
      status: ProductStatus.ACTIVE,
      stock: 10,
      category: '游戏坐骑',
      image: 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=400',
      metadata: {
        gameId: 'dragon-realm',
        gameName: 'Dragon Realm Online',
        itemType: 'mount',
        rarity: 'epic',
        stats: {
          speed: 200,
          flying: true,
        },
        tradeable: true,
      },
    },
    {
      name: '游戏角色皮肤: 暗黑骑士',
      description: '限定版角色皮肤，包含特效和专属动作',
      price: 29.99,
      currency: 'USD',
      productType: ProductType.GAME_ASSET,
      status: ProductStatus.ACTIVE,
      stock: 1000,
      category: '角色皮肤',
      image: 'https://images.unsplash.com/photo-1542751371-adc38448a05e?w=400',
      metadata: {
        gameId: 'battle-arena',
        gameName: 'Battle Arena',
        itemType: 'skin',
        rarity: 'rare',
        effects: ['暗黑光环', '骑士步伐'],
        tradeable: true,
      },
    },

    // ============ RWA 真实世界资产 ============
    {
      name: '黄金代币化 - 1克',
      description: '与实物黄金1:1锚定的代币化资产，可随时兑换实物',
      price: 600,
      currency: 'CNY',
      productType: ProductType.RWA,
      status: ProductStatus.ACTIVE,
      stock: 10000,
      category: '贵金属',
      image: 'https://images.unsplash.com/photo-1610375461246-83df859d849d?w=400',
      metadata: {
        assetType: 'precious_metal',
        underlying: 'Gold',
        weight: '1g',
        purity: '99.99%',
        custodian: 'Licensed Gold Vault',
        redeemable: true,
        tokenAddress: '0x1111222233334444555566667777888899990000',
        chainId: 1,
      },
    },
    {
      name: '房产份额代币 - 上海CBD',
      description: '上海陆家嘴商业地产的代币化份额，享受租金收益分红',
      price: 10000,
      currency: 'USDT',
      productType: ProductType.RWA,
      status: ProductStatus.ACTIVE,
      stock: 1000,
      category: '房产',
      image: 'https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?w=400',
      metadata: {
        assetType: 'real_estate',
        location: '上海市浦东新区陆家嘴',
        propertyType: 'commercial',
        totalShares: 10000,
        annualYield: '5.5%',
        tokenAddress: '0xaaaa2222bbbb3333cccc4444dddd5555eeee6666',
        chainId: 1,
      },
    },
    {
      name: '艺术品份额 - 毕加索画作',
      description: '毕加索真迹的代币化份额，由专业机构托管',
      price: 5000,
      currency: 'USDT',
      productType: ProductType.RWA,
      status: ProductStatus.ACTIVE,
      stock: 100,
      category: '艺术品',
      image: 'https://images.unsplash.com/photo-1579783902614-a3fb3927b6a5?w=400',
      metadata: {
        assetType: 'artwork',
        artist: 'Pablo Picasso',
        title: 'Abstract Composition',
        year: 1965,
        authentication: 'Christie\'s Verified',
        insurance: 'Lloyd\'s of London',
        totalShares: 100,
        tokenAddress: '0xffff0000aaaa1111bbbb2222cccc3333dddd4444',
        chainId: 1,
      },
    },
  ];

  // 插入商品数据
  for (const productData of products) {
    // 检查是否已存在同名商品
    const existing = await productRepository.findOne({
      where: { name: productData.name },
    });

    if (!existing) {
      const product = productRepository.create(productData);
      await productRepository.save(product);
      console.log(`✅ 创建商品: ${productData.name} (${productData.productType})`);
    } else {
      console.log(`⏭️ 商品已存在: ${productData.name}`);
    }
  }

  console.log('\n🎉 多资产类型商品种子数据创建完成！');
  console.log(`   - 实物商品: 2个`);
  console.log(`   - 服务商品: 3个`);
  console.log(`   - NFT资产: 3个`);
  console.log(`   - FT代币: 2个`);
  console.log(`   - 游戏资产: 3个`);
  console.log(`   - RWA资产: 3个`);
};

export default multiAssetProductsSeed;
