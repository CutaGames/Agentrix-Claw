import React, { useState, useEffect } from 'react';
import { useLocalization } from '../../contexts/LocalizationContext';
import { apiClient } from '../../lib/api/client';
import { useToast } from '../../contexts/ToastContext';
import { Gift, Search, CheckCircle2, ExternalLink, Loader2, AlertCircle } from 'lucide-react';

interface Airdrop {
  id: string;
  projectName: string;
  description: string;
  chain: string;
  status: string;
  estimatedAmount: number;
  currency: string;
  claimUrl: string;
  createdAt: string;
}

export function AirdropDiscovery() {
  const { t } = useLocalization();
  const { success, error: showError } = useToast();
  const [airdrops, setAirdrops] = useState<Airdrop[]>([]);
  const [loading, setLoading] = useState(true);
  const [claimingId, setClaimingId] = useState<string | null>(null);

  useEffect(() => {
    fetchAirdrops();
  }, []);

  const fetchAirdrops = async () => {
    try {
      const data = await apiClient.get<Airdrop[]>('/auto-earn/airdrops');
      if (data && Array.isArray(data)) {
        setAirdrops(data);
      }
    } catch (error) {
      console.error('Failed to fetch airdrops:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDiscover = async () => {
    try {
      setLoading(true);
      const result = await apiClient.post('/auto-earn/airdrops/discover', {});
      if (result) {
        success(t({ zh: '扫描完成，发现新的机会', en: 'Scan complete, new opportunities found' }));
        await fetchAirdrops();
      }
    } catch (error) {
      console.error('Failed to discover airdrops:', error);
      showError(t({ zh: '扫描失败', en: 'Scan failed' }));
    } finally {
      setLoading(false);
    }
  };

  const handleClaim = async (airdrop: Airdrop) => {
    if (airdrop.status !== 'eligible') {
      window.open(airdrop.claimUrl, '_blank');
      return;
    }

    try {
      setClaimingId(airdrop.id);
      const result = await apiClient.post(`/auto-earn/airdrops/${airdrop.id}/claim`, {});
      if (result) {
        success(t({ zh: '领取请求已提交', en: 'Claim request submitted' }));
        await fetchAirdrops();
      }
    } catch (error) {
      console.error('Failed to claim airdrop:', error);
      showError(t({ zh: '领取失败', en: 'Claim failed' }));
    } finally {
      setClaimingId(null);
    }
  };

  if (loading && airdrops.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-20">
        <Loader2 className="w-10 h-10 text-blue-500 animate-spin mb-4" />
        <p className="text-neutral-400">{t({ zh: '正在扫描全网空投机会...', en: 'Scanning for airdrop opportunities...' })}</p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold text-white flex items-center gap-3">
            <Gift className="text-blue-500" />
            {t({ zh: '空投发现', en: 'Airdrop Discovery' })}
          </h2>
          <p className="text-neutral-400 mt-1">
            {t({ zh: 'Agent 正在为您扫描全网高价值空投机会，支持自动交互与一键领取', en: 'Agent is scanning high-value airdrop opportunities for you' })}
          </p>
        </div>
        <button 
          onClick={handleDiscover}
          disabled={loading}
          className="px-6 py-3 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-bold rounded-xl transition-all flex items-center gap-2 shadow-lg shadow-blue-600/20"
        >
          {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Search size={20} />}
          {t({ zh: '立即扫描', en: 'Scan Now' })}
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {airdrops.length === 0 ? (
          <div className="col-span-full py-20 text-center bg-neutral-900/30 border border-dashed border-neutral-800 rounded-3xl">
            <div className="w-16 h-16 bg-neutral-800 rounded-full flex items-center justify-center mx-auto mb-4">
              <Gift className="text-neutral-600" size={32} />
            </div>
            <p className="text-neutral-500">{t({ zh: '暂无发现，请点击“立即扫描”', en: 'No opportunities found yet, click "Scan Now"' })}</p>
          </div>
        ) : (
          airdrops.map((airdrop) => (
            <div key={airdrop.id} className="bg-neutral-900/50 border border-neutral-800 hover:border-neutral-700 rounded-2xl p-6 flex flex-col transition-all group">
              <div className="flex justify-between items-start mb-4">
                <div className="w-12 h-12 bg-blue-500/10 rounded-xl flex items-center justify-center text-lg uppercase font-bold text-blue-400 border border-blue-500/20">
                  {airdrop.chain.substring(0, 2)}
                </div>
                <span className={`px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider border ${
                  airdrop.status === 'eligible' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 
                  airdrop.status === 'monitoring' ? 'bg-blue-500/10 text-blue-400 border-blue-500/20' : 
                  'bg-neutral-500/10 text-neutral-400 border-neutral-500/20'
                }`}>
                  {airdrop.status === 'eligible' ? t({ zh: '可领取', en: 'Eligible' }) : 
                   airdrop.status === 'monitoring' ? t({ zh: '监控中', en: 'Monitoring' }) : airdrop.status}
                </span>
              </div>
              
              <h3 className="text-lg font-bold text-white mb-2 group-hover:text-blue-400 transition-colors">{airdrop.projectName}</h3>
              <p className="text-sm text-neutral-400 mb-6 flex-1 line-clamp-3 leading-relaxed">{airdrop.description}</p>
              
              <div className="space-y-4">
                <div className="flex justify-between items-center pt-4 border-t border-neutral-800">
                  <div>
                    <p className="text-[10px] text-neutral-500 uppercase font-bold tracking-tight">{t({ zh: '预估价值', en: 'Est. Value' })}</p>
                    <p className="text-lg font-mono font-bold text-emerald-400">${airdrop.estimatedAmount} {airdrop.currency}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] text-neutral-500 uppercase font-bold tracking-tight">{t({ zh: '网络', en: 'Network' })}</p>
                    <p className="text-sm text-neutral-300 font-medium">{airdrop.chain}</p>
                  </div>
                </div>

                <button 
                  onClick={() => handleClaim(airdrop)}
                  disabled={claimingId === airdrop.id}
                  className={`w-full py-3 rounded-xl font-bold text-sm transition-all flex items-center justify-center gap-2 ${
                    airdrop.status === 'eligible' 
                      ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-600/20' 
                      : 'bg-neutral-800 hover:bg-neutral-700 text-neutral-300'
                  }`}
                >
                  {claimingId === airdrop.id ? <Loader2 className="w-4 h-4 animate-spin" /> : 
                   airdrop.status === 'eligible' ? <CheckCircle2 size={18} /> : <ExternalLink size={18} />}
                  {airdrop.status === 'eligible' ? t({ zh: '立即领取', en: 'Claim Now' }) : t({ zh: '查看详情', en: 'View Details' })}
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      <div className="bg-blue-600/5 border border-blue-500/10 rounded-2xl p-6 flex items-start gap-4">
        <AlertCircle className="text-blue-500 shrink-0" size={24} />
        <div>
          <h4 className="text-blue-400 font-bold mb-1">{t({ zh: '安全提示', en: 'Security Notice' })}</h4>
          <p className="text-sm text-neutral-400 leading-relaxed">
            {t({
              zh: 'Agent 会自动验证空投合约的安全性。对于标记为“可领取”的项目，您可以放心执行。对于其他项目，建议通过官方渠道进一步确认。',
              en: 'Agent automatically verifies the security of airdrop contracts. For projects marked as "Eligible", you can proceed with confidence. For others, further confirmation via official channels is recommended.',
            })}
          </p>
        </div>
      </div>
    </div>
  );
}


