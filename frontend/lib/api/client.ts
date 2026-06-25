/**
 * API客户端封装
 * 统一处理API请求、错误处理、认证等
 */

// 自动识别本地/生产环境并设置 API baseURL
const getApiBaseUrl = () => {
  // 如果明确设置了环境变量，优先使用
  if (process.env.NEXT_PUBLIC_API_URL) {
    const envUrl = process.env.NEXT_PUBLIC_API_URL;
    // 确保有 /api 后缀
    if (!envUrl.endsWith('/api')) {
      return envUrl.endsWith('/') ? `${envUrl}api` : `${envUrl}/api`;
    }
    return envUrl;
  }

  // 自动识别环境
  if (typeof window !== 'undefined') {
    // 浏览器环境：本地开发仍然直连本地后端，生产环境统一走同源 /api 代理
    const { hostname, origin } = window.location;
    const isLocalHost = hostname === 'localhost' || hostname === '127.0.0.1';
    const isPrivateNetwork =
      hostname.startsWith('192.168.') ||
      hostname.startsWith('10.') ||
      hostname.startsWith('172.');

    if (isLocalHost || isPrivateNetwork) {
      return 'http://localhost:3001/api';
    }

    // 生产环境统一走同源代理，避免浏览器直连 api.agentrix.top 导致的 CORS / DNS / GFW 问题
    return `${origin}/api`;
  }

  // 服务端渲染或默认情况：根据 NODE_ENV 判断
  if (process.env.NODE_ENV === 'production') {
    const backendUrl = process.env.BACKEND_URL;
    if (backendUrl) {
      return backendUrl.endsWith('/api') ? backendUrl : `${backendUrl.replace(/\/$/, '')}/api`;
    }

    // SSR 默认同样优先使用生产 API 域名
    return 'https://api.agentrix.top/api';
  }

  // 默认本地开发
  return 'http://localhost:3001/api';
};

export const API_BASE_URL = getApiBaseUrl();

// 开发环境输出当前使用的 API baseURL
if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development') {
  console.log('🌐 API Base URL:', API_BASE_URL, '(自动识别环境)');
}

export interface ApiResponse<T = any> {
  data?: T;
  error?: string;
  message?: string;
}

class ApiClient {
  private baseURL: string;
  private token: string | null = null;

  constructor(baseURL: string) {
    this.baseURL = baseURL;
    if (typeof window !== 'undefined') {
      this.token = localStorage.getItem('access_token');
    }
  }

  setToken(token: string) {
    this.token = token;
    if (typeof window !== 'undefined') {
      localStorage.setItem('access_token', token);
    }
  }

  clearToken() {
    this.token = null;
    if (typeof window !== 'undefined') {
      localStorage.removeItem('access_token');
    }
  }

