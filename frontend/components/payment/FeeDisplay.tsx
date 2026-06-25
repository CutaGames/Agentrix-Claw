'use client'
import { useState, useEffect } from 'react'
import { paymentApi } from '../../lib/api/payment.api'

interface FeeDisplayProps {
  amount: number
  currency: string
  paymentMethod: string
  chain?: string
  isCrossBorder?: boolean
  userCountry?: string
  merchantCountry?: string
  onFeeCalculated?: (fee: any) => void
}

export function FeeDisplay({
  amount,
  currency,
  paymentMethod,
  chain,
  isCrossBorder,
  userCountry,
  merchantCountry,
  onFeeCalculated,
}: FeeDisplayProps) {
  const [feeInfo, setFeeInfo] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadFeeEstimate()
  }, [amount, currency, paymentMethod, chain])

  const loadFeeEstimate = async () => {
    setLoading(true)
    try {
      const fee = await paymentApi.estimateFee({
        amount,
        currency,
        paymentMethod,
        chain,
        isCrossBorder,
        userCountry,
        merchantCountry,
      })
      setFeeInfo(fee)
      onFeeCalculated?.(fee)
    } catch (error) {
      console.error('估算手续费失败:', error)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="text-sm text-gray-500">
        计算手续费中...
      </div>
    )
  }

  if (!feeInfo) {
    return null
  }

  return (
    <div className="text-sm space-y-1">
      {feeInfo.totalFee !== undefined && (
        <div className="flex justify-between">
          <span className="text-gray-600">手续费:</span>
          <span className="font-medium text-gray-900">
            {feeInfo.totalFee.toFixed(2)} {currency}
          </span>
        </div>
      )}
      {feeInfo.breakdown && (
        <div className="text-xs text-gray-500 pl-4">
          {Object.entries(feeInfo.breakdown).map(([key, value]: [string, any]) => (
            <div key={key} className="flex justify-between">
              <span>{key}:</span>
              <span>{typeof value === 'number' ? value.toFixed(2) : value}</span>
            </div>
          ))}
        </div>
      )}
      {feeInfo.estimatedGas !== undefined && (
        <div className="flex justify-between">
          <span className="text-gray-600">Gas费:</span>
          <span className="font-medium text-gray-900">
            {feeInfo.estimatedGas.toFixed(6)} {chain?.toUpperCase()}
          </span>
        </div>
      )}
    </div>
  )
}

