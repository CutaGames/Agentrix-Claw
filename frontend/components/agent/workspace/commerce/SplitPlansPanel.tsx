import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Plus, Settings, Archive, Trash2, Play, Eye, ChevronRight, Users, Percent, Layers, Check, X, ArrowDown, ArrowRight, GitBranch, Wallet, DollarSign, TrendingUp, Info } from 'lucide-react';
import { useLocalization } from '../../../../contexts/LocalizationContext';
import { useToast } from '../../../../contexts/ToastContext';
import { commerceApi, SplitPlan, SplitPlanStatus, ProductType, SplitRule } from '../../../../lib/api/commerce.api';
import { CommerceHintsBanner } from './CommerceHintsBanner';

interface SplitPlansPanelProps {
  onSelect?: (plan: SplitPlan) => void;
}

const PRODUCT_TYPE_LABELS: Record<ProductType, { zh: string; en: string }> = {
  physical: { zh: '实物商品', en: 'Physical' },
  service: { zh: '服务', en: 'Service' },
  virtual: { zh: '虚拟商品', en: 'Virtual' },
  nft: { zh: 'NFT', en: 'NFT' },
  skill: { zh: '技能', en: 'Skill' },
  agent_task: { zh: 'Agent任务', en: 'Agent Task' },
};

const STATUS_STYLES: Record<SplitPlanStatus, string> = {
  draft: 'bg-slate-500/20 text-slate-400',
  active: 'bg-emerald-500/20 text-emerald-400',
  archived: 'bg-amber-500/20 text-amber-400',
};

