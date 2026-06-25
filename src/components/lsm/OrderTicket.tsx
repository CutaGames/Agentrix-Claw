// LSM 下单票据（order-placement-ux 落地）
// 预览 / 赔率涨跌徽标 / 杠杆联动 / 滑点按新价重试 / 防重复提交 / 移动端抽屉 / zh-en
import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  StyleSheet,
  ScrollView,
} from 'react-native';
import { colors } from '../../theme/colors';
import { useI18n } from '../../stores/i18nStore';
import { lsmApi, LsmMarketView, LsmPreview } from '../../services/lsm.api';
import { OddsHistoryChart } from './OddsHistoryChart';

const LEVERAGES = [1, 2, 5, 10, 20];

interface Props {
  visible: boolean;
  market: LsmMarketView | null;
  outcomeIdx: number;
  onClose: () => void;
  onPlaced?: () => void;
}

function outcomeLabel(m: LsmMarketView, idx: number, zh: boolean): string {
  if (idx === 0) return m.homeTeam;
  if (idx === 1) return m.awayTeam;
  return zh ? '平局' : 'Draw';
}

export function OrderTicket({ visible, market, outcomeIdx, onClose, onPlaced }: Props) {
  const { t, language } = useI18n();
  const zh = language === 'zh';
  const tr = (en: string, z: string) => (zh ? z : en);

  const [stake, setStake] = useState('100');
  const [leverage, setLeverage] = useState(2);
  const [preview, setPreview] = useState<LsmPreview | null>(null);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retryOdds, setRetryOdds] = useState<number | null>(null);
  const prevOddsRef = useRef<number | null>(null);
  const [oddsDir, setOddsDir] = useState<'up' | 'down' | null>(null);

  const stakeNum = Math.max(0, Math.floor(Number(stake) || 0));

  const runPreview = useCallback(async () => {
    if (!market || stakeNum <= 0) {
      setPreview(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const p = await lsmApi.preview({
        marketId: market.id,
        outcomeIdx,
        stake: stakeNum,
        leverage,
      });
      // 赔率涨跌方向
      const prev = prevOddsRef.current;
      if (prev != null && p.tradableOdds !== prev) {
        setOddsDir(p.tradableOdds > prev ? 'up' : 'down');
      }
      prevOddsRef.current = p.tradableOdds;
      setPreview(p);
      setRetryOdds(null);
    } catch (e: any) {
      setError(e?.message || tr('Preview failed', '预览失败'));
      setPreview(null);
    } finally {
      setLoading(false);
    }
  }, [market, outcomeIdx, stakeNum, leverage]);

  // 防抖预览（金额/杠杆联动）
  useEffect(() => {
    if (!visible) return;
    const timer = setTimeout(runPreview, 250);
    return () => clearTimeout(timer);
  }, [visible, runPreview]);

  // 打开时重置
  useEffect(() => {
    if (visible) {
      setStake('100');
      setLeverage(2);
      setPreview(null);
      setError(null);
      setRetryOdds(null);
      prevOddsRef.current = null;
      setOddsDir(null);
    }
  }, [visible]);

  const handlePlace = useCallback(async () => {
    if (!market || !preview || submitting) return; // 防重复提交
    setSubmitting(true);
    setError(null);
    try {
      const quoted = retryOdds ?? preview.tradableOdds;
      await lsmApi.place({
        marketId: market.id,
        outcomeIdx,
        stake: stakeNum,
        leverage,
        quotedOdds: quoted,
      });
      onPlaced?.();
      onClose();
    } catch (e: any) {
      const msg: string = e?.message || '';
      if (msg.startsWith('SLIPPAGE_EXCEEDED')) {
        // 解析新价，提示按新价重试
        const newOdds = Number(msg.split(':')[1]);
        if (!Number.isNaN(newOdds)) {
          setRetryOdds(newOdds);
          setPreview((p) => (p ? { ...p, tradableOdds: newOdds } : p));
          setError(tr('Odds moved, tap to confirm at new price', '赔率已变动，点按新价确认'));
        } else {
          setError(tr('Odds moved, please retry', '赔率变动，请重试'));
        }
      } else if (msg.includes('ODDS_STALE')) {
        setError(tr('Odds stale, betting paused', '赔率过期，暂停下单'));
      } else if (msg.includes('MARKET_SUSPENDED')) {
        setError(tr('Market suspended', '盘口已暂停'));
      } else if (msg.includes('RISK_LIMIT')) {
        setError(tr('Exceeds vault risk limit', '超过金库风险上限'));
      } else if (msg.includes('insufficient')) {
        setError(tr('Insufficient AXP balance', 'AXP 余额不足'));
      } else {
        setError(msg || tr('Order failed', '下单失败'));
      }
    } finally {
      setSubmitting(false);
    }
  }, [market, preview, submitting, retryOdds, stakeNum, leverage, outcomeIdx]);

  if (!market) return null;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={onClose} />
        <View style={styles.sheet}>
          <View style={styles.handle} />
          <ScrollView keyboardShouldPersistTaps="handled">
            <Text style={styles.title}>
              {market.homeTeam} vs {market.awayTeam}
            </Text>
            <Text style={styles.subtitle}>
              {tr('Backing', '看好')}: {outcomeLabel(market, outcomeIdx, zh)}
            </Text>

            {/* 赔率 + 涨跌徽标 */}
            <View style={styles.oddsRow}>
              <Text style={styles.oddsLabel}>{tr('Tradable Odds', '可成交赔率')}</Text>
              <View style={styles.oddsValWrap}>
                <Text style={styles.oddsVal}>
                  {preview ? preview.tradableOdds.toFixed(2) : '—'}
                </Text>
                {oddsDir && (
                  <Text style={[styles.oddsDir, { color: oddsDir === 'up' ? '#16a34a' : '#dc2626' }]}>
                    {oddsDir === 'up' ? '▲' : '▼'}
                  </Text>
                )}
              </View>
            </View>

            {/* 赔率走势图（辅助下单决策；高亮当前所选 outcome） */}
            <OddsHistoryChart
              marketId={market.id}
              focusOutcomeIdx={outcomeIdx}
              zh={zh}
              labels={[market.homeTeam, market.awayTeam, zh ? '平局' : 'Draw']}
            />

            {/* 保证金输入 */}
            <Text style={styles.fieldLabel}>{tr('Margin (AXP)', '保证金 (AXP)')}</Text>
            <TextInput
              style={styles.input}
              keyboardType="number-pad"
              value={stake}
              onChangeText={setStake}
              placeholder="100"
              placeholderTextColor={colors.textSecondary}
            />

            {/* 杠杆联动 */}
            <Text style={styles.fieldLabel}>{tr('Leverage', '杠杆')}</Text>
            <View style={styles.levRow}>
              {LEVERAGES.map((l) => (
                <TouchableOpacity
                  key={l}
                  style={[styles.levChip, leverage === l && styles.levChipActive]}
                  onPress={() => setLeverage(l)}
                >
                  <Text style={[styles.levText, leverage === l && styles.levTextActive]}>
                    {l}x
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* 预览明细 */}
            <View style={styles.previewBox}>
              {loading ? (
                <ActivityIndicator color={colors.primary} />
              ) : preview ? (
                <>
                  <Row label={tr('Notional', '名义敞口')} value={`${preview.notional} AXP`} />
                  <Row label={tr('Max Profit', '最大盈利')} value={`+${preview.maxProfit} AXP`} valueColor="#16a34a" />
                  <Row label={tr('Max Loss', '最大亏损')} value={`-${preview.maxLoss} AXP`} valueColor="#dc2626" />
                  <Row label={tr('Win Payout', '获胜派彩')} value={`${preview.winPayout} AXP`} bold />
                </>
              ) : (
                <Text style={styles.hint}>{tr('Enter margin to preview', '输入保证金查看预览')}</Text>
              )}
            </View>

            {error && <Text style={styles.error}>{error}</Text>}

            <TouchableOpacity
              style={[styles.placeBtn, (!preview || submitting || !market.tradable) && styles.placeBtnDisabled]}
              onPress={handlePlace}
              disabled={!preview || submitting || !market.tradable}
            >
              {submitting ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.placeBtnText}>
                  {retryOdds
                    ? tr(`Confirm @ ${retryOdds.toFixed(2)}`, `按 ${retryOdds.toFixed(2)} 确认`)
                    : tr('Place Bet', '确认下单')}
                </Text>
              )}
            </TouchableOpacity>

            <Text style={styles.disclaimer}>
              {tr(
                'AXP is non-withdrawable, platform-only. Not investment advice.',
                'AXP 不可提现、仅站内用途。非投资建议。',
              )}
            </Text>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function Row({
  label,
  value,
  valueColor,
  bold,
}: {
  label: string;
  value: string;
  valueColor?: string;
  bold?: boolean;
}) {
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={[styles.detailValue, valueColor ? { color: valueColor } : null, bold ? { fontWeight: '800' } : null]}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.5)' },
  sheet: {
    backgroundColor: colors.card,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    maxHeight: '88%',
  },
  handle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border, marginBottom: 12 },
  title: { fontSize: 18, fontWeight: '800', color: colors.text },
  subtitle: { fontSize: 14, color: colors.textSecondary, marginTop: 4, marginBottom: 12 },
  oddsRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 8 },
  oddsLabel: { fontSize: 14, color: colors.textSecondary },
  oddsValWrap: { flexDirection: 'row', alignItems: 'center' },
  oddsVal: { fontSize: 22, fontWeight: '800', color: colors.primary },
  oddsDir: { fontSize: 16, marginLeft: 6 },
  fieldLabel: { fontSize: 13, color: colors.textSecondary, marginTop: 14, marginBottom: 6 },
  input: {
    backgroundColor: colors.background,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 18,
    color: colors.text,
    borderWidth: 1,
    borderColor: colors.border,
  },
  levRow: { flexDirection: 'row', gap: 8 },
  levChip: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
  },
  levChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  levText: { fontSize: 15, fontWeight: '700', color: colors.text },
  levTextActive: { color: '#fff' },
  previewBox: { backgroundColor: colors.background, borderRadius: 12, padding: 14, marginTop: 16, minHeight: 60, justifyContent: 'center' },
  detailRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 },
  detailLabel: { fontSize: 14, color: colors.textSecondary },
  detailValue: { fontSize: 14, fontWeight: '600', color: colors.text },
  hint: { fontSize: 13, color: colors.textSecondary, textAlign: 'center' },
  error: { color: '#dc2626', fontSize: 13, marginTop: 10 },
  placeBtn: { backgroundColor: colors.primary, borderRadius: 12, paddingVertical: 15, alignItems: 'center', marginTop: 16 },
  placeBtnDisabled: { opacity: 0.5 },
  placeBtnText: { color: '#fff', fontSize: 16, fontWeight: '800' },
  disclaimer: { fontSize: 11, color: colors.textSecondary, textAlign: 'center', marginTop: 12, lineHeight: 16 },
});
