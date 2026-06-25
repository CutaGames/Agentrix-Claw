/**
 * Skill Onboarding Panel - 五大用户画像入驻面板
 * 
 * 提供可视化的技能入驻界面
 */

import React, { useState } from 'react';
import { 
  Package, 
  Zap, 
  Users, 
  Database, 
  Code, 
  ShoppingCart,
  CheckCircle,
  AlertCircle 
} from 'lucide-react';

interface OnboardingFormData {
  type: 'api_vendor' | 'physical_service' | 'expert_consultant' | 'data_provider' | 'ai_developer';
  [key: string]: any;
}

export const OnboardingPanel: React.FC = () => {
  const [selectedType, setSelectedType] = useState<string | null>(null);
  const [formData, setFormData] = useState<Partial<OnboardingFormData>>({});
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  const userPersonas = [
    {
      type: 'api_vendor',
      name: 'API 厂商',
      icon: <Zap className="w-8 h-8" />,
      description: '提供 API 服务的技术公司',
      color: 'bg-blue-500',
    },
    {
      type: 'physical_service',
      name: '实物与服务商',
      icon: <ShoppingCart className="w-8 h-8" />,
      description: '销售实物商品或提供线下服务',
      color: 'bg-green-500',
    },
    {
      type: 'expert_consultant',
      name: '行业专家/顾问',
      icon: <Users className="w-8 h-8" />,
      description: '提供专业咨询和决策支持',
      color: 'bg-purple-500',
    },
    {
      type: 'data_provider',
      name: '专有数据持有方',
      icon: <Database className="w-8 h-8" />,
      description: '提供独家数据访问服务',
      color: 'bg-orange-500',
    },
    {
      type: 'ai_developer',
      name: '全能 AI 开发者',
      icon: <Code className="w-8 h-8" />,
      description: '开发和组合 AI 工作流',
      color: 'bg-pink-500',
    },
  ];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const response = await fetch('/api/onboarding', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('jwt_token')}`,
        },
        body: JSON.stringify({ ...formData, type: selectedType }),
      });

      if (!response.ok) {
        throw new Error('入驻失败');
      }

      const data = await response.json();
      setResult(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const renderForm = () => {
    switch (selectedType) {
      case 'api_vendor':
        return (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-2">API 名称</label>
              <input
                type="text"
                className="w-full px-4 py-2 border rounded"
                value={formData.apiName || ''}
                onChange={(e) => setFormData({ ...formData, apiName: e.target.value })}
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">API 描述</label>
              <textarea
                className="w-full px-4 py-2 border rounded"
                rows={3}
                value={formData.description || ''}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">OpenAPI 文档 URL (可选)</label>
              <input
                type="url"
                className="w-full px-4 py-2 border rounded"
                value={formData.apiDocumentUrl || ''}
                onChange={(e) => setFormData({ ...formData, apiDocumentUrl: e.target.value })}
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">每次调用价格 (USDC)</label>
              <input
                type="number"
                step="0.001"
                className="w-full px-4 py-2 border rounded"
                value={formData.pricePerCall || 0.01}
                onChange={(e) => setFormData({ ...formData, pricePerCall: parseFloat(e.target.value) })}
              />
            </div>
          </div>
        );

      case 'physical_service':
        return (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-2">商品名称</label>
              <input
                type="text"
                className="w-full px-4 py-2 border rounded"
                onChange={(e) => setFormData({
                  ...formData,
                  products: [{
                    name: e.target.value,
                    description: formData.products?.[0]?.description || '',
                    price: formData.products?.[0]?.price || 0,
                    currency: 'USD',
                  }]
                })}
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">商品描述</label>
              <textarea
                className="w-full px-4 py-2 border rounded"
                rows={3}
                onChange={(e) => setFormData({
                  ...formData,
                  products: [{
                    ...formData.products?.[0],
                    description: e.target.value,
                  }]
                })}
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">价格 (USD)</label>
              <input
                type="number"
                step="0.01"
                className="w-full px-4 py-2 border rounded"
                onChange={(e) => setFormData({
                  ...formData,
                  products: [{
                    ...formData.products?.[0],
                    price: parseFloat(e.target.value),
                  }]
                })}
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">履约类型</label>
              <select
                className="w-full px-4 py-2 border rounded"
                value={formData.fulfillmentType || 'physical'}
                onChange={(e) => setFormData({ ...formData, fulfillmentType: e.target.value as any })}
              >
                <option value="physical">实物商品</option>
                <option value="service">线下服务</option>
                <option value="digital">数字商品</option>
              </select>
            </div>
          </div>
        );

      case 'expert_consultant':
        return (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-2">专业领域</label>
              <input
                type="text"
                className="w-full px-4 py-2 border rounded"
                value={formData.expertise || ''}
                onChange={(e) => setFormData({ ...formData, expertise: e.target.value })}
                placeholder="例如: 法律顾问、财务分析师"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">能解决什么问题</label>
              <textarea
                className="w-full px-4 py-2 border rounded"
                rows={3}
                value={formData.problemSolving || ''}
                onChange={(e) => setFormData({ ...formData, problemSolving: e.target.value })}
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">每次咨询价格 (USDC)</label>
              <input
                type="number"
                className="w-full px-4 py-2 border rounded"
                value={formData.pricePerSession || 50}
                onChange={(e) => setFormData({ ...formData, pricePerSession: parseFloat(e.target.value) })}
              />
            </div>
          </div>
        );

      case 'data_provider':
        return (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-2">数据源 URL (可选)</label>
              <input
                type="url"
                className="w-full px-4 py-2 border rounded"
                value={formData.dataSourceUrl || ''}
                onChange={(e) => setFormData({ ...formData, dataSourceUrl: e.target.value })}
                placeholder="https://api.example.com/data"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">数据源格式</label>
              <select
                className="w-full px-4 py-2 border rounded"
                value={formData.dataFormat || 'api'}
                onChange={(e) => setFormData({ ...formData, dataFormat: e.target.value as any })}
              >
                <option value="api">API 接口</option>
                <option value="csv">CSV 文件</option>
                <option value="excel">Excel 表格</option>
                <option value="database">数据库</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">隐私级别</label>
              <select
                className="w-full px-4 py-2 border rounded"
                value={formData.privacyLevel || 'public'}
                onChange={(e) => setFormData({ ...formData, privacyLevel: e.target.value as any })}
              >
                <option value="public">公开</option>
                <option value="sensitive">敏感</option>
                <option value="encrypted">加密</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">每次查询价格 (USDC)</label>
              <input
                type="number"
                step="0.0001"
                className="w-full px-4 py-2 border rounded"
                value={formData.pricePerQuery || 0.001}
                onChange={(e) => setFormData({ ...formData, pricePerQuery: parseFloat(e.target.value) })}
              />
            </div>
          </div>
        );

      case 'ai_developer':
        return (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-2">Skill 名称</label>
              <input
                type="text"
                className="w-full px-4 py-2 border rounded"
                value={formData.skillName || ''}
                onChange={(e) => setFormData({ ...formData, skillName: e.target.value })}
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">Skill 描述</label>
              <textarea
                className="w-full px-4 py-2 border rounded"
                rows={3}
                value={formData.skillDescription || ''}
                onChange={(e) => setFormData({ ...formData, skillDescription: e.target.value })}
                required
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-2">代码语言</label>
                <select
                  className="w-full px-4 py-2 border rounded"
                  value={formData.codeLanguage || 'python'}
                  onChange={(e) => setFormData({ ...formData, codeLanguage: e.target.value as any })}
                >
                  <option value="python">Python</option>
                  <option value="nodejs">Node.js</option>
                  <option value="typescript">TypeScript</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">可见性</label>
                <select
                  className="w-full px-4 py-2 border rounded"
                  value={formData.visibility || 'public'}
                  onChange={(e) => setFormData({ ...formData, visibility: e.target.value as any })}
                >
                  <option value="public">公开 (Marketplace)</option>
                  <option value="team">团队私有</option>
                  <option value="private">个人私有</option>
                </select>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">GitHub 仓库 URL (可选)</label>
              <input
                type="url"
                className="w-full px-4 py-2 border rounded"
                value={formData.codeRepository || ''}
                onChange={(e) => setFormData({ ...formData, codeRepository: e.target.value })}
                placeholder="https://github.com/user/repo"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">每次执行价格 (USDC)</label>
              <input
                type="number"
                step="0.01"
                className="w-full px-4 py-2 border rounded"
                value={formData.pricePerExecution || 0.1}
                onChange={(e) => setFormData({ ...formData, pricePerExecution: parseFloat(e.target.value) })}
              />
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="max-w-6xl mx-auto p-6">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">Skill 入驻中心</h1>
        <p className="text-gray-600">
          选择您的用户画像，快速发布您的能力到 Agentrix Marketplace
        </p>
      </div>

      {!selectedType ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {userPersonas.map((persona) => (
            <div
              key={persona.type}
              onClick={() => setSelectedType(persona.type)}
              className={`${persona.color} text-white rounded-lg p-6 cursor-pointer hover:shadow-lg transition-shadow`}
            >
              <div className="flex items-center justify-center mb-4">
                {persona.icon}
              </div>
              <h3 className="text-xl font-bold mb-2 text-center">{persona.name}</h3>
              <p className="text-sm text-center opacity-90">{persona.description}</p>
            </div>
          ))}
        </div>
      ) : (
        <div className="bg-white rounded-lg shadow-lg p-8">
          <button
            onClick={() => {
              setSelectedType(null);
              setFormData({});
              setResult(null);
              setError(null);
            }}
            className="mb-6 text-blue-600 hover:text-blue-800"
          >
            ← 返回选择画像
          </button>

          <h2 className="text-2xl font-bold mb-6">
            {userPersonas.find((p) => p.type === selectedType)?.name}
          </h2>

          {!result ? (
            <form onSubmit={handleSubmit}>
              {renderForm()}

              <div className="mt-8 flex gap-4">
                <button
                  type="submit"
                  disabled={loading}
                  className="flex-1 bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 disabled:bg-gray-400"
                >
                  {loading ? '发布中...' : '立即发布到 Marketplace'}
                </button>
              </div>

              {error && (
                <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded flex items-start gap-2">
                  <AlertCircle className="w-5 h-5 text-red-600 mt-0.5" />
                  <div className="text-red-800">{error}</div>
                </div>
              )}
            </form>
          ) : (
            <div className="text-center py-8">
              <CheckCircle className="w-16 h-16 text-green-600 mx-auto mb-4" />
              <h3 className="text-2xl font-bold mb-2">发布成功！</h3>
              <p className="text-gray-600 mb-6">
                您的 Skill 已成功发布到 Marketplace，现在可以被以下平台检索和交易：
              </p>
              <div className="grid grid-cols-2 gap-4 max-w-md mx-auto mb-6">
                <div className="bg-blue-50 p-4 rounded">
                  <div className="font-semibold">✅ Gemini UCP</div>
                  <div className="text-sm text-gray-600">商品检索</div>
                </div>
                <div className="bg-purple-50 p-4 rounded">
                  <div className="font-semibold">✅ Claude MCP</div>
                  <div className="text-sm text-gray-600">工具调用</div>
                </div>
                <div className="bg-green-50 p-4 rounded">
                  <div className="font-semibold">✅ ChatGPT MCP</div>
                  <div className="text-sm text-gray-600">工具调用</div>
                </div>
                <div className="bg-orange-50 p-4 rounded">
                  <div className="font-semibold">✅ X402 支付</div>
                  <div className="text-sm text-gray-600">Agent 交易</div>
                </div>
              </div>
              <div className="bg-gray-50 p-4 rounded text-left">
                <div className="font-semibold mb-2">Skill 信息：</div>
                <div className="text-sm space-y-1">
                  <div>ID: <code className="bg-white px-2 py-1 rounded">{result.id}</code></div>
                  <div>名称: {result.displayName}</div>
                  <div>状态: <span className="text-green-600 font-semibold">{result.status}</span></div>
                </div>
              </div>
              <button
                onClick={() => {
                  setSelectedType(null);
                  setFormData({});
                  setResult(null);
                }}
                className="mt-6 bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700"
              >
                继续发布其他 Skill
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default OnboardingPanel;
