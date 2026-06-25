'use client';

import { useState } from 'react';
import { useLocalization } from '../../contexts/LocalizationContext';
import { 
  Plug, 
  Store, 
  GraduationCap, 
  Database, 
  Code2, 
  User,
  ArrowRight,
  Sparkles,
  CheckCircle2
} from 'lucide-react';

/**
 * 用户画像类型 - 对应重构方案2.1节
 * 6种画像 + 颜色主题
 */
export type UserPersona = 
  | 'personal'      // 个人版 - 消费者视角 🔵蓝
  | 'api_provider'  // API厂商 - 将API转为Agent技能 🟣紫
  | 'merchant'      // 实物/服务商 - 商品即技能 🟢绿
  | 'expert'        // 行业专家 - 知识资产化 🟡黄
  | 'data_provider' // 数据提供方 - 数据即门票 🟠橙
  | 'developer';    // 全能开发者 - 技能创建到分发 ⚫灰

/**
 * 画像主题色配置 - 对应重构方案2.1.1节
 */
export interface PersonaTheme {
  id: UserPersona;
  name: { zh: string; en: string };
  description: { zh: string; en: string };
  tagline: { zh: string; en: string };
  icon: React.ComponentType<{ className?: string }>;
  // 颜色配置
  primaryColor: string;      // 主色 (Tailwind class)
  bgGradient: string;        // 背景渐变
  accentColor: string;       // 强调色
  borderColor: string;       // 边框色
  textColor: string;         // 文字色
  badgeColor: string;        // 标签色
  // 功能配置
  defaultL2: string;         // 默认L2导航
  features: string[];        // 核心功能
}

export const personaThemes: Record<UserPersona, PersonaTheme> = {
  personal: {
    id: 'personal',
    name: { zh: '个人版', en: 'Personal' },
    description: { zh: '使用Agent服务，管理资产与订阅', en: 'Use Agent services, manage assets & subscriptions' },
    tagline: { zh: '智能生活助手', en: 'Smart Life Assistant' },
    icon: User,
    primaryColor: 'blue',
    bgGradient: 'from-blue-500/20 to-cyan-500/10',
    accentColor: 'text-blue-400',
    borderColor: 'border-blue-500/30',
    textColor: 'text-blue-300',
    badgeColor: 'bg-blue-500/20 text-blue-400',
    defaultL2: 'overview',
    features: ['Agent订阅', '资产管理', '智能购物', '自动赚钱'],
  },
  api_provider: {
    id: 'api_provider',
    name: { zh: 'API厂商', en: 'API Provider' },
    description: { zh: '将现有API转化为Agent可调用的技能', en: 'Transform APIs into Agent-callable skills' },
    tagline: { zh: '将API转为Agent技能', en: 'Turn APIs into Agent Skills' },
    icon: Plug,
    primaryColor: 'purple',
    bgGradient: 'from-purple-500/20 to-violet-500/10',
    accentColor: 'text-purple-400',
    borderColor: 'border-purple-500/30',
    textColor: 'text-purple-300',
    badgeColor: 'bg-purple-500/20 text-purple-400',
    defaultL2: 'api-import',
    features: ['OpenAPI导入', '自动Schema生成', 'API限额管理', '收益分成'],
  },
  merchant: {
    id: 'merchant',
    name: { zh: '商户版', en: 'Merchant' },
    description: { zh: '商品自动技能化，零门槛入驻AI生态', en: 'Auto-skillify products, zero-barrier AI ecosystem entry' },
    tagline: { zh: '商品即技能', en: 'Products as Skills' },
    icon: Store,
    primaryColor: 'green',
    bgGradient: 'from-green-500/20 to-emerald-500/10',
    accentColor: 'text-green-400',
    borderColor: 'border-green-500/30',
    textColor: 'text-green-300',
    badgeColor: 'bg-green-500/20 text-green-400',
    defaultL2: 'products',
    features: ['商品同步', 'UCP协议', '订单管理', 'AI流量入口'],
  },
  expert: {
    id: 'expert',
    name: { zh: '专家版', en: 'Expert' },
    description: { zh: '知识资产化，专业能力变现', en: 'Monetize knowledge, turn expertise into assets' },
    tagline: { zh: '知识资产化', en: 'Knowledge as Asset' },
    icon: GraduationCap,
    primaryColor: 'yellow',
    bgGradient: 'from-yellow-500/20 to-amber-500/10',
    accentColor: 'text-yellow-400',
    borderColor: 'border-yellow-500/30',
    textColor: 'text-yellow-300',
    badgeColor: 'bg-yellow-500/20 text-yellow-400',
    defaultL2: 'capability-cards',
    features: ['能力卡片', 'SLA配置', '咨询定价', '专家认证'],
  },
  data_provider: {
    id: 'data_provider',
    name: { zh: '数据提供', en: 'Data Provider' },
    description: { zh: '数据即门票，查询即付费', en: 'Data as ticket, query as payment' },
    tagline: { zh: '数据即门票', en: 'Data as Ticket' },
    icon: Database,
    primaryColor: 'orange',
    bgGradient: 'from-orange-500/20 to-amber-500/10',
    accentColor: 'text-orange-400',
    borderColor: 'border-orange-500/30',
    textColor: 'text-orange-300',
    badgeColor: 'bg-orange-500/20 text-orange-400',
    defaultL2: 'datasets',
    features: ['数据接入', 'RAG索引', 'X402计费', '隐私控制'],
  },
  developer: {
    id: 'developer',
    name: { zh: '开发者版', en: 'Developer' },
    description: { zh: '从技能创建到全球分发，一站式解决方案', en: 'End-to-end solution from skill creation to global distribution' },
    tagline: { zh: '技能工厂', en: 'Skill Factory' },
    icon: Code2,
    primaryColor: 'slate',
    bgGradient: 'from-slate-500/20 to-gray-500/10',
    accentColor: 'text-slate-300',
    borderColor: 'border-slate-500/30',
    textColor: 'text-slate-300',
    badgeColor: 'bg-slate-500/20 text-slate-300',
    defaultL2: 'skill-factory',
    features: ['Skill工厂', '工作流编排', '多平台分发', 'MCP集成'],
  },
};

