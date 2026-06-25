import { AppDataSource } from '../config/data-source';
import { Product, ProductStatus } from '../entities/product.entity';
import { User, UserRole } from '../entities/user.entity';
import { Repository } from 'typeorm';
import { VectorDbService } from '../modules/search/vector-db.service';
import { EmbeddingService } from '../modules/search/embedding.service';
import { ConfigService } from '@nestjs/config';
import { CacheService } from '../modules/cache/cache.service';

/**
 * Marketplace 实体资产种子脚本
 * 添加 30 个实体资产：
 * - 鞋子 5 种
 * - 耳机 5 种
 * - 苹果手机 2 个型号 × 5 个价格 = 10 个
 * - 路由器 5 种
 * - 电脑 5 种
 * - 其他 5 种
 */

const products = [
  // ========== 鞋子 5 种 ==========
  {
    name: 'Nike Air Max 270 跑步鞋',
    description: '经典气垫跑步鞋，舒适缓震，适合日常跑步和健身。多种颜色可选。',
    price: 899.00,
    currency: 'CNY',
    category: '运动鞋',
    stock: 50,
    commissionRate: 0.08,
    metadata: {
      currency: 'CNY',
      brand: 'Nike',
      model: 'Air Max 270',
      type: 'running_shoes',
      sizes: ['40', '41', '42', '43', '44', '45'],
      colors: ['黑色', '白色', '蓝色'],
      core: {
        media: {
          images: [{
            url: 'https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=400',
            type: 'thumbnail',
          }],
        },
      },
    },
  },
  {
    name: 'Adidas Ultraboost 22 运动鞋',
    description: 'Boost 缓震科技，Primeknit 鞋面，提供卓越的舒适性和支撑性。',
    price: 1299.00,
    currency: 'CNY',
    category: '运动鞋',
    stock: 35,
    commissionRate: 0.08,
    metadata: {
      currency: 'CNY',
      brand: 'Adidas',
      model: 'Ultraboost 22',
      type: 'running_shoes',
      sizes: ['39', '40', '41', '42', '43', '44'],
      colors: ['黑色', '白色'],
      core: {
        media: {
          images: [{
            url: 'https://images.unsplash.com/photo-1606107557195-0e29a4b5b4aa?w=400',
            type: 'thumbnail',
          }],
        },
      },
    },
  },
  {
    name: 'New Balance 574 休闲鞋',
    description: '经典复古休闲鞋，舒适百搭，适合日常穿着。',
    price: 599.00,
    currency: 'CNY',
    category: '休闲鞋',
    stock: 60,
    commissionRate: 0.07,
    metadata: {
      currency: 'CNY',
      brand: 'New Balance',
      model: '574',
      type: 'casual_shoes',
      sizes: ['38', '39', '40', '41', '42', '43'],
      colors: ['灰色', '蓝色', '白色'],
      core: {
        media: {
          images: [{
            url: 'https://images.unsplash.com/photo-1608231387042-66d1773070a5?w=400',
            type: 'thumbnail',
          }],
        },
      },
    },
  },
  {
    name: 'Puma RS-X 复古运动鞋',
    description: '复古风格运动鞋，厚底设计，时尚潮流。',
    price: 699.00,
    currency: 'CNY',
    category: '运动鞋',
    stock: 45,
    commissionRate: 0.07,
    metadata: {
      currency: 'CNY',
      brand: 'Puma',
      model: 'RS-X',
      type: 'sneakers',
      sizes: ['39', '40', '41', '42', '43', '44'],
      colors: ['黑色', '白色', '红色'],
      core: {
        media: {
          images: [{
            url: 'https://images.unsplash.com/photo-1549298916-b41d501d3772?w=400',
            type: 'thumbnail',
          }],
        },
      },
    },
  },
  {
    name: 'Converse Chuck Taylor 高帮帆布鞋',
    description: '经典高帮帆布鞋，百搭时尚，适合各种场合。',
    price: 399.00,
    currency: 'CNY',
    category: '休闲鞋',
    stock: 80,
    commissionRate: 0.06,
    metadata: {
      currency: 'CNY',
      brand: 'Converse',
      model: 'Chuck Taylor',
      type: 'canvas_shoes',
      sizes: ['37', '38', '39', '40', '41', '42', '43'],
      colors: ['黑色', '白色', '红色'],
      core: {
        media: {
          images: [{
            url: 'https://images.unsplash.com/photo-1460353581641-37baddab0fa2?w=400',
            type: 'thumbnail',
          }],
        },
      },
    },
  },

  // ========== 耳机 5 种 ==========
  {
    name: 'AirPods Pro 2 无线降噪耳机',
    description: '苹果主动降噪技术，空间音频，自适应通透模式，最长 30 小时续航。',
    price: 1899.00,
    currency: 'CNY',
    category: '耳机',
    stock: 100,
    commissionRate: 0.10,
    metadata: {
      currency: 'CNY',
      brand: 'Apple',
      model: 'AirPods Pro 2',
      type: 'wireless_earbuds',
      features: ['主动降噪', '空间音频', '通透模式', '30小时续航'],
      core: {
        media: {
          images: [{
            url: 'https://images.unsplash.com/photo-1606220945770-b5b6c2c55bf1?w=400',
            type: 'thumbnail',
          }],
        },
      },
    },
  },
  {
    name: 'Sony WH-1000XM5 头戴式降噪耳机',
    description: '业界领先的降噪技术，30 小时续航，支持快速充电，Hi-Res 音质。',
    price: 2999.00,
    currency: 'CNY',
    category: '耳机',
    stock: 40,
    commissionRate: 0.10,
    metadata: {
      currency: 'CNY',
      brand: 'Sony',
      model: 'WH-1000XM5',
      type: 'over_ear_headphones',
      features: ['主动降噪', '30小时续航', '快速充电', 'Hi-Res'],
      core: {
        media: {
          images: [{
            url: 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=400',
            type: 'thumbnail',
          }],
        },
      },
    },
  },
  {
    name: 'Bose QuietComfort 45 降噪耳机',
    description: '舒适佩戴，卓越降噪，20 小时续航，支持快充。',
    price: 2499.00,
    currency: 'CNY',
    category: '耳机',
    stock: 35,
    commissionRate: 0.09,
    metadata: {
      currency: 'CNY',
      brand: 'Bose',
      model: 'QuietComfort 45',
      type: 'over_ear_headphones',
      features: ['主动降噪', '20小时续航', '快充'],
      core: {
        media: {
          images: [{
            url: 'https://images.unsplash.com/photo-1484704849700-f032a568e944?w=400',
            type: 'thumbnail',
          }],
        },
      },
    },
  },
  {
    name: 'JBL Tune 510BT 无线头戴式耳机',
    description: '轻量设计，40 小时续航，快速充电，JBL 纯低音音效。',
    price: 399.00,
    currency: 'CNY',
    category: '耳机',
    stock: 60,
    commissionRate: 0.08,
    metadata: {
      currency: 'CNY',
      brand: 'JBL',
      model: 'Tune 510BT',
      type: 'over_ear_headphones',
      features: ['40小时续航', '快速充电', '纯低音'],
      core: {
        media: {
          images: [{
            url: 'https://images.unsplash.com/photo-1599669454699-248893623440?w=400',
            type: 'thumbnail',
          }],
        },
      },
    },
  },
  {
    name: 'Beats Studio Buds 真无线耳机',
    description: '主动降噪，通透模式，IPX4 防水，最长 24 小时续航。',
    price: 1099.00,
    currency: 'CNY',
    category: '耳机',
    stock: 70,
    commissionRate: 0.09,
    metadata: {
      currency: 'CNY',
      brand: 'Beats',
      model: 'Studio Buds',
      type: 'wireless_earbuds',
      features: ['主动降噪', '通透模式', 'IPX4防水', '24小时续航'],
      core: {
        media: {
          images: [{
            url: 'https://images.unsplash.com/photo-1590658268037-6bf12165a8df?w=400',
            type: 'thumbnail',
          }],
        },
      },
    },
  },

  // ========== 苹果手机 2 个型号 × 5 个价格 = 10 个 ==========
  // iPhone 15 Pro Max - 5 个价格版本
  {
    name: 'iPhone 15 Pro Max 256GB',
    description: '苹果最新旗舰手机，A17 Pro 芯片，6.7 英寸 Super Retina XDR 显示屏，钛金属设计，支持 5G。',
    price: 9999.00,
    currency: 'CNY',
    category: '手机',
    stock: 30,
    commissionRate: 0.05,
    metadata: {
      currency: 'CNY',
      brand: 'Apple',
      model: 'iPhone 15 Pro Max',
      storage: '256GB',
      colors: ['深空黑色', '白色', '原色钛金属', '蓝色钛金属'],
      core: {
        media: {
          images: [{
            url: 'https://images.unsplash.com/photo-1592750475338-74b7b21085ab?w=400',
            type: 'thumbnail',
          }],
        },
      },
    },
  },
  {
    name: 'iPhone 15 Pro Max 512GB',
    description: '苹果最新旗舰手机，A17 Pro 芯片，6.7 英寸 Super Retina XDR 显示屏，钛金属设计，支持 5G。',
    price: 11999.00,
    currency: 'CNY',
    category: '手机',
    stock: 25,
    commissionRate: 0.05,
    metadata: {
      currency: 'CNY',
      brand: 'Apple',
      model: 'iPhone 15 Pro Max',
      storage: '512GB',
      colors: ['深空黑色', '白色', '原色钛金属', '蓝色钛金属'],
      core: {
        media: {
          images: [{
            url: 'https://images.unsplash.com/photo-1592750475338-74b7b21085ab?w=400',
            type: 'thumbnail',
          }],
        },
      },
    },
  },
  {
    name: 'iPhone 15 Pro Max 1TB',
    description: '苹果最新旗舰手机，A17 Pro 芯片，6.7 英寸 Super Retina XDR 显示屏，钛金属设计，支持 5G。',
    price: 13999.00,
    currency: 'CNY',
    category: '手机',
    stock: 20,
    commissionRate: 0.05,
    metadata: {
      currency: 'CNY',
      brand: 'Apple',
      model: 'iPhone 15 Pro Max',
      storage: '1TB',
      colors: ['深空黑色', '白色', '原色钛金属', '蓝色钛金属'],
      core: {
        media: {
          images: [{
            url: 'https://images.unsplash.com/photo-1592750475338-74b7b21085ab?w=400',
            type: 'thumbnail',
          }],
        },
      },
    },
  },
  {
    name: 'iPhone 15 Pro Max 256GB (官方翻新)',
    description: '苹果官方翻新 iPhone 15 Pro Max，经过严格检测，享受官方保修。',
    price: 8499.00,
    currency: 'CNY',
    category: '手机',
    stock: 15,
    commissionRate: 0.05,
    metadata: {
      currency: 'CNY',
      brand: 'Apple',
      model: 'iPhone 15 Pro Max',
      storage: '256GB',
      condition: 'refurbished',
      colors: ['深空黑色', '白色'],
      core: {
        media: {
          images: [{
            url: 'https://images.unsplash.com/photo-1592750475338-74b7b21085ab?w=400',
            type: 'thumbnail',
          }],
        },
      },
    },
  },
  {
    name: 'iPhone 15 Pro Max 512GB (官方翻新)',
    description: '苹果官方翻新 iPhone 15 Pro Max，经过严格检测，享受官方保修。',
    price: 10499.00,
    currency: 'CNY',
    category: '手机',
    stock: 12,
    commissionRate: 0.05,
    metadata: {
      currency: 'CNY',
      brand: 'Apple',
      model: 'iPhone 15 Pro Max',
      storage: '512GB',
      condition: 'refurbished',
      colors: ['深空黑色', '白色'],
      core: {
        media: {
          images: [{
            url: 'https://images.unsplash.com/photo-1592750475338-74b7b21085ab?w=400',
            type: 'thumbnail',
          }],
        },
      },
    },
  },
  // iPhone 15 - 5 个价格版本
  {
    name: 'iPhone 15 128GB',
    description: '苹果 iPhone 15，A16 仿生芯片，6.1 英寸 Super Retina XDR 显示屏，支持 5G。',
    price: 5999.00,
    currency: 'CNY',
    category: '手机',
    stock: 50,
    commissionRate: 0.05,
    metadata: {
      currency: 'CNY',
      brand: 'Apple',
      model: 'iPhone 15',
      storage: '128GB',
      colors: ['粉色', '黄色', '绿色', '蓝色', '黑色'],
      core: {
        media: {
          images: [{
            url: 'https://images.unsplash.com/photo-1592750475338-74b7b21085ab?w=400',
            type: 'thumbnail',
          }],
        },
      },
    },
  },
  {
    name: 'iPhone 15 256GB',
    description: '苹果 iPhone 15，A16 仿生芯片，6.1 英寸 Super Retina XDR 显示屏，支持 5G。',
    price: 6999.00,
    currency: 'CNY',
    category: '手机',
    stock: 45,
    commissionRate: 0.05,
    metadata: {
      currency: 'CNY',
      brand: 'Apple',
      model: 'iPhone 15',
      storage: '256GB',
      colors: ['粉色', '黄色', '绿色', '蓝色', '黑色'],
      core: {
        media: {
          images: [{
            url: 'https://images.unsplash.com/photo-1592750475338-74b7b21085ab?w=400',
            type: 'thumbnail',
          }],
        },
      },
    },
  },
  {
    name: 'iPhone 15 512GB',
    description: '苹果 iPhone 15，A16 仿生芯片，6.1 英寸 Super Retina XDR 显示屏，支持 5G。',
    price: 8999.00,
    currency: 'CNY',
    category: '手机',
    stock: 30,
    commissionRate: 0.05,
    metadata: {
      currency: 'CNY',
      brand: 'Apple',
      model: 'iPhone 15',
      storage: '512GB',
      colors: ['粉色', '黄色', '绿色', '蓝色', '黑色'],
      core: {
        media: {
          images: [{
            url: 'https://images.unsplash.com/photo-1592750475338-74b7b21085ab?w=400',
            type: 'thumbnail',
          }],
        },
      },
    },
  },
  {
    name: 'iPhone 15 128GB (官方翻新)',
    description: '苹果官方翻新 iPhone 15，经过严格检测，享受官方保修。',
    price: 5199.00,
    currency: 'CNY',
    category: '手机',
    stock: 25,
    commissionRate: 0.05,
    metadata: {
      currency: 'CNY',
      brand: 'Apple',
      model: 'iPhone 15',
      storage: '128GB',
      condition: 'refurbished',
      colors: ['粉色', '蓝色', '黑色'],
      core: {
        media: {
          images: [{
            url: 'https://images.unsplash.com/photo-1592750475338-74b7b21085ab?w=400',
            type: 'thumbnail',
          }],
        },
      },
    },
  },
  {
    name: 'iPhone 15 256GB (官方翻新)',
    description: '苹果官方翻新 iPhone 15，经过严格检测，享受官方保修。',
    price: 6199.00,
    currency: 'CNY',
    category: '手机',
    stock: 20,
    commissionRate: 0.05,
    metadata: {
      currency: 'CNY',
      brand: 'Apple',
      model: 'iPhone 15',
      storage: '256GB',
      condition: 'refurbished',
      colors: ['粉色', '蓝色', '黑色'],
      core: {
        media: {
          images: [{
            url: 'https://images.unsplash.com/photo-1592750475338-74b7b21085ab?w=400',
            type: 'thumbnail',
          }],
        },
      },
    },
  },

  // ========== 路由器 5 种 ==========
  {
    name: 'TP-Link AX6000 WiFi 6 路由器',
    description: '双频 WiFi 6，8 流并发，支持 MU-MIMO，覆盖范围广，适合大户型。',
    price: 899.00,
    currency: 'CNY',
    category: '路由器',
    stock: 40,
    commissionRate: 0.08,
    metadata: {
      currency: 'CNY',
      brand: 'TP-Link',
      model: 'AX6000',
      type: 'wifi6_router',
      features: ['WiFi 6', '8流并发', 'MU-MIMO', '大覆盖'],
      core: {
        media: {
          images: [{
            url: 'https://images.unsplash.com/photo-1609081219090-a6d81d3085bf?w=400',
            type: 'thumbnail',
          }],
        },
      },
    },
  },
  {
    name: '小米 AX9000 WiFi 6E 三频路由器',
    description: 'WiFi 6E 三频，12 流并发，支持 Mesh 组网，游戏加速。',
    price: 1299.00,
    currency: 'CNY',
    category: '路由器',
    stock: 30,
    commissionRate: 0.08,
    metadata: {
      currency: 'CNY',
      brand: '小米',
      model: 'AX9000',
      type: 'wifi6e_router',
      features: ['WiFi 6E', '三频', '12流并发', 'Mesh组网', '游戏加速'],
      core: {
        media: {
          images: [{
            url: 'https://images.unsplash.com/photo-1609081219090-a6d81d3085bf?w=400',
            type: 'thumbnail',
          }],
        },
      },
    },
  },
  {
    name: '华为 AX3 Pro WiFi 6+ 路由器',
    description: 'WiFi 6+ 技术，4 核 CPU，支持 Mesh 组网，智能家居优化。',
    price: 399.00,
    currency: 'CNY',
    category: '路由器',
    stock: 60,
    commissionRate: 0.07,
    metadata: {
      currency: 'CNY',
      brand: '华为',
      model: 'AX3 Pro',
      type: 'wifi6_router',
      features: ['WiFi 6+', '4核CPU', 'Mesh组网', '智能家居优化'],
      core: {
        media: {
          images: [{
            url: 'https://images.unsplash.com/photo-1609081219090-a6d81d3085bf?w=400',
            type: 'thumbnail',
          }],
        },
      },
    },
  },
  {
    name: '华硕 RT-AX86U WiFi 6 游戏路由器',
    description: 'WiFi 6，游戏加速，AiMesh 2.0，支持 VPN，适合游戏玩家。',
    price: 1499.00,
    currency: 'CNY',
    category: '路由器',
    stock: 25,
    commissionRate: 0.09,
    metadata: {
      currency: 'CNY',
      brand: '华硕',
      model: 'RT-AX86U',
      type: 'gaming_router',
      features: ['WiFi 6', '游戏加速', 'AiMesh 2.0', 'VPN支持'],
      core: {
        media: {
          images: [{
            url: 'https://images.unsplash.com/photo-1609081219090-a6d81d3085bf?w=400',
            type: 'thumbnail',
          }],
        },
      },
    },
  },
  {
    name: '网件 Nighthawk AX8 WiFi 6 路由器',
    description: 'WiFi 6，8 流并发，支持 MU-MIMO，智能 QoS，适合家庭和办公。',
    price: 1799.00,
    currency: 'CNY',
    category: '路由器',
    stock: 20,
    commissionRate: 0.09,
    metadata: {
      currency: 'CNY',
      brand: '网件',
      model: 'Nighthawk AX8',
      type: 'wifi6_router',
      features: ['WiFi 6', '8流并发', 'MU-MIMO', '智能QoS'],
      core: {
        media: {
          images: [{
            url: 'https://images.unsplash.com/photo-1609081219090-a6d81d3085bf?w=400',
            type: 'thumbnail',
          }],
        },
      },
    },
  },

  // ========== 电脑 5 种 ==========
  {
    name: 'MacBook Pro 14英寸 M3 Pro 芯片',
    description: '14 英寸 Liquid Retina XDR 显示屏，M3 Pro 芯片，18 小时续航，适合专业创作。',
    price: 16999.00,
    currency: 'CNY',
    category: '笔记本电脑',
    stock: 20,
    commissionRate: 0.05,
    metadata: {
      currency: 'CNY',
      brand: 'Apple',
      model: 'MacBook Pro 14"',
      cpu: 'M3 Pro',
      ram: '18GB',
      storage: '512GB SSD',
      screen: '14英寸 Liquid Retina XDR',
      core: {
        media: {
          images: [{
            url: 'https://images.unsplash.com/photo-1517336714731-489689fd1ca8?w=400',
            type: 'thumbnail',
          }],
        },
      },
    },
  },
  {
    name: 'MacBook Air 13英寸 M2 芯片',
    description: '13.6 英寸 Liquid Retina 显示屏，M2 芯片，18 小时续航，轻薄便携。',
    price: 9999.00,
    currency: 'CNY',
    category: '笔记本电脑',
    stock: 35,
    commissionRate: 0.05,
    metadata: {
      currency: 'CNY',
      brand: 'Apple',
      model: 'MacBook Air 13"',
      cpu: 'M2',
      ram: '8GB',
      storage: '256GB SSD',
      screen: '13.6英寸 Liquid Retina',
      core: {
        media: {
          images: [{
            url: 'https://images.unsplash.com/photo-1517336714731-489689fd1ca8?w=400',
            type: 'thumbnail',
          }],
        },
      },
    },
  },
  {
    name: '联想 ThinkPad X1 Carbon 14英寸',
    description: '14 英寸 2.8K 显示屏，Intel i7-1355U，16GB 内存，512GB SSD，商务轻薄本。',
    price: 11999.00,
    currency: 'CNY',
    category: '笔记本电脑',
    stock: 25,
    commissionRate: 0.06,
    metadata: {
      currency: 'CNY',
      brand: '联想',
      model: 'ThinkPad X1 Carbon',
      cpu: 'Intel i7-1355U',
      ram: '16GB',
      storage: '512GB SSD',
      screen: '14英寸 2.8K',
      core: {
        media: {
          images: [{
            url: 'https://images.unsplash.com/photo-1496181133206-80ce9b88a853?w=400',
            type: 'thumbnail',
          }],
        },
      },
    },
  },
  {
    name: '戴尔 XPS 13 Plus 13.4英寸',
    description: '13.4 英寸 OLED 触控屏，Intel i7-1360P，16GB 内存，512GB SSD，超薄设计。',
    price: 12999.00,
    currency: 'CNY',
    category: '笔记本电脑',
    stock: 18,
    commissionRate: 0.06,
    metadata: {
      currency: 'CNY',
      brand: '戴尔',
      model: 'XPS 13 Plus',
      cpu: 'Intel i7-1360P',
      ram: '16GB',
      storage: '512GB SSD',
      screen: '13.4英寸 OLED 触控',
      core: {
        media: {
          images: [{
            url: 'https://images.unsplash.com/photo-1496181133206-80ce9b88a853?w=400',
            type: 'thumbnail',
          }],
        },
      },
    },
  },
  {
    name: '华硕 ROG 幻16 16英寸 游戏本',
    description: '16 英寸 2.5K 165Hz 显示屏，Intel i9-13900H，RTX 4060，32GB 内存，1TB SSD。',
    price: 12999.00,
    currency: 'CNY',
    category: '游戏本',
    stock: 15,
    commissionRate: 0.07,
    metadata: {
      currency: 'CNY',
      brand: '华硕',
      model: 'ROG 幻16',
      cpu: 'Intel i9-13900H',
      gpu: 'RTX 4060',
      ram: '32GB',
      storage: '1TB SSD',
      screen: '16英寸 2.5K 165Hz',
      core: {
        media: {
          images: [{
            url: 'https://images.unsplash.com/photo-1496181133206-80ce9b88a853?w=400',
            type: 'thumbnail',
          }],
        },
      },
    },
  },

  // ========== 其他 5 种 ==========
  {
    name: 'iPad Pro 12.9英寸 M2 芯片',
    description: '12.9 英寸 Liquid Retina XDR 显示屏，M2 芯片，支持 Apple Pencil，适合创作和办公。',
    price: 8999.00,
    currency: 'CNY',
    category: '平板电脑',
    stock: 30,
    commissionRate: 0.05,
    metadata: {
      currency: 'CNY',
      brand: 'Apple',
      model: 'iPad Pro 12.9"',
      cpu: 'M2',
      storage: '256GB',
      screen: '12.9英寸 Liquid Retina XDR',
      core: {
        media: {
          images: [{
            url: 'https://images.unsplash.com/photo-1544244015-0df4b3ffc6b0?w=400',
            type: 'thumbnail',
          }],
        },
      },
    },
  },
  {
    name: 'Apple Watch Series 9 GPS 版',
    description: '45mm 表盘，S9 芯片，全天候健康监测，支持血氧检测，18 小时续航。',
    price: 2999.00,
    currency: 'CNY',
    category: '智能手表',
    stock: 50,
    commissionRate: 0.05,
    metadata: {
      currency: 'CNY',
      brand: 'Apple',
      model: 'Apple Watch Series 9',
      size: '45mm',
      features: ['健康监测', '血氧检测', 'GPS', '18小时续航'],
      core: {
        media: {
          images: [{
            url: 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=400',
            type: 'thumbnail',
          }],
        },
      },
    },
  },
  {
    name: 'Switch OLED 游戏主机',
    description: '7 英寸 OLED 显示屏，64GB 存储，支持 TV 模式、桌面模式和掌机模式。',
    price: 2099.00,
    currency: 'CNY',
    category: '游戏主机',
    stock: 40,
    commissionRate: 0.08,
    metadata: {
      currency: 'CNY',
      brand: 'Nintendo',
      model: 'Switch OLED',
      storage: '64GB',
      screen: '7英寸 OLED',
      features: ['TV模式', '桌面模式', '掌机模式'],
      core: {
        media: {
          images: [{
            url: 'https://images.unsplash.com/photo-1606144042614-b2417e99c4e3?w=400',
            type: 'thumbnail',
          }],
        },
      },
    },
  },
  {
    name: 'Kindle Paperwhite 电子书阅读器',
    description: '6.8 英寸 300ppi 显示屏，32GB 存储，IPX8 防水，6 周续航，内置阅读灯。',
    price: 999.00,
    currency: 'CNY',
    category: '电子阅读器',
    stock: 60,
    commissionRate: 0.07,
    metadata: {
      currency: 'CNY',
      brand: 'Amazon',
      model: 'Kindle Paperwhite',
      screen: '6.8英寸 300ppi',
      storage: '32GB',
      features: ['IPX8防水', '6周续航', '内置阅读灯'],
      core: {
        media: {
          images: [{
            url: 'https://images.unsplash.com/photo-1544947950-fa07a98d237f?w=400',
            type: 'thumbnail',
          }],
        },
      },
    },
  },
  {
    name: 'DJI Mini 4 Pro 无人机',
    description: '4K 60fps 视频，三向避障，48MP 照片，34 分钟续航，支持 O4 图传。',
    price: 6999.00,
    currency: 'CNY',
    category: '无人机',
    stock: 20,
    commissionRate: 0.10,
    metadata: {
      currency: 'CNY',
      brand: 'DJI',
      model: 'Mini 4 Pro',
      camera: '48MP',
      video: '4K 60fps',
      features: ['三向避障', '34分钟续航', 'O4图传'],
      core: {
        media: {
          images: [{
            url: 'https://images.unsplash.com/photo-1473968512647-3e447244af8f?w=400',
            type: 'thumbnail',
          }],
        },
      },
    },
  },
];

