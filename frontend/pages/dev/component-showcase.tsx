import Head from 'next/head'
import { useState } from 'react'
import { PaymentErrorHandling } from '../../components/payment/PaymentErrorHandling'
import { usePayment } from '../../contexts/PaymentContext'

export default function ComponentShowcase() {
  const { startPayment } = usePayment()
  const [activeTab, setActiveTab] = useState('payment')
  const [errorType, setErrorType] = useState<any>('insufficient_balance')

  const mockPaymentRequest = {
    id: 'demo_payment',
    amount: '¥7,999',
    currency: 'CNY',
    description: '演示支付项目',
    merchant: '演示商户',
    createdAt: new Date().toISOString()
  }

  const components = {
    payment: {
      name: '支付模态框',
      description: '完整的支付流程界面',
      action: () => startPayment(mockPaymentRequest)
    },
    error: {
      name: '错误处理',
      description: '各种支付错误状态',
      action: () => {}
    },
    wallet: {
      name: '钱包连接',
      description: 'Web3钱包连接流程',
      action: () => {}
    }
  }

  return (
    <>
      <Head>
        <title>组件展示 - Agentrix</title>
      </Head>
      <div className="min-h-screen bg-gray-50 py-8">
        <div className="max-w-6xl mx-auto px-4">
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold text-gray-900 mb-2">Agentrix 组件展示</h1>
            <p className="text-gray-600">前端组件和交互演示</p>
          </div>

          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 mb-8">
            <div className="flex space-x-4">
              {Object.entries(components).map(([key, component]) => (
                <button
                  key={key}
                  onClick={() => setActiveTab(key)}
                  className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                    activeTab === key
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  {component.name}
                </button>
              ))}
            </div>
          </div>

          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8">
            {activeTab === 'payment' && (
              <div className="text-center">
                <h2 className="text-2xl font-bold text-gray-900 mb-4">支付模态框演示</h2>
                <p className="text-gray-600 mb-6">点击按钮打开支付流程</p>
                <button
                  onClick={components.payment.action}
                  className="bg-blue-600 text-white px-6 py-3 rounded-lg font-semibold hover:bg-blue-700 transition-colors"
                >
                  开始支付演示
                </button>
              </div>
            )}

            {activeTab === 'error' && (
              <div className="space-y-8">
                <div className="text-center mb-6">
                  <h2 className="text-2xl font-bold text-gray-900 mb-4">错误状态演示</h2>
                  <p className="text-gray-600">选择不同的错误类型查看效果</p>
                </div>

                <div className="flex justify-center space-x-4 mb-8 flex-wrap gap-2">
                  {[
                    'insufficient_balance',
                    'network_error', 
                    'user_rejected',
                    'timeout',
                    'unknown'
                  ].map((type) => (
                    <button
                      key={type}
                      onClick={() => setErrorType(type)}
                      className={`px-4 py-2 rounded-lg font-medium text-sm transition-colors ${
                        errorType === type
                          ? 'bg-red-600 text-white'
                          : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                      }`}
                    >
                      {type.replace('_', ' ')}
                    </button>
                  ))}
                </div>

                <PaymentErrorHandling
                  errorType={errorType}
                  onRetry={() => { /* Retry payment */ }}
                  onCancel={() => { /* Cancel payment */ }}
                />
              </div>
            )}

            {activeTab === 'wallet' && (
              <div className="text-center">
                <h2 className="text-2xl font-bold text-gray-900 mb-4">钱包连接演示</h2>
                <p className="text-gray-600 mb-6">钱包连接功能在登录模态框中演示</p>
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 max-w-md mx-auto">
                  <p className="text-yellow-800">
                    请点击页面右上角的 &quot;登录&quot; 按钮体验钱包连接功能
                  </p>
                </div>
              </div>
            )}
          </div>

          <div className="mt-8 bg-blue-50 border border-blue-200 rounded-lg p-6">
            <h3 className="text-lg font-semibold text-blue-900 mb-2">开发说明</h3>
            <ul className="text-blue-700 space-y-2 text-sm">
              <li>• 所有组件使用模拟数据，不依赖后端API</li>
              <li>• 支付流程包含完整的交互状态</li>
              <li>• 错误处理覆盖各种边界情况</li>
              <li>• 组件设计遵循Agentrix设计规范</li>
            </ul>
          </div>
        </div>
      </div>
    </>
  )
}
