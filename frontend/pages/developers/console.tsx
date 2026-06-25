import React, { useState, useEffect } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { 
  Key, 
  Webhook, 
  Activity, 
  Settings, 
  Plus, 
  Trash2, 
  Copy, 
  Check, 
  AlertCircle, 
  ExternalLink,
  Shield,
  Zap,
  Code,
  Terminal,
  RefreshCw,
  Eye,
  EyeOff,
  Lock,
  ArrowLeft
} from 'lucide-react';
import { webhookApi, WebhookConfig } from '../../lib/api/webhook.api';
import { formatDateTime } from '../../utils/format';
import { apiKeyApi, ApiKey } from '../../lib/api/api-key.api';

const DeveloperConsole = () => {
  const [activeTab, setActiveTab] = useState<'keys' | 'webhooks' | 'logs' | 'simulator' | 'settings'>('keys');
  const [apiKeys, setApiKeys] = useState<ApiKey[]>([]);
  const [webhooks, setWebhooks] = useState<WebhookConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  
  // Create Key Modal State
  const [showCreateKey, setShowCreateKey] = useState(false);
  const [newKeyName, setNewKeyName] = useState('');
  const [newKeyMode, setNewKeyMode] = useState<'sandbox' | 'production'>('sandbox');
  const [createdKey, setCreatedKey] = useState<{ apiKey: string; name: string } | null>(null);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [keys, hooks] = await Promise.all([
        apiKeyApi.list(),
        webhookApi.getWebhooks()
      ]);
      setApiKeys(keys);
      setWebhooks(hooks);
    } catch (err: any) {
      setError(err.message || 'Failed to load developer data');
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleCreateKey = async () => {
    try {
      const result = await apiKeyApi.create({
        name: newKeyName,
        mode: newKeyMode,
        scopes: ['read', 'write', 'payment']
      });
      setCreatedKey({ apiKey: result.apiKey, name: result.name });
      fetchData();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleDeleteKey = async (id: string) => {
    if (confirm('Are you sure you want to delete this API Key? This action cannot be undone.')) {
      try {
        await apiKeyApi.delete(id);
        fetchData();
      } catch (err: any) {
        alert(err.message);
      }
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <Head>
        <title>Professional User Console - Agentrix</title>
      </Head>

      {/* Sidebar / Navigation */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <Link href="/" className="inline-flex items-center text-gray-500 hover:text-indigo-600 mb-6 text-sm font-medium transition-colors">
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to Home
        </Link>
        <div className="flex flex-col md:flex-row gap-8">
          
          {/* Sidebar */}
          <div className="w-full md:w-64 shrink-0">
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
              <div className="p-6 border-b border-gray-50">
                <div className="flex items-center space-x-2">
                  <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center">
                    <Terminal className="w-5 h-5 text-white" />
                  </div>
                  <span className="text-lg font-bold text-gray-900">Console</span>
                </div>
              </div>
              <nav className="p-2">
                <button 
                  onClick={() => setActiveTab('keys')}
                  className={`w-full flex items-center space-x-3 px-4 py-3 rounded-xl text-sm font-medium transition-colors ${activeTab === 'keys' ? 'bg-indigo-50 text-indigo-600' : 'text-gray-500 hover:bg-gray-50'}`}
                >
                  <Key className="w-5 h-5" />
                  <span>API Keys</span>
                </button>
                <button 
                  onClick={() => setActiveTab('webhooks')}
                  className={`w-full flex items-center space-x-3 px-4 py-3 rounded-xl text-sm font-medium transition-colors ${activeTab === 'webhooks' ? 'bg-indigo-50 text-indigo-600' : 'text-gray-500 hover:bg-gray-50'}`}
                >
                  <Webhook className="w-5 h-5" />
                  <span>Webhooks</span>
                </button>
                <button 
                  onClick={() => setActiveTab('logs')}
                  className={`w-full flex items-center space-x-3 px-4 py-3 rounded-xl text-sm font-medium transition-colors ${activeTab === 'logs' ? 'bg-indigo-50 text-indigo-600' : 'text-gray-500 hover:bg-gray-50'}`}
                >
                  <Activity className="w-5 h-5" />
                  <span>Logs</span>
                </button>
                <button 
                  onClick={() => setActiveTab('simulator')}
                  className={`w-full flex items-center space-x-3 px-4 py-3 rounded-xl text-sm font-medium transition-colors ${activeTab === 'simulator' ? 'bg-indigo-50 text-indigo-600' : 'text-gray-500 hover:bg-gray-50'}`}
                >
                  <Zap className="w-5 h-5" />
                  <span>Sandbox Simulator</span>
                </button>
                <button 
                  onClick={() => setActiveTab('settings')}
                  className={`w-full flex items-center space-x-3 px-4 py-3 rounded-xl text-sm font-medium transition-colors ${activeTab === 'settings' ? 'bg-indigo-50 text-indigo-600' : 'text-gray-500 hover:bg-gray-50'}`}
                >
                  <Settings className="w-5 h-5" />
                  <span>Settings</span>
                </button>
              </nav>
            </div>

            <div className="mt-6 p-6 bg-indigo-600 rounded-2xl shadow-lg shadow-indigo-200 text-white">
              <Zap className="w-8 h-8 mb-4" />
              <h3 className="font-bold mb-2">Need Help?</h3>
              <p className="text-indigo-100 text-sm mb-4">Check our documentation for quick integration guides.</p>
              <a href="/docs" className="inline-flex items-center text-sm font-bold hover:underline">
                View Docs <ExternalLink className="w-4 h-4 ml-1" />
              </a>
            </div>
          </div>

          {/* Main Content */}
          <div className="flex-1">
            {activeTab === 'keys' && (
              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <div>
                    <h1 className="text-2xl font-bold text-gray-900">API Keys</h1>
                    <p className="text-gray-500">Manage your access keys for the Agentrix API.</p>
                  </div>
                  <button 
                    onClick={() => {
                      setCreatedKey(null);
                      setShowCreateKey(true);
                    }}
                    className="flex items-center space-x-2 px-4 py-2 bg-indigo-600 text-white rounded-xl font-semibold hover:bg-indigo-700 transition-colors"
                  >
                    <Plus className="w-5 h-5" />
                    <span>Create Key</span>
                  </button>
                </div>

                {/* Keys List */}
                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-gray-50/50 border-b border-gray-100">
                        <th className="px-6 py-4 text-xs font-bold text-gray-400 uppercase tracking-wider">Name</th>
                        <th className="px-6 py-4 text-xs font-bold text-gray-400 uppercase tracking-wider">Key</th>
                        <th className="px-6 py-4 text-xs font-bold text-gray-400 uppercase tracking-wider">Mode</th>
                        <th className="px-6 py-4 text-xs font-bold text-gray-400 uppercase tracking-wider">Status</th>
                        <th className="px-6 py-4 text-xs font-bold text-gray-400 uppercase tracking-wider">Created</th>
                        <th className="px-6 py-4 text-xs font-bold text-gray-400 uppercase tracking-wider text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {apiKeys.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="px-6 py-12 text-center text-gray-500">
                            No API Keys found. Create one to get started.
                          </td>
                        </tr>
                      ) : (
                        apiKeys.map((key) => (
                          <tr key={key.id} className="hover:bg-gray-50/50 transition-colors">
                            <td className="px-6 py-4">
                              <span className="font-semibold text-gray-900">{key.name}</span>
                            </td>
                            <td className="px-6 py-4">
                              <div className="flex items-center space-x-2">
                                <code className="bg-gray-100 px-2 py-1 rounded text-sm font-mono text-gray-600">
                                  {key.keyPrefix}
                                </code>
                                <button 
                                  onClick={() => handleCopy(key.keyPrefix, key.id)}
                                  className="text-gray-400 hover:text-indigo-600 transition-colors"
                                >
                                  {copiedId === key.id ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
                                </button>
                              </div>
                            </td>
                            <td className="px-6 py-4">
                              <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                                key.mode === 'production' ? 'bg-amber-100 text-amber-800' : 'bg-blue-100 text-blue-800'
                              }`}>
                                {key.mode.toUpperCase()}
                              </span>
                            </td>
                            <td className="px-6 py-4">
                              <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                                key.status === 'active' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                              }`}>
                                {key.status.toUpperCase()}
                              </span>
                            </td>
                            <td className="px-6 py-4 text-sm text-gray-500">
                              {formatDateTime(key.createdAt)}
                            </td>
                            <td className="px-6 py-4 text-right">
                              <button 
                                onClick={() => handleDeleteKey(key.id)}
                                className="text-gray-400 hover:text-red-600 transition-colors"
                              >
                                <Trash2 className="w-5 h-5" />
                              </button>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>

                {/* Security Tip */}
                <div className="p-4 bg-blue-50 border border-blue-100 rounded-xl flex items-start space-x-3">
                  <Shield className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
                  <div>
                    <h4 className="text-sm font-bold text-blue-900">Security Best Practices</h4>
                    <p className="text-sm text-blue-700 mt-1">
                      Never share your secret keys in client-side code or public repositories. Use environment variables to store them securely.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'webhooks' && (
              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <div>
                    <h1 className="text-2xl font-bold text-gray-900">Webhooks</h1>
                    <p className="text-gray-500">Receive real-time notifications for events in your account.</p>
                  </div>
                  <button className="flex items-center space-x-2 px-4 py-2 bg-indigo-600 text-white rounded-xl font-semibold hover:bg-indigo-700 transition-colors">
                    <Plus className="w-5 h-5" />
                    <span>Add Endpoint</span>
                  </button>
                </div>

                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8 text-center">
                  <Webhook className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                  <h3 className="text-lg font-bold text-gray-900 mb-2">No Webhooks Configured</h3>
                  <p className="text-gray-500 max-w-sm mx-auto mb-6">
                    Configure a webhook endpoint to receive automated notifications when payments are completed or failed.
                  </p>
                  <button className="inline-flex items-center space-x-2 text-indigo-600 font-bold hover:underline">
                    <span>Learn how to use webhooks</span>
                    <ExternalLink className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}

            {activeTab === 'logs' && (
              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <div>
                    <h1 className="text-2xl font-bold text-gray-900">API Logs</h1>
                    <p className="text-gray-500">Monitor your API requests and responses in real-time.</p>
                  </div>
                  <button className="flex items-center space-x-2 px-4 py-2 bg-white border border-gray-200 text-gray-700 rounded-xl font-semibold hover:bg-gray-50 transition-colors">
                    <RefreshCw className="w-4 h-4" />
                    <span>Refresh</span>
                  </button>
                </div>

                <div className="bg-gray-900 rounded-2xl shadow-xl overflow-hidden border border-gray-800">
                  <div className="p-4 border-b border-gray-800 flex items-center justify-between bg-gray-900/50">
                    <div className="flex items-center space-x-2">
                      <div className="w-3 h-3 rounded-full bg-red-500"></div>
                      <div className="w-3 h-3 rounded-full bg-amber-500"></div>
                      <div className="w-3 h-3 rounded-full bg-green-500"></div>
                    </div>
                    <span className="text-xs font-mono text-gray-500 uppercase tracking-widest">Live Stream</span>
                  </div>
                  <div className="p-6 font-mono text-sm space-y-2 overflow-y-auto max-h-[400px]">
                    <p className="text-green-400">[2025-12-21 08:45:12] POST /v1/pay-intents - 201 Created</p>
                    <p className="text-gray-400">[2025-12-21 08:45:15] GET /v1/pay-intents/pi_12345 - 200 OK</p>
                    <p className="text-amber-400">[2025-12-21 08:46:01] POST /v1/agent/execute-payment - 403 Forbidden (Insufficient Authorization)</p>
                    <p className="text-green-400">[2025-12-21 08:47:22] POST /v1/webhooks/retry/evt_9988 - 200 OK</p>
                    <p className="text-blue-400 animate-pulse">_ Waiting for new events...</p>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'simulator' && (
              <SandboxSimulator apiKeys={apiKeys} />
            )}

            {activeTab === 'settings' && (
              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <div>
                    <h1 className="text-2xl font-bold text-gray-900">Professional User Settings</h1>
                    <p className="text-gray-500">Manage your professional profile and preferences.</p>
                  </div>
                </div>

                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-12 text-center">
                  <Settings className="w-12 h-12 text-gray-200 mx-auto mb-4" />
                  <h3 className="text-lg font-bold text-gray-900 mb-2">Professional User Settings</h3>
                  <p className="text-gray-500 max-w-md mx-auto">
                    Manage your professional profile and preferences.
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Create Key Modal */}
      {showCreateKey && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-3xl shadow-2xl max-w-md w-full overflow-hidden animate-in fade-in zoom-in duration-200">
            {!createdKey ? (
              <div className="p-8">
                <h2 className="text-2xl font-bold text-gray-900 mb-2">Create API Key</h2>
                <p className="text-gray-500 mb-6">Give your key a name to identify it later.</p>
                
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-bold text-gray-700 mb-1">Key Name</label>
                    <input 
                      type="text" 
                      value={newKeyName}
                      onChange={(e) => setNewKeyName(e.target.value)}
                      placeholder="e.g. Production Website"
                      className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-bold text-gray-700 mb-1">Environment</label>
                    <div className="grid grid-cols-2 gap-3">
                      <button 
                        onClick={() => setNewKeyMode('sandbox')}
                        className={`px-4 py-3 rounded-xl border-2 font-bold transition-all ${newKeyMode === 'sandbox' ? 'border-indigo-600 bg-indigo-50 text-indigo-600' : 'border-gray-100 text-gray-400 hover:border-gray-200'}`}
                      >
                        Sandbox
                      </button>
                      <button 
                        onClick={() => setNewKeyMode('production')}
                        className={`px-4 py-3 rounded-xl border-2 font-bold transition-all ${newKeyMode === 'production' ? 'border-amber-600 bg-amber-50 text-amber-600' : 'border-gray-100 text-gray-400 hover:border-gray-200'}`}
                      >
                        Production
                      </button>
                    </div>
                  </div>
                </div>

                <div className="mt-8 flex space-x-3">
                  <button 
                    onClick={() => setShowCreateKey(false)}
                    className="flex-1 py-3 bg-gray-100 text-gray-700 rounded-xl font-bold hover:bg-gray-200 transition-colors"
                  >
                    Cancel
                  </button>
                  <button 
                    onClick={handleCreateKey}
                    disabled={!newKeyName}
                    className="flex-1 py-3 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 transition-colors disabled:opacity-50"
                  >
                    Create Key
                  </button>
                </div>
              </div>
            ) : (
              <div className="p-8">
                <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
                  <Lock className="w-8 h-8 text-green-600" />
                </div>
                <h2 className="text-2xl font-bold text-gray-900 text-center mb-2">Key Created Successfully</h2>
                <p className="text-gray-500 text-center mb-6">
                  Copy this key now. For security, we won&apos;t show it again.
                </p>

                <div className="bg-gray-50 p-4 rounded-xl border border-gray-200 mb-6">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-bold text-gray-400 uppercase">Secret Key</span>
                    <button 
                      onClick={() => handleCopy(createdKey.apiKey, 'new-key')}
                      className="text-indigo-600 text-xs font-bold hover:underline flex items-center"
                    >
                      {copiedId === 'new-key' ? <Check className="w-3 h-3 mr-1" /> : <Copy className="w-3 h-3 mr-1" />}
                      {copiedId === 'new-key' ? 'Copied!' : 'Copy Key'}
                    </button>
                  </div>
                  <code className="block break-all font-mono text-sm text-gray-800 bg-white p-3 rounded-lg border border-gray-100">
                    {createdKey.apiKey}
                  </code>
                </div>

                <div className="p-4 bg-amber-50 border border-amber-100 rounded-xl flex items-start space-x-3 mb-8">
                  <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                  <p className="text-xs text-amber-800">
                    If you lose this key, you&apos;ll need to create a new one. We do not store the original key.
                  </p>
                </div>

                <button 
                  onClick={() => {
                    setShowCreateKey(false);
                    setCreatedKey(null);
                    setNewKeyName('');
                  }}
                  className="w-full py-4 bg-gray-900 text-white rounded-xl font-bold hover:bg-black transition-colors"
                >
                  I&apos;ve saved the key
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

const SandboxSimulator = ({ apiKeys }: { apiKeys: ApiKey[] }) => {
  const [selectedKey, setSelectedKey] = useState('');
  const [amount, setAmount] = useState('10.00');
  const [currency, setCurrency] = useState('USD');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);

  const handleSimulate = async () => {
    setLoading(true);
    setResult(null);
    try {
      const res = await fetch('/api/agent/execute-payment', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': selectedKey
        },
        body: JSON.stringify({
          userId: 'test-user-id',
          agentId: 'test-agent-id',
          amount: parseFloat(amount),
          currency,
          merchantId: 'test-merchant-id',
          description: 'Sandbox Simulation Payment',
          decisionLog: {
            reason: 'User requested a simulation',
            timestamp: Date.now()
          }
        })
      });
      const data = await res.json();
      setResult(data);
    } catch (error: any) {
      setResult({ error: error.message });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8">
      <h2 className="text-xl font-bold text-gray-900 mb-6">Sandbox Simulator</h2>
      <p className="text-sm text-gray-500 mb-8">
        Test your Agentrix integration by simulating an Agent payment request.
      </p>

      <div className="space-y-6 max-w-2xl">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Select API Key</label>
          <select 
            value={selectedKey}
            onChange={(e) => setSelectedKey(e.target.value)}
            className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-indigo-500 outline-none"
          >
            <option value="">Select a key...</option>
            {apiKeys.filter(k => k.mode === 'sandbox').map(k => (
              <option key={k.id} value={k.keyPrefix}>{k.name} ({k.keyPrefix})</option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Amount</label>
            <input 
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-indigo-500 outline-none"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Currency</label>
            <select 
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
              className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-indigo-500 outline-none"
            >
              <option value="USD">USD</option>
              <option value="EUR">EUR</option>
              <option value="GBP">GBP</option>
            </select>
          </div>
        </div>

        <button 
          onClick={handleSimulate}
          disabled={loading || !selectedKey}
          className="w-full py-4 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 transition-colors disabled:opacity-50"
        >
          {loading ? 'Simulating...' : 'Execute Test Payment'}
        </button>

        {result && (
          <div className="mt-8 p-6 bg-gray-900 rounded-2xl text-indigo-300 font-mono text-sm overflow-auto max-h-96">
            <div className="flex justify-between items-center mb-4">
              <span className="text-gray-400 uppercase text-xs font-bold">Response</span>
              <span className={`px-2 py-0.5 rounded text-xs font-bold uppercase ${result.error ? 'bg-red-900 text-red-200' : 'bg-green-900 text-green-200'}`}>
                {result.error ? 'Error' : 'Success'}
              </span>
            </div>
            <pre>{JSON.stringify(result, null, 2)}</pre>
          </div>
        )}
      </div>
    </div>
  );
};

export default DeveloperConsole;
