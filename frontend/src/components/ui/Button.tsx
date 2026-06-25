import * as React from "react"

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'default' | 'destructive' | 'outline' | 'secondary' | 'ghost' | 'link';
  size?: 'default' | 'sm' | 'lg' | 'icon';
  children: React.ReactNode;
}

const variantStyles = {
  default: 'bg-gradient-to-r from-blue-600 to-cyan-500 text-white hover:from-blue-700 hover:to-cyan-600 shadow-md',
  destructive: 'bg-red-600 text-white hover:bg-red-700',
  outline: 'border border-slate-700 bg-transparent hover:bg-slate-800 text-slate-300',
  secondary: 'bg-slate-700 text-white hover:bg-slate-600',
  ghost: 'hover:bg-slate-800 text-slate-300',
  link: 'text-cyan-400 underline-offset-4 hover:underline',
};

const sizeStyles = {
  default: 'h-10 px-4 py-2',
  sm: 'h-9 rounded-md px-3',
  lg: 'h-11 rounded-md px-8',
  icon: 'h-10 w-10',
};

export function Button({ 
  className = "", 
  variant = 'default', 
  size = 'default',
  children,
  disabled,
  ...props 
}: ButtonProps) {
  return (
    <button
      className={`
        inline-flex items-center justify-center rounded-md text-sm font-medium
        ring-offset-background transition-colors
        focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500 focus-visible:ring-offset-2
        disabled:pointer-events-none disabled:opacity-50
        ${variantStyles[variant]}
        ${sizeStyles[size]}
        ${className}
      `}
      disabled={disabled}
      {...props}
    >
      {children}
    </button>
  );
}
