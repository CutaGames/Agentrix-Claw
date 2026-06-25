/**
 * Agentrix v4 Stat — single KPI tile for dashboards.
 */
import * as React from 'react';
import { ArrowUpRight, ArrowDownRight } from 'lucide-react';
import { cn } from '../../../lib/utils';

export interface StatProps extends React.HTMLAttributes<HTMLDivElement> {
  label: React.ReactNode;
  value: React.ReactNode;
  hint?: React.ReactNode;
  icon?: React.ReactNode;
  trend?: { value: number; label?: string };
  accent?: 'default' | 'accent' | 'warm' | 'purple' | 'success' | 'danger';
}

export function Stat({
  label,
  value,
  hint,
  icon,
  trend,
  accent = 'default',
  className,
  ...props
}: StatProps) {
  const accentRing =
    accent === 'accent'
      ? 'before:bg-ax-accent'
      : accent === 'warm'
      ? 'before:bg-ax-warm'
      : accent === 'purple'
      ? 'before:bg-ax-purple'
      : accent === 'success'
      ? 'before:bg-ax-success'
      : accent === 'danger'
      ? 'before:bg-ax-danger'
      : 'before:bg-transparent';

  return (
    <div
      className={cn(
        'group relative overflow-hidden rounded-ax-lg border border-ax-line bg-gradient-to-br from-ax-panel to-ax-elevated p-5 shadow-ax-sm transition-all hover:border-ax-accent/30 hover:shadow-ax-md',
        'before:absolute before:left-0 before:top-0 before:h-full before:w-[3px] before:transition-transform before:duration-300 group-hover:before:scale-y-100',
        accentRing,
        className
      )}
      {...props}
    >
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ax-mist">{label}</div>
        {icon && (
          <span className="inline-flex h-7 w-7 items-center justify-center rounded-ax-sm bg-ax-accent/10 text-ax-accent [&>svg]:h-4 [&>svg]:w-4">
            {icon}
          </span>
        )}
      </div>
      <div className="text-[28px] font-bold leading-none text-ax-ink tabular-nums">{value}</div>
      {(hint || trend) && (
        <div className="mt-3 flex items-center gap-2 text-xs text-ax-mist">
          {trend && (
            <span
              className={cn(
                'inline-flex items-center gap-0.5 font-semibold',
                trend.value >= 0 ? 'text-ax-success' : 'text-ax-danger'
              )}
            >
              {trend.value >= 0 ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
              {Math.abs(trend.value).toFixed(1)}%
              {trend.label && <span className="text-ax-mist font-normal ml-1">{trend.label}</span>}
            </span>
          )}
          {hint && <span>{hint}</span>}
        </div>
      )}
    </div>
  );
}
