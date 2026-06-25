import { apiClient } from './client';

export interface Order {
  id: string;
  userId?: string;
  merchantId: string;
  productId?: string;
  amount: number;
  currency: string;
  status: 'pending' | 'paid' | 'shipped' | 'completed' | 'cancelled' | 'refunded';
  paymentMethod?: string;
  transactionHash?: string;
  metadata?: Record<string, any>;
  createdAt: string;
  updatedAt?: string;
}

export interface CreateOrderDto {
  merchantId?: string;
  productId?: string;
  skillId?: string;
  amount: number;
  currency: string;
  agentId?: string;
  metadata?: Record<string, any>;
}

export interface OrderStats {
  totalOrders: number;
  todayOrders: number;
  totalGMV: number;
  todayGMV: number;
  successRate: number;
  avgOrderValue: number;
}

export const orderApi = {
  /**
   * 获取订单列表（支持商户/买家视角）
   */
  getOrders: async (params?: {
    status?: string;
    startDate?: string;
    endDate?: string;
    merchantId?: string; // 如果提供，查询商户收到的订单；否则查询买家购买的订单
  }): Promise<Order[]> => {
    const queryParams = new URLSearchParams();
    if (params?.status) queryParams.set('status', params.status);
    if (params?.startDate) queryParams.set('startDate', params.startDate);
    if (params?.endDate) queryParams.set('endDate', params.endDate);
    if (params?.merchantId) queryParams.set('merchantId', params.merchantId);
    
    const qs = queryParams.toString();
    const result = await apiClient.get<Order[]>(`/orders${qs ? `?${qs}` : ''}`);
    return result ?? [];
  },

  /**
   * 获取当前商户的订单（自动使用当前用户ID作为merchantId）
   */
  getMyMerchantOrders: async (params?: {
    status?: string;
    startDate?: string;
    endDate?: string;
  }): Promise<Order[]> => {
    // 后端会自动识别当前登录商户，所以不需要传merchantId
    // 如果用户已登录且是商户，后端会自动使用user.id作为merchantId
    return orderApi.getOrders(params);
  },

  /**
   * 获取订单详情
   */
  getOrder: async (orderId: string): Promise<Order> => {
    const result = await apiClient.get<Order>(`/orders/${orderId}`);
    if (result === null) {
      throw new Error('无法获取订单详情，请稍后重试');
    }
    return result;
  },

  /**
   * 创建订单
   */
  createOrder: async (dto: CreateOrderDto): Promise<Order> => {
    const result = await apiClient.post<Order>('/orders', dto);
    if (result === null) {
      throw new Error('无法创建订单，请稍后重试');
    }
    return result;
  },

  /**
   * 更新订单状态
   */
  updateOrderStatus: async (orderId: string, status: Order['status']): Promise<Order> => {
    const result = await apiClient.put<Order>(`/orders/${orderId}/status`, { status });
    if (result === null) {
      throw new Error('无法更新订单状态，请稍后重试');
    }
    return result;
  },

  /**
   * 取消订单
   */
  cancelOrder: async (orderId: string): Promise<Order> => {
    const result = await apiClient.post<Order>(`/orders/${orderId}/cancel`);
    if (result === null) {
      throw new Error('无法取消订单，请稍后重试');
    }
    return result;
  },

  /**
   * 订单退款
   */
  refundOrder: async (orderId: string, reason?: string): Promise<Order> => {
    const result = await apiClient.post<Order>(`/orders/${orderId}/refund`, { reason });
    if (result === null) {
      throw new Error('无法处理订单退款，请稍后重试');
    }
    return result;
  },

  /**
   * 获取订单统计
   */
  getOrderStats: async (params?: {
    startDate?: string;
    endDate?: string;
    merchantId?: string;
  }): Promise<OrderStats> => {
    const queryParams = new URLSearchParams();
    if (params?.startDate) queryParams.set('startDate', params.startDate);
    if (params?.endDate) queryParams.set('endDate', params.endDate);
    if (params?.merchantId) queryParams.set('merchantId', params.merchantId);
    
    const qs = queryParams.toString();
    const result = await apiClient.get<OrderStats>(`/orders/stats${qs ? `?${qs}` : ''}`);
    if (result === null) {
      throw new Error('无法获取订单统计，请稍后重试');
    }
    return result;
  },
};

