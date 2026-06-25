/**
 * Task Marketplace Component
 * 
 * 任务市场 - 任务浏览、搜索、发布、竞标
 */

import React, { useState, useEffect } from 'react';
import { 
  taskMarketplaceApi, 
  type Task, 
  type TaskBid, 
  type SearchTasksParams,
  type PublishTaskDto,
  type CreateBidDto,
} from '@/services/taskMarketplaceApi';

export const TaskMarketplace: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'browse' | 'myTasks' | 'myBids'>('browse');
  const [tasks, setTasks] = useState<Task[]>([]);
  const [myTasks, setMyTasks] = useState<Task[]>([]);
  const [myBids, setMyBids] = useState<TaskBid[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [showPublishModal, setShowPublishModal] = useState(false);
  const [showBidModal, setShowBidModal] = useState(false);
  const [showManageTask, setShowManageTask] = useState<Task | null>(null);
  const [filters, setFilters] = useState<SearchTasksParams>({
    page: 1,
    limit: 20,
    sortBy: 'createdAt',
    sortOrder: 'DESC',
  });

  useEffect(() => {
    if (activeTab === 'browse') loadTasks();
    else if (activeTab === 'myTasks') loadMyTasks();
    else if (activeTab === 'myBids') loadMyBids();
  }, [filters, activeTab]);

  const loadTasks = async () => {
    try {
      setLoading(true);
      const result = await taskMarketplaceApi.searchTasks(filters);
      setTasks(result.tasks);
    } catch (error) {
      console.error('Failed to load tasks:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadMyTasks = async () => {
    try {
      setLoading(true);
      const data = await taskMarketplaceApi.getMyTasks();
      setMyTasks(data);
    } catch (error) {
      console.error('Failed to load my tasks:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadMyBids = async () => {
    try {
      setLoading(true);
      const data = await taskMarketplaceApi.getMyBids();
      setMyBids(data);
    } catch (error) {
      console.error('Failed to load my bids:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCancelTask = async (taskId: string) => {
    if (!confirm('确定要取消此任务吗？')) return;
    try {
      await taskMarketplaceApi.cancelTask(taskId);
      loadMyTasks();
    } catch (error) {
      console.error('Failed to cancel task:', error);
      alert('取消任务失败');
    }
  };

  return (
    <div className="p-0">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-4xl font-bold text-white mb-2">🎯 任务市场</h1>
            <p className="text-slate-400">发现任务，提交竞标，开启合作</p>
          </div>
          <button
            onClick={() => setShowPublishModal(true)}
            className="bg-gradient-to-r from-blue-500 to-purple-500 hover:from-blue-600 hover:to-purple-600 text-white px-6 py-3 rounded-lg font-medium transition-all"
          >
            ✨ 发布任务
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 bg-slate-900/60 border border-slate-800/60 rounded-xl p-1 mb-6">
          {[
            { key: 'browse' as const, label: '浏览任务', icon: '🔍' },
            { key: 'myTasks' as const, label: '我发布的', icon: '📋' },
            { key: 'myBids' as const, label: '我的竞标', icon: '🏷️' },
          ].map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex-1 py-2.5 px-4 rounded-lg text-sm font-medium transition-all ${
                activeTab === tab.key
                  ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
              }`}
            >
              {tab.icon} {tab.label}
            </button>
          ))}
        </div>

        {/* Browse Tab */}
        {activeTab === 'browse' && (
          <>
            <TaskFilters filters={filters} onFiltersChange={setFilters} />
            {loading ? (
              <div className="flex items-center justify-center py-20">
                <div className="animate-spin rounded-full h-12 w-12 border-4 border-blue-500 border-t-transparent"></div>
              </div>
            ) : tasks.length === 0 ? (
              <div className="text-center py-20">
                <p className="text-slate-400 text-lg">暂无任务</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {tasks.map(task => (
                  <TaskCard 
                    key={task.id} 
                    task={task}
                    onViewDetails={() => setSelectedTask(task)}
                    onBid={() => {
                      setSelectedTask(task);
                      setShowBidModal(true);
                    }}
                  />
                ))}
              </div>
            )}
          </>
        )}

        {/* My Tasks Tab */}
        {activeTab === 'myTasks' && (
          <>
            {loading ? (
              <div className="flex items-center justify-center py-20">
                <div className="animate-spin rounded-full h-12 w-12 border-4 border-blue-500 border-t-transparent"></div>
              </div>
            ) : myTasks.length === 0 ? (
              <div className="text-center py-20">
                <p className="text-slate-400 text-lg mb-4">您还没有发布任何任务</p>
                <button onClick={() => setShowPublishModal(true)} className="bg-blue-600 hover:bg-blue-500 text-white px-6 py-2 rounded-lg">发布任务</button>
              </div>
            ) : (
              <div className="space-y-4">
                {myTasks.map(task => (
                  <div key={task.id} className="bg-slate-900/60 border border-slate-800/60 rounded-xl p-5 hover:border-slate-700 transition-all">
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-1">
                          <h3 className="text-lg font-bold text-white">{task.title}</h3>
                          <span className={`px-2 py-0.5 text-xs rounded-full ${
                            task.status === 'COMPLETED' ? 'bg-green-500/20 text-green-400' :
                            task.status === 'CANCELLED' ? 'bg-red-500/20 text-red-400' :
                            task.status === 'IN_PROGRESS' ? 'bg-cyan-500/20 text-cyan-400' :
                            task.status === 'ACCEPTED' ? 'bg-blue-500/20 text-blue-400' :
                            'bg-yellow-500/20 text-yellow-400'
                          }`}>
                            {task.status === 'OPEN' ? '开放中' : task.status === 'ACCEPTED' ? '已接受' : task.status === 'IN_PROGRESS' ? '进行中' : task.status === 'COMPLETED' ? '已完成' : task.status === 'CANCELLED' ? '已取消' : task.status}
                          </span>
                        </div>
                        <p className="text-slate-400 text-sm line-clamp-2">{task.description}</p>
                      </div>
                      <span className="text-xl font-bold text-green-400 ml-4">${task.budget}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setShowManageTask(task)}
                        className="px-4 py-2 bg-blue-600/20 text-blue-400 text-sm rounded-lg hover:bg-blue-600/30 transition"
                      >
                        📋 查看竞标
                      </button>
                      {task.status !== 'COMPLETED' && task.status !== 'CANCELLED' && (
                        <button
                          onClick={() => handleCancelTask(task.id)}
                          className="px-4 py-2 bg-red-600/10 text-red-400 text-sm rounded-lg hover:bg-red-600/20 transition"
                        >
                          取消任务
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {/* My Bids Tab */}
        {activeTab === 'myBids' && (
          <>
            {loading ? (
              <div className="flex items-center justify-center py-20">
                <div className="animate-spin rounded-full h-12 w-12 border-4 border-blue-500 border-t-transparent"></div>
              </div>
            ) : myBids.length === 0 ? (
              <div className="text-center py-20">
                <p className="text-slate-400 text-lg mb-4">您还没有提交任何竞标</p>
                <button onClick={() => setActiveTab('browse')} className="bg-blue-600 hover:bg-blue-500 text-white px-6 py-2 rounded-lg">浏览任务</button>
              </div>
            ) : (
              <div className="space-y-4">
                {myBids.map(bid => (
                  <div key={bid.id} className="bg-slate-900/60 border border-slate-800/60 rounded-xl p-5">
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="text-white font-medium mb-1">报价: ${bid.proposedBudget}</p>
                        <p className="text-slate-400 text-sm">预计 {bid.estimatedDays} 天完成</p>
                        <p className="text-slate-500 text-sm mt-1 line-clamp-2">{bid.proposal}</p>
                      </div>
                      <span className={`px-3 py-1 text-xs rounded-full ${
                        bid.status === 'ACCEPTED' || bid.status === 'accepted' ? 'bg-green-500/20 text-green-400' :
                        bid.status === 'REJECTED' || bid.status === 'rejected' ? 'bg-red-500/20 text-red-400' :
                        'bg-yellow-500/20 text-yellow-400'
                      }`}>
                        {bid.status === 'ACCEPTED' || bid.status === 'accepted' ? '已接受' : bid.status === 'REJECTED' || bid.status === 'rejected' ? '已拒绝' : '待审核'}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {/* Modals */}
        {showPublishModal && (
          <PublishTaskModal
            onClose={() => setShowPublishModal(false)}
            onSuccess={() => {
              setShowPublishModal(false);
              if (activeTab === 'browse') loadTasks();
              else { setActiveTab('myTasks'); loadMyTasks(); }
            }}
          />
        )}

        {showBidModal && selectedTask && (
          <SubmitBidModal
            task={selectedTask}
            onClose={() => {
              setShowBidModal(false);
              setSelectedTask(null);
            }}
            onSuccess={() => {
              setShowBidModal(false);
              setSelectedTask(null);
              alert('竞标提交成功！');
            }}
          />
        )}

        {selectedTask && !showBidModal && (
          <TaskDetailsModal
            task={selectedTask}
            onClose={() => setSelectedTask(null)}
            onBid={() => {
              setShowBidModal(true);
            }}
          />
        )}

        {showManageTask && (
          <ManageTaskModal
            task={showManageTask}
            onClose={() => setShowManageTask(null)}
            onRefresh={loadMyTasks}
          />
        )}
      </div>
    </div>
  );
};

// Task Card Component
const TaskCard: React.FC<{
  task: Task;
  onViewDetails: () => void;
  onBid: () => void;
}> = ({ task, onViewDetails, onBid }) => {
  return (
    <div className="bg-slate-900/60 border border-slate-800/60 rounded-xl p-6 hover:border-blue-500/40 transition-all cursor-pointer">
      <div className="flex items-start justify-between mb-4">
        <span className="px-3 py-1 bg-blue-500/20 text-blue-400 text-sm rounded-full">
          {task.type}
        </span>
        <span className="text-2xl font-bold text-green-400">
          ${task.budget}
        </span>
      </div>

      <h3 className="text-xl font-bold text-white mb-2 line-clamp-2">
        {task.title}
      </h3>

      <p className="text-slate-400 text-sm mb-4 line-clamp-3">
        {task.description}
      </p>

      {task.tags && task.tags.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-4">
          {task.tags.slice(0, 3).map((tag, index) => (
            <span key={index} className="px-2 py-1 bg-slate-700 text-slate-300 text-xs rounded">
              #{tag}
            </span>
          ))}
        </div>
      )}

      <div className="flex items-center gap-2">
        <button
          onClick={onViewDetails}
          className="flex-1 bg-slate-700 hover:bg-slate-600 text-white py-2 rounded-lg transition-colors"
        >
          查看详情
        </button>
        <button
          onClick={onBid}
          className="flex-1 bg-gradient-to-r from-blue-500 to-purple-500 hover:from-blue-600 hover:to-purple-600 text-white py-2 rounded-lg transition-all"
        >
          立即竞标
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            const url = `${window.location.origin}/marketplace/tasks?id=${task.id}`;
            navigator.clipboard.writeText(url).then(() => {
              const btn = e.currentTarget;
              btn.textContent = '✓';
              setTimeout(() => { btn.textContent = '🔗'; }, 1500);
            });
          }}
          title="分享任务"
          className="px-3 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition-colors text-sm"
        >
          🔗
        </button>
      </div>
    </div>
  );
};

// Filters Component
const TaskFilters: React.FC<{
  filters: SearchTasksParams;
  onFiltersChange: (filters: SearchTasksParams) => void;
}> = ({ filters, onFiltersChange }) => {
  return (
    <div className="bg-slate-900/60 border border-slate-800/60 rounded-xl p-6 mb-6">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <input
          type="text"
          placeholder="搜索任务..."
          value={filters.query || ''}
          onChange={(e) => onFiltersChange({ ...filters, query: e.target.value, page: 1 })}
          className="bg-slate-800 text-white px-4 py-2 rounded-lg border border-slate-700 focus:border-blue-500 outline-none"
        />

        <select
          value={filters.type?.[0] || ''}
          onChange={(e) => onFiltersChange({ ...filters, type: e.target.value ? [e.target.value] : undefined, page: 1 })}
          className="bg-slate-800 text-white px-4 py-2 rounded-lg border border-slate-700 focus:border-blue-500 outline-none"
        >
          <option value="">所有类型</option>
          <option value="custom_service">定制服务</option>
          <option value="consultation">咨询</option>
          <option value="design">设计</option>
          <option value="development">开发</option>
          <option value="content">内容创作</option>
          <option value="other">其他</option>
        </select>

        <input
          type="number"
          placeholder="最小预算"
          value={filters.budgetMin || ''}
          onChange={(e) => onFiltersChange({ ...filters, budgetMin: Number(e.target.value) || undefined, page: 1 })}
          className="bg-slate-800 text-white px-4 py-2 rounded-lg border border-slate-700 focus:border-blue-500 outline-none"
        />

        <input
          type="number"
          placeholder="最大预算"
          value={filters.budgetMax || ''}
          onChange={(e) => onFiltersChange({ ...filters, budgetMax: Number(e.target.value) || undefined, page: 1 })}
          className="bg-slate-800 text-white px-4 py-2 rounded-lg border border-slate-700 focus:border-blue-500 outline-none"
        />
      </div>
    </div>
  );
};

// Publish Task Modal
const PublishTaskModal: React.FC<{
  onClose: () => void;
  onSuccess: () => void;
}> = ({ onClose, onSuccess }) => {
  const [formData, setFormData] = useState<PublishTaskDto>({
    type: 'custom_service',
    title: '',
    description: '',
    budget: 0,
    currency: 'USD',
    tags: [],
    visibility: 'public',
  });
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setSubmitting(true);
      await taskMarketplaceApi.publishTask(formData);
      onSuccess();
    } catch (error) {
      console.error('Failed to publish task:', error);
      alert('发布任务失败');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-slate-800 border border-slate-700 rounded-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold text-white">发布任务</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-white text-2xl">
            ×
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-slate-300 mb-2">任务类型</label>
            <select
              value={formData.type}
              onChange={(e) => setFormData({ ...formData, type: e.target.value as any })}
              className="w-full bg-slate-800 text-white px-4 py-2 rounded-lg border border-slate-700 focus:border-blue-500 outline-none"
              required
            >
              <option value="custom_service">定制服务</option>
              <option value="consultation">咨询</option>
              <option value="design">设计</option>
              <option value="development">开发</option>
              <option value="content">内容创作</option>
              <option value="other">其他</option>
            </select>
          </div>

          <div>
            <label className="block text-slate-300 mb-2">任务标题</label>
            <input
              type="text"
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              className="w-full bg-slate-800 text-white px-4 py-2 rounded-lg border border-slate-700 focus:border-blue-500 outline-none"
              placeholder="例如：设计一个现代化的网站首页"
              required
            />
          </div>

          <div>
            <label className="block text-slate-300 mb-2">任务描述</label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              className="w-full bg-slate-800 text-white px-4 py-2 rounded-lg border border-slate-700 focus:border-blue-500 outline-none min-h-[120px]"
              placeholder="详细描述任务需求、目标和期望..."
              required
            />
          </div>

          <div>
            <label className="block text-slate-300 mb-2">预算（USD）</label>
            <input
              type="number"
              value={formData.budget}
              onChange={(e) => setFormData({ ...formData, budget: Number(e.target.value) })}
              className="w-full bg-slate-800 text-white px-4 py-2 rounded-lg border border-slate-700 focus:border-blue-500 outline-none"
              min="0"
              step="0.01"
              required
            />
            {formData.budget > 0 && (
              <div className="mt-2 bg-blue-500/10 border border-blue-500/20 rounded-lg p-3 text-xs">
                <div className="flex justify-between text-slate-400 mb-1">
                  <span>平台佣金 (5%)</span>
                  <span className="text-amber-400">${(formData.budget * 0.05).toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-slate-300 font-medium">
                  <span>服务商实际收入</span>
                  <span className="text-green-400">${(formData.budget * 0.95).toFixed(2)}</span>
                </div>
              </div>
            )}
          </div>

          <div>
            <label className="block text-slate-300 mb-2">标签（逗号分隔）</label>
            <input
              type="text"
              onChange={(e) => setFormData({ ...formData, tags: e.target.value.split(',').map(t => t.trim()).filter(Boolean) })}
              className="w-full bg-slate-800 text-white px-4 py-2 rounded-lg border border-slate-700 focus:border-blue-500 outline-none"
              placeholder="例如：UI设计, 前端开发, React"
            />
          </div>

          <div className="flex gap-4 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 bg-slate-700 hover:bg-slate-600 text-white py-3 rounded-lg transition-colors"
            >
              取消
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="flex-1 bg-gradient-to-r from-blue-500 to-purple-500 hover:from-blue-600 hover:to-purple-600 text-white py-3 rounded-lg transition-all disabled:opacity-50"
            >
              {submitting ? '发布中...' : '发布任务'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// Submit Bid Modal
const SubmitBidModal: React.FC<{
  task: Task;
  onClose: () => void;
  onSuccess: () => void;
}> = ({ task, onClose, onSuccess }) => {
  const [formData, setFormData] = useState<CreateBidDto>({
    proposedBudget: task.budget,
    currency: 'USD',
    estimatedDays: 7,
    proposal: '',
  });
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setSubmitting(true);
      await taskMarketplaceApi.submitBid(task.id, formData);
      onSuccess();
    } catch (error) {
      console.error('Failed to submit bid:', error);
      alert('竞标提交失败');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-slate-800 border border-slate-700 rounded-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold text-white">提交竞标</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-white text-2xl">
            ×
          </button>
        </div>

        <div className="bg-slate-700/50 rounded-lg p-4 mb-6">
          <h3 className="text-lg font-semibold text-white mb-2">{task.title}</h3>
          <p className="text-slate-400 text-sm">任务预算: ${task.budget}</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-slate-300 mb-2">您的报价（USD）</label>
            <input
              type="number"
              value={formData.proposedBudget}
              onChange={(e) => setFormData({ ...formData, proposedBudget: Number(e.target.value) })}
              className="w-full bg-slate-800 text-white px-4 py-2 rounded-lg border border-slate-700 focus:border-blue-500 outline-none"
              min="0"
              step="0.01"
              required
            />
          </div>

          <div>
            <label className="block text-slate-300 mb-2">预计完成天数</label>
            <input
              type="number"
              value={formData.estimatedDays}
              onChange={(e) => setFormData({ ...formData, estimatedDays: Number(e.target.value) })}
              className="w-full bg-slate-800 text-white px-4 py-2 rounded-lg border border-slate-700 focus:border-blue-500 outline-none"
              min="1"
              required
            />
          </div>

          <div>
            <label className="block text-slate-300 mb-2">竞标方案</label>
            <textarea
              value={formData.proposal}
              onChange={(e) => setFormData({ ...formData, proposal: e.target.value })}
              className="w-full bg-slate-800 text-white px-4 py-2 rounded-lg border border-slate-700 focus:border-blue-500 outline-none min-h-[150px]"
              placeholder="详细说明您的实施方案、经验和优势..."
              required
            />
          </div>

          <div className="flex gap-4 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 bg-slate-700 hover:bg-slate-600 text-white py-3 rounded-lg transition-colors"
            >
              取消
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="flex-1 bg-gradient-to-r from-blue-500 to-purple-500 hover:from-blue-600 hover:to-purple-600 text-white py-3 rounded-lg transition-all disabled:opacity-50"
            >
              {submitting ? '提交中...' : '提交竞标'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// Manage Task Modal (for task publishers)
const ManageTaskModal: React.FC<{
  task: Task;
  onClose: () => void;
  onRefresh: () => void;
}> = ({ task, onClose, onRefresh }) => {
  const [bids, setBids] = useState<TaskBid[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  useEffect(() => {
    loadBids();
  }, [task.id]);

  const loadBids = async () => {
    try {
      setLoading(true);
      const data = await taskMarketplaceApi.getTaskBids(task.id);
      setBids(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('Failed to load bids:', error);
      setBids([]);
    } finally {
      setLoading(false);
    }
  };

  const handleAcceptBid = async (bidId: string) => {
    if (!confirm('确定接受此竞标？接受后任务将进入执行状态。')) return;
    try {
      setActionLoading(bidId);
      await taskMarketplaceApi.acceptBid(task.id, bidId);
      alert('已接受竞标！');
      loadBids();
      onRefresh();
    } catch (error) {
      console.error('Failed to accept bid:', error);
      alert('接受竞标失败');
    } finally {
      setActionLoading(null);
    }
  };

  const handleRejectBid = async (bidId: string) => {
    if (!confirm('确定拒绝此竞标？')) return;
    try {
      setActionLoading(bidId);
      await taskMarketplaceApi.rejectBid(task.id, bidId);
      loadBids();
    } catch (error) {
      console.error('Failed to reject bid:', error);
      alert('拒绝竞标失败');
    } finally {
      setActionLoading(null);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-slate-800 border border-slate-700 rounded-xl max-w-3xl w-full max-h-[90vh] overflow-y-auto p-6" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold text-white">管理任务</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-white text-2xl">×</button>
        </div>

        {/* Task Info */}
        <div className="bg-slate-700/50 rounded-xl p-4 mb-6">
          <div className="flex items-start justify-between mb-2">
            <h3 className="text-lg font-bold text-white">{task.title}</h3>
            <span className="text-xl font-bold text-green-400">${task.budget}</span>
          </div>
          <p className="text-slate-400 text-sm line-clamp-3">{task.description}</p>
          <div className="flex items-center gap-3 mt-3">
            <span className={`px-2 py-0.5 text-xs rounded-full ${
              task.status === 'COMPLETED' ? 'bg-green-500/20 text-green-400' :
              task.status === 'CANCELLED' ? 'bg-red-500/20 text-red-400' :
              task.status === 'IN_PROGRESS' ? 'bg-cyan-500/20 text-cyan-400' :
              task.status === 'ACCEPTED' ? 'bg-blue-500/20 text-blue-400' :
              'bg-yellow-500/20 text-yellow-400'
            }`}>
              {task.status === 'OPEN' ? '开放中' : task.status === 'ACCEPTED' ? '已接受' : task.status === 'IN_PROGRESS' ? '进行中' : task.status === 'COMPLETED' ? '已完成' : task.status === 'CANCELLED' ? '已取消' : task.status}
            </span>
            <span className="text-xs text-slate-500">{task.type}</span>
            {task.tags?.map((tag, i) => (
              <span key={i} className="text-xs px-2 py-0.5 bg-slate-600 text-slate-300 rounded">#{tag}</span>
            ))}
          </div>
        </div>

        {/* Bids Section */}
        <h4 className="text-lg font-semibold text-white mb-4">竞标方案 ({bids.length})</h4>
        {loading ? (
          <div className="text-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-4 border-blue-500 border-t-transparent mx-auto"></div>
          </div>
        ) : bids.length === 0 ? (
          <div className="text-center py-12 text-slate-400">
            <p className="text-lg mb-2">暂无竞标</p>
            <p className="text-sm">等待服务商提交竞标方案</p>
          </div>
        ) : (
          <div className="space-y-4">
            {bids.map(bid => (
              <div key={bid.id} className="bg-slate-900/60 border border-slate-700/60 rounded-xl p-5">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <div className="flex items-center gap-3 mb-1">
                      <span className="text-xl font-bold text-green-400">${bid.proposedBudget}</span>
                      <span className="text-slate-400 text-sm">· 预计 {bid.estimatedDays} 天</span>
                    </div>
                    <span className={`px-2 py-0.5 text-xs rounded-full ${
                      bid.status === 'ACCEPTED' || bid.status === 'accepted' ? 'bg-green-500/20 text-green-400' :
                      bid.status === 'REJECTED' || bid.status === 'rejected' ? 'bg-red-500/20 text-red-400' :
                      'bg-yellow-500/20 text-yellow-400'
                    }`}>
                      {bid.status === 'ACCEPTED' || bid.status === 'accepted' ? '✅ 已接受' : bid.status === 'REJECTED' || bid.status === 'rejected' ? '❌ 已拒绝' : '⏳ 待审核'}
                    </span>
                  </div>
                </div>
                <p className="text-slate-300 text-sm mb-4 whitespace-pre-wrap">{bid.proposal}</p>
                {bid.bidderId && (
                  <p className="text-xs text-slate-500 mb-3">竞标者: {bid.bidderId.slice(0, 8)}...</p>
                )}
                {/* Accept/Reject buttons for pending bids on open tasks */}
                {(bid.status === 'PENDING' || bid.status === 'pending') && task.status !== 'COMPLETED' && task.status !== 'CANCELLED' && (
                  <div className="flex gap-3">
                    <button
                      onClick={() => handleAcceptBid(bid.id)}
                      disabled={actionLoading === bid.id}
                      className="px-5 py-2 bg-green-600 hover:bg-green-500 text-white text-sm rounded-lg transition disabled:opacity-50"
                    >
                      {actionLoading === bid.id ? '处理中...' : '✅ 接受竞标'}
                    </button>
                    <button
                      onClick={() => handleRejectBid(bid.id)}
                      disabled={actionLoading === bid.id}
                      className="px-5 py-2 bg-slate-700 hover:bg-slate-600 text-slate-300 text-sm rounded-lg transition disabled:opacity-50"
                    >
                      拒绝
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

// Task Details Modal
const TaskDetailsModal: React.FC<{
  task: Task;
  onClose: () => void;
  onBid: () => void;
}> = ({ task, onClose, onBid }) => {
  const [bids, setBids] = useState<TaskBid[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadBids();
  }, [task.id]);

  const loadBids = async () => {
    try {
      setLoading(true);
      const data = await taskMarketplaceApi.getTaskBids(task.id);
      setBids(data);
    } catch (error) {
      console.error('Failed to load bids:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-slate-800 border border-slate-700 rounded-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold text-white">任务详情</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-white text-2xl">
            ×
          </button>
        </div>

        <div className="space-y-6">
          <div>
            <div className="flex items-center gap-4 mb-4">
              <span className="px-3 py-1 bg-blue-500/20 text-blue-400 text-sm rounded-full">
                {task.type}
              </span>
              <span className="text-2xl font-bold text-green-400">
                ${task.budget}
              </span>
            </div>
            <h3 className="text-2xl font-bold text-white mb-3">{task.title}</h3>
            <p className="text-slate-300 leading-relaxed">{task.description}</p>
          </div>

          {task.tags && task.tags.length > 0 && (
            <div>
              <h4 className="text-sm font-semibold text-slate-400 mb-2">标签</h4>
              <div className="flex flex-wrap gap-2">
                {task.tags.map((tag, index) => (
                  <span key={index} className="px-3 py-1 bg-slate-700 text-slate-300 text-sm rounded">
                    #{tag}
                  </span>
                ))}
              </div>
            </div>
          )}

          <div>
            <h4 className="text-lg font-semibold text-white mb-3">竞标列表 ({bids.length})</h4>
            {loading ? (
              <div className="text-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-4 border-blue-500 border-t-transparent mx-auto"></div>
              </div>
            ) : bids.length === 0 ? (
              <div className="text-center py-8 text-slate-400">
                暂无竞标
              </div>
            ) : (
              <div className="space-y-3">
                {bids.map(bid => (
                  <div key={bid.id} className="bg-slate-700/50 rounded-lg p-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-lg font-semibold text-white">
                        ${bid.proposedBudget}
                      </span>
                      <span className={`px-3 py-1 text-xs rounded-full ${
                        bid.status === 'ACCEPTED' || bid.status === 'accepted' ? 'bg-green-500/20 text-green-400' :
                        bid.status === 'REJECTED' || bid.status === 'rejected' ? 'bg-red-500/20 text-red-400' :
                        'bg-yellow-500/20 text-yellow-400'
                      }`}>
                        {bid.status}
                      </span>
                    </div>
                    <p className="text-slate-300 text-sm mb-2">
                      预计 {bid.estimatedDays} 天完成
                    </p>
                    <p className="text-slate-400 text-sm">
                      {bid.proposal}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>

          <button
            onClick={onBid}
            className="w-full bg-gradient-to-r from-blue-500 to-purple-500 hover:from-blue-600 hover:to-purple-600 text-white py-3 rounded-lg font-medium transition-all"
          >
            提交竞标
          </button>
        </div>
      </div>
    </div>
  );
};
