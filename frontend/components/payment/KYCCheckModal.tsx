'use client'
import { useState } from 'react'
import { useUser } from '../../contexts/UserContext'
import { useLocalization } from '../../contexts/LocalizationContext'
import { useRouter } from 'next/router'

interface KYCCheckModalProps {
  onClose: () => void
  onCompleted: () => void
}

export function KYCCheckModal({ onClose, onCompleted }: KYCCheckModalProps) {
  const { t } = useLocalization()
  const { user, updateKYC } = useUser()
  const router = useRouter()
  const [isProcessing, setIsProcessing] = useState(false)

  const handleStartKYC = () => {
    // 跳转到KYC认证页面
    router.push('/app/user/kyc')
    onClose()
  }

  const handleSkip = () => {
    // 用户选择跳过，返回选择其他支付方式
    onClose()
  }

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white border border-gray-200 rounded-2xl p-6 max-w-md w-full shadow-2xl">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-xl font-semibold text-gray-900">{t({ zh: 'KYC认证', en: 'KYC Verification' })}</h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors text-2xl leading-none"
          >
            ✕
          </button>
        </div>

        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-6">
          <div className="text-4xl mb-2">🔐</div>
          <p className="text-sm text-gray-700 font-medium">
            {t({
              zh: '该支付方式需要KYC认证（Provider要求）',
              en: 'This payment method requires KYC verification (Provider requirement)',
            })}
          </p>
        </div>

        <div className="space-y-4 mb-6">
          <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
            <p className="text-sm font-semibold mb-2 text-gray-900">
              {t({ zh: '当前状态', en: 'Current Status' })}
            </p>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between items-center">
                <span className="text-gray-600">{t({ zh: 'KYC等级', en: 'KYC Level' })}</span>
                <span className={`px-2 py-1 rounded text-xs font-medium ${
                  user?.kycLevel && user.kycLevel !== 'none' 
                    ? 'bg-green-100 text-green-700' 
                    : 'bg-gray-100 text-gray-700'
                }`}>
                  {user?.kycLevel || t({ zh: '未认证', en: 'Not Verified' })}
                </span>
              </div>
            </div>
          </div>

          <div className="bg-blue-50 rounded-lg p-4 border border-blue-200">
            <p className="text-sm font-semibold mb-2 text-gray-900">
              {t({ zh: '需要KYC的支付方式', en: 'Payment Methods Requiring KYC' })}
            </p>
            <ul className="text-sm text-gray-700 space-y-1">
              <li className="flex items-center">
                <span className="mr-2">•</span>
                {t({ zh: '法币转数字货币', en: 'Fiat to Crypto' })}
              </li>
              <li className="flex items-center">
                <span className="mr-2">•</span>
                {t({ zh: 'Provider支付', en: 'Provider Payment' })} (Apple Pay/Google Pay)
              </li>
            </ul>
          </div>

          <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
            <p className="text-sm font-semibold mb-2 text-gray-900">
              {t({ zh: 'KYC认证步骤', en: 'KYC Verification Steps' })}
            </p>
            <ol className="text-sm text-gray-700 space-y-1 list-decimal list-inside">
              <li>{t({ zh: '身份验证（上传身份证/护照，人脸识别）', en: 'Identity verification (upload ID/passport, face recognition)' })}</li>
              <li>{t({ zh: '地址验证（可选）', en: 'Address verification (optional)' })}</li>
              <li>{t({ zh: '审核（通常几分钟到几小时）', en: 'Review (usually minutes to hours)' })}</li>
            </ol>
          </div>
        </div>

        <div className="bg-gray-50 rounded-xl p-4 border border-gray-200 mb-6">
          <p className="text-sm text-gray-700">
            {t({
              zh: '💡 提示：您也可以选择其他不需要KYC的支付方式',
              en: '💡 Tip: You can also choose other payment methods that do not require KYC',
            })}
          </p>
        </div>

        <div className="flex space-x-3">
          <button
            onClick={handleSkip}
            className="flex-1 border border-gray-300 text-gray-700 py-3 rounded-lg hover:bg-gray-50 transition-colors font-medium"
          >
            {t({ zh: '选择其他方式', en: 'Choose Other Method' })}
          </button>
          <button
            onClick={handleStartKYC}
            disabled={isProcessing}
            className="flex-1 bg-blue-600 text-white font-semibold py-3 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 shadow-md"
          >
            {t({ zh: '开始KYC认证', en: 'Start KYC Verification' })}
          </button>
        </div>
      </div>
    </div>
  )
}

