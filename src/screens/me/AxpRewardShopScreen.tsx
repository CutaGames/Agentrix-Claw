/**
 * AxpRewardShopScreen — Sprint E real implementation.
 *
 * AXP redemption shop per cross-platform PRD §13.6.3:
 *   - Subscription discount redemption (up to 20%)
 *   - Special skin / NFT preorder
 *   - Limited event tickets
 *   - Draw / lottery (100 AXP per pull)
 *   - PetCreator extra quota (+5 generations for 300 AXP)
 *   - Marketplace card pin 24h (200 AXP)
 */
import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { colors } from '../../theme/colors';
import { useI18n } from '../../stores/i18nStore';
import { fetchAxpBalance, spendAxp } from '../../services/axp.api';
import { apiFetch } from '../../services/api';

// ── Types ────────────────────────────────────────────────────

interface RedeemItem {
  id: string;
  category: 'subscription' | 'skin' | 'ticket' | 'lottery' | 'quota' | 'boost';
  title_en: string;
  title_zh: string;
  description_en: string;
  description_zh: string;
  axp_cost: number;
  stock: number | null; // null = unlimited
  emoji: string;
  highlight?: boolean;
}

interface RedeemCatalog {
  items: RedeemItem[];
}

interface RedeemResult {
  success: boolean;
  reward_description: string;
  ledger_id: string;
  balance: number;
}

// ── API ──────────────────────────────────────────────────────

async function fetchRedeemCatalog(): Promise<RedeemCatalog> {
  return apiFetch<RedeemCatalog>('/v1/axp/redeem/catalog');
}

async function redeemItem(itemId: string): Promise<RedeemResult> {
  return apiFetch<RedeemResult>('/v1/axp/redeem', {
    method: 'POST',
    body: JSON.stringify({ item_id: itemId }),
  });
}

// ── Fallback catalog (used when API unavailable) ─────────────

const FALLBACK_CATALOG: RedeemItem[] = [
  {
    id: 'sub_discount_5',
    category: 'subscription',
    title_en: '5% Subscription Discount',
    title_zh: '订阅 5% 折扣券',
    description_en: 'Apply to next billing cycle. Stacks up to 20%.',
    description_zh: '下个账单周期生效，最多叠加 20%。',
    axp_cost: 500,
    stock: null,
    emoji: '🎫',
  },
  {
    id: 'sub_discount_10',
    category: 'subscription',
    title_en: '10% Subscription Discount',
    title_zh: '订阅 10% 折扣券',
    description_en: 'Apply to next billing cycle. Stacks up to 20%.',
    description_zh: '下个账单周期生效，最多叠加 20%。',
    axp_cost: 1000,
    stock: null,
    emoji: '🎫',
  },
  {
    id: 'pet_quota_5',
    category: 'quota',
    title_en: '+5 Pet Creations',
    title_zh: '宠物创作 +5 次',
    description_en: 'Add 5 extra PetCreator generations this month.',
    description_zh: '本月额外 5 次 PetCreator 生成配额。',
    axp_cost: 300,
    stock: null,
    emoji: '✨',
  },
  {
    id: 'marketplace_pin_24h',
    category: 'boost',
    title_en: 'Marketplace Pin 24h',
    title_zh: '集市卡片置顶 24h',
    description_en: 'Pin your listing to the top of Plaza for 24 hours.',
    description_zh: '你的挂牌在集市顶部展示 24 小时。',
    axp_cost: 200,
    stock: null,
    emoji: '📌',
  },
  {
    id: 'lottery_pull',
    category: 'lottery',
    title_en: 'Lucky Draw (1 pull)',
    title_zh: '幸运抽奖（1 次）',
    description_en: 'Win limited skins, AXP bonus, or rare items.',
    description_zh: '有机会赢限定皮肤、AXP 奖励或稀有道具。',
    axp_cost: 100,
    stock: null,
    emoji: '🎰',
    highlight: true,
  },
  {
    id: 'limited_skin_cyber_cat',
    category: 'skin',
    title_en: 'Limited: Cyber Cat Skin',
    title_zh: '限定：赛博猫皮肤',
    description_en: 'Exclusive skin. Only 50 available this month.',
    description_zh: '独家限定皮肤，本月仅 50 份。',
    axp_cost: 2000,
    stock: 50,
    emoji: '🐱',
    highlight: true,
  },
  {
    id: 'a2a_priority',
    category: 'boost',
    title_en: 'A2A Priority Match (7 days)',
    title_zh: 'A2A 优先匹配（7 天）',
    description_en: 'Your pet gets priority in task matching for 7 days.',
    description_zh: '主宠在任务匹配中获得 7 天优先权。',
    axp_cost: 500,
    stock: null,
    emoji: '⚡',
  },
  {
    id: 'nft_preorder',
    category: 'ticket',
    title_en: 'NFT Preorder Ticket',
    title_zh: 'NFT 预售资格',
    description_en: 'Reserve a spot for the next NFT drop.',
    description_zh: '预留下一次 NFT 发售的名额。',
    axp_cost: 2000,
    stock: 20,
    emoji: '🎟️',
  },
];

