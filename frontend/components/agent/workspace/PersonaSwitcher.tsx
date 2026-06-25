import { useLocalization } from '../../../contexts/LocalizationContext'
import { useAgentMode } from '../../../contexts/AgentModeContext'
import { User, Store, Code, Briefcase, Database, Cpu, ChevronRight, Check } from 'lucide-react'
import { useState } from 'react'

// 五大用户画像类型
export type UserPersona = 
  | 'personal'      // 个人用户
  | 'api_provider'  // API 厂商
  | 'merchant'      // 实物/服务商
  | 'expert'        // 行业专家
  | 'data_provider' // 数据提供方
  | 'developer'     // 全能开发者

// 画像主题色配置
export const personaThemes: Record<UserPersona, {
  primary: string
  secondary: string
  bg: string
  border: string
  label: { zh: string; en: string }
}> = {
  personal: {
    primary: '#3B82F6',      // 蓝色 - 信任、安全
    secondary: '#60A5FA',
    bg: 'bg-blue-500/10',
    border: 'border-blue-500/30',
    label: { zh: '个人版', en: 'Personal' },
  },
  api_provider: {
    primary: '#8B5CF6',      // 紫色 - 技术、创新
    secondary: '#A78BFA',
    bg: 'bg-purple-500/10',
    border: 'border-purple-500/30',
    label: { zh: 'API厂商', en: 'API Provider' },
  },
  merchant: {
    primary: '#10B981',      // 绿色 - 商业、增长
    secondary: '#34D399',
    bg: 'bg-emerald-500/10',
    border: 'border-emerald-500/30',
    label: { zh: '商户版', en: 'Merchant' },
  },
  expert: {
    primary: '#F59E0B',      // 黄色 - 专业、知识
    secondary: '#FBBF24',
    bg: 'bg-amber-500/10',
    border: 'border-amber-500/30',
    label: { zh: '专家版', en: 'Expert' },
  },
  data_provider: {
    primary: '#F97316',      // 橙色 - 数据、洞察
    secondary: '#FB923C',
    bg: 'bg-orange-500/10',
    border: 'border-orange-500/30',
    label: { zh: '数据提供', en: 'Data Provider' },
  },
  developer: {
    primary: '#6B7280',      // 灰色 - 全能、专业
    secondary: '#9CA3AF',
    bg: 'bg-slate-500/10',
    border: 'border-slate-500/30',
    label: { zh: '专业用户', en: 'Professional User' },
  },
}

interface PersonaSwitcherProps {
  currentPersona: UserPersona
  onPersonaChange: (persona: UserPersona) => void
  compact?: boolean
}

/**
 * L1 画像切换组件
 * 支持5种用户画像 + 个人用户
 */
export function PersonaSwitcher({ currentPersona, onPersonaChange, compact = false }: PersonaSwitcherProps) {
  const { t } = useLocalization()
  const [isExpanded, setIsExpanded] = useState(false)

  const personas: Array<{
    key: UserPersona
    icon: React.ReactNode
    description: { zh: string; en: string }
  }> = [
    {
      key: 'personal',
      icon: <User size={18} />,
      description: { zh: '管理个人资产与Agent', en: 'Manage personal assets & agents' },
    },
    {
      key: 'api_provider',
      icon: <Cpu size={18} />,
      description: { zh: '将API转为Agent技能', en: 'Convert APIs to Agent skills' },
    },
    {
      key: 'merchant',
      icon: <Store size={18} />,
      description: { zh: '商品即技能，零门槛入驻', en: 'Products as skills, easy onboarding' },
    },
    {
      key: 'expert',
      icon: <Briefcase size={18} />,
      description: { zh: '知识资产化，专业变现', en: 'Monetize expertise' },
    },
    {
      key: 'data_provider',
      icon: <Database size={18} />,
      description: { zh: '数据即门票，查询即付费', en: 'Data as gateway, query as payment' },
    },
    {
      key: 'developer',
      icon: <Code size={18} />,
      description: { zh: 'Skill工厂，多平台分发', en: 'Skill factory, multi-platform distribution' },
    },
  ]

  const currentTheme = personaThemes[currentPersona]

  if (compact) {
    // 紧凑模式 - 用于顶部导航栏
    return (
      <div className="relative">
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-lg transition-all ${currentTheme.bg} ${currentTheme.border} border`}
          style={{ color: currentTheme.primary }}
        >
          {personas.find(p => p.key === currentPersona)?.icon}
          <span className="text-sm font-medium">{t(currentTheme.label)}</span>
          <ChevronRight size={14} className={`transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
        </button>

        {isExpanded && (
          <>
            <div 
              className="fixed inset-0 z-40" 
              onClick={() => setIsExpanded(false)} 
            />
            <div className="absolute top-full left-0 mt-2 z-50 bg-slate-900 border border-white/10 rounded-xl shadow-2xl p-2 min-w-[240px]">
              {personas.map((persona) => {
                const theme = personaThemes[persona.key]
                const isActive = currentPersona === persona.key
                return (
                  <button
                    key={persona.key}
                    onClick={() => {
                      onPersonaChange(persona.key)
                      setIsExpanded(false)
                    }}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all ${
                      isActive ? theme.bg : 'hover:bg-white/5'
                    }`}
                  >
                    <span style={{ color: theme.primary }}>{persona.icon}</span>
                    <div className="flex-1 text-left">
                      <div className={`text-sm font-medium ${isActive ? 'text-white' : 'text-slate-300'}`}>
                        {t(theme.label)}
                      </div>
                      <div className="text-xs text-slate-500">{t(persona.description)}</div>
                    </div>
                    {isActive && <Check size={16} style={{ color: theme.primary }} />}
                  </button>
                )
              })}
            </div>
          </>
        )}
      </div>
    )
  }

  // 完整模式 - L1 横向切换栏
  return (
    <div className="flex items-center gap-1 px-4 py-2 bg-slate-900/50 border-b border-white/5 overflow-x-auto">
      {personas.map((persona) => {
        const theme = personaThemes[persona.key]
        const isActive = currentPersona === persona.key
        return (
          <button
            key={persona.key}
            onClick={() => onPersonaChange(persona.key)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg whitespace-nowrap transition-all ${
              isActive 
                ? `${theme.bg} ${theme.border} border` 
                : 'hover:bg-white/5 border border-transparent'
            }`}
            style={{ color: isActive ? theme.primary : undefined }}
          >
            {persona.icon}
            <span className={`text-sm font-medium ${isActive ? '' : 'text-slate-400'}`}>
              {t(theme.label)}
            </span>
          </button>
        )
      })}
    </div>
  )
}

export default PersonaSwitcher
