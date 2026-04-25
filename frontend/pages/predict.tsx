/**
 * Predict — Agentrix 杀手级"5 分钟 BTC 涨跌"预测市场
 * - 完全免费试玩（demo 余额 1000 USDC）
 * - 实时倒计时 + 当前价格 + UP/DOWN 池子比例
 * - 一键下注，自动结算
 * - Polymarket 热点事件入口
 */
import Head from 'next/head';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Navigation } from '../components/ui/Navigation';
import { Footer } from '../components/layout/Footer';
import { useUser } from '../contexts/UserContext';
import { useRouter } from 'next/router';
import {
  TrendingUp, TrendingDown, Trophy, Clock, Flame, Loader2,
  Coins, History, Zap, ExternalLink, ArrowUpRight, BarChart3,
  CheckCircle2, XCircle, Info,
} from 'lucide-react';
import {
  predictionApi,
  type PredictionRound,
  type PredictionBalance,
  type PredictionBet,
  type LeaderboardRow,
  type PolymarketEvent,
  type BetSide,
} from '../lib/api/prediction.api';

const QUICK_BETS = [10, 25, 50, 100];

function formatUsd(n: number, frac = 2) {
  if (!Number.isFinite(n)) return '—';
  return n.toLocaleString('en-US', { minimumFractionDigits: frac, maximumFractionDigits: frac });
}

