/**
 * Agentrix v4 Button primitive — variant-driven with cva.
 *
 * Usage:
 *   <Button variant="primary" size="md">Click me</Button>
 *   <Button variant="ghost" leftIcon={<X />} size="sm" />
 *   <Button asChild><Link href="/x">Go</Link></Button>
 */
import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { Loader2 } from 'lucide-react';
import { cn } from '../../../lib/utils';

const buttonVariants = cva(
  // base
  'inline-flex items-center justify-center gap-2 font-semibold whitespace-nowrap rounded-ax-md transition-all ax-focus-ring select-none disabled:opacity-40 disabled:cursor-not-allowed active:scale-[0.98]',
  {
    variants: {
      variant: {
        primary:
          'bg-ax-accent text-ax-base hover:bg-ax-accentSoft hover:shadow-ax-glow active:bg-ax-accent shadow-ax-md',
        warm:
          'bg-ax-warm text-ax-base hover:bg-ax-warmSoft hover:shadow-ax-glow-warm shadow-ax-md',
        secondary:
          'bg-white/5 text-ax-ink border border-ax-line hover:bg-white/10 hover:border-ax-lineStrong',
        ghost:
          'bg-transparent text-ax-fog hover:bg-white/5 hover:text-ax-ink',
        outline:
          'bg-transparent text-ax-accent border border-ax-accent/40 hover:bg-ax-accent/10 hover:border-ax-accent',
        danger:
          'bg-transparent text-ax-danger border border-ax-danger/30 hover:bg-ax-danger/10',
        gradient:
          'text-white bg-gradient-to-r from-ax-purple via-ax-accent to-ax-warm bg-[length:200%_auto] hover:bg-[position:right_center] shadow-ax-md',
      },
      size: {
        xs: 'h-7 px-2.5 text-xs rounded-ax-sm',
        sm: 'h-8 px-3 text-xs',
        md: 'h-10 px-4 text-sm',
        lg: 'h-12 px-6 text-base',
        xl: 'h-14 px-8 text-base rounded-ax-lg',
        icon: 'h-9 w-9 p-0',
      },
      fullWidth: {
        true: 'w-full',
        false: '',
      },
    },
    defaultVariants: {
      variant: 'primary',
      size: 'md',
      fullWidth: false,
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  loading?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  asChild?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant,
      size,
      fullWidth,
      loading = false,
      leftIcon,
      rightIcon,
      children,
      disabled,
      ...props
    },
    ref
  ) => {
    return (
      <button
        ref={ref}
        disabled={disabled || loading}
        className={cn(buttonVariants({ variant, size, fullWidth }), className)}
        {...props}
      >
        {loading ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : leftIcon ? (
          <span className="inline-flex shrink-0 [&>svg]:h-4 [&>svg]:w-4">{leftIcon}</span>
        ) : null}
        {children}
        {!loading && rightIcon ? (
          <span className="inline-flex shrink-0 [&>svg]:h-4 [&>svg]:w-4">{rightIcon}</span>
        ) : null}
      </button>
    );
  }
);
Button.displayName = 'Button';

export { buttonVariants };
