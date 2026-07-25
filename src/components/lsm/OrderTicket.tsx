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
import { lsmApi, LsmMarketView, LsmPreview, LsmAsset, formatAsset } from '../../services/lsm.api';
import { OddsHistoryChart } from './OddsHistoryChart';

const LEVERAGES = [1, 2, 5, 10];

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
  const [asset, setAsset] = useState<LsmAsset>('AXP');
  const [preview, setPreview] = useState<LsmPreview | null>(null);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retryOdds, setRetryOdds] = useState<number | null>(null);
  const prevOddsRef = useRef<number | null>(null);
  const [oddsDir, setOddsDir] = useState<'up' | 'down' | null>(null);

  // 提交给后端的保证金（资产最小单位）：AXP=整数点数；USDC=最小单位 0.01 USDC（用户输入 USDC，×100）。
  const rawStake = Number(stake) || 0;
  const stakeNum =
    asset === 'USDC' ? Math.max(0, Math.round(rawStake * 100)) : Math.max(0, Math.floor(rawStake));

  /** 切换计价资产并重置保证金为该资产的默认值。 */
  const switchAsset = useCallback((next: LsmAsset) => {
    setAsset(next);
    setStake(next === 'USDC' ? '5' : '100');
    setPreview(null);
    setError(null);
    setRetryOdds(null);
    prevOddsRef.current = null;
    setOddsDir(null);
  }, []);

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
        asset,
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
  }, [market, outcomeIdx, stakeNum, leverage, asset]);

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
      setAsset('AXP');
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
        asset,
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
        setError(
          asset === 'USDC'
            ? tr('Insufficient USDC balance', 'USDC 余额不足')
            : tr('Insufficient AXP balance', 'AXP 余额不足'),
        );
      } else {
        setError(msg || tr('Order failed', '下单失败'));
      }
    } finally {
      setSubmitting(false);
    }
  }, [market, preview, submitting, retryOdds, stakeNum, leverage, outcomeIdx, asset]);

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

            {/* 计价资产切换：AXP（免费玩）/ USDC（链上真实·测试网） */}
            <View style={styles.assetRow}>
              {(['AXP', 'USDC'] as LsmAsset[]).map((a) => (
                <TouchableOpacity
                  key={a}
                  style={[styles.assetChip, asset === a && styles.assetChipActive]}
                  onPress={() => switchAsset(a)}
                  testID={`lsm-asset-${a}`}
                >
                  <Text style={[styles.assetText, asset === a && styles.assetTextActive]}>{a}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <Text style={styles.assetHint}>
              {asset === 'USDC'
                ? tr('USDC: real on-chain settlement (testnet).', 'USDC：链上真实结算（测试网）。')
                : tr('AXP: free-to-play, platform points.', 'AXP：免费玩，站内积分。')}
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

            {/* 赔率走势图（辅助下单决策；高亮当前所选 outcome）。有预览时叠加入场/强平参考线。 */}
            <OddsHistoryChart
              marketId={market.id}
              focusOutcomeIdx={outcomeIdx}
              zh={zh}
              labels={[market.homeTeam, market.awayTeam, zh ? '平局' : 'Draw']}
              refLines={
                preview
                  ? [
                      {
                        odds: preview.tradableOdds,
                        color: '#38bdf8',
                        label: `${tr('Entry', '入场')} ${preview.tradableOdds.toFixed(2)}`,
                        dashed: true,
                      },
                      ...(preview.liquidationOdds != null
                        ? [
                            {
                              odds: preview.liquidationOdds,
                              color: '#f43f5e',
                              label: `${tr('Liq.', '强平')} ≥${preview.liquidationOdds.toFixed(2)}`,
                              dashed: true,
                            },
                          ]
                        : []),
                    ]
                  : []
              }
            />

            {/* 保证金输入 */}
            <Text style={styles.fieldLabel}>
              {asset === 'USDC' ? tr('Margin (USDC)', '保证金 (USDC)') : tr('Margin (AXP)', '保证金 (AXP)')}
            </Text>
            <TextInput
              style={styles.input}
              keyboardType={asset === 'USDC' ? 'decimal-pad' : 'number-pad'}
              value={stake}
              onChangeText={setStake}
              placeholder={asset === 'USDC' ? '5' : '100'}
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
                  <Row label={tr('Implied Prob.', '隐含概率')} value={`${Math.round((1 / preview.tradableOdds) * 100)}%`} />
                  <Row label={tr('Notional', '名义敞口')} value={formatAsset(preview.notional, asset)} />
                  <Row label={tr('Max Profit', '最大盈利')} value={`+${formatAsset(preview.maxProfit, asset)}`} valueColor="#16a34a" />
                  <Row label={tr('Max Loss', '最大亏损')} value={`-${formatAsset(preview.maxLoss, asset)}`} valueColor="#dc2626" />
                  <Row label={tr('Win Payout', '获胜派彩')} value={formatAsset(preview.winPayout, asset)} bold />
                  {stakeNum > 0 && (
                    <Row label={tr('Payout Multiple', '赔付倍数')} value={`${(preview.winPayout / stakeNum).toFixed(2)}x`} />
                  )}
                  {preview.openFee != null && preview.openFee > 0 && (
                    <Row label={tr('Open Fee', '开仓费')} value={`-${formatAsset(preview.openFee, asset)}`} valueColor={colors.textSecondary} />
                  )}
                  {preview.liquidationOdds != null && (
                    <Row label={tr('Liquidation Odds', '强平赔率')} value={`≥ ${preview.liquidationOdds.toFixed(2)}`} valueColor="#d97706" />
                  )}
                  {preview.slippageBps > 0 && (
                    <Row label={tr('Slippage', '滑点')} value={`${(preview.slippageBps / 100).toFixed(2)}%`} />
                  )}
                  <LiquidationBuffer tradableOdds={preview.tradableOdds} liquidationOdds={preview.liquidationOdds ?? null} zh={zh} />
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
              {asset === 'USDC'
                ? tr(
                    'USDC settles on-chain (testnet). Not investment advice.',
                    'USDC 为链上结算（测试网）。非投资建议。',
                  )
                : tr(
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

/**
 * 强平缓冲条：可成交赔率还能上涨多少（比例）才触及强平线。杠杆越高缓冲越小。
 * headroom = (liquidationOdds − tradableOdds) / tradableOdds。绿>50% / 琥珀>20% / 红。
 */
function LiquidationBuffer({
  tradableOdds,
  liquidationOdds,
  zh,
}: {
  tradableOdds: number;
  liquidationOdds: number | null;
  zh: boolean;
}) {
  if (liquidationOdds == null || !(tradableOdds > 0)) return null;
  const headroom = Math.max(0, (liquidationOdds - tradableOdds) / tradableOdds);
  const pct = Math.round(headroom * 100);
  const fill = Math.max(6, Math.min(100, pct));
  const tone = headroom > 0.5 ? '#16a34a' : headroom > 0.2 ? '#d97706' : '#dc2626';
  return (
    <View style={bufStyles.wrap}>
      <View style={bufStyles.head}>
        <Text style={bufStyles.label}>
          {zh ? '强平缓冲 · 赔率触及 ' : 'Liquidation buffer · triggers at '}
          <Text style={{ color: '#d97706', fontWeight: '800' }}>≥{liquidationOdds.toFixed(2)}</Text>
        </Text>
        <Text style={[bufStyles.pct, { color: tone }]}>+{pct}%</Text>
      </View>
      <View style={bufStyles.track}>
        <View style={[bufStyles.fill, { width: `${fill}%`, backgroundColor: tone }]} />
      </View>
      <Text style={bufStyles.note}>
        {zh
          ? '滚球中赔率涨破强平线 → 按残值结算并收强平罚金；倍数越高缓冲越小。'
          : 'If live odds rise past the line, the position is liquidated at residual value (fee applies). Higher leverage = tighter buffer.'}
      </Text>
    </View>
  );
}

const bufStyles = StyleSheet.create({
  wrap: { marginTop: 10, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 10 },
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  label: { fontSize: 11, color: colors.textSecondary, flex: 1 },
  pct: { fontSize: 12, fontWeight: '800' },
  track: { height: 6, borderRadius: 3, backgroundColor: colors.border, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 3 },
  note: { fontSize: 10, color: colors.textSecondary, marginTop: 6, lineHeight: 15 },
});

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
  assetRow: { flexDirection: 'row', gap: 8, marginTop: 4 },
  assetChip: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
  },
  assetChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  assetText: { fontSize: 15, fontWeight: '800', color: colors.text },
  assetTextActive: { color: '#fff' },
  assetHint: { fontSize: 12, color: colors.textSecondary, marginTop: 6 },
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