function formatPrice(n: number | null) {
  if (n == null) return '—';
  return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function timeLeft(target: string): { mins: number; secs: number; total: number } {
  const t = new Date(target).getTime() - Date.now();
  const total = Math.max(0, Math.floor(t / 1000));
  return { mins: Math.floor(total / 60), secs: total % 60, total };
}

export default function PredictPage() {
  const router = useRouter();
  const { isAuthenticated } = useUser();

  const [liveRounds, setLiveRounds] = useState<PredictionRound[]>([]);
  const [recentRounds, setRecentRounds] = useState<PredictionRound[]>([]);
  const [balance, setBalance] = useState<PredictionBalance | null>(null);
  const [myBets, setMyBets] = useState<PredictionBet[]>([]);
  const [leaderboard, setLeaderboard] = useState<LeaderboardRow[]>([]);
  const [polymarket, setPolymarket] = useState<PolymarketEvent[]>([]);
  const [spotPrice, setSpotPrice] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [betting, setBetting] = useState<{ side: BetSide; amount: number } | null>(null);
  const [betAmount, setBetAmount] = useState(25);
  const [now, setNow] = useState(() => Date.now());
  const [toast, setToast] = useState<{ kind: 'success' | 'error' | 'info'; msg: string } | null>(null);

  const showToast = (kind: 'success' | 'error' | 'info', msg: string) => {
    setToast({ kind, msg });
    setTimeout(() => setToast(null), 3500);
  };

  // 拉行情 + 我的状态
  const refresh = useCallback(async () => {
    try {
      const [liveRes, recentRes, lbRes, polyRes] = await Promise.all([
        predictionApi.liveRounds('BTC', 6),
        predictionApi.recentRounds('BTC', 8),
        predictionApi.leaderboard(10),
        predictionApi.polymarketTrending(8),
      ]);
      setLiveRounds(liveRes?.items || []);
      setRecentRounds(recentRes?.items || []);
      setLeaderboard(lbRes?.items || []);
      setPolymarket(polyRes?.items || []);
    } catch (e) {
      console.error(e);
    }
    if (isAuthenticated) {
      try {
        const [bal, bets] = await Promise.all([
          predictionApi.myBalance(),
          predictionApi.myBets(20),
        ]);
        if (bal) setBalance(bal);
        setMyBets(bets?.items || []);
      } catch (e) {
        console.error(e);
      }
    }
    setLoading(false);
  }, [isAuthenticated]);

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 6000); // 6s 行情刷新
    return () => clearInterval(t);
  }, [refresh]);

  // BTC 现价（独立、客户端直拉 Binance，秒级）
  useEffect(() => {
    let cancelled = false;
    const fetchPrice = async () => {
      try {
        const r = await fetch('https://api.binance.com/api/v3/ticker/price?symbol=BTCUSDT');
        const j = await r.json();
        if (!cancelled && j?.price) setSpotPrice(parseFloat(j.price));
      } catch {
        /* ignore */
      }
    };
    fetchPrice();
    const t = setInterval(fetchPrice, 3000);
    return () => { cancelled = true; clearInterval(t); };
  }, []);

  // 倒计时 tick
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const currentRound = useMemo(() => {
    return liveRounds.find((r) => r.status === 'open') || liveRounds[0] || null;
  }, [liveRounds]);

  const lockedRound = useMemo(() => {
    return liveRounds.find((r) => r.status === 'locked') || null;
  }, [liveRounds]);

  const myBetForCurrent = useMemo(() => {
    if (!currentRound) return null;
    return myBets.find((b) => b.roundId === currentRound.id) || null;
  }, [myBets, currentRound]);

  const placeBet = async (side: BetSide) => {
    if (!isAuthenticated) {
      router.push('/auth/login?redirect=/predict');
      return;
    }
    if (!currentRound || currentRound.status !== 'open') {
      showToast('error', '当前轮次不可下注');
      return;
    }
    const amt = Math.max(1, Math.min(500, Math.floor(betAmount)));
    if (!balance || balance.balance < amt) {
      showToast('error', '余额不足');
      return;
    }
    setBetting({ side, amount: amt });
    try {
      const res = await predictionApi.placeBet({ roundId: currentRound.id, side, amount: amt });
      if (!res) throw new Error('下注失败');
      setBalance(res.balance);
      // 更新当前轮池子展示
      setLiveRounds((prev) => prev.map((r) => (r.id === res.round.id ? res.round : r)));
      // 把新 bet 加入列表
      setMyBets((prev) => [
        {
          id: res.bet.id,
          roundId: res.bet.roundId,
          side: res.bet.side,
          amount: Number(res.bet.amount),
          status: 'placed',
          outcome: 'unknown',
          payout: 0,
          createdAt: res.bet.createdAt as any,
          settledAt: null,
          round: res.round,
        },
        ...prev,
      ]);
      showToast('success', `已下注 ${amt} USDC ${side === 'up' ? '看涨 📈' : '看跌 📉'}`);
    } catch (e: any) {
      showToast('error', e?.message || '下注失败');
    } finally {
      setBetting(null);
    }
  };

  return (
    <>
      <Head>
        <title>Predict · BTC 5min — Agentrix</title>
        <meta name="description" content="5 分钟 BTC 涨跌预测，免费试玩 1000 USDC，AI Agent 也能参与。" />
      </Head>
      <Navigation />
      <main className="min-h-screen bg-slate-950 text-white">

        {/* HERO */}
        <section className="relative overflow-hidden border-b border-slate-800/60">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(245,158,11,0.18),transparent_55%)]" />
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom_right,rgba(34,197,94,0.12),transparent_55%)]" />
          <div className="container mx-auto px-6 pt-10 pb-6 relative">
            <div className="flex items-center gap-2 mb-3">
              <span className="px-2.5 py-0.5 bg-amber-500/20 border border-amber-500/40 rounded-full text-[10px] font-bold text-amber-300 uppercase tracking-wider animate-pulse">
                🔥 LIVE
              </span>
              <span className="text-xs text-slate-400">由 Agentrix Agent Economy 驱动 · 免费试玩</span>
            </div>
            <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight">
              5 分钟决定 — <span className="bg-gradient-to-r from-amber-400 via-orange-400 to-pink-400 bg-clip-text text-transparent">BTC 涨还是跌？</span>
            </h1>
            <p className="text-slate-400 mt-3 max-w-2xl">
              选边下注，5 分钟自动结算。新用户免费送 <b className="text-amber-300">1000 USDC</b> 虚拟筹码。
              赢家瓜分输方池，平台仅抽 <b>5%</b> 手续费。
            </p>
          </div>
        </section>

        {/* MAIN GRID */}
        <section className="container mx-auto px-6 py-6 grid grid-cols-1 lg:grid-cols-3 gap-6">

          {/* LEFT — 主下注卡 + 历史 */}
          <div className="lg:col-span-2 space-y-6">

            {/* 主轮次卡 */}
            <div className="relative rounded-2xl border border-slate-800 bg-gradient-to-br from-slate-900 via-slate-900 to-slate-950 p-6 overflow-hidden">
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(245,158,11,0.08),transparent_60%)] pointer-events-none" />

              {/* 顶栏：BTC 价 + 倒计时 */}
              <div className="relative flex items-center justify-between flex-wrap gap-3 mb-5">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center">
                    <span className="text-2xl">₿</span>
                  </div>
                  <div>
                    <div className="text-xs text-slate-500 uppercase tracking-wider">BTC / USDT</div>
                    <div className="text-3xl font-bold tabular-nums">{formatPrice(spotPrice)}</div>
                  </div>
                </div>
                <CountdownBadge round={currentRound} now={now} />
              </div>

              {loading ? (
                <div className="py-20 flex justify-center"><Loader2 className="animate-spin text-amber-400" /></div>
              ) : !currentRound ? (
                <div className="py-12 text-center text-slate-400">
                  <Clock className="mx-auto mb-3" />
                  正在生成下一轮...
                </div>
              ) : (
                <>
                  {/* 池子比例条 */}
                  <PoolBar round={currentRound} />

                  {/* 双按钮 */}
                  <div className="grid grid-cols-2 gap-3 mt-5">
                    <BetButton
                      side="up"
                      round={currentRound}
                      myBet={myBetForCurrent}
                      betting={betting}
                      onClick={() => placeBet('up')}
                      disabled={currentRound.status !== 'open'}
                    />
                    <BetButton
                      side="down"
                      round={currentRound}
                      myBet={myBetForCurrent}
                      betting={betting}
                      onClick={() => placeBet('down')}
                      disabled={currentRound.status !== 'open'}
                    />
                  </div>

                  {/* 金额选择 */}
                  <div className="mt-5">
                    <div className="flex items-center justify-between text-xs text-slate-400 mb-2">
                      <span>下注金额</span>
                      <span>余额：<b className="text-amber-300">{balance ? formatUsd(balance.balance) : '0.00'}</b> USDC</span>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      {QUICK_BETS.map((v) => (
                        <button key={v} onClick={() => setBetAmount(v)}
                          className={`px-3 py-1.5 rounded-lg text-sm font-semibold border transition-colors ${
                            betAmount === v
                              ? 'bg-amber-500/20 border-amber-500/60 text-amber-200'
                              : 'bg-slate-800/60 border-slate-700 text-slate-300 hover:border-slate-500'
                          }`}>
                          {v} USDC
                        </button>
                      ))}
                      <input
                        type="number"
                        min={1}
                        max={500}
                        value={betAmount}
                        onChange={(e) => setBetAmount(Math.max(1, Math.min(500, Number(e.target.value) || 0)))}
                        className="w-24 px-3 py-1.5 bg-slate-800/60 border border-slate-700 rounded-lg text-sm text-white tabular-nums focus:outline-none focus:border-amber-500/60"
                      />
                      <span className="text-xs text-slate-500">范围 1–500</span>
                    </div>
                  </div>

                  {/* 锁定中提示 */}
                  {lockedRound && lockedRound.id !== currentRound.id && (
                    <div className="mt-4 px-3 py-2 rounded-lg bg-orange-500/10 border border-orange-500/30 text-xs text-orange-200 flex items-center gap-2">
                      <Zap size={14} /> 上一轮已锁定（lock @ {formatPrice(lockedRound.lockPrice)}），即将开奖...
                    </div>
                  )}
                </>
              )}
            </div>

            {/* 最近开奖 */}
            <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-bold flex items-center gap-2"><History size={16} className="text-slate-400" /> 最近开奖</h2>
                <span className="text-xs text-slate-500">每 5 分钟一轮</span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {recentRounds.length === 0 ? (
                  <div className="col-span-full text-sm text-slate-500 py-6 text-center">暂无历史</div>
                ) : recentRounds.map((r) => (
                  <RecentRoundCard key={r.id} round={r} />
                ))}
              </div>
            </div>

            {/* 我的下注 */}
            {isAuthenticated && (
              <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
                <h2 className="font-bold mb-4 flex items-center gap-2"><Coins size={16} className="text-amber-400" /> 我的下注</h2>
                {myBets.length === 0 ? (
                  <p className="text-sm text-slate-500 py-6 text-center">还没下过单 — 上面试一把？</p>
                ) : (
                  <div className="space-y-2">
                    {myBets.slice(0, 8).map((b) => (
                      <MyBetRow key={b.id} bet={b} />
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* RIGHT — 余额 / 排行 / Polymarket */}
          <div className="space-y-6">
            <BalanceCard balance={balance} isAuthenticated={isAuthenticated} onLogin={() => router.push('/auth/login?redirect=/predict')} />

            {/* 排行榜 */}
            <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
              <h2 className="font-bold mb-3 flex items-center gap-2"><Trophy size={16} className="text-amber-400" /> 盈利榜</h2>
              {leaderboard.length === 0 ? (
                <p className="text-sm text-slate-500 py-6 text-center">暂无数据</p>
              ) : (
                <div className="space-y-1.5">
                  {leaderboard.slice(0, 8).map((r) => (
                    <div key={r.userId} className="flex items-center justify-between px-3 py-2 rounded-lg bg-slate-800/50 text-sm">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0 ${
                          r.rank === 1 ? 'bg-amber-500 text-black' : r.rank === 2 ? 'bg-slate-300 text-black' : r.rank === 3 ? 'bg-amber-700' : 'bg-slate-700'
                        }`}>{r.rank}</span>
                        <span className="text-slate-300 truncate font-mono">{r.userId.slice(0, 8)}…</span>
                      </div>
                      <div className={`font-bold tabular-nums ${r.netPnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                        {r.netPnl >= 0 ? '+' : ''}{formatUsd(r.netPnl)}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Polymarket 热点 */}
            <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
              <div className="flex items-center justify-between mb-3">
                <h2 className="font-bold flex items-center gap-2"><Flame size={16} className="text-orange-400" /> 全球热点</h2>
                <a href="https://polymarket.com" target="_blank" rel="noopener noreferrer"
                   className="text-xs text-slate-500 hover:text-white flex items-center gap-1">
                  Polymarket <ExternalLink size={11} />
                </a>
              </div>
              {polymarket.length === 0 ? (
                <p className="text-sm text-slate-500 py-6 text-center">加载中...</p>
              ) : (
                <div className="space-y-2">
                  {polymarket.slice(0, 6).map((ev) => (
                    <a key={ev.id} href={ev.url} target="_blank" rel="noopener noreferrer"
                       className="block p-3 rounded-lg bg-slate-800/50 hover:bg-slate-800 transition-colors group">
                      <div className="text-xs text-slate-200 font-medium line-clamp-2 group-hover:text-amber-300">
                        {ev.title}
                      </div>
                      <div className="flex items-center justify-between mt-2 text-[11px]">
                        <div className="flex items-center gap-2">
                          {ev.yesPrice != null && (
                            <span className="text-green-400">
                              YES {Math.round(ev.yesPrice * 100)}¢
                            </span>
                          )}
                          {ev.noPrice != null && (
                            <span className="text-red-400">
                              NO {Math.round(ev.noPrice * 100)}¢
                            </span>
                          )}
                        </div>
                        {ev.volume != null && (
                          <span className="text-slate-500">${(ev.volume / 1000).toFixed(0)}K</span>
                        )}
                      </div>
                    </a>
                  ))}
                </div>
              )}
              <div className="mt-3 pt-3 border-t border-slate-800 text-[11px] text-slate-500 leading-relaxed flex items-start gap-1.5">
                <Info size={11} className="mt-0.5 flex-shrink-0" />
                <span>Polymarket 链上预测市场（由 Polygon 上的 CTF 合约运营）。当前为只读跳转，链上下注 Phase 2 上线。</span>
              </div>
            </div>

            {/* 玩法说明 */}
            <div className="rounded-2xl border border-slate-800 bg-slate-900/30 p-5 text-sm space-y-2">
              <h3 className="font-bold flex items-center gap-2"><BarChart3 size={14} /> 怎么玩</h3>
              <ul className="text-xs text-slate-400 space-y-1.5 leading-relaxed">
                <li>· 每 5 分钟一轮，最后 1 分钟锁定不再接受下注</li>
                <li>· 锁定时记录起始价，到期采集结算价</li>
                <li>· 收盘 &gt; 起始 = UP 赢；&lt; = DOWN 赢；持平退款</li>
                <li>· 赢家按比例瓜分输方池（扣 5% 手续费）</li>
                <li>· demo 阶段使用平台虚拟 USDC，零风险</li>
              </ul>
            </div>
          </div>
        </section>

        <Footer />

        {/* Toast */}
        {toast && (
          <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 animate-in fade-in slide-in-from-bottom-4">
            <div className={`flex items-center gap-2 px-5 py-3 rounded-xl shadow-2xl border text-sm font-medium ${
              toast.kind === 'success' ? 'bg-green-500/15 border-green-500/40 text-green-200' :
              toast.kind === 'error' ? 'bg-red-500/15 border-red-500/40 text-red-200' :
              'bg-blue-500/15 border-blue-500/40 text-blue-200'
            }`}>
              {toast.kind === 'success' ? <CheckCircle2 size={16} /> : toast.kind === 'error' ? <XCircle size={16} /> : <Info size={16} />}
              {toast.msg}
            </div>
          </div>
        )}
      </main>
    </>
  );
}

// ────────────── Sub Components ──────────────

function CountdownBadge({ round, now }: { round: PredictionRound | null; now: number }) {
  if (!round) return null;
  const target = round.status === 'open' ? round.lockTime : round.expiryTime;
  const t = new Date(target).getTime() - now;
  const total = Math.max(0, Math.floor(t / 1000));
  const mins = Math.floor(total / 60);
  const secs = total % 60;
  const isOpen = round.status === 'open';
  const lowTime = total <= 30;

  return (
    <div className={`flex items-center gap-2 px-4 py-2 rounded-xl border ${
      isOpen
        ? lowTime
          ? 'bg-red-500/15 border-red-500/40 animate-pulse'
          : 'bg-amber-500/10 border-amber-500/30'
        : 'bg-orange-500/15 border-orange-500/40 animate-pulse'
    }`}>
      <Clock size={14} className={lowTime ? 'text-red-300' : 'text-amber-300'} />
      <div>
        <div className="text-[10px] uppercase tracking-wider text-slate-400">{isOpen ? '距离锁定' : '距离开奖'}</div>
        <div className="text-lg font-bold tabular-nums">
          {String(mins).padStart(2, '0')}:{String(secs).padStart(2, '0')}
        </div>
      </div>
    </div>
  );
}

function PoolBar({ round }: { round: PredictionRound }) {
  const upPct = round.upPct || 50;
  const downPct = round.downPct || 50;
  return (
    <div>
      <div className="flex items-center justify-between text-xs mb-1.5">
        <div className="flex items-center gap-1.5 text-green-400 font-semibold">
          <TrendingUp size={13} /> UP <span className="text-slate-500 font-normal">({round.upCount})</span>
        </div>
        <div className="text-slate-500 tabular-nums">池：{formatUsd(round.totalPool)} USDC</div>
        <div className="flex items-center gap-1.5 text-red-400 font-semibold">
          <span className="text-slate-500 font-normal">({round.downCount})</span> DOWN <TrendingDown size={13} />
        </div>
      </div>
      <div className="flex h-3 rounded-full overflow-hidden bg-slate-800">
        <div className="bg-gradient-to-r from-green-500 to-emerald-400 transition-all duration-500"
             style={{ width: `${upPct}%` }} />
        <div className="bg-gradient-to-r from-red-500 to-pink-500 transition-all duration-500"
             style={{ width: `${downPct}%` }} />
      </div>
      <div className="flex items-center justify-between text-[11px] mt-1 text-slate-500">
        <span>{upPct}%</span>
        <span>赔率：{round.upOdds ? `${round.upOdds.toFixed(2)}x` : '—'} / {round.downOdds ? `${round.downOdds.toFixed(2)}x` : '—'}</span>
        <span>{downPct}%</span>
      </div>
    </div>
  );
}

function BetButton({
  side, round, myBet, betting, onClick, disabled,
}: {
  side: BetSide;
  round: PredictionRound;
  myBet: PredictionBet | null;
  betting: { side: BetSide; amount: number } | null;
  onClick: () => void;
  disabled: boolean;
}) {
  const isUp = side === 'up';
  const odds = isUp ? round.upOdds : round.downOdds;
  const myThis = myBet && myBet.side === side ? myBet : null;
  const isLoading = betting?.side === side;

  return (
    <button
      onClick={onClick}
      disabled={disabled || !!betting}
      className={`relative group p-5 rounded-2xl border-2 transition-all overflow-hidden ${
        disabled
          ? 'border-slate-800 bg-slate-900/40 cursor-not-allowed opacity-60'
          : isUp
            ? 'border-green-500/50 bg-gradient-to-br from-green-500/15 via-green-500/5 to-transparent hover:border-green-400 hover:from-green-500/25 active:scale-[0.98]'
            : 'border-red-500/50 bg-gradient-to-br from-red-500/15 via-red-500/5 to-transparent hover:border-red-400 hover:from-red-500/25 active:scale-[0.98]'
      }`}
    >
      <div className="flex items-center justify-between mb-2">
        <div className={`flex items-center gap-2 font-bold text-lg ${isUp ? 'text-green-300' : 'text-red-300'}`}>
          {isUp ? <TrendingUp size={22} /> : <TrendingDown size={22} />}
          {isUp ? 'UP 看涨' : 'DOWN 看跌'}
        </div>
        {odds && (
          <div className={`text-2xl font-extrabold tabular-nums ${isUp ? 'text-green-200' : 'text-red-200'}`}>
            {odds.toFixed(2)}x
          </div>
        )}
      </div>
      <div className="text-[11px] text-slate-400 mb-1">
        池子：<b className="text-white">{formatUsd(isUp ? round.upPool : round.downPool)}</b> USDC
      </div>
      {myThis ? (
        <div className="mt-2 text-[11px] px-2 py-1 rounded bg-black/30 inline-flex items-center gap-1">
          ✓ 已下 <b className="text-amber-300">{formatUsd(myThis.amount)}</b>
        </div>
      ) : (
        <div className="text-[11px] text-slate-500">点击下注</div>
      )}
      {isLoading && (
        <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
          <Loader2 className="animate-spin" />
        </div>
      )}
    </button>
  );
}

function RecentRoundCard({ round }: { round: PredictionRound }) {
  const lock = round.lockPrice;
  const close = round.closePrice;
  const isUp = round.outcome === 'up';
  const isDown = round.outcome === 'down';
  const isTie = round.outcome === 'tie';
  const voided = round.status === 'voided';
  const delta = lock != null && close != null ? close - lock : 0;
  const deltaPct = lock != null && lock > 0 && close != null ? ((delta / lock) * 100) : 0;

  return (
    <div className={`rounded-lg border px-3 py-2.5 ${
      voided ? 'border-slate-700 bg-slate-800/30' :
      isUp ? 'border-green-500/30 bg-green-500/5' :
      isDown ? 'border-red-500/30 bg-red-500/5' :
      'border-slate-700 bg-slate-800/40'
    }`}>
      <div className="flex items-center justify-between text-[10px] text-slate-500 mb-1">
        <span>{new Date(round.expiryTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
        <span>{voided ? 'VOID' : isTie ? 'TIE' : isUp ? '↑' : '↓'}</span>
      </div>
      <div className="text-xs tabular-nums">
        <div className="text-slate-400">{formatPrice(lock)} → {formatPrice(close)}</div>
        {!voided && lock != null && close != null && (
          <div className={`text-[11px] font-semibold mt-0.5 ${delta >= 0 ? 'text-green-400' : 'text-red-400'}`}>
            {delta >= 0 ? '+' : ''}{deltaPct.toFixed(3)}%
          </div>
        )}
      </div>
    </div>
  );
}

function MyBetRow({ bet }: { bet: PredictionBet }) {
  const isUp = bet.side === 'up';
  const status = bet.status;
  const won = status === 'won';
  const lost = status === 'lost';
  const refunded = status === 'refunded';
  const placed = status === 'placed';

  return (
    <div className="flex items-center justify-between px-3 py-2 rounded-lg bg-slate-800/50 text-sm">
      <div className="flex items-center gap-2 min-w-0">
        <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${isUp ? 'bg-green-500/20 text-green-300' : 'bg-red-500/20 text-red-300'}`}>
          {isUp ? 'UP' : 'DN'}
        </span>
        <span className="text-slate-300 tabular-nums">{formatUsd(bet.amount)}</span>
        <span className="text-[11px] text-slate-500 truncate">
          {bet.round ? new Date(bet.round.expiryTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
        </span>
      </div>
      <div className="text-right">
        {placed ? (
          <span className="text-[11px] text-amber-300">进行中…</span>
        ) : refunded ? (
          <span className="text-[11px] text-slate-400">退款 {formatUsd(bet.payout)}</span>
        ) : won ? (
          <span className="text-[11px] font-bold text-green-400">+{formatUsd(bet.payout - bet.amount)}</span>
        ) : lost ? (
          <span className="text-[11px] font-bold text-red-400">-{formatUsd(bet.amount)}</span>
        ) : null}
      </div>
    </div>
  );
}

function BalanceCard({
  balance, isAuthenticated, onLogin,
}: {
  balance: PredictionBalance | null;
  isAuthenticated: boolean;
  onLogin: () => void;
}) {
  if (!isAuthenticated) {
    return (
      <div className="rounded-2xl border border-amber-500/40 bg-gradient-to-br from-amber-500/10 to-orange-500/5 p-5">
        <div className="flex items-center gap-2 mb-2">
          <Coins size={18} className="text-amber-400" />
          <h3 className="font-bold">免费送 1000 USDC</h3>
        </div>
        <p className="text-xs text-slate-400 mb-3">登录即领虚拟筹码，零风险体验。</p>
        <button onClick={onLogin}
          className="w-full px-4 py-2.5 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-black text-sm font-bold rounded-xl flex items-center justify-center gap-1.5 transition-colors">
          登录领取 <ArrowUpRight size={15} />
        </button>
      </div>
    );
  }
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
      <div className="text-xs text-slate-500 mb-1">我的余额（虚拟 USDC）</div>
      <div className="text-3xl font-extrabold tabular-nums text-amber-300">
        {balance ? formatUsd(balance.balance) : '—'}
      </div>
      {balance && (
        <>
          <div className={`text-xs mt-1 font-semibold ${balance.netPnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
            {balance.netPnl >= 0 ? '+' : ''}{formatUsd(balance.netPnl)} 净盈亏
          </div>
          <div className="grid grid-cols-3 gap-2 mt-4 pt-4 border-t border-slate-800 text-center">
            <Stat label="下单" value={balance.totalBets} />
            <Stat label="胜率" value={`${balance.winRate.toFixed(0)}%`} />
            <Stat label="最长连胜" value={balance.bestStreak} />
          </div>
        </>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div>
      <div className="text-base font-bold tabular-nums">{value}</div>
      <div className="text-[10px] text-slate-500 uppercase tracking-wider mt-0.5">{label}</div>
    </div>
  );
}
