import { useState, useEffect } from 'react';
import { agentMarketplaceApi, AgentRanking } from '../../lib/api/agent-marketplace.api';
import { useToast } from '../../contexts/ToastContext';

export function AgentMarketplacePanel() {
  const { success, error } = useToast();
  const [agents, setAgents] = useState<any[]>([]);
  const [rankings, setRankings] = useState<AgentRanking[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchKeyword, setSearchKeyword] = useState('');
  const [sortBy, setSortBy] = useState<'popularity' | 'rating' | 'revenue' | 'recent'>('popularity');

  useEffect(() => {
    loadAgents();
  }, [searchKeyword, sortBy]);

  const loadAgents = async () => {
    try {
      setLoading(true);
      const data = await agentMarketplaceApi.searchAgents({
        keyword: searchKeyword || undefined,
        sortBy,
        page: 1,
        pageSize: 20,
      });
      if (data) {
        setAgents(Array.isArray(data.agents) ? data.agents : []);
        if (Array.isArray(data.rankings)) {
          setRankings(data.rankings);
        }
      } else {
        setAgents([]);
      }
    } catch (err: any) {
      error(err.message || '加载Agent失败');
      setAgents([]);
    } finally {
      setLoading(false);
    }
  };

  const loadRankings = async () => {
    try {
      const agentIds = agents.map((a) => a.id);
      if (agentIds.length > 0) {
        const data = await agentMarketplaceApi.getAgentRankings(agentIds);
        setRankings(Array.isArray(data) ? data : []);
      }
    } catch (err: any) {
      // 忽略错误
    }
  };

  const handleAgentCall = async (agentId: string) => {
    try {
      await agentMarketplaceApi.recordAgentCall(agentId);
      success('已记录Agent调用');
      await loadAgents();
    } catch (err: any) {
      error(err.message || '记录调用失败');
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Agent Marketplace</h3>
      </div>

      {/* 搜索和排序 */}
      <div className="flex space-x-2">
        <input
          type="text"
          placeholder="搜索Agent..."
          value={searchKeyword}
          onChange={(e) => setSearchKeyword(e.target.value)}
          className="flex-1 border rounded-lg px-4 py-2"
        />
        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as any)}
          className="border rounded-lg px-4 py-2"
        >
          <option value="popularity">热门度</option>
          <option value="rating">评分</option>
          <option value="revenue">收益</option>
          <option value="recent">最近</option>
        </select>
      </div>

      {/* 排行榜 */}
      {rankings.length > 0 && (
        <div className="border rounded-lg p-4">
          <h4 className="font-semibold mb-3">Agent排行榜</h4>
          <div className="space-y-2">
            {rankings.slice(0, 5).map((ranking) => (
              <div key={ranking.agentId} className="flex items-center justify-between p-2 hover:bg-gray-50 rounded">
                <div className="flex items-center space-x-3">
                  <span className="text-lg font-bold text-gray-400">#{ranking.rank}</span>
                  <span className="font-medium">{ranking.agentName}</span>
                </div>
                <div className="flex items-center space-x-4 text-sm text-gray-600">
                  <span>调用: {ranking.stats.totalCalls}</span>
                  <span>收益: ${ranking.stats.totalRevenue.toFixed(2)}</span>
                  <span>评分: {ranking.stats.avgRating.toFixed(1)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Agent列表 */}
      {loading ? (
        <div className="text-center py-8 text-gray-500">加载中...</div>
      ) : agents.length === 0 ? (
        <div className="text-center py-8 text-gray-500">暂无Agent</div>
      ) : (
        <div className="space-y-3">
          {agents.map((agent) => {
            const ranking = rankings.find((r) => r.agentId === agent.id);
            return (
              <div
                key={agent.id}
                className="border rounded-lg p-4 hover:shadow-md transition-shadow"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center space-x-2 mb-2">
                      <span className="font-semibold text-lg">{agent.name}</span>
                      {ranking && (
                        <span className="px-2 py-1 bg-yellow-100 text-yellow-800 rounded text-xs">
                          #{ranking.rank}
                        </span>
                      )}
                    </div>
                    {agent.description && (
                      <p className="text-sm text-gray-600 mb-3">{agent.description}</p>
                    )}
                    {ranking && (
                      <div className="flex items-center space-x-4 text-sm text-gray-500">
                        <span>调用次数: {ranking.stats.totalCalls}</span>
                        <span>总收益: ${ranking.stats.totalRevenue.toFixed(2)}</span>
                        <span>用户数: {ranking.stats.totalUsers}</span>
                        <span>评分: {ranking.stats.avgRating.toFixed(1)}</span>
                      </div>
                    )}
                  </div>
                  <div className="ml-4">
                    <button
                      onClick={() => handleAgentCall(agent.id)}
                      className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600"
                    >
                      使用Agent
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