// ── Category labels ──────────────────────────────────────────

const CATEGORY_LABELS: Record<string, { en: string; zh: string }> = {
  subscription: { en: 'Subscription', zh: '订阅' },
  skin: { en: 'Limited Skins', zh: '限定皮肤' },
  ticket: { en: 'Tickets & Preorders', zh: '门票与预售' },
  lottery: { en: 'Lucky Draw', zh: '幸运抽奖' },
  quota: { en: 'Quota & Extras', zh: '配额加购' },
  boost: { en: 'Boosts', zh: '加速与置顶' },
};

// ── Component ────────────────────────────────────────────────

export function AxpRewardShopScreen() {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const [redeeming, setRedeeming] = useState<string | null>(null);

  const balanceQ = useQuery({
    queryKey: ['axp-balance'],
    queryFn: fetchAxpBalance,
    staleTime: 30_000,
  });

  const catalogQ = useQuery({
    queryKey: ['axp-redeem-catalog'],
    queryFn: fetchRedeemCatalog,
    staleTime: 5 * 60_000,
    retry: 1,
  });

  const redeemMut = useMutation({
    mutationFn: redeemItem,
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['axp-balance'] });
      queryClient.invalidateQueries({ queryKey: ['axp-history'] });
      queryClient.invalidateQueries({ queryKey: ['axp-redeem-catalog'] });
      Alert.alert(
        t({ en: 'Redeemed!', zh: '兑换成功！' }),
        result.reward_description,
      );
      setRedeeming(null);
    },
    onError: (err: any) => {
      Alert.alert(
        t({ en: 'Failed', zh: '兑换失败' }),
        err?.message ?? t({ en: 'Unknown error', zh: '未知错误' }),
      );
      setRedeeming(null);
    },
  });

  const onRedeem = useCallback(
    (item: RedeemItem) => {
      const balance = balanceQ.data?.balance ?? 0;
      if (balance < item.axp_cost) {
        Alert.alert(
          t({ en: 'Insufficient AXP', zh: 'AXP 不足' }),
          t({
            en: `You need ${item.axp_cost} AXP but only have ${balance}.`,
            zh: `需要 ${item.axp_cost} AXP，当前余额 ${balance}。`,
          }),
        );
        return;
      }
      Alert.alert(
        t({ en: 'Confirm Redeem', zh: '确认兑换' }),
        t({
          en: `Spend ${item.axp_cost} AXP for "${item.title_en}"?`,
          zh: `花费 ${item.axp_cost} AXP 兑换「${item.title_zh}」？`,
        }),
        [
          { text: t({ en: 'Cancel', zh: '取消' }), style: 'cancel' },
          {
            text: t({ en: 'Redeem', zh: '兑换' }),
            onPress: () => {
              setRedeeming(item.id);
              redeemMut.mutate(item.id);
            },
          },
        ],
      );
    },
    [balanceQ.data, redeemMut, t],
  );

  const onRefresh = useCallback(() => {
    balanceQ.refetch();
    catalogQ.refetch();
  }, [balanceQ, catalogQ]);

  const items = catalogQ.data?.items ?? FALLBACK_CATALOG;
  const balance = balanceQ.data?.balance ?? 0;

  // Group by category
  const grouped = items.reduce<Record<string, RedeemItem[]>>((acc, item) => {
    if (!acc[item.category]) acc[item.category] = [];
    acc[item.category].push(item);
    return acc;
  }, {});

  const categoryOrder = ['lottery', 'skin', 'quota', 'boost', 'subscription', 'ticket'];

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl
          refreshing={balanceQ.isRefetching || catalogQ.isRefetching}
          onRefresh={onRefresh}
          tintColor={colors.accent}
        />
      }
    >
      {/* Balance header */}
      <View style={styles.balanceHeader}>
        <Text style={styles.balanceLabel}>{t({ en: 'Available', zh: '可用余额' })}</Text>
        <Text style={styles.balanceValue}>💎 {balance.toLocaleString()} AXP</Text>
        <Text style={styles.balanceSub}>≈ ${(balance * 0.001).toFixed(2)}</Text>
      </View>

      {/* Catalog */}
      {categoryOrder.map((cat) => {
        const catItems = grouped[cat];
        if (!catItems || catItems.length === 0) return null;
        const label = CATEGORY_LABELS[cat] ?? { en: cat, zh: cat };
        return (
          <View key={cat} style={styles.section}>
            <Text style={styles.sectionTitle}>{t(label)}</Text>
            {catItems.map((item) => {
              const canAfford = balance >= item.axp_cost;
              const isBusy = redeeming === item.id;
              const soldOut = item.stock !== null && item.stock <= 0;
              return (
                <View
                  key={item.id}
                  style={[styles.card, item.highlight && styles.cardHighlight]}
                >
                  <View style={styles.cardHeader}>
                    <Text style={styles.cardEmoji}>{item.emoji}</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.cardTitle}>
                        {t({ en: item.title_en, zh: item.title_zh })}
                      </Text>
                      <Text style={styles.cardDesc}>
                        {t({ en: item.description_en, zh: item.description_zh })}
                      </Text>
                    </View>
                  </View>
                  <View style={styles.cardFooter}>
                    <View>
                      <Text style={[styles.cardCost, !canAfford && styles.cardCostInsufficient]}>
                        -{item.axp_cost.toLocaleString()} AXP
                      </Text>
                      {item.stock !== null && (
                        <Text style={styles.cardStock}>
                          {t({ en: `${item.stock} left`, zh: `剩余 ${item.stock}` })}
                        </Text>
                      )}
                    </View>
                    <TouchableOpacity
                      style={[
                        styles.redeemBtn,
                        (!canAfford || soldOut) && styles.redeemBtnDisabled,
                      ]}
                      disabled={!canAfford || soldOut || isBusy}
                      onPress={() => onRedeem(item)}
                    >
                      {isBusy ? (
                        <ActivityIndicator color="#fff" size="small" />
                      ) : (
                        <Text style={styles.redeemBtnText}>
                          {soldOut
                            ? t({ en: 'Sold Out', zh: '已售罄' })
                            : t({ en: 'Redeem', zh: '兑换' })}
                        </Text>
                      )}
                    </TouchableOpacity>
                  </View>
                </View>
              );
            })}
          </View>
        );
      })}

      <Text style={styles.footer}>
        {t({
          en: '1 AXP = $0.001 · Redeemed items are non-refundable · AXP expires 12 months from earn date.',
          zh: '1 AXP = $0.001 · 兑换不可退 · AXP 获得后 12 个月过期。',
        })}
      </Text>
    </ScrollView>
  );
}

