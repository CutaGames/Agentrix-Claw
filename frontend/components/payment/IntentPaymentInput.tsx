/**
 * IntentPaymentInput - 自然语言意图支付输入框
 * 
 * 让用户用自然语言描述支付意图，如：
 * - "支付 100 USDC 给翻译 Agent"
 * - "从上周预存的钱里扣 50U 给修图服务"
 * - "订阅每月 30U 的 AI 写作服务"
 */

import { useState, useRef, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

// 意图解析结果
interface ParsedIntent {
  type: 'pay' | 'subscribe' | 'deposit' | 'split' | 'unknown'
  amount?: number
  currency?: string
  recipientName?: string
  recipientAddress?: string
  taskType?: string
  sessionRef?: string
  description?: string
  confidence: number
  missingFields?: string[]
}

// 支付预览
interface PaymentPreview {
  type: string
  title: string
  description: string
  totalAmount: number
  currency: string
  recipients: {
    name: string
    amount: number
    role: string
    percentage: number
  }[]
  fees: {
    platformFee: number
    gasFee: number
  }
  source: {
    type: 'wallet' | 'session' | 'deposit'
    label: string
  }
  estimatedTime: string
}

interface IntentPaymentInputProps {
  onIntentParsed?: (intent: ParsedIntent) => void
  onPaymentPreview?: (preview: PaymentPreview) => void
  onConfirm?: (confirmationId: string) => void
  onCancel?: () => void
  placeholder?: string
  defaultIntent?: string
  autoFocus?: boolean
  showExamples?: boolean
}

const EXAMPLE_INTENTS = [
  '支付 100 USDC 给翻译 Agent',
  '从预存款扣 50U 给修图服务',
  '每月订阅 30 USDC 的写作助手',
  '分账 200U: 80% 给设计师, 20% 平台',
]

export function IntentPaymentInput({
  onIntentParsed,
  onPaymentPreview,
  onConfirm,
  onCancel,
  placeholder = '用自然语言描述您的支付意图...',
  defaultIntent = '',
  autoFocus = false,
  showExamples = true,
}: IntentPaymentInputProps) {
  const [intent, setIntent] = useState(defaultIntent)
  const [isLoading, setIsLoading] = useState(false)
  const [parsedResult, setParsedResult] = useState<ParsedIntent | null>(null)
  const [preview, setPreview] = useState<PaymentPreview | null>(null)
  const [confirmationId, setConfirmationId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (autoFocus && inputRef.current) {
      inputRef.current.focus()
    }
  }, [autoFocus])

  // 调用后端解析意图
  const parseIntent = useCallback(async (text: string) => {
    if (!text.trim()) return

    setIsLoading(true)
    setError(null)

    try {
      const response = await fetch('/api/mcp/intent-parse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ intent: text }),
      })

      if (!response.ok) {
        throw new Error('意图解析失败')
      }

      const result = await response.json()
      
      if (result.requiresMoreInfo) {
        setParsedResult({
          ...result.parsedSoFar,
          missingFields: result.missingFields,
        })
        onIntentParsed?.(result.parsedSoFar)
      } else if (result.requiresConfirmation) {
        setPreview(result.preview)
        setConfirmationId(result.confirmationId)
        onPaymentPreview?.(result.preview)
      } else if (result.success) {
        // 小额自动支付完成
        setParsedResult(null)
        setPreview(null)
        onConfirm?.(result.paymentId)
      }
    } catch (err: any) {
      setError(err.message || '解析失败，请重试')
    } finally {
      setIsLoading(false)
    }
  }, [onIntentParsed, onPaymentPreview, onConfirm])

  // 确认支付
  const handleConfirm = async () => {
    if (!confirmationId) return

    setIsLoading(true)
    try {
      const response = await fetch('/api/mcp/intent-confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirmationId }),
      })

      const result = await response.json()
      if (result.success) {
        onConfirm?.(result.paymentId)
        setPreview(null)
        setConfirmationId(null)
        setIntent('')
      } else {
        setError(result.message || '支付失败')
      }
    } catch (err: any) {
      setError(err.message || '支付失败')
    } finally {
      setIsLoading(false)
    }
  }

  // 取消支付
  const handleCancel = async () => {
    if (confirmationId) {
      await fetch('/api/mcp/intent-reject', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirmationId }),
      })
    }
    setPreview(null)
    setConfirmationId(null)
    onCancel?.()
  }

  // 使用示例
  const handleExampleClick = (example: string) => {
    setIntent(example)
    parseIntent(example)
  }

  return (
    <div className="w-full max-w-2xl mx-auto">
      {/* 输入框 */}
      <div className="relative">
        <textarea
          ref={inputRef}
          value={intent}
          onChange={(e) => setIntent(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              parseIntent(intent)
            }
          }}
          placeholder={placeholder}
          className="w-full px-4 py-3 pr-12 rounded-xl border-2 border-gray-200 
                     focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 
                     resize-none transition-all duration-200"
          rows={2}
          disabled={isLoading || !!preview}
        />
        
        {/* 发送按钮 */}
        <button
          onClick={() => parseIntent(intent)}
          disabled={isLoading || !intent.trim() || !!preview}
          className="absolute right-3 bottom-3 p-2 rounded-lg 
                     bg-indigo-600 text-white hover:bg-indigo-700 
                     disabled:bg-gray-300 disabled:cursor-not-allowed
                     transition-colors duration-200"
        >
          {isLoading ? (
            <svg className="w-5 h-5 animate-spin" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          ) : (
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
            </svg>
          )}
        </button>
      </div>

      {/* 示例意图 */}
      {showExamples && !preview && !parsedResult && (
        <div className="mt-3 flex flex-wrap gap-2">
          <span className="text-sm text-gray-500">试试：</span>
          {EXAMPLE_INTENTS.map((example, idx) => (
            <button
              key={idx}
              onClick={() => handleExampleClick(example)}
              className="text-sm px-3 py-1 rounded-full bg-gray-100 
                         text-gray-600 hover:bg-indigo-100 hover:text-indigo-600
                         transition-colors duration-200"
            >
              {example}
            </button>
          ))}
        </div>
      )}

      {/* 缺失信息提示 */}
      <AnimatePresence>
        {parsedResult?.missingFields && parsedResult.missingFields.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="mt-4 p-4 bg-amber-50 border border-amber-200 rounded-xl"
          >
            <div className="flex items-start gap-3">
              <span className="text-2xl">🔍</span>
              <div>
                <p className="font-medium text-amber-800">还需要补充以下信息：</p>
                <ul className="mt-2 space-y-1">
                  {parsedResult.missingFields.map((field) => (
                    <li key={field} className="text-amber-700 text-sm flex items-center gap-2">
                      <span>•</span>
                      {getFieldLabel(field)}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 支付预览 */}
      <AnimatePresence>
        {preview && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="mt-4 bg-white border-2 border-indigo-100 rounded-2xl shadow-lg overflow-hidden"
          >
            {/* 预览头部 */}
            <div className="bg-gradient-to-r from-indigo-500 to-purple-600 px-6 py-4 text-white">
              <h3 className="text-lg font-semibold">💳 {preview.title}</h3>
              <p className="text-indigo-100 text-sm mt-1">{preview.description}</p>
            </div>

            {/* 金额明细 */}
            <div className="p-6 space-y-4">
              {/* 收款方 */}
              {preview.recipients.length > 0 && (
                <div>
                  <p className="text-sm text-gray-500 mb-2">收款方</p>
                  <div className="space-y-2">
                    {preview.recipients.map((r, idx) => (
                      <div key={idx} className="flex justify-between items-center bg-gray-50 px-4 py-2 rounded-lg">
                        <div>
                          <span className="font-medium text-gray-900">{r.name}</span>
                          <span className="text-gray-500 text-sm ml-2">({r.role})</span>
                        </div>
                        <div className="text-right">
                          <span className="font-semibold text-indigo-600">{r.amount.toFixed(2)}</span>
                          <span className="text-gray-500 text-sm ml-1">{preview.currency}</span>
                          <span className="text-gray-400 text-xs ml-2">({r.percentage}%)</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* 费用 */}
              <div className="border-t pt-4">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">平台手续费</span>
                  <span className="text-gray-700">{preview.fees.platformFee.toFixed(2)} {preview.currency}</span>
                </div>
                <div className="flex justify-between text-sm mt-1">
                  <span className="text-gray-500">Gas 费用</span>
                  <span className="text-gray-700">~{preview.fees.gasFee.toFixed(2)} {preview.currency}</span>
                </div>
              </div>

              {/* 总计 */}
              <div className="border-t pt-4">
                <div className="flex justify-between items-center">
                  <span className="text-gray-700 font-medium">总计</span>
                  <span className="text-2xl font-bold text-gray-900">
                    {preview.totalAmount.toFixed(2)} <span className="text-lg">{preview.currency}</span>
                  </span>
                </div>
              </div>

              {/* 支付来源 */}
              <div className="flex items-center gap-2 text-sm text-gray-500 bg-gray-50 px-4 py-2 rounded-lg">
                <span>📱</span>
                <span>支付来源：{preview.source.label}</span>
              </div>

              {/* 操作按钮 */}
              <div className="flex gap-3 pt-4">
                <button
                  onClick={handleCancel}
                  className="flex-1 px-4 py-3 border-2 border-gray-200 rounded-xl 
                             text-gray-700 font-medium hover:bg-gray-50
                             transition-colors duration-200"
                >
                  取消
                </button>
                <button
                  onClick={handleConfirm}
                  disabled={isLoading}
                  className="flex-1 px-4 py-3 bg-gradient-to-r from-indigo-500 to-purple-600 
                             rounded-xl text-white font-medium hover:from-indigo-600 hover:to-purple-700
                             disabled:opacity-50 disabled:cursor-not-allowed
                             transition-all duration-200"
                >
                  {isLoading ? '处理中...' : '确认支付'}
                </button>
              </div>

              {/* 预计时间 */}
              <p className="text-center text-sm text-gray-400">
                ⏱️ 预计 {preview.estimatedTime}
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 错误提示 */}
      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="mt-4 p-4 bg-red-50 border border-red-200 rounded-xl flex items-center gap-3"
          >
            <span className="text-2xl">❌</span>
            <div>
              <p className="font-medium text-red-800">支付失败</p>
              <p className="text-red-600 text-sm">{error}</p>
            </div>
            <button
              onClick={() => setError(null)}
              className="ml-auto text-red-400 hover:text-red-600"
            >
              ✕
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// 获取字段标签
function getFieldLabel(field: string): string {
  const labels: Record<string, string> = {
    amount: '💰 支付金额（如：100 USDC）',
    recipient: '👤 收款方（Agent ID 或钱包地址）',
    currency: '💵 币种（默认 USDC）',
    taskType: '📋 任务类型（如：翻译、修图）',
  }
  return labels[field] || field
}

export default IntentPaymentInput
