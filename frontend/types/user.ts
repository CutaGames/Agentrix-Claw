export type UserRole = 'user' | 'merchant' | 'agent' | 'developer'

export type KYCLevel = 'none' | 'basic' | 'verified'

export interface User {
  id: string
  agentrixId: string
  role: UserRole
  roles: UserRole[]
  email?: string
  walletAddress?: string
  nickname?: string
  bio?: string
  avatarUrl?: string
  kycLevel: KYCLevel
  kycStatus: 'pending' | 'approved' | 'rejected' | 'none'
  createdAt: string
}

export interface KYCInfo {
  level: KYCLevel
  status: 'pending' | 'approved' | 'rejected' | 'none'
  provider?: string
  verifiedAt?: string
  documents?: any[]
}
