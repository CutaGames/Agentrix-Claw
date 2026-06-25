'use client'
import { useState } from 'react'
import { useWeb3 } from '../../contexts/Web3Context'
import { useLocalization } from '../../contexts/LocalizationContext'

interface WalletConnectModalProps {
  onClose: () => void
  onConnected: () => void
}

export function WalletConnectModal({ onClose, onConnected }: WalletConnectModalProps) {
  const { t } = useLocalization()
  const { connect, connectors } = useWeb3()
  const [isConnecting, setIsConnecting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleConnect = async (walletType: string) => {
    setIsConnecting(true)
    setError(null)

    try {
      await connect(walletType as any)
      onConnected()
    } catch (err: any) {
      setError(err.message || t({ zh: '连接失败，请重试', en: 'Connection failed, please try again' }))
    } finally {
      setIsConnecting(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-slate-900 border border-white/10 rounded-2xl p-6 max-w-md w-full">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-xl font-semibold">{t({ zh: '连接钱包', en: 'Connect Wallet' })}</h3>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white transition-colors"
          >
            ✕
          </button>
        </div>

        <p className="text-slate-300 mb-6">
          {t({
            zh: '该支付方式需要连接数字钱包以完成支付签名',
            en: 'This payment method requires a connected wallet to complete payment signature',
          })}
        </p>

        <div className="space-y-3">
          {connectors.map((connector) => (
            <button
              key={connector.id}
              onClick={() => handleConnect(connector.id)}
              disabled={isConnecting || !connector.isInstalled}
              className={`w-full p-4 rounded-xl border text-left transition-all ${
                connector.isInstalled
                  ? 'border-white/10 bg-white/5 hover:bg-white/10'
                  : 'border-white/5 bg-white/2 opacity-50 cursor-not-allowed'
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <span className="text-2xl">{connector.icon}</span>
                  <div>
                    <p className="font-semibold">{connector.name}</p>
                    <p className="text-sm text-slate-400">{connector.description}</p>
                  </div>
                </div>
                {!connector.isInstalled && (
                  <span className="text-xs text-slate-500">
                    {t({ zh: '未安装', en: 'Not Installed' })}
                  </span>
                )}
              </div>
            </button>
          ))}
        </div>

        {error && (
          <div className="mt-4 p-3 bg-red-500/20 border border-red-500/50 rounded-lg text-red-200 text-sm">
            {error}
          </div>
        )}

        <div className="mt-6 text-xs text-slate-400 space-y-1">
          <p>{t({ zh: '连接步骤：', en: 'Connection steps:' })}</p>
          <ol className="list-decimal list-inside space-y-1 ml-2">
            <li>{t({ zh: '点击钱包图标', en: 'Click wallet icon' })}</li>
            <li>{t({ zh: '在钱包App中确认连接', en: 'Confirm connection in wallet app' })}</li>
            <li>{t({ zh: '授权Agentrix访问钱包', en: 'Authorize Agentrix to access wallet' })}</li>
          </ol>
        </div>
      </div>
    </div>
  )
}

