/**
 * LsmCards — 对话内「赛事预测（LSM）结果卡片」可复用组件（移动端）。
 *
 * 与 OpportunityCards 同构：在主对话框（AgentChatScreen）里渲染 LSM 工具/意图产出的结构化
 * 卡片，并支持在卡内直接完成下单闭环（预览→下单）与平仓。
 *
 * 卡片类型（A 客户端意图拦截 与 B LLM 工具 tool_result 共用同一渲染层）：
 *   - markets          盘口列表（每盘含队伍/状态/赔率/隐含概率；点结果→内联下单 composer）
 *   - preview          下单预览（可成交赔率/名义/最大盈亏/派彩/强平赔率）
 *   - order_placed     下单成功回执
 *   - positions        我的持仓（OPEN 单附可兑现值 + 平仓按钮）
 *   - cashed_out       平仓回执
 *   - spending_authorized  AP2 每日额度授权回执
 *
 * 自洽：内部管理下单 composer / busy / 结果态；下单经 lsmApi.preview/place，平仓经 lsmApi.cashOut。
 * 合规：USDC=链上真实结算（测试网），AXP=免费玩积分；卡内含风险提示，非投资建议。
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Modal,
  ScrollView,
  TextInput,
  Share,
} from 'react-native';
import { colors } from '../../theme/colors';
import { useI18n } from '../../stores/i18nStore';
import {
  lsmApi,
  formatAsset,
  type LsmAsset,
  type LsmMarketView,
  type LsmOrder,
  type LsmPreview,
} from '../../services/lsm.api';

// ── 卡片数据模型（A 与 B 共用） ────────────────────────────────

export type LsmCard =
  | { kind: 'markets'; markets: LsmMarketView[] }
  | { kind: 'preview'; preview: LsmPreview; matchLabel?: string; asset?: LsmAsset }
  | {
      kind: 'order_placed';
      order: { id: string; status: string; asset?: LsmAsset; stake?: number; leverage?: number; entryOdds?: number; winPayout?: number };
    }
  | { kind: 'positions'; positions: LsmOrder[] }
  | { kind: 'cashed_out'; order: { id: string; status: string; asset?: LsmAsset; payout?: number; closePnl?: number } }
  | { kind: 'spending_authorized'; mandate: { dailyLimitUsdc?: number; validUntil?: string } };

const LEVERAGES = [1, 2, 5, 10];

function outcomeLabel(m: LsmMarketView, idx: number): string {
  if (idx === 0) return m.homeTeam;
  if (idx === 1) return m.awayTeam;
  return 'Draw';
}

function impliedPct(odds: number): string {
  if (!odds || odds <= 0) return '';
  return `${Math.round((1 / odds) * 100)}%`;
}

// ── 内联下单 composer（在对话卡内完成 preview → place） ────────

function BetComposer({
  market,
  onClose,
  onPlaced,
}: {
  market: LsmMarketView;
  onClose: () => void;
  onPlaced: (order: { id: string; status: string; asset: LsmAsset; stake: number; leverage: number; entryOdds: number; winPayout: number }) => void;
}) {
  const { t } = useI18n();
  const [asset, setAsset] = useState<LsmAsset>('USDC');
  const [outcomeIdx, setOutcomeIdx] = useState<number>(market.odds[0]?.outcomeIdx ?? 0);
  const [stakeText, setStakeText] = useState('1'); // 展示单位：USDC=1 → 100 内部；AXP=100
  const [leverage, setLeverage] = useState(2);
  const [preview, setPreview] = useState<LsmPreview | null>(null);
  const [loading, setLoading] = useState(false);
  const [placing, setPlacing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retryOdds, setRetryOdds] = useState<number | null>(null);

  // 展示金额 → 后端最小整数单位（USDC ×100；AXP ×1）。
  const stakeMinor = useMemo(() => {
    const n = Math.max(0, Number(stakeText) || 0);
    return asset === 'USDC' ? Math.round(n * 100) : Math.round(n);
  }, [stakeText, asset]);

  useEffect(() => {
    if (stakeMinor <= 0) {
      setPreview(null);
      return;
    }
    let alive = true;
    const timer = setTimeout(async () => {
      setLoading(true);
      setError(null);
      try {
        const p = await lsmApi.preview({ marketId: market.id, outcomeIdx, stake: stakeMinor, leverage, asset });
        if (alive) {
          setPreview(p);
          setRetryOdds(null);
        }
      } catch (e: any) {
        if (alive) {
          setError(t({ en: 'Preview failed', zh: '预览失败' }));
          setPreview(null);
        }
      } finally {
        if (alive) setLoading(false);
      }
    }, 250);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [market.id, outcomeIdx, stakeMinor, leverage, asset, t]);

  const place = useCallback(async () => {
    if (!preview || placing) return;
    setPlacing(true);
    setError(null);
    try {
      const res = await lsmApi.place({
        marketId: market.id,
        outcomeIdx,
        stake: stakeMinor,
        leverage,
        quotedOdds: retryOdds ?? preview.tradableOdds,
        asset,
      });
      onPlaced({
        id: res.id,
        status: res.status,
        asset,
        stake: stakeMinor,
        leverage,
        entryOdds: retryOdds ?? preview.tradableOdds,
        winPayout: (res as any).winPayout ?? preview.winPayout,
      });
    } catch (e: any) {
      const msg: string = String(e?.message || '');
      if (msg.startsWith('SLIPPAGE_EXCEEDED')) {
        const newOdds = Number(msg.split(':')[1]);
        if (!Number.isNaN(newOdds)) {
          setRetryOdds(newOdds);
          setPreview((p) => (p ? { ...p, tradableOdds: newOdds } : p));
          setError(t({ en: 'Odds moved — tap to confirm new price', zh: '赔率已变动，点按新价确认' }));
        } else setError(t({ en: 'Odds moved, retry', zh: '赔率变动，请重试' }));
      } else if (/insufficient/i.test(msg)) setError(t({ en: 'Insufficient balance', zh: `${asset} 余额不足` }));
      else if (msg.includes('RISK_LIMIT')) setError(t({ en: 'Exceeds vault risk limit', zh: '超过金库风险上限' }));
      else if (msg.includes('STALE')) setError(t({ en: 'Odds stale, paused', zh: '赔率过期，暂停下单' }));
      else setError(msg || t({ en: 'Order failed', zh: '下单失败' }));
    } finally {
      setPlacing(false);
    }
  }, [preview, placing, market.id, outcomeIdx, stakeMinor, leverage, asset, retryOdds, onPlaced, t]);

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle} numberOfLines={1}>
              {market.homeTeam} vs {market.awayTeam}
            </Text>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Text style={styles.close}>✕</Text>
            </TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={{ padding: 14, gap: 12 }}>
            {/* 资产切换 */}
            <View style={styles.rowBtns}>
              {(['AXP', 'USDC'] as LsmAsset[]).map((a) => (
                <TouchableOpacity
                  key={a}
                  style={[styles.pill, asset === a && styles.pillOn]}
                  onPress={() => setAsset(a)}
                >
                  <Text style={[styles.pillText, asset === a && styles.pillTextOn]}>{a}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* 结果选择 */}
            <Text style={styles.label}>{t({ en: 'Pick outcome', zh: '选择结果' })}</Text>
            <View style={styles.rowBtns}>
              {market.odds.map((o) => (
                <TouchableOpacity
                  key={o.outcomeIdx}
                  style={[styles.outcome, outcomeIdx === o.outcomeIdx && styles.outcomeOn]}
                  onPress={() => setOutcomeIdx(o.outcomeIdx)}
                >
                  <Text style={styles.outcomeName} numberOfLines={1}>{outcomeLabel(market, o.outcomeIdx)}</Text>
                  <Text style={styles.outcomeOdds}>{o.fairOdds.toFixed(2)}</Text>
                  <Text style={styles.outcomeImplied}>{impliedPct(o.fairOdds)}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* 保证金 */}
            <Text style={styles.label}>{t({ en: `Margin (${asset})`, zh: `保证金 (${asset})` })}</Text>
            <TextInput
              value={stakeText}
              onChangeText={setStakeText}
              keyboardType="decimal-pad"
              style={styles.input}
              placeholderTextColor={colors.textMuted}
            />

            {/* 杠杆 */}
            <Text style={styles.label}>{t({ en: 'Leverage', zh: '杠杆' })}</Text>
            <View style={styles.rowBtns}>
              {LEVERAGES.map((l) => (
                <TouchableOpacity
                  key={l}
                  style={[styles.pill, leverage === l && styles.pillOn]}
                  onPress={() => setLeverage(l)}
                >
                  <Text style={[styles.pillText, leverage === l && styles.pillTextOn]}>{l}x</Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* 预览 */}
            <View style={styles.previewBox}>
              {loading ? (
                <ActivityIndicator color={colors.accent} />
              ) : preview ? (
                <>
                  <PreviewRow label={t({ en: 'Tradable odds', zh: '可成交赔率' })} value={preview.tradableOdds.toFixed(2)} strong />
                  <PreviewRow label={t({ en: 'Notional', zh: '名义敞口' })} value={formatAsset(preview.notional, asset)} />
                  <PreviewRow label={t({ en: 'Max profit', zh: '最大盈利' })} value={`+${formatAsset(preview.maxProfit, asset)}`} good />
                  <PreviewRow label={t({ en: 'Max loss', zh: '最大亏损' })} value={`-${formatAsset(preview.maxLoss, asset)}`} bad />
                  <PreviewRow label={t({ en: 'Win payout', zh: '获胜派彩' })} value={formatAsset(preview.winPayout, asset)} strong />
                  {preview.openFee != null && preview.openFee > 0 ? (
                    <PreviewRow label={t({ en: 'Open fee', zh: '开仓费' })} value={`-${formatAsset(preview.openFee, asset)}`} />
                  ) : null}
                  {preview.liquidationOdds != null ? (
                    <PreviewRow label={t({ en: 'Liquidation odds', zh: '强平赔率' })} value={`≥ ${preview.liquidationOdds.toFixed(2)}`} />
                  ) : null}
                  <LiqBuffer tradableOdds={preview.tradableOdds} liquidationOdds={preview.liquidationOdds ?? null} zh />
                </>
              ) : (
                <Text style={styles.hint}>{t({ en: 'Enter margin to preview', zh: '输入保证金查看预览' })}</Text>
              )}
            </View>

            {error ? <Text style={styles.error}>{error}</Text> : null}

            <TouchableOpacity
              style={[styles.placeBtn, (!preview || placing || !market.tradable) && styles.placeBtnDisabled]}
              disabled={!preview || placing || !market.tradable}
              onPress={place}
            >
              {placing ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.placeBtnText}>
                  {!market.tradable
                    ? t({ en: 'Suspended', zh: '暂停交易' })
                    : retryOdds
                    ? t({ en: `Confirm @ ${retryOdds.toFixed(2)}`, zh: `按 ${retryOdds.toFixed(2)} 确认` })
                    : t({ en: 'Confirm bet', zh: '确认下单' })}
                </Text>
              )}
            </TouchableOpacity>
            <Text style={styles.disclaimer}>
              {asset === 'USDC'
                ? t({ en: 'USDC settles on-chain (testnet). Not investment advice.', zh: 'USDC 链上结算（测试网）· 非投资建议' })
                : t({ en: 'AXP is free-play points. Not investment advice.', zh: 'AXP 免费玩积分 · 非投资建议' })}
            </Text>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function PreviewRow({ label, value, strong, good, bad }: { label: string; value: string; strong?: boolean; good?: boolean; bad?: boolean }) {
  return (
    <View style={styles.pRow}>
      <Text style={styles.pLabel}>{label}</Text>
      <Text style={[styles.pValue, strong && styles.pStrong, good && styles.pGood, bad && styles.pBad]}>{value}</Text>
    </View>
  );
}

/** 强平缓冲条（对话卡内紧凑版）：赔率还能涨多少才触发强平。 */
function LiqBuffer({ tradableOdds, liquidationOdds, zh }: { tradableOdds: number; liquidationOdds: number | null; zh: boolean }) {
  if (liquidationOdds == null || !(tradableOdds > 0)) return null;
  const headroom = Math.max(0, (liquidationOdds - tradableOdds) / tradableOdds);
  const pct = Math.round(headroom * 100);
  const fill = Math.max(6, Math.min(100, pct));
  const tone = headroom > 0.5 ? '#16a34a' : headroom > 0.2 ? '#d97706' : '#dc2626';
  return (
    <View style={styles.bufWrap}>
      <View style={styles.pRow}>
        <Text style={styles.pLabel}>{zh ? `强平缓冲 · ≥${liquidationOdds.toFixed(2)}` : `Liq. buffer · ≥${liquidationOdds.toFixed(2)}`}</Text>
        <Text style={[styles.pValue, { color: tone, fontWeight: '800' }]}>+{pct}%</Text>
      </View>
      <View style={styles.bufTrack}><View style={[styles.bufFill, { width: `${fill}%`, backgroundColor: tone }]} /></View>
    </View>
  );
}

// ── 主组件 ─────────────────────────────────────────────────────

export function LsmCards({ card, onFollowUp }: { card: LsmCard; onFollowUp?: (text: string) => void }) {
  const { t } = useI18n();
  const [composerMarket, setComposerMarket] = useState<LsmMarketView | null>(null);
  const [placedNote, setPlacedNote] = useState<string | null>(null);
  const [busyCashout, setBusyCashout] = useState<string | null>(null);
  const [cashoutNote, setCashoutNote] = useState<Record<string, string>>({});

  const onCashOut = useCallback(async (orderId: string) => {
    setBusyCashout(orderId);
    try {
      const r = await lsmApi.cashOut(orderId);
      setCashoutNote((prev) => ({ ...prev, [orderId]: t({ en: `Cashed out · +${r.payout}`, zh: `已平仓 · 回款 ${r.payout}` }) }));
    } catch (e: any) {
      setCashoutNote((prev) => ({ ...prev, [orderId]: t({ en: 'Cash out failed', zh: '平仓失败' }) }));
    } finally {
      setBusyCashout(null);
    }
  }, [t]);

  /** 原生分享/晒单（app 差异化）：把下单/平仓战绩 + 深链分享到系统面板（微信/群/朋友圈等）。 */
  const shareBet = useCallback(async (message: string) => {
    try {
      await Share.share({ message: `${message}\n👉 https://polymarket.agentrix.top` });
    } catch {
      /* 用户取消/无分享面板，忽略 */
    }
  }, []);

  // ── markets ──
  if (card.kind === 'markets') {
    return (
      <View style={styles.wrap}>
        {card.markets.map((m) => (
          <View key={m.id} style={styles.card}>
            <View style={styles.mHead}>
              {m.league ? <Text style={styles.league}>{m.league}</Text> : null}
              <Text style={[styles.statusPill, m.status === 'live' ? styles.live : styles.pre]}>
                {m.status === 'live' ? 'LIVE' : m.status === 'pre' ? t({ en: 'Upcoming', zh: '未开赛' }) : m.status.toUpperCase()}
              </Text>
            </View>
            <Text style={styles.match}>
              {m.homeTeam} <Text style={styles.vs}>vs</Text> {m.awayTeam}
              {m.homeScore != null && m.awayScore != null ? <Text style={styles.score}>  {m.homeScore}:{m.awayScore}</Text> : null}
            </Text>
            <View style={styles.oddsRow}>
              {m.odds.map((o) => (
                <View key={o.outcomeIdx} style={styles.oddsChip}>
                  <Text style={styles.oddsChipLabel} numberOfLines={1}>{outcomeLabel(m, o.outcomeIdx)}</Text>
                  <Text style={styles.oddsChipVal}>{o.fairOdds.toFixed(2)}</Text>
                </View>
              ))}
            </View>
            <TouchableOpacity
              style={[styles.betBtn, !m.tradable && styles.placeBtnDisabled]}
              disabled={!m.tradable}
              onPress={() => setComposerMarket(m)}
            >
              <Text style={styles.betBtnText}>{m.tradable ? t({ en: 'Bet', zh: '下注' }) : t({ en: 'Suspended', zh: '暂停' })}</Text>
            </TouchableOpacity>
          </View>
        ))}
        {placedNote ? (
          <View style={styles.card}>
            <Text style={styles.okNote}>{placedNote}</Text>
            <TouchableOpacity
              style={styles.shareBtn}
              onPress={() => shareBet(t({ en: 'I just placed a leveraged prediction on Agentrix Predict!', zh: '我在 Agentrix Predict 下了一注杠杆预测！一起来玩⚽' }))}
            >
              <Text style={styles.shareBtnText}>📤 {t({ en: 'Share', zh: '晒单' })}</Text>
            </TouchableOpacity>
          </View>
        ) : null}
        {composerMarket ? (
          <BetComposer
            market={composerMarket}
            onClose={() => setComposerMarket(null)}
            onPlaced={(o) => {
              setComposerMarket(null);
              setPlacedNote(t({ en: `Order placed (${o.asset}) · win payout ${formatAsset(o.winPayout, o.asset)}`, zh: `下单成功（${o.asset}）· 获胜派彩 ${formatAsset(o.winPayout, o.asset)}` }));
              onFollowUp?.(t({ en: 'show my positions', zh: '查看我的持仓' }));
            }}
          />
        ) : null}
      </View>
    );
  }

  // ── positions ──
  if (card.kind === 'positions') {
    if (card.positions.length === 0) {
      return <Text style={styles.hint}>{t({ en: 'No positions yet.', zh: '暂无持仓。' })}</Text>;
    }
    return (
      <View style={styles.wrap}>
        {card.positions.map((o) => {
          const a = o.asset ?? 'AXP';
          const note = cashoutNote[o.id];
          const open = o.status === 'open';
          return (
            <View key={o.id} style={styles.card}>
              <Text style={styles.posLine}>
                <Text style={styles.posAsset}>{a}</Text> · {formatAsset(o.stake, a)} · {o.leverage}x · @{o.entryOdds.toFixed(2)}
              </Text>
              <Text style={styles.posSub}>
                {t({ en: 'Status', zh: '状态' })}: {o.status}
                {o.cashoutValue != null ? ` · ${t({ en: 'cash-out', zh: '可兑现' })} ${formatAsset(o.cashoutValue, a)}` : ''}
                {o.status !== 'open' ? ` · PnL ${formatAsset(o.closePnl, a)}` : ''}
              </Text>
              {note ? <Text style={styles.okNote}>{note}</Text> : null}
              {open && o.cashoutValue != null ? (
                <TouchableOpacity
                  style={[styles.betBtn, busyCashout === o.id && styles.placeBtnDisabled]}
                  disabled={busyCashout === o.id}
                  onPress={() => onCashOut(o.id)}
                >
                  {busyCashout === o.id ? <ActivityIndicator color="#fff" /> : <Text style={styles.betBtnText}>{t({ en: 'Cash out', zh: '提前平仓' })}</Text>}
                </TouchableOpacity>
              ) : null}
            </View>
          );
        })}
      </View>
    );
  }

  // ── preview ──
  if (card.kind === 'preview') {
    const a = card.asset ?? 'USDC';
    const p = card.preview;
    return (
      <View style={styles.wrap}>
        <View style={styles.card}>
          {card.matchLabel ? <Text style={styles.match}>{card.matchLabel}</Text> : null}
          <PreviewRow label={t({ en: 'Tradable odds', zh: '可成交赔率' })} value={p.tradableOdds.toFixed(2)} strong />
          <PreviewRow label={t({ en: 'Notional', zh: '名义敞口' })} value={formatAsset(p.notional, a)} />
          <PreviewRow label={t({ en: 'Max profit', zh: '最大盈利' })} value={`+${formatAsset(p.maxProfit, a)}`} good />
          <PreviewRow label={t({ en: 'Max loss', zh: '最大亏损' })} value={`-${formatAsset(p.maxLoss, a)}`} bad />
          <PreviewRow label={t({ en: 'Win payout', zh: '获胜派彩' })} value={formatAsset(p.winPayout, a)} strong />
          {p.openFee != null && p.openFee > 0 ? (
            <PreviewRow label={t({ en: 'Open fee', zh: '开仓费' })} value={`-${formatAsset(p.openFee, a)}`} />
          ) : null}
          {p.liquidationOdds != null ? (
            <PreviewRow label={t({ en: 'Liquidation odds', zh: '强平赔率' })} value={`≥ ${p.liquidationOdds.toFixed(2)}`} />
          ) : null}
          <LiqBuffer tradableOdds={p.tradableOdds} liquidationOdds={p.liquidationOdds ?? null} zh />
        </View>
      </View>
    );
  }

  // ── order_placed ──
  if (card.kind === 'order_placed') {
    const a = card.order.asset ?? 'USDC';
    return (
      <View style={styles.wrap}>
        <View style={[styles.card, styles.okCard]}>
          <Text style={styles.okTitle}>✓ {t({ en: 'Order placed', zh: '下单成功' })}</Text>
          <Text style={styles.posSub}>
            {a} · {card.order.stake != null ? formatAsset(card.order.stake, a) : ''} · {card.order.leverage ?? ''}x
            {card.order.entryOdds != null ? ` · @${Number(card.order.entryOdds).toFixed(2)}` : ''}
          </Text>
          {card.order.winPayout != null ? (
            <Text style={styles.posSub}>{t({ en: 'Win payout', zh: '获胜派彩' })}: {formatAsset(card.order.winPayout, a)}</Text>
          ) : null}
          <TouchableOpacity
            style={styles.shareBtn}
            onPress={() =>
              shareBet(
                t({
                  en: `I just placed a ${card.order.leverage ?? ''}x leveraged prediction on Agentrix Predict!`,
                  zh: `我在 Agentrix Predict 下了一注 ${card.order.leverage ?? ''}x 杠杆预测！一起来玩⚽`,
                }),
              )
            }
          >
            <Text style={styles.shareBtnText}>📤 {t({ en: 'Share', zh: '晒单' })}</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // ── cashed_out ──
  if (card.kind === 'cashed_out') {
    const a = card.order.asset ?? 'USDC';
    const win = (card.order.closePnl ?? 0) >= 0;
    return (
      <View style={styles.wrap}>
        <View style={[styles.card, styles.okCard]}>
          <Text style={styles.okTitle}>✓ {t({ en: 'Cashed out', zh: '已平仓' })}</Text>
          {card.order.payout != null ? <Text style={styles.posSub}>{t({ en: 'Payout', zh: '回款' })}: {formatAsset(card.order.payout, a)}</Text> : null}
          {card.order.closePnl != null ? <Text style={styles.posSub}>PnL: {formatAsset(card.order.closePnl, a)}</Text> : null}
          <TouchableOpacity
            style={styles.shareBtn}
            onPress={() =>
              shareBet(
                win
                  ? t({ en: `Closed a winning prediction on Agentrix Predict! PnL ${formatAsset(card.order.closePnl ?? 0, a)}`, zh: `刚在 Agentrix Predict 盈利平仓！PnL ${formatAsset(card.order.closePnl ?? 0, a)} 🎉` })
                  : t({ en: 'Trading predictions on Agentrix Predict.', zh: '在 Agentrix Predict 玩杠杆预测⚽' }),
              )
            }
          >
            <Text style={styles.shareBtnText}>📤 {t({ en: 'Share', zh: '晒单' })}</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // ── spending_authorized ──
  if (card.kind === 'spending_authorized') {
    return (
      <View style={styles.wrap}>
        <View style={[styles.card, styles.okCard]}>
          <Text style={styles.okTitle}>✓ {t({ en: 'Spending authorized', zh: '已授权自动下注额度' })}</Text>
          {card.mandate.dailyLimitUsdc != null ? (
            <Text style={styles.posSub}>{t({ en: 'Daily limit', zh: '每日额度' })}: {card.mandate.dailyLimitUsdc} USDC</Text>
          ) : null}
        </View>
      </View>
    );
  }

  return null;
}

const styles = StyleSheet.create({
  wrap: { gap: 8, marginTop: 4 },
  card: { backgroundColor: colors.bgCard, borderRadius: 12, borderWidth: 1, borderColor: colors.border, padding: 12, gap: 6 },
  mHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  league: { fontSize: 10, fontWeight: '700', color: colors.textSecondary },
  statusPill: { fontSize: 10, fontWeight: '800', borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2, overflow: 'hidden', color: '#fff' },
  live: { backgroundColor: '#dc2626' },
  pre: { backgroundColor: '#6366f1' },
  match: { color: colors.textPrimary, fontSize: 15, fontWeight: '800' },
  vs: { color: colors.textMuted, fontWeight: '600' },
  score: { color: colors.accent, fontWeight: '900' },
  oddsRow: { flexDirection: 'row', gap: 6, marginTop: 2 },
  oddsChip: { flex: 1, backgroundColor: colors.bgPrimary, borderRadius: 8, paddingVertical: 6, alignItems: 'center' },
  oddsChipLabel: { fontSize: 10, color: colors.textSecondary, maxWidth: '100%' },
  oddsChipVal: { fontSize: 15, fontWeight: '900', color: colors.textPrimary },
  betBtn: { backgroundColor: colors.accent, borderRadius: 10, paddingVertical: 10, alignItems: 'center', marginTop: 4 },
  betBtnText: { color: '#fff', fontSize: 13, fontWeight: '800' },
  okNote: { color: '#16a34a', fontSize: 12, fontWeight: '700' },
  posLine: { color: colors.textPrimary, fontSize: 14, fontWeight: '700' },
  posAsset: { color: colors.accent, fontWeight: '900' },
  posSub: { color: colors.textSecondary, fontSize: 12 },
  okCard: { borderColor: '#16a34a55' },
  okTitle: { color: '#16a34a', fontSize: 14, fontWeight: '800' },
  shareBtn: { marginTop: 8, alignSelf: 'flex-start', borderWidth: 1, borderColor: colors.border, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8 },
  shareBtnText: { color: colors.textPrimary, fontSize: 13, fontWeight: '700' },
  hint: { color: colors.textMuted, fontSize: 12, marginTop: 4 },
  // composer
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: colors.bgPrimary, borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '90%' },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: colors.border },
  sheetTitle: { flex: 1, color: colors.textPrimary, fontSize: 16, fontWeight: '800' },
  close: { color: colors.textSecondary, fontSize: 18, fontWeight: '800', marginLeft: 12 },
  label: { color: colors.textSecondary, fontSize: 12, fontWeight: '700' },
  rowBtns: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  pill: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.bgCard },
  pillOn: { backgroundColor: colors.accent, borderColor: colors.accent },
  pillText: { color: colors.textPrimary, fontSize: 13, fontWeight: '700' },
  pillTextOn: { color: '#fff' },
  outcome: { flex: 1, borderRadius: 10, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.bgCard, paddingVertical: 8, alignItems: 'center' },
  outcomeOn: { borderColor: colors.accent, backgroundColor: colors.accent + '22' },
  outcomeName: { fontSize: 11, color: colors.textSecondary, maxWidth: '100%' },
  outcomeOdds: { fontSize: 16, fontWeight: '900', color: colors.textPrimary },
  outcomeImplied: { fontSize: 10, color: colors.textMuted },
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, color: colors.textPrimary, backgroundColor: colors.bgCard, fontSize: 16 },
  previewBox: { borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 12, backgroundColor: colors.bgCard, gap: 4, minHeight: 60, justifyContent: 'center' },
  pRow: { flexDirection: 'row', justifyContent: 'space-between' },
  pLabel: { color: colors.textSecondary, fontSize: 13 },
  pValue: { color: colors.textPrimary, fontSize: 13, fontWeight: '700' },
  pStrong: { fontWeight: '900' },
  pGood: { color: '#16a34a' },
  pBad: { color: '#dc2626' },
  bufWrap: { marginTop: 6, gap: 4 },
  bufTrack: { height: 5, borderRadius: 3, backgroundColor: colors.border, overflow: 'hidden' },
  bufFill: { height: '100%', borderRadius: 3 },
  error: { color: '#dc2626', fontSize: 12, fontWeight: '700' },
  placeBtn: { backgroundColor: colors.accent, borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  placeBtnDisabled: { opacity: 0.5 },
  placeBtnText: { color: '#fff', fontSize: 15, fontWeight: '900' },
  disclaimer: { color: colors.textMuted, fontSize: 11, textAlign: 'center' },
});

export default LsmCards;
