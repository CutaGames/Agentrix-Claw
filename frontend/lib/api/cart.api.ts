import { apiClient } from './client';

export interface CartItem {
  productId: string;
  quantity: number;
  addedAt: string;
}

export interface Cart {
  userId: string;
  items: CartItem[];
  updatedAt: string;
}

export interface CartWithProducts {
  items: Array<{
    productId: string;
    quantity: number;
    product: any;
  }>;
  total: number;
  itemCount: number;
}

export const cartApi = {
  /**
   * 获取购物车（支持sessionId，未登录用户可用）
   */
  getCart: async (sessionId?: string): Promise<Cart> => {
    const url = sessionId ? `/agent/cart?sessionId=${sessionId}` : '/cart';
    const result = await apiClient.get<Cart>(url);
    if (result === null) {
      throw new Error('无法获取购物车，请稍后重试');
    }
    return result;
  },

  /**
   * 获取购物车及商品详情（支持sessionId，未登录用户可用）
   */
  getCartWithProducts: async (sessionId?: string): Promise<CartWithProducts> => {
    const url = sessionId ? `/agent/cart?sessionId=${sessionId}` : '/cart/products';
    const result = await apiClient.get<CartWithProducts>(url);
    if (result === null) {
      throw new Error('无法获取购物车详情，请稍后重试');
    }
    return result;
  },

  /**
   * 添加商品到购物车（支持sessionId，未登录用户可用）
   */
  addItem: async (productId: string, quantity: number = 1, sessionId?: string): Promise<Cart> => {
    console.log('🛒 cartApi.addItem 调用:', { productId, quantity, sessionId });
    const url = sessionId ? '/agent/cart/items' : '/cart/items';
    const body = sessionId ? { productId, quantity, sessionId } : { productId, quantity };
    console.log('🛒 请求URL:', url, '请求体:', body);
    try {
      const result = await apiClient.post<Cart>(url, body);
      console.log('🛒 API响应:', result);
      if (result === null) {
        throw new Error('无法添加商品到购物车，请稍后重试');
      }
      return result;
    } catch (error: any) {
      console.error('❌ cartApi.addItem 错误:', error);
      throw error;
    }
  },

  /**
   * 更新购物车商品数量（支持sessionId，未登录用户可用）
   */
  updateItemQuantity: async (productId: string, quantity: number, sessionId?: string): Promise<Cart> => {
    console.log('🛒 cartApi.updateItemQuantity 调用:', { productId, quantity, sessionId });
    const url = sessionId ? `/agent/cart/items/${productId}` : `/cart/items/${productId}`;
    const body = sessionId ? { quantity, sessionId } : { quantity };
    console.log('🛒 请求URL:', url, '请求体:', body);
    try {
      const result = await apiClient.put<Cart>(url, body);
      console.log('🛒 API响应:', result);
      if (result === null) {
        throw new Error('无法更新商品数量，请稍后重试');
      }
      return result;
    } catch (error: any) {
      console.error('❌ cartApi.updateItemQuantity 错误:', error);
      throw error;
    }
  },

  /**
   * 从购物车移除商品（支持sessionId，未登录用户可用）
   */
  removeItem: async (productId: string, sessionId?: string): Promise<Cart> => {
    console.log('🛒 cartApi.removeItem 调用:', { productId, sessionId });
    const url = sessionId 
      ? `/agent/cart/items/${productId}?sessionId=${sessionId}` 
      : `/cart/items/${productId}`;
    console.log('🛒 请求URL:', url);
    try {
      const result = await apiClient.delete<Cart>(url);
      console.log('🛒 API响应:', result);
      if (result === null) {
        throw new Error('无法移除商品，请稍后重试');
      }
      return result;
    } catch (error: any) {
      console.error('❌ cartApi.removeItem 错误:', error);
      throw error;
    }
  },

  /**
   * 清空购物车
   */
  clearCart: async (): Promise<void> => {
    await apiClient.delete('/cart');
  },
};

