/**
 * 管理员后台API
 * 统一处理管理员相关的API请求
 */

// 获取API基础URL
// Browser requests use the Next.js proxy at /api/admin-proxy to avoid cross-origin & DNS issues.
// Server-side (SSR) calls go directly to BACKEND_URL.
export const getAdminApiBaseUrl = () => {
  if (typeof window !== 'undefined') {
    // Always use same-origin proxy in the browser — avoids CORS/DNS/GFW issues with api.agentrix.top
    return '/api/admin-proxy';
  }
  // Server-side: direct backend call (no CORS needed)
  return process.env.BACKEND_URL
    ? `${process.env.BACKEND_URL}/api`
    : 'http://localhost:3001/api';
};

// 获取admin token
const getAdminToken = () => {
  if (typeof window !== 'undefined') {
    return localStorage.getItem('admin_token');
  }
  return null;
};

// 通用请求方法
async function adminFetch<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const token = getAdminToken();
  const baseUrl = getAdminApiBaseUrl();
  
  const response = await fetch(`${baseUrl}${endpoint}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });

  if (response.status === 401) {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('admin_token');
    }
    throw new Error('登录已过期，请重新登录');
  }

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.message || `请求失败: ${response.status}`);
  }

  return response.json();
}

// 用户管理
export const adminUserApi = {
  getUsers: (params: { page?: number; limit?: number; search?: string; role?: string }) => {
    const query = new URLSearchParams();
    if (params.page) query.set('page', params.page.toString());
    if (params.limit) query.set('limit', params.limit.toString());
    if (params.search) query.set('search', params.search);
    if (params.role) query.set('role', params.role);
    return adminFetch<{ data: any[]; total: number }>(`/admin/users?${query}`);
  },
  
  getUser: (id: string) => adminFetch<any>(`/admin/users/${id}`),
  
  approveKYC: (id: string) => adminFetch<any>(`/admin/users/${id}/kyc/approve`, { method: 'POST' }),
  
  rejectKYC: (id: string, reason: string) => 
    adminFetch<any>(`/admin/users/${id}/kyc/reject`, { 
      method: 'POST',
      body: JSON.stringify({ reason }),
    }),
  
  updateStatus: (id: string, status: string, reason?: string) =>
    adminFetch<any>(`/admin/users/${id}/status`, {
      method: 'PUT',
      body: JSON.stringify({ status, reason }),
    }),
};

// 商户管理
export const adminMerchantApi = {
  getMerchants: (params: { page?: number; limit?: number; search?: string }) => {
    const query = new URLSearchParams();
    if (params.page) query.set('page', params.page.toString());
    if (params.limit) query.set('limit', params.limit.toString());
    if (params.search) query.set('search', params.search);
    return adminFetch<{ data: any[]; total: number }>(`/admin/merchants?${query}`);
  },
  
  getMerchant: (id: string) => adminFetch<any>(`/admin/merchants/${id}`),
  
  approveMerchant: (id: string) => adminFetch<any>(`/admin/merchants/${id}/approve`, { method: 'POST' }),
  
  rejectMerchant: (id: string, reason: string) =>
    adminFetch<any>(`/admin/merchants/${id}/reject`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    }),
};

// 开发者管理
export const adminDeveloperApi = {
  getDevelopers: (params: { page?: number; limit?: number; search?: string }) => {
    const query = new URLSearchParams();
    if (params.page) query.set('page', params.page.toString());
    if (params.limit) query.set('limit', params.limit.toString());
    if (params.search) query.set('search', params.search);
    return adminFetch<{ data: any[]; total: number }>(`/admin/developers?${query}`);
  },
  
  getDeveloper: (id: string) => adminFetch<any>(`/admin/developers/${id}`),
};

// 商品管理
export const adminProductApi = {
  getProducts: (params: { page?: number; limit?: number; status?: string }) => {
    const query = new URLSearchParams();
    if (params.page) query.set('page', params.page.toString());
    if (params.limit) query.set('limit', params.limit.toString());
    if (params.status) query.set('status', params.status);
    return adminFetch<{ data: any[]; total: number }>(`/admin/products?${query}`);
  },
  
  approveProduct: (id: string) => adminFetch<any>(`/admin/products/${id}/approve`, { method: 'POST' }),
  
  rejectProduct: (id: string, reason: string) =>
    adminFetch<any>(`/admin/products/${id}/reject`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    }),
};

// 工单管理
export const adminTicketApi = {
  getTickets: (params: { page?: number; limit?: number; status?: string }) => {
    const query = new URLSearchParams();
    if (params.page) query.set('page', params.page.toString());
    if (params.limit) query.set('limit', params.limit.toString());
    if (params.status) query.set('status', params.status);
    return adminFetch<{ data: any[]; total: number }>(`/admin/tickets?${query}`);
  },
  
  getTicket: (id: string) => adminFetch<any>(`/admin/tickets/${id}`),
  
  replyTicket: (id: string, content: string) =>
    adminFetch<any>(`/admin/tickets/${id}/reply`, {
      method: 'POST',
      body: JSON.stringify({ content }),
    }),
  
  closeTicket: (id: string) => adminFetch<any>(`/admin/tickets/${id}/close`, { method: 'POST' }),
};

// 系统管理
export const adminSystemApi = {
  getStats: () => adminFetch<any>('/admin/system/stats'),
  
  getConfig: () => adminFetch<any>('/admin/system/config'),
  
  updateConfig: (config: any) =>
    adminFetch<any>('/admin/system/config', {
      method: 'PUT',
      body: JSON.stringify(config),
    }),
  
  // 管理员管理
  getAdmins: (params?: { limit?: number }) => {
    const query = new URLSearchParams();
    if (params?.limit) query.set('limit', params.limit.toString());
    return adminFetch<{ data: any[]; total: number }>(`/admin/system/admins?${query}`);
  },
  
  createAdmin: (data: { username: string; email: string; password: string }) =>
    adminFetch<any>('/admin/system/admins', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  
  // 角色管理
  getRoles: () => adminFetch<any[]>('/admin/system/roles'),
  
  createRole: (data: { name: string; description: string; type: string; permissions: string[] }) =>
    adminFetch<any>('/admin/system/roles', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  
  // 配置管理
  getConfigs: () => adminFetch<any[]>('/admin/system/configs'),
  
  updateConfigItem: (key: string, value: string) =>
    adminFetch<any>(`/admin/system/configs/${key}`, {
      method: 'PUT',
      body: JSON.stringify({ value }),
    }),
};

// 风控管理
export const adminRiskApi = {
  getAlerts: (params: { page?: number; limit?: number; level?: string }) => {
    const query = new URLSearchParams();
    if (params.page) query.set('page', params.page.toString());
    if (params.limit) query.set('limit', params.limit.toString());
    if (params.level) query.set('level', params.level);
    return adminFetch<{ data: any[]; total: number }>(`/admin/risk/alerts?${query}`);
  },
  
  handleAlert: (id: string, action: string, notes?: string) =>
    adminFetch<any>(`/admin/risk/alerts/${id}/handle`, {
      method: 'POST',
      body: JSON.stringify({ action, notes }),
    }),
};

// 推广员管理
export const adminPromoterApi = {
  getPromoters: (params: { page?: number; limit?: number }) => {
    const query = new URLSearchParams();
    if (params.page) query.set('page', params.page.toString());
    if (params.limit) query.set('limit', params.limit.toString());
    return adminFetch<{ data: any[]; total: number }>(`/admin/promoters?${query}`);
  },
  
  approvePromoter: (id: string) => adminFetch<any>(`/admin/promoters/${id}/approve`, { method: 'POST' }),
};

// 营销管理
export const adminMarketingApi = {
  getCampaigns: () => adminFetch<any[]>('/admin/marketing/campaigns'),
  
  createCampaign: (data: any) =>
    adminFetch<any>('/admin/marketing/campaigns', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
};
