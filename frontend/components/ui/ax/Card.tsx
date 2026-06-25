/**
 * Agentrix v4 Card primitive — 3 variants: default / elevated / glass.
 *
 * Usage:
 *   <Card variant="elevated" hoverable>
 *     <CardHeader icon={<Wallet />} title="Wallet" badge={<Badge>Pro</Badge>} />
 *     <CardBody>...</CardBody>
 *     <CardFooter>...</CardFooter>
 *   </Card>
 */
import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../../../lib/utils';

const cardVariants = cva(
  'rounded-ax-lg transition-all overflow-hidden',
  {
    variants: {
      variant: {
        default:
          'bg-ax-panel border border-ax-line',
        elevated:
          'bg-gradient-to-br from-ax-panel to-ax-elevated border border-ax-line shadow-ax-md',
        glass:
          'ax-glass',
        outline:
          'bg-transparent border border-ax-line',
        accent:
          'bg-gradient-to-br from-ax-accent/10 to-ax-purple/5 border border-ax-accent/30',
      },
      padding: {
        none: 'p-0',
        sm: 'p-3',
        md: 'p-5',
        lg: 'p-6',
        xl: 'p-8',
      },
      hoverable: {
        true: 'hover:border-ax-accent/40 hover:shadow-ax-lg hover:-translate-y-0.5 cursor-pointer',
        false: '',
      },
      glow: {
        true: 'shadow-ax-glow',
        false: '',
      },
    },
    defaultVariants: {
      variant: 'default',
      padding: 'md',
      hoverable: false,
      glow: false,
    },
  }
);

export interface CardProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof cardVariants> {}

export const Card = React.forwardRef<HTMLDivElement, CardProps>(
  ({ className, variant, padding, hoverable, glow, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(cardVariants({ variant, padding, hoverable, glow }), className)}
      {...props}
    />
  )
);
Card.displayName = 'Card';

export interface CardHeaderProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'title'> {
  icon?: React.ReactNode;
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  badge?: React.ReactNode;
  action?: React.ReactNode;
}

export const CardHeader = React.forwardRef<HTMLDivElement, CardHeaderProps>(
  ({ className, icon, title, subtitle, badge, action, children, ...props }, ref) => {
    if (children) {
      return (
        <div ref={ref} className={cn('flex items-start justify-between gap-3 mb-4', className)} {...props}>
          {children}
        </div>
      );
    }
    return (
      <div ref={ref} className={cn('flex items-start justify-between gap-3 mb-4', className)} {...props}>
        <div className="flex items-start gap-3 min-w-0 flex-1">
          {icon && (
            <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-ax-sm bg-ax-accent/10 text-ax-accent [&>svg]:h-5 [&>svg]:w-5">
              {icon}
            </span>
          )}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              {title && <h3 className="text-base font-semibold text-ax-ink truncate">{title}</h3>}
              {badge}
            </div>
            {subtitle && <p className="mt-1 text-xs text-ax-mist truncate">{subtitle}</p>}
          </div>
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
    );
  }
);
CardHeader.displayName = 'CardHeader';

export const CardBody = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('text-sm text-ax-fog', className)} {...props} />
  )
);
CardBody.displayName = 'CardBody';

export const CardFooter = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn('mt-4 pt-4 border-t border-ax-line flex items-center justify-between gap-3', className)}
      {...props}
    />
  )
);
CardFooter.displayName = 'CardFooter';

export { cardVariants };
