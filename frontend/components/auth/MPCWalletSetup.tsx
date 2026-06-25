import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/router';
import { Wallet, Sparkles, Shield, Key, Download, Copy, Check, AlertCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { API_BASE_URL } from '../../lib/api/client';

interface MPCWalletCreationResult {
  walletAddress: string;
  encryptedShardA: string;
  encryptedShardC: string;
  recoveryHint: string;
}

interface MPCWalletSetupProps {
  userId: string;
  socialProviderId: string;
  onComplete: (wallet: MPCWalletCreationResult) => void;
  onSkip: () => void;
}

/**
 * MPC 钱包一键生成组件
 * 
 * 用于社交登录后的钱包创建流程：
 * 1. 显示创建提示
 * 2. 一键生成 MPC 钱包
 * 3. 展示恢复码并要求备份
 * 4. 存储分片 A 到 IndexedDB
 */
export function MPCWalletSetup({ userId, socialProviderId, onComplete, onSkip }: MPCWalletSetupProps) {
  const [step, setStep] = useState<'intro' | 'creating' | 'backup' | 'confirm'>('intro');
  const [wallet, setWallet] = useState<MPCWalletCreationResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [backupConfirmed, setBackupConfirmed] = useState(false);

  const createWallet = async () => {
    setStep('creating');
    setError(null);

    try {
      // 从 localStorage 获取 token
      const token = localStorage.getItem('access_token');
      
      const response = await fetch(`${API_BASE_URL}/mpc-wallet/create-for-social`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': token ? `Bearer ${token}` : '',
        },
        body: JSON.stringify({
          socialProviderId,
          chain: 'BSC',
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || 'Failed to create wallet');
      }

      const result: MPCWalletCreationResult = await response.json();
      setWallet(result);

      // 存储分片 A 到 IndexedDB（如果有）
      if (result.encryptedShardA) {
        await storeShardA(userId, result.encryptedShardA);
      }

      setStep('backup');
    } catch (err: any) {
      setError(err.message || 'Failed to create wallet');
      setStep('intro');
    }
  };

  const copyRecoveryCode = async () => {
    if (!wallet) return;
    
    try {
      await navigator.clipboard.writeText(wallet.encryptedShardC);
      setCopied(true);
      setTimeout(() => setCopied(false), 3000);
    } catch {
      // Fallback for older browsers
      const textArea = document.createElement('textarea');
      textArea.value = wallet.encryptedShardC;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
      setCopied(true);
      setTimeout(() => setCopied(false), 3000);
    }
  };

  const downloadRecoveryCode = () => {
    if (!wallet) return;
    
    const content = `Agentrix MPC Wallet Recovery Code
=====================================
Wallet Address: ${wallet.walletAddress}
Created: ${new Date().toISOString()}

Recovery Code (Keep this safe!):
${wallet.encryptedShardC}

Instructions:
1. Store this file in a secure location
2. Never share this code with anyone
3. You need this code + your device to recover your wallet
=====================================`;

    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `agentrix-wallet-recovery-${wallet.walletAddress.slice(0, 8)}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const confirmBackup = () => {
    if (backupConfirmed && wallet) {
      onComplete(wallet);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-slate-900 border border-white/10 rounded-2xl shadow-2xl max-w-md w-full overflow-hidden"
      >
        <AnimatePresence mode="wait">
          {step === 'intro' && (
            <motion.div
              key="intro"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="p-6"
            >
              {/* Header */}
              <div className="text-center mb-6">
                <div className="w-16 h-16 bg-gradient-to-br from-blue-500 to-purple-500 rounded-2xl flex items-center justify-center mx-auto mb-4">
                  <Wallet className="w-8 h-8 text-white" />
                </div>
                <h2 className="text-2xl font-bold text-white mb-2">
                  Create Your Wallet
                </h2>
                <p className="text-slate-400 text-sm">
                  Get a secure crypto wallet without seed phrases or browser extensions
                </p>
              </div>

              {/* Features */}
              <div className="space-y-3 mb-6">
                {[
                  { icon: Sparkles, text: 'No seed phrase to remember', color: 'text-yellow-400' },
                  { icon: Shield, text: 'Bank-grade MPC security', color: 'text-green-400' },
                  { icon: Key, text: 'You control your keys', color: 'text-blue-400' },
                ].map((feature, i) => (
                  <div key={i} className="flex items-center gap-3 text-sm">
                    <feature.icon className={`w-5 h-5 ${feature.color}`} />
                    <span className="text-slate-300">{feature.text}</span>
                  </div>
                ))}
              </div>

              {/* Error Display */}
              {error && (
                <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded-lg flex items-center gap-2 text-red-400 text-sm">
                  <AlertCircle className="w-4 h-4" />
                  {error}
                </div>
              )}

              {/* Actions */}
              <div className="space-y-3">
                <button
                  onClick={createWallet}
                  className="w-full py-3 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 text-white font-bold rounded-xl transition-all"
                >
                  Create Wallet
                </button>
                <button
                  onClick={onSkip}
                  className="w-full py-3 text-slate-400 hover:text-white text-sm transition-colors"
                >
                  Skip for now
                </button>
              </div>
            </motion.div>
          )}

          {step === 'creating' && (
            <motion.div
              key="creating"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="p-6 text-center"
            >
              <div className="w-16 h-16 mx-auto mb-4 relative">
                <div className="absolute inset-0 bg-blue-500/20 rounded-full animate-ping" />
                <div className="relative w-full h-full bg-gradient-to-br from-blue-500 to-purple-500 rounded-full flex items-center justify-center">
                  <Sparkles className="w-8 h-8 text-white animate-pulse" />
                </div>
              </div>
              <h2 className="text-xl font-bold text-white mb-2">
                Creating Your Wallet
              </h2>
              <p className="text-slate-400 text-sm">
                Generating secure key shards...
              </p>
            </motion.div>
          )}

          {step === 'backup' && wallet && (
            <motion.div
              key="backup"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="p-6"
            >
              {/* Success Header */}
              <div className="text-center mb-6">
                <div className="w-16 h-16 bg-green-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Check className="w-8 h-8 text-green-400" />
                </div>
                <h2 className="text-xl font-bold text-white mb-2">
                  Wallet Created!
                </h2>
                <p className="text-slate-400 text-sm break-all">
                  {wallet.walletAddress}
                </p>
              </div>

              {/* Backup Section */}
              <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-xl p-4 mb-6">
                <div className="flex items-center gap-2 text-yellow-400 mb-2">
                  <AlertCircle className="w-5 h-5" />
                  <span className="font-bold">Important: Save Your Recovery Code</span>
                </div>
                <p className="text-yellow-200/80 text-sm mb-4">
                  This code is required to recover your wallet if you lose access to this device.
                  Store it safely - we cannot recover it for you.
                </p>

                {/* Recovery Code Display */}
                <div className="bg-black/30 rounded-lg p-3 mb-3">
                  <code className="text-xs text-slate-300 break-all block max-h-20 overflow-y-auto">
                    {wallet.encryptedShardC.slice(0, 100)}...
                  </code>
                </div>

                {/* Action Buttons */}
                <div className="flex gap-2">
                  <button
                    onClick={copyRecoveryCode}
                    className="flex-1 py-2 px-3 bg-slate-700 hover:bg-slate-600 rounded-lg flex items-center justify-center gap-2 text-sm text-white transition-colors"
                  >
                    {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                    {copied ? 'Copied!' : 'Copy'}
                  </button>
                  <button
                    onClick={downloadRecoveryCode}
                    className="flex-1 py-2 px-3 bg-slate-700 hover:bg-slate-600 rounded-lg flex items-center justify-center gap-2 text-sm text-white transition-colors"
                  >
                    <Download className="w-4 h-4" />
                    Download
                  </button>
                </div>
              </div>

              {/* Confirmation Checkbox */}
              <label className="flex items-start gap-3 mb-6 cursor-pointer">
                <input
                  type="checkbox"
                  checked={backupConfirmed}
                  onChange={(e) => setBackupConfirmed(e.target.checked)}
                  className="mt-1 w-4 h-4 rounded border-slate-600 bg-slate-800 text-blue-500 focus:ring-blue-500"
                />
                <span className="text-sm text-slate-300">
                  I have saved my recovery code in a safe place and understand that
                  I will need it to recover my wallet.
                </span>
              </label>

              {/* Continue Button */}
              <button
                onClick={confirmBackup}
                disabled={!backupConfirmed}
                className="w-full py-3 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 text-white font-bold rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Continue
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
}

/**
 * 存储分片 A 到 IndexedDB
 */
async function storeShardA(userId: string, encryptedShardA: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('AgentrixMPCWallet', 1);

    request.onerror = () => reject(new Error('Failed to open IndexedDB'));

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains('shards')) {
        db.createObjectStore('shards', { keyPath: 'userId' });
      }
    };

    request.onsuccess = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      const transaction = db.transaction(['shards'], 'readwrite');
      const store = transaction.objectStore('shards');

      const putRequest = store.put({
        userId,
        encryptedShardA,
        createdAt: new Date().toISOString(),
      });

      putRequest.onsuccess = () => resolve();
      putRequest.onerror = () => reject(new Error('Failed to store shard'));
    };
  });
}

/**
 * 从 IndexedDB 获取分片 A
 */
export async function getShardA(userId: string): Promise<string | null> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('AgentrixMPCWallet', 1);

    request.onerror = () => reject(new Error('Failed to open IndexedDB'));

    request.onsuccess = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      
      if (!db.objectStoreNames.contains('shards')) {
        resolve(null);
        return;
      }

      const transaction = db.transaction(['shards'], 'readonly');
      const store = transaction.objectStore('shards');
      const getRequest = store.get(userId);

      getRequest.onsuccess = () => {
        const result = getRequest.result;
        resolve(result?.encryptedShardA || null);
      };

      getRequest.onerror = () => reject(new Error('Failed to get shard'));
    };
  });
}

/**
 * 生成客户端分片密码
 */
export function generateShardPassword(userId: string): string {
  // 使用 Web Crypto API 生成密码
  const encoder = new TextEncoder();
  const data = encoder.encode(`agentrix-mpc-${userId}`);
  
  // 简单哈希（生产环境应使用 SubtleCrypto）
  let hash = 0;
  for (let i = 0; i < data.length; i++) {
    hash = ((hash << 5) - hash) + data[i];
    hash = hash & hash;
  }
  
  return Math.abs(hash).toString(16).padStart(64, '0');
}

export default MPCWalletSetup;
