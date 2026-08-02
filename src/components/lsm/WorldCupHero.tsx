// 赛事预测段顶部「世界杯 Hero 运营位」（大图 banner）。
//
// Spec: agentrix-marketplace-tab-refactor — Task 7（需求 4.2 / 4.3）。
//
// 数据源：后端暂无 `/lsm/markets/featured` 端点（见 lsm.controller.ts），
// 因此 Hero 由前端按联赛过滤 `lsmApi.listLive(league)` 的结果派生头条赛事，
// 不写死单场、不新增后端端点（保持本任务纯前端）。
// 派生规则：优先世界杯/FIFA 联赛，其次 live，其次最近开赛。
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ImageBackground } from 'react-native';
import { colors } from '../../theme/colors';
import type { LsmMarketView } from '../../services/lsm.api';
import { worldCupHeroTagline } from '../../services/lsmPosterCopy';

/** 头条联赛关键词（大小写不敏感）。命中者优先进入 Hero。 */
const FEATURED_LEAGUE_KEYWORDS = ['world cup', '世界杯', 'fifa'];

/**
 * 从盘口列表派生 Hero 头条赛事（纯前端，data-driven，不写死单场）。
 * 排序权重：联赛命中世界杯关键词 > live > 即将开赛（kickoff 近）。
 */
export function pickFeaturedMarket(markets: LsmMarketView[]): LsmMarketView | null {
  if (!markets || markets.length === 0) return null;
  const score = (m: LsmMarketView): number => {
    let s = 0;
    const league = (m.league || '').toLowerCase();
    if (FEATURED_LEAGUE_KEYWORDS.some((k) => league.includes(k))) s += 1000;
    if (m.status === 'live' && !m.stale) s += 100;
    else if (m.status === 'pre') s += 10;
    return s;
  };
  const sorted = [...markets].sort((a, b) => {
    const ds = score(b) - score(a);
    if (ds !== 0) return ds;
    // 同分：开赛时间近的优先（null 视为很远）
    const ka = a.kickoffAt ?? Number.MAX_SAFE_INTEGER;
    const kb = b.kickoffAt ?? Number.MAX_SAFE_INTEGER;
    return ka - kb;
  });
  return sorted[0] || null;
}

interface Props {
  market: LsmMarketView | null;
  zh: boolean;
  /** 点击 Hero（或赔率）打开下单抽屉。 */
  onPick: (market: LsmMarketView, outcomeIdx: number) => void;
  /** 分享世界杯海报（可选）。 */
  onShare?: (market: LsmMarketView) => void;
}

