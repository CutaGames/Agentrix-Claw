/**
 * 用户画像主题配置
 * Persona Theme Configuration
 */

import { Home, Wallet, Bot, Settings, Package, Code, TrendingUp, ShieldCheck, Zap } from 'lucide-react';

export type UserPersona = 
  | 'personal' 
  | 'api_provider' 
  | 'merchant' 
  | 'expert' 
  | 'data_provider' 
  | 'developer';

export interface PersonaTheme {
  primary: string;
  secondary: string;
  accent: string;
  gradient: string;
  gradientFrom: string;
  gradientTo: string;
  icon: string;
  label: {
    zh: string;
    en: string;
  };
  description: {
    zh: string;
    en: string;
  };
}

export const personaThemes: Record<UserPersona, PersonaTheme> = {
  personal: {
    primary: '#3B82F6',
    secondary: '#60A5FA',
    accent: '#2563EB',
    gradient: 'from-blue-500 to-blue-600',
    gradientFrom: '#3B82F6',
    gradientTo: '#2563EB',
    icon: 'user',
    label: { zh: '个人版', en: 'Personal' },
    description: { zh: '使用 Agent 服务', en: 'Use Agent services' },
  },
  api_provider: {
    primary: '#8B5CF6',
    secondary: '#A78BFA',
    accent: '#7C3AED',
    gradient: 'from-purple-500 to-purple-600',
    gradientFrom: '#8B5CF6',
    gradientTo: '#7C3AED',
    icon: 'code',
    label: { zh: 'API厂商', en: 'API Provider' },
    description: { zh: '将 API 转为 Agent 技能', en: 'Convert APIs to Agent skills' },
  },
  merchant: {
    primary: '#10B981',
    secondary: '#34D399',
    accent: '#059669',
    gradient: 'from-emerald-500 to-emerald-600',
    gradientFrom: '#10B981',
    gradientTo: '#059669',
    icon: 'store',
    label: { zh: '商户版', en: 'Merchant' },
    description: { zh: '商品即技能，零门槛入驻', en: 'Products as skills' },
  },
  expert: {
    primary: '#F59E0B',
    secondary: '#FBBF24',
    accent: '#D97706',
    gradient: 'from-amber-500 to-amber-600',
    gradientFrom: '#F59E0B',
    gradientTo: '#D97706',
    icon: 'graduation-cap',
    label: { zh: '专家版', en: 'Expert' },
    description: { zh: '知识资产化，专业变现', en: 'Monetize expertise' },
  },
  data_provider: {
    primary: '#F97316',
    secondary: '#FB923C',
    accent: '#EA580C',
    gradient: 'from-orange-500 to-orange-600',
    gradientFrom: '#F97316',
    gradientTo: '#EA580C',
    icon: 'database',
    label: { zh: '数据提供', en: 'Data Provider' },
    description: { zh: '数据即门票，查询即付费', en: 'Data as access' },
  },
  developer: {
    primary: '#6B7280',
    secondary: '#9CA3AF',
    accent: '#4B5563',
    gradient: 'from-gray-500 to-gray-600',
    gradientFrom: '#6B7280',
    gradientTo: '#4B5563',
    icon: 'terminal',
    label: { zh: '开发者版', en: 'Developer' },
    description: { zh: '从技能创建到全球分发', en: 'Build and distribute skills' },
  },
};

// 画像到原有模式的映射 (兼容性)
export const personaToMode: Record<UserPersona, 'personal' | 'merchant' | 'developer'> = {
  personal: 'personal',
  api_provider: 'developer',
  merchant: 'merchant',
  expert: 'developer',
  data_provider: 'developer',
  developer: 'developer',
};

// 移动端底部 Tab 配置
export const mobileBottomTabs = [
  { id: 'dashboard', icon: 'home', label: { zh: '首页', en: 'Home' } },
  { id: 'agent-accounts', icon: 'bot', label: { zh: 'Agent', en: 'Agent' } },
  { id: 'unified-account', icon: 'wallet', label: { zh: '资金', en: 'Funds' } },
  { id: 'settings', icon: 'settings', label: { zh: '设置', en: 'Settings' } },
  { id: 'persona-switch', icon: 'users', label: { zh: '切换', en: 'Switch' } },
];

