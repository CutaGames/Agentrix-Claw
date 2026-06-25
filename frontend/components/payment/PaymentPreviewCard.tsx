/**
 * PaymentPreviewCard - 支付预览卡片组件
 * 
 * 在确认前展示完整的支付信息：
 * - 收款方详情
 * - 费用分解
 * - 资金来源
 * - 分账明细（如适用）
 */

import { motion } from 'framer-motion'

export interface PaymentRecipient {
  name: string
  address?: string
  agentId?: string
  amount: number
  role: string
  percentage: number
  avatar?: string
}

export interface PaymentFees {
  platformFee: number
  platformFeePercent?: number
  gasFee: number
  networkFee?: number
}

export interface PaymentSource {
  type: 'wallet' | 'session' | 'deposit' | 'quickpay'
  label: string
  balance?: number
  sessionId?: string
}

export interface PaymentPreviewData {
  id?: string
  type: 'direct' | 'split' | 'subscription' | 'intent'
  title: string
  description?: string
  totalAmount: number
  currency: string
  recipients: PaymentRecipient[]
  fees: PaymentFees
  source: PaymentSource
  estimatedTime: string
  network?: string
  taskId?: string
  orderId?: string
  expiresAt?: Date
}

interface PaymentPreviewCardProps {
  preview: PaymentPreviewData
  onConfirm: () => void
  onCancel: () => void
  onEdit?: () => void
  isLoading?: boolean
  showEditButton?: boolean
  compact?: boolean
}

