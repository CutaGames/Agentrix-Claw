// 认证相关的工具函数

export interface User {
  id: string
  email?: string
  walletAddress?: string
  role: 'user' | 'agent' | 'merchant'
}

export function isAuthenticated(): boolean {
  // TODO: 实现认证检查逻辑
  return false
}

export function getCurrentUser(): User | null {
  // TODO: 实现获取当前用户逻辑
  return null
}
