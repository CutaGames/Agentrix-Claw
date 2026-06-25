export function Skeleton({ type = 'text', className = '' }: { type?: string; className?: string }) {
  const baseClass = 'bg-gray-200 animate-pulse rounded'
  
  if (type === 'text') {
    return <div className={`h-4 ${baseClass} ${className}`} />
  }
  
  if (type === 'circle') {
    return <div className={`rounded-full ${baseClass} ${className}`} />
  }
  
  if (type === 'card') {
    return <div className={`${baseClass} ${className}`} />
  }
  
  return <div className={baseClass} />
}

export function PaymentSkeleton() {
  return (
    <div className="bg-white rounded-2xl p-6 space-y-4">
      <Skeleton type="text" className="h-6 w-1/3" />
      <Skeleton type="text" className="h-4 w-full" />
      <Skeleton type="text" className="h-4 w-2/3" />
      <div className="space-y-2">
        <Skeleton type="text" className="h-12 w-full" />
        <Skeleton type="text" className="h-12 w-full" />
        <Skeleton type="text" className="h-12 w-full" />
      </div>
    </div>
  )
}
