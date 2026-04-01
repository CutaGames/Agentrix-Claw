import React, { useState, useEffect, useCallback } from 'react';
import {
  agentTeamApi,
  TeamTemplate,
  MyTeam,
  AgentRoleDefinition,
  ProvisionedTeamResult,
} from '../lib/api/agent-team.api';

// ========== 小组件 ==========

/** 模型层级 Badge */
function ModelTierBadge({ tier }: { tier?: string }) {
  if (!tier) return null;
  const colorMap: Record<string, string> = {
    '💎 Opus': 'bg-purple-100 text-purple-800',
    '🔥 Standard': 'bg-orange-100 text-orange-800',
    '⚡ Budget': 'bg-yellow-100 text-yellow-800',
    '🆓 Free': 'bg-gray-100 text-gray-600',
  };
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${colorMap[tier] || 'bg-gray-100 text-gray-600'}`}>
      {tier}
    </span>
  );
}

/** 审批级别 Badge */
function ApprovalBadge({ level }: { level?: string }) {
  if (!level) return null;
  const map: Record<string, { label: string; color: string }> = {
    auto: { label: '🟢 自动执行', color: 'text-green-600' },
    'timeout-auto': { label: '🟡 超时自动', color: 'text-yellow-600' },
    manual: { label: '🔴 人工审批', color: 'text-red-600' },
  };
  const info = map[level] || { label: level, color: 'text-gray-600' };
  return <span className={`text-xs ${info.color}`}>{info.label}</span>;
}

/** 状态 Badge */
function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; class: string }> = {
    active: { label: '运行中', class: 'bg-green-100 text-green-700' },
    suspended: { label: '已暂停', class: 'bg-yellow-100 text-yellow-700' },
    revoked: { label: '已撤销', class: 'bg-red-100 text-red-700' },
    draft: { label: '草稿', class: 'bg-gray-100 text-gray-600' },
  };
  const info = map[status] || { label: status, class: 'bg-gray-100 text-gray-600' };
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${info.class}`}>
      {info.label}
    </span>
  );
}

// ========== 新手引导 ==========

