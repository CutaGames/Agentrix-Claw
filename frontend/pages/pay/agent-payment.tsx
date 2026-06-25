import Head from 'next/head'
import { useRouter } from 'next/router'
import { useEffect, useState } from 'react'
import { usePayment } from '../../contexts/PaymentContext'

export default function AgentPayment() {
  const router = useRouter()
  const { startPayment } = usePayment()
  const [agentInfo, setAgentInfo] = useState<any>(null)
  const [paymentRequest, setPaymentRequest] = useState<any>(null)

  useEffect(() => {
    // 多Agent协作支付场景
    const mockAgents = [
      { id: 'agent_001', name: 'AI数据分析助手', cost: '¥2.5' },
      { id: 'agent_002', name: 'AI图片生成助手', cost: '¥9.9' },
      { id: 'agent_003', name: 'AI文档生成助手', cost: '¥19.9' },
    ]
    
    const totalAmount = mockAgents.reduce((sum, agent) => {
      return sum + parseFloat(agent.cost.replace('¥', ''))
    }, 0)

    setAgentInfo({
      agents: mockAgents,
      totalAmount: `¥${totalAmount.toFixed(2)}`,
    })

    const mockPaymentRequest = {
      id: 'pay_multi_agent_' + Date.now(),
      amount: `¥${totalAmount.toFixed(2)}`,
      currency: 'CNY',
      description: '多Agent协作服务 - 批量结算',
      merchant: 'AI服务平台',
      agents: mockAgents,
      metadata: {
        paymentType: 'multi-agent',
        agentCount: mockAgents.length,
        isBatch: true,
        useX402: true, // 批量结算使用X402
        gasSavings: '40%',
      },
      createdAt: new Date().toISOString()
    }
    setPaymentRequest(mockPaymentRequest)
  }, [])

  const handlePayment = () => {
    if (paymentRequest) {
      startPayment(paymentRequest)
    }
  }

  return (
    <>
      <Head>
        <title>Agent代付演示 - Agentrix</title>
      </Head>
      <div className="min-h-screen bg-gradient-to-br from-green-50 to-blue-50 py-8">
        <div className="max-w-2xl mx-auto px-4">
          <div className="text-center mb-8">
            <div className="text-5xl mb-4">👥</div>
            <h1 className="text-3xl font-bold text-gray-900 mb-2">多Agent协作支付</h1>
            <p className="text-gray-600">一次确认，批量结算多个Agent服务费用</p>
          </div>

          <div className="bg-white rounded-2xl shadow-lg border border-gray-200 p-6 mb-6">
            <div className="mb-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">参与协作的Agent</h3>
              <div className="space-y-3">
                {agentInfo?.agents?.map((agent: any, idx: number) => (
                  <div key={agent.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                    <div className="flex items-center space-x-3">
                      <div className="text-2xl">🤖</div>
                      <div>
                        <div className="font-semibold text-gray-900">{agent.name}</div>
                        <div className="text-xs text-gray-500">服务费用</div>
                      </div>
                    </div>
                    <div className="font-semibold text-gray-900">{agent.cost}</div>
                  </div>
                ))}
              </div>
            </div>

            <div className="mb-6 pt-6 border-t border-gray-200">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">结算信息</h3>
              <div className="space-y-3">
                <div className="flex justify-between py-2 border-b border-gray-200">
                  <span className="text-gray-600">Agent数量</span>
                  <span className="text-gray-900">{agentInfo?.agents?.length} 个</span>
                </div>
                <div className="flex justify-between py-2 border-b border-gray-200">
                  <span className="text-gray-600">商户</span>
                  <span className="text-gray-900">{paymentRequest?.merchant}</span>
                </div>
                <div className="flex justify-between py-2">
                  <span className="text-lg font-semibold text-gray-900">总计</span>
                  <span className="text-2xl font-bold text-gray-900">{agentInfo?.totalAmount}</span>
                </div>
              </div>
            </div>

            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
              <h3 className="font-semibold text-blue-900 mb-2">批量结算流程</h3>
              <div className="space-y-2 text-sm text-blue-700">
                <div className="flex items-start space-x-2">
                  <span>1️⃣</span>
                  <span>多个Agent同时提供服务</span>
                </div>
                <div className="flex items-start space-x-2">
                  <span>2️⃣</span>
                  <span>系统自动汇总所有费用</span>
                </div>
                <div className="flex items-start space-x-2">
                  <span>3️⃣</span>
                  <span>使用X402协议批量结算，一次确认完成</span>
                </div>
                <div className="flex items-start space-x-2">
                  <span>4️⃣</span>
                  <span>Gas费用降低40%，快速到账</span>
                </div>
              </div>
            </div>

            <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-6">
              <h3 className="font-semibold text-green-900 mb-2">批量结算优势</h3>
              <div className="space-y-2 text-sm text-green-700">
                <div className="flex items-center space-x-2">
                  <span>✓</span>
                  <span>一次确认，批量结算多个Agent费用</span>
                </div>
                <div className="flex items-center space-x-2">
                  <span>✓</span>
                  <span>Gas费用降低40%，大幅节省成本</span>
                </div>
                <div className="flex items-center space-x-2">
                  <span>✓</span>
                  <span>智能路由优化，自动选择最优支付方式</span>
                </div>
              </div>
            </div>

            <button
              onClick={handlePayment}
              className="w-full bg-indigo-600 text-white py-4 rounded-lg font-semibold text-lg hover:bg-indigo-700 transition-colors"
            >
              👥 确认批量结算 {agentInfo?.totalAmount}
            </button>

            <div className="mt-4 text-center">
              <p className="text-sm text-gray-500">
                💡 提示: 使用X402协议批量结算，Gas费用降低40%，3-5秒确认
              </p>
            </div>
          </div>

          <div className="bg-white rounded-2xl shadow-lg border border-gray-200 p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">多Agent协作优势</h3>
            <div className="grid md:grid-cols-3 gap-4">
              <div className="text-center">
                <div className="text-3xl mb-2">⚡</div>
                <div className="font-semibold text-gray-900">批量结算</div>
                <div className="text-sm text-gray-600">一次确认，批量处理</div>
              </div>
              <div className="text-center">
                <div className="text-3xl mb-2">💰</div>
                <div className="font-semibold text-gray-900">降低成本</div>
                <div className="text-sm text-gray-600">Gas费用降低40%</div>
              </div>
              <div className="text-center">
                <div className="text-3xl mb-2">🚀</div>
                <div className="font-semibold text-gray-900">快速到账</div>
                <div className="text-sm text-gray-600">3-5秒确认</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}

