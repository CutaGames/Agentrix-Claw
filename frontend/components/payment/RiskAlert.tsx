'use client'
import { useState, useEffect } from 'react'
import { paymentApi } from '../../lib/api/payment.api'

interface RiskAlertProps {
  amount: number
  paymentMethod: string
  metadata?: any
  onRiskAssessed?: (assessment: any) => void
}

export function RiskAlert({
  amount,
  paymentMethod,
  metadata,
  onRiskAssessed,
}: RiskAlertProps) {
  const [riskAssessment, setRiskAssessment] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    assessRisk()
  }, [amount, paymentMethod])

  const assessRisk = async () => {
    setLoading(true)
    try {
      const assessment = await paymentApi.assessRisk({
        amount,
        paymentMethod,
        metadata,
      })
      setRiskAssessment(assessment)
      onRiskAssessed?.(assessment)
    } catch (error) {
      console.error('风险评估失败:', error)
    } finally {
      setLoading(false)
    }
  }

  if (loading || !riskAssessment) {
    return null
  }

  const getRiskColor = (level: string) => {
    switch (level) {
      case 'low':
        return 'bg-green-50 border-green-200 text-green-800'
      case 'medium':
        return 'bg-yellow-50 border-yellow-200 text-yellow-800'
      case 'high':
        return 'bg-red-50 border-red-200 text-red-800'
      default:
        return 'bg-gray-50 border-gray-200 text-gray-800'
    }
  }

  const getRiskIcon = (level: string) => {
    switch (level) {
      case 'low':
        return '✅'
      case 'medium':
        return '⚠️'
      case 'high':
        return '🚨'
      default:
        return 'ℹ️'
    }
  }

  const getRiskLabel = (level: string) => {
    switch (level) {
      case 'low':
        return '低风险'
      case 'medium':
        return '中等风险'
      case 'high':
        return '高风险'
      default:
        return '未知'
    }
  }

  // 只显示中等或高风险
  if (riskAssessment.riskLevel === 'low') {
    return null
  }

  return (
    <div className={`rounded-lg border-2 p-4 ${getRiskColor(riskAssessment.riskLevel)}`}>
      <div className="flex items-start space-x-3">
        <span className="text-2xl">{getRiskIcon(riskAssessment.riskLevel)}</span>
        <div className="flex-1">
          <div className="flex items-center justify-between mb-2">
            <span className="font-semibold">{getRiskLabel(riskAssessment.riskLevel)}</span>
            <span className="text-sm">风险评分: {riskAssessment.riskScore}/100</span>
          </div>
          {riskAssessment.recommendation && (
            <p className="text-sm mb-2">{riskAssessment.recommendation}</p>
          )}
          {riskAssessment.decision === 'review' && (
            <p className="text-sm font-medium">
              ⚠️ 此交易需要人工审核，可能需要额外时间
            </p>
          )}
          {riskAssessment.decision === 'reject' && (
            <p className="text-sm font-medium">
              🚫 此交易已被拒绝，请联系客服
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

