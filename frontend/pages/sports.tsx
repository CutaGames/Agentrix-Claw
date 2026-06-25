/**
 * Sports — Agentrix 杠杆滚球预测市场（LSM）web 页面
 * - 盘口列表（2/3-way 动态赔率）
 * - 杠杆下单弹窗（预览 / 杠杆联动 / 滑点按新价重试 / 防重复提交）
 * - LP 金库（官方 + 用户自建）NAV / 利用率 / 存入
 * - AXP 不可提现披露 · 非投资建议
 */
import Head from 'next/head';
import { useCallback, useEffect, useState } from 'react';
import { Navigation } from '../components/ui/Navigation';
import { Footer } from '../components/layout/Footer';
import { Loader2, TrendingUp, Vault, Activity, Trophy } from 'lucide-react';
import {
  lsmApi,
  type LsmMarketView,
  type LsmPreview,
  type LsmVaultView,
  type LsmVaultPosition,
  type LsmLeaderboardRow,
} from '../services/lsmApi';

const LEVERAGES = [1, 2, 5, 10, 20];

function outcomeLabel(m: LsmMarketView, idx: number): string {
  if (idx === 0) return m.homeTeam;
  if (idx === 1) return m.awayTeam;
  return '平局';
}

function StatusBadge({ m }: { m: LsmMarketView }) {
  const stale = m.stale && m.status === 'live';
  const map: Record<string, { t: string; c: string }> = {
    live: { t: '滚球', c: 'bg-red-500' },
    pre: { t: '赛前', c: 'bg-blue-500' },
    suspended: { t: '暂停', c: 'bg-amber-500' },
    final: { t: '完场', c: 'bg-gray-500' },
    voided: { t: '作废', c: 'bg-gray-500' },
  };
  const s = stale ? { t: '赔率过期', c: 'bg-amber-500' } : map[m.status] || map.pre;
  return <span className={`${s.c} text-white text-xs font-bold px-2 py-0.5 rounded`}>{s.t}</span>;
}

