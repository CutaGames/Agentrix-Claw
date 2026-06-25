import Head from 'next/head';
import { useState, useEffect } from 'react';
import { Settings, DollarSign, Percent, Save, RefreshCw, AlertCircle, CheckCircle } from 'lucide-react';

interface CommissionConfig {
  x402ChannelFeeRate: number;
  scannedUcpFeeRate: number;
  scannedX402FeeRate: number;
  scannedFtFeeRate: number;
  scannedNftFeeRate: number;
  infraPlatformFee: number;
  infraPoolRate: number;
  resourcePlatformFee: number;
  resourcePoolRate: number;
  logicPlatformFee: number;
  logicPoolRate: number;
  compositePlatformFee: number;
  compositePoolRate: number;
  executorShare: number;
  referrerShare: number;
  promoterShareOfPlatform: number;
}

const defaultConfig: CommissionConfig = {
  x402ChannelFeeRate: 0,
  scannedUcpFeeRate: 1,
  scannedX402FeeRate: 1,
  scannedFtFeeRate: 0.3,
  scannedNftFeeRate: 0.3,
  infraPlatformFee: 0.5,
  infraPoolRate: 2,
  resourcePlatformFee: 0.5,
  resourcePoolRate: 2.5,
  logicPlatformFee: 1,
  logicPoolRate: 4,
  compositePlatformFee: 3,
  compositePoolRate: 7,
  executorShare: 70,
  referrerShare: 30,
  promoterShareOfPlatform: 20,
};

