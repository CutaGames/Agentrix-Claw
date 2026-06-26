// 赛事预测段（后端模块 LSM，前端展示「赛事预测」）— 集市内入口
// 三页签：盘口(markets，含世界杯 Hero + 分组列表) / 我的持仓(orders，含实时现值+平仓) / 金库(vaults)
import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  SectionList,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  StyleSheet,
  Alert,
  Modal,
  TextInput,
  ScrollView,
  Image,
} from 'react-native';
import { colors } from '../theme/colors';
import { useI18n } from '../stores/i18nStore';
import { useNavigation } from '@react-navigation/native';
import { WORLDCUP_COVER_IMG } from '../constants/posterAssets';
import { teamFlagUrl } from '../utils/teamFlags';
import {
  lsmApi,
  LsmMarketView,
  LsmOrder,
  LsmVaultView,
  LsmVaultPosition,
} from '../services/lsm.api';
import { OrderTicket } from '../components/lsm/OrderTicket';
import { WorldCupHero, pickFeaturedMarket } from '../components/lsm/WorldCupHero';

/** 赛事列表分组：live → pre（含暂停）→ settled（完场/作废）。 */
type MarketGroupKey = 'live' | 'pre' | 'settled';

function groupMarkets(
  markets: LsmMarketView[],
  zh: boolean,
): Array<{ key: MarketGroupKey; title: string; data: LsmMarketView[] }> {
  const live: LsmMarketView[] = [];
  const pre: LsmMarketView[] = [];
  const settled: LsmMarketView[] = [];
  for (const m of markets) {
    if (m.status === 'live') live.push(m);
    else if (m.status === 'pre' || m.status === 'suspended') pre.push(m);
    else settled.push(m); // final / voided
  }
  // pre：按开赛时间升序
  pre.sort((a, b) => (a.kickoffAt ?? Number.MAX_SAFE_INTEGER) - (b.kickoffAt ?? Number.MAX_SAFE_INTEGER));
  const sections: Array<{ key: MarketGroupKey; title: string; data: LsmMarketView[] }> = [];
  if (live.length) sections.push({ key: 'live', title: zh ? '滚球进行中' : 'Live', data: live });
  if (pre.length) sections.push({ key: 'pre', title: zh ? '赛前' : 'Upcoming', data: pre });
  if (settled.length) sections.push({ key: 'settled', title: zh ? '已结束' : 'Settled', data: settled });
  return sections;
}

type Tab = 'markets' | 'orders' | 'vaults';