export const SplitPlansPanel: React.FC<SplitPlansPanelProps> = ({ onSelect }) => {
  const { t } = useLocalization();
  const { success, error: showError } = useToast();
  
  const [plans, setPlans] = useState<SplitPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<SplitPlan | null>(null);

  const loadPlans = useCallback(async () => {
    try {
      setLoading(true);
      const data = await commerceApi.getSplitPlans();
      setPlans(data || []);
    } catch (err: any) {
      showError(err.message || 'Failed to load split plans');
    } finally {
      setLoading(false);
    }
  }, [showError]);

  useEffect(() => {
    loadPlans();
  }, [loadPlans]);

  const handleActivate = async (id: string) => {
    try {
      await commerceApi.activateSplitPlan(id);
      success(t({ zh: '分佣计划已激活', en: 'Split plan activated' }));
      loadPlans();
    } catch (err: any) {
      showError(err.message);
    }
  };

  const handleArchive = async (id: string) => {
    try {
      await commerceApi.archiveSplitPlan(id);
      success(t({ zh: '分佣计划已归档', en: 'Split plan archived' }));
      loadPlans();
    } catch (err: any) {
      showError(err.message);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm(t({ zh: '确定要删除此分佣计划吗？', en: 'Are you sure you want to delete this plan?' }))) {
      return;
    }
    try {
      await commerceApi.deleteSplitPlan(id);
      success(t({ zh: '分佣计划已删除', en: 'Split plan deleted' }));
      loadPlans();
    } catch (err: any) {
      showError(err.message);
    }
  };

  const formatShare = (bps: number) => `${(bps / 100).toFixed(1)}%`;

  const renderRulesSummary = (rules: SplitRule[]) => {
    const activeRules = rules.filter(r => r.active);
    if (activeRules.length === 0) return t({ zh: '无规则', en: 'No rules' });
    
    return activeRules.slice(0, 3).map((r, i) => (
      <span key={i} className="inline-flex items-center gap-1 text-xs bg-slate-700/50 px-2 py-0.5 rounded mr-1">
        <span className="text-slate-400">{r.customRoleName || r.role}</span>
        <span className="text-blue-400">{formatShare(r.shareBps)}</span>
      </span>
    ));
  };

  return (
    <div className="space-y-4">
      <CommerceHintsBanner />
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-bold text-white">{t({ zh: '分佣计划', en: 'Split Plans' })}</h3>
          <p className="text-sm text-slate-400">{t({ zh: '配置多级分佣规则与费率', en: 'Configure multi-level split rules and rates' })}</p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded-lg text-white font-semibold transition-colors"
        >
          <Plus size={16} />
          {t({ zh: '新建计划', en: 'New Plan' })}
        </button>
      </div>

      {/* Plans List */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full" />
        </div>
      ) : plans.length === 0 ? (
        <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-12 text-center">
          <Layers className="w-12 h-12 mx-auto mb-4 text-slate-500" />
          <p className="text-slate-400 mb-4">{t({ zh: '暂无分佣计划', en: 'No split plans found' })}</p>
          <button
            onClick={() => setShowCreateModal(true)}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded-lg text-white font-semibold transition-colors"
          >
            {t({ zh: '创建首个计划', en: 'Create First Plan' })}
          </button>
        </div>
      ) : (
        <div className="grid gap-4">
          {plans.map((plan) => (
            <div
              key={plan.id}
              className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4 hover:border-slate-600/50 transition-colors"
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <h4 className="text-white font-semibold">{plan.name}</h4>
                    <span className={`px-2 py-0.5 rounded text-xs font-medium uppercase ${STATUS_STYLES[plan.status]}`}>
                      {plan.status}
                    </span>
                    {plan.isSystemTemplate && (
                      <span className="px-2 py-0.5 rounded text-xs font-medium bg-purple-500/20 text-purple-400">
                        {t({ zh: '系统模板', en: 'System' })}
                      </span>
                    )}
                  </div>
                  
                  <div className="flex items-center gap-4 text-sm text-slate-400 mb-3">
                    <span className="flex items-center gap-1">
                      <Layers size={14} />
                      {t(PRODUCT_TYPE_LABELS[plan.productType])}
                    </span>
                    <span className="flex items-center gap-1">
                      <Users size={14} />
                      {plan.rules.filter(r => r.active).length} {t({ zh: '个角色', en: 'roles' })}
                    </span>
                    <span className="flex items-center gap-1">
                      <Percent size={14} />
                      {t({ zh: '分佣', en: 'Split' })}: {(plan.feeConfig.splitFeeBps / 100).toFixed(1)}%
                    </span>
                  </div>

                  <div className="flex flex-wrap gap-1">
                    {renderRulesSummary(plan.rules)}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {plan.status === 'draft' && !plan.isSystemTemplate && (
                    <>
                      <button
                        onClick={() => handleActivate(plan.id)}
                        className="p-2 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 transition-colors"
                        title={t({ zh: '激活', en: 'Activate' })}
                      >
                        <Play size={16} />
                      </button>
                      <button
                        onClick={() => handleDelete(plan.id)}
                        className="p-2 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 transition-colors"
                        title={t({ zh: '删除', en: 'Delete' })}
                      >
                        <Trash2 size={16} />
                      </button>
                    </>
                  )}
                  {plan.status === 'active' && !plan.isSystemTemplate && (
                    <button
                      onClick={() => handleArchive(plan.id)}
                      className="p-2 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 transition-colors"
                      title={t({ zh: '归档', en: 'Archive' })}
                    >
                      <Archive size={16} />
                    </button>
                  )}
                  <button
                    onClick={() => {
                      setSelectedPlan(plan);
                      onSelect?.(plan);
                    }}
                    className="p-2 rounded-lg bg-slate-700/50 hover:bg-slate-700 text-slate-300 transition-colors"
                    title={t({ zh: '查看详情', en: 'View Details' })}
                  >
                    <Eye size={16} />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create Modal */}
      {showCreateModal && (
        <CreateSplitPlanModal
          onClose={() => setShowCreateModal(false)}
          onSuccess={() => {
            setShowCreateModal(false);
            loadPlans();
          }}
        />
      )}

      {/* Detail Modal */}
      {selectedPlan && (
        <SplitPlanDetailModal
          plan={selectedPlan}
          onClose={() => setSelectedPlan(null)}
          onUpdate={loadPlans}
        />
      )}
    </div>
  );
};

// ===== Create Modal =====

interface CreateSplitPlanModalProps {
  onClose: () => void;
  onSuccess: () => void;
}

// 预设场景模板
const SCENE_TEMPLATES = [
  {
    id: 'skill_dev',
    name: { zh: 'AI 技能开发者分润', en: 'AI Skill Developer Revenue Share' },
    desc: { zh: '适用于在 Marketplace 发布 AI 技能，开发者获得 70% 收入，平台和推广者各得 20%/10%', en: 'For publishing AI skills on Marketplace. Developer gets 70%, platform 20%, referrer 10%' },
    productType: 'skill' as ProductType,
    rules: [
      { role: 'executor', customRoleName: '技能开发者', shareBps: 7000, recipient: '', active: true },
      { role: 'platform', customRoleName: '平台', shareBps: 2000, recipient: '', active: true },
      { role: 'referrer', customRoleName: '推广者', shareBps: 1000, recipient: '', active: true },
    ],
  },
  {
    id: 'saas_service',
    name: { zh: 'SaaS 服务订阅', en: 'SaaS Subscription' },
    desc: { zh: '适用于 SaaS 订阅制产品，商家获得 80% 收入，平台收取 10% + 推广者 10%', en: 'For SaaS subscription products. Merchant 80%, platform 10%, referrer 10%' },
    productType: 'service' as ProductType,
    rules: [
      { role: 'merchant', customRoleName: '商家', shareBps: 8000, recipient: '', active: true },
      { role: 'platform', customRoleName: '平台', shareBps: 1000, recipient: '', active: true },
      { role: 'referrer', customRoleName: '推广者', shareBps: 1000, recipient: '', active: true },
    ],
  },
  {
    id: 'marketplace_trade',
    name: { zh: '市场交易（买卖双方）', en: 'Marketplace Trade' },
    desc: { zh: '适用于 C2C 或 B2C 市场交易，卖方 85%，平台 10%，推广者 5%', en: 'For C2C/B2C marketplace trades. Seller 85%, platform 10%, referrer 5%' },
    productType: 'virtual' as ProductType,
    rules: [
      { role: 'merchant', customRoleName: '卖方', shareBps: 8500, recipient: '', active: true },
      { role: 'platform', customRoleName: '平台', shareBps: 1000, recipient: '', active: true },
      { role: 'referrer', customRoleName: '推广者', shareBps: 500, recipient: '', active: true },
    ],
  },
  {
    id: 'bounty_task',
    name: { zh: '悬赏任务', en: 'Bounty Task' },
    desc: { zh: '适用于悬赏任务分账，任务执行者 70%，发布者 20%，平台 10%', en: 'For bounty tasks. Executor 70%, publisher 20%, platform 10%' },
    productType: 'agent_task' as ProductType,
    rules: [
      { role: 'executor', customRoleName: '执行者', shareBps: 7000, recipient: '', active: true },
      { role: 'merchant', customRoleName: '发布者', shareBps: 2000, recipient: '', active: true },
      { role: 'platform', customRoleName: '平台', shareBps: 1000, recipient: '', active: true },
    ],
  },
  {
    id: 'custom',
    name: { zh: '自定义方案', en: 'Custom Plan' },
    desc: { zh: '完全自定义分账比例和参与方', en: 'Fully custom split ratios and participants' },
    productType: 'service' as ProductType,
    rules: [
      { role: 'merchant', customRoleName: '商家', shareBps: 7000, recipient: '', active: true },
      { role: 'platform', customRoleName: '平台', shareBps: 3000, recipient: '', active: true },
    ],
  },
];

const CreateSplitPlanModal: React.FC<CreateSplitPlanModalProps> = ({ onClose, onSuccess }) => {
  const { t } = useLocalization();
  const { success, error: showError } = useToast();
  
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [productType, setProductType] = useState<ProductType>('service');
  const [submitting, setSubmitting] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  
  // 分佣规则
  const [rules, setRules] = useState<Array<{
    role: string;
    customRoleName: string;
    shareBps: number;
    recipient: string;
    active: boolean;
  }>>([
    { role: 'merchant', customRoleName: '商家', shareBps: 7000, recipient: '', active: true },
    { role: 'platform', customRoleName: '平台', shareBps: 3000, recipient: '', active: true },
  ]);

  const applyTemplate = (templateId: string) => {
    const tmpl = SCENE_TEMPLATES.find(t => t.id === templateId);
    if (!tmpl) return;
    setSelectedTemplate(templateId);
    setProductType(tmpl.productType);
    setRules(tmpl.rules.map(r => ({ ...r })));
    if (templateId !== 'custom') {
      setName(t(tmpl.name));
      setDescription(t(tmpl.desc));
    }
  };

  // 费率配置
  const [feeConfig, setFeeConfig] = useState({
    onrampFeeBps: 10,
    offrampFeeBps: 10,
    splitFeeBps: 30,
    minSplitFee: 100000,
  });

  const addRule = () => {
    setRules([...rules, {
      role: 'custom',
      customRoleName: '',
      shareBps: 0,
      recipient: '',
      active: true,
    }]);
  };

  const removeRule = (index: number) => {
    setRules(rules.filter((_, i) => i !== index));
  };

  const updateRule = (index: number, updates: Partial<typeof rules[0]>) => {
    const newRules = [...rules];
    newRules[index] = { ...newRules[index], ...updates };
    setRules(newRules);
  };

  const totalShare = rules.filter(r => r.active).reduce((sum, r) => sum + r.shareBps, 0);

  const handleSubmit = async () => {
    if (!name.trim()) {
      showError(t({ zh: '请输入计划名称', en: 'Please enter plan name' }));
      return;
    }

    if (showAdvanced && totalShare !== 10000) {
      showError(t({ zh: '分佣比例总和必须为100%', en: 'Total share must equal 100%' }));
      return;
    }

    try {
      setSubmitting(true);
      await commerceApi.createSplitPlan({
        name: name.trim(),
        description: description.trim() || undefined,
        productType,
        ...(showAdvanced && {
          rules: rules.map(r => ({
            role: r.role as any,
            customRoleName: r.customRoleName || undefined,
            shareBps: r.shareBps,
            recipient: r.recipient || undefined,
            source: 'merchant' as const,
            active: r.active,
          })),
          feeConfig,
        }),
      });
      success(t({ zh: '分佣计划已创建', en: 'Split plan created' }));
      onSuccess();
    } catch (err: any) {
      showError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-slate-900 border border-white/10 rounded-2xl p-6 w-full max-w-lg max-h-[85vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-6 sticky top-0 bg-slate-900 pb-2 -mt-2 pt-2 z-10">
          <h3 className="text-xl font-bold text-white">{t({ zh: '新建分佣计划', en: 'Create Split Plan' })}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-white">
            <X size={20} />
          </button>
        </div>

        <div className="space-y-4">
          {/* 场景模板选择 */}
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase mb-2">
              {t({ zh: '选择场景模板', en: 'Choose a Scenario Template' })}
            </label>
            <div className="grid grid-cols-1 gap-2">
              {SCENE_TEMPLATES.map(tmpl => (
                <button
                  key={tmpl.id}
                  type="button"
                  onClick={() => applyTemplate(tmpl.id)}
                  className={`text-left p-3 rounded-lg border transition-all ${
                    selectedTemplate === tmpl.id
                      ? 'border-blue-500 bg-blue-500/10'
                      : 'border-white/10 bg-slate-800/50 hover:border-white/20'
                  }`}
                >
                  <div className="font-medium text-sm text-white">{t(tmpl.name)}</div>
                  <div className="text-xs text-slate-400 mt-0.5">{t(tmpl.desc)}</div>
                  {selectedTemplate === tmpl.id && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {tmpl.rules.map((r, i) => (
                        <span key={i} className="text-xs px-2 py-0.5 bg-blue-500/20 text-blue-300 rounded-full">
                          {r.customRoleName} {(r.shareBps / 100)}%
                        </span>
                      ))}
                    </div>
                  )}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase mb-2">
              {t({ zh: '计划名称', en: 'Plan Name' })} *
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t({ zh: '例如：技能开发者分润计划', en: 'e.g. Skill Developer Revenue Share' })}
              className="w-full bg-slate-800 border border-white/10 rounded-lg px-4 py-2 text-white outline-none focus:border-blue-500"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase mb-2">
              {t({ zh: '商品类型', en: 'Product Type' })}
            </label>
            <select
              value={productType}
              onChange={(e) => setProductType(e.target.value as ProductType)}
              className="w-full bg-slate-800 border border-white/10 rounded-lg px-4 py-2 text-white outline-none focus:border-blue-500"
            >
              {Object.entries(PRODUCT_TYPE_LABELS).map(([key, label]) => (
                <option key={key} value={key}>{t(label)}</option>
              ))}
            </select>
            <p className="text-xs text-slate-500 mt-1">
              {t({ zh: '系统将根据类型自动应用默认分佣规则', en: 'System will apply default rules based on type' })}
            </p>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase mb-2">
              {t({ zh: '描述', en: 'Description' })}
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t({ zh: '可选，描述此计划的用途', en: 'Optional, describe the purpose of this plan' })}
              className="w-full bg-slate-800 border border-white/10 rounded-lg px-4 py-2 text-white outline-none focus:border-blue-500 h-20"
            />
          </div>

          {/* Advanced Options Toggle */}
          <button
            type="button"
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="flex items-center gap-2 text-sm text-blue-400 hover:text-blue-300 transition-colors"
          >
            <ChevronRight size={16} className={`transition-transform ${showAdvanced ? 'rotate-90' : ''}`} />
            {t({ zh: '高级配置', en: 'Advanced Options' })}
          </button>

          {showAdvanced && (
            <>
              {/* Fee Configuration */}
              <div className="bg-slate-800/50 rounded-lg p-4 space-y-3">
                <h4 className="text-sm font-bold text-slate-400">{t({ zh: '费率配置', en: 'Fee Configuration' })}</h4>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-slate-500">Onramp ({(feeConfig.onrampFeeBps / 100).toFixed(2)}%)</label>
                    <input
                      type="range"
                      min="0"
                      max="100"
                      value={feeConfig.onrampFeeBps}
                      onChange={(e) => setFeeConfig({ ...feeConfig, onrampFeeBps: parseInt(e.target.value) })}
                      className="w-full"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-slate-500">Offramp ({(feeConfig.offrampFeeBps / 100).toFixed(2)}%)</label>
                    <input
                      type="range"
                      min="0"
                      max="100"
                      value={feeConfig.offrampFeeBps}
                      onChange={(e) => setFeeConfig({ ...feeConfig, offrampFeeBps: parseInt(e.target.value) })}
                      className="w-full"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-slate-500">{t({ zh: '分佣费', en: 'Split Fee' })} ({(feeConfig.splitFeeBps / 100).toFixed(2)}%)</label>
                    <input
                      type="range"
                      min="0"
                      max="100"
                      value={feeConfig.splitFeeBps}
                      onChange={(e) => setFeeConfig({ ...feeConfig, splitFeeBps: parseInt(e.target.value) })}
                      className="w-full"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-slate-500">{t({ zh: '最低分佣费 (USDC)', en: 'Min Split Fee (USDC)' })}</label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={feeConfig.minSplitFee / 1000000}
                      onChange={(e) => setFeeConfig({ ...feeConfig, minSplitFee: Math.round(parseFloat(e.target.value) * 1000000) })}
                      className="w-full bg-slate-700 border border-white/10 rounded px-3 py-1 text-white text-sm"
                    />
                  </div>
                </div>
              </div>

              {/* Split Rules */}
              <div className="bg-slate-800/50 rounded-lg p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-bold text-slate-400">{t({ zh: '分佣规则', en: 'Split Rules' })}</h4>
                  <span className={`text-xs font-mono ${totalShare === 10000 ? 'text-emerald-400' : 'text-red-400'}`}>
                    {(totalShare / 100).toFixed(1)}% / 100%
                  </span>
                </div>
                
                {rules.map((rule, index) => (
                  <div key={index} className="flex items-center gap-2 bg-slate-700/50 rounded-lg p-2">
                    <input
                      type="checkbox"
                      checked={rule.active}
                      onChange={(e) => updateRule(index, { active: e.target.checked })}
                      className="rounded"
                    />
                    <input
                      type="text"
                      value={rule.customRoleName}
                      onChange={(e) => updateRule(index, { customRoleName: e.target.value })}
                      placeholder={t({ zh: '角色名称', en: 'Role name' })}
                      className="flex-1 bg-slate-600 border-none rounded px-2 py-1 text-white text-sm"
                    />
                    <div className="flex items-center gap-1 w-24">
                      <input
                        type="number"
                        min="0"
                        max="10000"
                        value={rule.shareBps / 100}
                        onChange={(e) => updateRule(index, { shareBps: Math.round(parseFloat(e.target.value) * 100) })}
                        className="w-16 bg-slate-600 border-none rounded px-2 py-1 text-white text-sm text-right"
                      />
                      <span className="text-slate-400 text-sm">%</span>
                    </div>
                    <button
                      onClick={() => removeRule(index)}
                      className="p-1 text-red-400 hover:text-red-300"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}

                <button
                  type="button"
                  onClick={addRule}
                  className="w-full py-2 border border-dashed border-slate-600 rounded-lg text-slate-400 hover:text-white hover:border-slate-500 transition-colors flex items-center justify-center gap-2"
                >
                  <Plus size={14} />
                  {t({ zh: '添加规则', en: 'Add Rule' })}
                </button>
              </div>
            </>
          )}
        </div>

        <div className="flex gap-3 mt-6">
          <button
            onClick={onClose}
            className="flex-1 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg font-bold transition-colors"
          >
            {t({ zh: '取消', en: 'Cancel' })}
          </button>
          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="flex-1 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-bold transition-colors disabled:opacity-50"
          >
            {submitting ? t({ zh: '创建中...', en: 'Creating...' }) : t({ zh: '创建计划', en: 'Create Plan' })}
          </button>
        </div>
      </div>
    </div>
  );
};

// ===== Detail Modal with Multi-Level Commission Visualization =====

interface SplitPlanDetailModalProps {
  plan: SplitPlan;
  onClose: () => void;
  onUpdate: () => void;
}

// Role color mapping for the chain diagram
const ROLE_COLORS: Record<string, { bg: string; border: string; text: string; glow: string }> = {
  platform: { bg: 'bg-blue-500/15', border: 'border-blue-500/40', text: 'text-blue-400', glow: 'shadow-blue-500/10' },
  merchant: { bg: 'bg-emerald-500/15', border: 'border-emerald-500/40', text: 'text-emerald-400', glow: 'shadow-emerald-500/10' },
  referrer: { bg: 'bg-purple-500/15', border: 'border-purple-500/40', text: 'text-purple-400', glow: 'shadow-purple-500/10' },
  promoter: { bg: 'bg-amber-500/15', border: 'border-amber-500/40', text: 'text-amber-400', glow: 'shadow-amber-500/10' },
  executor: { bg: 'bg-cyan-500/15', border: 'border-cyan-500/40', text: 'text-cyan-400', glow: 'shadow-cyan-500/10' },
  custom: { bg: 'bg-pink-500/15', border: 'border-pink-500/40', text: 'text-pink-400', glow: 'shadow-pink-500/10' },
};

const getRoleColor = (role: string) => ROLE_COLORS[role] || ROLE_COLORS.custom;

const SplitPlanDetailModal: React.FC<SplitPlanDetailModalProps> = ({ plan, onClose, onUpdate }) => {
  const { t } = useLocalization();
  const [detailTab, setDetailTab] = useState<'overview' | 'chain' | 'simulate'>('overview');
  const [simulateAmount, setSimulateAmount] = useState(100);

  const formatShare = (bps: number) => `${(bps / 100).toFixed(1)}%`;
  const formatFee = (bps: number) => `${(bps / 100).toFixed(2)}%`;

  const activeRules = useMemo(() => plan.rules.filter(r => r.active), [plan.rules]);

  // Simulate commission distribution
  const simulation = useMemo(() => {
    const amount = simulateAmount;
    const platformFee = amount * (plan.feeConfig.splitFeeBps / 10000);
    const distributable = amount - platformFee;
    const results = activeRules.map(rule => ({
      role: rule.customRoleName || rule.role,
      roleKey: rule.role,
      share: rule.shareBps,
      amount: distributable * (rule.shareBps / 10000),
    }));
    return { amount, platformFee, distributable, results };
  }, [simulateAmount, plan, activeRules]);

  // Build multi-level chain: L1 = Platform Base, L2 = Commission Pool split, L3 = Sub-referral
  const chainLevels = useMemo(() => {
    const levels: Array<{
      level: string;
      label: { zh: string; en: string };
      color: string;
      nodes: Array<{ name: string; role: string; shareBps: number; amount: number }>;
    }> = [];

    // L1: Platform takes base fee
    levels.push({
      level: 'L1',
      label: { zh: '平台基础层', en: 'Platform Base Layer' },
      color: 'blue',
      nodes: [{
        name: t({ zh: '平台手续费', en: 'Platform Fee' }),
        role: 'platform',
        shareBps: plan.feeConfig.splitFeeBps,
        amount: simulation.platformFee,
      }],
    });

    // L2: Primary split among roles
    const l2Nodes = activeRules
      .filter(r => ['merchant', 'platform', 'executor'].includes(r.role) || r.role === 'custom')
      .map(r => ({
        name: r.customRoleName || r.role,
        role: r.role,
        shareBps: r.shareBps,
        amount: simulation.distributable * (r.shareBps / 10000),
      }));
    if (l2Nodes.length > 0) {
      levels.push({
        level: 'L2',
        label: { zh: '主分佣层', en: 'Primary Split Layer' },
        color: 'emerald',
        nodes: l2Nodes,
      });
    }

    // L3: Referral / Promoter chain
    const l3Nodes = activeRules
      .filter(r => ['referrer', 'promoter'].includes(r.role))
      .map(r => ({
        name: r.customRoleName || r.role,
        role: r.role,
        shareBps: r.shareBps,
        amount: simulation.distributable * (r.shareBps / 10000),
      }));
    if (l3Nodes.length > 0) {
      levels.push({
        level: 'L3',
        label: { zh: '推荐分佣层', en: 'Referral Split Layer' },
        color: 'purple',
        nodes: l3Nodes,
      });
    }

    return levels;
  }, [plan, activeRules, simulation, t]);

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-slate-900 border border-white/10 rounded-2xl p-6 w-full max-w-3xl max-h-[85vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-xl font-bold text-white">{plan.name}</h3>
            <p className="text-sm text-slate-400">{t(PRODUCT_TYPE_LABELS[plan.productType])} · v{plan.version}</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white">
            <X size={20} />
          </button>
        </div>

        {plan.description && (
          <p className="text-slate-300 mb-4 text-sm">{plan.description}</p>
        )}

        {/* Detail Tabs */}
        <div className="flex gap-1 bg-slate-800/50 rounded-xl p-1 mb-6">
          {[
            { id: 'overview' as const, label: { zh: '概览', en: 'Overview' }, icon: Eye },
            { id: 'chain' as const, label: { zh: '分佣链路图', en: 'Commission Chain' }, icon: GitBranch },
            { id: 'simulate' as const, label: { zh: '模拟计算', en: 'Simulate' }, icon: TrendingUp },
          ].map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setDetailTab(tab.id)}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold whitespace-nowrap transition-all flex-1 justify-center ${
                  detailTab === tab.id
                    ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20'
                    : 'text-slate-400 hover:text-white hover:bg-white/5'
                }`}
              >
                <Icon size={14} />
                {t(tab.label)}
              </button>
            );
          })}
        </div>

        {/* ===== Tab: Overview ===== */}
        {detailTab === 'overview' && (
          <>
            {/* Fee Config */}
            <div className="mb-6">
              <h4 className="text-sm font-bold text-slate-400 uppercase mb-3">{t({ zh: '费率配置', en: 'Fee Configuration' })}</h4>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="bg-slate-800/50 rounded-lg p-3">
                  <p className="text-xs text-slate-500 mb-1">Onramp</p>
                  <p className="text-white font-semibold">{formatFee(plan.feeConfig.onrampFeeBps)}</p>
                </div>
                <div className="bg-slate-800/50 rounded-lg p-3">
                  <p className="text-xs text-slate-500 mb-1">Offramp</p>
                  <p className="text-white font-semibold">{formatFee(plan.feeConfig.offrampFeeBps)}</p>
                </div>
                <div className="bg-slate-800/50 rounded-lg p-3">
                  <p className="text-xs text-slate-500 mb-1">{t({ zh: '分佣费', en: 'Split Fee' })}</p>
                  <p className="text-white font-semibold">{formatFee(plan.feeConfig.splitFeeBps)}</p>
                </div>
                <div className="bg-slate-800/50 rounded-lg p-3">
                  <p className="text-xs text-slate-500 mb-1">{t({ zh: '最低分佣', en: 'Min Split' })}</p>
                  <p className="text-white font-semibold">{(plan.feeConfig.minSplitFee / 1000000).toFixed(2)} USDC</p>
                </div>
              </div>
            </div>

            {/* Rules */}
            <div className="mb-6">
              <h4 className="text-sm font-bold text-slate-400 uppercase mb-3">{t({ zh: '分佣规则', en: 'Split Rules' })}</h4>
              {plan.rules.length === 0 ? (
                <p className="text-slate-500 text-sm">{t({ zh: '暂无规则', en: 'No rules defined' })}</p>
              ) : (
                <div className="space-y-2">
                  {plan.rules.map((rule, index) => {
                    const colors = getRoleColor(rule.role);
                    return (
                      <div
                        key={index}
                        className={`flex items-center justify-between rounded-lg p-3 border ${!rule.active ? 'opacity-40 bg-slate-800/30 border-white/5' : `${colors.bg} ${colors.border}`}`}
                      >
                        <div className="flex items-center gap-3">
                          <span className={`w-2 h-2 rounded-full ${rule.active ? 'bg-emerald-400' : 'bg-slate-500'}`} />
                          <div>
                            <p className={`font-medium ${rule.active ? colors.text : 'text-slate-500'}`}>{rule.customRoleName || rule.role}</p>
                            <p className="text-xs text-slate-500">{rule.source} · {rule.recipient || t({ zh: '未设置', en: 'Not set' })}</p>
                          </div>
                        </div>
                        <span className={`font-bold text-lg ${rule.active ? colors.text : 'text-slate-500'}`}>{formatShare(rule.shareBps)}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Stats */}
            <div className="flex items-center justify-between text-sm text-slate-500 pt-4 border-t border-slate-700/50">
              <span>{t({ zh: '使用次数', en: 'Usage Count' })}: {plan.usageCount}</span>
              <span>{t({ zh: '创建于', en: 'Created' })}: {new Date(plan.createdAt).toLocaleDateString()}</span>
            </div>
          </>
        )}

        {/* ===== Tab: Commission Chain Diagram (L1/L2/L3) ===== */}
        {detailTab === 'chain' && (
          <div className="space-y-2">
            <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-3 mb-4 flex items-start gap-2">
              <Info size={16} className="text-blue-400 shrink-0 mt-0.5" />
              <p className="text-xs text-blue-300">
                {t({
                  zh: '下图展示了一笔 $100 交易在当前分佣计划下的资金流向。每一层级代表一个分佣阶段，从平台基础费到主分佣再到推荐链路。',
                  en: 'The diagram below shows the fund flow of a $100 transaction under this split plan. Each level represents a commission stage, from platform base fee to primary split to referral chain.'
                })}
              </p>
            </div>

            {/* Transaction Source */}
            <div className="flex justify-center mb-1">
              <div className="bg-gradient-to-r from-amber-500/20 to-orange-500/20 border border-amber-500/30 rounded-xl px-6 py-3 text-center shadow-lg shadow-amber-500/5">
                <div className="flex items-center gap-2 justify-center mb-1">
                  <DollarSign size={18} className="text-amber-400" />
                  <span className="text-lg font-bold text-amber-300">$100.00</span>
                </div>
                <span className="text-[10px] text-amber-400/70 uppercase font-bold tracking-wider">{t({ zh: '交易金额', en: 'Transaction Amount' })}</span>
              </div>
            </div>

            {/* Chain Levels */}
            {chainLevels.map((level, levelIdx) => {
              const levelColors: Record<string, string> = {
                blue: 'from-blue-500/30 to-blue-500/5 border-blue-500/20',
                emerald: 'from-emerald-500/30 to-emerald-500/5 border-emerald-500/20',
                purple: 'from-purple-500/30 to-purple-500/5 border-purple-500/20',
              };
              const arrowColors: Record<string, string> = {
                blue: 'text-blue-500',
                emerald: 'text-emerald-500',
                purple: 'text-purple-500',
              };
              const labelColors: Record<string, string> = {
                blue: 'text-blue-400 bg-blue-500/10 border-blue-500/20',
                emerald: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
                purple: 'text-purple-400 bg-purple-500/10 border-purple-500/20',
              };

              return (
                <React.Fragment key={level.level}>
                  {/* Arrow connector */}
                  <div className="flex justify-center py-1">
                    <div className="flex flex-col items-center">
                      <div className={`w-0.5 h-4 ${arrowColors[level.color]?.replace('text-', 'bg-') || 'bg-slate-600'} opacity-50`} />
                      <ArrowDown size={16} className={arrowColors[level.color] || 'text-slate-500'} />
                    </div>
                  </div>

                  {/* Level Container */}
                  <div className={`bg-gradient-to-b ${levelColors[level.color] || ''} border rounded-xl p-4`}>
                    {/* Level Header */}
                    <div className="flex items-center gap-2 mb-3">
                      <span className={`text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded border ${labelColors[level.color] || ''}`}>
                        {level.level}
                      </span>
                      <span className="text-sm font-semibold text-slate-300">{t(level.label)}</span>
                    </div>

                    {/* Nodes */}
                    <div className={`grid gap-3 ${level.nodes.length === 1 ? 'grid-cols-1' : level.nodes.length === 2 ? 'grid-cols-2' : 'grid-cols-2 md:grid-cols-3'}`}>
                      {level.nodes.map((node, nodeIdx) => {
                        const colors = getRoleColor(node.role);
                        return (
                          <div
                            key={nodeIdx}
                            className={`${colors.bg} border ${colors.border} rounded-xl p-3 shadow-lg ${colors.glow} relative`}
                          >
                            <div className="flex items-center gap-2 mb-2">
                              <Wallet size={14} className={colors.text} />
                              <span className={`text-sm font-bold ${colors.text}`}>{node.name}</span>
                            </div>
                            <div className="flex items-baseline justify-between">
                              <span className="text-white text-xl font-black">${node.amount.toFixed(2)}</span>
                              <span className={`text-xs font-bold ${colors.text} opacity-70`}>
                                {(node.shareBps / 100).toFixed(1)}%
                              </span>
                            </div>
                            {/* Mini progress bar */}
                            <div className="mt-2 h-1 bg-white/5 rounded-full overflow-hidden">
                              <div
                                className={`h-full rounded-full ${colors.border.replace('border-', 'bg-').replace('/40', '')}`}
                                style={{ width: `${Math.min(node.shareBps / 100, 100)}%` }}
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </React.Fragment>
              );
            })}

            {/* No referral hint */}
            {!activeRules.some(r => ['referrer', 'promoter'].includes(r.role)) && (
              <div className="flex justify-center py-1">
                <div className="flex flex-col items-center">
                  <div className="w-0.5 h-4 bg-slate-600 opacity-30" />
                  <ArrowDown size={16} className="text-slate-600" />
                </div>
              </div>
            )}
            {!activeRules.some(r => ['referrer', 'promoter'].includes(r.role)) && (
              <div className="border border-dashed border-slate-700 rounded-xl p-4 text-center">
                <GitBranch size={20} className="mx-auto mb-2 text-slate-600" />
                <p className="text-sm text-slate-500">{t({ zh: '此计划暂无推荐/推广者分佣层', en: 'No referral/promoter layer in this plan' })}</p>
                <p className="text-xs text-slate-600 mt-1">{t({ zh: '添加 referrer 或 promoter 角色以启用 L3 推荐链路', en: 'Add referrer or promoter roles to enable L3 referral chain' })}</p>
              </div>
            )}
          </div>
        )}

        {/* ===== Tab: Simulate ===== */}
        {detailTab === 'simulate' && (
          <div className="space-y-6">
            {/* Amount Input */}
            <div className="bg-slate-800/50 rounded-xl p-4">
              <label className="block text-xs font-bold text-slate-500 uppercase mb-2">
                {t({ zh: '模拟交易金额 (USDC)', en: 'Simulate Transaction Amount (USDC)' })}
              </label>
              <div className="flex items-center gap-3">
                <DollarSign size={20} className="text-slate-500" />
                <input
                  type="number"
                  min="1"
                  step="10"
                  value={simulateAmount}
                  onChange={(e) => setSimulateAmount(Math.max(1, parseFloat(e.target.value) || 1))}
                  className="flex-1 bg-slate-900/50 border border-white/10 rounded-lg px-4 py-2.5 text-white text-lg font-bold outline-none focus:border-blue-500"
                />
              </div>
              <div className="flex gap-2 mt-3">
                {[10, 50, 100, 500, 1000].map((amt) => (
                  <button
                    key={amt}
                    onClick={() => setSimulateAmount(amt)}
                    className={`px-3 py-1 rounded-lg text-xs font-bold transition-colors ${
                      simulateAmount === amt ? 'bg-blue-600 text-white' : 'bg-slate-700/50 text-slate-400 hover:text-white'
                    }`}
                  >
                    ${amt}
                  </button>
                ))}
              </div>
            </div>

            {/* Simulation Results */}
            <div className="bg-slate-800/50 rounded-xl p-4">
              <h4 className="text-sm font-bold text-slate-400 uppercase mb-4">{t({ zh: '分佣结果', en: 'Split Results' })}</h4>

              {/* Platform Fee */}
              <div className="flex items-center justify-between p-3 bg-blue-500/10 border border-blue-500/20 rounded-lg mb-3">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-blue-500/20 flex items-center justify-center">
                    <Layers size={16} className="text-blue-400" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-blue-400">{t({ zh: '平台手续费', en: 'Platform Fee' })}</p>
                    <p className="text-[10px] text-slate-500">{formatFee(plan.feeConfig.splitFeeBps)}</p>
                  </div>
                </div>
                <span className="text-lg font-black text-blue-400">${simulation.platformFee.toFixed(2)}</span>
              </div>

              {/* Distributable */}
              <div className="flex items-center justify-between px-3 py-2 mb-3">
                <span className="text-xs text-slate-500">{t({ zh: '可分配金额', en: 'Distributable' })}</span>
                <span className="text-sm font-bold text-white">${simulation.distributable.toFixed(2)}</span>
              </div>

              {/* Role Splits */}
              <div className="space-y-2">
                {simulation.results.map((result, idx) => {
                  const colors = getRoleColor(result.roleKey);
                  const barWidth = Math.min((result.share / 10000) * 100, 100);
                  return (
                    <div key={idx} className={`p-3 rounded-lg border ${colors.bg} ${colors.border}`}>
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <Wallet size={14} className={colors.text} />
                          <span className={`text-sm font-semibold ${colors.text}`}>{result.role}</span>
                          <span className="text-[10px] text-slate-500">{formatShare(result.share)}</span>
                        </div>
                        <span className="text-lg font-black text-white">${result.amount.toFixed(2)}</span>
                      </div>
                      <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all duration-500 ${colors.border.replace('border-', 'bg-').replace('/40', '')}`}
                          style={{ width: `${barWidth}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Total Check */}
              <div className="flex items-center justify-between mt-4 pt-3 border-t border-white/5">
                <span className="text-sm font-bold text-slate-400">{t({ zh: '合计', en: 'Total' })}</span>
                <span className="text-lg font-black text-white">
                  ${(simulation.platformFee + simulation.results.reduce((s, r) => s + r.amount, 0)).toFixed(2)}
                </span>
              </div>
            </div>
          </div>
        )}

        <button
          onClick={onClose}
          className="w-full mt-6 py-2.5 bg-slate-800 hover:bg-slate-700 text-white rounded-lg font-bold transition-colors"
        >
          {t({ zh: '关闭', en: 'Close' })}
        </button>
      </div>
    </div>
  );
};

export default SplitPlansPanel;
