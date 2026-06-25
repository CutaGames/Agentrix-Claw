import { useState, ReactNode } from 'react';
import { UnifiedAgentChat, AgentMode } from '../UnifiedAgentChat';
import { useLocalization } from '../../../contexts/LocalizationContext';

export type AgentRole = 'user' | 'merchant' | 'developer';

export interface AgentFeature {
  id: string;
  icon: string;
  label: string;
  component?: ReactNode;
}

interface UniversalAgentLayoutProps {
  role: AgentRole;
  agentId?: string;
  apiKey?: string;
  config?: {
    title?: string;
    theme?: 'light' | 'dark';
    showSidebar?: boolean;
  };
  features: AgentFeature[];
  quickActions?: Array<{ id: string; label: string; icon?: string; onClick?: () => void }>;
  rightPanel?: ReactNode;
}

/**
 * 通用Agent布局组件
 * 根据角色动态渲染不同的主题色、功能模块和侧边栏
 */
export function UniversalAgentLayout({
  role,
  agentId,
  apiKey,
  config = {},
  features,
  quickActions = [],
  rightPanel,
}: UniversalAgentLayoutProps) {
  const { t } = useLocalization();
  const [activeFeature, setActiveFeature] = useState<string | null>(null);
  const [showSidebar, setShowSidebar] = useState(config.showSidebar !== false);

  // 根据角色获取主题配置
  const themeConfig = getThemeByRole(role);

  const defaultTitle = {
    user: t({ zh: '个人助手', en: 'Personal Assistant' }),
    merchant: t({ zh: '商家助手', en: 'Merchant Assistant' }),
    developer: t({ zh: '开发者助手', en: 'Developer Assistant' }),
  }[role];

  const agentMode: AgentMode = role === 'user' ? 'user' : role === 'merchant' ? 'merchant' : 'developer';

  return (
    <div className="h-screen flex flex-col bg-neutral-900 text-white">
      {/* 顶部导航 */}
      <header className="h-16 border-b border-neutral-800 bg-neutral-950 flex items-center justify-between px-6">
        <div className="flex items-center gap-3">
          <div
            className={`w-10 h-10 bg-gradient-to-br ${themeConfig.gradient} rounded-lg flex items-center justify-center`}
          >
            <span className="text-xl">{themeConfig.icon}</span>
          </div>
          <div>
            <h1 className="text-lg font-semibold">{config.title || defaultTitle}</h1>
            <p className="text-xs text-neutral-400">{t({ zh: 'Agentrix Agent', en: 'Agentrix Agent' })}</p>
          </div>
        </div>
        <button
          onClick={() => setShowSidebar(!showSidebar)}
          className="p-2 hover:bg-neutral-800 rounded-lg transition-colors"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
      </header>

      <div className="flex-1 flex overflow-hidden">
        {/* 左侧功能栏 */}
        {showSidebar && (
          <aside className="w-64 border-r border-neutral-800 bg-neutral-950 overflow-y-auto">
            <div className="p-4">
              <h2 className="text-sm font-semibold text-neutral-400 uppercase tracking-wider mb-4">
                {t({ zh: '功能模块', en: 'Features' })}
              </h2>
              <nav className="space-y-1">
                {features.map((feature) => (
                  <button
                    key={feature.id}
                    onClick={() => setActiveFeature(feature.id)}
                    className={`w-full text-left px-3 py-2 rounded-lg transition-colors flex items-center gap-3 ${
                      activeFeature === feature.id
                        ? `${themeConfig.activeBg} text-white`
                        : 'text-neutral-300 hover:bg-neutral-800'
                    }`}
                  >
                    <span className="text-xl">{feature.icon}</span>
                    <span className="text-sm font-medium">{feature.label}</span>
                  </button>
                ))}
              </nav>

              {/* 快捷操作 */}
              {quickActions.length > 0 && (
                <div className="mt-6 pt-6 border-t border-neutral-800">
                  <h3 className="text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-3">
                    {t({ zh: '快捷操作', en: 'Quick Actions' })}
                  </h3>
                  <div className="space-y-2">
                    {quickActions.map((action) => (
                      <button
                        key={action.id}
                        onClick={action.onClick}
                        className="w-full text-left px-3 py-2 text-sm text-neutral-300 hover:bg-neutral-800 rounded-lg flex items-center gap-2"
                      >
                        {action.icon && <span>{action.icon}</span>}
                        <span>{action.label}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* 右侧面板数据（如果提供） */}
              {rightPanel && (
                <div className="mt-6 pt-6 border-t border-neutral-800">
                  {rightPanel}
                </div>
              )}
            </div>
          </aside>
        )}

        {/* 主内容区 */}
        <main className="flex-1 flex flex-col overflow-hidden">
          {activeFeature ? (
            <div className="flex-1 p-6 overflow-y-auto">
              {renderFeatureContent(activeFeature, features, role)}
            </div>
          ) : (
            <div className="flex-1">
              <UnifiedAgentChat mode={agentMode} standalone={true} />
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

/**
 * 根据角色获取主题配置
 */
function getThemeByRole(role: AgentRole) {
  const themes = {
    user: {
      gradient: 'from-blue-500 to-purple-600',
      icon: '🤖',
      activeBg: 'bg-blue-600',
      primaryColor: 'blue',
    },
    merchant: {
      gradient: 'from-green-500 to-teal-600',
      icon: '🏪',
      activeBg: 'bg-green-600',
      primaryColor: 'green',
    },
    developer: {
      gradient: 'from-orange-500 to-red-600',
      icon: '💻',
      activeBg: 'bg-orange-600',
      primaryColor: 'orange',
    },
  };

  return themes[role];
}

/**
 * 渲染功能详情内容
 */
function renderFeatureContent(
  featureId: string,
  features: AgentFeature[],
  role: AgentRole
): ReactNode {
  const feature = features.find((f) => f.id === featureId);
  if (!feature) {
    return (
      <div>
        <h2 className="text-2xl font-bold mb-4">{featureId}</h2>
        <p className="text-neutral-400">功能详情</p>
      </div>
    );
  }

  // 如果功能有自定义组件，使用自定义组件
  if (feature.component) {
    return feature.component;
  }

  // 否则返回默认占位符
  return (
    <div>
      <h2 className="text-2xl font-bold mb-4">{feature.label}</h2>
      <p className="text-neutral-400">功能详情正在开发中...</p>
    </div>
  );
}

