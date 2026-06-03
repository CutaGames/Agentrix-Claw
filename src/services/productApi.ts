/**
 * productApi — 商品市场移动端 API(商家店铺接 marketplace 商品)。
 *
 * 后端契约(backend ProductController @Controller('products')):
 *   GET /products?merchantId=&search=&status=&type=  商品列表(merchantId 过滤某商家)
 *   GET /products/:id                                  商品详情
 *   POST /products/:id/purchase                        购买(在 marketplace 流程里;此处仅列店)
 */
import { apiFetch } from './api';

export interface ProductSummary {
  id: string;
  name: string;
  description?: string;
  price?: number;
  currency?: string;
  imageUrl?: string | null;
  images?: string[];
  status?: string;
  type?: string;
  merchantId?: string;
  metadata?: Record<string, unknown>;
}

/** 某商家的在售商品(店铺货架)。 */
export async function listMerchantProducts(merchantId: string): Promise<ProductSummary[]> {
  const r = await apiFetch<ProductSummary[] | { items?: ProductSummary[]; data?: ProductSummary[] }>(
    `/products?merchantId=${encodeURIComponent(merchantId)}&status=active`,
  );
  if (Array.isArray(r)) return r;
  return (r as any).items ?? (r as any).data ?? [];
}

export async function getProductDetail(id: string): Promise<ProductSummary> {
  return apiFetch(`/products/${encodeURIComponent(id)}`);
}
