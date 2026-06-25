import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useLocalization } from '../../contexts/LocalizationContext';
import { API_BASE_URL } from '../../lib/api/client';

interface MPCWalletInfo {
  id?: string;
  walletAddress: string;
  chain: string;
  currency: string;
  isActive: boolean;
  purpose?: string;
  autoSplitAuthorized?: boolean;
  autoSplitMaxAmount?: string;
}

interface Transaction {
  id: string;
  type: 'deposit' | 'withdraw' | 'payment' | 'receive';
  amount: string;
  currency: string;
  status: 'pending' | 'completed' | 'failed';
  timestamp: Date;
  description?: string;
}

interface MPCWalletCardProps {
  compact?: boolean;
  onCreateClick?: () => void;
}

export function MPCWalletCard({ compact = false, onCreateClick }: MPCWalletCardProps) {
  const { t } = useLocalization();
  const [wallet, setWallet] = useState<MPCWalletInfo | null>(null);
  const [wallets, setWallets] = useState<MPCWalletInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [balance, setBalance] = useState<string>('--');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [activeTab, setActiveTab] = useState<'overview' | 'transactions' | 'settings'>('overview');
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [autoPayLimit, setAutoPayLimit] = useState('100');
  const [autoPayEnabled, setAutoPayEnabled] = useState(false);

  const renderCreateModal = () => {
    if (!showCreateModal) return null;
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-lg max-w-md w-full p-6">
          <h2 className="text-xl font-bold mb-4">
            {t({ zh: '创建 MPC 钱包', en: 'Create MPC Wallet' })}
          </h2>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {t({ zh: '设置支付密码', en: 'Set Payment Password' })}
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                placeholder={t({ zh: '至少6位字符', en: 'At least 6 characters' })}
                disabled={isCreating}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {t({ zh: '确认密码', en: 'Confirm Password' })}
              </label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                placeholder={t({ zh: '再次输入密码', en: 'Enter password again' })}
                disabled={isCreating}
              />
            </div>
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
              <p className="text-xs text-yellow-800">
                {t({ 
                  zh: '⚠️ 请牢记此密码，它将用于 AI Agent 自动支付授权', 
                  en: '⚠️ Remember this password, it will be used for AI Agent auto-payment authorization' 
                })}
              </p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => {
                  setShowCreateModal(false);
                  setPassword('');
                  setConfirmPassword('');
                }}
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
                disabled={isCreating}
              >
                {t({ zh: '取消', en: 'Cancel' })}
              </button>
              <button
                onClick={handleCreateWallet}
                disabled={isCreating}
                className="flex-1 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50"
              >
                {isCreating ? t({ zh: '创建中...', en: 'Creating...' }) : t({ zh: '创建', en: 'Create' })}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  };

  useEffect(() => {
    fetchWallet();
  }, []);

  const fetchWallet = async () => {
    try {
      const token = localStorage.getItem('access_token');
      if (!token) {
        setLoading(false);
        return;
      }
      
      const response = await fetch(`${API_BASE_URL}/mpc-wallet/my-wallet`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        setWallet(data);
        // TODO: Fetch actual balance from blockchain
        setBalance('0.00 USDC');
      }
    } catch (error) {
      console.error('Failed to fetch wallet:', error);
    } finally {
      setLoading(false);
    }
  };

  const shortenAddress = (address: string) => {
    if (!address) return '';
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  };

  const copyAddress = async () => {
    if (wallet?.walletAddress) {
      await navigator.clipboard.writeText(wallet.walletAddress);
    }
  };

  const handleCreateWallet = async () => {
    if (!password || password.length < 6) {
      alert(t({ zh: '密码至少需要6位字符', en: 'Password must be at least 6 characters' }));
      return;
    }
    if (password !== confirmPassword) {
      alert(t({ zh: '两次密码输入不一致', en: 'Passwords do not match' }));
      return;
    }

    setIsCreating(true);
    try {
      const token = localStorage.getItem('access_token');
      const response = await fetch(`${API_BASE_URL}/mpc-wallet/create`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ password }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to create wallet');
      }

      const data = await response.json();
      setWallet({
        walletAddress: data.walletAddress,
        chain: 'BSC',
        currency: 'USDC',
        isActive: true,
      });
      setShowCreateModal(false);
      setPassword('');
      setConfirmPassword('');
      
      // Refresh wallet info
      await fetchWallet();
    } catch (error: any) {
      alert(error.message || t({ zh: '创建失败', en: 'Failed to create wallet' }));
    } finally {
      setIsCreating(false);
    }
  };

  const handleCreateClick = () => {
    if (onCreateClick) {
      onCreateClick();
    } else {
      setShowCreateModal(true);
    }
  };

  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 animate-pulse">
        <div className="h-4 bg-gray-200 rounded w-1/3 mb-4"></div>
        <div className="h-8 bg-gray-200 rounded w-2/3 mb-2"></div>
        <div className="h-4 bg-gray-200 rounded w-1/2"></div>
      </div>
    );
  }

  if (!wallet) {
    // No wallet - show creation prompt
    return (
      <>
        {renderCreateModal()}
        
        <div className="bg-gradient-to-br from-purple-50 to-indigo-100 rounded-lg shadow-sm border border-purple-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-1">
                {t({ zh: 'MPC 钱包', en: 'MPC Wallet' })}
              </h3>
              <p className="text-sm text-gray-600">
                {t({ zh: '创建安全的 MPC 钱包来管理您的资产', en: 'Create a secure MPC wallet to manage your assets' })}
              </p>
            </div>
            <span className="text-3xl">👛</span>
          </div>
          
          <div className="bg-white/60 rounded-lg p-4 mb-4">
            <ul className="text-sm text-gray-700 space-y-2">
              <li className="flex items-center gap-2">
                <span className="text-green-500">✓</span>
                {t({ zh: '无需助记词', en: 'No mnemonic required' })}
              </li>
              <li className="flex items-center gap-2">
                <span className="text-green-500">✓</span>
                {t({ zh: '私钥分片安全存储', en: 'Secure private key sharding' })}
              </li>
              <li className="flex items-center gap-2">
                <span className="text-green-500">✓</span>
                {t({ zh: '支持 AI Agent 自动支付', en: 'Support AI Agent auto-payment' })}
              </li>
            </ul>
          </div>
          
          <button
            onClick={handleCreateClick}
            className="block w-full text-center bg-purple-600 text-white py-2.5 rounded-lg font-semibold hover:bg-purple-700 transition-colors"
          >
            {t({ zh: '创建 MPC 钱包', en: 'Create MPC Wallet' })}
          </button>
        </div>
      </>
    );
  }

  // Has wallet - show wallet info
  return (
    <React.Fragment>
      {renderCreateModal()}

      {/* Enhanced Wallet Card */}
      <div className="bg-gradient-to-br from-slate-900 to-purple-900 rounded-xl shadow-lg border border-purple-500/30 overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-white/10">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center">
                <span className="text-xl">💼</span>
              </div>
              <div>
                <h3 className="text-lg font-semibold text-white">
                  {t({ zh: 'MPC 钱包', en: 'MPC Wallet' })}
                </h3>
                <p className="text-xs text-purple-300">
                  {t({ zh: '企业级 MPC 安全钱包', en: 'Enterprise MPC Security' })}
                </p>
              </div>
            </div>
            <span className={`px-3 py-1 rounded-full text-xs font-medium ${
              wallet.isActive 
                ? 'bg-green-500/20 text-green-300 border border-green-500/30' 
                : 'bg-gray-500/20 text-gray-300 border border-gray-500/30'
            }`}>
              {wallet.isActive ? t({ zh: '已激活', en: 'Active' }) : t({ zh: '未激活', en: 'Inactive' })}
            </span>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-white/10">
          <button
            onClick={() => setActiveTab('overview')}
            className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
              activeTab === 'overview' 
                ? 'text-purple-300 border-b-2 border-purple-400 bg-white/5' 
                : 'text-gray-400 hover:text-white'
            }`}
          >
            {t({ zh: '概览', en: 'Overview' })}
          </button>
          <button
            onClick={() => setActiveTab('transactions')}
            className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
              activeTab === 'transactions' 
                ? 'text-purple-300 border-b-2 border-purple-400 bg-white/5' 
                : 'text-gray-400 hover:text-white'
            }`}
          >
            {t({ zh: '交易记录', en: 'Transactions' })}
          </button>
          <button
            onClick={() => setActiveTab('settings')}
            className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
              activeTab === 'settings' 
                ? 'text-purple-300 border-b-2 border-purple-400 bg-white/5' 
                : 'text-gray-400 hover:text-white'
            }`}
          >
            {t({ zh: '设置', en: 'Settings' })}
          </button>
        </div>

        {/* Tab Content */}
        <div className="p-6">
          {activeTab === 'overview' && (
            <div className="space-y-4">
              {/* Balance Card */}
              <div className="bg-gradient-to-r from-purple-600/30 to-pink-600/30 rounded-lg p-4 border border-purple-500/20">
                <p className="text-xs text-purple-200 mb-1">{t({ zh: '总余额', en: 'Total Balance' })}</p>
                <p className="text-2xl font-bold text-white">{balance}</p>
                <p className="text-sm text-purple-200 mt-1">≈ $0.00 USD</p>
              </div>

              {/* Address */}
              <div className="bg-white/5 rounded-lg p-4">
                <p className="text-xs text-gray-400 uppercase tracking-wide mb-2">
                  {t({ zh: '钱包地址', en: 'Wallet Address' })}
                </p>
                <div className="flex items-center gap-2">
                  <code className="text-sm font-mono text-purple-200 bg-black/30 px-3 py-2 rounded flex-1 truncate">
                    {wallet.walletAddress}
                  </code>
                  <button 
                    onClick={copyAddress}
                    className="text-purple-300 hover:text-white p-2 bg-purple-500/20 rounded-lg transition-colors"
                    title={t({ zh: '复制地址', en: 'Copy address' })}
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                    </svg>
                  </button>
                </div>
              </div>

              {/* Network & Purpose */}
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-white/5 rounded-lg p-3">
                  <p className="text-xs text-gray-400 mb-1">{t({ zh: '网络', en: 'Network' })}</p>
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-yellow-400"></span>
                    <p className="text-sm font-medium text-white">{wallet.chain || 'BSC'}</p>
                  </div>
                </div>
                <div className="bg-white/5 rounded-lg p-3">
                  <p className="text-xs text-gray-400 mb-1">{t({ zh: '用途', en: 'Purpose' })}</p>
                  <p className="text-sm font-medium text-white capitalize">{wallet.purpose || 'Execution'}</p>
                </div>
              </div>

              {/* Quick Actions */}
              <div className="grid grid-cols-3 gap-2">
                <button
                  onClick={() => window.open(`https://testnet.bscscan.com/address/${wallet?.walletAddress}`, '_blank')}
                  className="flex flex-col items-center gap-1 p-3 bg-white/5 rounded-lg hover:bg-white/10 transition-colors"
                >
                  <span className="text-xl">🔍</span>
                  <span className="text-xs text-gray-300">{t({ zh: '浏览器', en: 'Explorer' })}</span>
                </button>
                <button
                  onClick={() => setActiveTab('transactions')}
                  className="flex flex-col items-center gap-1 p-3 bg-white/5 rounded-lg hover:bg-white/10 transition-colors"
                >
                  <span className="text-xl">📜</span>
                  <span className="text-xs text-gray-300">{t({ zh: '历史', en: 'History' })}</span>
                </button>
                <button
                  onClick={() => setActiveTab('settings')}
                  className="flex flex-col items-center gap-1 p-3 bg-white/5 rounded-lg hover:bg-white/10 transition-colors"
                >
                  <span className="text-xl">⚙️</span>
                  <span className="text-xs text-gray-300">{t({ zh: '设置', en: 'Settings' })}</span>
                </button>
              </div>

              {/* AI Agent Authorization Status */}
              <div className="bg-gradient-to-r from-blue-600/20 to-cyan-600/20 rounded-lg p-4 border border-blue-500/20">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">🤖</span>
                    <div>
                      <p className="text-sm font-medium text-white">
                        {t({ zh: 'AI Agent 自动支付', en: 'AI Agent Auto-Pay' })}
                      </p>
                      <p className="text-xs text-blue-200">
                        {wallet.autoSplitAuthorized 
                          ? t({ zh: `已授权，限额 $${wallet.autoSplitMaxAmount || '100'}`, en: `Authorized, limit $${wallet.autoSplitMaxAmount || '100'}` })
                          : t({ zh: '未授权', en: 'Not Authorized' })
                        }
                      </p>
                    </div>
                  </div>
                  <span className={`w-3 h-3 rounded-full ${wallet.autoSplitAuthorized ? 'bg-green-400' : 'bg-gray-500'}`}></span>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'transactions' && (
            <div className="space-y-3">
              {transactions.length === 0 ? (
                <div className="text-center py-8">
                  <span className="text-4xl mb-3 block">📭</span>
                  <p className="text-gray-400">{t({ zh: '暂无交易记录', en: 'No transactions yet' })}</p>
                  <p className="text-sm text-gray-500 mt-1">
                    {t({ zh: '使用钱包进行支付后，交易记录将显示在这里', en: 'Transactions will appear here after you make payments' })}
                  </p>
                </div>
              ) : (
                transactions.map((tx) => (
                  <div key={tx.id} className="flex items-center justify-between p-3 bg-white/5 rounded-lg">
                    <div className="flex items-center gap-3">
                      <span className="text-xl">
                        {tx.type === 'deposit' ? '📥' : tx.type === 'withdraw' ? '📤' : tx.type === 'payment' ? '💳' : '💰'}
                      </span>
                      <div>
                        <p className="text-sm font-medium text-white">{tx.description || tx.type}</p>
                        <p className="text-xs text-gray-400">{new Date(tx.timestamp).toLocaleString()}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className={`text-sm font-medium ${tx.type === 'receive' || tx.type === 'deposit' ? 'text-green-400' : 'text-red-400'}`}>
                        {tx.type === 'receive' || tx.type === 'deposit' ? '+' : '-'}{tx.amount} {tx.currency}
                      </p>
                      <p className={`text-xs ${tx.status === 'completed' ? 'text-green-400' : tx.status === 'pending' ? 'text-yellow-400' : 'text-red-400'}`}>
                        {tx.status}
                      </p>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {activeTab === 'settings' && (
            <div className="space-y-4">
              {/* Auto-Pay Settings */}
              <div className="bg-white/5 rounded-lg p-4">
                <h4 className="text-sm font-medium text-white mb-3">
                  {t({ zh: 'AI Agent 自动支付设置', en: 'AI Agent Auto-Pay Settings' })}
                </h4>
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-300">{t({ zh: '启用自动支付', en: 'Enable Auto-Pay' })}</span>
                    <button
                      onClick={() => setAutoPayEnabled(!autoPayEnabled)}
                      className={`w-12 h-6 rounded-full transition-colors ${autoPayEnabled ? 'bg-purple-600' : 'bg-gray-600'}`}
                    >
                      <span className={`block w-5 h-5 rounded-full bg-white transform transition-transform ${autoPayEnabled ? 'translate-x-6' : 'translate-x-0.5'}`}></span>
                    </button>
                  </div>
                  <div>
                    <label className="text-sm text-gray-300 block mb-1">{t({ zh: '单笔限额 (USDC)', en: 'Per-Transaction Limit (USDC)' })}</label>
                    <input
                      type="number"
                      value={autoPayLimit}
                      onChange={(e) => setAutoPayLimit(e.target.value)}
                      className="w-full bg-black/30 border border-purple-500/30 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-purple-400"
                      disabled={!autoPayEnabled}
                    />
                  </div>
                </div>
              </div>

              {/* Security Settings */}
              <div className="bg-white/5 rounded-lg p-4">
                <h4 className="text-sm font-medium text-white mb-3">
                  {t({ zh: '安全设置', en: 'Security Settings' })}
                </h4>
                <div className="space-y-2">
                  <button className="w-full text-left px-3 py-2 text-sm text-gray-300 hover:bg-white/5 rounded-lg transition-colors flex items-center justify-between">
                    <span>{t({ zh: '修改支付密码', en: 'Change Payment Password' })}</span>
                    <span className="text-gray-500">→</span>
                  </button>
                  <button className="w-full text-left px-3 py-2 text-sm text-gray-300 hover:bg-white/5 rounded-lg transition-colors flex items-center justify-between">
                    <span>{t({ zh: '导出钱包', en: 'Export Wallet' })}</span>
                    <span className="text-gray-500">→</span>
                  </button>
                  <button className="w-full text-left px-3 py-2 text-sm text-gray-300 hover:bg-white/5 rounded-lg transition-colors flex items-center justify-between">
                    <span>{t({ zh: '授权管理', en: 'Authorization Management' })}</span>
                    <span className="text-gray-500">→</span>
                  </button>
                </div>
              </div>

              {/* Wallet Info */}
              <div className="bg-white/5 rounded-lg p-4">
                <h4 className="text-sm font-medium text-white mb-3">
                  {t({ zh: '钱包信息', en: 'Wallet Info' })}
                </h4>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-400">{t({ zh: '钱包类型', en: 'Wallet Type' })}</span>
                    <span className="text-white">MPC 2-of-3</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">{t({ zh: '网络', en: 'Network' })}</span>
                    <span className="text-white">{wallet.chain || 'BSC Testnet'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">{t({ zh: '币种', en: 'Currency' })}</span>
                    <span className="text-white">{wallet.currency || 'USDC'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">{t({ zh: '用途', en: 'Purpose' })}</span>
                    <span className="text-white capitalize">{wallet.purpose || 'Execution'}</span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </React.Fragment>
  );
}
