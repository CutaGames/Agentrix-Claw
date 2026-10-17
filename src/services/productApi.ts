/**
 * productApi — 商品市场移动端 API(商家店铺接 marketplace 商品)。
 *
 * 后端契约:
 *   GET  /products?merchantId=&search=&status=&type=   商品列表(merchantId 过滤某商家),返回原始实体数组
 *   GET  /products/:id                                  商品详情
 *   POST /orders { merchantId, productId, amount, currency }  下单(OptionalJwtAuthGuard,需登录关联买家)
 *
 * 注意:后端 /products 返回的是 Product 实体原始结构 —— 图片在 `metadata`(嵌套),
 * price 是 decimal 字符串,没有顶层 currency/imageUrl 字段。本文件负责把原始实体
 * 规整成移动端好用的 ProductSummary。
 */
import { apiFetch } from './api';

export interface ProductSummary {
  id: string;
  name: string;
  description?: string;
  /** 已规整为数字(后端 decimal 返回字符串)。 */
  price: number;
  currency: string;
  imageUrl: string | null;
  images: string[];
  status?: string;
  productType?: string;
  merchantId?: string;
  stock?: number;
  metadata?: Record<string, unknown>;
}

/** 原始 Product 实体(后端直接 repo.find 返回的形状,字段可选)。 */
interface RawProduct {
  id: string;
  name: string;
  description?: string | null;
  price?: number | string | null;
  category?: string;
  productType?: string;
  merchantId?: string;
  status?: string;
  stock?: number;
  metadata?: any;
}

/** 从 metadata 提取主图(兼容统一标准 core.media.images / 旧 metadata.images / metadata.image)。 */
function extractImages(meta: any): string[] {
  if (!meta) return [];
  const core = meta?.core?.media?.images;
  if (Array.isArray(core) && core.length) {
    return core.map((img: any) => (typeof img === 'string' ? img : img?.url)).filter(Boolean);
  }
  if (Array.isArray(meta.images) && meta.images.length) {
    return meta.images.map((img: any) => (typeof img === 'string' ? img : img?.url)).filter(Boolean);
  }
  if (typeof meta.image === 'string' && meta.image) return [meta.image];
  return [];
}

function extractCurrency(meta: any): string {
  return meta?.currency || meta?.core?.price?.currency || 'CNY';
}

function normalize(p: RawProduct): ProductSummary {
  const images = extractImages(p.metadata);
  const priceNum = typeof p.price === 'string' ? Number(p.price) : (p.price ?? 0);
  return {
    id: p.id,
    name: p.name,
    description: p.description ?? undefined,
    price: Number.isFinite(priceNum) ? Number(priceNum) : 0,
    currency: extractCurrency(p.metadata),
    imageUrl: images[0] ?? null,
    images,
    status: p.status,
    productType: p.productType,
    merchantId: p.merchantId,
    stock: p.stock,
    metadata: p.metadata ?? undefined,
  };
}

/** 某商家的在售商品(店铺货架)。 */
export async function listMerchantProducts(merchantId: string): Promise<ProductSummary[]> {
  const r = await apiFetch<RawProduct[] | { items?: RawProduct[]; data?: RawProduct[] }>(
    `/products?merchantId=${encodeURIComponent(merchantId)}&status=active`,
  );
  const arr = Array.isArray(r) ? r : ((r as any).items ?? (r as any).data ?? []);
  return (arr as RawProduct[]).map(normalize);
}

export async function getProductDetail(id: string): Promise<ProductSummary> {
  const r = await apiFetch<RawProduct>(`/products/${encodeURIComponent(id)}`);
  return normalize(r);
}

/** 价格展示文案(¥/CNY → ¥,其余原样)。 */
export function formatPrice(p: ProductSummary): string {
  if (!p.price) return '面议';
  const sym = p.currency === 'CNY' || p.currency === '¥' ? '¥' : `${p.currency} `;
  return `${sym}${p.price}`;
}

export interface ProductOrder {
  id: string;
  status: string;
  amount: number;
  currency: string;
  productId?: string;
  merchantId?: string;
}

/** 下单购买实物/服务商品(走 marketplace 订单流程)。 */
export async function createProductOrder(p: ProductSummary): Promise<ProductOrder> {
  return apiFetch('/orders', {
    method: 'POST',
    body: JSON.stringify({
      merchantId: p.merchantId,
      productId: p.id,
      amount: p.price,
      currency: p.currency || 'CNY',
    }),
  });
}