export default function AdminSystem() {
  const [config, setConfig] = useState<CommissionConfig>(defaultConfig);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    loadConfig();
  }, []);

  const loadConfig = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/commission-config');
      if (res.ok) {
        const data = await res.json();
        setConfig({ ...defaultConfig, ...data });
      }
    } catch (error) {
      console.error('Failed to load config:', error);
    } finally {
      setLoading(false);
    }
  };

  const saveConfig = async () => {
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch('/api/admin/commission-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      });
      if (res.ok) {
        setMessage({ type: 'success', text: '配置保存成功' });
      } else {
        setMessage({ type: 'error', text: '保存失败，请重试' });
      }
    } catch (error) {
      setMessage({ type: 'error', text: '网络错误，请重试' });
    } finally {
      setSaving(false);
    }
  };

  const updateConfig = (key: keyof CommissionConfig, value: number) => {
    setConfig(prev => ({ ...prev, [key]: value }));
  };

  return (
    <>
      <Head>
        <title>System Management - Agentrix Admin</title>
      </Head>
      <div className="min-h-screen bg-gray-50">
        <div className="ml-64 p-8">
          <div className="flex items-center justify-between mb-8">
            <div>
              <h2 className="text-3xl font-bold text-gray-900 flex items-center gap-3">
                <Settings className="w-8 h-8" />
                System Management
              </h2>
              <p className="text-gray-600 mt-2">分佣配置与系统参数管理</p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={loadConfig}
                disabled={loading}
                className="flex items-center gap-2 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 disabled:opacity-50"
              >
                <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                刷新
              </button>
              <button
                onClick={saveConfig}
                disabled={saving}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                <Save className="w-4 h-4" />
                {saving ? '保存中...' : '保存配置'}
              </button>
            </div>
          </div>

          {message && (
            <div className={`mb-6 p-4 rounded-lg flex items-center gap-2 ${
              message.type === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
            }`}>
              {message.type === 'success' ? <CheckCircle className="w-5 h-5" /> : <AlertCircle className="w-5 h-5" />}
              {message.text}
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* X402 通道费配置 */}
            <div className="bg-white rounded-xl shadow-sm p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <DollarSign className="w-5 h-5 text-blue-500" />
                X402 通道费配置
              </h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    X402 通道费率 (%)
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      step="0.1"
                      min="0"
                      max="3"
                      value={config.x402ChannelFeeRate}
                      onChange={(e) => updateConfig('x402ChannelFeeRate', parseFloat(e.target.value) || 0)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                    <span className="text-gray-500">%</span>
                  </div>
                  <p className="text-xs text-gray-500 mt-1">
                    默认 0%，后续可根据 XSRN 协议调整为 0.3%
                  </p>
                </div>
              </div>
            </div>

            {/* 扫描商品费率 */}
            <div className="bg-white rounded-xl shadow-sm p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <Percent className="w-5 h-5 text-green-500" />
                扫描商品用户额外费率
              </h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">UCP 扫描 (%)</label>
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    max="2"
                    value={config.scannedUcpFeeRate}
                    onChange={(e) => updateConfig('scannedUcpFeeRate', parseFloat(e.target.value) || 0)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">X402 扫描 (%)</label>
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    max="2"
                    value={config.scannedX402FeeRate}
                    onChange={(e) => updateConfig('scannedX402FeeRate', parseFloat(e.target.value) || 0)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">FT 扫描 (%)</label>
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    max="2"
                    value={config.scannedFtFeeRate}
                    onChange={(e) => updateConfig('scannedFtFeeRate', parseFloat(e.target.value) || 0)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">NFT 扫描 (%)</label>
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    max="2"
                    value={config.scannedNftFeeRate}
                    onChange={(e) => updateConfig('scannedNftFeeRate', parseFloat(e.target.value) || 0)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
            </div>

            {/* Skill 层级费率 */}
            <div className="bg-white rounded-xl shadow-sm p-6 lg:col-span-2">
              <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <Settings className="w-5 h-5 text-purple-500" />
                Skill 层级费率配置
              </h3>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left py-2 px-3 text-sm font-medium text-gray-700">层级</th>
                      <th className="text-left py-2 px-3 text-sm font-medium text-gray-700">平台费 (%)</th>
                      <th className="text-left py-2 px-3 text-sm font-medium text-gray-700">激励池 (%)</th>
                      <th className="text-left py-2 px-3 text-sm font-medium text-gray-700">总抽佣</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="border-b">
                      <td className="py-3 px-3 text-sm text-gray-900">INFRA (基础设施)</td>
                      <td className="py-3 px-3">
                        <input
                          type="number"
                          step="0.1"
                          value={config.infraPlatformFee}
                          onChange={(e) => updateConfig('infraPlatformFee', parseFloat(e.target.value) || 0)}
                          className="w-20 px-2 py-1 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500"
                        />
                      </td>
                      <td className="py-3 px-3">
                        <input
                          type="number"
                          step="0.1"
                          value={config.infraPoolRate}
                          onChange={(e) => updateConfig('infraPoolRate', parseFloat(e.target.value) || 0)}
                          className="w-20 px-2 py-1 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500"
                        />
                      </td>
                      <td className="py-3 px-3 text-sm text-gray-600">
                        {(config.infraPlatformFee + config.infraPoolRate).toFixed(1)}%
                      </td>
                    </tr>
                    <tr className="border-b">
                      <td className="py-3 px-3 text-sm text-gray-900">RESOURCE (资源层)</td>
                      <td className="py-3 px-3">
                        <input
                          type="number"
                          step="0.1"
                          value={config.resourcePlatformFee}
                          onChange={(e) => updateConfig('resourcePlatformFee', parseFloat(e.target.value) || 0)}
                          className="w-20 px-2 py-1 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500"
                        />
                      </td>
                      <td className="py-3 px-3">
                        <input
                          type="number"
                          step="0.1"
                          value={config.resourcePoolRate}
                          onChange={(e) => updateConfig('resourcePoolRate', parseFloat(e.target.value) || 0)}
                          className="w-20 px-2 py-1 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500"
                        />
                      </td>
                      <td className="py-3 px-3 text-sm text-gray-600">
                        {(config.resourcePlatformFee + config.resourcePoolRate).toFixed(1)}%
                      </td>
                    </tr>
                    <tr className="border-b">
                      <td className="py-3 px-3 text-sm text-gray-900">LOGIC (逻辑层)</td>
                      <td className="py-3 px-3">
                        <input
                          type="number"
                          step="0.1"
                          value={config.logicPlatformFee}
                          onChange={(e) => updateConfig('logicPlatformFee', parseFloat(e.target.value) || 0)}
                          className="w-20 px-2 py-1 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500"
                        />
                      </td>
                      <td className="py-3 px-3">
                        <input
                          type="number"
                          step="0.1"
                          value={config.logicPoolRate}
                          onChange={(e) => updateConfig('logicPoolRate', parseFloat(e.target.value) || 0)}
                          className="w-20 px-2 py-1 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500"
                        />
                      </td>
                      <td className="py-3 px-3 text-sm text-gray-600">
                        {(config.logicPlatformFee + config.logicPoolRate).toFixed(1)}%
                      </td>
                    </tr>
                    <tr>
                      <td className="py-3 px-3 text-sm text-gray-900 font-medium">COMPOSITE (插件)</td>
                      <td className="py-3 px-3">
                        <input
                          type="number"
                          step="0.1"
                          value={config.compositePlatformFee}
                          onChange={(e) => updateConfig('compositePlatformFee', parseFloat(e.target.value) || 0)}
                          className="w-20 px-2 py-1 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500"
                        />
                      </td>
                      <td className="py-3 px-3">
                        <input
                          type="number"
                          step="0.1"
                          value={config.compositePoolRate}
                          onChange={(e) => updateConfig('compositePoolRate', parseFloat(e.target.value) || 0)}
                          className="w-20 px-2 py-1 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500"
                        />
                      </td>
                      <td className="py-3 px-3 text-sm text-gray-600 font-medium">
                        {(config.compositePlatformFee + config.compositePoolRate).toFixed(1)}%
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            {/* Agent 分佣配置 */}
            <div className="bg-white rounded-xl shadow-sm p-6 lg:col-span-2">
              <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <DollarSign className="w-5 h-5 text-orange-500" />
                Agent 分佣配置
              </h3>
              <div className="grid grid-cols-3 gap-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    执行Agent份额 (%)
                  </label>
                  <input
                    type="number"
                    step="1"
                    min="0"
                    max="100"
                    value={config.executorShare}
                    onChange={(e) => updateConfig('executorShare', parseFloat(e.target.value) || 0)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  />
                  <p className="text-xs text-gray-500 mt-1">激励池中执行Agent的份额</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    推荐Agent份额 (%)
                  </label>
                  <input
                    type="number"
                    step="1"
                    min="0"
                    max="100"
                    value={config.referrerShare}
                    onChange={(e) => updateConfig('referrerShare', parseFloat(e.target.value) || 0)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  />
                  <p className="text-xs text-gray-500 mt-1">激励池中推荐Agent的份额</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    推广Agent份额 (%)
                  </label>
                  <input
                    type="number"
                    step="1"
                    min="0"
                    max="100"
                    value={config.promoterShareOfPlatform}
                    onChange={(e) => updateConfig('promoterShareOfPlatform', parseFloat(e.target.value) || 0)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  />
                  <p className="text-xs text-gray-500 mt-1">平台费中推广Agent的份额</p>
                </div>
              </div>
              <div className="mt-4 p-4 bg-gray-50 rounded-lg">
                <p className="text-sm text-gray-600">
                  <strong>当前配置:</strong> 执行Agent : 推荐Agent = {config.executorShare} : {config.referrerShare}，
                  推广Agent获得平台费的 {config.promoterShareOfPlatform}%
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