  /**
   * 获取当前有效的 token
   * 每次都从 localStorage 读取，确保使用最新的 token
   */
  private getToken(): string | null {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('access_token');
    }
    return this.token;
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {},
  ): Promise<T | null> {
    const url = `${this.baseURL}${endpoint}`;
    const headers: Record<string, string> = {
      ...(options.headers as Record<string, string>),
    };

    // 如果不是 FormData，设置 JSON Content-Type
    if (!(options.body instanceof FormData)) {
      headers['Content-Type'] = 'application/json';
    }

    // 每次请求时重新获取 token，确保使用最新值
    const currentToken = this.getToken();
    if (currentToken) {
      headers['Authorization'] = `Bearer ${currentToken}`;
    }

    // 开发环境添加详细日志
    if (process.env.NODE_ENV === 'development') {
      console.log('🔵 API请求:', {
        method: options.method || 'GET',
        url,
        baseURL: this.baseURL,
        endpoint,
        hasToken: !!currentToken,
        tokenPreview: currentToken ? `${currentToken.substring(0, 20)}...` : null,
      });
    }

    try {
      const response = await fetch(url, {
        ...options,
        headers,
        credentials: 'include',
      });

      // 开发环境记录响应
      if (process.env.NODE_ENV === 'development') {
        console.log('🟢 API响应:', {
          status: response.status,
          statusText: response.statusText,
          url: response.url,
          ok: response.ok,
        });
      }

      // 处理401未授权错误
      if (response.status === 401) {
        // 清除token
        this.clearToken();
        // 如果在浏览器环境，重定向到登录页
        if (typeof window !== 'undefined') {
          const currentPath = window.location.pathname;
          // 只有在受保护的路径下才自动重定向到登录页
          const isProtectedPath = currentPath.startsWith('/app') || currentPath.startsWith('/admin');
          
          if (isProtectedPath) {
            // 如果是访问 admin 路由，跳到管理员专用登录页
            if (currentPath.includes('/admin')) {
              window.location.href = `/admin11091?redirect=${encodeURIComponent(currentPath)}`;
            } else {
              // 避免重复重定向
              if (!currentPath.includes('/auth/') && !currentPath.includes('/login')) {
                window.location.href = `/auth/login?redirect=${encodeURIComponent(currentPath)}`;
              }
            }
          }
        }
        throw new Error('未授权，请重新登录');
      }

      // 处理 503 / 502 during restart — don't throw, return null to let caller retry
      if (response.status === 502 || response.status === 503) {
        console.warn('⚠️ Backend temporarily unavailable (restart in progress?):', response.status);
        return null;
      }

      // 处理402需要支付错误 (X402 V2)
      if (response.status === 402) {
        const authHeader = response.headers.get('WWW-Authenticate');
        // 触发全局事件或抛出特定错误供上层捕获
        // 这里我们抛出一个带有元数据的错误
        const error: any = new Error('Payment Required');
        error.status = 402;
        error.paymentParams = authHeader;
        throw error;
      }

      if (!response.ok) {
        const errorText = await response.text();
        let error;
        try {
          error = JSON.parse(errorText);
        } catch {
          error = { message: errorText || response.statusText };
        }
        
        const errorMessage = error.message || error.error || `HTTP ${response.status}: ${response.statusText}`;
        
        if (process.env.NODE_ENV === 'development') {
          console.error('🔴 API错误响应:', {
            status: response.status,
            statusText: response.statusText,
            body: errorText,
            parsed: error,
          });
        }
        
        throw new Error(errorMessage);
      }

      // 处理空响应（204 No Content 或空响应体）
      // 先检查响应状态
      if (response.status === 204) {
        // No Content，返回 null
        return null;
      }
      
      // 先读取为文本（只能读取一次）
      let text: string;
      try {
        text = await response.text();
      } catch (e) {
        console.warn('Failed to read response text:', e);
        return null;
      }
      
      // 如果响应体为空，返回 null
      if (!text || text.trim() === '') {
        return null;
      }
      
      // 检查 Content-Type
      const contentType = response.headers.get('content-type');
      if (contentType && !contentType.includes('application/json')) {
        // 如果不是 JSON 响应，返回 null
        console.warn('Response is not JSON. Content-Type:', contentType);
        return null;
      }
      
      // 尝试解析 JSON
      let data;
      try {
        data = JSON.parse(text);
      } catch (e) {
        // JSON 解析失败，返回 null
        console.warn('Failed to parse JSON response. Status:', response.status, 'Content-Type:', contentType, 'Text length:', text.length, 'Text preview:', text.substring(0, 100));
        return null;
      }
      
      if (process.env.NODE_ENV === 'development') {
        console.log('✅ API成功响应:', data);
      }
      
      return data;
    } catch (error: any) {
      // 网络错误特殊处理
      if (error.name === 'TypeError' && error.message.includes('fetch')) {
        const networkError = new Error(
          `无法连接到服务器。请确认后端服务已启动（${this.baseURL.replace(/\/api$/, '')}）`
        );
        networkError.name = 'NetworkError';
        throw networkError;
      }
      
      if (process.env.NODE_ENV === 'development') {
        console.error('🔴 API请求异常:', {
          url,
          method: options.method || 'GET',
          error: error.message,
          stack: error.stack,
          name: error.name,
        });
      }
      
      throw error;
    }
  }

  async get<T>(endpoint: string, options?: { params?: Record<string, any> }): Promise<T | null> {
    let url = endpoint;
    if (options?.params) {
      const searchParams = new URLSearchParams();
      Object.entries(options.params).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          if (Array.isArray(value)) {
            value.forEach(v => {
              if (v !== undefined && v !== null) {
                searchParams.append(key, String(v));
              }
            });
          } else {
            searchParams.append(key, String(value));
          }
        }
      });
      const queryString = searchParams.toString();
      if (queryString) {
        url += (endpoint.includes('?') ? '&' : '?') + queryString;
      }
    }
    return this.request<T>(url, { method: 'GET' });
  }

  async post<T>(endpoint: string, data?: any, options?: RequestInit): Promise<T | null> {
    const body = data instanceof FormData ? data : JSON.stringify(data);
    return this.request<T>(endpoint, {
      method: 'POST',
      body,
      ...options,
    });
  }

  async put<T>(endpoint: string, data?: any): Promise<T | null> {
    return this.request<T>(endpoint, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async patch<T>(endpoint: string, data?: any): Promise<T | null> {
    return this.request<T>(endpoint, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  async delete<T>(endpoint: string): Promise<T | null> {
    return this.request<T>(endpoint, { method: 'DELETE' });
  }
}

export const apiClient = new ApiClient(API_BASE_URL);