interface PersonaSelectorProps {
  currentPersona?: UserPersona;
  onSelect: (persona: UserPersona) => void;
  showDescription?: boolean;
  variant?: 'full' | 'compact' | 'onboarding';
}

/**
 * 画像选择器组件 - 对应重构方案2.4节
 * 用于入驻流程和画像切换
 */
export function PersonaSelector({
  currentPersona,
  onSelect,
  showDescription = true,
  variant = 'full',
}: PersonaSelectorProps) {
  const { t } = useLocalization();
  const [hoveredPersona, setHoveredPersona] = useState<UserPersona | null>(null);

  // B端画像（需要入驻）
  const businessPersonas: UserPersona[] = ['api_provider', 'merchant', 'expert', 'data_provider', 'developer'];
  
  // C端画像（直接使用）
  const consumerPersona: UserPersona = 'personal';

  if (variant === 'onboarding') {
    return (
      <div className="space-y-8">
        {/* 标题 */}
        <div className="text-center">
          <h2 className="text-2xl font-bold text-white mb-2">
            {t({ zh: '欢迎加入 Agentrix 生态', en: 'Welcome to Agentrix Ecosystem' })}
          </h2>
          <p className="text-slate-400">
            {t({ zh: '您是哪类生态参与者？', en: 'What type of ecosystem participant are you?' })}
          </p>
        </div>

        {/* B端画像网格 */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {businessPersonas.map((personaId) => {
            const persona = personaThemes[personaId];
            const Icon = persona.icon;
            const isSelected = currentPersona === personaId;
            const isHovered = hoveredPersona === personaId;

            return (
              <button
                key={personaId}
                onClick={() => onSelect(personaId)}
                onMouseEnter={() => setHoveredPersona(personaId)}
                onMouseLeave={() => setHoveredPersona(null)}
                className={`relative p-6 rounded-xl border-2 transition-all duration-300 text-left group
                  ${isSelected 
                    ? `bg-gradient-to-br ${persona.bgGradient} ${persona.borderColor} shadow-lg` 
                    : 'bg-slate-800/50 border-slate-700 hover:border-slate-600'
                  }
                `}
              >
                {isSelected && (
                  <div className="absolute top-3 right-3">
                    <CheckCircle2 className={`w-5 h-5 ${persona.accentColor}`} />
                  </div>
                )}
                
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center mb-4
                  ${isSelected || isHovered ? `bg-${persona.primaryColor}-500/20` : 'bg-slate-700/50'}
                `}>
                  <Icon className={`w-6 h-6 ${isSelected || isHovered ? persona.accentColor : 'text-slate-400'}`} />
                </div>
                
                <h3 className={`font-semibold mb-1 ${isSelected ? persona.textColor : 'text-white'}`}>
                  {t(persona.name)}
                </h3>
                
                <p className="text-sm text-slate-400 mb-3">
                  {t(persona.tagline)}
                </p>

                {showDescription && (
                  <p className="text-xs text-slate-500 line-clamp-2">
                    {t(persona.description)}
                  </p>
                )}

                <div className={`mt-4 flex items-center gap-1 text-xs ${persona.accentColor} opacity-0 group-hover:opacity-100 transition-opacity`}>
                  <span>{t({ zh: '开始入驻', en: 'Get Started' })}</span>
                  <ArrowRight className="w-3 h-3" />
                </div>
              </button>
            );
          })}
        </div>

        {/* 全能开发者 - 大卡片 */}
        <button
          onClick={() => onSelect('developer')}
          onMouseEnter={() => setHoveredPersona('developer')}
          onMouseLeave={() => setHoveredPersona(null)}
          className={`w-full p-6 rounded-xl border-2 transition-all duration-300 text-left
            ${currentPersona === 'developer'
              ? `bg-gradient-to-br ${personaThemes.developer.bgGradient} ${personaThemes.developer.borderColor} shadow-lg`
              : 'bg-slate-800/50 border-slate-700 hover:border-slate-600'
            }
          `}
        >
          <div className="flex items-center gap-4">
            <div className={`w-14 h-14 rounded-xl flex items-center justify-center
              ${currentPersona === 'developer' ? 'bg-slate-500/20' : 'bg-slate-700/50'}
            `}>
              <Code2 className={`w-7 h-7 ${currentPersona === 'developer' ? 'text-slate-300' : 'text-slate-400'}`} />
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <h3 className="font-semibold text-white">
                  {t({ zh: '💻 全能 AI 开发者', en: '💻 Full-stack AI Developer' })}
                </h3>
                {currentPersona === 'developer' && (
                  <CheckCircle2 className="w-5 h-5 text-slate-300" />
                )}
              </div>
              <p className="text-sm text-slate-400">
                {t({ zh: '从技能创建到全球分发，Agentrix 解决底层支付与合规', en: 'From skill creation to global distribution, Agentrix handles payments & compliance' })}
              </p>
            </div>
            <ArrowRight className="w-5 h-5 text-slate-500" />
          </div>
        </button>

        {/* 个人用户入口 */}
        <div className="text-center pt-4 border-t border-slate-800">
          <button
            onClick={() => onSelect('personal')}
            className="text-sm text-slate-400 hover:text-blue-400 transition-colors"
          >
            {t({ zh: '我只是想使用 Agent 服务 →', en: "I just want to use Agent services →" })}
            <span className="ml-2 text-blue-400">
              {t({ zh: '个人用户入口', en: 'Personal User Entry' })}
            </span>
          </button>
        </div>
      </div>
    );
  }

  // Compact variant - 用于顶栏切换
  if (variant === 'compact') {
    return (
      <div className="flex items-center gap-1 px-1 py-0.5 rounded-lg bg-slate-800/60 border border-slate-700">
        {Object.values(personaThemes).map((persona) => {
          const Icon = persona.icon;
          const isActive = currentPersona === persona.id;
          
          return (
            <button
              key={persona.id}
              onClick={() => onSelect(persona.id)}
              title={t(persona.name)}
              className={`relative px-3 py-1.5 rounded-md transition-all duration-200 flex items-center gap-1.5
                ${isActive 
                  ? `bg-gradient-to-r ${persona.bgGradient} ${persona.borderColor} border` 
                  : 'text-slate-400 hover:text-white hover:bg-slate-700/50'
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
    );
  }

  // Full variant - 用于设置页面
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
      {Object.values(personaThemes).map((persona) => {
        const Icon = persona.icon;
        const isSelected = currentPersona === persona.id;

        return (
          <button
            key={persona.id}
            onClick={() => onSelect(persona.id)}
            className={`p-4 rounded-xl border-2 transition-all duration-300 text-left
              ${isSelected 
                ? `bg-gradient-to-br ${persona.bgGradient} ${persona.borderColor} shadow-lg` 
                : 'bg-slate-800/50 border-slate-700 hover:border-slate-600'
              }
            `}
          >
            <div className="flex items-start gap-3">
              <div className={`w-10 h-10 rounded-lg flex items-center justify-center
                ${isSelected ? `bg-${persona.primaryColor}-500/20` : 'bg-slate-700/50'}
              `}>
                <Icon className={`w-5 h-5 ${isSelected ? persona.accentColor : 'text-slate-400'}`} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <h4 className={`font-medium ${isSelected ? persona.textColor : 'text-white'}`}>
                    {t(persona.name)}
                  </h4>
                  {isSelected && <CheckCircle2 className={`w-4 h-4 ${persona.accentColor}`} />}
                </div>
                {showDescription && (
                  <p className="text-xs text-slate-500 mt-1 line-clamp-2">
                    {t(persona.tagline)}
                  </p>
                )}
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}

/**
 * 画像切换栏组件 - 对应重构方案L1
 * 固定在顶部，带颜色主题指示
 */
export function PersonaSwitcherBar({
  currentPersona,
  onSwitch,
}: {
  currentPersona: UserPersona;
  onSwitch: (persona: UserPersona) => void;
}) {
  const { t } = useLocalization();
  const currentTheme = personaThemes[currentPersona];

  return (
    <div className={`flex items-center gap-2 px-4 py-2 bg-gradient-to-r ${currentTheme.bgGradient} border-b ${currentTheme.borderColor}`}>
      {Object.values(personaThemes).map((persona) => {
        const Icon = persona.icon;
        const isActive = currentPersona === persona.id;

        return (
          <button
            key={persona.id}
            onClick={() => onSwitch(persona.id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-all duration-200
              ${isActive 
                ? `${persona.badgeColor} border ${persona.borderColor}` 
                : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
              }
            `}
          >
            <Icon className={`w-4 h-4 ${isActive ? persona.accentColor : ''}`} />
            <span className={`text-sm font-medium ${isActive ? persona.textColor : ''}`}>
              {t(persona.name)}
            </span>
          </button>
        );
      })}
    </div>
  );
}

export default PersonaSelector;
