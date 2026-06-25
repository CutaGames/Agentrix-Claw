import { useState, useEffect, ReactNode } from 'react';
import { useRouter } from 'next/router';
import { L1TopNav, MobileBottomNav, L1Tab } from './L1TopNav';
import { L2LeftSidebar, L2SubItem } from './L2LeftSidebar';
import { ConfigDrawer } from './ConfigDrawer';
import { UnifiedAgentChat, AgentMode } from '../agent/UnifiedAgentChat';
import { useAgentMode } from '../../contexts/AgentModeContext';
import { useLocalization } from '../../contexts/LocalizationContext';
import { MessageCircle, X, ChevronLeft, ChevronRight, Menu } from 'lucide-react';

interface WorkbenchLayoutProps {
  children: ReactNode;
  activeL1?: L1Tab;
  activeL2?: L2SubItem;
  onL1Change?: (tab: L1Tab) => void;
  onL2Change?: (item: L2SubItem) => void;
  onConfigItemClick?: (section: string, item: string) => void;
  onCommand?: (command: string, data?: any) => void;
}

export function WorkbenchLayout({
  children,
  activeL1: propActiveL1,
  activeL2: propActiveL2,
  onL1Change,
  onL2Change,
  onConfigItemClick,
  onCommand,
}: WorkbenchLayoutProps) {
  const { mode, setMode } = useAgentMode();
  const { t } = useLocalization();
  const router = useRouter();

  // Default L1 tabs for each mode
  const defaultL1: Record<string, L1Tab> = {
    personal: 'dashboard',
    merchant: 'dashboard',
    developer: 'dashboard',
  };

  // Default L2 items for each L1
  const defaultL2: Record<L1Tab, L2SubItem> = {
    dashboard: 'overview',
    agents: 'my-agents',
    earn: 'auto-tasks',
    shop: 'browse',
    pay: 'transactions',
    assets: 'wallets',
    products: 'list',
    orders: 'all-orders',
    finance: 'overview',
    analytics: 'sales',
    build: 'skill-factory',
    publish: 'marketplace',
    revenue: 'earnings',
    docs: 'api-reference',
    settings: 'general',
    skills: 'my-skills',
    security: 'sessions',
    // New account system tabs
    'unified-account': 'balances',
    'agent-accounts': 'my-agents',
    'kyc': 'status',
    'workspaces': 'list',
    'promotion': 'overview',
  };

  const [activeL1, setActiveL1] = useState<L1Tab>(propActiveL1 || defaultL1[mode]);
  const [activeL2, setActiveL2] = useState<L2SubItem>(propActiveL2 || defaultL2[activeL1]);
  const [isConfigOpen, setIsConfigOpen] = useState(false);
  const [isMobileL2Open, setIsMobileL2Open] = useState(false);
  const [isAssistantOpen, setIsAssistantOpen] = useState(true);
  const [isL2SidebarOpen, setIsL2SidebarOpen] = useState(true);
  const [isMobileAssistantOpen, setIsMobileAssistantOpen] = useState(false);
  const [assistantWidth, setAssistantWidth] = useState(400);
  const [isResizing, setIsResizing] = useState(false);

  // Resizing logic
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing) return;
      const newWidth = window.innerWidth - e.clientX;
      if (newWidth >= 300 && newWidth <= window.innerWidth * 0.6) {
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

  // Sync with props
  useEffect(() => {
    if (propActiveL1) setActiveL1(propActiveL1);
  }, [propActiveL1]);

  useEffect(() => {
    if (propActiveL2) setActiveL2(propActiveL2);
  }, [propActiveL2]);

  // Update L2 when L1 changes
  useEffect(() => {
    if (!propActiveL2) {
      setActiveL2(defaultL2[activeL1] || 'overview');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeL1, propActiveL2]);

  const handleL1Change = (tab: L1Tab) => {
    setActiveL1(tab);
    if (onL1Change) {
      onL1Change(tab);
    }
  };

  const handleL2Change = (item: L2SubItem) => {
    setActiveL2(item);
    if (onL2Change) {
      onL2Change(item);
    }
  };

  const handleConfigOpen = () => {
    setIsConfigOpen(true);
  };

  const handleConfigClose = () => {
    setIsConfigOpen(false);
  };

  const handleConfigItemClick = (section: string, item: string) => {
    if (onConfigItemClick) {
      onConfigItemClick(section, item);
    }
  };

  // Map mode to AgentMode for chat
  const agentMode: AgentMode = mode === 'personal' ? 'user' : mode;

  const handleModeChange = (newMode: AgentMode) => {
    const contextMode = newMode === 'user' ? 'personal' : newMode;
    setMode(contextMode as 'personal' | 'merchant' | 'developer');
  };

  const handleCommand = (command: string, data?: any) => {
    if (onCommand) {
      return onCommand(command, data);
    }
    return { success: false };
  };

  // Get current location text
  const getLocationText = () => {
    const l1Labels: Record<L1Tab, { zh: string; en: string }> = {
      dashboard: { zh: '控制台', en: 'Dashboard' },
      agents: { zh: 'Agent', en: 'Agent' },
      earn: { zh: '赚钱', en: 'Earn' },
      shop: { zh: '购物', en: 'Shop' },
      pay: { zh: '支付', en: 'Pay' },
      assets: { zh: '资产', en: 'Assets' },
      products: { zh: '商品', en: 'Products' },
      orders: { zh: '订单', en: 'Orders' },
      finance: { zh: '财务', en: 'Finance' },
      analytics: { zh: '分析', en: 'Analytics' },
      build: { zh: '构建', en: 'Build' },
      publish: { zh: '发布', en: 'Publish' },
      revenue: { zh: '收益', en: 'Revenue' },
      docs: { zh: '文档', en: 'Docs' },
      settings: { zh: '设置', en: 'Settings' },
      skills: { zh: '技能', en: 'Skills' },
      security: { zh: '安全', en: 'Security' },
      // New account system tabs
      'unified-account': { zh: '统一账户', en: 'Unified Account' },
      'agent-accounts': { zh: 'Agent 账户', en: 'Agent Accounts' },
      'kyc': { zh: '实名认证', en: 'KYC' },
      'workspaces': { zh: '工作空间', en: 'Workspaces' },
      'promotion': { zh: '推广', en: 'Promotion' },
    };
    return t(l1Labels[activeL1] || { zh: activeL1, en: activeL1 });
  };

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col">
      {/* L1 Top Navigation - 功能导航 */}
      <L1TopNav
        activeTab={activeL1}
        onTabChange={handleL1Change}
        onConfigOpen={handleConfigOpen}
      />

      {/* Main Content Area */}
      <div className="flex-1 flex overflow-hidden">
        {/* L2 Left Sidebar */}
        <L2LeftSidebar
          activeL1={activeL1}
          activeL2={activeL2}
          onL2Change={handleL2Change}
          isOpen={isMobileL2Open}
          onClose={() => setIsMobileL2Open(false)}
          isCollapsed={!isL2SidebarOpen}
        />

        {/* Main Content */}
        <main className="flex-1 flex flex-col overflow-hidden">
          {/* Breadcrumb / Status Bar */}
          <div className="h-10 border-b border-slate-800 flex items-center justify-between px-4 bg-slate-900/30">
            <div className="flex items-center gap-2">
              {/* Mobile L2 Toggle */}
              <button
                onClick={() => setIsMobileL2Open(true)}
                className="md:hidden p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
              >
                <ChevronRight size={16} />
              </button>

              {/* Desktop L2 Toggle */}
              <button
                onClick={() => setIsL2SidebarOpen(!isL2SidebarOpen)}
                className="hidden md:flex p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
                title={isL2SidebarOpen ? t({ zh: '收起侧边栏', en: 'Collapse Sidebar' }) : t({ zh: '展开侧边栏', en: 'Expand Sidebar' })}
              >
                {isL2SidebarOpen ? <ChevronLeft size={16} /> : <Menu size={16} />}
              </button>

              <span className="text-xs text-slate-500 uppercase tracking-wider font-medium">
                {getLocationText()}
              </span>
              <span className="text-slate-600">/</span>
              <span className="text-xs text-slate-300 font-medium capitalize">
                {activeL2.replace(/-/g, ' ')}
              </span>
            </div>

            <div className="flex items-center gap-2">
              {/* Live Sync Indicator */}
              <div className="hidden md:flex items-center gap-1.5">
                <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                <span className="text-[10px] text-slate-500 font-mono uppercase">Live</span>
              </div>

              {/* Mobile Assistant Toggle */}
              <button
                onClick={() => setIsMobileAssistantOpen(true)}
                className="md:hidden p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
              >
                <MessageCircle size={16} />
              </button>

              {/* Desktop Assistant Toggle */}
              <button
                onClick={() => setIsAssistantOpen(!isAssistantOpen)}
                className="hidden md:flex p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
                title={isAssistantOpen ? t({ zh: '隐藏助手', en: 'Hide Assistant' }) : t({ zh: '显示助手', en: 'Show Assistant' })}
              >
                {isAssistantOpen ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
              </button>
            </div>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto">
            {children}
          </div>
        </main>

        {/* Desktop Assistant Panel */}
        {isAssistantOpen && (
          <>
            {/* Desktop Resizer */}
            <div 
              className={`hidden md:block w-1.5 hover:w-2 bg-slate-800/10 hover:bg-blue-500/30 cursor-col-resize transition-all z-10 ${isResizing ? 'bg-blue-500/50 w-2' : ''}`}
              onMouseDown={() => setIsResizing(true)}
            />
            <aside 
              className="hidden md:flex flex-col bg-slate-900 border-l border-slate-800"
              style={{ width: `${assistantWidth}px` }}
            >
              {/* Assistant Header */}
              <div className="h-10 border-b border-slate-800 flex items-center justify-between px-3 bg-slate-900/80">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                <span className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                  Agentrix Brain
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] bg-slate-800 text-slate-400 px-1.5 py-0.5 rounded border border-slate-700 font-mono">
                  {mode.toUpperCase()}
                </span>
                <button
                  onClick={() => setIsAssistantOpen(false)}
                  className="p-1 text-slate-500 hover:text-white transition-colors"
                  title={t({ zh: '关闭助手', en: 'Close Assistant' })}
                >
                  <X size={14} />
                </button>
              </div>
            </div>

            {/* Assistant Content */}
            <div className="flex-1 overflow-hidden">
              <UnifiedAgentChat
                mode={agentMode}
                onModeChange={handleModeChange}
                onCommand={handleCommand}
                standalone={false}
              />
            </div>
          </aside>
        </>
        )}

        {/* Mobile Assistant Drawer */}
        {isMobileAssistantOpen && (
          <div className="md:hidden fixed inset-0 z-50">
            {/* Overlay */}
            <div 
              className="absolute inset-0 bg-black/50" 
              onClick={() => setIsMobileAssistantOpen(false)}
            />
            
            {/* Drawer */}
            <aside className="absolute right-0 top-0 bottom-0 w-full max-w-md bg-slate-900 shadow-xl animate-slide-in-right flex flex-col">
              {/* Header */}
              <div className="flex items-center justify-between p-3 border-b border-slate-800">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                  <span className="text-sm font-bold text-white">Agentrix Brain</span>
                </div>
                <button
                  onClick={() => setIsMobileAssistantOpen(false)}
                  className="p-1.5 text-slate-400 hover:text-white"
                >
                  <X size={18} />
                </button>
              </div>

              {/* Content */}
              <div className="flex-1 overflow-hidden">
                <UnifiedAgentChat
                  mode={agentMode}
                  onModeChange={handleModeChange}
                  onCommand={handleCommand}
                  standalone={false}
                />
              </div>
            </aside>
          </div>
        )}
      </div>

      {/* Mobile Bottom Navigation */}
      <MobileBottomNav
        activeTab={activeL1}
        onTabChange={handleL1Change}
      />

      {/* Config Drawer */}
      <ConfigDrawer
        isOpen={isConfigOpen}
        onClose={handleConfigClose}
        onItemClick={handleConfigItemClick}
      />

      {/* CSS for animations */}
      <style jsx global>{`
        @keyframes slide-in-left {
          from {
            transform: translateX(-100%);
          }
          to {
            transform: translateX(0);
          }
        }

        @keyframes slide-in-right {
          from {
            transform: translateX(100%);
          }
          to {
            transform: translateX(0);
          }
        }

        .animate-slide-in-left {
          animation: slide-in-left 0.2s ease-out;
        }

        .animate-slide-in-right {
          animation: slide-in-right 0.2s ease-out;
        }

        .safe-area-pb {
          padding-bottom: env(safe-area-inset-bottom, 0);
        }

        /* Hide scrollbar but keep functionality */
        .scrollbar-hide {
          -ms-overflow-style: none;
          scrollbar-width: none;
        }

        .scrollbar-hide::-webkit-scrollbar {
          display: none;
        }
      `}</style>
    </div>
  );
}
