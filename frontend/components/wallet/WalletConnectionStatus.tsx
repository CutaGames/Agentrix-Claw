import { useState, useEffect } from 'react'
import { useWeb3 } from '../../contexts/Web3Context'
import { useToast } from '../../contexts/ToastContext'

interface WalletConnectionStatusProps {
  onConnect?: () => void
  onDisconnect?: () => void
}

export function WalletConnectionStatus({ onConnect, onDisconnect }: WalletConnectionStatusProps) {
  const { isConnected, address, connectedWallets, connect, disconnect } = useWeb3()
  const toast = useToast()
  const [isConnecting, setIsConnecting] = useState(false)
  const [connectionError, setConnectionError] = useState<string | null>(null)

  const handleConnect = async (walletType: string) => {
    setIsConnecting(true)
    setConnectionError(null)
    
    try {
      await connect(walletType as any)
      toast.success('钱包连接成功！')
      onConnect?.()
    } catch (error: any) {
      const errorMessage = error.message || '钱包连接失败，请重试'
      setConnectionError(errorMessage)
      toast.error(errorMessage)
    } finally {
      setIsConnecting(false)
    }
  }

  const handleDisconnect = async () => {
    try {
      await disconnect()
      toast.success('钱包已断开连接')
      onDisconnect?.()
    } catch (error: any) {
      toast.error('断开连接失败，请重试')
    }
  }

  if (isConnected && address) {
    return (
      <div className="bg-green-50 border border-green-200 rounded-lg p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-3 h-3 bg-green-500 rounded-full animate-pulse"></div>
            <div>
              <div className="text-sm font-medium text-green-900">钱包已连接</div>
              <div className="text-xs text-green-700 font-mono mt-1">
                {address.slice(0, 6)}...{address.slice(-4)}
              </div>
            </div>
          </div>
          <button
            onClick={handleDisconnect}
            className="px-3 py-1 text-sm text-green-700 hover:text-green-900 hover:bg-green-100 rounded transition-colors"
          >
            断开
          </button>
        </div>
        
        {connectedWallets.length > 1 && (
          <div className="mt-3 pt-3 border-t border-green-200">
            <div className="text-xs text-green-700 mb-2">已连接的钱包 ({connectedWallets.length})</div>
            <div className="space-y-2">
              {connectedWallets.map((wallet) => (
                <div key={wallet.id} className="flex items-center justify-between text-xs">
                  <span className="text-green-700">{wallet.name}</span>
                  <span className="text-green-600 font-mono">
                    {wallet.address?.slice(0, 6)}...{wallet.address?.slice(-4)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {connectionError && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3">
          <div className="flex items-center space-x-2">
            <span className="text-red-600">❌</span>
            <span className="text-sm text-red-700">{connectionError}</span>
          </div>
        </div>
      )}
      
      <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm font-medium text-gray-900">钱包未连接</div>
            <div className="text-xs text-gray-500 mt-1">连接钱包以开始使用</div>
          </div>
          {isConnecting && (
            <div className="flex items-center space-x-2 text-blue-600">
              <svg className="animate-spin h-5 w-5" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              <span className="text-sm">连接中...</span>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

