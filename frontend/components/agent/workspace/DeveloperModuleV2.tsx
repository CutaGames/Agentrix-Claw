import React, { useState, useCallback, useEffect } from 'react';
import { 
  Package, 
  Zap, 
  Bot, 
  Database,
  Plus, 
  Search, 
  Activity, 
  Settings, 
  Key, 
  Webhook, 
  Terminal, 
  ShieldCheck,
  Trash2,
  Copy,
  Check,
  Eye,
  EyeOff,
  RefreshCw,
  CreditCard,
  Globe,
  Share2,
  Code as CodeIcon,
  FileText,
  History,
  Lock,
  Unlock,
  Info,
  ArrowUpRight,
  ArrowDownLeft,
  Shield,
  ChevronRight,
  Bell,
  Play,
  PieChart,
  Sparkles,
  Palette,
  Layout,
  Smartphone,
  Users,
  ShoppingBag,
  Calendar,
  DollarSign,
  ArrowRight,
  X,
  Store,
  PiggyBank
} from 'lucide-react';
import { L1Tab } from '../../layout/L1TopNav';
import { L2SubItem } from '../../layout/L2LeftSidebar';
import { useLocalization } from '../../../contexts/LocalizationContext';
import { useUser } from '../../../contexts/UserContext';
import { useToast } from '../../../contexts/ToastContext';
import { userAgentApi } from '../../../lib/api/user-agent.api';
import { statisticsApi } from '../../../lib/api/statistics.api';
import { apiKeyApi, type ApiKey } from '../../../lib/api/api-key.api';
import { webhookApi, type WebhookConfig } from '../../../lib/api/webhook.api';
import { skillApi } from '../../../lib/api/skill.api';
import { SkillRegistry } from '../../workspace/SkillRegistry';
import { PackCenter } from '../../workspace/PackCenter';
import { TestHarness } from '../../workspace/TestHarness';
import { PromotionPanel } from '../PromotionPanel';
import { UnifiedPublishingPanel } from './UnifiedPublishingPanel';
import OnboardingWizard from '../../onboarding/OnboardingWizard';
import { OnboardingSession } from '../../../lib/api/onboarding.api';
import { MySkillsPanel as MySkillsPanelV2 } from './MySkillsPanelV2'; // 使用新版本资产经营台
import { SplitPlansPanel, BudgetPoolsPanel } from './commerce';

interface DeveloperModuleV2Props {
  activeL1?: Extract<L1Tab, 'dashboard' | 'build' | 'publish' | 'revenue' | 'docs' | 'settings'>;
  activeL2?: L2SubItem;
  onCommand?: (command: string, data?: any) => void;
}

const defaultL2: Record<string, L2SubItem> = {
  dashboard: 'overview',
  build: 'skill-factory',
  publish: 'my-skills',
  revenue: 'earnings',
  docs: 'api-reference',
  settings: 'api-keys'
};