export default function LeverageSportsMarketScreen() {
  const { language } = useI18n();
  const zh = language === 'zh';
  const tr = (en: string, z: string) => (zh ? z : en);
  const navigation = useNavigation<any>();

  // 分享世界杯主题海报（每场都可分享，含图片 + 赔率 + 二维码深链）。
  const onShareMatch = useCallback(
    (m: LsmMarketView) => {
      const lbls = [m.homeTeam, m.awayTeam, zh ? '平局' : 'Draw'];
      const oddsStr = m.odds
        .map((o) => `${lbls[o.outcomeIdx]} ${o.fairOdds.toFixed(2)}`)
        .join('  ·  ');
      const score =
        m.homeScore != null && m.awayScore != null ? `${m.homeScore} : ${m.awayScore}` : '';
      const statusZh =
        m.status === 'live' ? '滚球进行中' : m.status === 'pre' ? '即将开赛' : m.status === 'final' ? '完场' : '';
      try {
        navigation.navigate('ShareCard', {
          shareUrl: `https://agentrix.top/sports?m=${encodeURIComponent(m.id)}`,
          title: `${m.homeTeam} vs ${m.awayTeam}`,
          subtitle: m.league || (zh ? '世界杯滚球预测' : 'World Cup Live Predictions'),
          headerEmoji: '🏆',
          imageUrl: WORLDCUP_COVER_IMG,
          categoryLabel: zh ? '世界杯' : 'World Cup',
          priceLabel: score || undefined,
          statsLabel: oddsStr,
          description: zh
            ? `${statusZh}${score ? '  比分 ' + score : ''} · 在 Agentrix 用 AXP 杠杆预测，扫码即玩。`
            : `${m.status.toUpperCase()}${score ? '  ' + score : ''} · Leverage-predict with AXP on Agentrix. Scan to play.`,
          tags: ['WorldCup', 'Agentrix', m.sport || 'soccer'],
          ctaLabel: zh ? '扫码下注' : 'Scan to predict',
          accentFrom: '#7c3aed',
          accentTo: '#1d4ed8',
          leftImageUrl: teamFlagUrl(m.homeTeam) || undefined,
          rightImageUrl: teamFlagUrl(m.awayTeam) || undefined,
        });
      } catch {
        /* navigation unavailable */
      }
    },
    [navigation, zh],
  );

  const [tab, setTab] = useState<Tab>('markets');
  const [markets, setMarkets] = useState<LsmMarketView[]>([]);
  const [orders, setOrders] = useState<LsmOrder[]>([]);
  const [vaults, setVaults] = useState<LsmVaultView[]>([]);
  const [positions, setPositions] = useState<LsmVaultPosition[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);

  const [ticketMarket, setTicketMarket] = useState<LsmMarketView | null>(null);
  const [ticketOutcome, setTicketOutcome] = useState(0);
  const [cashingOutId, setCashingOutId] = useState<string | null>(null);
  // 持仓详情（点击单子打开）+ 订单关联盘口（展示队名/赔率）
  const [detailOrder, setDetailOrder] = useState<LsmOrder | null>(null);
  const [orderMarkets, setOrderMarkets] = useState<Record<string, LsmMarketView>>({});
  // 金额输入弹窗（跨平台，替代仅 iOS 的 Alert.prompt）
  const [amountPrompt, setAmountPrompt] = useState<{
    title: string;
    message: string;
    initial: string;
    onSubmit: (n: number) => void;
  } | null>(null);

  const askAmount = useCallback(
    (title: string, message: string, onSubmit: (n: number) => void, initial = '') => {
      setAmountPrompt({ title, message, initial, onSubmit });
    },
    [],
  );

  const load = useCallback(async () => {
    setLoading(true);
    try {
      if (tab === 'markets') {
        // 合并活跃（赛前+滚球）与最近已结束，使列表含「已结束 + 比分」分组（参考 KMarket 排列）
        const [live, recent] = await Promise.all([
          lsmApi.listLive(),
          lsmApi.listRecent(30).catch(() => [] as LsmMarketView[]),
        ]);
        const seen = new Set(live.map((m) => m.id));
        setMarkets([...live, ...recent.filter((m) => !seen.has(m.id))]);
      } else if (tab === 'orders') {
        const list = await lsmApi.myOrders();
        setOrders(list);
        // 拉取订单关联盘口（队名/联赛/赔率），用于持仓卡与详情的专业信息展示
        const ids = Array.from(new Set(list.map((o) => o.marketId)));
        const missing = ids.filter((id) => !orderMarkets[id]);
        if (missing.length) {
          const fetched = await Promise.all(
            missing.map((id) => lsmApi.getMarket(id).catch(() => null)),
          );
          const map: Record<string, LsmMarketView> = {};
          fetched.forEach((m) => { if (m) map[m.id] = m; });
          if (Object.keys(map).length) setOrderMarkets((prev) => ({ ...prev, ...map }));
        }
      } else {
        const [vs, ps] = await Promise.all([
          lsmApi.listVaults(),
          lsmApi.myPositions().catch(() => [] as LsmVaultPosition[]),
        ]);
        setVaults(vs);
        setPositions(ps);
      }
    } catch (e) {
      // 静默；列表为空时展示空态
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [tab]);

  useEffect(() => {
    load();
  }, [load]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    load();
  }, [load]);

  const openTicket = (m: LsmMarketView, idx: number) => {
    if (!m.tradable) {
      Alert.alert(tr('Unavailable', '不可下单'), tr('Odds stale or market suspended', '赔率过期或盘口暂停'));
      return;
    }
    setTicketMarket(m);
    setTicketOutcome(idx);
  };

  // 平仓（cash-out）：二次确认 → lsmApi.cashOut → 成功后刷新持仓
  const handleCashOut = useCallback(
    (order: LsmOrder) => {
      if (order.status !== 'open') return;
      if (order.cashoutValue == null) {
        Alert.alert(
          tr('Cash out unavailable', '暂不可平仓'),
          tr('Odds stale or market suspended', '赔率过期或盘口暂停，暂不可平仓'),
        );
        return;
      }
      const pnl = order.cashoutValue - order.stake;
      Alert.alert(
        tr('Cash out now?', '确认平仓？'),
        tr(
          `Settle this position at current price for ${order.cashoutValue} AXP (PnL ${pnl >= 0 ? '+' : ''}${pnl}).`,
          `按当前可成交赔率提前兑现：到账 ${order.cashoutValue} AXP（盈亏 ${pnl >= 0 ? '+' : ''}${pnl}）。`,
        ),
        [
          { text: tr('Cancel', '取消'), style: 'cancel' },
          {
            text: tr('Confirm', '确认平仓'),
            style: 'default',
            onPress: async () => {
              setCashingOutId(order.id);
              try {
                const r = await lsmApi.cashOut(order.id);
                Alert.alert(
                  tr('Cashed out', '已平仓'),
                  tr(
                    `Credited ${r.cashoutValue} AXP (PnL ${r.closePnl >= 0 ? '+' : ''}${r.closePnl}).`,
                    `已到账 ${r.cashoutValue} AXP（盈亏 ${r.closePnl >= 0 ? '+' : ''}${r.closePnl}）。`,
                  ),
                );
                load();
              } catch (e: any) {
                Alert.alert(tr('Failed', '失败'), mapErr(e, tr));
              } finally {
                setCashingOutId(null);
              }
            },
          },
        ],
      );
    },
    [load, tr],
  );

  const handleDeposit = (v: LsmVaultView) => {
    askAmount(
      tr('Deposit AXP', '存入 AXP'),
      tr('Amount of AXP to deposit', '存入的 AXP 数量'),
      async (amt) => {
        if (amt <= 0) return;
        try {
          await lsmApi.deposit(v.id, amt);
          Alert.alert(tr('Done', '完成'), tr('Deposited', '已存入'));
          load();
        } catch (e: any) {
          Alert.alert(tr('Failed', '失败'), mapErr(e, tr));
        }
      },
      '1000',
    );
  };

  const handleRedeem = (v: LsmVaultView, pos: LsmVaultPosition) => {
    askAmount(
      tr('Redeem shares', '赎回份额'),
      tr(`Shares to redeem (held ${pos.shares})`, `赎回份额（持有 ${pos.shares}）`),
      async (shares) => {
        if (shares <= 0) return;
        try {
          await lsmApi.redeem(v.id, shares);
          Alert.alert(tr('Done', '完成'), tr('Redeemed', '已赎回'));
          load();
        } catch (e: any) {
          Alert.alert(tr('Failed', '失败'), mapErr(e, tr));
        }
      },
      String(pos.shares || ''),
    );
  };

  const handleClose = (v: LsmVaultView) => {
    Alert.alert(
      tr('Close vault', '关闭金库'),
      tr(
        'Stop underwriting, settle open orders, then return all LPs at NAV?',
        '停止承接新单、结清未结后按 NAV 返还全部 LP？',
      ),
      [
        { text: tr('Cancel', '取消'), style: 'cancel' },
        {
          text: tr('Confirm', '确认'),
          style: 'destructive',
          onPress: async () => {
            try {
              await lsmApi.closeVault(v.id);
              load();
            } catch (e: any) {
              Alert.alert(tr('Failed', '失败'), mapErr(e, tr));
            }
          },
        },
      ],
    );
  };

  return (
    <View style={styles.container}>
      {/* Tabs */}
      <View style={styles.tabBar}>
        {(['markets', 'orders', 'vaults'] as Tab[]).map((tk) => (
          <TouchableOpacity
            key={tk}
            style={[styles.tab, tab === tk && styles.tabActive]}
            onPress={() => setTab(tk)}
          >
            <Text style={[styles.tabText, tab === tk && styles.tabTextActive]}>
              {tk === 'markets' ? tr('Markets', '盘口') : tk === 'orders' ? tr('My Bets', '我的持仓') : tr('Vaults', '金库')}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading && !refreshing ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={colors.primary} />
      ) : tab === 'markets' ? (
        <SectionList
          sections={groupMarkets(markets, zh)}
          keyExtractor={(m) => m.id}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          contentContainerStyle={styles.list}
          stickySectionHeadersEnabled={false}
          ListHeaderComponent={
            <WorldCupHero market={pickFeaturedMarket(markets)} zh={zh} onPick={openTicket} onShare={onShareMatch} />
          }
          ListEmptyComponent={
            <Empty
              text={tr('No live markets', '暂无活跃盘口')}
              hint={tr('Odds feed is connecting, check back soon.', '赔率源接入中，请稍后再来')}
            />
          }
          renderSectionHeader={({ section }) => (
            <Text style={styles.sectionHeader}>{section.title}</Text>
          )}
          renderItem={({ item }) => (
            <MarketCard market={item} zh={zh} onPick={openTicket} onShare={onShareMatch} />
          )}
        />
      ) : tab === 'orders' ? (
        <FlatList
          data={orders}
          keyExtractor={(o) => o.id}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          contentContainerStyle={styles.list}
          ListEmptyComponent={<Empty text={tr('No bets yet', '暂无持仓')} />}
          renderItem={({ item }) => (
            <OrderCard
              order={item}
              market={orderMarkets[item.marketId] || null}
              zh={zh}
              tr={tr}
              onCashOut={handleCashOut}
              onOpen={() => setDetailOrder(item)}
              cashingOut={cashingOutId === item.id}
            />
          )}
        />
      ) : (
        <FlatList
          data={vaults}
          keyExtractor={(v) => v.id}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          contentContainerStyle={styles.list}
          ListHeaderComponent={
            <View>
              <View style={styles.vaultIntro}>
                <Text style={styles.vaultIntroText}>
                  {tr(
                    'Official vault: no profit share, underwrites all matches. User vault: leader takes fixed 10%, picks matches.',
                    '官方公共金库：无利润分成、承接所有比赛。用户自建金库：主理人固定抽 10%、自选承接比赛。',
                  )}
                </Text>
              </View>
              <TouchableOpacity style={styles.createBtn} onPress={() => setCreateOpen(true)}>
                <Text style={styles.createBtnText}>+ {tr('Create User Vault', '创建用户金库')}</Text>
              </TouchableOpacity>
            </View>
          }
          ListEmptyComponent={<Empty text={tr('No vaults', '暂无金库')} />}
          renderItem={({ item }) => (
            <VaultCard
              vault={item}
              position={positions.find((p) => p.vaultId === item.id) || null}
              tr={tr}
              onDeposit={handleDeposit}
              onRedeem={handleRedeem}
              onClose={handleClose}
            />
          )}
        />
      )}

      <CreateVaultModal
        visible={createOpen}
        tr={tr}
        onClose={() => setCreateOpen(false)}
        onCreated={() => {
          setCreateOpen(false);
          load();
        }}
      />

      <OrderTicket
        visible={!!ticketMarket}
        market={ticketMarket}
        outcomeIdx={ticketOutcome}
        onClose={() => setTicketMarket(null)}
        onPlaced={() => {
          setTicketMarket(null);
          if (tab === 'orders') load();
        }}
      />

      <AmountPromptModal prompt={amountPrompt} tr={tr} onClose={() => setAmountPrompt(null)} />

      <PositionDetailSheet
        order={detailOrder}
        market={detailOrder ? orderMarkets[detailOrder.marketId] || null : null}
        zh={zh}
        tr={tr}
        onClose={() => setDetailOrder(null)}
        onCashOut={(o) => { setDetailOrder(null); handleCashOut(o); }}
        cashingOut={!!detailOrder && cashingOutId === detailOrder.id}
      />
    </View>
  );
}

function formatKickoff(ts: number, zh: boolean): string {
  const d = new Date(ts);
  const s = d.toLocaleString(zh ? 'zh-CN' : 'en-US', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  return zh ? `开赛 ${s}` : `Kickoff ${s}`;
}

function matchMeta(m: LsmMarketView, zh: boolean): string {
  const hasScore = m.homeScore != null && m.awayScore != null;
  const score = hasScore ? `${m.homeScore} : ${m.awayScore}` : '';
  if (m.status === 'live') {
    return zh ? `滚球进行中${score ? '   比分 ' + score : ''}` : `LIVE${score ? '   ' + score : ''}`;
  }
  if (m.status === 'final' || m.status === 'voided') {
    return zh ? `完场${score ? '   比分 ' + score : ''}` : `Final${score ? '   ' + score : ''}`;
  }
  // pre / suspended：显示开赛时间
  return m.kickoffAt ? formatKickoff(m.kickoffAt, zh) : zh ? '赛前' : 'Upcoming';
}

function MarketCard({
  market,
  zh,
  onPick,
  onShare,
}: {
  market: LsmMarketView;
  zh: boolean;
  onPick: (m: LsmMarketView, idx: number) => void;
  onShare?: (m: LsmMarketView) => void;
}) {
  const labels = [market.homeTeam, market.awayTeam, zh ? '平局' : 'Draw'];
  const homeFlag = teamFlagUrl(market.homeTeam);
  const awayFlag = teamFlagUrl(market.awayTeam);
  return (
    <View style={styles.card}>
      <View style={styles.cardHead}>
        <View style={styles.teamLine}>
          {homeFlag && <Image source={{ uri: homeFlag }} style={styles.flag} />}
          <Text style={styles.matchText} numberOfLines={1}>
            {market.homeTeam} <Text style={styles.vsText}>vs</Text> {market.awayTeam}
          </Text>
          {awayFlag && <Image source={{ uri: awayFlag }} style={styles.flag} />}
        </View>
        <View style={styles.headRight}>
          <StatusBadge status={market.status} stale={market.stale} zh={zh} />
          {onShare && (
            <TouchableOpacity
              style={styles.shareIconBtn}
              onPress={() => onShare(market)}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              testID={`lsm-share-${market.id}`}
            >
              <Text style={styles.shareIconText}>📤</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
      <Text style={styles.matchMeta}>{matchMeta(market, zh)}</Text>
      <View style={styles.oddsBtnRow}>
        {market.odds.map((o) => (
          <TouchableOpacity
            key={o.outcomeIdx}
            style={[styles.oddsBtn, !market.tradable && styles.oddsBtnDisabled]}
            onPress={() => onPick(market, o.outcomeIdx)}
            disabled={!market.tradable}
          >
            <Text style={styles.oddsBtnLabel} numberOfLines={1}>
              {labels[o.outcomeIdx]}
            </Text>
            <Text style={styles.oddsBtnVal}>{o.fairOdds.toFixed(2)}</Text>
            <Text style={styles.oddsImplied}>{impliedPct(o.fairOdds)}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

/** 隐含概率（1/赔率），下注决策的专业参考。 */
function impliedPct(odds: number): string {
  if (!odds || odds <= 0) return '';
  return `${Math.round((1 / odds) * 100)}%`;
}

function StatusBadge({ status, stale, zh }: { status: string; stale: boolean; zh: boolean }) {
  const map: Record<string, { t: string; c: string }> = {
    live: { t: zh ? '滚球' : 'LIVE', c: '#dc2626' },
    pre: { t: zh ? '赛前' : 'PRE', c: '#2563eb' },
    suspended: { t: zh ? '暂停' : 'SUSP', c: '#d97706' },
    final: { t: zh ? '完场' : 'FINAL', c: '#6b7280' },
    voided: { t: zh ? '作废' : 'VOID', c: '#6b7280' },
  };
  const s = stale && status === 'live' ? { t: zh ? '赔率过期' : 'STALE', c: '#d97706' } : map[status] || map.pre;
  return (
    <View style={[styles.badge, { backgroundColor: s.c }]}>
      <Text style={styles.badgeText}>{s.t}</Text>
    </View>
  );
}

function outcomeName(market: LsmMarketView | null, idx: number, zh: boolean): string {
  if (!market) return zh ? `选项 ${idx + 1}` : `Outcome ${idx + 1}`;
  if (idx === 0) return market.homeTeam;
  if (idx === 1) return market.awayTeam;
  return zh ? '平局' : 'Draw';
}

function OrderCard({
  order,
  market,
  zh,
  tr,
  onCashOut,
  onOpen,
  cashingOut,
}: {
  order: LsmOrder;
  market: LsmMarketView | null;
  zh: boolean;
  tr: (e: string, z: string) => string;
  onCashOut: (o: LsmOrder) => void;
  onOpen: () => void;
  cashingOut: boolean;
}) {
  const statusColor: Record<string, string> = {
    open: '#2563eb',
    won: '#16a34a',
    lost: '#dc2626',
    refunded: '#6b7280',
    cashed_out: '#6b7280',
  };
  const statusZh: Record<string, string> = {
    open: '持仓中', won: '已赢', lost: '已输', refunded: '已退款', cashed_out: '已平仓',
  };
  const isOpen = order.status === 'open';
  const canCashOut = isOpen && order.cashoutValue != null;
  const cashoutPnl = order.cashoutValue != null ? order.cashoutValue - order.stake : 0;
  const title = market ? `${market.homeTeam} vs ${market.awayTeam}` : tr('Match', '比赛');
  return (
    <TouchableOpacity style={styles.card} activeOpacity={0.85} onPress={onOpen} testID={`lsm-order-${order.id}`}>
      <View style={styles.cardHead}>
        <Text style={styles.matchText} numberOfLines={1}>{title}</Text>
        <View style={[styles.badge, { backgroundColor: statusColor[order.status] || '#6b7280' }]}>
          <Text style={styles.badgeText}>{zh ? (statusZh[order.status] || order.status) : order.status.toUpperCase()}</Text>
        </View>
      </View>
      <Text style={styles.orderSideText}>
        {tr('Backing', '看好')}: <Text style={styles.orderSideStrong}>{outcomeName(market, order.outcomeIdx, zh)}</Text>
        {'   @ '}{order.entryOdds.toFixed(2)}（{impliedPct(order.entryOdds)}）
      </Text>
      <View style={styles.orderMeta}>
        <Text style={styles.metaText}>
          {tr('Stake', '保证金')} {order.stake} × {order.leverage}x · {tr('Notional', '名义')} {order.notional}
        </Text>
        <Text style={[styles.metaText, { color: order.closePnl >= 0 ? '#16a34a' : '#dc2626' }]}>
          PnL: {order.closePnl >= 0 ? '+' : ''}{order.closePnl}
        </Text>
      </View>

      {isOpen && (
        <>
          <View style={styles.orderMeta}>
            <Text style={styles.metaText}>{tr('Cash-out value', '当前可兑现')}</Text>
            {order.cashoutValue != null ? (
              <Text style={[styles.cashoutVal, { color: cashoutPnl >= 0 ? '#16a34a' : '#dc2626' }]}>
                {order.cashoutValue} AXP（{cashoutPnl >= 0 ? '+' : ''}{cashoutPnl}）
              </Text>
            ) : (
              <Text style={styles.metaText}>{tr('Unavailable', '暂不可平仓')}</Text>
            )}
          </View>
          <View style={styles.orderActionRow}>
            <Text style={styles.tapHint}>{tr('Tap for details ›', '点击查看详情 ›')}</Text>
            <TouchableOpacity
              style={[styles.cashoutBtnSm, (!canCashOut || cashingOut) && styles.oddsBtnDisabled]}
              onPress={() => onCashOut(order)}
              disabled={!canCashOut || cashingOut}
              testID={`lsm-cashout-${order.id}`}
            >
              {cashingOut ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.cashoutBtnText}>{tr('Cash Out', '平仓')}</Text>
              )}
            </TouchableOpacity>
          </View>
        </>
      )}
      {!isOpen && <Text style={styles.tapHint}>{tr('Tap for details ›', '点击查看详情 ›')}</Text>}
    </TouchableOpacity>
  );
}

/** 持仓详情底部抽屉（点击单子打开）：完整赛事/方向/赔率/敞口/盈亏 + 平仓。 */
function PositionDetailSheet({
  order,
  market,
  zh,
  tr,
  onClose,
  onCashOut,
  cashingOut,
}: {
  order: LsmOrder | null;
  market: LsmMarketView | null;
  zh: boolean;
  tr: (e: string, z: string) => string;
  onClose: () => void;
  onCashOut: (o: LsmOrder) => void;
  cashingOut: boolean;
}) {
  if (!order) return null;
  const isOpen = order.status === 'open';
  const canCashOut = isOpen && order.cashoutValue != null;
  const cashoutPnl = order.cashoutValue != null ? order.cashoutValue - order.stake : 0;
  const liveOdds = market?.odds?.find((o) => o.outcomeIdx === order.outcomeIdx)?.fairOdds ?? null;
  const created = new Date(order.createdAt).toLocaleString(zh ? 'zh-CN' : 'en-US', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false });
  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={onClose} />
        <View style={styles.sheet}>
          <View style={styles.handle} />
          <ScrollView keyboardShouldPersistTaps="handled">
            <Text style={styles.title}>{market ? `${market.homeTeam} vs ${market.awayTeam}` : tr('Position', '持仓详情')}</Text>
            <Text style={styles.subtitle}>
              {market?.league ? market.league + ' · ' : ''}{tr('Backing', '看好')} {outcomeName(market, order.outcomeIdx, zh)}
            </Text>

            <View style={styles.detailBox}>
              <DetailRow label={tr('Status', '状态')} value={zh ? order.status : order.status.toUpperCase()} />
              <DetailRow label={tr('Entry odds', '入场赔率')} value={`${order.entryOdds.toFixed(2)}（${impliedPct(order.entryOdds)}）`} />
              {liveOdds != null && <DetailRow label={tr('Current odds', '当前赔率')} value={`${liveOdds.toFixed(2)}（${impliedPct(liveOdds)}）`} />}
              <DetailRow label={tr('Stake (margin)', '保证金')} value={`${order.stake} AXP`} />
              <DetailRow label={tr('Leverage', '杠杆')} value={`${order.leverage}x`} />
              <DetailRow label={tr('Notional', '名义敞口')} value={`${order.notional} AXP`} />
              <DetailRow label={tr('Max profit', '最大盈利')} value={`+${order.maxProfit} AXP`} color="#16a34a" />
              {isOpen && order.cashoutValue != null && (
                <DetailRow label={tr('Cash-out value', '当前可兑现')} value={`${order.cashoutValue} AXP（${cashoutPnl >= 0 ? '+' : ''}${cashoutPnl}）`} color={cashoutPnl >= 0 ? '#16a34a' : '#dc2626'} />
              )}
              {!isOpen && <DetailRow label={tr('Realized PnL', '已结盈亏')} value={`${order.closePnl >= 0 ? '+' : ''}${order.closePnl} AXP`} color={order.closePnl >= 0 ? '#16a34a' : '#dc2626'} />}
              {!isOpen && <DetailRow label={tr('Payout', '派彩')} value={`${order.payout} AXP`} />}
              <DetailRow label={tr('Opened', '开仓时间')} value={created} />
            </View>

            {isOpen && (
              <TouchableOpacity
                style={[styles.placeBtn, (!canCashOut || cashingOut) && styles.placeBtnDisabled]}
                onPress={() => onCashOut(order)}
                disabled={!canCashOut || cashingOut}
              >
                {cashingOut ? <ActivityIndicator color="#fff" /> : (
                  <Text style={styles.placeBtnText}>
                    {canCashOut ? tr('Cash Out Now', '立即平仓') : tr('Cash out unavailable', '暂不可平仓')}
                  </Text>
                )}
              </TouchableOpacity>
            )}
            <Text style={styles.disclaimer}>
              {tr('AXP is non-withdrawable, platform-only. Not investment advice.', 'AXP 不可提现、仅站内用途。非投资建议。')}
            </Text>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function DetailRow({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <View style={styles.detailRow2}>
      <Text style={styles.detailLabel2}>{label}</Text>
      <Text style={[styles.detailValue2, color ? { color } : null]}>{value}</Text>
    </View>
  );
}

function VaultCard({
  vault,
  position,
  tr,
  onDeposit,
  onRedeem,
  onClose,
}: {
  vault: LsmVaultView;
  position: LsmVaultPosition | null;
  tr: (e: string, z: string) => string;
  onDeposit: (v: LsmVaultView) => void;
  onRedeem: (v: LsmVaultView, pos: LsmVaultPosition) => void;
  onClose: (v: LsmVaultView) => void;
}) {
  const isLeader = !!position?.isLeader;
  const redeemable = position ? position.shares : 0;
  return (
    <View style={styles.card}>
      <View style={styles.cardHead}>
        <Text style={styles.matchText}>
          {vault.name || (vault.kind === 'protocol' ? tr('Protocol Vault', '官方金库') : tr('User Vault', '用户金库'))}
        </Text>
        <View style={styles.badgeRow}>
          {vault.status !== 'active' && (
            <View style={[styles.badge, { backgroundColor: '#d97706' }]}>
              <Text style={styles.badgeText}>{vault.status === 'closing' ? tr('CLOSING', '清算中') : tr('CLOSED', '已关闭')}</Text>
            </View>
          )}
          <View style={[styles.badge, { backgroundColor: vault.kind === 'protocol' ? '#7c3aed' : '#0891b2' }]}>
            <Text style={styles.badgeText}>{vault.kind === 'protocol' ? 'HLP' : isLeader ? tr('LEADER', '主理人') : 'USER'}</Text>
          </View>
        </View>
      </View>
      <View style={styles.vaultStats}>
        <Stat label="NAV" value={vault.nav.toFixed(4)} />
        <Stat label={tr('Util', '利用率')} value={`${(vault.utilizationBps / 100).toFixed(1)}%`} />
        <Stat label={tr('Bankroll', '本金')} value={`${vault.bankroll}`} />
      </View>
      {vault.kind === 'user' && (
        <Text style={styles.metaText}>
          {tr('Profit share', '利润分成')}: {(vault.profitShareBps / 100).toFixed(0)}% · {tr('Lock', '锁定')} {Math.round(vault.depositLockSecs / 3600)}h
        </Text>
      )}
      {position && position.shares > 0 && (
        <Text style={styles.metaText}>
          {tr('My shares', '我的份额')}: {position.shares}（{tr('cost', '本金')} {position.costBasis} AXP）
        </Text>
      )}
      <View style={styles.vaultBtnRow}>
        <TouchableOpacity
          style={[styles.depositBtn, { flex: 1 }, vault.status !== 'active' && styles.oddsBtnDisabled]}
          onPress={() => onDeposit(vault)}
          disabled={vault.status !== 'active'}
        >
          <Text style={styles.depositBtnText}>{tr('Deposit', '存入')}</Text>
        </TouchableOpacity>
        {redeemable > 0 && (
          <TouchableOpacity
            style={[styles.secondaryBtn, { flex: 1 }, vault.status === 'closed' && styles.oddsBtnDisabled]}
            onPress={() => position && onRedeem(vault, position)}
            disabled={vault.status === 'closed'}
          >
            <Text style={styles.secondaryBtnText}>{tr('Redeem', '赎回')}</Text>
          </TouchableOpacity>
        )}
      </View>
      {isLeader && vault.kind === 'user' && vault.status === 'active' && (
        <TouchableOpacity style={styles.dangerBtn} onPress={() => onClose(vault)}>
          <Text style={styles.dangerBtnText}>{tr('Close Vault', '关闭金库')}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

function CreateVaultModal({
  visible,
  tr,
  onClose,
  onCreated,
}: {
  visible: boolean;
  tr: (e: string, z: string) => string;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [name, setName] = useState('');
  const [deposit, setDeposit] = useState('1000');
  const [lockHours, setLockHours] = useState('24');
  // 承接配置：选择一场比赛承接 + 容量 + 费率竞价（%）。利润分成由平台固定 10%，不可改。
  const [scopeMarkets, setScopeMarkets] = useState<LsmMarketView[]>([]);
  const [scopeMarketId, setScopeMarketId] = useState<string | null>(null);
  const [capacity, setCapacity] = useState('500');
  const [feeBidPct, setFeeBidPct] = useState('1');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (visible) {
      setName('');
      setDeposit('1000');
      setLockHours('24');
      setScopeMarketId(null);
      setCapacity('500');
      setFeeBidPct('1');
      // 拉可承接的比赛供选择（联赛字段当前为空时按单场比赛承接）
      lsmApi.listLive().then(setScopeMarkets).catch(() => setScopeMarkets([]));
    }
  }, [visible]);

  const submit = async () => {
    const dep = Math.floor(Number(deposit) || 0);
    if (!name.trim() || dep <= 0) {
      Alert.alert(tr('Invalid', '无效'), tr('Enter name and positive deposit', '请填写名称与正整数出资'));
      return;
    }
    setBusy(true);
    try {
      // 利润分成由服务端固定 10%，此处不再传值。
      const vault = await lsmApi.createUserVault({
        name: name.trim(),
        initialDeposit: dep,
        depositLockSecs: Math.floor((Number(lockHours) || 0) * 3600),
      });
      // 若选择了承接比赛，创建一条承接订阅（费率竞价 %→bps，封顶 20%）
      if (scopeMarketId) {
        const feeBidBps = Math.round(Math.max(0, Math.min(20, Number(feeBidPct) || 0)) * 100);
        const cap = Math.max(0, Math.floor(Number(capacity) || 0));
        try {
          await lsmApi.upsertSubscription({
            vaultId: vault.id,
            scopeType: 'market',
            scopeValue: scopeMarketId,
            capacity: cap,
            feeBidBps,
            enabled: true,
          });
        } catch (subErr: any) {
          // 金库已建成功；订阅失败仅提示，可稍后再配置
          Alert.alert(
            tr('Vault created, subscription failed', '金库已创建，承接配置失败'),
            mapErr(subErr, tr),
          );
        }
      }
      onCreated();
    } catch (e: any) {
      Alert.alert(tr('Failed', '失败'), mapErr(e, tr));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={onClose} />
        <View style={styles.sheet}>
          <View style={styles.handle} />
          <ScrollView keyboardShouldPersistTaps="handled">
            <Text style={styles.title}>{tr('Create User Vault', '创建用户金库')}</Text>
            <Text style={styles.subtitle}>
              {tr('Leader stakes initial capital (skin-in-game).', '主理人投入初始资金（skin-in-game）。')}
            </Text>

            {/* 平台固定利润分成（只读） */}
            <View style={styles.infoBox}>
              <Text style={styles.infoText}>
                {tr('Platform profit share: fixed 10% (you take 10% of LP profits).', '平台固定利润分成：10%（你从 LP 盈利中抽取 10%）。')}
              </Text>
            </View>

            <Text style={styles.fieldLabel}>{tr('Name', '名称')}</Text>
            <TextInput style={styles.input} value={name} onChangeText={setName} placeholder={tr('e.g. EPL Live MM', '如 英超滚球做市')} placeholderTextColor={colors.textSecondary} />

            <Text style={styles.fieldLabel}>{tr('Initial deposit (AXP)', '初始出资 (AXP)')}</Text>
            <TextInput style={styles.input} value={deposit} onChangeText={setDeposit} keyboardType="number-pad" />

            <Text style={styles.fieldLabel}>{tr('Lock (hours)', '锁定 (小时)')}</Text>
            <TextInput style={styles.input} value={lockHours} onChangeText={setLockHours} keyboardType="number-pad" />

            {/* 承接范围：选择一场比赛承接（联赛字段为空时按单场） */}
            <Text style={styles.fieldLabel}>{tr('Underwrite a match (optional)', '承接比赛（选填）')}</Text>
            <View style={styles.scopeList}>
              <TouchableOpacity
                style={[styles.scopeChip, scopeMarketId === null && styles.scopeChipActive]}
                onPress={() => setScopeMarketId(null)}
              >
                <Text style={[styles.scopeChipText, scopeMarketId === null && styles.scopeChipTextActive]}>
                  {tr('None for now', '暂不绑定')}
                </Text>
              </TouchableOpacity>
              {scopeMarkets.slice(0, 12).map((m) => (
                <TouchableOpacity
                  key={m.id}
                  style={[styles.scopeChip, scopeMarketId === m.id && styles.scopeChipActive]}
                  onPress={() => setScopeMarketId(m.id)}
                >
                  <Text
                    style={[styles.scopeChipText, scopeMarketId === m.id && styles.scopeChipTextActive]}
                    numberOfLines={1}
                  >
                    {m.homeTeam} vs {m.awayTeam}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {scopeMarketId && (
              <>
                <Text style={styles.fieldLabel}>{tr('Capacity (AXP)', '承接容量 (AXP)')}</Text>
                <TextInput style={styles.input} value={capacity} onChangeText={setCapacity} keyboardType="number-pad" />
                <Text style={styles.fieldLabel}>{tr('Fee bid % (lower wins routing, ≤20%)', '费率竞价 %（越低越优先承接，≤20%）')}</Text>
                <TextInput style={styles.input} value={feeBidPct} onChangeText={setFeeBidPct} keyboardType="number-pad" />
              </>
            )}

            <TouchableOpacity style={[styles.placeBtn, busy && styles.placeBtnDisabled]} onPress={submit} disabled={busy}>
              {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.placeBtnText}>{tr('Create', '创建')}</Text>}
            </TouchableOpacity>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

/** 跨平台金额输入弹窗（替代仅 iOS 的 Alert.prompt，Android 同样可用）。 */
function AmountPromptModal({
  prompt,
  tr,
  onClose,
}: {
  prompt: { title: string; message: string; initial: string; onSubmit: (n: number) => void } | null;
  tr: (e: string, z: string) => string;
  onClose: () => void;
}) {
  const [val, setVal] = useState('');
  useEffect(() => {
    setVal(prompt?.initial ?? '');
  }, [prompt]);
  if (!prompt) return null;
  const submit = () => {
    const n = Math.floor(Number(val) || 0);
    onClose();
    prompt.onSubmit(n);
  };
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={onClose} />
        <View style={[styles.sheet, { borderRadius: 16, margin: 24, alignSelf: 'center', minWidth: 280 }]}>
          <Text style={styles.title}>{prompt.title}</Text>
          <Text style={styles.subtitle}>{prompt.message}</Text>
          <TextInput
            style={styles.input}
            value={val}
            onChangeText={setVal}
            keyboardType="number-pad"
            autoFocus
            placeholder="0"
            placeholderTextColor={colors.textSecondary}
          />
          <View style={{ flexDirection: 'row', gap: 10, marginTop: 16 }}>
            <TouchableOpacity style={[styles.secondaryBtn, { flex: 1 }]} onPress={onClose}>
              <Text style={styles.secondaryBtnText}>{tr('Cancel', '取消')}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.placeBtn, { flex: 1, marginTop: 0 }]} onPress={submit}>
              <Text style={styles.placeBtnText}>{tr('Confirm', '确认')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function mapErr(e: any, tr: (e: string, z: string) => string): string {
  const msg: string = e?.message || '';
  if (msg.includes('VAULT_DEPOSIT_LOCKED')) return tr('Deposit still locked', '存款仍在锁定期');
  if (msg.includes('LEADER_MIN_SHARE')) return tr('Leader must keep min share', '主理人须维持最低自有份额');
  if (msg.includes('KYC_REQUIRED')) return tr('KYC required', '需完成 KYC');
  if (msg.includes('GEO_RESTRICTED')) return tr('Region restricted', '当前地域受限');
  if (msg.includes('SYSTEM_MODE')) return tr('Under maintenance', '系统维护中');
  return msg || tr('Operation failed', '操作失败');
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statValue}>{value}</Text>
    </View>
  );
}

function Empty({ text, hint }: { text: string; hint?: string }) {
  return (
    <View style={styles.empty}>
      <Text style={styles.emptyText}>{text}</Text>
      {!!hint && <Text style={styles.emptyHint}>{hint}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  tabBar: { flexDirection: 'row', backgroundColor: colors.card, paddingHorizontal: 12, paddingTop: 8 },
  tab: { flex: 1, paddingVertical: 12, alignItems: 'center', borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabActive: { borderBottomColor: colors.primary },
  tabText: { fontSize: 14, color: colors.textSecondary, fontWeight: '600' },
  tabTextActive: { color: colors.primary, fontWeight: '800' },
  list: { padding: 12, gap: 10 },
  card: { backgroundColor: colors.card, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: colors.border },
  cardHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  matchText: { fontSize: 15, fontWeight: '700', color: colors.text, flex: 1, marginRight: 8 },
  teamLine: { flexDirection: 'row', alignItems: 'center', flex: 1, marginRight: 8, gap: 6 },
  flag: { width: 22, height: 15, borderRadius: 2, backgroundColor: colors.border },
  vsText: { color: colors.textSecondary, fontWeight: '700', fontSize: 12 },
  matchMeta: { fontSize: 12, color: colors.textSecondary, marginTop: -4, marginBottom: 10 },
  oddsBtnRow: { flexDirection: 'row', gap: 8 },
  oddsBtn: { flex: 1, backgroundColor: colors.background, borderRadius: 10, paddingVertical: 10, alignItems: 'center', borderWidth: 1, borderColor: colors.border },
  oddsBtnDisabled: { opacity: 0.5 },
  oddsBtnLabel: { fontSize: 12, color: colors.textSecondary, marginBottom: 4 },
  oddsBtnVal: { fontSize: 18, fontWeight: '800', color: colors.primary },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  badgeText: { fontSize: 10, fontWeight: '800', color: '#fff' },
  orderMeta: { flexDirection: 'row', justifyContent: 'space-between' },
  metaText: { fontSize: 13, color: colors.textSecondary, marginTop: 4 },
  vaultStats: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  stat: { alignItems: 'center', flex: 1 },
  statLabel: { fontSize: 11, color: colors.textSecondary },
  statValue: { fontSize: 16, fontWeight: '800', color: colors.text, marginTop: 2 },
  depositBtn: { backgroundColor: colors.primary, borderRadius: 10, paddingVertical: 11, alignItems: 'center', marginTop: 10 },
  depositBtnText: { color: '#fff', fontWeight: '800', fontSize: 14 },
  empty: { alignItems: 'center', paddingTop: 60 },
  emptyText: { fontSize: 14, color: colors.textSecondary },
  emptyHint: { fontSize: 12, color: colors.textMuted, marginTop: 6 },
  sectionHeader: { fontSize: 13, fontWeight: '800', color: colors.textSecondary, marginTop: 6, marginBottom: 2, textTransform: 'uppercase', letterSpacing: 0.5 },
  cashoutVal: { fontSize: 13, fontWeight: '800', marginTop: 4 },
  cashoutBtn: { backgroundColor: '#0891b2', borderRadius: 10, paddingVertical: 11, alignItems: 'center', marginTop: 10 },
  cashoutBtnText: { color: '#fff', fontWeight: '800', fontSize: 14 },
  headRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  shareIconBtn: { paddingHorizontal: 4, paddingVertical: 2 },
  shareIconText: { fontSize: 16 },
  oddsImplied: { fontSize: 10, color: colors.textSecondary, marginTop: 2 },
  orderSideText: { fontSize: 13, color: colors.textSecondary, marginBottom: 6 },
  orderSideStrong: { color: colors.text, fontWeight: '800' },
  orderActionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 10, gap: 10 },
  tapHint: { fontSize: 11, color: colors.primary, fontWeight: '700', marginTop: 8 },
  cashoutBtnSm: { backgroundColor: '#0891b2', borderRadius: 10, paddingVertical: 9, paddingHorizontal: 18, alignItems: 'center' },
  detailBox: { backgroundColor: colors.background, borderRadius: 12, padding: 14, marginTop: 12 },
  detailRow2: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 5 },
  detailLabel2: { fontSize: 13, color: colors.textSecondary },
  detailValue2: { fontSize: 14, fontWeight: '700', color: colors.text },
  badgeRow: { flexDirection: 'row', gap: 6 },
  vaultBtnRow: { flexDirection: 'row', gap: 8, marginTop: 10 },
  secondaryBtn: { backgroundColor: colors.background, borderRadius: 10, paddingVertical: 11, alignItems: 'center', borderWidth: 1, borderColor: colors.border },
  secondaryBtnText: { color: colors.text, fontWeight: '800', fontSize: 14 },
  dangerBtn: { backgroundColor: '#7f1d1d', borderRadius: 10, paddingVertical: 10, alignItems: 'center', marginTop: 8 },
  dangerBtnText: { color: '#fecaca', fontWeight: '800', fontSize: 13 },
  createBtn: { backgroundColor: '#0891b2', borderRadius: 10, paddingVertical: 11, alignItems: 'center', marginBottom: 4 },
  createBtnText: { color: '#fff', fontWeight: '800', fontSize: 14 },
  vaultIntro: { backgroundColor: colors.card, borderRadius: 10, borderWidth: 1, borderColor: colors.border, padding: 10, marginBottom: 10 },
  vaultIntroText: { fontSize: 12, color: colors.textSecondary, lineHeight: 17 },
  overlay: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.5)' },
  sheet: { backgroundColor: colors.card, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, maxHeight: '90%' },
  handle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border, marginBottom: 12 },
  title: { fontSize: 18, fontWeight: '800', color: colors.text },
  subtitle: { fontSize: 13, color: colors.textSecondary, marginTop: 4, marginBottom: 8 },
  fieldLabel: { fontSize: 13, color: colors.textSecondary, marginTop: 12, marginBottom: 6 },
  input: { backgroundColor: colors.background, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 11, fontSize: 16, color: colors.text, borderWidth: 1, borderColor: colors.border },
  placeBtn: { backgroundColor: colors.primary, borderRadius: 12, paddingVertical: 15, alignItems: 'center', marginTop: 18 },
  placeBtnDisabled: { opacity: 0.5 },
  placeBtnText: { color: '#fff', fontSize: 16, fontWeight: '800' },
  infoBox: { backgroundColor: '#0891b211', borderRadius: 10, borderWidth: 1, borderColor: '#0891b240', padding: 10, marginTop: 8 },
  infoText: { fontSize: 12, color: colors.text, lineHeight: 17 },
  scopeList: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 2 },
  scopeChip: { paddingHorizontal: 10, paddingVertical: 8, borderRadius: 10, backgroundColor: colors.background, borderWidth: 1, borderColor: colors.border, maxWidth: '100%' },
  scopeChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  scopeChipText: { fontSize: 12, color: colors.text, fontWeight: '600' },
  scopeChipTextActive: { color: '#fff' },
});
