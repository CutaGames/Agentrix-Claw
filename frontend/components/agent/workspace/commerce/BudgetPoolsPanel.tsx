import React, { useState, useEffect, useCallback } from 'react';
import { 
  Plus, 
  PiggyBank, 
  DollarSign, 
  Clock, 
  CheckCircle2, 
  XCircle, 
  AlertCircle,
  ChevronRight,
  Target,
  Wallet,
  RefreshCw,
  Play,
  Pause,
  X,
  Eye,
  Flag,
} from 'lucide-react';
import { useLocalization } from '../../../../contexts/LocalizationContext';
import { useToast } from '../../../../contexts/ToastContext';
import { 
  commerceApi, 
  BudgetPool, 
  BudgetPoolStatus, 
  Milestone, 
  MilestoneStatus,
  FundingSource,
} from '../../../../lib/api/commerce.api';
import { CommerceHintsBanner } from './CommerceHintsBanner';

interface BudgetPoolsPanelProps {
  onSelectPool?: (pool: BudgetPool) => void;
}

const STATUS_CONFIG: Record<BudgetPoolStatus, { icon: any; color: string; label: { zh: string; en: string } }> = {
  draft: { icon: Clock, color: 'text-slate-400 bg-slate-500/20', label: { zh: '草稿', en: 'Draft' } },
  funded: { icon: DollarSign, color: 'text-blue-400 bg-blue-500/20', label: { zh: '已充值', en: 'Funded' } },
  active: { icon: Play, color: 'text-emerald-400 bg-emerald-500/20', label: { zh: '进行中', en: 'Active' } },
  depleted: { icon: CheckCircle2, color: 'text-purple-400 bg-purple-500/20', label: { zh: '已耗尽', en: 'Depleted' } },
  expired: { icon: AlertCircle, color: 'text-amber-400 bg-amber-500/20', label: { zh: '已过期', en: 'Expired' } },
  cancelled: { icon: XCircle, color: 'text-red-400 bg-red-500/20', label: { zh: '已取消', en: 'Cancelled' } },
};

const MILESTONE_STATUS_CONFIG: Record<MilestoneStatus, { color: string; label: { zh: string; en: string } }> = {
  pending: { color: 'bg-slate-500/20 text-slate-400', label: { zh: '待开始', en: 'Pending' } },
  in_progress: { color: 'bg-blue-500/20 text-blue-400', label: { zh: '进行中', en: 'In Progress' } },
  pending_review: { color: 'bg-amber-500/20 text-amber-400', label: { zh: '待审核', en: 'Review' } },
  approved: { color: 'bg-emerald-500/20 text-emerald-400', label: { zh: '已通过', en: 'Approved' } },
  rejected: { color: 'bg-red-500/20 text-red-400', label: { zh: '已拒绝', en: 'Rejected' } },
  released: { color: 'bg-purple-500/20 text-purple-400', label: { zh: '已释放', en: 'Released' } },
};