export const DeveloperModuleV2: React.FC<DeveloperModuleV2Props> = ({ activeL1, activeL2, onCommand }) => {
  const { t } = useLocalization();
  const { user } = useUser();
  const { success, error: showError } = useToast();

  const [apiStats, setApiStats] = useState<any>(null);
  const [revenue, setRevenue] = useState<any>(null);
  const [agents, setAgents] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  // API Keys & Webhooks
  const [apiKeys, setApiKeys] = useState<ApiKey[]>([]);
  const [webhooks, setWebhooks] = useState<WebhookConfig[]>([]);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // OpenAPI Import
  const [showImportModal, setShowImportModal] = useState(false);
  const [importUrl, setImportUrl] = useState('');
  const [importing, setImporting] = useState(false);

  // 入驻向导状态
  const [onboardingType, setOnboardingType] = useState<'api_provider' | 'merchant' | 'expert' | 'data_provider' | 'developer' | null>(null);
  const [onboardingStep, setOnboardingStep] = useState(1);
  const [onboardingData, setOnboardingData] = useState<any>({});
  const [showOnboarding, setShowOnboarding] = useState(false);

  const currentL1 = activeL1 || 'dashboard';
  const currentL2 = activeL2 || defaultL2[currentL1] || 'overview';

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const loadApiStats = useCallback(async () => {
    try {
      const data = await statisticsApi.getApiStatistics();
      setApiStats(data);
    } catch (error) {
      console.error('Failed to load API stats:', error);
    }
  }, []);

  const loadRevenue = useCallback(async () => {
    try {
      const data = await statisticsApi.getDeveloperRevenue();
      setRevenue(data);
    } catch (error) {
      console.error('Failed to load revenue:', error);
    }
  }, []);

  const loadAgents = useCallback(async () => {
    try {
      setLoading(true);
      const data = await userAgentApi.getMyAgents();
      setAgents(data || []);
    } catch (error) {
      console.error('Failed to load agents:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadApiKeys = useCallback(async () => {
    try {
      const data = await apiKeyApi.list();
      setApiKeys(data || []);
    } catch (err) {
      console.error('Failed to load API keys:', err);
    }
  }, []);

  const loadWebhooks = useCallback(async () => {
    try {
      const data = await webhookApi.getWebhooks();
      setWebhooks(data || []);
    } catch (err) {
      console.error('Failed to load webhooks:', err);
    }
  }, []);

  const handleToggleAgentStatus = async (agent: any) => {
    try {
      const next = agent.status === 'active' ? 'paused' : 'active';
      await userAgentApi.toggleStatus(agent.id, next);
      success(t({ zh: '状态已更新', en: 'Status updated' }));
      loadAgents();
    } catch (error) {
      showError('Failed to toggle status');
    }
  };

  const handleCreateApiKey = async () => {
    const name = prompt(t({ zh: '请输入密钥名称', en: 'Enter key name' }), 'My Key');
    if (!name) return;
    try {
      await apiKeyApi.create({ name, mode: 'production' });
      success(t({ zh: '密钥已创建', en: 'Key created' }));
      loadApiKeys();
    } catch (err) {
      showError('Failed to create key');
    }
  };

  useEffect(() => {
    if (currentL1 === 'dashboard') {
      loadApiStats();
      loadRevenue();
      loadAgents();
    }
    if (currentL1 === 'revenue') loadRevenue();
    if (currentL1 === 'publish') loadAgents();
    if (currentL1 === 'settings') {
      loadApiKeys();
      loadWebhooks();
    }
  }, [currentL1, loadApiStats, loadRevenue, loadAgents, loadApiKeys, loadWebhooks]);

  const sectionTitle = (title: string, desc?: string) => (
    <div className="mb-4">
      <h2 className="text-xl font-bold text-white">{title}</h2>
      {desc && <p className="text-sm text-slate-400 mt-1">{desc}</p>}
    </div>
  );

  const statCard = (label: string, value: string, accent: string) => (
    <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4">
      <p className="text-sm text-slate-400 mb-1">{label}</p>
      <p className={`text-2xl font-bold ${accent}`}>{value}</p>
    </div>
  );

  const renderDashboard = () => (
    <div className="space-y-6">
      {sectionTitle(t({ zh: '专业用户概览', en: 'Professional Overview' }), t({ zh: '资产、调用、收益一屏掌握', en: 'Assets, calls, and earnings at a glance' }))}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {statCard(t({ zh: '已发布资产', en: 'Published Assets' }), '12', 'text-blue-400')}
        {statCard(t({ zh: '总调用次数', en: 'Total Calls' }), apiStats?.totalCalls?.toString() || '0', 'text-green-400')}
        {statCard(t({ zh: '累计收益', en: 'Total Earnings' }), `$${revenue?.totalRevenue || '0.00'}`, 'text-purple-300')}
        {statCard(t({ zh: '活跃 Agent', en: 'Active Agents' }), agents.filter(a => a.status === 'active').length.toString(), 'text-amber-300')}
      </div>

      {/* 入驻入口卡片 - 突出显示 */}
      <div 
        onClick={() => onCommand?.('navigate', { l1: 'publish', l2: 'marketplace' })}
        className="bg-gradient-to-r from-purple-500/20 via-amber-500/20 to-orange-500/20 border border-purple-500/30 rounded-2xl p-6 cursor-pointer hover:scale-[1.01] transition-all duration-300 relative group"
      >
        <div className="absolute inset-0 bg-white/5 opacity-0 group-hover:opacity-100 transition-opacity" />
        <div className="flex items-center justify-between relative z-10">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-purple-500 to-orange-500 flex items-center justify-center shadow-lg shadow-purple-500/20">
              <Sparkles size={28} className="text-white animate-pulse" />
            </div>
            <div>
              <h3 className="text-xl font-bold text-white mb-1">{t({ zh: '专业资产发布向导', en: 'Professional Asset Wizard' })}</h3>
              <p className="text-slate-300 text-sm">{t({ zh: '通过向导快速发布 API、数据或专业知识，集成 X402 支付', en: 'Quickly publish APIs, data or expertise with X402 integration' })}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 text-purple-400 font-bold group-hover:translate-x-1 transition-transform">
            <span>{t({ zh: '立即开始', en: 'Go' })}</span>
            <ChevronRight size={20} />
          </div>
        </div>
        <div className="flex gap-4 mt-6">
          <div className="flex items-center gap-2 px-3 py-1.5 bg-purple-500/10 border border-purple-500/20 text-purple-300 rounded-full text-xs">
            <Zap size={14} />
            <span>API 厂商</span>
          </div>
          <div className="flex items-center gap-2 px-3 py-1.5 bg-amber-500/10 border border-amber-500/20 text-amber-300 rounded-full text-xs">
            <Users size={14} />
            <span>行业专家</span>
          </div>
          <div className="flex items-center gap-2 px-3 py-1.5 bg-orange-500/10 border border-orange-500/20 text-orange-300 rounded-full text-xs">
            <Database size={14} />
            <span>数据提供方</span>
          </div>
        </div>
      </div>

      <div className="bg-gradient-to-r from-purple-500/10 to-blue-500/10 border border-purple-500/20 rounded-xl p-5">
        <h3 className="text-lg font-semibold text-white mb-2">🏭 {t({ zh: '技能工厂', en: 'Skill Factory' })}</h3>
        <p className="text-slate-200 text-sm">{t({ zh: '一站式创建、测试、发布技能，自动生成多平台分发配置。', en: 'One-stop creation, testing, and publishing of skills with multi-platform config.' })}</p>
      </div>
    </div>
  );

  const handleImportOpenApi = async () => {
    if (!importUrl) return;
    setImporting(true);
    try {
      const result = await skillApi.importOpenApi(importUrl);
      success(t({ zh: `成功导入 ${result.success.length} 个技能`, en: `Successfully imported ${result.success.length} skills` }));
      setShowImportModal(false);
      setImportUrl('');
    } catch (err: any) {
      showError(err.message || 'Import failed');
    } finally {
      setImporting(false);
    }
  };

  const handleOnboardingSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      // 映射 frontend 类型到 backend 类型
      const typeMap: any = {
        'expert': 'expert_consultant',
        'data_provider': 'data_provider',
        'api_provider': 'api_vendor',
        'developer': 'ai_developer',
        'merchant': 'physical_service'
      };

      const payload = {
        ...onboardingData,
        type: typeMap[onboardingType || ''] || onboardingType
      };

      const response = await fetch('/api/onboarding', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('jwt_token')}`,
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) throw new Error('Onboarding failed');

      const result = await response.json();
      success(t({ zh: '入驻成功！Skill 已发布', en: 'Onboarding success! Skill published' }));
      setOnboardingType(null);
      setOnboardingData({});
      // 跳转到技能列表查看新创建的技能
      onCommand?.('navigate', { l1: 'build', l2: 'skills-registry' });
    } catch (err: any) {
      showError(err.message || 'Onboarding failed');
    } finally {
      setLoading(false);
    }
  };

  const renderOnboardingForm = () => {
    return (
      <div className="bg-slate-900 border border-white/10 rounded-3xl overflow-hidden shadow-2xl max-w-2xl mx-auto">
        <div className="p-6 border-b border-white/5 flex items-center justify-between">
          <h3 className="text-xl font-bold text-white flex items-center gap-2">
            {onboardingType === 'expert' ? <Users className="text-amber-400" /> : <PieChart className="text-orange-400" />}
            {onboardingType === 'expert' ? t({ zh: '行业专家入驻资料', en: 'Expert Onboarding' }) : t({ zh: '数据提供方配置', en: 'Data Provider Config' })}
          </h3>
          <button 
            onClick={() => { setOnboardingType(null); setOnboardingData({}); }}
            className="p-2 hover:bg-white/5 rounded-full text-slate-400 transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleOnboardingSubmit} className="p-6 space-y-6">
          {onboardingType === 'expert' ? (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">专业领域</label>
                <input
                  type="text"
                  className="w-full bg-slate-800 border border-white/10 rounded-xl px-4 py-3 text-white outline-none focus:border-amber-500 transition-colors"
                  placeholder="例如: 财务分析、法律顾问"
                  value={onboardingData.expertise || ''}
                  onChange={(e) => setOnboardingData({ ...onboardingData, expertise: e.target.value })}
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">能解决什么问题</label>
                <textarea
                  className="w-full bg-slate-800 border border-white/10 rounded-xl px-4 py-3 text-white outline-none focus:border-amber-500 transition-colors"
                  rows={3}
                  value={onboardingData.problemSolving || ''}
                  onChange={(e) => setOnboardingData({ ...onboardingData, problemSolving: e.target.value })}
                  required
                ></textarea>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">每次咨询价格 (USDC)</label>
                <input
                  type="number"
                  className="w-full bg-slate-800 border border-white/10 rounded-xl px-4 py-3 text-white outline-none focus:border-amber-500 transition-colors"
                  value={onboardingData.pricePerSession || 50}
                  onChange={(e) => setOnboardingData({ ...onboardingData, pricePerSession: parseFloat(e.target.value) })}
                  required
                />
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">数据源 URL (可选)</label>
                <input
                  type="url"
                  className="w-full bg-slate-800 border border-white/10 rounded-xl px-4 py-3 text-white outline-none focus:border-orange-500 transition-colors"
                  placeholder="https://api.example.com/data"
                  value={onboardingData.dataSourceUrl || ''}
                  onChange={(e) => setOnboardingData({ ...onboardingData, dataSourceUrl: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">隐私级别</label>
                <select
                  className="w-full bg-slate-800 border border-white/10 rounded-xl px-4 py-3 text-white outline-none focus:border-orange-500 transition-colors"
                  value={onboardingData.privacyLevel || 'public'}
                  onChange={(e) => setOnboardingData({ ...onboardingData, privacyLevel: e.target.value })}
                >
                  <option value="public">公开 (Public)</option>
                  <option value="sensitive">敏感 (Sensitive)</option>
                  <option value="encrypted">全加密 (Encrypted)</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">每次查询价格 (USDC)</label>
                <input
                  type="number"
                  step="0.001"
                  className="w-full bg-slate-800 border border-white/10 rounded-xl px-4 py-3 text-white outline-none focus:border-orange-500 transition-colors"
                  value={onboardingData.pricePerQuery || 0.01}
                  onChange={(e) => setOnboardingData({ ...onboardingData, pricePerQuery: parseFloat(e.target.value) })}
                  required
                />
              </div>
            </div>
          )}

          <div className="pt-4 flex gap-4">
            <button
              type="button"
              onClick={() => setOnboardingType(null)}
              className="flex-1 py-3 px-4 rounded-xl bg-slate-800 text-slate-300 hover:bg-slate-700 transition-colors"
            >
              取消
            </button>
            <button
              type="submit"
              disabled={loading}
              className={`flex-1 py-3 px-4 rounded-xl font-bold text-white transition-all shadow-lg ${
                onboardingType === 'expert' ? 'bg-amber-600 hover:bg-amber-500 shadow-amber-900/20' : 'bg-orange-600 hover:bg-orange-500 shadow-orange-900/20'
              }`}
            >
              {loading ? '发布中...' : '立即发布'}
            </button>
          </div>
        </form>
      </div>
    );
  };

  // 入驻中心 - 支持 API厂商、专家、数据提供者三种身份入驻
  const renderOnboarding = () => {
    const onboardingTypes = [
      {
        id: 'api_provider',
        title: { zh: 'API 厂商入驻', en: 'API Provider Onboarding' },
        desc: { zh: '将您的 REST API 转化为 Agent 可调用的技能，赚取调用收益', en: 'Convert your REST APIs into Agent-callable skills and earn revenue' },
        icon: Globe,
        color: 'from-purple-500/20 to-purple-600/10',
        borderColor: 'border-purple-500/30',
        iconColor: 'text-purple-400',
        features: [
          { zh: '一键导入 OpenAPI/Swagger 文档', en: 'One-click OpenAPI/Swagger import' },
          { zh: '自动生成技能描述和参数定义', en: 'Auto-generate skill descriptions' },
          { zh: '按调用次数计费，支持多种定价策略', en: 'Pay-per-call with flexible pricing' },
          { zh: '多平台分发 (ChatGPT/Claude/Gemini)', en: 'Multi-platform distribution' },
        ],
        action: () => setShowImportModal(true),
        actionLabel: { zh: '导入 OpenAPI', en: 'Import OpenAPI' },
      },
      {
        id: 'expert',
        title: { zh: '行业专家入驻', en: 'Expert Onboarding' },
        desc: { zh: '将您的专业知识转化为能力卡，提供付费咨询服务', en: 'Convert expertise into capability cards for paid consultations' },
        icon: Users,
        color: 'from-amber-500/20 to-amber-600/10',
        borderColor: 'border-amber-500/30',
        iconColor: 'text-amber-400',
        features: [
          { zh: '创建个人能力卡片展示专业领域', en: 'Create capability cards for expertise' },
          { zh: '设置 SLA 承诺 (响应时间/服务时长)', en: 'Set SLA commitments' },
          { zh: '支持异步/同步咨询模式', en: 'Support async/sync consultation' },
          { zh: '自定义咨询定价和服务时段', en: 'Custom pricing and availability' },
        ],
        action: () => setOnboardingType('expert'),
        actionLabel: { zh: '创建能力卡', en: 'Create Capability Card' },
      },
      {
        id: 'data_provider',
        title: { zh: '数据提供方入驻', en: 'Data Provider Onboarding' },
        desc: { zh: '将私有数据资产变现，支持 RAG 查询和 X402 协议计费', en: 'Monetize private data assets with RAG queries and X402 billing' },
        icon: PieChart,
        color: 'from-orange-500/20 to-orange-600/10',
        borderColor: 'border-orange-500/30',
        iconColor: 'text-orange-400',
        features: [
          { zh: '上传数据文件自动构建 RAG 索引', en: 'Upload files for auto RAG indexing' },
          { zh: '设置数据访问权限和隐私规则', en: 'Set access permissions and privacy rules' },
          { zh: '支持 X402 协议实现查询即付费', en: 'X402 protocol for pay-per-query' },
          { zh: '实时查看数据使用统计和收益', en: 'Real-time usage stats and earnings' },
        ],
        action: () => setOnboardingType('data_provider'),
        actionLabel: { zh: '接入数据', en: 'Connect Data' },
      },
    ];

    if (onboardingType) {
      return renderOnboardingForm();
    }

    return (
      <div className="space-y-6">
        {sectionTitle(
          t({ zh: '入驻中心', en: 'Onboarding Center' }), 
          t({ zh: '选择您的入驻身份，开始在 Agentrix 生态中变现', en: 'Choose your onboarding type and start monetizing in Agentrix ecosystem' })
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {onboardingTypes.map((type) => (
            <div 
              key={type.id}
              className={`bg-gradient-to-br ${type.color} border ${type.borderColor} rounded-2xl p-6 hover:scale-[1.02] transition-all duration-300`}
            >
              <div className="flex items-center gap-3 mb-4">
                <div className={`w-12 h-12 rounded-xl bg-slate-800/50 flex items-center justify-center ${type.iconColor}`}>
                  <type.icon size={24} />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-white">{t(type.title)}</h3>
                </div>
              </div>
              
              <p className="text-sm text-slate-300 mb-4">{t(type.desc)}</p>
              
              <ul className="space-y-2 mb-6">
                {type.features.map((feature, idx) => (
                  <li key={idx} className="flex items-start gap-2 text-sm text-slate-400">
                    <span className={`${type.iconColor} mt-1`}>✓</span>
                    <span>{t(feature)}</span>
                  </li>
                ))}
              </ul>
              
              <button
                onClick={type.action}
                className={`w-full py-3 px-4 rounded-xl font-medium transition-all ${type.iconColor} bg-slate-800/80 hover:bg-slate-800 border ${type.borderColor}`}
              >
                {t(type.actionLabel)}
              </button>
            </div>
          ))}
        </div>

        {/* 入驻进度追踪 */}
        <div className="bg-slate-800/50 border border-slate-700/50 rounded-2xl p-6">
          <h3 className="text-lg font-bold text-white mb-4">{t({ zh: '入驻进度', en: 'Onboarding Progress' })}</h3>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-green-500/20 text-green-400 flex items-center justify-center">✓</div>
                <span className="text-white">{t({ zh: '账户注册', en: 'Account Registration' })}</span>
              </div>
              <span className="text-green-400 text-sm">{t({ zh: '已完成', en: 'Completed' })}</span>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-slate-700 text-slate-400 flex items-center justify-center">2</div>
                <span className="text-slate-400">{t({ zh: '选择入驻类型', en: 'Select Onboarding Type' })}</span>
              </div>
              <span className="text-slate-500 text-sm">{t({ zh: '待完成', en: 'Pending' })}</span>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-slate-700 text-slate-400 flex items-center justify-center">3</div>
                <span className="text-slate-400">{t({ zh: '提交资料审核', en: 'Submit for Review' })}</span>
              </div>
              <span className="text-slate-500 text-sm">{t({ zh: '待完成', en: 'Pending' })}</span>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-slate-700 text-slate-400 flex items-center justify-center">4</div>
                <span className="text-slate-400">{t({ zh: '发布上线', en: 'Go Live' })}</span>
              </div>
              <span className="text-slate-500 text-sm">{t({ zh: '待完成', en: 'Pending' })}</span>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const renderBuild = () => {
    switch (currentL2) {
      case 'skills-registry':
        return (
          <div className="space-y-4">
            {sectionTitle(t({ zh: '技能注册表', en: 'Skill Registry' }))}
            <SkillRegistry />
          </div>
        );
      case 'skill-packs':
        return (
          <div className="space-y-4">
            {sectionTitle(t({ zh: '技能包', en: 'Skill Packs' }))}
            <PackCenter />
          </div>
        );
      case 'test-sandbox':
        return (
          <div className="space-y-4">
            {sectionTitle(t({ zh: '测试沙盒', en: 'Test Sandbox' }))}
            <TestHarness />
          </div>
        );
      case 'onboarding':
        return renderOnboarding();
      default:
        return (
          <div className="space-y-4">
            {sectionTitle(t({ zh: '技能工厂', en: 'Skill Factory' }))}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div 
                onClick={() => onCommand?.('navigate', { l2: 'skill-registry' })}
                className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4 flex items-center gap-3 cursor-pointer hover:bg-slate-800 transition-colors"
              >
                <Zap className="text-blue-400" size={20} />
                <div>
                  <p className="text-white font-semibold">{t({ zh: '创建技能', en: 'Create Skill' })}</p>
                  <p className="text-xs text-slate-400">{t({ zh: '选择模板或自定义', en: 'Choose template or custom' })}</p>
                </div>
              </div>
              <div 
                onClick={() => setShowImportModal(true)}
                className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4 flex items-center gap-3 cursor-pointer hover:bg-slate-800 transition-colors"
              >
                <Globe className="text-emerald-400" size={20} />
                <div>
                  <p className="text-white font-semibold">{t({ zh: '导入 OpenAPI', en: 'Import OpenAPI' })}</p>
                  <p className="text-xs text-slate-400">{t({ zh: '从 Swagger/OpenAPI URL 导入', en: 'Import from URL' })}</p>
                </div>
              </div>
              <div 
                onClick={() => onCommand?.('navigate', { l2: 'test-sandbox' })}
                className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4 flex items-center gap-3 cursor-pointer hover:bg-slate-800 transition-colors"
              >
                <Bot className="text-green-400" size={20} />
                <div>
                  <p className="text-white font-semibold">{t({ zh: '调试 Agent', en: 'Debug Agent' })}</p>
                  <p className="text-xs text-slate-400">{t({ zh: '实时验证调用', en: 'Real-time validation' })}</p>
                </div>
              </div>
              <div 
                onClick={() => onCommand?.('navigate', { l2: 'skill-packs' })}
                className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4 flex items-center gap-3 cursor-pointer hover:bg-slate-800 transition-colors"
              >
                <Package className="text-purple-300" size={20} />
                <div>
                  <p className="text-white font-semibold">{t({ zh: '打包发布', en: 'Pack & Publish' })}</p>
                  <p className="text-xs text-slate-400">{t({ zh: '生成技能包', en: 'Generate skill pack' })}</p>
                </div>
              </div>
            </div>
          </div>
        );
    }
  };

  const renderPublish = () => {
    if (currentL2 === 'multi-platform') {
      return (
        <div className="space-y-6">
          {sectionTitle(t({ zh: '多平台分发', en: 'Multi-platform' }), t({ zh: '生成 ChatGPT/Claude/Gemini 配置', en: 'Generate ChatGPT/Claude/Gemini config' }))}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[
              { name: 'ChatGPT Actions', icon: Bot, color: 'text-emerald-400' },
              { name: 'Claude MCP', icon: Zap, color: 'text-orange-400' },
              { name: 'Gemini Tools', icon: Globe, color: 'text-blue-400' }
            ].map(p => (
              <div key={p.name} className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-6 text-center space-y-4">
                <p.icon className={`w-10 h-10 mx-auto ${p.color}`} />
                <h4 className="text-white font-bold">{p.name}</h4>
                <button className="w-full py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-xs font-bold transition-colors">
                  {t({ zh: '生成配置', en: 'Generate Config' })}
                </button>
              </div>
            ))}
          </div>
        </div>
      );
    }
    if (currentL2 === 'distribution') {
      return sectionTitle(t({ zh: '分发管理', en: 'Distribution' }), t({ zh: '查看各平台的发布状态与审核进度', en: 'View publishing status and review progress' }));
    }
    if (currentL2 === 'my-skills') {
      return (
        <MySkillsPanelV2 
          onPublishNew={() => onCommand?.('navigate', { l2: 'marketplace' })}
        />
      );
    }
    if (currentL2 === 'marketplace') {
      return (
        <div className="space-y-6">
          {sectionTitle(t({ zh: '发布资产', en: 'Publish Assets' }), t({ zh: '将您的 API、数据或技能上架到分布式市场', en: 'List your API, data or skills to the marketplace' }))}
          <UnifiedPublishingPanel 
            initialType="skill" 
            allowedTypes={['skill', 'api', 'data', 'agent', 'other']}
            allowedPersonas={['api_provider', 'data_provider', 'expert', 'developer']}
            onSuccess={(data) => {
              loadAgents();
              success(t({ zh: '技能发布成功！', en: 'Skill published successfully!' }));
              // 跳转到"我的技能"页面
              onCommand?.('navigate', { l2: 'my-skills' });
            }} 
            onGuidedMode={(persona) => {
              setShowOnboarding(true);
            }}
          />
        </div>
      );
    }
    return (
      <div className="space-y-4">
        {sectionTitle(t({ zh: '发布到市场', en: 'Publish to Marketplace' }), t({ zh: '准备上架 Agentrix 市场', en: 'Prepare for Agentrix Marketplace' }))}
        <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl overflow-hidden">
          <div className="grid grid-cols-4 px-4 py-3 border-b border-slate-700/50 text-slate-400 text-xs uppercase tracking-wider">
            <span>{t({ zh: 'Agent 名称', en: 'Agent Name' })}</span>
            <span>{t({ zh: '状态', en: 'Status' })}</span>
            <span>{t({ zh: '创建时间', en: 'Created' })}</span>
            <span>{t({ zh: '操作', en: 'Actions' })}</span>
          </div>
          {loading ? (
            <div className="p-12 text-center text-slate-500">{t({ zh: '加载中...', en: 'Loading...' })}</div>
          ) : agents.length === 0 ? (
            <div className="p-12 text-center text-slate-500">{t({ zh: '暂无 Agent', en: 'No agents found' })}</div>
          ) : (
            agents.map((a) => (
              <div key={a.id} className="grid grid-cols-4 px-4 py-4 border-b border-slate-700/30 last:border-0 items-center hover:bg-white/5 transition-colors">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded bg-blue-500/10 flex items-center justify-center">
                    <Bot size={16} className="text-blue-400" />
                  </div>
                  <span className="text-sm font-medium text-white">{a.name}</span>
                </div>
                <div>
                  <button 
                    onClick={() => handleToggleAgentStatus(a)}
                    className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase transition-colors ${
                      a.status === 'active' ? 'bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30' : 'bg-slate-700 text-slate-400 hover:bg-slate-600'
                    }`}
                  >
                    {t({ zh: a.status, en: a.status })}
                  </button>
                </div>
                <span className="text-xs text-slate-500">{new Date(a.createdAt).toLocaleDateString()}</span>
                <div className="flex gap-2">
                  <button className="p-1.5 rounded bg-slate-700 hover:bg-slate-600 text-slate-300 transition-colors">
                    <Settings size={14} />
                  </button>
                  <button className="p-1.5 rounded bg-blue-600/20 hover:bg-blue-600/30 text-blue-400 transition-colors">
                    <Share2 size={14} />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    );
  };

  const renderRevenue = () => {
    switch (currentL2) {
      case 'transactions':
        return (
          <div className="space-y-4">
            {sectionTitle(t({ zh: '交易记录', en: 'Transactions' }))}
            <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-12 text-center text-slate-500">
              <History className="w-12 h-12 mx-auto mb-4 opacity-20" />
              {t({ zh: '暂无交易记录', en: 'No transactions found' })}
            </div>
          </div>
        );
      case 'commission-plans':
        return <SplitPlansPanel />;
      case 'budget-pools':
        return <BudgetPoolsPanel />;
      case 'withdrawals':
        return (
          <div className="space-y-6">
            {sectionTitle(t({ zh: '提现管理', en: 'Withdrawals' }))}
            <div className="bg-slate-800/50 border border-slate-700/50 rounded-2xl p-8 max-w-2xl">
              <div className="flex items-center justify-between mb-8">
                <div>
                  <p className="text-sm text-slate-400 mb-1">{t({ zh: '可提现余额', en: 'Available Balance' })}</p>
                  <p className="text-3xl font-bold text-white">${revenue?.pending || '0.00'}</p>
                </div>
                <button className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl transition-colors">
                  {t({ zh: '立即提现', en: 'Withdraw Now' })}
                </button>
              </div>
              <div className="p-4 bg-slate-900/50 rounded-xl border border-white/5">
                <p className="text-xs text-slate-500 uppercase font-bold mb-2">Payout Wallet</p>
                <div className="flex items-center justify-between">
                  <p className="text-sm font-mono text-slate-300">{user?.walletAddress || 'Not set'}</p>
                  <button className="text-xs text-blue-400 hover:underline">{t({ zh: '修改', en: 'Change' })}</button>
                </div>
              </div>
            </div>
          </div>
        );
      case 'pricing':
        return (
          <div className="space-y-6">
            {sectionTitle(t({ zh: '定价策略', en: 'Pricing Strategy' }), t({ zh: '配置您的技能调用费率与分润比例', en: 'Configure your skill call rates and revenue share' }))}
            <div className="bg-slate-800/50 border border-slate-700/50 rounded-2xl p-8 space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="p-6 bg-slate-900/50 rounded-xl border border-white/5">
                  <h4 className="font-bold text-white mb-4">Pay-per-call</h4>
                  <div className="flex items-center gap-3">
                    <input type="number" defaultValue="0.01" className="bg-slate-800 border border-white/10 rounded-lg px-3 py-2 text-sm text-white w-24" />
                    <span className="text-slate-400 text-sm">USDC / call</span>
                  </div>
                </div>
                <div className="p-6 bg-slate-900/50 rounded-xl border border-white/5">
                  <h4 className="font-bold text-white mb-4">Subscription</h4>
                  <div className="flex items-center gap-3">
                    <input type="number" defaultValue="9.9" className="bg-slate-800 border border-white/10 rounded-lg px-3 py-2 text-sm text-white w-24" />
                    <span className="text-slate-400 text-sm">USDC / month</span>
                  </div>
                </div>
              </div>
              <button className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl transition-colors">
                {t({ zh: '保存定价', en: 'Save Pricing' })}
              </button>
            </div>
          </div>
        );
      default:
        return (
          <div className="space-y-6">
            {sectionTitle(t({ zh: '收益概览', en: 'Revenue Overview' }))}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {statCard(t({ zh: '本月收益', en: 'Monthly Revenue' }), `$${revenue?.todayRevenue || '0.00'}`, 'text-green-400')}
              {statCard(t({ zh: '调用付费', en: 'Call Revenue' }), `$${revenue?.commission || '0.00'}`, 'text-blue-300')}
              {statCard(t({ zh: '订阅收入', en: 'Subscription Revenue' }), `$${revenue?.pending || '0.00'}`, 'text-purple-300')}
            </div>
            <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-6 flex items-center justify-between">
              <div>
                <h4 className="text-white font-semibold mb-1">{t({ zh: '提现设置', en: 'Withdrawal Settings' })}</h4>
                <p className="text-sm text-slate-400">{t({ zh: '配置您的收款钱包与提现阈值', en: 'Configure your payout wallet and threshold' })}</p>
              </div>
              <button className="px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded-lg text-white transition-colors">
                {t({ zh: '去配置', en: 'Configure' })}
              </button>
            </div>
          </div>
        );
    }
  };

  const renderSettings = () => {
    switch (currentL2) {
      case 'api-keys':
        return (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              {sectionTitle(t({ zh: 'API 密钥', en: 'API Keys' }), t({ zh: '管理您的开发者 API 访问权限', en: 'Manage your developer API access' }))}
              <button className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-bold transition-colors flex items-center gap-2">
                <Plus size={18} />
                {t({ zh: '创建密钥', en: 'Create Key' })}
              </button>
            </div>
            <div className="grid gap-4">
              {apiKeys.length === 0 ? (
                <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-12 text-center text-slate-500">
                  {t({ zh: '暂无 API 密钥', en: 'No API keys found' })}
                </div>
              ) : (
                apiKeys.map(key => (
                  <div key={key.id} className="bg-slate-800/50 border border-slate-700/50 rounded-2xl p-6 flex items-center justify-between group">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 rounded-xl bg-blue-500/10 flex items-center justify-center text-blue-400">
                        <Key size={24} />
                      </div>
                      <div>
                        <p className="font-bold text-white">{key.name}</p>
                        <p className="text-xs text-slate-500 mt-1 font-mono">{key.keyPrefix}****************</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button 
                        onClick={() => handleCopy(key.keyPrefix + '****************', key.id)}
                        className="p-2 hover:bg-white/5 rounded-lg text-slate-400 transition-colors"
                      >
                        {copiedId === key.id ? <Check size={16} className="text-emerald-500" /> : <Copy size={16} />}
                      </button>
                      <button className="p-2 hover:bg-red-500/10 rounded-lg text-slate-400 hover:text-red-400 transition-colors"><Trash2 size={16} /></button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        );
      case 'webhooks':
        return (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              {sectionTitle(t({ zh: 'Webhooks', en: 'Webhooks' }), t({ zh: '配置实时事件通知回调', en: 'Configure real-time event notifications' }))}
              <button className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-bold transition-colors flex items-center gap-2">
                <Plus size={18} />
                {t({ zh: '添加 Webhook', en: 'Add Webhook' })}
              </button>
            </div>
            <div className="grid gap-4">
              {webhooks.length === 0 ? (
                <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-12 text-center text-slate-500">
                  {t({ zh: '暂无 Webhook 配置', en: 'No webhooks configured' })}
                </div>
              ) : (
                webhooks.map(wh => (
                  <div key={wh.id} className="bg-slate-800/50 border border-slate-700/50 rounded-2xl p-6 flex items-center justify-between group">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 rounded-xl bg-emerald-500/10 flex items-center justify-center text-emerald-400">
                        <Webhook size={24} />
                      </div>
                      <div>
                        <p className="font-bold text-white">{wh.url}</p>
                        <p className="text-xs text-slate-500 mt-1">{wh.events.join(', ')}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button className="p-2 hover:bg-white/5 rounded-lg text-slate-400 transition-colors"><Settings size={16} /></button>
                      <button className="p-2 hover:bg-red-500/10 rounded-lg text-slate-400 hover:text-red-400 transition-colors"><Trash2 size={16} /></button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        );
      case 'promotions':
        return (
          <div className="space-y-6">
            {sectionTitle(t({ zh: '推广中心', en: 'Promotion Center' }))}
            <PromotionPanel />
          </div>
        );
      default:
        return (
          <div className="space-y-6">
            {sectionTitle(t({ zh: '开发者设置', en: 'Developer Settings' }))}
            <div className="bg-slate-800/50 border border-slate-700/50 rounded-2xl p-8 max-w-2xl">
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">Developer Name</label>
                  <input type="text" defaultValue={user?.nickname || ''} className="w-full bg-slate-900 border border-white/10 rounded-xl px-4 py-3 text-white outline-none focus:border-blue-500" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">Support Email</label>
                  <input type="email" defaultValue={user?.email || ''} className="w-full bg-slate-900 border border-white/10 rounded-xl px-4 py-3 text-white outline-none focus:border-blue-500" />
                </div>
                <button className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl transition-colors mt-4">
                  {t({ zh: '更新信息', en: 'Update Info' })}
                </button>
              </div>
            </div>
          </div>
        );
    }
  };

  const renderDocs = () => {
    switch (currentL2) {
      case 'sdk-guides':
        return (
          <div className="space-y-6">
            {sectionTitle(t({ zh: 'SDK 指南', en: 'SDK Guides' }), t({ zh: '快速集成 Agentrix 支付与技能生态', en: 'Quickly integrate Agentrix payment and skill ecosystem' }))}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {[
                { title: { zh: '快速开始', en: 'Quick Start' }, icon: Play, color: 'text-blue-400' },
                { title: { zh: '支付集成', en: 'Payment Integration' }, icon: CreditCard, color: 'text-emerald-400' },
                { title: { zh: '技能注册', en: 'Skill Registration' }, icon: Zap, color: 'text-amber-400' },
              ].map((guide, i) => (
                <div key={i} className="bg-slate-900/50 border border-white/5 rounded-2xl p-6 hover:bg-slate-800 transition-colors cursor-pointer group">
                  <guide.icon className={`w-8 h-8 ${guide.color} mb-4`} />
                  <h3 className="text-white font-bold mb-2">{t(guide.title)}</h3>
                  <p className="text-xs text-slate-500 mb-4">Learn how to integrate {t(guide.title).toLowerCase()} in minutes.</p>
                  <div className="flex items-center text-blue-400 text-xs font-bold group-hover:gap-2 transition-all">
                    Read More <ChevronRight size={14} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      case 'examples':
        return (
          <div className="space-y-6">
            {sectionTitle(t({ zh: '示例代码', en: 'Examples' }), t({ zh: '可直接运行的集成示例', en: 'Ready-to-run integration examples' }))}
            <div className="bg-slate-900/50 border border-white/5 rounded-2xl overflow-hidden">
              <div className="flex border-b border-white/5">
                {['Node.js', 'Python', 'React'].map((lang, i) => (
                  <button key={lang} className={`px-6 py-3 text-sm font-bold ${i === 0 ? 'text-blue-400 border-b-2 border-blue-400 bg-blue-400/5' : 'text-slate-500 hover:text-slate-300'}`}>
                    {lang}
                  </button>
                ))}
              </div>
              <div className="p-6 bg-slate-950 font-mono text-xs text-slate-300 overflow-x-auto">
                <pre>{`// Initialize Agentrix SDK
const { Agentrix } = require('@agentrix/sdk');

const agx = new Agentrix({
  apiKey: 'agx_live_...',
  environment: 'production'
});

// Create a payment intent
const intent = await agx.payments.createIntent({
  amount: 100,
  currency: 'USD',
  description: 'Premium Subscription'
});

console.log('Payment URL:', intent.url);`}</pre>
              </div>
            </div>
          </div>
        );
      case 'changelog':
        return sectionTitle(t({ zh: '更新日志', en: 'Changelog' }));
      case 'code-gen':
        return (
          <div className="space-y-6">
            {sectionTitle(t({ zh: '代码生成', en: 'Code Generation' }), t({ zh: '自动生成 SDK 与集成代码', en: 'Automatically generate SDK and integration code' }))}
            <div className="bg-slate-800/50 border border-slate-700/50 rounded-2xl p-8 text-center">
              <CodeIcon className="w-12 h-12 mx-auto text-slate-400 mb-4" />
              <p className="text-slate-200 mb-6">{t({ zh: '选择您的开发语言以生成集成代码', en: 'Select your language to generate integration code' })}</p>
              <div className="flex justify-center gap-4">
                {['TypeScript', 'Python', 'Go', 'Rust'].map(lang => (
                  <button key={lang} className="px-6 py-3 bg-slate-900 border border-white/10 rounded-xl text-white hover:border-blue-500 transition-colors">
                    {lang}
                  </button>
                ))}
              </div>
            </div>
          </div>
        );
      default:
        return (
          <div className="space-y-4">
            {sectionTitle(t({ zh: 'API 文档', en: 'API Reference' }), t({ zh: '快速检索接口、鉴权与错误码', en: 'Quickly search interfaces, auth and error codes' }))}
            <div className="bg-slate-800/40 border border-slate-700/50 rounded-xl p-6">
              <p className="text-slate-300">{t({ zh: '在此集成文档或跳转到 docs 站点。', en: 'Integrate docs here or redirect to docs site.' })}</p>
            </div>
          </div>
        );
    }
  };

  const renderContent = () => {
    if (showOnboarding) {
      return (
        <div className="fixed inset-0 z-[100] bg-slate-950/95 backdrop-blur-xl flex items-center justify-center p-4">
          <div className="w-full max-w-4xl max-h-[90vh] overflow-y-auto bg-slate-900 border border-white/10 rounded-3xl shadow-2xl relative">
            <button 
              onClick={() => setShowOnboarding(false)}
              className="absolute top-6 right-6 p-2 hover:bg-white/5 rounded-full text-slate-400 z-10"
            >
              <X size={20} />
            </button>
            <div className="p-8">
              <OnboardingWizard 
                onComplete={(session) => {
                  console.log('Onboarding complete:', session);
                  setShowOnboarding(false);
                  success(t({ zh: '入驻成功！您可以开始管理资产了', en: 'Onboarding complete! You can start managing assets now.' }));
                  loadAgents();
                }}
                onCancel={() => setShowOnboarding(false)}
                allowedPersonas={['api_provider', 'data_provider', 'expert', 'developer']}
              />
            </div>
          </div>
        </div>
      );
    }

    switch (currentL1) {
      case 'build':
        return renderBuild();
      case 'publish':
        return renderPublish();
      case 'revenue':
        return renderRevenue();
      case 'docs':
        return renderDocs();
      case 'settings':
        return renderSettings();
      default:
        return renderDashboard();
    }
  };

  return (
    <div className="p-4 md:p-6 text-slate-100">
      {renderContent()}

      {/* OpenAPI Import Modal */}
      {showImportModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-slate-900 border border-white/10 rounded-3xl w-full max-w-lg overflow-hidden shadow-2xl">
            <div className="p-6 border-b border-white/5 flex items-center justify-between">
              <h3 className="text-xl font-bold text-white flex items-center gap-2">
                <Globe className="text-emerald-400" size={24} />
                {t({ zh: '导入 OpenAPI 技能', en: 'Import OpenAPI Skill' })}
              </h3>
              <button 
                onClick={() => setShowImportModal(false)}
                className="p-2 hover:bg-white/5 rounded-full text-slate-400 transition-colors"
              >
                <X size={20} />
              </button>
            </div>
            
            <div className="p-6 space-y-4">
              <p className="text-sm text-slate-400">
                {t({ 
                  zh: '输入 Swagger (JSON) 或 OpenAPI Spec URL。我们将自动解析其中的接口并将其转换为 Agent 可调用的原子技能。', 
                  en: 'Enter Swagger (JSON) or OpenAPI Spec URL. We will automatically parse operations and convert them to atomic skills for AI agents.' 
                })}
              </p>
              
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                  OpenAPI Spec URL
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={importUrl}
                    onChange={(e) => setImportUrl(e.target.value)}
                    placeholder="https://api.example.com/openapi.json"
                    className="w-full bg-slate-800 border border-white/10 rounded-xl px-4 py-3 text-white outline-none focus:border-blue-500 transition-colors pl-11"
                  />
                  <Globe className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
                </div>
              </div>

              <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-4 flex gap-3">
                <Info className="text-blue-400 shrink-0" size={20} />
                <p className="text-xs text-blue-300 leading-relaxed">
                  {t({
                    zh: '成功导入后，您可以在“技能注册表”中查看、编辑和发布这些技能。',
                    en: 'After success, you can view, edit and publish these skills in the Skill Registry.'
                  })}
                </p>
              </div>
            </div>

            <div className="p-6 bg-slate-800/50 flex gap-3">
              <button
                onClick={() => setShowImportModal(false)}
                className="flex-1 py-3 px-4 rounded-xl font-bold text-slate-400 hover:text-white hover:bg-white/5 transition-colors"
              >
                {t({ zh: '取消', en: 'Cancel' })}
              </button>
              <button
                onClick={handleImportOpenApi}
                disabled={!importUrl || importing}
                className="flex-1 py-3 px-4 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold rounded-xl transition-colors flex items-center justify-center gap-2"
              >
                {importing ? (
                  <>
                    <RefreshCw size={18} className="animate-spin" />
                    {t({ zh: '导入中...', en: 'Importing...' })}
                  </>
                ) : (
                  <>
                    <Plus size={18} />
                    {t({ zh: '立即导入', en: 'Import Now' })}
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
