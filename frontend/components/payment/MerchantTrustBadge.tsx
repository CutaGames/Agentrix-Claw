'use client'
import { useState, useEffect } from 'react'
import { userAgentApi } from '../../lib/api/user-agent.api'

interface MerchantTrustBadgeProps {
  merchantId: string
  showDetails?: boolean
}

export function MerchantTrustBadge({ merchantId, showDetails = false }: MerchantTrustBadgeProps) {
  const [trustScore, setTrustScore] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadTrustScore()
  }, [merchantId])

  const loadTrustScore = async () => {
    setLoading(true)
    try {
      const score = await userAgentApi.getMerchantTrust(merchantId)
      setTrustScore(score)
    } catch (error) {
      console.error('获取商家可信度失败:', error)
    } finally {
      setLoading(false)
    }
  }

  if (loading || !trustScore) {
    return null
  }

  const getTrustColor = (level: string) => {
    switch (level) {
      case 'excellent':
        return 'bg-green-100 text-green-800 border-green-300'
      case 'high':
        return 'bg-blue-100 text-blue-800 border-blue-300'
      case 'medium':
        return 'bg-yellow-100 text-yellow-800 border-yellow-300'
      case 'low':
        return 'bg-red-100 text-red-800 border-red-300'
      default:
        return 'bg-gray-100 text-gray-800 border-gray-300'
    }
  }

  const getTrustIcon = (level: string) => {
    switch (level) {
      case 'excellent':
        return '⭐'
      case 'high':
        return '✓'
      case 'medium':
        return '⚠'
      case 'low':
        return '✗'
      default:
        return '?'
    }
  }

  const getTrustLabel = (level: string) => {
    switch (level) {
      case 'excellent':
        return '优秀'
      case 'high':
        return '良好'
      case 'medium':
        return '一般'
      case 'low':
        return '较低'
      default:
        return '未知'
    }
  }

  return (
    <div className={`inline-flex items-center space-x-2 px-3 py-1 rounded-full border ${getTrustColor(trustScore.trustLevel)}`}>
      <span>{getTrustIcon(trustScore.trustLevel)}</span>
      <span className="text-sm font-medium">
        {getTrustLabel(trustScore.trustLevel)} ({trustScore.trustScore}/100)
      </span>
      {showDetails && trustScore.totalTransactions > 0 && (
        <span className="text-xs opacity-75">
          {trustScore.totalTransactions} 笔交易
        </span>
      )}
    </div>
  )
}

