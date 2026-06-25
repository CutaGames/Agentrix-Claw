/**
 * Agentrix v4 Badge primitive — semantic colored pills.
 */
import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../../../lib/utils';

const badgeVariants = cva(
  'inline-flex items-center gap-1 font-semibold rounded-full whitespace-nowrap',
  {
    variants: {
      variant: {
        accent: 'bg-ax-accent/12 text-ax-accent',
        warm: 'bg-ax-warm/12 text-ax-warm',
        purple: 'bg-ax-purple/15 text-ax-purpleSoft',
        success: 'bg-ax-success/12 text-ax-success',
        warning: 'bg-ax-warning/12 text-ax-warning',
        danger: 'bg-ax-danger/12 text-ax-danger',
        subtle: 'bg-white/8 text-ax-fog',
        outline: 'border border-ax-line text-ax-fog',
      },
      size: {
        sm: 'text-[10px] px-2 py-0.5',
        md: 'text-xs px-2.5 py-0.5',
        lg: 'text-sm px-3 py-1',
      },
    },
    defaultVariants: { variant: 'subtle', size: 'md' },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, size, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant, size }), className)} {...props} />;
}

export { badgeVariants };
