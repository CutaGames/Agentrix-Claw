import { useState, useEffect, useCallback } from 'react'
import { useAgentMode } from '../../contexts/AgentModeContext'
import { agentTemplateApi } from '../../lib/api/agent-template.api'
import { useToast } from '../../contexts/ToastContext'

interface DeploymentInfo {
  shareLink: string
  embedCode: string
  apiKey?: string
  webhookUrl?: string
  callCount?: number
  lastActiveAt?: string
}

export function AgentDeploymentPanel() {
  const { currentAgentId, mode, setCurrentAgentId } = useAgentMode()
  const { success, error } = useToast()
  const [deployment, setDeployment] = useState<DeploymentInfo | null>(null)
  const [loading, setLoading] = useState(false)
  const [activeTab, setActiveTab] = useState<'share' | 'embed' | 'api' | 'monitor'>('share')

  const loadDeploymentInfo = useCallback(async () => {
    if (!currentAgentId) return

    try {
      setLoading(true)
      // TODO: 从真实API获取部署信息
      // MOCK数据
      const mockDeployment: DeploymentInfo = {
        shareLink: `https://agentrix.ai/agent/${currentAgentId}`,
        embedCode: `<iframe src="https://agentrix.ai/agent/${currentAgentId}/embed" width="100%" height="600" frameborder="0"></iframe>`,
        apiKey: `pm_live_${currentAgentId.substring(0, 8)}...`,
        webhookUrl: `https://api.agentrix.ai/webhooks/agent/${currentAgentId}`,
        callCount: 1234,
        lastActiveAt: new Date().toISOString(),
      }
      setDeployment(mockDeployment)
    } catch (err: any) {
      error(err.message || '加载部署信息失败')
    } finally {
      setLoading(false)
    }
  }, [currentAgentId, error])

  useEffect(() => {
    if (currentAgentId) {
      loadDeploymentInfo()
    }
  }, [currentAgentId, loadDeploymentInfo])

  const handleCopy = (text: string, label: string) => {
    navigator.clipboard.writeText(text)
    success(`${label}已复制到剪贴板`)
  }

  const handleGenerateApiKey = async () => {
    try {
      // TODO: 调用真实API生成新的API Key
      success('API Key已生成')
      await loadDeploymentInfo()
    } catch (err: any) {
      error(err.message || '生成API Key失败')
    }
  }

  if (loading) {
    return <div className="text-center py-8 text-gray-500">加载中...</div>
  }

  if (!deployment) {
    return (
      <div className="text-center py-8 text-gray-500">
        请先创建一个Agent
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Tab导航 */}
      <div className="flex space-x-2 border-b border-gray-200">
        {[
          { id: 'share', label: '分享链接', icon: '🔗' },
          { id: 'embed', label: '嵌入代码', icon: '📦' },
          { id: 'api', label: 'API配置', icon: '🔑' },
          { id: 'monitor', label: '运行监控', icon: '📊' },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              activeTab === tab.id
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            <span className="mr-2">{tab.icon}</span>
            {tab.label}
          </button>
        ))}
      </div>

      {/* 分享链接 */}
      {activeTab === 'share' && (
        <div className="space-y-4">
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              分享链接
            </label>
            <div className="flex items-center space-x-2">
              <input
                type="text"
                value={deployment.shareLink}
                readOnly
                className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm"
              />
              <button
                onClick={() => handleCopy(deployment.shareLink, '分享链接')}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm"
              >
                复制
              </button>
            </div>
            <p className="mt-2 text-xs text-gray-500">
              分享此链接，其他人可以直接访问你的Agent
            </p>
          </div>

          <div className="bg-blue-50 rounded-lg border border-blue-200 p-4">
            <h4 className="text-sm font-semibold text-blue-900 mb-2">使用场景</h4>
            <ul className="space-y-1 text-xs text-blue-800">
              <li>• 分享到社交媒体、社区</li>
              <li>• 嵌入到你的网站或应用</li>
              <li>• 通过邮件、消息发送给用户</li>
            </ul>
          </div>
        </div>
      )}

      {/* 嵌入代码 */}
      {activeTab === 'embed' && (
        <div className="space-y-4">
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              iframe嵌入代码
            </label>
            <textarea
              value={deployment.embedCode}
              readOnly
              rows={4}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono"
            />
            <div className="mt-2 flex justify-end">
              <button
                onClick={() => handleCopy(deployment.embedCode, '嵌入代码')}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm"
              >
                复制代码
              </button>
            </div>
          </div>

          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              React组件示例
            </label>
            <pre className="bg-gray-900 text-green-400 p-4 rounded-lg text-xs overflow-x-auto">
{`import { AgentrixAgent } from '@agentrix/react-agent'

function MyApp() {
  return (
    <AgentrixAgent
      agentId="${currentAgentId}"
      theme="light"
      height="600px"
    />
  )
}`}
            </pre>
            <div className="mt-2 flex justify-end">
              <button
                onClick={() =>
                  handleCopy(
                    `import { AgentrixAgent } from '@agentrix/react-agent'\n\nfunction MyApp() {\n  return (\n    <AgentrixAgent\n      agentId="${currentAgentId}"\n      theme="light"\n      height="600px"\n    />\n  )\n}`,
                    'React代码',
                  )
                }
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm"
              >
                复制代码
              </button>
            </div>
          </div>
        </div>
      )}

      {/* API配置 */}
      {activeTab === 'api' && (
        <div className="space-y-4">
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <div className="flex items-center justify-between mb-2">
              <label className="block text-sm font-medium text-gray-700">
                API Key
              </label>
              <button
                onClick={handleGenerateApiKey}
                className="text-xs text-blue-600 hover:text-blue-800"
              >
                重新生成
              </button>
            </div>
            <div className="flex items-center space-x-2">
              <input
                type="text"
                value={deployment.apiKey || ''}
                readOnly
                className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono"
              />
              <button
                onClick={() => handleCopy(deployment.apiKey || '', 'API Key')}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm"
              >
                复制
              </button>
            </div>
            <p className="mt-2 text-xs text-gray-500">
              使用此API Key调用Agentrix Agent API
            </p>
          </div>

          {deployment.webhookUrl && (
            <div className="bg-white rounded-lg border border-gray-200 p-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Webhook URL
              </label>
              <div className="flex items-center space-x-2">
                <input
                  type="text"
                  value={deployment.webhookUrl}
                  readOnly
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono"
                />
                <button
                  onClick={() => handleCopy(deployment.webhookUrl || '', 'Webhook URL')}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm"
                >
                  复制
                </button>
              </div>
              <p className="mt-2 text-xs text-gray-500">
                配置此Webhook URL以接收Agent事件通知
              </p>
            </div>
          )}

          <div className="bg-gray-50 rounded-lg border border-gray-200 p-4">
            <h4 className="text-sm font-semibold text-gray-900 mb-2">API使用示例</h4>
            <pre className="bg-gray-900 text-green-400 p-4 rounded-lg text-xs overflow-x-auto">
{`// JavaScript/TypeScript
const response = await fetch('https://api.agentrix.ai/v1/agent/chat', {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer ${deployment.apiKey}',
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    message: '帮我找一款笔记本电脑',
    agentId: '${currentAgentId}'
  })
})`}
            </pre>
          </div>
        </div>
      )}

      {/* 运行监控 */}
      {activeTab === 'monitor' && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-white rounded-lg border border-gray-200 p-4">
              <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">
                总调用次数
              </p>
              <p className="text-2xl font-bold text-gray-900">
                {deployment.callCount?.toLocaleString() || 0}
              </p>
            </div>
            <div className="bg-white rounded-lg border border-gray-200 p-4">
              <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">
                最后活跃
              </p>
              <p className="text-sm font-semibold text-gray-900">
                {deployment.lastActiveAt
                  ? new Date(deployment.lastActiveAt).toLocaleString('zh-CN')
                  : '从未'}
              </p>
            </div>
          </div>

          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <h4 className="text-sm font-semibold text-gray-900 mb-4">调用统计</h4>
            <div className="space-y-3">
              {/* TODO: 显示真实的调用统计图表 */}
              <div className="text-center py-8 text-gray-400 text-sm">
                调用统计图表（待实现）
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

