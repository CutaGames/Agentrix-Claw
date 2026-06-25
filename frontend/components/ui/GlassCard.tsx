import { ReactNode } from 'react';

interface GlassCardProps {
  children: ReactNode;
  className?: string;
  glow?: boolean;
  hover?: boolean;
}

/**
 * 玻璃拟态卡片组件（Agentrix V3.0设计规范）
 */
export function GlassCard({ children, className = '', glow = false, hover = false }: GlassCardProps) {
  return (
    <div
      className={`
        glass rounded-xl p-6
        ${glow ? 'ai-glow' : ''}
        ${hover ? 'transition-all duration-300 hover:scale-[1.02] hover:shadow-glow-blue' : ''}
        ${className}
      `}
    >
      {children}
    </div>
  );
}

