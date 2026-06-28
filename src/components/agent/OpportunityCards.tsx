/**
 * OpportunityCards — 对话内「全网机会结果卡片」可复用组件（移动端）。
 *
 * 渲染一组聚合检索结果（AggregatedListing），每卡含来源徽标 / 品类 / 报价，以及围栏内
 * 「接单 / 下注 / 购买 / 雇佣」按钮（→ participateInListing → POST /ard/participate）；仅链接
 * 发现的条目显示「跳转外部」。供**主对话框**（AgentChatScreen）与机会助手屏共用，实现
 * 「在对话里展示检索结果 + 直接接单/下单」。
 *
 * 自洽：内部管理 busy / 成交结果态；不依赖外部状态。后端 /ard/search、/ard/participate 已就绪。
 */
import React, { useCallback, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, Linking, Alert } from 'react-native';
import { colors } from '../../theme/colors';
import { useI18n } from '../../stores/i18nStore';
import {
  participateInListing,
  type AggCategory,
  type AggregatedListing,
  type ParticipationAction,
  type ParticipateResult,
} from '../../services/aggregatedMarket.api';

const CATEGORY_LABEL: Record<AggCategory, { en: string; zh: string }> = {
  task: { en: 'Task', zh: '任务' },
  prediction: { en: 'Prediction', zh: '预测' },
  skill: { en: 'Skill', zh: '技能' },
  agent_rental: { en: 'Agent', zh: 'Agent' },
  resource: { en: 'Resource', zh: '资源' },
};

function actionForCategory(c: AggCategory | null): {
  action: ParticipationAction;
  label: { en: string; zh: string };
} {
  switch (c) {
    case 'prediction':
      return { action: 'purchase', label: { en: 'Bet', zh: '下注' } };
    case 'skill':
    case 'resource':
      return { action: 'purchase', label: { en: 'Buy', zh: '购买' } };
    case 'agent_rental':
      return { action: 'subscribe', label: { en: 'Hire', zh: '雇佣' } };
    case 'task':
    default:
      return { action: 'accept', label: { en: 'Accept', zh: '接单' } };
  }
}

export interface OpportunityCardsProps {
  listings: AggregatedListing[];
}

export function OpportunityCards({ listings }: OpportunityCardsProps) {
  const { t } = useI18n();
  const [busyCard, setBusyCard] = useState<string | null>(null);
  const [cardResult, setCardResult] = useState<Record<string, ParticipateResult>>({});

  const onParticipate = useCallback(
    async (listing: AggregatedListing) => {
      const { action } = actionForCategory(listing.category);
      if (!listing.canAccept) {
        if (listing.externalUrl) {
          Linking.openURL(listing.externalUrl).catch(() => {});
        } else {
          Alert.alert(
            t({ en: 'External only', zh: '仅外部跳转' }),
            t({ en: 'This listing is link-discovery only.', zh: '该条目仅支持跳转外部成交。' }),
          );
        }
        return;
      }
      setBusyCard(listing.identifier);
      try {
        const result = await participateInListing({ listing, action });
        setCardResult((prev) => ({ ...prev, [listing.identifier]: result }));
      } catch (e: any) {
        setCardResult((prev) => ({
          ...prev,
          [listing.identifier]: { ok: false, status: 'rejected', reason: String(e?.message || 'failed') },
        }));
      } finally {
        setBusyCard(null);
      }
    },
    [t],
  );

  return (
    <View style={styles.wrap}>
      {listings.map((listing) => {
        const { label } = actionForCategory(listing.category);
        const result = cardResult[listing.identifier];
        const busy = busyCard === listing.identifier;
        const priceText =
          listing.gmv > 0
            ? `${listing.gmv.toLocaleString()} ${listing.currency}`
            : t({ en: 'price varies', zh: '价格待定' });
        return (
          <View key={listing.identifier} style={styles.card}>
            <Text style={styles.cardTitle} numberOfLines={2}>{listing.displayName}</Text>
            <View style={styles.badgeRow}>
              <Text style={[styles.badge, listing.internal ? styles.badgeInternal : styles.badgeExternal]}>
                {listing.internal ? t({ en: 'Internal', zh: '自营' }) : listing.source}
              </Text>
              {listing.category ? <Text style={styles.badgeCat}>{t(CATEGORY_LABEL[listing.category])}</Text> : null}
              <Text style={styles.price}>{priceText}</Text>
            </View>
            {listing.description ? (
              <Text style={styles.cardDesc} numberOfLines={2}>{listing.description}</Text>
            ) : null}
            {result ? (
              <Text style={[styles.resultLine, result.ok ? styles.resultOk : styles.resultWarn]}>
                {result.ok
                  ? t({ en: `Done · ${result.status}`, zh: `已成交 · ${result.status}` })
                  : result.status === 'backend_gap'
                    ? t({ en: 'Accept backend pending; use external link.', zh: '代成交后端待上线，请用跳转外部' })
                    : t({ en: `Not completed: ${result.reason || result.status}`, zh: `未完成：${result.reason || result.status}` })}
              </Text>
            ) : null}
            <View style={styles.cardBtnRow}>
              <TouchableOpacity
                style={[styles.cardBtn, styles.cardBtnPrimary, busy && styles.cardBtnDisabled]}
                disabled={busy}
                onPress={() => onParticipate(listing)}
                activeOpacity={0.85}
              >
                {busy ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.cardBtnPrimaryText}>
                    {listing.canAccept ? t(label) : t({ en: 'Open', zh: '跳转' })}
                  </Text>
                )}
              </TouchableOpacity>
              {listing.externalUrl ? (
                <TouchableOpacity
                  style={[styles.cardBtn, styles.cardBtnGhost]}
                  onPress={() => Linking.openURL(listing.externalUrl!).catch(() => {})}
                  activeOpacity={0.85}
                >
                  <Text style={styles.cardBtnGhostText}>{t({ en: 'Details', zh: '详情' })}</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 8, marginTop: 4 },
  card: { backgroundColor: colors.bgCard, borderRadius: 12, borderWidth: 1, borderColor: colors.border, padding: 12 },
  cardTitle: { color: colors.textPrimary, fontSize: 15, fontWeight: '700' },
  badgeRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6, marginTop: 6 },
  badge: { fontSize: 10, fontWeight: '800', borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3, overflow: 'hidden' },
  badgeInternal: { color: '#fff', backgroundColor: '#16a34a' },
  badgeExternal: { color: '#fff', backgroundColor: '#6366f1' },
  badgeCat: { fontSize: 10, fontWeight: '700', color: colors.textSecondary, backgroundColor: colors.bgPrimary, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3, overflow: 'hidden' },
  price: { marginLeft: 'auto', color: colors.textPrimary, fontSize: 12, fontWeight: '700' },
  cardDesc: { color: colors.textSecondary, fontSize: 12, lineHeight: 18, marginTop: 6 },
  resultLine: { fontSize: 12, fontWeight: '700', marginTop: 8 },
  resultOk: { color: '#16a34a' },
  resultWarn: { color: '#d97706' },
  cardBtnRow: { flexDirection: 'row', gap: 8, marginTop: 10 },
  cardBtn: { flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  cardBtnPrimary: { backgroundColor: colors.accent },
  cardBtnPrimaryText: { color: '#fff', fontSize: 13, fontWeight: '800' },
  cardBtnGhost: { backgroundColor: 'transparent', borderWidth: 1, borderColor: colors.border },
  cardBtnGhostText: { color: colors.textPrimary, fontSize: 13, fontWeight: '700' },
  cardBtnDisabled: { opacity: 0.5 },
});

export default OpportunityCards;
