'use client';

/**
 * Workbench Layout V2 - 基于画像的工作台布局
 * 对应重构方案2.1节的完整架构
 * 
 * 架构:
 * - L0: 全局顶栏 (GlobalHeader)
 * - L1: 画像切换栏 (6种画像带颜色主题)
 * - L2: 左侧功能导航 (根据画像动态切换)
 * - L3: 主内容区
 * - R1: AI助手侧边栏
 */

import { useState, useEffect, ReactNode } from 'react';
import { useRouter } from 'next/router';
import { L1PersonaNav } from './L1PersonaNav';
import { L2PersonaSidebar, personaL2Config } from './L2PersonaSidebar';
import { UserPersona, personaThemes } from '../onboarding/PersonaSelector';
import { UnifiedAgentChat } from '../agent/UnifiedAgentChat';
import { useLocalization } from '../../contexts/LocalizationContext';
import { 
  MessageCircle, 
  X, 
  ChevronLeft, 
  ChevronRight,
  PanelLeftClose,
  PanelLeftOpen
} from 'lucide-react';

interface WorkbenchLayoutV2Props {
  children: ReactNode;
  persona?: UserPersona;
  activeL2?: string;
  onPersonaChange?: (persona: UserPersona) => void;
  onL2Change?: (itemId: string) => void;
  onCommand?: (command: string, data?: any) => void;
}

/**
 * 新版工作台布局 - 基于6种用户画像
 */
export function WorkbenchLayoutV2({
  children,
  persona: propPersona,
  activeL2: propActiveL2,
  onPersonaChange,
  onL2Change,
  onCommand,
}: WorkbenchLayoutV2Props) {
  const { t } = useLocalization();
  const router = useRouter();

  // 画像状态
  const [persona, setPersona] = useState<UserPersona>(propPersona || 'personal');
  
  // L2导航状态
  const [activeL2, setActiveL2] = useState<string>(propActiveL2 || getDefaultL2(persona));
  
  // UI状态
  const [isL2Collapsed, setIsL2Collapsed] = useState(false);
  const [isAssistantOpen, setIsAssistantOpen] = useState(true);
  const [assistantWidth, setAssistantWidth] = useState(400);
  const [isResizing, setIsResizing] = useState(false);

  // 获取默认L2项
  function getDefaultL2(p: UserPersona): string {
    const config = personaL2Config[p];
    return config[0]?.items[0]?.id || 'overview';
  }

  // 画像切换处理
  const handlePersonaChange = (newPersona: UserPersona) => {
    setPersona(newPersona);
    setActiveL2(getDefaultL2(newPersona));
    onPersonaChange?.(newPersona);
  };

  // L2导航切换处理
  const handleL2Change = (itemId: string) => {
    setActiveL2(itemId);
    onL2Change?.(itemId);
  };

  // Resizing logic
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing) return;
      const newWidth = window.innerWidth - e.clientX;
      if (newWidth >= 300 && newWidth <= window.innerWidth * 0.5) {
        setAssistantWidth(newWidth);
      }
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    if (isResizing) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing]);

  const currentTheme = personaThemes[persona];

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col">
      {/* L0 + L1: 顶部导航 */}
      <L1PersonaNav 
        currentPersona={persona}
        onPersonaChange={handlePersonaChange}
      />

      {/* 主体区域 */}
      <div className="flex-1 flex overflow-hidden">
        {/* L2: 左侧导航 */}
        <L2PersonaSidebar
          persona={persona}
          activeItem={activeL2}
          onItemChange={handleL2Change}
          collapsed={isL2Collapsed}
        />

        {/* L2 折叠按钮 */}
        <button
          onClick={() => setIsL2Collapsed(!isL2Collapsed)}
          className="absolute left-0 top-1/2 -translate-y-1/2 z-10 p-1 bg-slate-800 border border-slate-700 rounded-r-lg text-slate-400 hover:text-white hover:bg-slate-700 transition-all"
          style={{ left: isL2Collapsed ? '64px' : '240px' }}
        >
          {isL2Collapsed ? <PanelLeftOpen className="w-4 h-4" /> : <PanelLeftClose className="w-4 h-4" />}
        </button>

        {/* L3: 主内容区 */}
        <main className="flex-1 overflow-auto">
          {/* 面包屑 + 当前画像指示 */}
          <div className={`bg-gradient-to-r ${currentTheme.bgGradient} border-b ${currentTheme.borderColor} px-6 py-3`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className={`px-2 py-1 rounded-md text-xs font-medium ${currentTheme.badgeColor}`}>
                  {t(currentTheme.name)}
                </span>
                <span className="text-slate-500">/</span>
                <span className="text-sm text-slate-300">
                  {getActiveL2Label()}
                </span>
              </div>
            </div>
          </div>

          {/* 内容区 */}
          <div className="p-6">
            {children}
          </div>
        </main>

        {/* R1: AI 助手侧边栏 */}
        {isAssistantOpen && (
          <>
            {/* 调整大小的拖拽条 */}
            <div
              className="w-1 bg-slate-800 hover:bg-blue-500 cursor-col-resize transition-colors"
              onMouseDown={() => setIsResizing(true)}
            />
            
            <aside 
              className="bg-slate-900 border-l border-slate-800 flex flex-col"
              style={{ width: `${assistantWidth}px` }}
            >
              {/* 助手头部 */}
              <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800">
                <div className="flex items-center gap-2">
                  <MessageCircle className="w-5 h-5 text-blue-400" />
                  <span className="font-medium text-white">
                    {t({ zh: 'AI 助手', en: 'AI Assistant' })}
                  </span>
                </div>
                <button
                  onClick={() => setIsAssistantOpen(false)}
                  className="p-1 text-slate-400 hover:text-white hover:bg-slate-800 rounded transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* 助手聊天区域 */}
              <div className="flex-1 overflow-hidden">
                <UnifiedAgentChat 
                  mode="shopping"
                  onCommand={onCommand}
                  compact={true}
                />
              </div>
            </aside>
          </>
        )}

        {/* 助手折叠时的打开按钮 */}
        {!isAssistantOpen && (
          <button
            onClick={() => setIsAssistantOpen(true)}
            className="fixed right-4 bottom-4 p-4 bg-blue-600 hover:bg-blue-500 text-white rounded-full shadow-lg transition-all z-50"
          >
            <MessageCircle className="w-6 h-6" />
          </button>
        )}
      </div>

      {/* 移动端底部导航 */}
      <MobileBottomNav 
        persona={persona}
        onPersonaSwitch={handlePersonaChange}
      />
    </div>
  );

  // 获取当前L2项的标签
  function getActiveL2Label(): string {
    const config = personaL2Config[persona];
    for (const group of config) {
      const item = group.items.find(i => i.id === activeL2);
      if (item) return t(item.label);
    }
    return activeL2;
  }
}

