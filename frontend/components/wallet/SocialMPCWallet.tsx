/**
 * SocialMPCWallet - 社交登录自动生成 MPC 钱包组件
 * 
 * 实现"社交登录 -> 自动生成 MPC 分片"的闭环
 * 让没有 Web3 背景的用户完全无感使用
 * 
 * 流程:
 * 1. 用户通过 Google/Twitter/Apple 登录
 * 2. 自动检测是否有 MPC 钱包
 * 3. 如果没有，后台静默生成 MPC 分片
 * 4. 钱包地址自动关联用户账户
 * 5. 用户可以直接使用，无需了解私钥/助记词
 */

import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

// MPC 钱包状态
export type MPCWalletStatus = 
  | 'checking'       // 检查中
  | 'creating'       // 创建中
  | 'ready'          // 就绪
  | 'error'          // 错误
  | 'recovery_needed' // 需要恢复

// MPC 钱包信息
export interface MPCWalletInfo {
  address: string
  status: MPCWalletStatus
  createdAt?: Date
  lastUsed?: Date
  balance?: {
    usdc: number
    eth: number
  }
}

interface SocialMPCWalletProps {
  userId: string
  socialProvider: 'google' | 'twitter' | 'apple' | 'wallet'
  socialToken?: string
  onWalletReady?: (wallet: MPCWalletInfo) => void
  onError?: (error: Error) => void
  autoCreate?: boolean // 是否自动创建钱包
  showStatus?: boolean // 是否显示状态 UI
}

/**
 * 社交登录 MPC 钱包组件
 */
