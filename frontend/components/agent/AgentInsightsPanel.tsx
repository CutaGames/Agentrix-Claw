import Link from 'next/link'
import { useState, useEffect, useCallback } from 'react'
import { useAgentMode } from '../../contexts/AgentModeContext'
import { userAgentApi } from '../../lib/api/user-agent.api'
import { Code2, Terminal, MoreHorizontal, Copy, Settings } from 'lucide-react'

// 定义UserAgent类型（与后端实体对应）
interface UserAgent {
  id: string
  userId: string
  name: string
  status: 'active' | 'paused' | 'archived'
  createdAt: string
  updatedAt: string
  isPublished?: boolean
  metadata?: {
    persona?: 'personal' | 'merchant' | 'developer'
    [key: string]: any
  }
  settings?: {
    payoutWallet?: string
    [key: string]: any
  }
}
import { AgentDeploymentPanel } from './AgentDeploymentPanel'
import { useToast } from '../../contexts/ToastContext'

export function AgentInsightsPanel() {
  const { currentAgentId, setCurrentAgentId } = useAgentMode()
  const { error } = useToast()
  const [myAgents, setMyAgents] = useState<UserAgent[]>([])
  const [loading, setLoading] = useState(true)

  const loadMyAgents = useCallback(async () => {
    try {
      setLoading(true)
      const agents = await userAgentApi.getMyAgents()
      setMyAgents(agents)
      if (!currentAgentId && agents.length > 0) {
        setCurrentAgentId(agents[0].id)
      }
    } catch (err: any) {
      error(err.message || '加载Agent列表失败')
      // 如果API失败，使用MOCK数据作为fallback
      const mockAgents: UserAgent[] = [
        {
          id: 'ag-1',
          userId: 'user-1',
          name: 'Auto-Earn 捕获者',
          status: 'active',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          isPublished: true,
        },
        {
          id: 'ag-2',
          userId: 'user-1',
          name: '商户小助手',
          status: 'active',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          isPublished: true,
        },
      ]
      setMyAgents(mockAgents)
      if (!currentAgentId && mockAgents.length > 0) {
        setCurrentAgentId(mockAgents[0].id)
      }
    } finally {
      setLoading(false)
    }
  }, [currentAgentId, setCurrentAgentId, error])

  useEffect(() => {
    loadMyAgents()
  }, [loadMyAgents])

  return (
    <div className="w-80 border-l border-slate-800/60 bg-[#161b22] flex flex-col">
      {/* 头部 Tab */}
      <div className="h-16 border-b border-slate-800/60 flex items-center px-4 gap-4">
        <button className="text-sm font-medium text-white border-b-2 border-indigo-500 h-full pt-1">我的 Agents</button>
        <button className="text-sm font-medium text-slate-500 h-full pt-1 hover:text-slate-300">市场</button>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        {/* 活跃 Agent 列表 */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider">Active Workers</h4>
            <Link href="/agent-builder" className="text-indigo-400 text-xs hover:underline">+ New</Link>
          </div>
          {loading ? (
            <div className="text-center py-4 text-slate-500 text-xs">加载中...</div>
          ) : (
            <div className="space-y-3">
              {myAgents.length === 0 ? (
                <div className="text-center py-4 text-slate-500 text-xs">
                  暂无Agent，<Link href="/agent-builder" className="text-indigo-400">立即创建</Link>
                </div>
              ) : (
                myAgents.map((agent) => (
                  <div
                    key={agent.id}
                    className="bg-slate-900/80 border border-slate-800 rounded-lg p-3 flex items-center justify-between"
                  >
                    <div className="flex items-center gap-3">
                      <div className={`w-2 h-2 rounded-full ${
                        agent.status === 'active' 
                          ? 'bg-emerald-500 animate-pulse' 
                          : 'bg-slate-500'
                      }`}></div>
                      <div>
                        <div className="text-sm font-medium text-slate-200">{agent.name}</div>
                        <div className="text-[10px] text-slate-500">
                          {agent.status === 'active' ? '运行中' : agent.status === 'paused' ? '休眠中' : '已归档'} · 
                          {agent.status === 'active' ? ' 23ms 延迟' : ' 最后活跃 2h 前'}
                        </div>
                      </div>
                    </div>
                    <button className="text-slate-500 hover:text-white"><Settings size={14}/></button>
                  </div>
                ))
              )}
            </div>
          )}
        </div>

        {/* 外部部署模块 - 优化点：更紧凑，隐藏代码 */}
        {currentAgentId && (
          <div>
            <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Quick Deploy</h4>
            <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
              <div className="p-3 bg-slate-800/50 border-b border-slate-800 flex items-center justify-between">
                <div className="flex gap-2">
                  <div className="w-2.5 h-2.5 rounded-full bg-red-500/20 border border-red-500/50"></div>
                  <div className="w-2.5 h-2.5 rounded-full bg-amber-500/20 border border-amber-500/50"></div>
                  <div className="w-2.5 h-2.5 rounded-full bg-emerald-500/20 border border-emerald-500/50"></div>
                </div>
                <span className="text-[10px] text-slate-500 font-mono">Embed Script</span>
              </div>
              <div className="p-3 space-y-3">
                <p className="text-xs text-slate-400">
                  将您的 Agent 嵌入到任意网页。
                </p>
                <div className="relative group">
                  <pre className="bg-black/50 text-[10px] text-slate-500 p-2 rounded border border-slate-800 font-mono overflow-hidden text-ellipsis whitespace-nowrap">
                    &lt;script src=&quot;https://agentrix.ai/...&quot;&gt;
                  </pre>
                  <button className="absolute right-1 top-1 p-1 bg-slate-700 hover:bg-indigo-600 rounded text-white opacity-0 group-hover:opacity-100 transition-all">
                    <Copy size={12} />
                  </button>
                </div>
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="p-2 rounded bg-slate-800/50 border border-slate-800">
                    <div className="text-indigo-400 mb-1"><Code2 size={16} className="mx-auto"/></div>
                    <div className="text-[10px] text-slate-400">API</div>
                  </div>
                  <div className="p-2 rounded bg-slate-800/50 border border-slate-800">
                    <div className="text-indigo-400 mb-1"><Terminal size={16} className="mx-auto"/></div>
                    <div className="text-[10px] text-slate-400">CLI</div>
                  </div>
                  <div className="p-2 rounded bg-slate-800/50 border border-slate-800">
                    <div className="text-indigo-400 mb-1"><MoreHorizontal size={16} className="mx-auto"/></div>
                    <div className="text-[10px] text-slate-400">更多</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
        
        {/* 运行日志缩略 */}
        <div className="bg-black/30 rounded-lg border border-slate-800/50 p-3 font-mono text-[10px]">
          <div className="text-slate-500 mb-2">SYSTEM LOGS</div>
          <div className="text-emerald-500">{'>'} System initialized</div>
          <div className="text-slate-400">{'>'} Connected to Ethereum Mainnet</div>
          <div className="text-slate-400">{'>'} Listening for payment events...</div>
          <div className="text-indigo-400 animate-pulse">_</div>
        </div>
      </div>
    </div>
  )
}

