'use client';

/**
 * L1 Persona Navigation Bar - 画像导航栏
 * 对应重构方案 2.1 节的 L1 设计
 * 
 * 架构：
 * - L1: 画像切换栏（6种画像，带颜色主题）
 * - 每个画像有独立的颜色主题和L2导航配置
 */

import { useState } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import { 
  User,
  Plug,
  Store,
  GraduationCap,
  Database,
  Code2,
  Settings,
  Bell,
  Search,
  Menu,
  X,
  ChevronDown
} from 'lucide-react';
import { useLocalization } from '../../contexts/LocalizationContext';
import { useUser } from '../../contexts/UserContext';
import { UserMenu } from '../auth/UserMenu';
import { UserPersona, personaThemes } from '../onboarding/PersonaSelector';

interface L1PersonaNavProps {
  currentPersona: UserPersona;
  onPersonaChange: (persona: UserPersona) => void;
  onConfigOpen?: () => void;
}

/**
 * L1 画像导航栏 - 支持6种画像切换
 * 带颜色主题指示和渐变背景
 */
export function L1PersonaNav({ 
  currentPersona, 
  onPersonaChange,
  onConfigOpen 
}: L1PersonaNavProps) {
  const { t } = useLocalization();
  const { user, isAuthenticated } = useUser();
  const router = useRouter();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);

  const currentTheme = personaThemes[currentPersona];

  // 画像图标映射
  const personaIcons: Record<UserPersona, React.ComponentType<{ className?: string }>> = {
    personal: User,
    api_provider: Plug,
    merchant: Store,
    expert: GraduationCap,
    data_provider: Database,
    developer: Code2,
  };

  return (
    <>
      {/* Desktop Navigation */}
      <header className="hidden md:block">
        {/* L0: 全局顶栏 */}
        <div className="bg-slate-900 border-b border-slate-800 h-12 flex items-center px-4">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2 mr-6">
            <img src="/brand/logo-icon.png" alt="Agentrix" className="w-8 h-8 rounded-lg" />
            <span className="text-white font-bold">Agentrix</span>
          </Link>

          {/* 全局搜索 */}
          <div className="flex-1 max-w-xl mx-auto">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
              <input
                type="text"
                placeholder={t({ zh: '🔍 全局搜索 / AI 指令输入...', en: '🔍 Global Search / AI Commands...' })}
                className="w-full pl-10 pr-4 py-2 bg-slate-800/60 border border-slate-700 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/50"
              />
              <kbd className="absolute right-3 top-1/2 -translate-y-1/2 px-2 py-0.5 text-xs text-slate-500 bg-slate-700 rounded">
                ⌘K
              </kbd>
            </div>
          </div>

          {/* 右侧工具 */}
          <div className="flex items-center gap-3 ml-6">
            <button className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors relative">
              <Bell className="w-5 h-5" />
              <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full" />
            </button>
            {onConfigOpen && (
              <button 
                onClick={onConfigOpen}
                className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
              >
                <Settings className="w-5 h-5" />
              </button>
            )}
            {isAuthenticated && user ? (
              <UserMenu />
            ) : (
              <Link
                href="/auth/login"
                className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-lg transition-colors"
              >
                {t({ zh: '登录', en: 'Login' })}
              </Link>
            )}
          </div>
        </div>

        {/* L1: 画像切换栏（带颜色主题） */}
        <div className={`bg-gradient-to-r ${currentTheme.bgGradient} border-b ${currentTheme.borderColor}`}>
          <div className="flex items-center justify-center gap-2 px-4 py-2">
            {Object.values(personaThemes).map((persona) => {
              const Icon = personaIcons[persona.id];
              const isActive = currentPersona === persona.id;

              return (
                <button
                  key={persona.id}
                  onClick={() => onPersonaChange(persona.id)}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-all duration-200
                    ${isActive 
                      ? `${persona.badgeColor} border ${persona.borderColor} shadow-sm` 
                      : 'text-slate-400 hover:text-white hover:bg-slate-800/30'
                    }
                  `}
                  title={t(persona.description)}
                >
                  <Icon className={`w-4 h-4 ${isActive ? persona.accentColor : ''}`} />
                  <span className={`text-sm font-medium ${isActive ? persona.textColor : ''}`}>
                    {t(persona.name)}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </header>

      {/* Mobile Navigation */}
      <header className="md:hidden">
        {/* Mobile Top Bar */}
        <div className="bg-slate-900 border-b border-slate-800 h-14 flex items-center justify-between px-4">
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="p-2 text-slate-400 hover:text-white"
          >
            {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>

          <Link href="/" className="flex items-center gap-2">
            <img src="/brand/logo-icon.png" alt="Agentrix" className="w-7 h-7 rounded-lg" />
            <span className="text-white font-bold text-sm">Agentrix</span>
          </Link>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setSearchOpen(true)}
              className="p-2 text-slate-400 hover:text-white"
            >
              <Search className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Mobile Persona Bar */}
        <div className={`bg-gradient-to-r ${currentTheme.bgGradient} border-b ${currentTheme.borderColor} overflow-x-auto`}>
          <div className="flex items-center gap-1 px-2 py-2 min-w-max">
            {Object.values(personaThemes).map((persona) => {
              const Icon = personaIcons[persona.id];
              const isActive = currentPersona === persona.id;

              return (
                <button
                  key={persona.id}
                  onClick={() => onPersonaChange(persona.id)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-all whitespace-nowrap
                    ${isActive 
                      ? `${persona.badgeColor} border ${persona.borderColor}` 
                      : 'text-slate-400'
                    }
                  `}
                >
                  <Icon className={`w-4 h-4 ${isActive ? persona.accentColor : ''}`} />
                  <span className={`text-xs font-medium ${isActive ? persona.textColor : ''}`}>
                    {t(persona.name)}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Mobile Menu Overlay */}
        {mobileMenuOpen && (
          <div 
            className="fixed inset-0 z-50 bg-black/50" 
            onClick={() => setMobileMenuOpen(false)}
          >
            <div 
              className="absolute top-14 left-0 right-0 bg-slate-900 border-b border-slate-800 p-4 max-h-[80vh] overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="mb-4">
                <p className="text-xs text-slate-500 uppercase mb-2">
                  {t({ zh: '选择画像', en: 'Select Persona' })}
                </p>
                <div className="grid grid-cols-2 gap-2">
                  {Object.values(personaThemes).map((persona) => {
                    const Icon = personaIcons[persona.id];
                    const isActive = currentPersona === persona.id;

                    return (
                      <button
                        key={persona.id}
                        onClick={() => {
                          onPersonaChange(persona.id);
                          setMobileMenuOpen(false);
                        }}
                        className={`flex items-center gap-2 p-3 rounded-lg transition-all text-left
                          ${isActive 
                            ? `${persona.badgeColor} border ${persona.borderColor}` 
                            : 'bg-slate-800/50 border border-slate-700'
                          }
                        `}
                      >
                        <Icon className={`w-5 h-5 ${isActive ? persona.accentColor : 'text-slate-400'}`} />
                        <div>
                          <p className={`text-sm font-medium ${isActive ? persona.textColor : 'text-white'}`}>
                            {t(persona.name)}
                          </p>
                          <p className="text-xs text-slate-500 line-clamp-1">
                            {t(persona.tagline)}
                          </p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        )}
      </header>
    </>
  );
}

export default L1PersonaNav;