export function SocialMPCWallet({
  userId,
  socialProvider,
  socialToken,
  onWalletReady,
  onError,
  autoCreate = true,
  showStatus = true,
}: SocialMPCWalletProps) {
  const [status, setStatus] = useState<MPCWalletStatus>('checking')
  const [wallet, setWallet] = useState<MPCWalletInfo | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [progress, setProgress] = useState(0)

  // 检查并创建钱包
  const initWallet = useCallback(async () => {
    try {
      setStatus('checking')
      setError(null)
      setProgress(10)

      // 1. 检查是否已有钱包
      const existingWallet = await checkExistingWallet(userId)
      
      if (existingWallet) {
        setProgress(100)
        setWallet(existingWallet)
        setStatus('ready')
        onWalletReady?.(existingWallet)
        return
      }

      // 2. 没有钱包，检查是否需要自动创建
      if (!autoCreate) {
        setStatus('recovery_needed')
        return
      }

      // 3. 自动创建 MPC 钱包
      setStatus('creating')
      setProgress(30)

      // 生成派生种子（基于社交账户）
      const derivedSeed = await deriveSeedFromSocial(socialProvider, socialToken || userId)
      setProgress(50)

      // 创建 MPC 分片
      const newWallet = await createMPCWallet(userId, derivedSeed)
      setProgress(80)

      // 关联到用户账户
      await linkWalletToUser(userId, newWallet.address)
      setProgress(100)

      setWallet(newWallet)
      setStatus('ready')
      onWalletReady?.(newWallet)

    } catch (err: any) {
      console.error('MPC wallet init error:', err)
      setError(err.message || '钱包初始化失败')
      setStatus('error')
      onError?.(err)
    }
  }, [userId, socialProvider, socialToken, autoCreate, onWalletReady, onError])

  useEffect(() => {
    initWallet()
  }, [initWallet])

  // 不显示 UI
  if (!showStatus) {
    return null
  }

  return (
    <AnimatePresence mode="wait">
      {status === 'checking' && (
        <motion.div
          key="checking"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="flex items-center gap-2 text-gray-500 text-sm"
        >
          <span className="w-4 h-4 border-2 border-gray-300 border-t-indigo-500 rounded-full animate-spin" />
          <span>检查钱包...</span>
        </motion.div>
      )}

      {status === 'creating' && (
        <motion.div
          key="creating"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="bg-indigo-50 rounded-xl p-4"
        >
          <div className="flex items-center gap-3 mb-2">
            <span className="text-2xl">🔐</span>
            <div>
              <p className="font-medium text-indigo-900">正在为您创建安全钱包</p>
              <p className="text-sm text-indigo-600">使用 MPC 技术，无需记住私钥</p>
            </div>
          </div>
          <div className="bg-indigo-100 rounded-full h-2 overflow-hidden">
            <motion.div
              className="h-full bg-indigo-500"
              initial={{ width: 0 }}
              animate={{ width: `${progress}%` }}
              transition={{ duration: 0.3 }}
            />
          </div>
        </motion.div>
      )}

      {status === 'ready' && wallet && (
        <motion.div
          key="ready"
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="bg-green-50 rounded-xl p-4"
        >
          <div className="flex items-center gap-3">
            <span className="text-2xl">✅</span>
            <div className="flex-1">
              <p className="font-medium text-green-900">钱包已就绪</p>
              <p className="text-sm text-green-600 font-mono">
                {formatAddress(wallet.address)}
              </p>
            </div>
            {wallet.balance && (
              <div className="text-right">
                <p className="font-semibold text-green-900">
                  {wallet.balance.usdc.toFixed(2)} USDC
                </p>
                <p className="text-xs text-green-600">
                  {wallet.balance.eth.toFixed(4)} ETH
                </p>
              </div>
            )}
          </div>
        </motion.div>
      )}

      {status === 'error' && (
        <motion.div
          key="error"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="bg-red-50 rounded-xl p-4"
        >
          <div className="flex items-center gap-3">
            <span className="text-2xl">❌</span>
            <div className="flex-1">
              <p className="font-medium text-red-900">钱包初始化失败</p>
              <p className="text-sm text-red-600">{error}</p>
            </div>
            <button
              onClick={initWallet}
              className="px-3 py-1 bg-red-100 text-red-700 rounded-lg text-sm hover:bg-red-200"
            >
              重试
            </button>
          </div>
        </motion.div>
      )}

      {status === 'recovery_needed' && (
        <motion.div
          key="recovery"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="bg-amber-50 rounded-xl p-4"
        >
          <div className="flex items-center gap-3">
            <span className="text-2xl">🔑</span>
            <div className="flex-1">
              <p className="font-medium text-amber-900">需要恢复钱包</p>
              <p className="text-sm text-amber-600">请使用备份的恢复密钥</p>
            </div>
            <button
              onClick={() => setStatus('creating')}
              className="px-3 py-1 bg-amber-100 text-amber-700 rounded-lg text-sm hover:bg-amber-200"
            >
              创建新钱包
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

// ============ API 函数 ============

async function checkExistingWallet(userId: string): Promise<MPCWalletInfo | null> {
  try {
    const response = await fetch(`/api/wallet/mpc/${userId}`)
    if (response.ok) {
      const data = await response.json()
      return data.wallet ? {
        address: data.wallet.address,
        status: 'ready',
        createdAt: new Date(data.wallet.createdAt),
        balance: data.balance,
      } : null
    }
    return null
  } catch {
    return null
  }
}

async function deriveSeedFromSocial(
  provider: string,
  token: string,
): Promise<string> {
  // 使用 Web Crypto API 从社交凭证派生确定性种子
  const encoder = new TextEncoder()
  const data = encoder.encode(`${provider}:${token}:mpc-wallet-v1`)
  
  const hashBuffer = await crypto.subtle.digest('SHA-256', data as unknown as ArrayBuffer)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
}

async function createMPCWallet(
  userId: string,
  derivedSeed: string,
): Promise<MPCWalletInfo> {
  const response = await fetch('/api/wallet/mpc/create', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      userId,
      seed: derivedSeed,
      autoBackup: true, // 自动备份到云端
    }),
  })

  if (!response.ok) {
    throw new Error('创建钱包失败')
  }

  const data = await response.json()
  return {
    address: data.address,
    status: 'ready',
    createdAt: new Date(),
    balance: { usdc: 0, eth: 0 },
  }
}

async function linkWalletToUser(userId: string, address: string): Promise<void> {
  await fetch('/api/wallet/mpc/link', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId, address }),
  })
}

function formatAddress(address: string): string {
  if (!address) return ''
  return `${address.slice(0, 6)}...${address.slice(-4)}`
}

// ============ Hook 版本 ============

/**
 * 社交登录 MPC 钱包 Hook
 * 用于需要更多控制的场景
 */
export function useSocialMPCWallet(
  userId: string,
  socialProvider: 'google' | 'twitter' | 'apple' | 'wallet',
) {
  const [wallet, setWallet] = useState<MPCWalletInfo | null>(null)
  const [status, setStatus] = useState<MPCWalletStatus>('checking')
  const [error, setError] = useState<string | null>(null)

  const init = useCallback(async () => {
    try {
      setStatus('checking')
      
      const existing = await checkExistingWallet(userId)
      if (existing) {
        setWallet(existing)
        setStatus('ready')
        return
      }

      setStatus('creating')
      const seed = await deriveSeedFromSocial(socialProvider, userId)
      const newWallet = await createMPCWallet(userId, seed)
      await linkWalletToUser(userId, newWallet.address)
      
      setWallet(newWallet)
      setStatus('ready')
    } catch (err: any) {
      setError(err.message)
      setStatus('error')
    }
  }, [userId, socialProvider])

  useEffect(() => {
    init()
  }, [init])

  return {
    wallet,
    status,
    error,
    retry: init,
    isReady: status === 'ready',
    isLoading: status === 'checking' || status === 'creating',
  }
}

export default SocialMPCWallet
