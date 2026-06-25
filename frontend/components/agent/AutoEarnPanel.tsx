import { useMemo, useState, useEffect, useCallback } from 'react'
import { Globe } from 'lucide-react'
import { useAgentMode } from '../../contexts/AgentModeContext'
import { autoEarnApi, AutoEarnTask, AutoEarnStats } from '../../lib/api/auto-earn.api'
import { useToast } from '../../contexts/ToastContext'
import { ArbitragePanel } from '../auto-earn/ArbitragePanel'
import { LaunchpadPanel } from '../auto-earn/LaunchpadPanel'
import { StrategyPanel } from '../auto-earn/StrategyPanel'

export function AutoEarnPanel() {
  const { mode, currentAgentId } = useAgentMode()
  const { success, error } = useToast()
  const [tasks, setTasks] = useState<AutoEarnTask[]>([])
  const [stats, setStats] = useState<AutoEarnStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [selectedStrategy, setSelectedStrategy] = useState<'conservative' | 'balanced' | 'aggressive'>(
    'balanced',
  )
  const [activeTab, setActiveTab] = useState<'basic' | 'arbitrage' | 'launchpad' | 'strategies'>('basic')

  const loadData = useCallback(async () => {
    try {
      setLoading(true)
      const [tasksData, statsData] = await Promise.all([
        autoEarnApi.getTasks(currentAgentId),
        autoEarnApi.getStats(currentAgentId),
      ])
      setTasks(tasksData)
      setStats(statsData)
    } catch (err: any) {
      error(err.message || '加载Auto-Earn数据失败')
    } finally {
      setLoading(false)
    }
  }, [currentAgentId, error])

  useEffect(() => {
    loadData()
  }, [loadData])

  const handleExecuteTask = async (taskId: string) => {
    try {
      const result = await autoEarnApi.executeTask(taskId, currentAgentId)
      if (result.success) {
        success(`任务执行成功！获得 ${result.reward?.amount} ${result.reward?.currency}`)
        await loadData()
      }
    } catch (err: any) {
      error(err.message || '执行任务失败')
    }
  }

  const handleToggleStrategy = async (strategyId: string, enabled: boolean) => {
    try {
      await autoEarnApi.toggleStrategy(strategyId, enabled, currentAgentId)
      success(`策略已${enabled ? '启动' : '停止'}`)
      await loadData()
    } catch (err: any) {
      error(err.message || '切换策略失败')
    }
  }

  const summary = useMemo(
    () => ({
      totalYield: stats ? `+${stats.totalEarnings} ${stats.currency}` : '+0 USDC',
      tasksCompleted: stats?.tasksCompleted || 0,
      strategiesActive: stats?.tasksRunning || 0,
      nextPayout: '6 小时后', // TODO: 从stats计算
    }),
    [stats],
  )

  return (
    <div className="space-y-8">
      {/* Mainnet Banner */}
      <div className="bg-blue-600/10 border border-blue-500/20 rounded-2xl p-6 flex flex-col md:flex-row items-center justify-between gap-6">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-blue-600 flex items-center justify-center text-white shadow-lg shadow-blue-600/20">
            <Globe size={24} />
          </div>
          <div>
            <h3 className="text-xl font-bold text-white flex items-center gap-2">
              Auto-Earn Mainnet Early Access
              <span className="text-[10px] bg-blue-500 text-white px-2 py-0.5 rounded-full uppercase tracking-tighter italic">Coming Soon</span>
            </h3>
            <p className="text-sm text-slate-400 mt-1">目前部分高阶策略处于沙盒模拟阶段，正式主网版本预计于近期开放。您的模拟收益将映射至主网积分计划。</p>
          </div>
        </div>
        <button className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl transition-all shadow-lg shadow-blue-600/20">
          获取早期访问资格
        </button>
      </div>

      <div className="grid md:grid-cols-4 gap-4">
        <SummaryCard label="累计收益" value={summary.totalYield} accent="text-emerald-500" />
        <SummaryCard label="完成任务" value={`${summary.tasksCompleted} 个`} />
        <SummaryCard label="运行策略" value={`${summary.strategiesActive} 个`} />
        <SummaryCard label="下次分润" value={summary.nextPayout} />
      </div>

      {/* 标签页导航 */}
      <div className="flex space-x-2 border-b">
        <button
          onClick={() => setActiveTab('basic')}
          className={`px-4 py-2 ${
            activeTab === 'basic'
              ? 'border-b-2 border-blue-500 text-blue-600 font-semibold'
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          基础功能
        </button>
        <button
          onClick={() => setActiveTab('arbitrage')}
          className={`px-4 py-2 ${
            activeTab === 'arbitrage'
              ? 'border-b-2 border-blue-500 text-blue-600 font-semibold'
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          套利交易
        </button>
        <button
          onClick={() => setActiveTab('launchpad')}
          className={`px-4 py-2 ${
            activeTab === 'launchpad'
              ? 'border-b-2 border-blue-500 text-blue-600 font-semibold'
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          Launchpad
        </button>
        <button
          onClick={() => setActiveTab('strategies')}
          className={`px-4 py-2 ${
            activeTab === 'strategies'
              ? 'border-b-2 border-blue-500 text-blue-600 font-semibold'
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          策略管理
        </button>
      </div>

      {/* 基础功能标签页 */}
      {activeTab === 'basic' && (
        <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white rounded-3xl border border-gray-100 shadow-sm p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-lg font-semibold text-gray-900">任务与策略</h3>
              <p className="text-sm text-gray-500">自动执行空投、任务与策略，收益实时回传</p>
            </div>
            <div className="flex items-center gap-2 text-xs text-gray-500">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse"></span> 实时运行
            </div>
          </div>
          {loading ? (
            <div className="text-center py-8 text-gray-500">加载中...</div>
          ) : (
            <div className="space-y-3">
              {tasks.length === 0 ? (
                <div className="text-center py-8 text-gray-500">暂无任务</div>
              ) : (
                tasks.map((task) => (
                  <div
                    key={task.id}
                    className="flex items-center justify-between bg-gray-50 rounded-2xl p-4 border border-gray-100"
                  >
                    <div className="flex-1">
                      <p className="text-sm font-semibold text-gray-900">{task.title}</p>
                      <p className="text-xs text-gray-500 mt-1">{task.description}</p>
                      <p className="text-xs text-gray-400 mt-1 capitalize">
                        {task.type === 'airdrop'
                          ? '空投任务'
                          : task.type === 'task'
                            ? '任务自动化'
                            : task.type === 'strategy'
                              ? '策略执行'
                              : '推广分成'}
                        {task.metadata?.chain && ` · ${task.metadata.chain}`}
                      </p>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="text-right">
                        <span className="text-sm font-semibold text-emerald-600">
                          {task.reward.amount > 0
                            ? `+${task.reward.amount} ${task.reward.currency}`
                            : task.type === 'strategy'
                              ? '策略收益'
                              : '待定'}
                        </span>
                      </div>
                      <span
                        className={`px-3 py-1 text-xs rounded-full ${
                          task.status === 'running'
                            ? 'bg-blue-100 text-blue-700'
                            : task.status === 'completed'
                              ? 'bg-emerald-100 text-emerald-700'
                              : task.status === 'failed'
                                ? 'bg-red-100 text-red-700'
                                : 'bg-gray-200 text-gray-700'
                        }`}
                      >
                        {task.status === 'available'
                          ? '可执行'
                          : task.status === 'running'
                            ? '执行中'
                            : task.status === 'completed'
                              ? '已完成'
                              : '失败'}
                      </span>
                      {task.status === 'available' && (
                        <button
                          onClick={() => handleExecuteTask(task.id)}
                          className="px-3 py-1 text-xs bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                        >
                          执行
                        </button>
                      )}
                      {task.type === 'strategy' && task.status === 'running' && (
                        <button
                          onClick={() => handleToggleStrategy(task.id, false)}
                          className="px-3 py-1 text-xs bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors"
                        >
                          停止
                        </button>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>

        <div className="bg-white rounded-3xl border border-gray-100 shadow-sm p-6 space-y-6">
          <div>
            <h3 className="text-lg font-semibold text-gray-900 mb-1">策略配置</h3>
            <p className="text-sm text-gray-500">根据目标自动调度 Auto-Earn 能力</p>
          </div>
          <div className="space-y-3">
            {(['conservative', 'balanced', 'aggressive'] as const).map((strategy) => (
              <button
                key={strategy}
                onClick={() => setSelectedStrategy(strategy)}
                className={`w-full text-left px-4 py-3 rounded-2xl border ${
                  selectedStrategy === strategy
                    ? 'border-blue-500 bg-blue-50 text-blue-700'
                    : 'border-gray-200 text-gray-600 hover:border-gray-300'
                }`}
              >
                <p className="text-sm font-semibold">
                  {strategy === 'conservative' ? '稳健策略' : strategy === 'balanced' ? '平衡策略' : '进取策略'}
                </p>
                <p className="text-xs text-gray-500 mt-0.5">
                  {strategy === 'conservative'
                    ? '侧重稳定收益 + 空投任务'
                    : strategy === 'balanced'
                      ? '任务 + 策略 + 定投均衡'
                      : '高收益策略，自动抢购/套利'}
                </p>
              </button>
            ))}
          </div>

          <div className="rounded-2xl bg-gray-50 border border-gray-100 p-4 space-y-2">
            <p className="text-xs text-gray-500 uppercase tracking-[0.3em]">自动执行</p>
            <div className="flex items-center justify-between text-sm text-gray-700">
              <span>Auto-Earn 状态</span>
              <span className="font-semibold text-emerald-600">运行中</span>
            </div>
            <div className="flex items-center justify-between text-sm text-gray-700">
              <span>个人 Agent 模式</span>
              <span className="font-semibold">{mode === 'personal' ? '已启用' : '可共享'}</span>
            </div>
            <button className="w-full mt-2 text-sm font-semibold text-blue-600 hover:text-blue-800">
              查看执行日志 →
            </button>
          </div>
        </div>
      </div>
      )}

      {/* 套利交易标签页 */}
      {activeTab === 'arbitrage' && (
        <div className="bg-white rounded-3xl border border-gray-100 shadow-sm p-6">
          <ArbitragePanel agentId={currentAgentId} />
        </div>
      )}

      {/* Launchpad标签页 */}
      {activeTab === 'launchpad' && (
        <div className="bg-white rounded-3xl border border-gray-100 shadow-sm p-6">
          <LaunchpadPanel agentId={currentAgentId} />
        </div>
      )}

      {/* 策略管理标签页 */}
      {activeTab === 'strategies' && (
        <div className="bg-white rounded-3xl border border-gray-100 shadow-sm p-6">
          <StrategyPanel agentId={currentAgentId} />
        </div>
      )}
    </div>
  )
}

function SummaryCard({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div className="bg-white rounded-3xl border border-gray-100 shadow-sm p-4">
      <p className="text-xs text-gray-500 uppercase tracking-[0.3em]">{label}</p>
      <p className={`text-xl font-semibold mt-2 ${accent || 'text-gray-900'}`}>{value}</p>
    </div>
  )
}