/**
 * 移动端底部导航 - 对应重构方案2.1.2节
 */
function MobileBottomNav({ 
  persona, 
  onPersonaSwitch 
}: { 
  persona: UserPersona; 
  onPersonaSwitch: (p: UserPersona) => void 
}) {
  const { t } = useLocalization();
  const [showPersonaSheet, setShowPersonaSheet] = useState(false);
  
  const theme = personaThemes[persona];

  return (
    <>
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-slate-900 border-t border-slate-800 z-40 safe-area-pb">
        <div className="flex items-center justify-around h-16">
          {/* 首页 */}
          <button className="flex flex-col items-center gap-1 text-slate-400">
            <span className="text-lg">🏠</span>
            <span className="text-xs">{t({ zh: '首页', en: 'Home' })}</span>
          </button>
          
          {/* Agent */}
          <button className="flex flex-col items-center gap-1 text-slate-400">
            <span className="text-lg">🤖</span>
            <span className="text-xs">{t({ zh: 'Agent', en: 'Agent' })}</span>
          </button>
          
          {/* 资金 */}
          <button className="flex flex-col items-center gap-1 text-slate-400">
            <span className="text-lg">💰</span>
            <span className="text-xs">{t({ zh: '资金', en: 'Funds' })}</span>
          </button>
          
          {/* 设置 */}
          <button className="flex flex-col items-center gap-1 text-slate-400">
            <span className="text-lg">⚙️</span>
            <span className="text-xs">{t({ zh: '设置', en: 'Settings' })}</span>
          </button>
          
          {/* 画像切换 */}
          <button 
            onClick={() => setShowPersonaSheet(true)}
            className={`flex flex-col items-center gap-1 ${theme.textColor}`}
          >
            <span className="text-lg">🎭</span>
            <span className="text-xs">{t({ zh: '切换', en: 'Switch' })}</span>
          </button>
        </div>
      </nav>

      {/* 画像切换底部弹窗 */}
      {showPersonaSheet && (
        <div 
          className="fixed inset-0 z-50 bg-black/50 md:hidden"
          onClick={() => setShowPersonaSheet(false)}
        >
          <div 
            className="absolute bottom-0 left-0 right-0 bg-slate-900 rounded-t-xl p-4 max-h-[70vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-12 h-1 bg-slate-700 rounded-full mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-white mb-4">
              {t({ zh: '选择画像', en: 'Select Persona' })}
            </h3>
            <div className="space-y-2">
              {Object.values(personaThemes).map((p) => {
                const isActive = persona === p.id;
                const Icon = p.icon;
                return (
                  <button
                    key={p.id}
                    onClick={() => {
                      onPersonaSwitch(p.id);
                      setShowPersonaSheet(false);
                    }}
                    className={`w-full flex items-center gap-3 p-3 rounded-lg transition-all
                      ${isActive 
                        ? `${p.badgeColor} border ${p.borderColor}` 
                        : 'bg-slate-800/50 border border-slate-700'
                      }
                    `}
                  >
                    <Icon className={`w-6 h-6 ${isActive ? p.accentColor : 'text-slate-400'}`} />
                    <div className="text-left">
                      <p className={`font-medium ${isActive ? p.textColor : 'text-white'}`}>
                        {t(p.name)}
                      </p>
                      <p className="text-xs text-slate-500">{t(p.tagline)}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default WorkbenchLayoutV2;
