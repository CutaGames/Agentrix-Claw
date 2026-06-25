/**
 * 商品数据格式化工具
 * 统一所有后端服务返回的商品数据格式，确保前端和 AI 平台能正确展示
 */

export interface StandardProductDisplay {
  // 基础信息
  id: string;
  name: string;
  description?: string;
  
  // 价格信息
  price: number;
  currency: string;
  priceDisplay?: string;
  
  // 库存信息
  stock: number;
  inStock: boolean;
  
  // 分类信息
  category: string;
  productType: string;
  
  // 图片信息
  image?: string;
  images?: string[];
  
  // 商户信息
  merchantId: string;
  merchantName?: string;
  
  // 评分和相关性
  score?: number;
  relevanceScore?: number;
  
  // 其他元数据
  metadata?: any;
  
  // 索引信息
  index?: number;
  
  // 其他字段
  commissionRate?: number;
}

/**
 * 货币符号映射
 */
const CURRENCY_SYMBOLS: Record<string, string> = {
  'CNY': '¥',
  'USD': '$',
  'EUR': '€',
  'GBP': '£',
  'JPY': '¥',
  'USDT': 'USDT',
  'USDC': 'USDC',
  'ETH': 'ETH',
  'BTC': 'BTC',
};

/**
 * 格式化价格显示
 */
function formatPrice(price: number, currency: string): string {
  const symbol = CURRENCY_SYMBOLS[currency] || currency;
  if (['USDT', 'USDC', 'ETH', 'BTC'].includes(currency)) {
    return `${price} ${symbol}`;
  }
  return `${symbol}${price.toFixed(2)}`;
}

/**
 * 从商品元数据中提取图片URL
 * 按优先级：metadata.core.media.images[0].url > metadata.image > metadata.extensions.image
 */
function extractImageUrl(product: any): string | null {
  // 优先级1: 统一数据标准格式
  if (product.metadata?.core?.media?.images?.[0]?.url) {
    return product.metadata.core.media.images[0].url;
  }
  
  // 优先级2: 旧格式兼容
  if (product.metadata?.image) {
    return product.metadata.image;
  }
  
  // 优先级3: extensions 中的图片
  if (product.metadata?.extensions?.image) {
    return product.metadata.extensions.image;
  }
  
  return null;
}

/**
 * 从商品元数据中提取所有图片URL
 */
function extractAllImages(product: any): string[] {
  // 统一数据标准格式
  if (product.metadata?.core?.media?.images?.length > 0) {
    return product.metadata.core.media.images.map((img: any) => img.url);
  }
  
  // 旧格式兼容
  const singleImage = extractImageUrl(product);
  if (singleImage) {
    return [singleImage];
  }
  
  return [];
}

/**
 * 从商品元数据中提取货币代码
 */
function extractCurrency(product: any): string {
  return (
    product.metadata?.extensions?.currency ||
    product.metadata?.currency ||
    'CNY'
  );
}

/**
 * 将商品实体转换为标准展示格式
 * 
 * @param product 商品实体
 * @param options 可选参数
 * @returns 标准化的商品展示数据
 */
export function formatProductForDisplay(
  product: any,
  options?: {
    index?: number;
    score?: number;
    relevanceScore?: number;
  },
): StandardProductDisplay {
  const currency = extractCurrency(product);
  const image = extractImageUrl(product);
  const images = extractAllImages(product);
  const price = Number(product.price) || 0;
  const stock = Number(product.stock) || 0;
  
  return {
    id: product.id,
    name: product.name,
    description: product.description || '',
    price,
    currency,
    priceDisplay: formatPrice(price, currency),
    stock,
    inStock: stock > 0,
    category: product.category || '',
    productType: product.productType || 'physical',
    image: image || undefined,
    images: images.length > 0 ? images : undefined,
    merchantId: product.merchantId,
    commissionRate: product.commissionRate,
    score: options?.score,
    relevanceScore: options?.relevanceScore,
    metadata: product.metadata,
    index: options?.index,
  };
}

/**
 * 批量格式化商品列表
 */
export function formatProductsForDisplay(
  products: any[],
  options?: {
    scores?: number[];
    relevanceScores?: number[];
  },
): StandardProductDisplay[] {
  return products.map((product, index) => {
    return formatProductForDisplay(product, {
      index: index + 1,
      score: options?.scores?.[index],
      relevanceScore: options?.relevanceScores?.[index],
    });
  });
}

