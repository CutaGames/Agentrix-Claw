"use client"
import { useWeb3 } from '../../contexts/Web3Context'
import { useToast } from '../../contexts/ToastContext'

export function WalletConnect() {
  const { connectors, connect } = useWeb3()
  const toast = useToast()

  const handleClick = async (id: string) => {
    try {
      await connect(id as any)
      toast.success('钱包连接成功')
    } catch (err: any) {
      console.error('钱包连接出错:', err)
      toast.error(err?.message || '连接钱包失败')
    }
  }

  return (
    <div className="space-y-3">
      {connectors.map((connector) => (
        <button
          key={connector.id}
          onClick={() => handleClick(connector.id)}
          disabled={!connector.isInstalled && connector.id !== 'walletconnect'}
          className="w-full flex items-center p-4 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors text-left disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <span className="text-2xl mr-4">{connector.icon}</span>
          <div>
            <div className="font-semibold text-gray-900">{connector.name}</div>
            <div className="text-sm text-gray-500">
              {connector.description}
              {!connector.isInstalled && connector.id !== 'walletconnect' && ' (未安装)'}
            </div>
          </div>
        </button>
      ))}

      <div className="text-xs text-gray-500 text-center mt-4">
        连接钱包即代表您已阅读并同意我们的服务条款
      </div>
    </div>
  )
}