async function seedMarketplaceProducts() {
  try {
    await AppDataSource.initialize();
    console.log('✅ 数据库连接成功');

    const productRepository = AppDataSource.getRepository(Product);
    const userRepository = AppDataSource.getRepository(User);

    // 查找或创建测试商户
    let merchant = await userRepository.findOne({
      where: { email: 'merchant@agentrix.test' },
    });

    if (!merchant) {
      console.log('📝 创建测试商户...');
      merchant = userRepository.create({
        agentrixId: `AX-merchant-${Date.now()}`,
        email: 'merchant@agentrix.test',
        roles: [UserRole.MERCHANT],
      });
      merchant = await userRepository.save(merchant);
      console.log(`✅ 商户已创建: ${merchant.id}`);
    } else {
      console.log(`✅ 使用现有商户: ${merchant.id}`);
    }

    // 导入商品
    console.log(`\n📦 开始导入 ${products.length} 个商品...`);
    let successCount = 0;
    let failCount = 0;

    for (const productData of products) {
      try {
        // 检查商品是否已存在
        const existing = await productRepository.findOne({
          where: {
            merchantId: merchant.id,
            name: productData.name,
          },
        });

        if (existing) {
          console.log(`⏭️  跳过已存在商品: ${productData.name}`);
          continue;
        }

        const product = productRepository.create({
          merchantId: merchant.id,
          name: productData.name,
          description: productData.description,
          price: productData.price,
          category: productData.category,
          stock: productData.stock,
          commissionRate: productData.commissionRate,
          status: ProductStatus.ACTIVE,
          metadata: {
            ...productData.metadata,
            currency: productData.currency,
          },
        });

        await productRepository.save(product);
        successCount++;
        console.log(`✅ 已导入: ${productData.name} (¥${productData.price})`);
      } catch (error) {
        failCount++;
        console.error(`❌ 导入失败: ${productData.name}`, error);
      }
    }

    console.log(`\n📊 导入完成:`);
    console.log(`   ✅ 成功: ${successCount}`);
    console.log(`   ❌ 失败: ${failCount}`);
    console.log(`   📦 总计: ${products.length}`);

    // 统计各品类商品数量
    const categoryStats = await productRepository
      .createQueryBuilder('product')
      .select('product.category', 'category')
      .addSelect('COUNT(*)', 'count')
      .where('product.merchantId = :merchantId', { merchantId: merchant.id })
      .groupBy('product.category')
      .getRawMany();

    console.log(`\n📈 品类统计:`);
    categoryStats.forEach((stat: any) => {
      console.log(`   ${stat.category}: ${stat.count} 个`);
    });

    await AppDataSource.destroy();
    console.log('\n✅ Marketplace 商品导入完成！');
  } catch (error) {
    console.error('❌ 导入失败:', error);
    process.exit(1);
  }
}

seedMarketplaceProducts();