export const BudgetPoolsPanel: React.FC<BudgetPoolsPanelProps> = ({ onSelectPool }) => {
  const { t } = useLocalization();
  const { success, error: showError } = useToast();
  
  const [pools, setPools] = useState<BudgetPool[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedPool, setSelectedPool] = useState<BudgetPool | null>(null);
  const [milestones, setMilestones] = useState<Milestone[]>([]);

  const loadPools = useCallback(async () => {
    try {
      setLoading(true);
      const data = await commerceApi.getBudgetPools();
      setPools(data || []);
    } catch (err: any) {
      showError(err.message || 'Failed to load budget pools');
    } finally {
      setLoading(false);
    }
  }, [showError]);

  useEffect(() => {
    loadPools();
  }, [loadPools]);

  const loadMilestones = useCallback(async (poolId: string) => {
    try {
      const data = await commerceApi.getMilestones(poolId);
      setMilestones(data || []);
    } catch (err: any) {
      console.error('Failed to load milestones:', err);
    }
  }, []);

  const handleSelectPool = async (pool: BudgetPool) => {
    setSelectedPool(pool);
    await loadMilestones(pool.id);
    onSelectPool?.(pool);
  };

  const handleCancelPool = async (id: string) => {
    if (!confirm(t({ zh: '确定要取消此预算池吗？', en: 'Are you sure you want to cancel this pool?' }))) {
      return;
    }
    try {
      await commerceApi.cancelBudgetPool(id);
      success(t({ zh: '预算池已取消', en: 'Budget pool cancelled' }));
      loadPools();
    } catch (err: any) {
      showError(err.message);
    }
  };

  const formatAmount = (amount: string, currency: string) => {
    const num = Number(amount) / 1000000;
    return `${num.toFixed(2)} ${currency}`;
  };

  const getProgress = (pool: BudgetPool) => {
    const total = Number(pool.totalBudget) || 1;
    const released = Number(pool.releasedAmount) || 0;
    return Math.round((released / total) * 100);
  };

  return (
    <div className="space-y-4">
      <CommerceHintsBanner />
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-bold text-white">{t({ zh: '预算池', en: 'Budget Pools' })}</h3>
          <p className="text-sm text-slate-400">{t({ zh: '用于多 Agent 协作任务的预算分配', en: 'Allocate budgets for multi-agent collaboration' })}</p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded-lg text-white font-semibold transition-colors"
        >
          <Plus size={16} />
          {t({ zh: '创建预算池', en: 'Create Pool' })}
        </button>
      </div>

      {/* Pools List */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full" />
        </div>
      ) : pools.length === 0 ? (
        <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-12 text-center">
          <PiggyBank className="w-12 h-12 mx-auto mb-4 text-slate-500" />
          <p className="text-slate-400 mb-4">{t({ zh: '暂无预算池', en: 'No budget pools found' })}</p>
          <button
            onClick={() => setShowCreateModal(true)}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded-lg text-white font-semibold transition-colors"
          >
            {t({ zh: '创建首个预算池', en: 'Create First Pool' })}
          </button>
        </div>
      ) : (
        <div className="grid gap-4">
          {pools.map((pool) => {
            const statusConfig = STATUS_CONFIG[pool.status];
            const StatusIcon = statusConfig.icon;
            const progress = getProgress(pool);

            return (
              <div
                key={pool.id}
                className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4 hover:border-slate-600/50 transition-colors cursor-pointer"
                onClick={() => handleSelectPool(pool)}
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-1">
                      <h4 className="text-white font-semibold">{pool.name}</h4>
                      <span className={`flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${statusConfig.color}`}>
                        <StatusIcon size={12} />
                        {t(statusConfig.label)}
                      </span>
                    </div>
                    {pool.description && (
                      <p className="text-sm text-slate-400 mb-2">{pool.description}</p>
                    )}
                  </div>
                  <ChevronRight size={20} className="text-slate-500" />
                </div>

                {/* Progress */}
                <div className="mb-3">
                  <div className="flex items-center justify-between text-sm mb-1">
                    <span className="text-slate-400">{t({ zh: '进度', en: 'Progress' })}</span>
                    <span className="text-white font-medium">{progress}%</span>
                  </div>
                  <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-gradient-to-r from-blue-500 to-emerald-500 transition-all duration-300"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                </div>

                {/* Stats */}
                <div className="grid grid-cols-4 gap-2 text-center">
                  <div className="bg-slate-900/50 rounded-lg p-2">
                    <p className="text-xs text-slate-500 mb-1">{t({ zh: '总预算', en: 'Total' })}</p>
                    <p className="text-sm text-white font-medium">{formatAmount(pool.totalBudget, pool.currency)}</p>
                  </div>
                  <div className="bg-slate-900/50 rounded-lg p-2">
                    <p className="text-xs text-slate-500 mb-1">{t({ zh: '已充值', en: 'Funded' })}</p>
                    <p className="text-sm text-blue-400 font-medium">{formatAmount(pool.fundedAmount, pool.currency)}</p>
                  </div>
                  <div className="bg-slate-900/50 rounded-lg p-2">
                    <p className="text-xs text-slate-500 mb-1">{t({ zh: '已预留', en: 'Reserved' })}</p>
                    <p className="text-sm text-amber-400 font-medium">{formatAmount(pool.reservedAmount, pool.currency)}</p>
                  </div>
                  <div className="bg-slate-900/50 rounded-lg p-2">
                    <p className="text-xs text-slate-500 mb-1">{t({ zh: '已释放', en: 'Released' })}</p>
                    <p className="text-sm text-emerald-400 font-medium">{formatAmount(pool.releasedAmount, pool.currency)}</p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Create Modal */}
      {showCreateModal && (
        <CreateBudgetPoolModal
          onClose={() => setShowCreateModal(false)}
          onSuccess={() => {
            setShowCreateModal(false);
            loadPools();
          }}
        />
      )}

      {/* Detail Modal */}
      {selectedPool && (
        <BudgetPoolDetailModal
          pool={selectedPool}
          milestones={milestones}
          onClose={() => setSelectedPool(null)}
          onUpdate={() => {
            loadPools();
            loadMilestones(selectedPool.id);
          }}
        />
      )}
    </div>
  );
};

// ===== Create Modal =====

interface CreateBudgetPoolModalProps {
  onClose: () => void;
  onSuccess: () => void;
}

const CreateBudgetPoolModal: React.FC<CreateBudgetPoolModalProps> = ({ onClose, onSuccess }) => {
  const { t } = useLocalization();
  const { success, error: showError } = useToast();
  
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [totalBudget, setTotalBudget] = useState('');
  const [currency, setCurrency] = useState('USDC');
  const [expiresAt, setExpiresAt] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!name.trim()) {
      showError(t({ zh: '请输入预算池名称', en: 'Please enter pool name' }));
      return;
    }
    if (!totalBudget || Number(totalBudget) <= 0) {
      showError(t({ zh: '请输入有效的预算金额', en: 'Please enter a valid budget amount' }));
      return;
    }

    try {
      setSubmitting(true);
      await commerceApi.createBudgetPool({
        name: name.trim(),
        description: description.trim() || undefined,
        totalBudget: Math.round(Number(totalBudget) * 1000000), // Convert to micro units
        currency,
        expiresAt: expiresAt || undefined,
      });
      success(t({ zh: '预算池已创建', en: 'Budget pool created' }));
      onSuccess();
    } catch (err: any) {
      showError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-slate-900 border border-white/10 rounded-2xl p-6 w-full max-w-lg">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-xl font-bold text-white">{t({ zh: '创建预算池', en: 'Create Budget Pool' })}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-white">
            <X size={20} />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase mb-2">
              {t({ zh: '预算池名称', en: 'Pool Name' })} *
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t({ zh: '例如：Q1 Agent 开发项目', en: 'e.g. Q1 Agent Development Project' })}
              className="w-full bg-slate-800 border border-white/10 rounded-lg px-4 py-2 text-white outline-none focus:border-blue-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase mb-2">
                {t({ zh: '总预算', en: 'Total Budget' })} *
              </label>
              <input
                type="number"
                value={totalBudget}
                onChange={(e) => setTotalBudget(e.target.value)}
                placeholder="1000"
                min="0"
                step="0.01"
                className="w-full bg-slate-800 border border-white/10 rounded-lg px-4 py-2 text-white outline-none focus:border-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase mb-2">
                {t({ zh: '币种', en: 'Currency' })}
              </label>
              <select
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
                className="w-full bg-slate-800 border border-white/10 rounded-lg px-4 py-2 text-white outline-none focus:border-blue-500"
              >
                <option value="USDC">USDC</option>
                <option value="USD">USD</option>
                <option value="ETH">ETH</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase mb-2">
              {t({ zh: '过期时间', en: 'Expires At' })}
            </label>
            <input
              type="datetime-local"
              value={expiresAt}
              onChange={(e) => setExpiresAt(e.target.value)}
              className="w-full bg-slate-800 border border-white/10 rounded-lg px-4 py-2 text-white outline-none focus:border-blue-500"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase mb-2">
              {t({ zh: '描述', en: 'Description' })}
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t({ zh: '可选，描述此预算池的用途', en: 'Optional, describe the purpose of this pool' })}
              className="w-full bg-slate-800 border border-white/10 rounded-lg px-4 py-2 text-white outline-none focus:border-blue-500 h-20"
            />
          </div>
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
            {submitting ? t({ zh: '创建中...', en: 'Creating...' }) : t({ zh: '创建预算池', en: 'Create Pool' })}
          </button>
        </div>
      </div>
    </div>
  );
};

// ===== Detail Modal =====

interface BudgetPoolDetailModalProps {
  pool: BudgetPool;
  milestones: Milestone[];
  onClose: () => void;
  onUpdate: () => void;
}

const BudgetPoolDetailModal: React.FC<BudgetPoolDetailModalProps> = ({ pool, milestones, onClose, onUpdate }) => {
  const { t } = useLocalization();
  const { success, error: showError } = useToast();
  const [showFundModal, setShowFundModal] = useState(false);
  const [showMilestoneModal, setShowMilestoneModal] = useState(false);

  const formatAmount = (amount: string) => {
    const num = Number(amount) / 1000000;
    return `${num.toFixed(2)} ${pool.currency}`;
  };

  const statusConfig = STATUS_CONFIG[pool.status];
  const StatusIcon = statusConfig.icon;

  const handleReleaseMilestone = async (id: string) => {
    try {
      await commerceApi.releaseMilestone(id);
      success(t({ zh: '里程碑资金已释放', en: 'Milestone funds released' }));
      onUpdate();
    } catch (err: any) {
      showError(err.message);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-slate-900 border border-white/10 rounded-2xl p-6 w-full max-w-3xl max-h-[85vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <div className="flex items-center gap-3">
              <h3 className="text-xl font-bold text-white">{pool.name}</h3>
              <span className={`flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${statusConfig.color}`}>
                <StatusIcon size={12} />
                {t(statusConfig.label)}
              </span>
            </div>
            {pool.description && <p className="text-sm text-slate-400 mt-1">{pool.description}</p>}
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white">
            <X size={20} />
          </button>
        </div>

        {/* Budget Overview */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-slate-800/50 rounded-xl p-4">
            <p className="text-xs text-slate-500 mb-1">{t({ zh: '总预算', en: 'Total Budget' })}</p>
            <p className="text-xl text-white font-bold">{formatAmount(pool.totalBudget)}</p>
          </div>
          <div className="bg-slate-800/50 rounded-xl p-4">
            <p className="text-xs text-slate-500 mb-1">{t({ zh: '已充值', en: 'Funded' })}</p>
            <p className="text-xl text-blue-400 font-bold">{formatAmount(pool.fundedAmount)}</p>
          </div>
          <div className="bg-slate-800/50 rounded-xl p-4">
            <p className="text-xs text-slate-500 mb-1">{t({ zh: '已预留', en: 'Reserved' })}</p>
            <p className="text-xl text-amber-400 font-bold">{formatAmount(pool.reservedAmount)}</p>
          </div>
          <div className="bg-slate-800/50 rounded-xl p-4">
            <p className="text-xs text-slate-500 mb-1">{t({ zh: '已释放', en: 'Released' })}</p>
            <p className="text-xl text-emerald-400 font-bold">{formatAmount(pool.releasedAmount)}</p>
          </div>
        </div>

        {/* Action Buttons */}
        {pool.status !== 'cancelled' && pool.status !== 'expired' && (
          <div className="flex gap-3 mb-6">
            {(pool.status === 'draft' || pool.status === 'funded') && (
              <button
                onClick={() => setShowFundModal(true)}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded-lg text-white font-semibold transition-colors"
              >
                <Wallet size={16} />
                {t({ zh: '充值', en: 'Fund Pool' })}
              </button>
            )}
            {pool.status !== 'depleted' && (
              <button
                onClick={() => setShowMilestoneModal(true)}
                className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 rounded-lg text-white font-semibold transition-colors"
              >
                <Flag size={16} />
                {t({ zh: '添加里程碑', en: 'Add Milestone' })}
              </button>
            )}
          </div>
        )}

        {/* Milestones */}
        <div className="mb-6">
          <h4 className="text-sm font-bold text-slate-400 uppercase mb-3">{t({ zh: '里程碑', en: 'Milestones' })}</h4>
          {milestones.length === 0 ? (
            <div className="bg-slate-800/30 rounded-xl p-8 text-center">
              <Target className="w-10 h-10 mx-auto mb-3 text-slate-600" />
              <p className="text-slate-500">{t({ zh: '暂无里程碑', en: 'No milestones yet' })}</p>
            </div>
          ) : (
            <div className="space-y-2">
              {milestones.map((milestone) => {
                const msConfig = MILESTONE_STATUS_CONFIG[milestone.status];
                return (
                  <div
                    key={milestone.id}
                    className="flex items-center justify-between bg-slate-800/50 rounded-lg p-3"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-slate-700 flex items-center justify-center text-sm font-bold text-slate-300">
                        {milestone.sortOrder + 1}
                      </div>
                      <div>
                        <p className="text-white font-medium">{milestone.name}</p>
                        <div className="flex items-center gap-2">
                          <span className={`px-2 py-0.5 rounded text-xs font-medium ${msConfig.color}`}>
                            {t(msConfig.label)}
                          </span>
                          <span className="text-xs text-slate-500">
                            {formatAmount(milestone.reservedAmount)}
                          </span>
                        </div>
                      </div>
                    </div>
                    {milestone.status === 'approved' && (
                      <button
                        onClick={() => handleReleaseMilestone(milestone.id)}
                        className="px-3 py-1.5 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-400 rounded-lg text-sm font-medium transition-colors"
                      >
                        {t({ zh: '释放资金', en: 'Release' })}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Info */}
        <div className="flex items-center justify-between text-sm text-slate-500 pt-4 border-t border-slate-700/50">
          <span>{t({ zh: '创建于', en: 'Created' })}: {new Date(pool.createdAt).toLocaleDateString()}</span>
          {pool.expiresAt && (
            <span>{t({ zh: '过期于', en: 'Expires' })}: {new Date(pool.expiresAt).toLocaleDateString()}</span>
          )}
        </div>

        <button
          onClick={onClose}
          className="w-full mt-6 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg font-bold transition-colors"
        >
          {t({ zh: '关闭', en: 'Close' })}
        </button>
      </div>
    </div>
  );
};

export default BudgetPoolsPanel;
