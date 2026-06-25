import { apiClient } from './client';

export interface ProductInfo {
  id: string;
  name: string;
  description?: string;
  price: number;
  stock: number;
  category: string;
  productType?: string;
  commissionRate: number;
  status: string;
  merchantId: string;
  metadata?: {
    image?: string;
    currency?: string;
    aiCompatible?: {
      openai?: { function: any };
      claude?: any;
      gemini?: any;
    };
    [key: string]: any;
  };
}

// 兼容旧类型
export type Product = ProductInfo;

/**
 * 统一产品数据标准 - 创建产品DTO
 * 符合 Agentrix 统一产品数据标准
 */
export interface CreateProductDto {
  // 基础字段（必需）
  name: string;
  description: string;
  category: string;
  productType: 'physical' | 'service' | 'nft' | 'ft' | 'plugin' | 'subscription' | 'game_asset' | 'rwa';
  
  // 价格信息（统一标准）
  price: {
    amount: number;
    currency: string; // ISO 4217 货币代码
  };
  
  // 库存信息（统一标准）
  inventory: {
    type: 'finite' | 'unlimited' | 'digital';
    quantity?: number; // finite 时必需
  };
  
  // 统一元数据
  metadata: {
    // 核心元数据
    core: {
      // 媒体资源
      media: {
        images: Array<{
          url: string;
          type: 'thumbnail' | 'gallery' | 'detail';
          alt?: string;
        }>;
        videos?: Array<{
          url: string;
          type: 'preview' | 'demo' | 'tutorial';
          thumbnail?: string;
        }>;
      };
      // 多语言支持（可选）
      i18n?: {
        [locale: string]: {
          name?: string;
          description?: string;
        };
      };
      // SEO信息（可选）
      seo?: {
        keywords?: string[];
        metaDescription?: string;
      };
    };
    // 类型特定元数据（根据 productType 定义）
    typeSpecific?: Record<string, any>;
    // AI兼容字段（自动生成，可选）
    aiCompatible?: {
      openai?: any;
      claude?: any;
      gemini?: any;
    };
    // 扩展字段
    extensions?: Record<string, any>;
  };
  
  // 可选字段
  tags?: string[];
  subcategory?: string;
  
  // 兼容旧字段（向后兼容）
  commissionRate?: number; // 如果提供，会设置到 metadata.extensions
  stock?: number; // 如果提供，会转换为 inventory.quantity
  currency?: string; // 如果提供，会设置到 price.currency
}

/**
 * 更新产品DTO
 * 与后端 UpdateProductDto 保持一致，使用简单字段格式
 */
export interface UpdateProductDto {
  name?: string;
  description?: string;
  price?: number; // 简单数字格式，不是统一格式的对象
  stock?: number;
  productType?: 'physical' | 'service' | 'nft' | 'ft' | 'plugin' | 'subscription' | 'game_asset' | 'rwa';
  commissionRate?: number;
  status?: 'active' | 'inactive' | 'out_of_stock';
  metadata?: Record<string, any>;
}

