/**
 * 插件 API
 */

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api'

export interface Plugin {
  id: string
  name: string
  description: string
  version: string
  author: string
  category: string
  price: number
  isFree: boolean
  downloadCount: number
  rating: number
  icon?: string
  dependencies?: string[]
}

export interface UserPlugin {
  id: string
  pluginId: string
  userId: string
  installedVersion: string
  isActive: boolean
  config?: Record<string, any>
  installedAt: Date
}

class PluginApi {
  private async request<T>(endpoint: string, options?: RequestInit): Promise<T> {
    const token = typeof window !== 'undefined' ? localStorage.getItem('agentrix_token') : null
    
    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(token && { Authorization: `Bearer ${token}` }),
        ...options?.headers,
      },
      credentials: 'include',
    })

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: '请求失败' }))
      throw new Error(error.message || `HTTP ${response.status}`)
    }

    return response.json()
  }

  async getPlugins(params?: { category?: string; search?: string; role?: string }): Promise<Plugin[]> {
    const query = new URLSearchParams()
    if (params?.category) query.append('category', params.category)
    if (params?.search) query.append('search', params.search)
    if (params?.role) query.append('role', params.role)
    
    return this.request<Plugin[]>(`/plugins?${query.toString()}`)
  }

  async getPlugin(pluginId: string): Promise<Plugin> {
    return this.request<Plugin>(`/plugins/${pluginId}`)
  }

  async installPlugin(pluginId: string, config?: Record<string, any>): Promise<UserPlugin> {
    return this.request<UserPlugin>(`/plugins/${pluginId}/install`, {
      method: 'POST',
      body: JSON.stringify({ config }),
    })
  }

  async uninstallPlugin(pluginId: string): Promise<void> {
    // 后端路由是 DELETE /plugins/:pluginId/install
    return this.request<void>(`/plugins/${pluginId}/install`, {
      method: 'DELETE',
    })
  }

  async getUserPlugins(): Promise<UserPlugin[]> {
    return this.request<UserPlugin[]>('/plugins/user/installed')
  }

  async purchasePlugin(pluginId: string, paymentMethod?: string): Promise<{ success: boolean; userPlugin?: UserPlugin; message: string }> {
    return this.request<{ success: boolean; userPlugin?: UserPlugin; message: string }>(`/plugins/${pluginId}/purchase`, {
      method: 'POST',
      body: JSON.stringify({ paymentMethod }),
    })
  }

  async activatePlugin(pluginId: string): Promise<{ activated: boolean; hooks: number; mcpServers: number; tools: number }> {
    return this.request<{ activated: boolean; hooks: number; mcpServers: number; tools: number }>(`/plugins/${pluginId}/activate`, {
      method: 'POST',
    })
  }

  async deactivatePlugin(pluginId: string): Promise<{ deactivated: boolean }> {
    return this.request<{ deactivated: boolean }>(`/plugins/${pluginId}/deactivate`, {
      method: 'POST',
    })
  }

  async getPluginPermissions(pluginId: string): Promise<{
    requiredPermissions: string[]
    sandboxLevel: string
    securityPolicy: Record<string, any>
  }> {
    return this.request(`/plugins/${pluginId}/permissions`)
  }
}

export const pluginApi = new PluginApi()