export default function SportsPage() {
  const [tab, setTab] = useState<'markets' | 'vaults' | 'leaderboard'>('markets');
  const [markets, setMarkets] = useState<LsmMarketView[]>([]);
  const [vaults, setVaults] = useState<LsmVaultView[]>([]);
  const [positions, setPositions] = useState<LsmVaultPosition[]>([]);
  const [board, setBoard] = useState<LsmLeaderboardRow[]>([]);
  const [boardType, setBoardType] = useState<'pnl' | 'volume'>('pnl');
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);

  const [ticket, setTicket] = useState<{ market: LsmMarketView; outcomeIdx: number } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      if (tab === 'markets') setMarkets(await lsmApi.listLive());
      else if (tab === 'leaderboard') {
        const r = await lsmApi.leaderboard(boardType, 'all', 20);
        setBoard(r.items);
      } else {
        const [vs, ps] = await Promise.all([
          lsmApi.listVaults(),
          lsmApi.myPositions().catch(() => [] as LsmVaultPosition[]),
        ]);
        setVaults(vs);
        setPositions(ps);
      }
    } catch {
      /* 空态 */
    } finally {
      setLoading(false);
    }
  }, [tab, boardType]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <>
      <Head>
        <title>杠杆滚球预测市场 · Agentrix</title>
        <meta name="description" content="全球首家杠杆滚球预测市场 — Hyperliquid 式 LP 金库，AXP 积分下注。" />
      </Head>
      <Navigation />
      <main className="min-h-screen bg-[#0B1220] text-white pt-24 pb-20">
        <div className="max-w-5xl mx-auto px-4">
          <header className="mb-8">
            <h1 className="text-3xl md:text-4xl font-extrabold bg-gradient-to-r from-blue-400 to-cyan-300 bg-clip-text text-transparent">
              杠杆滚球预测市场
            </h1>
            <p className="text-gray-400 mt-2">
              实时滚球盘口 · 杠杆固定赔率 · Hyperliquid 式 LP 金库做市。下注标的为 AXP 积分（不可提现，仅站内用途）。
            </p>
          </header>

          {/* Tabs */}
          <div className="flex gap-2 mb-6">
            <button
              onClick={() => setTab('markets')}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg font-semibold ${
                tab === 'markets' ? 'bg-blue-600 text-white' : 'bg-[#1a2235] text-gray-300'
              }`}
            >
              <Activity size={16} /> 盘口
            </button>
            <button
              onClick={() => setTab('vaults')}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg font-semibold ${
                tab === 'vaults' ? 'bg-blue-600 text-white' : 'bg-[#1a2235] text-gray-300'
              }`}
            >
              <Vault size={16} /> LP 金库
            </button>
            <button
              onClick={() => setTab('leaderboard')}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg font-semibold ${
                tab === 'leaderboard' ? 'bg-blue-600 text-white' : 'bg-[#1a2235] text-gray-300'
              }`}
            >
              <Trophy size={16} /> 排行榜
            </button>
          </div>

          {loading ? (
            <div className="flex justify-center py-20">
              <Loader2 className="animate-spin text-blue-400" size={32} />
            </div>
          ) : tab === 'markets' ? (
            <div className="grid gap-4 md:grid-cols-2">
              {markets.length === 0 && <p className="text-gray-500 col-span-2 text-center py-10">暂无活跃盘口</p>}
              {markets.map((m) => (
                <div key={m.id} className="bg-[#1a2235] rounded-2xl p-5 border border-[#2a3a52]">
                  <div className="flex justify-between items-center mb-4">
                    <span className="font-bold text-lg truncate">
                      {m.homeTeam} <span className="text-gray-500">vs</span> {m.awayTeam}
                    </span>
                    <StatusBadge m={m} />
                  </div>
                  <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${m.odds.length}, 1fr)` }}>
                    {m.odds.map((o) => (
                      <button
                        key={o.outcomeIdx}
                        disabled={!m.tradable}
                        onClick={() => setTicket({ market: m, outcomeIdx: o.outcomeIdx })}
                        className="bg-[#0B1220] hover:bg-blue-600/20 disabled:opacity-50 rounded-xl py-3 border border-[#2a3a52] transition-colors"
                      >
                        <div className="text-xs text-gray-400 truncate px-1">{outcomeLabel(m, o.outcomeIdx)}</div>
                        <div className="text-xl font-extrabold text-blue-400">{o.fairOdds.toFixed(2)}</div>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : tab === 'vaults' ? (
            <div>
              <div className="flex justify-end mb-4">
                <button
                  onClick={() => setCreateOpen(true)}
                  className="bg-cyan-600 hover:bg-cyan-500 rounded-lg px-4 py-2 font-semibold text-sm"
                >
                  + 创建用户金库
                </button>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                {vaults.length === 0 && <p className="text-gray-500 col-span-2 text-center py-10">暂无金库</p>}
                {vaults.map((v) => (
                  <VaultCard
                    key={v.id}
                    vault={v}
                    position={positions.find((p) => p.vaultId === v.id) || null}
                    onChanged={load}
                  />
                ))}
              </div>
            </div>
          ) : (
            <div>
              <div className="flex gap-2 mb-4">
                <button
                  onClick={() => setBoardType('pnl')}
                  className={`px-3 py-1.5 rounded-lg text-sm font-semibold ${boardType === 'pnl' ? 'bg-blue-600' : 'bg-[#1a2235] text-gray-300'}`}
                >
                  盈利王
                </button>
                <button
                  onClick={() => setBoardType('volume')}
                  className={`px-3 py-1.5 rounded-lg text-sm font-semibold ${boardType === 'volume' ? 'bg-blue-600' : 'bg-[#1a2235] text-gray-300'}`}
                >
                  成交量王
                </button>
              </div>
              <div className="bg-[#1a2235] rounded-2xl border border-[#2a3a52] divide-y divide-[#2a3a52]">
                {board.length === 0 && <p className="text-gray-500 text-center py-10">暂无数据</p>}
                {board.map((row) => (
                  <div key={row.userId} className="flex items-center justify-between px-5 py-3">
                    <div className="flex items-center gap-3">
                      <span className={`w-7 text-center font-extrabold ${row.rank <= 3 ? 'text-amber-400' : 'text-gray-500'}`}>#{row.rank}</span>
                      <span className="font-mono text-sm text-gray-300">{row.userId.slice(0, 8)}…</span>
                      <span className="text-xs text-gray-500">{row.bets} 笔</span>
                    </div>
                    <span className={`font-extrabold ${boardType === 'pnl' ? (row.value >= 0 ? 'text-green-400' : 'text-red-400') : 'text-blue-400'}`}>
                      {boardType === 'pnl' && row.value >= 0 ? '+' : ''}{row.value} AXP
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <p className="text-xs text-gray-600 mt-10 text-center">
            AXP 为平台积分，不可提现、仅站内用途。本页内容非投资建议。稳定币升级须法务前置。
          </p>
        </div>
      </main>
      <Footer />

      {ticket && (
        <OrderModal
          market={ticket.market}
          outcomeIdx={ticket.outcomeIdx}
          onClose={() => setTicket(null)}
          onPlaced={() => setTicket(null)}
        />
      )}
      {createOpen && (
        <CreateVaultModal
          onClose={() => setCreateOpen(false)}
          onCreated={() => {
            setCreateOpen(false);
            load();
          }}
        />
      )}
    </>
  );
}

function CreateVaultModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [name, setName] = useState('');
  const [initialDeposit, setInitialDeposit] = useState('1000');
  const [profitShareBps, setProfitShareBps] = useState('1000');
  const [minLeaderShareBps, setMinLeaderShareBps] = useState('500');
  const [lockHours, setLockHours] = useState('24');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (busy) return;
    const dep = Math.floor(Number(initialDeposit) || 0);
    if (!name.trim() || dep <= 0) {
      setError('请填写名称与正整数初始出资');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await lsmApi.createUserVault({
        name: name.trim(),
        initialDeposit: dep,
        profitShareBps: Math.floor(Number(profitShareBps) || 0),
        minLeaderShareBps: Math.floor(Number(minLeaderShareBps) || 0),
        depositLockSecs: Math.floor((Number(lockHours) || 0) * 3600),
      });
      onCreated();
    } catch (e: any) {
      const msg: string = e?.response?.data?.message || e?.message || '';
      if (msg.includes('KYC_REQUIRED')) setError('需完成更高等级 KYC 才能创建金库');
      else if (msg.includes('GEO_RESTRICTED')) setError('当前地域受限，无法创建金库');
      else if (msg.includes('SYSTEM_MODE')) setError('系统维护中，暂停创建');
      else setError(msg || '创建失败');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className="bg-[#1a2235] rounded-2xl p-6 w-full max-w-md border border-[#2a3a52]" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-xl font-bold mb-1">创建用户金库</h3>
        <p className="text-gray-400 text-sm mb-4">作为主理人投入初始资金（skin-in-game），按高水位对利润计提分成。</p>

        <label className="block text-sm text-gray-400 mb-1">金库名称</label>
        <input value={name} onChange={(e) => setName(e.target.value)} className="w-full bg-[#0B1220] border border-[#2a3a52] rounded-xl px-4 py-2.5 mb-3" placeholder="如：英超滚球做市" />

        <label className="block text-sm text-gray-400 mb-1">初始出资 (AXP)</label>
        <input value={initialDeposit} onChange={(e) => setInitialDeposit(e.target.value)} inputMode="numeric" className="w-full bg-[#0B1220] border border-[#2a3a52] rounded-xl px-4 py-2.5 mb-3" />

        <div className="grid grid-cols-3 gap-2">
          <div>
            <label className="block text-xs text-gray-400 mb-1">分成 (bps≤3000)</label>
            <input value={profitShareBps} onChange={(e) => setProfitShareBps(e.target.value)} inputMode="numeric" className="w-full bg-[#0B1220] border border-[#2a3a52] rounded-xl px-3 py-2" />
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">最低自有 (bps)</label>
            <input value={minLeaderShareBps} onChange={(e) => setMinLeaderShareBps(e.target.value)} inputMode="numeric" className="w-full bg-[#0B1220] border border-[#2a3a52] rounded-xl px-3 py-2" />
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">锁定 (小时)</label>
            <input value={lockHours} onChange={(e) => setLockHours(e.target.value)} inputMode="numeric" className="w-full bg-[#0B1220] border border-[#2a3a52] rounded-xl px-3 py-2" />
          </div>
        </div>

        {error && <p className="text-red-400 text-sm mt-3">{error}</p>}
        <button onClick={submit} disabled={busy} className="w-full bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 rounded-xl py-3 font-extrabold mt-4">
          {busy ? '创建中…' : '创建金库'}
        </button>
        <p className="text-xs text-gray-600 text-center mt-3">主理人须持续维持最低自有份额；分成仅在净值创高水位时计提。</p>
      </div>
    </div>
  );
}

function VaultCard({
  vault,
  position,
  onChanged,
}: {
  vault: LsmVaultView;
  position: LsmVaultPosition | null;
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [manageOpen, setManageOpen] = useState(false);
  const isLeader = !!position?.isLeader;
  const redeemable = position ? position.shares : 0;
  const locked = position?.lockedUntil ? position.lockedUntil > Date.now() : false;

  const onDeposit = async () => {
    const txt = typeof window !== 'undefined' ? window.prompt('存入 AXP 数量') : null;
    const amt = Math.floor(Number(txt) || 0);
    if (amt <= 0) return;
    setBusy(true);
    try {
      await lsmApi.deposit(vault.id, amt);
      onChanged();
    } catch (e: any) {
      alert(e?.response?.data?.message || e?.message || '存入失败');
    } finally {
      setBusy(false);
    }
  };

  const onRedeem = async () => {
    const txt = typeof window !== 'undefined' ? window.prompt(`赎回份额（持有 ${redeemable}）`) : null;
    const shares = Math.floor(Number(txt) || 0);
    if (shares <= 0) return;
    setBusy(true);
    try {
      await lsmApi.redeem(vault.id, shares);
      onChanged();
    } catch (e: any) {
      const msg = e?.response?.data?.message || e?.message || '';
      if (msg.includes('VAULT_DEPOSIT_LOCKED')) alert('存款仍在锁定期内');
      else if (msg.includes('LEADER_MIN_SHARE')) alert('主理人须维持最低自有份额');
      else alert(msg || '赎回失败');
    } finally {
      setBusy(false);
    }
  };

  const onClose = async () => {
    if (!confirm('确认关闭金库？将停止承接新单、结清未结后按 NAV 返还全部 LP。')) return;
    setBusy(true);
    try {
      await lsmApi.closeVault(vault.id);
      onChanged();
    } catch (e: any) {
      alert(e?.response?.data?.message || e?.message || '关闭失败');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="bg-[#1a2235] rounded-2xl p-5 border border-[#2a3a52]">
      <div className="flex justify-between items-center mb-3">
        <span className="font-bold">{vault.name || (vault.kind === 'protocol' ? '官方金库' : '用户金库')}</span>
        <div className="flex items-center gap-2">
          {vault.status !== 'active' && (
            <span className="text-xs font-bold px-2 py-0.5 rounded bg-amber-600">{vault.status === 'closing' ? '清算中' : '已关闭'}</span>
          )}
          <span className={`text-xs font-bold px-2 py-0.5 rounded ${vault.kind === 'protocol' ? 'bg-purple-600' : 'bg-cyan-600'}`}>
            {vault.kind === 'protocol' ? 'HLP' : isLeader ? '主理人' : 'USER'}
          </span>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-2 mb-3 text-center">
        <Stat label="NAV" value={vault.nav.toFixed(4)} />
        <Stat label="利用率" value={`${(vault.utilizationBps / 100).toFixed(1)}%`} />
        <Stat label="本金" value={`${vault.bankroll}`} />
      </div>
      {vault.kind === 'user' && (
        <p className="text-xs text-gray-400 mb-3">
          利润分成 {(vault.profitShareBps / 100).toFixed(0)}% · 锁定 {Math.round(vault.depositLockSecs / 3600)}h · 主理人最低份额 {(vault.minLeaderShareBps / 100).toFixed(0)}%
        </p>
      )}
      {position && position.shares > 0 && (
        <p className="text-xs text-gray-300 mb-3">
          我的份额 {position.shares}（本金 {position.costBasis} AXP）{locked ? ' · 锁定中' : ''}
        </p>
      )}
      <div className="flex gap-2">
        <button
          onClick={onDeposit}
          disabled={busy || vault.status !== 'active'}
          className="flex-1 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 rounded-lg py-2.5 font-bold flex items-center justify-center gap-2"
        >
          {busy ? <Loader2 className="animate-spin" size={16} /> : <TrendingUp size={16} />} 存入
        </button>
        {redeemable > 0 && (
          <button
            onClick={onRedeem}
            disabled={busy || vault.status === 'closed'}
            className="flex-1 bg-[#0B1220] hover:bg-[#243049] border border-[#2a3a52] disabled:opacity-50 rounded-lg py-2.5 font-bold"
          >
            赎回
          </button>
        )}
      </div>
      {isLeader && vault.kind === 'user' && vault.status === 'active' && (
        <div className="flex gap-2 mt-2">
          <button onClick={() => setManageOpen(true)} className="flex-1 bg-[#0B1220] hover:bg-[#243049] border border-[#2a3a52] rounded-lg py-2 text-sm font-semibold">
            承接订阅
          </button>
          <button onClick={onClose} disabled={busy} className="flex-1 bg-red-900/40 hover:bg-red-900/60 border border-red-800 rounded-lg py-2 text-sm font-semibold text-red-300">
            关闭金库
          </button>
        </div>
      )}
      {manageOpen && (
        <SubscriptionModal vaultId={vault.id} onClose={() => setManageOpen(false)} />
      )}
    </div>
  );
}

function SubscriptionModal({ vaultId, onClose }: { vaultId: string; onClose: () => void }) {
  const [scopeType, setScopeType] = useState<'league' | 'market'>('league');
  const [scopeValue, setScopeValue] = useState('');
  const [capacity, setCapacity] = useState('10000');
  const [feeBidBps, setFeeBidBps] = useState('300');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  const submit = async () => {
    if (busy || !scopeValue.trim()) {
      setError('请填写联赛名或盘口ID');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await lsmApi.upsertSubscription({
        vaultId,
        scopeType,
        scopeValue: scopeValue.trim(),
        capacity: Math.floor(Number(capacity) || 0),
        feeBidBps: Math.floor(Number(feeBidBps) || 0),
        enabled: true,
      });
      setOk(true);
    } catch (e: any) {
      setError(e?.response?.data?.message || e?.message || '保存失败');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className="bg-[#1a2235] rounded-2xl p-6 w-full max-w-md border border-[#2a3a52]" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-xl font-bold mb-1">承接订阅</h3>
        <p className="text-gray-400 text-sm mb-4">声明本金库愿承接的联赛/盘口、容量与费率竞价（越低越优先被路由选入）。</p>
        <div className="flex gap-2 mb-3">
          <button onClick={() => setScopeType('league')} className={`flex-1 py-2 rounded-lg font-semibold ${scopeType === 'league' ? 'bg-cyan-600' : 'bg-[#0B1220] border border-[#2a3a52]'}`}>联赛</button>
          <button onClick={() => setScopeType('market')} className={`flex-1 py-2 rounded-lg font-semibold ${scopeType === 'market' ? 'bg-cyan-600' : 'bg-[#0B1220] border border-[#2a3a52]'}`}>单盘</button>
        </div>
        <input value={scopeValue} onChange={(e) => setScopeValue(e.target.value)} placeholder={scopeType === 'league' ? '联赛名（如 EPL）' : '盘口ID'} className="w-full bg-[#0B1220] border border-[#2a3a52] rounded-xl px-4 py-2.5 mb-3" />
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="block text-xs text-gray-400 mb-1">容量 (AXP)</label>
            <input value={capacity} onChange={(e) => setCapacity(e.target.value)} inputMode="numeric" className="w-full bg-[#0B1220] border border-[#2a3a52] rounded-xl px-3 py-2" />
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">费率竞价 (bps)</label>
            <input value={feeBidBps} onChange={(e) => setFeeBidBps(e.target.value)} inputMode="numeric" className="w-full bg-[#0B1220] border border-[#2a3a52] rounded-xl px-3 py-2" />
          </div>
        </div>
        {error && <p className="text-red-400 text-sm mt-3">{error}</p>}
        {ok && <p className="text-green-400 text-sm mt-3">已保存订阅</p>}
        <button onClick={submit} disabled={busy} className="w-full bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 rounded-xl py-3 font-extrabold mt-4">
          {busy ? '保存中…' : '保存订阅'}
        </button>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs text-gray-500">{label}</div>
      <div className="text-base font-extrabold">{value}</div>
    </div>
  );
}

function OrderModal({
  market,
  outcomeIdx,
  onClose,
  onPlaced,
}: {
  market: LsmMarketView;
  outcomeIdx: number;
  onClose: () => void;
  onPlaced: () => void;
}) {
  const [stake, setStake] = useState('100');
  const [leverage, setLeverage] = useState(2);
  const [preview, setPreview] = useState<LsmPreview | null>(null);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retryOdds, setRetryOdds] = useState<number | null>(null);

  const stakeNum = Math.max(0, Math.floor(Number(stake) || 0));

  useEffect(() => {
    if (stakeNum <= 0) {
      setPreview(null);
      return;
    }
    const timer = setTimeout(async () => {
      setLoading(true);
      setError(null);
      try {
        const p = await lsmApi.preview({ marketId: market.id, outcomeIdx, stake: stakeNum, leverage });
        setPreview(p);
        setRetryOdds(null);
      } catch (e: any) {
        setError(e?.response?.data?.message || '预览失败');
        setPreview(null);
      } finally {
        setLoading(false);
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [market.id, outcomeIdx, stakeNum, leverage]);

  const place = async () => {
    if (!preview || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      await lsmApi.place({
        marketId: market.id,
        outcomeIdx,
        stake: stakeNum,
        leverage,
        quotedOdds: retryOdds ?? preview.tradableOdds,
      });
      onPlaced();
    } catch (e: any) {
      const msg: string = e?.response?.data?.message || e?.message || '';
      if (msg.startsWith('SLIPPAGE_EXCEEDED')) {
        const newOdds = Number(msg.split(':')[1]);
        if (!Number.isNaN(newOdds)) {
          setRetryOdds(newOdds);
          setPreview((p) => (p ? { ...p, tradableOdds: newOdds } : p));
          setError('赔率已变动，点按新价确认');
        } else setError('赔率变动，请重试');
      } else if (msg.includes('insufficient')) setError('AXP 余额不足');
      else if (msg.includes('RISK_LIMIT')) setError('超过金库风险上限');
      else if (msg.includes('STALE')) setError('赔率过期，暂停下单');
      else setError(msg || '下单失败');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className="bg-[#1a2235] rounded-2xl p-6 w-full max-w-md border border-[#2a3a52]" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-xl font-bold">{market.homeTeam} vs {market.awayTeam}</h3>
        <p className="text-gray-400 text-sm mt-1 mb-4">看好：{outcomeLabel(market, outcomeIdx)}</p>

        <div className="flex justify-between items-center py-2">
          <span className="text-gray-400">可成交赔率</span>
          <span className="text-2xl font-extrabold text-blue-400">{preview ? preview.tradableOdds.toFixed(2) : '—'}</span>
        </div>

        <label className="block text-sm text-gray-400 mt-3 mb-1">保证金 (AXP)</label>
        <input
          value={stake}
          onChange={(e) => setStake(e.target.value)}
          inputMode="numeric"
          className="w-full bg-[#0B1220] border border-[#2a3a52] rounded-xl px-4 py-3 text-lg"
        />

        <label className="block text-sm text-gray-400 mt-4 mb-1">杠杆</label>
        <div className="flex gap-2">
          {LEVERAGES.map((l) => (
            <button
              key={l}
              onClick={() => setLeverage(l)}
              className={`flex-1 py-2.5 rounded-lg font-bold ${
                leverage === l ? 'bg-blue-600 text-white' : 'bg-[#0B1220] text-gray-300 border border-[#2a3a52]'
              }`}
            >
              {l}x
            </button>
          ))}
        </div>

        <div className="bg-[#0B1220] rounded-xl p-4 mt-4 min-h-[80px] flex items-center justify-center">
          {loading ? (
            <Loader2 className="animate-spin text-blue-400" />
          ) : preview ? (
            <div className="w-full space-y-1.5 text-sm">
              <Line label="名义敞口" value={`${preview.notional} AXP`} />
              <Line label="最大盈利" value={`+${preview.maxProfit} AXP`} color="text-green-400" />
              <Line label="最大亏损" value={`-${preview.maxLoss} AXP`} color="text-red-400" />
              <Line label="获胜派彩" value={`${preview.winPayout} AXP`} bold />
            </div>
          ) : (
            <span className="text-gray-500 text-sm">输入保证金查看预览</span>
          )}
        </div>

        {error && <p className="text-red-400 text-sm mt-3">{error}</p>}

        <button
          onClick={place}
          disabled={!preview || submitting || !market.tradable}
          className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-50 rounded-xl py-3.5 font-extrabold mt-4"
        >
          {submitting ? '提交中…' : retryOdds ? `按 ${retryOdds.toFixed(2)} 确认` : '确认下单'}
        </button>
        <p className="text-xs text-gray-600 text-center mt-3">AXP 不可提现、仅站内用途。非投资建议。</p>
      </div>
    </div>
  );
}

function Line({ label, value, color, bold }: { label: string; value: string; color?: string; bold?: boolean }) {
  return (
    <div className="flex justify-between">
      <span className="text-gray-400">{label}</span>
      <span className={`${color || 'text-white'} ${bold ? 'font-extrabold' : 'font-semibold'}`}>{value}</span>
    </div>
  );
}
