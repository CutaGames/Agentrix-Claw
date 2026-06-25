import { useState, useEffect } from 'react';
import { autoEarnAdvancedApi, LaunchpadProject } from '../../lib/api/auto-earn-advanced.api';
import { useToast } from '../../contexts/ToastContext';

interface LaunchpadPanelProps {
  agentId?: string;
}

export function LaunchpadPanel({ agentId }: LaunchpadPanelProps) {
  const { success, error } = useToast();
  const [projects, setProjects] = useState<LaunchpadProject[]>([]);
  const [loading, setLoading] = useState(false);
  const [autoParticipate, setAutoParticipate] = useState(false);

  useEffect(() => {
    loadProjects();
  }, []);

  const loadProjects = async () => {
    try {
      setLoading(true);
      const data = await autoEarnAdvancedApi.discoverLaunchpadProjects([
        'pump.fun',
        'raydium',
        'ton_memepad',
      ]);
      setProjects(data);
    } catch (err: any) {
      error(err.message || '加载Launchpad项目失败');
    } finally {
      setLoading(false);
    }
  };

  const participate = async (project: LaunchpadProject, amount: number) => {
    try {
      setLoading(true);
      await autoEarnAdvancedApi.participateInLaunchpad(project.id, amount, agentId);
      success('参与Launchpad项目成功');
      await loadProjects();
    } catch (err: any) {
      error(err.message || '参与项目失败');
    } finally {
      setLoading(false);
    }
  };

  const startAutoStrategy = async () => {
    try {
      setLoading(true);
      await autoEarnAdvancedApi.startAutoLaunchpadStrategy(
        {
          enabled: true,
          platforms: ['pump.fun', 'raydium'],
          minAmount: 10,
          maxAmount: 1000,
          autoSniping: true,
          takeProfitRate: 50,
        },
        agentId,
      );
      success('自动参与Launchpad策略已启动');
      setAutoParticipate(true);
    } catch (err: any) {
      error(err.message || '启动自动策略失败');
    } finally {
      setLoading(false);
    }
  };

  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      upcoming: 'bg-blue-100 text-blue-800',
      active: 'bg-green-100 text-green-800',
      ended: 'bg-gray-100 text-gray-800',
      listed: 'bg-purple-100 text-purple-800',
    };
    return colors[status] || 'bg-gray-100 text-gray-800';
  };

  const getStatusText = (status: string) => {
    const texts: Record<string, string> = {
      upcoming: '即将开始',
      active: '进行中',
      ended: '已结束',
      listed: '已上市',
    };
    return texts[status] || status;
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Launchpad项目</h3>
        <div className="flex space-x-2">
          <button
            onClick={loadProjects}
            disabled={loading}
            className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50"
          >
            {loading ? '加载中...' : '刷新项目'}
          </button>
          <button
            onClick={startAutoStrategy}
            disabled={loading || autoParticipate}
            className="px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 disabled:opacity-50"
          >
            {autoParticipate ? '自动参与中' : '启动自动策略'}
          </button>
        </div>
      </div>

      {projects.length === 0 ? (
        <div className="text-center py-8 text-gray-500">暂无Launchpad项目</div>
      ) : (
        <div className="space-y-3">
          {projects.map((project) => (
            <div
              key={project.id}
              className="border rounded-lg p-4 hover:shadow-md transition-shadow"
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center space-x-2 mb-2">
                    <span className="font-semibold text-lg">{project.name}</span>
                    <span className={`px-2 py-1 rounded text-xs ${getStatusColor(project.status)}`}>
                      {getStatusText(project.status)}
                    </span>
                    <span className="text-sm text-gray-500">{project.platform}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-4 text-sm mb-3">
                    <div>
                      <span className="text-gray-500">代币符号:</span>
                      <span className="ml-2 font-medium">{project.tokenSymbol}</span>
                    </div>
                    <div>
                      <span className="text-gray-500">链:</span>
                      <span className="ml-2 font-medium">{project.chain}</span>
                    </div>
                    <div>
                      <span className="text-gray-500">预售价格:</span>
                      <span className="ml-2 font-medium">${project.salePrice}</span>
                    </div>
                    {project.listingPrice && (
                      <div>
                        <span className="text-gray-500">上市价格:</span>
                        <span className="ml-2 font-medium text-green-600">
                          ${project.listingPrice}
                        </span>
                      </div>
                    )}
                    <div>
                      <span className="text-gray-500">已售/总量:</span>
                      <span className="ml-2 font-medium">
                        {project.soldSupply.toLocaleString()} / {project.saleSupply.toLocaleString()}
                      </span>
                    </div>
                    <div>
                      <span className="text-gray-500">购买范围:</span>
                      <span className="ml-2 font-medium">
                        ${project.minPurchase} - ${project.maxPurchase}
                      </span>
                    </div>
                  </div>
                  {project.whitelistRequired && (
                    <div className="text-xs text-yellow-600 mb-2">⚠️ 需要白名单</div>
                  )}
                  <div className="text-xs text-gray-400">
                    开始时间: {new Date(project.startTime).toLocaleString()}
                    <br />
                    结束时间: {new Date(project.endTime).toLocaleString()}
                  </div>
                </div>
                {project.status === 'active' && !project.whitelistRequired && (
                  <div className="ml-4">
                    <button
                      onClick={() => participate(project, project.minPurchase)}
                      disabled={loading}
                      className="px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 disabled:opacity-50"
                    >
                      参与项目
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