export const productApi = {
  /**
   * 获取商品列表（支持商户过滤）
   */
  getProducts: async (params?: {
    search?: string;
    merchantId?: string;
    status?: 'active' | 'inactive' | 'out_of_stock';
    type?: 'physical' | 'service' | 'digital' | 'x402';
  }): Promise<ProductInfo[]> => {
    const queryParams = new URLSearchParams();
    if (params?.search) queryParams.append('search', params.search);
    if (params?.merchantId) queryParams.append('merchantId', params.merchantId);
    if (params?.status) queryParams.append('status', params.status);
    if (params?.type) queryParams.append('type', params.type);
    
    const queryString = queryParams.toString();
    const url = `/products${queryString ? `?${queryString}` : ''}`;
    const result = await apiClient.get<ProductInfo[]>(url);
    return result ?? [];
  },

  /**
   * 获取当前商户的商品（自动使用当前用户ID作为merchantId）
   */
  getMyProducts: async (params?: {
    search?: string;
    status?: 'active' | 'inactive' | 'out_of_stock';
  }): Promise<ProductInfo[]> => {
    // 后端会自动识别当前登录商户，所以不需要传merchantId
    // 如果用户已登录且是商户，后端会自动使用user.id作为merchantId
    return productApi.getProducts(params);
  },

  /**
   * 获取商品详情
   */
  getProduct: async (id: string): Promise<ProductInfo> => {
    const result = await apiClient.get<ProductInfo>(`/products/${id}`);
    if (result === null) {
      throw new Error('无法获取商品详情，请稍后重试');
    }
    return result;
  },

  /**
   * 创建商品
   */
  createProduct: async (dto: CreateProductDto): Promise<ProductInfo> => {
    const result = await apiClient.post<ProductInfo>('/products', dto);
    if (result === null) {
      throw new Error('无法创建商品，请稍后重试');
    }
    return result;
  },

  /**
   * 更新商品
   */
  updateProduct: async (
    id: string,
    dto: UpdateProductDto,
  ): Promise<ProductInfo> => {
    const result = await apiClient.put<ProductInfo>(`/products/${id}`, dto);
    if (result === null) {
      throw new Error('无法更新商品，请稍后重试');
    }
    return result;
  },

  /**
   * 删除商品
   */
  deleteProduct: async (id: string): Promise<void> => {
    return apiClient.delete(`/products/${id}`);
  },

  /**
   * 批量导入商品（JSON 格式）
   */
  batchImport: async (data: {
    products: Array<{
      name: string;
      description?: string;
      price: number;
      currency?: string;
      stock?: number;
      category: string;
      productType?: string;
      commissionRate?: number;
      image?: string;
      tags?: string;
    }>;
    mode?: 'create' | 'upsert';
    skipErrors?: boolean;
  }): Promise<{
    total: number;
    success: number;
    failed: number;
    skipped: number;
    errors: Array<{ row: number; name: string; error: string }>;
    createdIds: string[];
  }> => {
    const result = await apiClient.post<any>('/products/batch/import', data);
    if (result === null) {
      throw new Error('批量导入失败，请稍后重试');
    }
    return result.data || result;
  },

  /**
   * 获取导入模板列定义
   */
  getImportTemplateColumns: async (): Promise<Array<{
    key: string;
    label: string;
    required: boolean;
    example: string;
  }>> => {
    const result = await apiClient.get<any>('/products/batch/template/columns');
    return result?.data || [];
  },

  /**
   * 获取电商平台连接列表
   */
  getEcommerceConnections: async (): Promise<any[]> => {
    const result = await apiClient.get<any>('/ecommerce/connections');
    return result?.data || result || [];
  },

  /**
   * 创建电商平台连接
   */
  createEcommerceConnection: async (data: {
    platform: 'shopify' | 'woocommerce' | 'magento' | 'bigcommerce' | 'custom';
    storeName: string;
    storeUrl?: string;
    credentials: Record<string, string>;
  }): Promise<any> => {
    const result = await apiClient.post<any>('/ecommerce/connections', data);
    return result?.data || result;
  },

  /**
   * 更新电商平台连接
   */
  updateEcommerceConnection: async (id: string, data: any): Promise<any> => {
    const result = await apiClient.patch<any>(`/ecommerce/connections/${id}`, data);
    return result?.data || result;
  },

  /**
   * 删除电商平台连接
   */
  deleteEcommerceConnection: async (id: string): Promise<void> => {
    return apiClient.delete(`/ecommerce/connections/${id}`);
  },

  /**
   * 同步电商平台数据
   */
  syncEcommerceConnection: async (id: string): Promise<any> => {
    const result = await apiClient.post<any>(`/ecommerce/connections/${id}/sync`, {});
    return result?.data || result;
  },
};
