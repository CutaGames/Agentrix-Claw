import { ReactNode } from 'react';

interface StandaloneLayoutProps {
  children: ReactNode;
  title?: string;
  theme?: 'light' | 'dark';
}

/**
 * 独立Agent布局组件
 * 提供统一的布局结构，不依赖Agentrix官网
 */
export function StandaloneLayout({
  children,
  title = 'Agentrix Agent',
  theme = 'dark',
}: StandaloneLayoutProps) {
  return (
    <div className={`h-screen flex flex-col ${theme === 'dark' ? 'bg-neutral-900 text-white' : 'bg-white text-gray-900'}`}>
      {/* 顶部导航 */}
      <header className={`h-16 border-b ${theme === 'dark' ? 'border-neutral-800 bg-neutral-950' : 'border-gray-200 bg-white'} flex items-center justify-between px-6`}>
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg flex items-center justify-center`}>
            <span className="text-xl">🤖</span>
          </div>
          <div>
            <h1 className="text-lg font-semibold">{title}</h1>
            <p className={`text-xs ${theme === 'dark' ? 'text-neutral-400' : 'text-gray-500'}`}>
              Agentrix Agent
            </p>
          </div>
        </div>
      </header>

      {/* 主内容 */}
      <main className="flex-1 overflow-hidden">
        {children}
      </main>
    </div>
  );
}

