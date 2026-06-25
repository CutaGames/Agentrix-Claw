import { createContext, useContext, ReactNode, useState } from 'react'
import { PaymentRequest, PaymentMethod, PaymentResult } from '../types/payment'

interface PaymentContextType {
  currentPayment: PaymentRequest | null
  selectedMethod: PaymentMethod | null
  isProcessing: boolean
  startPayment: (request: PaymentRequest) => void
  selectPaymentMethod: (method: PaymentMethod) => void
  processPayment: () => Promise<PaymentResult>
  cancelPayment: () => void
  resetPayment: () => void
}

const PaymentContext = createContext<PaymentContextType | null>(null)

export function PaymentProvider({ children }: { children: ReactNode }) {
  const [currentPayment, setCurrentPayment] = useState<PaymentRequest | null>(null)
  const [selectedMethod, setSelectedMethod] = useState<PaymentMethod | null>(null)
  const [isProcessing, setIsProcessing] = useState(false)

  const startPayment = (request: PaymentRequest) => {
    setCurrentPayment(request)
    setSelectedMethod(null)
  }

  // 绑定到 window 对象，方便在一些难以获取 Context 的地方使用
  if (typeof window !== 'undefined') {
    (window as any).startPayment = startPayment;
  }

  const selectPaymentMethod = (method: PaymentMethod) => {
    setSelectedMethod(method)
  }

  const processPayment = async (): Promise<PaymentResult> => {
    if (!currentPayment || !selectedMethod) {
      return {
        success: false,
        error: '支付信息不完整',
        timestamp: new Date().toISOString()
      }
    }

    setIsProcessing(true)
    try {
      // 调用后端API处理支付
      const { paymentApi } = await import('../lib/api/payment.api')
      
      const amount = parseFloat(
        currentPayment.amount.replace('¥', '').replace(',', '').replace('$', '')
      )

      // 将用户友好的支付方式映射到后端支持的方式
      // 智能路由会在后台自动选择最优的技术实现（X402、直接转账等）
      let backendPaymentMethod: string = selectedMethod.type
      
      // 用户选择法币支付方式，后端会根据智能路由选择最优实现
      const methodType = (selectedMethod as any).type
      if (methodType === 'apple_pay' || methodType === 'google_pay' || methodType === 'stripe') {
        // 法币支付，使用stripe作为后端方法，但保留用户选择的支付方式信息
        backendPaymentMethod = 'stripe'
      } else if (methodType === 'crypto') {
        // 数字货币支付，后端智能路由会自动选择X402或直接转账
        // 不指定具体方法，让智能路由决定
        backendPaymentMethod = undefined as any // 让后端智能路由自动选择
      }

      const paymentData: any = {
        amount,
        currency: currentPayment.currency || 'CNY',
        paymentMethod: backendPaymentMethod,
        description: currentPayment.description,
        merchantId: currentPayment.metadata?.merchantId,
        agentId: currentPayment.agent,
        metadata: {
          ...currentPayment.metadata,
          // 保存用户选择的支付方式，用于前端显示和后续处理
          userSelectedMethod: selectedMethod.type,
          // 如果是法币支付，保存选择的币种
          selectedCurrency: currentPayment.metadata?.selectedCurrency,
          // 让后端智能路由自动判断是否链上
          isOnChain: methodType === 'crypto',
        },
      }

      // 如果是法币支付（Stripe、Apple Pay、Google Pay），需要先创建支付意图
      if (methodType === 'stripe' || methodType === 'apple_pay' || methodType === 'google_pay') {
        const intent = await paymentApi.createIntent({
          amount,
          currency: paymentData.currency,
          paymentMethod: 'stripe',
          description: currentPayment.description,
        })
        paymentData.paymentIntentId = intent.paymentIntentId
        // 保存用户选择的支付方式到metadata
        paymentData.metadata.fiatPaymentMethod = selectedMethod.type
      }

      const result = await paymentApi.process(paymentData)

      return {
        success: result.status === 'completed' || result.status === 'processing',
        transactionHash: result.transactionHash,
        timestamp: result.createdAt,
      }
    } catch (error: any) {
      console.error('支付处理失败:', error)
      return {
        success: false,
        error: error.message || '支付处理失败，请重试',
        timestamp: new Date().toISOString()
      }
    } finally {
      setIsProcessing(false)
    }
  }

  const cancelPayment = () => {
    setCurrentPayment(null)
    setSelectedMethod(null)
    setIsProcessing(false)
  }

  const resetPayment = () => {
    setCurrentPayment(null)
    setSelectedMethod(null)
    setIsProcessing(false)
  }

  return (
    <PaymentContext.Provider
      value={{
        currentPayment,
        selectedMethod,
        isProcessing,
        startPayment,
        selectPaymentMethod,
        processPayment,
        cancelPayment,
        resetPayment
      }}
    >
      {children}
    </PaymentContext.Provider>
  )
}

export function usePayment() {
  const context = useContext(PaymentContext)
  if (!context) {
    throw new Error('usePayment must be used within a PaymentProvider')
  }
  return context
}