export function WorldCupHero({ market, zh, onPick, onShare }: Props) {
  if (!market) return null;
  const tr = (en: string, z: string) => (zh ? z : en);
  const labels = [market.homeTeam, market.awayTeam, zh ? '平局' : 'Draw'];
  const statusText =
    market.stale && market.status === 'live'
      ? tr('STALE', '赔率过期')
      : market.status === 'live'
        ? tr('LIVE', '滚球进行中')
        : market.status === 'pre'
          ? tr('UPCOMING', '即将开赛')
          : market.status === 'suspended'
            ? tr('SUSPENDED', '暂停')
            : tr('FINAL', '完场');

  return (
    <TouchableOpacity
      activeOpacity={0.92}
      style={styles.wrap}
      onPress={() => onPick(market, 0)}
      testID="lsm-worldcup-hero"
    >
      <ImageBackground
        source={{
          uri: 'https://images.unsplash.com/photo-1522778119026-d647f0596c20?auto=format&fit=crop&w=1200&q=70',
        }}
        style={styles.bg}
        imageStyle={styles.bgImage}
      >
        <View style={styles.overlay} />
        <View style={styles.content}>
          <View style={styles.topRow}>
            <View style={styles.featuredBadge}>
              <Text style={styles.featuredBadgeText}>🏆 {tr('Featured', '世界杯运营位')}</Text>
            </View>
            <View style={[styles.statusBadge, market.status === 'live' && !market.stale && styles.statusLive]}>
              <Text style={styles.statusText}>{statusText}</Text>
            </View>
            {onShare && (
              <TouchableOpacity
                style={styles.heroShareBtn}
                onPress={() => onShare(market)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                testID="lsm-hero-share"
              >
                <Text style={styles.heroShareText}>📤 {tr('Share', '分享')}</Text>
              </TouchableOpacity>
            )}
          </View>

          {!!market.league && <Text style={styles.league}>{market.league}</Text>}
          <Text style={styles.matchText} numberOfLines={1}>
            {market.homeTeam} <Text style={styles.vs}>vs</Text> {market.awayTeam}
          </Text>

          <View style={styles.oddsRow}>
            {market.odds.map((o) => (
              <TouchableOpacity
                key={o.outcomeIdx}
                style={[styles.oddsChip, !market.tradable && styles.oddsChipDisabled]}
                onPress={() => onPick(market, o.outcomeIdx)}
                disabled={!market.tradable}
                testID={`lsm-hero-odds-${o.outcomeIdx}`}
              >
                <Text style={styles.oddsChipLabel} numberOfLines={1}>
                  {labels[o.outcomeIdx]}
                </Text>
                <Text style={styles.oddsChipVal}>{o.fairOdds.toFixed(2)}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.cta}>
            {market.tradable ? tr('Tap to trade →', '点按即可下单 →') : tr('Trading paused', '暂停下单')}
          </Text>

          {/* 新人拉新标语（World Cup）：限量前 1000 名注册即领体验金，AXP/USDC 分开表述。 */}
          <Text style={styles.promo} numberOfLines={2} testID="lsm-hero-promo">
            {worldCupHeroTagline(zh)}
          </Text>
        </View>
      </ImageBackground>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  promo: {
    marginTop: 8,
    color: '#ffe08a',
    fontSize: 12,
    fontWeight: '800',
    backgroundColor: 'rgba(0,0,0,0.28)',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    overflow: 'hidden',
  },
  wrap: { borderRadius: 16, overflow: 'hidden', marginBottom: 14 },
  bg: { width: '100%', minHeight: 180, justifyContent: 'flex-end' },
  bgImage: { resizeMode: 'cover' },
  overlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(8,12,24,0.62)' },
  content: { padding: 16 },
  topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  featuredBadge: { backgroundColor: 'rgba(124,58,237,0.9)', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 },
  featuredBadgeText: { color: '#fff', fontSize: 11, fontWeight: '800' },
  statusBadge: { backgroundColor: 'rgba(107,114,128,0.9)', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 },
  statusLive: { backgroundColor: 'rgba(220,38,38,0.95)' },
  statusText: { color: '#fff', fontSize: 11, fontWeight: '800' },
  heroShareBtn: { backgroundColor: 'rgba(255,255,255,0.18)', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4, borderWidth: 1, borderColor: 'rgba(255,255,255,0.3)' },
  heroShareText: { color: '#fff', fontSize: 11, fontWeight: '800' },
  league: { color: '#cbd5e1', fontSize: 12, fontWeight: '600', marginBottom: 4 },
  matchText: { color: '#fff', fontSize: 22, fontWeight: '900', marginBottom: 14 },
  vs: { color: '#94a3b8', fontSize: 16, fontWeight: '700' },
  oddsRow: { flexDirection: 'row', gap: 8 },
  oddsChip: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.14)',
    borderRadius: 10,
    paddingVertical: 9,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
  },
  oddsChipDisabled: { opacity: 0.5 },
  oddsChipLabel: { color: '#e2e8f0', fontSize: 11, marginBottom: 3 },
  oddsChipVal: { color: '#fff', fontSize: 18, fontWeight: '900' },
  cta: { color: '#7dd3fc', fontSize: 12, fontWeight: '700', marginTop: 12, textAlign: 'right' },
});
