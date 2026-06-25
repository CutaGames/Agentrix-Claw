'use client'
import React from 'react'

interface ErrorMessageProps {
  error: string | Error | null
  onRetry?: () => void
  className?: string
}

export function ErrorMessage({
  error,
  onRetry,
  className = '',
}: ErrorMessageProps) {
  if (!error) return null

  const errorMessage =
    typeof error === 'string' ? error : error.message || '发生未知错误'

  return (
    <div
      className={`bg-red-50 border border-red-200 rounded-lg p-4 ${className}`}
    >
      <div className="flex items-start">
        <span className="text-red-500 mr-2">⚠️</span>
        <div className="flex-1">
          <p className="text-sm font-medium text-red-900">错误</p>
          <p className="text-sm text-red-700 mt-1">{errorMessage}</p>
          {onRetry && (
            <button
              onClick={onRetry}
              className="mt-2 text-sm text-red-600 hover:text-red-700 font-medium"
            >
              重试
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