function OnboardingBanner({ onDismiss }: { onDismiss: () => void }) {
  return (
    <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-xl p-6 mb-6">
      <div className="flex justify-between items-start">
        <div>
          <h3 className="text-lg font-bold text-blue-900 mb-2">👋 欢迎使用 Agent Team Studio</h3>
          <p className="text-blue-700 text-sm mb-4 max-w-2xl">
            Agent 团队可以帮你自动化完成从策略规划到代码开发、从社区运营到资产管理的各项任务。
            就像组建一个 AI 驱动的创业团队。
          </p>
        </div>
        <button onClick={onDismiss} className="text-blue-400 hover:text-blue-600 text-sm">✕ 关闭</button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        {[
          { step: '1', title: '选择模板', desc: '浏览官方或社区模板，选适合你的团队配置', icon: '📋' },
          { step: '2', title: '一键创建', desc: '点击"创建团队"，所有 Agent 自动激活', icon: '🚀' },
          { step: '3', title: '分配任务', desc: '在聊天中 @agent 或通过 API 调度任务', icon: '💬' },
          { step: '4', title: '监督优化', desc: '查看各 Agent 运行状态和信用评分', icon: '📊' },
        ].map(s => (
          <div key={s.step} className="bg-white/60 rounded-lg p-3 text-center">
            <div className="text-2xl mb-1">{s.icon}</div>
            <div className="font-semibold text-sm text-blue-900">步骤 {s.step}: {s.title}</div>
            <div className="text-xs text-blue-600 mt-1">{s.desc}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ========== 模板卡片 ==========

function TemplateCard({
  template,
  onSelect,
  isCreating,
}: {
  template: TeamTemplate;
  onSelect: (t: TeamTemplate) => void;
  isCreating: boolean;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="border border-gray-200 rounded-xl overflow-hidden hover:shadow-md transition-shadow">
      <div className="p-5">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="font-bold text-lg text-gray-900">{template.name}</h3>
            {template.visibility === 'official' && (
              <span className="text-xs text-indigo-600 font-medium">⭐ 官方推荐</span>
            )}
          </div>
          <div className="text-right">
            <div className="text-2xl font-bold text-indigo-600">{template.teamSize}</div>
            <div className="text-xs text-gray-500">个 Agent</div>
          </div>
        </div>

        <p className="text-sm text-gray-600 mb-3">{template.description}</p>

        {template.tags && (
          <div className="flex flex-wrap gap-1 mb-3">
            {template.tags.map(tag => (
              <span key={tag} className="px-2 py-0.5 bg-gray-100 text-gray-600 rounded text-xs">
                #{tag}
              </span>
            ))}
          </div>
        )}

        <div className="text-xs text-gray-400 mb-3">
          已被 {template.usageCount} 个团队使用
        </div>

        {/* 角色预览 */}
        <button
          onClick={() => setExpanded(!expanded)}
          className="text-sm text-indigo-600 hover:text-indigo-800 mb-3"
        >
          {expanded ? '▼ 收起角色列表' : '▶ 查看全部角色'}
        </button>

        {expanded && (
          <div className="space-y-2 mb-4 max-h-80 overflow-y-auto">
            {template.roles.map(role => (
              <RolePreviewRow key={role.codename} role={role} />
            ))}
          </div>
        )}

        <button
          onClick={() => onSelect(template)}
          disabled={isCreating}
          className="w-full py-2.5 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
        >
          {isCreating ? '创建中...' : '🚀 使用此模板创建团队'}
        </button>
      </div>
    </div>
  );
}

/** 单个角色预览行 */
function RolePreviewRow({ role }: { role: AgentRoleDefinition }) {
  return (
    <div className="flex items-center gap-3 p-2 bg-gray-50 rounded-lg">
      <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center text-sm font-bold text-indigo-700">
        {role.codename.charAt(0).toUpperCase()}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium text-sm text-gray-900 truncate">{role.name}</span>
          <ModelTierBadge tier={role.modelTier} />
          <ApprovalBadge level={role.approvalLevel} />
        </div>
        <div className="text-xs text-gray-500 truncate">{role.description}</div>
      </div>
      <div className="text-right text-xs text-gray-400">
        {role.spendingLimits && <div>日限 ${role.spendingLimits.dailyLimit}</div>}
      </div>
    </div>
  );
}

// ========== 已创建的团队面板 ==========

function MyTeamPanel({
  team,
  onDisband,
}: {
  team: MyTeam;
  onDisband: (slug: string) => void;
}) {
  const activeCount = team.agents.filter(a => a.status === 'active').length;
  const [showDisband, setShowDisband] = useState(false);

  return (
    <div className="border border-gray-200 rounded-xl p-5 mb-4">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="font-bold text-gray-900">{team.templateName}</h3>
          <span className="text-xs text-gray-500">
            {activeCount}/{team.agents.length} 个 Agent 运行中
          </span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-green-400 animate-pulse" title="运行中" />
          <button
            onClick={() => setShowDisband(!showDisband)}
            className="text-xs text-red-500 hover:text-red-700"
          >
            解散团队
          </button>
        </div>
      </div>

      {showDisband && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4">
          <p className="text-sm text-red-700 mb-2">确定要解散此团队吗？所有 Agent 将被撤销。</p>
          <div className="flex gap-2">
            <button
              onClick={() => onDisband(team.templateSlug)}
              className="px-3 py-1 bg-red-600 text-white rounded text-sm hover:bg-red-700"
            >
              确认解散
            </button>
            <button
              onClick={() => setShowDisband(false)}
              className="px-3 py-1 bg-gray-200 text-gray-700 rounded text-sm hover:bg-gray-300"
            >
              取消
            </button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {team.agents.map(agent => (
          <div key={agent.id} className="bg-gray-50 rounded-lg p-3">
            <div className="flex items-center gap-2 mb-1">
              <div className="w-7 h-7 rounded-full bg-indigo-100 flex items-center justify-center text-xs font-bold text-indigo-700">
                {agent.codename.charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-medium text-sm text-gray-900 truncate">{agent.name}</div>
                <div className="text-xs text-gray-500">@{agent.codename}</div>
              </div>
              <StatusBadge status={agent.status} />
            </div>
            <div className="flex items-center justify-between mt-2 text-xs text-gray-500">
              <span>信用分: {agent.creditScore}</span>
              <ModelTierBadge tier={agent.modelTier} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ========== 创建确认弹窗 ==========

function ProvisionModal({
  template,
  onClose,
  onConfirm,
  isCreating,
}: {
  template: TeamTemplate;
  onClose: () => void;
  onConfirm: (prefix: string) => void;
  isCreating: boolean;
}) {
  const [prefix, setPrefix] = useState('');

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl max-w-lg w-full max-h-[80vh] overflow-y-auto">
        <div className="p-6">
          <h2 className="text-xl font-bold text-gray-900 mb-2">🚀 创建 Agent 团队</h2>
          <p className="text-sm text-gray-600 mb-4">
            使用 <span className="font-medium">{template.name}</span> 模板创建 {template.teamSize} 个 AI Agent。
          </p>

          {/* 团队名称前缀 */}
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              团队名称前缀（可选）
            </label>
            <input
              type="text"
              value={prefix}
              onChange={e => setPrefix(e.target.value)}
              placeholder="例如: My Startup"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
            />
            <p className="text-xs text-gray-500 mt-1">
              留空则直接使用角色名。填写后会显示为 "前缀 — 角色名"。
            </p>
          </div>

          {/* 要创建的角色预览 */}
          <div className="mb-4">
            <h4 className="text-sm font-medium text-gray-700 mb-2">将创建以下 Agent:</h4>
            <div className="space-y-1.5 max-h-48 overflow-y-auto">
              {template.roles.map(role => (
                <div key={role.codename} className="flex items-center gap-2 text-sm">
                  <span className="w-5 h-5 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center text-xs font-bold">
                    {role.codename.charAt(0).toUpperCase()}
                  </span>
                  <span className="font-medium">{prefix ? `${prefix} — ${role.name}` : role.name}</span>
                  <ModelTierBadge tier={role.modelTier} />
                </div>
              ))}
            </div>
          </div>

          {/* 費用说明 */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-4">
            <p className="text-xs text-blue-700">
              💡 <strong>费用说明:</strong> 创建团队本身免费。Agent 运行时根据所用模型层级计费。
              每个 Agent 有独立的支出限额控制，不会超出预算。
            </p>
          </div>

          <div className="flex gap-3">
            <button
              onClick={() => onConfirm(prefix)}
              disabled={isCreating}
              className="flex-1 py-2.5 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
            >
              {isCreating ? '创建中...' : `确认创建 ${template.teamSize} 个 Agent`}
            </button>
            <button
              onClick={onClose}
              disabled={isCreating}
              className="px-4 py-2.5 bg-gray-100 text-gray-700 rounded-lg font-medium hover:bg-gray-200"
            >
              取消
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ========== 创建成功弹窗 ==========

function SuccessModal({
  result,
  onClose,
}: {
  result: ProvisionedTeamResult;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl max-w-md w-full">
        <div className="p-6 text-center">
          <div className="text-5xl mb-3">🎉</div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">团队创建成功！</h2>
          <p className="text-sm text-gray-600 mb-4">
            {result.templateName} — {result.teamSize} 个 Agent 已全部激活
          </p>

          <div className="bg-gray-50 rounded-lg p-3 mb-4 text-left max-h-48 overflow-y-auto">
            {result.agents.map(a => (
              <div key={a.agentId} className="flex items-center gap-2 py-1.5 text-sm">
                <span className="text-green-500">✅</span>
                <span className="font-medium">{a.name}</span>
                <span className="text-xs text-gray-400">({a.agentUniqueId})</span>
              </div>
            ))}
          </div>

          {/* 下一步引导 */}
          <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-3 mb-4 text-left">
            <p className="text-sm font-medium text-indigo-900 mb-2">接下来可以:</p>
            <ul className="text-xs text-indigo-700 space-y-1">
              <li>💬 在 OpenClaw 聊天中 @codename 调用特定 Agent</li>
              <li>📊 在 Agent 账户页面查看各 Agent 的运行状态</li>
              <li>⚙️ 调整各 Agent 的支出限额和模型配置</li>
              <li>🔗 为 Agent 链上注册获得链上身份（可选，免 Gas）</li>
            </ul>
          </div>

          <button
            onClick={onClose}
            className="w-full py-2.5 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700"
          >
            开始使用
          </button>
        </div>
      </div>
    </div>
  );
}

// ========== 主页面 ==========

export default function AgentTeamStudioPage() {
  const [templates, setTemplates] = useState<TeamTemplate[]>([]);
  const [myTeams, setMyTeams] = useState<MyTeam[]>([]);
  const [loading, setLoading] = useState(true);
  const [showOnboarding, setShowOnboarding] = useState(true);
  const [selectedTemplate, setSelectedTemplate] = useState<TeamTemplate | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [successResult, setSuccessResult] = useState<ProvisionedTeamResult | null>(null);

  const loadData = useCallback(async () => {
    try {
      const [tpls, teams] = await Promise.all([
        agentTeamApi.listTemplates(),
        agentTeamApi.getMyTeams(),
      ]);
      setTemplates(tpls);
      setMyTeams(teams);
      if (teams.length > 0) setShowOnboarding(false);
    } catch (err) {
      console.error('加载数据失败:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const handleProvision = async (prefix: string) => {
    if (!selectedTemplate) return;
    setIsCreating(true);
    try {
      const result = await agentTeamApi.provisionTeam(selectedTemplate.id, prefix || undefined);
      if (result) {
        setSuccessResult(result);
        setSelectedTemplate(null);
        loadData(); // 刷新
      }
    } catch (err: any) {
      alert(err?.message || '创建失败，请稍后重试');
    } finally {
      setIsCreating(false);
    }
  };

  const handleDisband = async (slug: string) => {
    if (!confirm('确定要解散此团队？此操作不可撤销。')) return;
    try {
      await agentTeamApi.disbandTeam(slug);
      loadData();
    } catch (err: any) {
      alert(err?.message || '解散失败');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="animate-spin rounded-full w-8 h-8 border-b-2 border-indigo-600" />
        <span className="ml-3 text-gray-500">加载中...</span>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-6">
      {/* 页头 */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">🤖 Agent Team Studio</h1>
        <p className="text-gray-600 mt-1">
          一键组建你的 AI Agent 团队 — 从模板创建，每个 Agent 拥有独立身份、资金账户和能力配置
        </p>
      </div>

      {/* 新手引导 */}
      {showOnboarding && <OnboardingBanner onDismiss={() => setShowOnboarding(false)} />}

      {/* 已创建的团队 */}
      {myTeams.length > 0 && (
        <div className="mb-8">
          <h2 className="text-lg font-bold text-gray-900 mb-3">📂 我的团队</h2>
          {myTeams.map(team => (
            <MyTeamPanel key={team.templateSlug} team={team} onDisband={handleDisband} />
          ))}
        </div>
      )}

      {/* 模板列表 */}
      <div className="mb-8">
        <h2 className="text-lg font-bold text-gray-900 mb-3">📋 团队模板</h2>
        {templates.length === 0 ? (
          <div className="text-center py-12 bg-gray-50 rounded-xl">
            <div className="text-4xl mb-3">📭</div>
            <p className="text-gray-500">暂无可用模板</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {templates.map(t => (
              <TemplateCard
                key={t.id}
                template={t}
                onSelect={setSelectedTemplate}
                isCreating={isCreating}
              />
            ))}
          </div>
        )}
      </div>

      {/* FAQ */}
      <div className="bg-gray-50 rounded-xl p-5">
        <h3 className="font-bold text-gray-900 mb-3">❓ 常见问题</h3>
        <div className="space-y-3 text-sm">
          <details className="group">
            <summary className="cursor-pointer font-medium text-gray-700 group-open:text-indigo-600">
              Agent 团队是什么？
            </summary>
            <p className="mt-1 text-gray-600 pl-4">
              Agent 团队是一组 AI Agent 的集合，每个 Agent 专注不同领域（如开发、增长、社区等）。
              它们可以独立执行任务，也可以相互协作。类似于一个 AI 驱动的虚拟公司团队。
            </p>
          </details>
          <details className="group">
            <summary className="cursor-pointer font-medium text-gray-700 group-open:text-indigo-600">
              创建团队需要多少费用？
            </summary>
            <p className="mt-1 text-gray-600 pl-4">
              创建团队本身完全免费。Agent 使用 AI 模型执行任务时，按实际调用量计费。
              每个 Agent 有独立的日/月支出限额，不会超出你设定的预算。
            </p>
          </details>
          <details className="group">
            <summary className="cursor-pointer font-medium text-gray-700 group-open:text-indigo-600">
              什么是模型层级？
            </summary>
            <p className="mt-1 text-gray-600 pl-4">
              💎 Opus = 最强模型（适合复杂推理）;
              🔥 Standard = 日常主力;
              ⚡ Budget = 高效低成本;
              🆓 Free = 完全免费（轻量任务）。
              创建后可以自行调整每个 Agent 使用的模型。
            </p>
          </details>
          <details className="group">
            <summary className="cursor-pointer font-medium text-gray-700 group-open:text-indigo-600">
              如何和 Agent 互动？
            </summary>
            <p className="mt-1 text-gray-600 pl-4">
              在 OpenClaw 聊天界面中使用 @codename 调用特定 Agent（如 @dev 写代码、@growth 做增长分析）。
              也可以通过 API 以编程方式调度任务。
            </p>
          </details>
          <details className="group">
            <summary className="cursor-pointer font-medium text-gray-700 group-open:text-indigo-600">
              链上注册有什么用？
            </summary>
            <p className="mt-1 text-gray-600 pl-4">
              链上注册（ERC-8004 + EAS）为 Agent 创建链上身份证明，Gas 费由平台承担（免费）。
              注册后 Agent 可参与链上经济活动，如跨平台信任传递、去中心化声誉系统。
              这是可选功能，不影响 Agent 的基本使用。
            </p>
          </details>
        </div>
      </div>

      {/* 弹窗 */}
      {selectedTemplate && (
        <ProvisionModal
          template={selectedTemplate}
          onClose={() => setSelectedTemplate(null)}
          onConfirm={handleProvision}
          isCreating={isCreating}
        />
      )}

      {successResult && (
        <SuccessModal
          result={successResult}
          onClose={() => setSuccessResult(null)}
        />
      )}
    </div>
  );
}
