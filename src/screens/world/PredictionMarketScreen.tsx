/**
 * PredictionMarketScreen — 事件预测市场(parimutuel 彩池,AXP)。
 *
 * 列出预测市场(如世界杯赛果)→ 选选项 → 用 AXP 下注;命中按彩池比例瓜分。
 * 后端:/v1/predictions(backend/src/modules/world-engagement)。
 * 合规提示:竞猜受地区监管;AXP 为实用积分,非法币;纯娱乐。
 */
import React, { useCallback, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, ActivityIndicator, Modal, TextInput, Alert,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useI18n } from '../../stores/i18nStore';
import { useColors, useThemedStyles, type Palette } from '../../theme/useTheme';
import {
  listPredictions, stakePrediction, type PredictionMarket, type PredictionOption,
} from '../../services/worldEngagementApi';

const STAKE_CHIPS = [50, 100, 500, 1000];
const CAT_LABEL: Record<string, { en: string; zh: string }> = {
  worldcup: { en: 'World Cup', zh: '世界杯' },
  esports: { en: 'Esports', zh: '电竞' },
  crypto: { en: 'Crypto', zh: '加密' },
  custom: { en: 'Featured', zh: '精选' },
};

export default function PredictionMarketScreen() {
  const { t } = useI18n();
  const c = useColors();
  const styles = useThemedStyles(makeStyles);

  const [markets, setMarkets] = useState<PredictionMarket[]>([]);
  const [loading, setLoading] = useState(true);
  const [stakeFor, setStakeFor] = useState<{ market: PredictionMarket; option: PredictionOption } | null>(null);
  const [amount, setAmount] = useState('100');
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    listPredictions()
      .then((r) => setMarkets(r.items ?? []))
      .catch(() => setMarkets([]))
      .finally(() => setLoading(false));
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const doStake = useCallback(async () => {
    if (!stakeFor) return;
    const amt = Math.floor(Number(amount));
    if (!Number.isFinite(amt) || amt < 1) {
      Alert.alert(t({ en: 'Invalid amount', zh: '金额无效' }), t({ en: 'Enter a positive AXP amount.', zh: '请输入正整数 AXP。' }));
      return;
    }
    setSubmitting(true);
    try {
      await stakePrediction(stakeFor.market.id, stakeFor.option.id, amt);
      setStakeFor(null);
      Alert.alert(t({ en: 'Stake placed', zh: '下注成功' }), t({ en: `Staked ${amt} AXP on ${stakeFor.option.label}.`, zh: `已用 ${amt} AXP 押注「${stakeFor.option.label}」。` }));
      load();
    } catch (e: any) {
      Alert.alert(t({ en: 'Stake failed', zh: '下注失败' }), e?.message ?? t({ en: 'Try again', zh: '请稍后再试' }));
    } finally {
      setSubmitting(false);
    }
  }, [stakeFor, amount, t, load]);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>🔮 {t({ en: 'Predictions', zh: '赛事预测' })}</Text>
        <Text style={styles.subtitle}>{t({ en: 'Stake AXP · winners split the pool', zh: '用 AXP 押注 · 命中瓜分彩池' })}</Text>
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator color={c.accent} /></View>
      ) : (
        <ScrollView contentContainerStyle={styles.list} showsVerticalScrollIndicator={false}>
          {markets.length === 0 ? (
            <Text style={styles.dim}>{t({ en: 'No markets open right now.', zh: '当前没有开放的预测。' })}</Text>
          ) : markets.map((m) => {
            const cat = CAT_LABEL[m.category] ?? CAT_LABEL.custom;
            const open = m.status === 'open';
            return (
              <View key={m.id} style={styles.card}>
                <View style={styles.cardTop}>
                  <Text style={styles.catBadge}>{t(cat)}</Text>
                  <Text style={[styles.statusBadge, open ? styles.statusOpen : styles.statusClosed]}>
                    {m.status === 'open' ? t({ en: 'OPEN', zh: '进行中' }) : m.status === 'settled' ? t({ en: 'SETTLED', zh: '已结算' }) : m.status === 'locked' ? t({ en: 'LOCKED', zh: '已封盘' }) : t({ en: 'CANCELLED', zh: '已取消' })}
                  </Text>
                </View>
                <Text style={styles.cardTitle}>{m.title}</Text>
                {m.subtitle ? <Text style={styles.cardSub}>{m.subtitle}</Text> : null}
                <Text style={styles.pool}>💰 {t({ en: 'Pool', zh: '彩池' })} {m.totalPool} AXP · {t({ en: 'rake', zh: '抽成' })} {(m.rakeBps / 100).toFixed(0)}%</Text>

                <View style={styles.options}>
                  {m.options.map((o) => {
                    const pool = m.poolByOption?.[o.id] ?? 0;
                    const odds = m.impliedOdds?.[o.id] ?? 0;
                    const isWinner = m.status === 'settled' && m.winningOptionId === o.id;
                    const myStake = (m.myStakes ?? []).filter((s) => s.optionId === o.id).reduce((a, s) => a + s.amount, 0);
                    return (
                      <TouchableOpacity
                        key={o.id}
                        style={[styles.opt, isWinner && styles.optWin, !open && styles.optDisabled]}
                        disabled={!open}
                        onPress={() => { setAmount('100'); setStakeFor({ market: m, option: o }); }}
                      >
                        <View style={{ flex: 1 }}>
                          <Text style={styles.optLabel}>{isWinner ? '🏆 ' : ''}{o.label}</Text>
                          <Text style={styles.optMeta}>
                            {pool} AXP{odds > 0 ? ` · x${odds.toFixed(2)}` : ''}{myStake > 0 ? ` · ${t({ en: 'mine', zh: '我押' })} ${myStake}` : ''}
                          </Text>
                        </View>
                        {open ? <Text style={styles.optGo}>{t({ en: 'Stake', zh: '押注' })} ›</Text> : null}
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            );
          })}
          <Text style={styles.legal}>{t({ en: 'For entertainment. AXP are utility points, not currency. Availability may be region-limited.', zh: '仅供娱乐。AXP 为实用积分,非法币。部分地区可能不可用。' })}</Text>
        </ScrollView>
      )}

      {/* 下注弹窗 */}
      <Modal visible={!!stakeFor} transparent animationType="slide" onRequestClose={() => setStakeFor(null)}>
        <View style={styles.backdrop}>
          <View style={styles.sheet}>
            <Text style={styles.sheetTitle}>{t({ en: 'Stake on', zh: '押注' })} 「{stakeFor?.option.label}」</Text>
            <Text style={styles.sheetSub}>{stakeFor?.market.title}</Text>
            <View style={styles.chips}>
              {STAKE_CHIPS.map((v) => (
                <TouchableOpacity key={v} style={[styles.chip, Number(amount) === v && styles.chipActive]} onPress={() => setAmount(String(v))}>
                  <Text style={[styles.chipText, Number(amount) === v && styles.chipTextActive]}>{v}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <TextInput
              style={styles.input}
              value={amount}
              onChangeText={setAmount}
              keyboardType="number-pad"
              placeholder="100"
              placeholderTextColor={c.textMuted}
            />
            <TouchableOpacity style={[styles.confirm, submitting && styles.confirmDisabled]} onPress={doStake} disabled={submitting}>
              {submitting ? <ActivityIndicator color="#fff" /> : <Text style={styles.confirmText}>{t({ en: `Stake ${amount} AXP`, zh: `确认押注 ${amount} AXP` })}</Text>}
            </TouchableOpacity>
            <TouchableOpacity style={styles.cancel} onPress={() => setStakeFor(null)}>
              <Text style={styles.cancelText}>{t({ en: 'Cancel', zh: '取消' })}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function makeStyles(c: Palette) { return ({
  container: { flex: 1, backgroundColor: c.bgPrimary },
  header: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 8 },
  title: { color: c.textPrimary, fontSize: 22, fontWeight: '800' },
  subtitle: { color: c.textMuted, fontSize: 13, marginTop: 2 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  list: { padding: 16, paddingBottom: 60, gap: 14 },
  dim: { color: c.textMuted, fontSize: 13, textAlign: 'center', paddingVertical: 30 },
  card: { backgroundColor: c.bgCard, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: c.border, marginBottom: 14 },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  catBadge: { color: c.accent, fontSize: 11, fontWeight: '800', backgroundColor: c.accent + '1A', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, overflow: 'hidden' },
  statusBadge: { fontSize: 11, fontWeight: '800', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, overflow: 'hidden' },
  statusOpen: { color: '#0a3', backgroundColor: '#0a33' },
  statusClosed: { color: c.textMuted, backgroundColor: c.bgSecondary },
  cardTitle: { color: c.textPrimary, fontSize: 17, fontWeight: '800' },
  cardSub: { color: c.textSecondary, fontSize: 13, marginTop: 4, lineHeight: 19 },
  pool: { color: c.textMuted, fontSize: 12, marginTop: 8 },
  options: { marginTop: 10, gap: 8 },
  opt: { flexDirection: 'row', alignItems: 'center', backgroundColor: c.bgSecondary, borderRadius: 12, padding: 12, borderWidth: 1, borderColor: c.border },
  optWin: { borderColor: '#ffd166', backgroundColor: '#ffd16618' },
  optDisabled: { opacity: 0.7 },
  optLabel: { color: c.textPrimary, fontSize: 15, fontWeight: '700' },
  optMeta: { color: c.textMuted, fontSize: 12, marginTop: 3 },
  optGo: { color: c.accent, fontSize: 13, fontWeight: '800' },
  legal: { color: c.textMuted, fontSize: 11, lineHeight: 16, textAlign: 'center', marginTop: 8 },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: c.bgCard, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, paddingBottom: 32 },
  sheetTitle: { color: c.textPrimary, fontSize: 18, fontWeight: '800' },
  sheetSub: { color: c.textMuted, fontSize: 13, marginTop: 4, marginBottom: 14 },
  chips: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  chip: { flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: 10, backgroundColor: c.bgSecondary, borderWidth: 1, borderColor: c.border },
  chipActive: { backgroundColor: c.accent + '22', borderColor: c.accent },
  chipText: { color: c.textSecondary, fontSize: 14, fontWeight: '700' },
  chipTextActive: { color: c.accent },
  input: { backgroundColor: c.bgSecondary, borderRadius: 12, borderWidth: 1, borderColor: c.border, color: c.textPrimary, fontSize: 16, paddingHorizontal: 14, paddingVertical: 12, marginBottom: 14, textAlign: 'center', fontWeight: '800' },
  confirm: { backgroundColor: c.accent, borderRadius: 14, paddingVertical: 14, alignItems: 'center' },
  confirmDisabled: { opacity: 0.6 },
  confirmText: { color: '#fff', fontSize: 16, fontWeight: '800' },
  cancel: { alignItems: 'center', paddingVertical: 12, marginTop: 4 },
  cancelText: { color: c.textMuted, fontSize: 14 },
}); }
