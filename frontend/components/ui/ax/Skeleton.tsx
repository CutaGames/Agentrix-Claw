/**
 * Agentrix v4 Skeleton primitive — shimmer-style loading placeholder.
 */
import * as React from 'react';
import { cn } from '../../../lib/utils';

export interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  rounded?: 'sm' | 'md' | 'lg' | 'full';
}

export function Skeleton({ className, rounded = 'md', ...props }: SkeletonProps) {
  const r =
    rounded === 'full'
      ? 'rounded-full'
      : rounded === 'lg'
      ? 'rounded-ax-lg'
      : rounded === 'sm'
      ? 'rounded-ax-sm'
      : 'rounded-ax-md';
  return (
    <div
      className={cn(
        'relative overflow-hidden bg-ax-panel/60 ' + r,
        'before:absolute before:inset-0 before:-translate-x-full before:animate-[ax-shimmer_1.6s_infinite] before:bg-gradient-to-r before:from-transparent before:via-white/5 before:to-transparent',
        className
      )}
      {...props}
    />
  );
}

// Common pre-composed skeleton patterns
export function SkeletonStat() {
  return (
    <div className="rounded-ax-lg border border-ax-line bg-ax-panel p-5">
      <Skeleton className="h-3 w-16 mb-3" />
      <Skeleton className="h-8 w-24" />
    </div>
  );
}

export function SkeletonRow() {
  return (
    <div className="flex items-center justify-between py-2.5 border-b border-ax-line">
      <Skeleton className="h-4 w-32" />
      <Skeleton className="h-4 w-20" />
    </div>
  );
}

export function SkeletonCard({ rows = 3 }: { rows?: number }) {
  return (
    <div className="rounded-ax-lg border border-ax-line bg-ax-panel p-5">
      <Skeleton className="h-5 w-1/3 mb-4" />
      <div className="space-y-2">
        {Array.from({ length: rows }).map((_, i) => (
          <SkeletonRow key={i} />
        ))}
      </div>
    </div>
  );
}