export function PaymentPreviewCard({
  preview,
  onConfirm,
  onCancel,
  onEdit,
  isLoading = false,
  showEditButton = false,
  compact = false,
}: PaymentPreviewCardProps) {
  const totalFees = preview.fees.platformFee + preview.fees.gasFee + (preview.fees.networkFee || 0)
  const netAmount = preview.totalAmount - totalFees

  // 获取类型图标
  const getTypeIcon = () => {
    switch (preview.type) {
      case 'split': return '📊'
      case 'subscription': return '🔄'
      case 'intent': return '🗣️'
      default: return '💳'
    }
  }

  // 获取类型标签
  const getTypeLabel = () => {
    switch (preview.type) {
      case 'split': return '分账支付'
      case 'subscription': return '订阅支付'
      case 'intent': return '意图支付'
      default: return '直接支付'
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className={`bg-white rounded-2xl shadow-xl overflow-hidden ${
        compact ? 'max-w-sm' : 'max-w-lg'
      }`}
    >
      {/* 头部 */}
      <div className="bg-gradient-to-r from-indigo-600 to-purple-600 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-2xl">{getTypeIcon()}</span>
            <div>
              <h3 className="text-lg font-semibold text-white">{preview.title}</h3>
              <span className="text-xs text-indigo-200 bg-indigo-500/30 px-2 py-0.5 rounded-full">
                {getTypeLabel()}
              </span>
            </div>
          </div>
          {preview.network && (
            <span className="text-xs text-indigo-200 bg-white/10 px-2 py-1 rounded-lg">
              {preview.network}
            </span>
          )}
        </div>
        {preview.description && (
          <p className="text-indigo-100 text-sm mt-2">{preview.description}</p>
        )}
      </div>

      {/* 主金额 */}
      <div className="px-6 py-5 border-b border-gray-100 text-center">
        <p className="text-gray-500 text-sm">支付金额</p>
        <p className="text-4xl font-bold text-gray-900 mt-1">
          {preview.totalAmount.toLocaleString('en-US', { minimumFractionDigits: 2 })}
          <span className="text-xl text-gray-500 ml-2">{preview.currency}</span>
        </p>
      </div>

      {/* 收款方列表 */}
      {preview.recipients.length > 0 && (
        <div className="px-6 py-4 border-b border-gray-100">
          <p className="text-sm text-gray-500 mb-3 flex items-center gap-2">
            <span>👥</span>
            收款方 {preview.recipients.length > 1 && `(${preview.recipients.length})`}
          </p>
          <div className="space-y-2">
            {preview.recipients.map((recipient, idx) => (
              <div
                key={idx}
                className="flex items-center justify-between bg-gray-50 px-4 py-3 rounded-xl"
              >
                <div className="flex items-center gap-3">
                  {recipient.avatar ? (
                    <img
                      src={recipient.avatar}
                      alt={recipient.name}
                      className="w-10 h-10 rounded-full object-cover"
                    />
                  ) : (
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-400 to-purple-500 flex items-center justify-center text-white font-medium">
                      {recipient.name.charAt(0).toUpperCase()}
                    </div>
                  )}
                  <div>
                    <p className="font-medium text-gray-900">{recipient.name}</p>
                    <p className="text-xs text-gray-500">{recipient.role}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="font-semibold text-indigo-600">
                    {recipient.amount.toFixed(2)} {preview.currency}
                  </p>
                  <p className="text-xs text-gray-400">{recipient.percentage}%</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 费用明细 */}
      {!compact && (
        <div className="px-6 py-4 border-b border-gray-100 bg-gray-50/50">
          <p className="text-sm text-gray-500 mb-2">费用明细</p>
          <div className="space-y-1.5 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-600">
                平台服务费
                {preview.fees.platformFeePercent && (
                  <span className="text-gray-400 ml-1">
                    ({preview.fees.platformFeePercent}%)
                  </span>
                )}
              </span>
              <span className="text-gray-700">
                {preview.fees.platformFee.toFixed(2)} {preview.currency}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Gas 费用</span>
              <span className="text-gray-700">
                ~{preview.fees.gasFee.toFixed(4)} {preview.currency}
              </span>
            </div>
            {preview.fees.networkFee && preview.fees.networkFee > 0 && (
              <div className="flex justify-between">
                <span className="text-gray-600">网络费用</span>
                <span className="text-gray-700">
                  {preview.fees.networkFee.toFixed(4)} {preview.currency}
                </span>
              </div>
            )}
            <div className="flex justify-between pt-2 border-t border-gray-200 font-medium">
              <span className="text-gray-700">到账金额</span>
              <span className="text-green-600">
                {netAmount.toFixed(2)} {preview.currency}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* 资金来源 */}
      <div className="px-6 py-4 border-b border-gray-100">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm">
            <span>📱</span>
            <span className="text-gray-600">支付来源</span>
          </div>
          <div className="text-right">
            <p className="font-medium text-gray-900">{preview.source.label}</p>
            {preview.source.balance !== undefined && (
              <p className="text-xs text-gray-500">
                余额: {preview.source.balance.toFixed(2)} {preview.currency}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* 预计时间 & 过期时间 */}
      <div className="px-6 py-3 bg-gray-50 flex items-center justify-between text-sm">
        <div className="flex items-center gap-2 text-gray-500">
          <span>⏱️</span>
          <span>预计 {preview.estimatedTime}</span>
        </div>
        {preview.expiresAt && (
          <div className="text-amber-600 text-xs">
            ⚠️ {Math.ceil((preview.expiresAt.getTime() - Date.now()) / 60000)} 分钟后过期
          </div>
        )}
      </div>

      {/* 操作按钮 */}
      <div className="px-6 py-4 flex gap-3">
        <button
          onClick={onCancel}
          disabled={isLoading}
          className="flex-1 px-4 py-3 border-2 border-gray-200 rounded-xl 
                     text-gray-700 font-medium hover:bg-gray-50
                     disabled:opacity-50 disabled:cursor-not-allowed
                     transition-colors duration-200"
        >
          取消
        </button>
        {showEditButton && onEdit && (
          <button
            onClick={onEdit}
            disabled={isLoading}
            className="px-4 py-3 border-2 border-indigo-200 rounded-xl 
                       text-indigo-600 font-medium hover:bg-indigo-50
                       disabled:opacity-50 disabled:cursor-not-allowed
                       transition-colors duration-200"
          >
            ✏️ 修改
          </button>
        )}
        <button
          onClick={onConfirm}
          disabled={isLoading}
          className="flex-1 px-4 py-3 bg-gradient-to-r from-indigo-500 to-purple-600 
                     rounded-xl text-white font-medium hover:from-indigo-600 hover:to-purple-700
                     disabled:opacity-50 disabled:cursor-not-allowed
                     flex items-center justify-center gap-2
                     transition-all duration-200"
        >
          {isLoading ? (
            <>
              <svg className="w-5 h-5 animate-spin" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              <span>处理中...</span>
            </>
          ) : (
            <>
              <span>确认支付</span>
              <span>✓</span>
            </>
          )}
        </button>
      </div>

      {/* 安全提示 */}
      <div className="px-6 pb-4">
        <div className="flex items-center justify-center gap-2 text-xs text-gray-400">
          <span>🔒</span>
          <span>由 Agentrix 安全协议保护</span>
        </div>
      </div>
    </motion.div>
  )
}

export default PaymentPreviewCard
