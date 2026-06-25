import { ReactNode } from 'react'

interface SkeletonLoaderProps {
  className?: string
  children?: ReactNode
  variant?: 'text' | 'circular' | 'rectangular' | 'rounded'
  width?: string | number
  height?: string | number
  lines?: number
}

export function SkeletonLoader({
  className = '',
  variant = 'rectangular',
  width,
  height,
  lines,
}: SkeletonLoaderProps) {
  const baseClasses = 'skeleton bg-gray-200'
  
  const variantClasses = {
    text: 'h-4 rounded',
    circular: 'rounded-full',
    rectangular: 'rounded',
    rounded: 'rounded-lg',
  }

  if (lines && variant === 'text') {
    return (
      <div className={className}>
        {Array.from({ length: lines }).map((_, i) => (
          <div
            key={i}
            className={`${baseClasses} ${variantClasses.text} mb-2 ${
              i === lines - 1 ? 'w-3/4' : 'w-full'
            }`}
            style={{ width, height }}
          />
        ))}
      </div>
    )
  }

  return (
    <div
      className={`${baseClasses} ${variantClasses[variant]} ${className}`}
      style={{ width, height }}
    />
  )
}

// 预定义的骨架屏组件
export function CardSkeleton() {
  return (
    <div className="bg-white rounded-lg shadow-sm p-6">
      <SkeletonLoader variant="text" height={24} width="60%" className="mb-4" />
      <SkeletonLoader variant="text" lines={3} className="mb-4" />
      <SkeletonLoader variant="rounded" height={40} width="30%" />
    </div>
  )
}

export function TableSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex space-x-4">
        <SkeletonLoader variant="text" height={20} width="20%" />
        <SkeletonLoader variant="text" height={20} width="30%" />
        <SkeletonLoader variant="text" height={20} width="25%" />
        <SkeletonLoader variant="text" height={20} width="25%" />
      </div>
      {/* Rows */}
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex space-x-4">
          <SkeletonLoader variant="text" height={16} width="20%" />
          <SkeletonLoader variant="text" height={16} width="30%" />
          <SkeletonLoader variant="text" height={16} width="25%" />
          <SkeletonLoader variant="text" height={16} width="25%" />
        </div>
      ))}
    </div>
  )
}

export function UserProfileSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex items-center space-x-4">
        <SkeletonLoader variant="circular" width={80} height={80} />
        <div className="flex-1 space-y-2">
          <SkeletonLoader variant="text" height={24} width="40%" />
          <SkeletonLoader variant="text" height={16} width="60%" />
        </div>
      </div>
      <div className="space-y-4">
        <SkeletonLoader variant="text" height={20} width="30%" />
        <SkeletonLoader variant="rounded" height={50} width="100%" />
      </div>
    </div>
  )
}

export function PaymentCardSkeleton() {
  return (
    <div className="bg-white rounded-lg shadow-sm p-6">
      <SkeletonLoader variant="text" height={20} width="40%" className="mb-4" />
      <SkeletonLoader variant="rounded" height={100} width="100%" className="mb-4" />
      <div className="flex space-x-2">
        <SkeletonLoader variant="rounded" height={40} width="30%" />
        <SkeletonLoader variant="rounded" height={40} width="30%" />
      </div>
    </div>
  )
}

