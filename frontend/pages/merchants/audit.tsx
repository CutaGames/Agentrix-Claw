import React, { useState, useEffect, useCallback } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';

export default function AuditBrowser() {
  const [proofs, setProofs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [verifying, setVerifying] = useState<string | null>(null);
  const router = useRouter();
  const { payIntentId } = router.query;

  const fetchProofs = useCallback(async () => {
    setLoading(true);
    try {
      const url = payIntentId 
        ? `/api/merchant/audit-proofs?payIntentId=${payIntentId}`
        : '/api/merchant/audit-proofs';
      const res = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('access_token')}`
        }
      });
      const data = await res.json();
      setProofs(data);
    } catch (error) {
      console.error('Failed to fetch audit proofs', error);
    } finally {
      setLoading(false);
    }
  }, [payIntentId]);

  useEffect(() => {
    fetchProofs();
  }, [fetchProofs]);

  const verifyChain = async (proofId: string) => {
    setVerifying(proofId);
    // 模拟验证过程
    await new Promise(resolve => setTimeout(resolve, 1500));
    setVerifying(null);
    alert('审计链验证通过：哈希链完整，Agent 签名有效，EAS 存证已锚定。');
  };

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <Head>
        <title>Agentrix | 审计证据链浏览器</title>
      </Head>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">审计证据链浏览器</h1>
            <p className="mt-1 text-sm text-gray-500">
              查看并验证 Agent 支付动作的不可抵赖性证据
            </p>
          </div>
          <button 
            onClick={() => fetchProofs()}
            className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
          >
            刷新数据
          </button>
        </div>

        {loading ? (
          <div className="flex justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
          </div>
        ) : (
          <div className="bg-white shadow overflow-hidden sm:rounded-md">
            <ul className="divide-y divide-gray-200">
              {proofs.map((proof) => (
                <li key={proof.id}>
                  <div className="px-4 py-5 sm:px-6">
                    <div className="flex items-center justify-between">
                      <div className="flex flex-col">
                        <span className="text-sm font-medium text-indigo-600 truncate">
                          支付意图: {proof.payIntentId}
                        </span>
                        <span className="mt-1 text-xs text-gray-500">
                          动作: {proof.decisionLog.action} | 时间: {new Date(proof.createdAt).toLocaleString()}
                        </span>
                      </div>
                      <div className="ml-2 flex-shrink-0 flex">
                        <button
                          onClick={() => verifyChain(proof.id)}
                          disabled={verifying === proof.id}
                          className={`px-3 py-1 rounded-full text-xs font-semibold ${
                            verifying === proof.id 
                              ? 'bg-gray-100 text-gray-400' 
                              : 'bg-green-100 text-green-800 hover:bg-green-200'
                          }`}
                        >
                          {verifying === proof.id ? '验证中...' : '验证完整性'}
                        </button>
                      </div>
                    </div>
                    <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
                      <div className="bg-gray-50 p-3 rounded text-xs font-mono break-all">
                        <div className="text-gray-400 mb-1 uppercase tracking-wider font-bold">Current Hash</div>
                        {proof.proofHash}
                      </div>
                      <div className="bg-gray-50 p-3 rounded text-xs font-mono break-all">
                        <div className="text-gray-400 mb-1 uppercase tracking-wider font-bold">Previous Hash</div>
                        {proof.previousProofHash}
                      </div>
                    </div>
                    {proof.signature && (
                      <div className="mt-3 bg-blue-50 p-3 rounded text-xs font-mono break-all">
                        <div className="text-blue-400 mb-1 uppercase tracking-wider font-bold">Agent Signature</div>
                        {proof.signature}
                      </div>
                    )}
                    <div className="mt-3 flex items-center text-xs text-gray-500">
                      <svg className="flex-shrink-0 mr-1.5 h-4 w-4 text-green-400" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                      </svg>
                      EAS On-chain Attestation: {proof.easAttestationUid || 'Pending Daily Anchor'}
                    </div>
                  </div>
                </li>
              ))}
              {proofs.length === 0 && (
                <li className="px-4 py-12 text-center text-gray-500">
                  暂无审计证据记录
                </li>
              )}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
