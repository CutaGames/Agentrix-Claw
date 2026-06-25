import { ButtonHTMLAttributes, ReactNode } from 'react';

interface AIButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode;
  variant?: 'primary' | 'ghost' | 'outline';
  glow?: boolean;
}

/**
 * AI风格按钮组件（Agentrix V3.0设计规范）
 */
export function AIButton({ 
  children, 
  variant = 'primary', 
  glow = true,
  className = '',
  ...props 
}: AIButtonProps) {
  const baseClasses = 'px-6 py-3 rounded-lg font-medium transition-all duration-300';
  
  const variantClasses = {
    primary: 'bg-ai-gradient text-white shadow-glow-blue hover:shadow-glow-cyan',
    ghost: 'bg-transparent text-primary-neon hover:bg-white/10',
    outline: 'border-2 border-primary-neon text-primary-neon hover:bg-primary-neon/10',
  };

  return (
    <button
      className={`
        ${baseClasses}
        ${variantClasses[variant]}
        ${glow ? 'ai-glow' : ''}
        ${className}
      `}
      {...props}
    >
      {children}
    </button>
  );
}