// 各画像的 L2 导航配置
export const personaL2Config: Record<UserPersona, Record<string, string[]>> = {
  personal: {
    dashboard: ['overview', 'activity', 'recommendations'],
    'unified-account': ['balances', 'transactions', 'deposit', 'withdraw'],
    'agent-accounts': ['my-agents', 'authorizations', 'auto-pay'],
    kyc: ['status', 'upgrade', 'documents'],
    workspace: ['my-spaces', 'joined', 'invitations'],
    skills: ['installed', 'marketplace', 'configure'],
    shopping: ['orders', 'cart', 'wishlist'],
    security: ['sessions', 'policies', 'audit-log'],
    settings: ['profile', 'notifications', 'preferences'],
  },
  api_provider: {
    dashboard: ['overview', 'api-calls', 'revenue'],
    'developer-account': ['profile', 'tier', 'api-keys', 'rate-limits'],
    'unified-account': ['balances', 'earnings', 'payouts'],
    skills: ['my-apis', 'import-openapi', 'auto-generate'],
    testing: ['sandbox', 'mock-scenarios', 'debug-console'],
    publish: ['marketplace', 'multi-platform', 'distribution'],
    analytics: ['usage', 'performance', 'errors'],
    settings: ['webhooks', 'oauth-apps', 'team'],
  },
  merchant: {
    dashboard: ['overview', 'gmv', 'ai-traffic'],
    'merchant-account': ['profile', 'verification', 'settlement'],
    'unified-account': ['balances', 'transactions', 'withdrawals'],
    products: ['list', 'add', 'batch-import', 'ecommerce-sync', 'as-skills'],
    orders: ['all', 'pending', 'shipping', 'completed', 'refunds'],
    fulfillment: ['ucp-config', 'logistics', 'inventory'],
    analytics: ['sales', 'customers', 'products', 'agents'],
    settings: ['store-info', 'api-keys', 'webhooks', 'team'],
  },
  expert: {
    dashboard: ['overview', 'consultations', 'earnings'],
    'expert-profile': ['capability-card', 'credentials', 'sla-config'],
    'unified-account': ['balances', 'earnings', 'payouts'],
    services: ['my-services', 'create', 'pricing', 'templates'],
    consultations: ['pending', 'in-progress', 'completed', 'disputes'],
    analytics: ['performance', 'ratings', 'response-time'],
    settings: ['availability', 'notifications', 'team'],
  },
  data_provider: {
    dashboard: ['overview', 'queries', 'revenue'],
    'developer-account': ['profile', 'tier', 'api-keys'],
    'unified-account': ['balances', 'earnings', 'payouts'],
    datasets: ['my-data', 'import', 'vectorize', 'schema'],
    access: ['permissions', 'anonymization', 'rate-limits'],
    billing: ['x402-config', 'per-query', 'subscriptions'],
    analytics: ['usage', 'popular-queries', 'clients'],
    settings: ['api-keys', 'webhooks', 'security'],
  },
  developer: {
    dashboard: ['overview', 'api-calls', 'revenue', 'agents'],
    'developer-account': ['profile', 'tier', 'agreement', 'api-keys'],
    'unified-account': ['balances', 'earnings', 'payouts'],
    build: ['skill-factory', 'registry', 'packs', 'sandbox'],
    publish: ['marketplace', 'multi-platform', 'distribution'],
    revenue: ['earnings', 'transactions', 'pricing', 'withdrawals'],
    workspace: ['my-spaces', 'team', 'permissions'],
    docs: ['api-reference', 'sdk-guides', 'examples', 'changelog'],
    settings: ['webhooks', 'oauth', 'mcp-config'],
  },
};

// 获取画像的CSS变量
export function getPersonaCSSVars(persona: UserPersona): Record<string, string> {
  const theme = personaThemes[persona];
  return {
    '--persona-primary': theme.primary,
    '--persona-secondary': theme.secondary,
    '--persona-accent': theme.accent,
    '--persona-gradient-from': theme.gradientFrom,
    '--persona-gradient-to': theme.gradientTo,
  };
}

// 类型别名 (兼容性)
export type PersonaType = UserPersona;

// 从 mode 获取 persona
export function getPersonaFromMode(mode: 'personal' | 'merchant' | 'developer'): UserPersona {
  return mode as UserPersona;
}

// 移动端底部导航配置 (按 persona)
export const PERSONA_MOBILE_BOTTOM_TABS: Record<UserPersona, Array<{ id: string; icon: any; label: { zh: string; en: string } }>> = {
  personal: [
    { id: 'dashboard', icon: Home, label: { zh: '首页', en: 'Home' } },
    { id: 'unified-account', icon: Wallet, label: { zh: '资金', en: 'Funds' } },
    { id: 'agent-accounts', icon: Bot, label: { zh: 'Agent', en: 'Agent' } },
    { id: 'security', icon: ShieldCheck, label: { zh: '安全', en: 'Security' } },
  ],
  api_provider: [
    { id: 'dashboard', icon: Home, label: { zh: '首页', en: 'Home' } },
    { id: 'build', icon: Code, label: { zh: '构建', en: 'Build' } },
    { id: 'unified-account', icon: Wallet, label: { zh: '资金', en: 'Funds' } },
    { id: 'settings', icon: Settings, label: { zh: '设置', en: 'Settings' } },
  ],
  merchant: [
    { id: 'dashboard', icon: Home, label: { zh: '首页', en: 'Home' } },
    { id: 'products', icon: Package, label: { zh: '商品', en: 'Products' } },
    { id: 'unified-account', icon: Wallet, label: { zh: '资金', en: 'Funds' } },
    { id: 'settings', icon: Settings, label: { zh: '设置', en: 'Settings' } },
  ],
  expert: [
    { id: 'dashboard', icon: Home, label: { zh: '首页', en: 'Home' } },
    { id: 'services', icon: Zap, label: { zh: '服务', en: 'Services' } },
    { id: 'unified-account', icon: Wallet, label: { zh: '资金', en: 'Funds' } },
    { id: 'settings', icon: Settings, label: { zh: '设置', en: 'Settings' } },
  ],
  data_provider: [
    { id: 'dashboard', icon: Home, label: { zh: '首页', en: 'Home' } },
    { id: 'datasets', icon: Code, label: { zh: '数据集', en: 'Datasets' } },
    { id: 'unified-account', icon: Wallet, label: { zh: '资金', en: 'Funds' } },
    { id: 'settings', icon: Settings, label: { zh: '设置', en: 'Settings' } },
  ],
  developer: [
    { id: 'dashboard', icon: Home, label: { zh: '首页', en: 'Home' } },
    { id: 'build', icon: Code, label: { zh: '构建', en: 'Build' } },
    { id: 'revenue', icon: TrendingUp, label: { zh: '收益', en: 'Revenue' } },
    { id: 'settings', icon: Settings, label: { zh: '设置', en: 'Settings' } },
  ],
};