// ── Styles ───────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgPrimary },
  content: { padding: 16, paddingBottom: 40 },
  // Balance header
  balanceHeader: {
    backgroundColor: colors.accent + '15',
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.accent + '40',
    marginBottom: 20,
  },
  balanceLabel: { fontSize: 12, color: colors.textMuted, marginBottom: 4 },
  balanceValue: { fontSize: 28, fontWeight: '800', color: colors.accent, marginBottom: 2 },
  balanceSub: { fontSize: 12, color: colors.textMuted },
  // Section
  section: { marginBottom: 20 },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 10,
  },
  // Card
  card: {
    backgroundColor: colors.bgCard,
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 10,
  },
  cardHighlight: {
    borderColor: colors.accent + '60',
    backgroundColor: colors.accent + '08',
  },
  cardHeader: { flexDirection: 'row', gap: 12, marginBottom: 10 },
  cardEmoji: { fontSize: 28 },
  cardTitle: { fontSize: 14, fontWeight: '700', color: colors.textPrimary, marginBottom: 2 },
  cardDesc: { fontSize: 12, color: colors.textMuted, lineHeight: 17 },
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  cardCost: { fontSize: 14, fontWeight: '700', color: colors.accent },
  cardCostInsufficient: { color: '#ef4444' },
  cardStock: { fontSize: 11, color: colors.textMuted, marginTop: 2 },
  // Redeem button
  redeemBtn: {
    backgroundColor: colors.accent,
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 10,
    minWidth: 80,
    alignItems: 'center',
  },
  redeemBtnDisabled: { backgroundColor: colors.border, opacity: 0.6 },
  redeemBtnText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  // Footer
  footer: {
    textAlign: 'center',
    fontSize: 11,
    color: colors.textMuted,
    marginTop: 12,
    lineHeight: 16,
    opacity: 0.7,
  },
});
