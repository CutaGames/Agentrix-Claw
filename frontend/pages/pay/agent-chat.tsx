import Head from 'next/head'
import { useRouter } from 'next/router'
import { useEffect, useState } from 'react'
import { SmartCheckout } from '../../components/payment/SmartCheckout'

// 禁用静态生成，使用动态渲染
export const getServerSideProps = async () => {
  return {
    props: {},
  }
}

interface Message {
  id: string
  type: 'user' | 'agent'
  content: string
  timestamp: Date
  showPayment?: boolean
  paymentAmount?: string
}

export default function AgentChatPayment() {
  const router = useRouter()
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [isTyping, setIsTyping] = useState(false)
  const [showCheckout, setShowCheckout] = useState(false)
  const [currentPaymentRequest, setCurrentPaymentRequest] = useState<any>(null)

  useEffect(() => {
    // 初始化对话 - AI生成服务场景
    const initialMessages: Message[] = [
      {
        id: '1',
        type: 'agent',
        content: '你好！我是AI创作助手，可以帮您生成图片、文档等数字内容。需要什么服务？',
        timestamp: new Date(),
      },
    ]
    setMessages(initialMessages)
  }, [])

  const handleSend = async () => {
    if (!input.trim()) return

    const userMessage: Message = {
      id: Date.now().toString(),
      type: 'user',
      content: input,
      timestamp: new Date(),
    }
    setMessages((prev) => [...prev, userMessage])
    setInput('')
    setIsTyping(true)

    // 模拟Agent回复 - AI生成服务场景
    setTimeout(() => {
      let agentResponse: Message
      
      const lowerInput = input.toLowerCase()
      
      if (lowerInput.includes('图片') || lowerInput.includes('生成') || lowerInput.includes('画')) {
        agentResponse = {
          id: (Date.now() + 1).toString(),
          type: 'agent',
          content: '我可以为您生成高质量图片！\n\n🎨 AI图片生成服务\n💰 价格: ¥9.9/张\n✨ 特点: 4K分辨率、多种风格、快速生成\n\n需要生成几张？',
          timestamp: new Date(),
          showPayment: true,
          paymentAmount: '¥9.9',
        }
      } else if (lowerInput.includes('文档') || lowerInput.includes('报告') || lowerInput.includes('写作')) {
        agentResponse = {
          id: (Date.now() + 1).toString(),
          type: 'agent',
          content: '我可以为您生成专业文档！\n\n📄 AI文档生成服务\n💰 价格: ¥19.9/份\n✨ 特点: 专业格式、多语言、可定制\n\n需要生成什么类型的文档？',
          timestamp: new Date(),
          showPayment: true,
          paymentAmount: '¥19.9',
        }
      } else if (lowerInput.includes('api') || lowerInput.includes('查询') || lowerInput.includes('数据')) {
        agentResponse = {
          id: (Date.now() + 1).toString(),
          type: 'agent',
          content: '我可以为您调用高级API！\n\n🔌 高级API调用\n💰 价格: ¥2.5/次\n✨ 特点: 实时数据、高准确率、快速响应\n\n需要查询什么数据？',
          timestamp: new Date(),
          showPayment: true,
          paymentAmount: '¥2.5',
        }
      } else if (lowerInput.includes('支付') || lowerInput.includes('购买') || lowerInput.includes('续费')) {
        agentResponse = {
          id: (Date.now() + 1).toString(),
          type: 'agent',
          content: '我可以为您提供以下付费服务：\n\n1. 🎨 AI图片生成 - ¥9.9/张\n2. 📄 AI文档生成 - ¥19.9/份\n3. 🔌 高级API调用 - ¥2.5/次\n4. 💎 会员订阅 - ¥99/月（无限使用）\n\n请告诉我您需要什么服务？',
          timestamp: new Date(),
        }
      } else {
        agentResponse = {
          id: (Date.now() + 1).toString(),
          type: 'agent',
          content: '我理解您的需求。我可以帮您：\n1. 🎨 生成AI图片（¥9.9/张）\n2. 📄 生成专业文档（¥19.9/份）\n3. 🔌 调用高级API（¥2.5/次）\n4. 完成一键支付\n\n请告诉我您想要什么服务？',
          timestamp: new Date(),
        }
      }

      setMessages((prev) => [...prev, agentResponse])
      setIsTyping(false)
    }, 1500)
  }

  const handlePayment = (amount: string, serviceType?: string) => {
    const serviceMap: { [key: string]: string } = {
      '¥9.9': 'AI图片生成服务',
      '¥19.9': 'AI文档生成服务',
      '¥2.5': '高级API调用服务',
    }
    
    const paymentRequest = {
      id: 'pay_chat_' + Date.now(),
      amount: parseFloat(amount.replace('¥', '')),
      currency: 'CNY',
      description: serviceType || serviceMap[amount] || 'AI生成服务',
      merchant: 'AI创作平台',
      agent: 'AI创作助手',
      metadata: {
        paymentType: 'agent-chat',
        source: 'chat',
        isOnChain: true,
        serviceType: serviceType || serviceMap[amount] || 'ai-service',
      },
      createdAt: new Date().toISOString()
    }
    setCurrentPaymentRequest(paymentRequest)
    setShowCheckout(true)
  }

  const handlePaymentSuccess = (result: any) => {
    // Payment successful logic
    setShowCheckout(false)
    setCurrentPaymentRequest(null)
    // 可以添加成功消息到聊天
  }

  const handlePaymentCancel = () => {
    setShowCheckout(false)
    setCurrentPaymentRequest(null)
  }

  return (
    <>
      <Head>
        <title>Agent对话框支付演示 - Agentrix</title>
      </Head>
      <div className="min-h-screen bg-gradient-to-br from-indigo-50 to-purple-50 flex flex-col">
        <div className="max-w-4xl mx-auto w-full flex flex-col h-screen">
          {/* Header */}
          <div className="bg-white border-b border-gray-200 px-6 py-4">
            <div className="flex items-center space-x-4">
              <div className="text-3xl">🤖</div>
              <div>
                <h1 className="text-xl font-bold text-gray-900">AI创作助手</h1>
                <p className="text-sm text-gray-600">生成图片/文档 · 对话框内支付</p>
              </div>
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
            {messages.map((message) => (
              <div
                key={message.id}
                className={`flex ${message.type === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-xs lg:max-w-md px-4 py-3 rounded-2xl ${
                    message.type === 'user'
                      ? 'bg-blue-500 text-white rounded-tr-none'
                      : 'bg-white text-gray-900 border border-gray-200 rounded-tl-none'
                  }`}
                >
                  <div className="whitespace-pre-line">{message.content}</div>
                  {message.showPayment && (
                    <div className="mt-4 pt-4 border-t border-gray-200">
                      <div className="bg-blue-50 rounded-lg p-3 mb-3">
                        <p className="text-xs text-blue-700">
                          💡 使用X402协议，小额支付无需每次签名
                        </p>
                      </div>
                      <button
                        onClick={() => handlePayment(message.paymentAmount || '¥9.9')}
                        className="w-full bg-green-500 text-white py-2 px-4 rounded-lg font-semibold hover:bg-green-600 transition-colors"
                      >
                        💳 立即支付 {message.paymentAmount}
                      </button>
                    </div>
                  )}
                  <div className={`text-xs mt-2 ${message.type === 'user' ? 'text-blue-100' : 'text-gray-500'}`}>
                    {message.timestamp.toLocaleTimeString()}
                  </div>
                </div>
              </div>
            ))}

            {isTyping && (
              <div className="flex justify-start">
                <div className="bg-white border border-gray-200 rounded-2xl rounded-tl-none px-4 py-3">
                  <div className="flex space-x-1">
                    <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"></div>
                    <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
                    <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Input */}
          <div className="bg-white border-t border-gray-200 px-6 py-4">
            <div className="flex space-x-4">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && handleSend()}
                placeholder="输入消息..."
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button
                onClick={handleSend}
                disabled={!input.trim() || isTyping}
                className="bg-blue-600 text-white px-6 py-2 rounded-lg font-semibold hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                发送
              </button>
            </div>
            <div className="mt-2 text-center">
              <p className="text-xs text-gray-500">
                💡 提示: 输入 &quot;生成图片&quot;、&quot;生成文档&quot; 或 &quot;API查询&quot;，AI助手会提供付费服务选项
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* V7.0 Smart Checkout Modal */}
      {showCheckout && currentPaymentRequest && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="relative">
            <button
              onClick={handlePaymentCancel}
              className="absolute -top-12 right-0 text-white hover:text-gray-300 text-2xl"
            >
              ×
            </button>
            <SmartCheckout
              order={{
                id: currentPaymentRequest.id,
                amount: currentPaymentRequest.amount,
                currency: currentPaymentRequest.currency || 'CNY',
                description: currentPaymentRequest.description,
                merchantId: currentPaymentRequest.merchant,
              }}
              onSuccess={handlePaymentSuccess}
              onCancel={handlePaymentCancel}
            />
          </div>
        </div>
      )}
    </>
  )
}

