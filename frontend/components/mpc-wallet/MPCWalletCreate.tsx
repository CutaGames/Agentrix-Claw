'use client';

import { useState } from 'react';
import { apiClient } from '../../lib/api/client';

interface CreateWalletResponse {
  walletAddress: string;
  encryptedShardA: string;
  encryptedShardC: string;
  message: string;
}

export default function MPCWalletCreate() {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<CreateWalletResponse | null>(null);
  const [shardCBackedUp, setShardCBackedUp] = useState(false);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!password || password.length < 8) {
      setError('密码长度至少 8 位');
      return;
    }

    if (password !== confirmPassword) {
      setError('两次输入的密码不一致');
      return;
    }

    setLoading(true);

    try {
      const response = await apiClient.post<CreateWalletResponse>(
        '/mpc-wallet/create',
        { password },
      );

      if (response) {
        setSuccess(response);

        // 保存分片 A 到本地存储
        localStorage.setItem('mpc_shard_a', response.encryptedShardA);

        // 提示用户备份分片 C
        alert(
          `钱包创建成功！\n\n请妥善保管以下信息：\n\n分片 C（备份）:\n${response.encryptedShardC}\n\n这是恢复钱包的唯一方式，请务必保存好！`,
        );
      }
    } catch (err: any) {
      setError(err.message || '创建钱包失败');
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="max-w-md mx-auto p-6 bg-white rounded-lg shadow-lg">
        <div className="text-center">
          <div className="text-green-500 text-4xl mb-4">✓</div>
          <h2 className="text-2xl font-bold text-gray-800 mb-2">钱包创建成功</h2>
          <p className="text-gray-600 mb-6">{success.message}</p>

          <div className="bg-gray-50 p-4 rounded-lg mb-4">
            <p className="text-sm text-gray-600 mb-2">钱包地址：</p>
            <p className="text-sm font-mono text-gray-800 break-all">
              {success.walletAddress}
            </p>
          </div>

          <div className="bg-yellow-50 border border-yellow-200 p-4 rounded-lg mb-4">
            <p className="text-sm text-yellow-800 font-semibold mb-2">
              ⚠️ 重要提示
            </p>
            <p className="text-xs text-yellow-700">
              分片 C 已显示在上方弹窗中，请务必保存好！这是恢复钱包的唯一方式。
            </p>
          </div>

          <div className="flex items-center mb-4">
            <input
              type="checkbox"
              id="backedUp"
              checked={shardCBackedUp}
              onChange={(e) => setShardCBackedUp(e.target.checked)}
              className="mr-2"
            />
            <label htmlFor="backedUp" className="text-sm text-gray-600">
              我已妥善保存分片 C
            </label>
          </div>

          <button
            onClick={() => {
              setSuccess(null);
              setPassword('');
              setConfirmPassword('');
              setShardCBackedUp(false);
            }}
            className="w-full bg-blue-500 text-white py-2 px-4 rounded-lg hover:bg-blue-600 transition"
          >
            完成
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto p-6 bg-white rounded-lg shadow-lg">
      <h2 className="text-2xl font-bold text-gray-800 mb-6">创建 MPC 钱包</h2>

      <form onSubmit={handleCreate}>
        <div className="mb-4">
          <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-2">
            设置密码
          </label>
          <input
            type="password"
            id="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white"
            placeholder="至少 8 位字符"
            required
          />
        </div>

        <div className="mb-6">
          <label
            htmlFor="confirmPassword"
            className="block text-sm font-medium text-gray-700 mb-2"
          >
            确认密码
          </label>
          <input
            type="password"
            id="confirmPassword"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white"
            placeholder="再次输入密码"
            required
          />
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-sm text-red-600">{error}</p>
          </div>
        )}

        <div className="bg-blue-50 border border-blue-200 p-4 rounded-lg mb-6">
          <p className="text-sm text-blue-800 font-semibold mb-2">💡 关于 MPC 钱包</p>
          <ul className="text-xs text-blue-700 space-y-1">
            <li>• 私钥分成 3 份，需要 2 份才能恢复</li>
            <li>• 分片 A：存储在您的设备上（加密）</li>
            <li>• 分片 B：Agentrix 服务器持有</li>
            <li>• 分片 C：您需要备份保存</li>
            <li>• 即使 Agentrix 停止服务，您也可以使用分片 A + C 恢复钱包</li>
          </ul>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-blue-500 text-white py-2 px-4 rounded-lg hover:bg-blue-600 transition disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? '创建中...' : '创建钱包'}
        </button>
      </form>
    </div>
  );
}

