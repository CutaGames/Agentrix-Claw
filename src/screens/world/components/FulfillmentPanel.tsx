/**
 * FulfillmentPanel — 「我的世界」内履约视图（world-shop-fulfillment task 5 · R5.2/5.3/5.4）。
 *
 * spec: .kiro/specs/world-shop-fulfillment/{requirements,design}.md
 *   - 买家「我的订单/凭证」：voucher code 展示 + 履约状态 + 超时退款提示（R5.2）。
 *   - 卖家「待履约/待核销」：核销 voucher / 待履约 / 查看 agent 履约进度（R5.3）。
 *
 * 两个 Tab（买 / 卖）合并在一个面板内，嵌入 MyWorldScreen。数据走单一履约引擎的
 * 读侧端点（listMyOrders / listSellingOrders）；核销走受鉴权保护的 redeemVoucher
 * （后端校验调用者为卖家）。UI 文案默认中文，遵循既有 themedStyles / colors / useI18n 约定。
 */
import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';

import { colors } from '../../../theme/colors';
import { useI18n } from '../../../stores/i18nStore';
import { themedStyles } from '../../../theme/useTheme';
import {
  listMyOrders,
  listSellingOrders,
  redeemVoucher,
} from '../../../services/creationApi';
import type {
  BuyerFulfillmentOrderView,
  FulfillmentOrderStatus,
  FulfillmentOrderType,
  FulfillmentVoucherStatus,
  FulfillmentVoucherView,
  SellerFulfillmentOrderView,
} from '../../../../shared/types/creation-api';

type Translate = (d: { zh: string; en: string }) => string;
type Tab = 'buying' | 'selling';

/** 履约类型 → 友好标签。 */
function typeLabel(t: Translate, type: FulfillmentOrderType): string {
  switch (type) {
    case 'voucher':
      return t({ zh: '数字凭证', en: 'Voucher' });
    case 'agent':
      return t({ zh: 'Agent 履约', en: 'Agent' });
    case 'support':
      return t({ zh: '支持创作者', en: 'Support' });
    case 'manual':
      return t({ zh: '手动交付', en: 'Manual' });
  }
}

/** 订单状态 → 友好标签 + 色。 */
function orderStatusMeta(
  t: Translate,
  status: FulfillmentOrderStatus,
): { label: string; color: string } {
  switch (status) {
    case 'paid':
      return { label: t({ zh: '待履约', en: 'Pending' }), color: '#f59e0b' };
    case 'fulfilled':
      return { label: t({ zh: '已履约', en: 'Fulfilled' }), color: '#22c55e' };
    case 'refunded':
      return { label: t({ zh: '已退款', en: 'Refunded' }), color: '#6b7280' };
    case 'failed':
      return { label: t({ zh: '失败', en: 'Failed' }), color: '#ef4444' };
  }
}

/** 凭证状态 → 友好标签 + 色。 */
function voucherStatusMeta(
  t: Translate,
  status: FulfillmentVoucherStatus,
): { label: string; color: string } {
  switch (status) {
    case 'issued':
      return { label: t({ zh: '待核销', en: 'Issued' }), color: '#3b82f6' };
    case 'redeemed':
      return { label: t({ zh: '已核销', en: 'Redeemed' }), color: '#22c55e' };
    case 'revoked':
      return { label: t({ zh: '已作废', en: 'Revoked' }), color: '#6b7280' };
  }
}

export function FulfillmentPanel() {
  const { t } = useI18n();
  const [tab, setTab] = useState<Tab>('buying');
  const [buying, setBuying] = useState<BuyerFulfillmentOrderView[]>([]);
  const [selling, setSelling] = useState<SellerFulfillmentOrderView[]>([]);
  const [loading, setLoading] = useState(true);
  const [redeemingId, setRedeemingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    // Maestro E2E：合成 token 无后端授权，渲染确定性空态，避免挂起。
    if (process.env.EXPO_PUBLIC_MAESTRO_E2E === '1') {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [mine, sold] = await Promise.all([
        listMyOrders().catch(() => ({ orders: [] as BuyerFulfillmentOrderView[] })),
        listSellingOrders().catch(() => ({ orders: [] as SellerFulfillmentOrderView[] })),
      ]);
      setBuying(mine.orders ?? []);
      setSelling(sold.orders ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const onRedeem = useCallback(
    (voucher: FulfillmentVoucherView) => {
      Alert.alert(
        t({ zh: '核销凭证', en: 'Redeem voucher' }),
        t({
          zh: `确认核销凭证 ${voucher.code}？核销后不可撤销，且每张至多一次。`,
          en: `Redeem voucher ${voucher.code}? This cannot be undone and each voucher redeems at most once.`,
        }),
        [
          { text: t({ zh: '取消', en: 'Cancel' }), style: 'cancel' },
          {
            text: t({ zh: '核销', en: 'Redeem' }),
            onPress: async () => {
              setRedeemingId(voucher.id);
              try {
                await redeemVoucher(voucher.id);
                await load();
              } catch (e: any) {
                // 结构化错误（ALREADY_REDEEMED / VOUCHER_REVOKED / 非卖家 Forbidden）→ 友好提示。
                const msg =
                  e?.body?.message ??
                  e?.message ??
                  t({ zh: '核销失败，请稍后重试。', en: 'Redeem failed, try again.' });
                Alert.alert(t({ zh: '核销失败', en: 'Redeem failed' }), String(msg));
              } finally {
                setRedeemingId(null);
              }
            },
          },
        ],
      );
    },
    [t, load],
  );

  return (
    <View testID="fulfillment-panel">
      {/* Tab 切换：我买的 / 我卖的 */}
      <View style={styles.tabs}>
        <TouchableOpacity
          testID="fulfillment-tab-buying"
          style={[styles.tab, tab === 'buying' && styles.tabActive]}
          onPress={() => setTab('buying')}
        >
          <Text style={[styles.tabText, tab === 'buying' && styles.tabTextActive]}>
            🎟️ {t({ zh: '我的订单/凭证', en: 'My Orders' })}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          testID="fulfillment-tab-selling"
          style={[styles.tab, tab === 'selling' && styles.tabActive]}
          onPress={() => setTab('selling')}
        >
          <Text style={[styles.tabText, tab === 'selling' && styles.tabTextActive]}>
            📦 {t({ zh: '待履约/待核销', en: 'To Fulfill' })}
          </Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <ActivityIndicator color={colors.accent} style={{ marginVertical: 20 }} />
      ) : tab === 'buying' ? (
        <BuyerList orders={buying} t={t} />
      ) : (
        <SellerList
          orders={selling}
          t={t}
          redeemingId={redeemingId}
          onRedeem={onRedeem}
        />
      )}
    </View>
  );
}

/** 买家列表：每单展示履约状态 + 凭证 code + 超时退款提示。 */
function BuyerList({
  orders,
  t,
}: {
  orders: BuyerFulfillmentOrderView[];
  t: Translate;
}) {
  if (orders.length === 0) {
    return (
      <Text style={styles.dim} testID="fulfillment-buying-empty">
        {t({ zh: '还没有订单。逛逛店铺，买点东西吧。', en: 'No orders yet. Browse shops and buy something.' })}
      </Text>
    );
  }
  return (
    <>
      {orders.map((o) => {
        const st = orderStatusMeta(t, o.status);
        const async = o.fulfillmentType === 'agent' || o.fulfillmentType === 'manual';
        return (
          <View key={o.id} style={styles.orderCard} testID={`fulfillment-order-${o.id}`}>
            <View style={styles.orderHeader}>
              <Text style={styles.orderTitle} numberOfLines={1}>
                {o.creationTitle || t({ zh: '创作', en: 'Creation' })} · {o.offeringName || t({ zh: '商品', en: 'Item' })}
              </Text>
              <View style={[styles.badge, { borderColor: st.color }]}>
                <Text style={[styles.badgeText, { color: st.color }]}>{st.label}</Text>
              </View>
            </View>
            <Text style={styles.orderMeta}>
              {typeLabel(t, o.fulfillmentType)} · {o.amount} {o.currency}
            </Text>

            {/* 凭证 code 展示（R5.2）。 */}
            {o.vouchers.map((v) => {
              const vm = voucherStatusMeta(t, v.status);
              return (
                <View key={v.id} style={styles.voucherRow} testID={`fulfillment-voucher-${v.id}`}>
                  <Text style={styles.voucherCode} selectable>{v.code}</Text>
                  <Text style={[styles.voucherStatus, { color: vm.color }]}>{vm.label}</Text>
                </View>
              );
            })}

            {/* 支持/回执文案。 */}
            {o.fulfillmentType === 'support' && (o.deliverable as any)?.statement ? (
              <Text style={styles.dim}>{String((o.deliverable as any).statement)}</Text>
            ) : null}

            {/* 异步履约（agent/manual）：进行中 + 超时退款提示（R5.2）。 */}
            {async && o.status === 'paid' ? (
              <Text style={styles.hint}>
                ⏳ {t({
                  zh: '履约进行中。若超时（默认 7 天）未完成，将自动退款到你的余额。',
                  en: 'Fulfillment in progress. If it times out (default 7 days), you will be refunded automatically.',
                })}
              </Text>
            ) : null}
          </View>
        );
      })}
    </>
  );
}

/** 卖家列表：待履约 + 待核销（核销按钮）+ agent 进度。 */
function SellerList({
  orders,
  t,
  redeemingId,
  onRedeem,
}: {
  orders: SellerFulfillmentOrderView[];
  t: Translate;
  redeemingId: string | null;
  onRedeem: (v: FulfillmentVoucherView) => void;
}) {
  if (orders.length === 0) {
    return (
      <Text style={styles.dim} testID="fulfillment-selling-empty">
        {t({ zh: '暂无待履约/待核销的订单。', en: 'No orders to fulfill or redeem yet.' })}
      </Text>
    );
  }
  return (
    <>
      {orders.map((o) => {
        const st = orderStatusMeta(t, o.status);
        return (
          <View key={o.id} style={styles.orderCard} testID={`fulfillment-sell-${o.id}`}>
            <View style={styles.orderHeader}>
              <Text style={styles.orderTitle} numberOfLines={1}>
                {o.creationTitle || t({ zh: '创作', en: 'Creation' })} · {o.offeringName || t({ zh: '商品', en: 'Item' })}
              </Text>
              <View style={[styles.badge, { borderColor: st.color }]}>
                <Text style={[styles.badgeText, { color: st.color }]}>{st.label}</Text>
              </View>
            </View>
            <Text style={styles.orderMeta}>
              {typeLabel(t, o.fulfillmentType)} · {o.amount} {o.currency}
            </Text>

            {/* voucher 型：列出凭证 + 核销按钮（仅 issued 可核销）。 */}
            {o.vouchers.map((v) => {
              const vm = voucherStatusMeta(t, v.status);
              const canRedeem = v.status === 'issued';
              const busy = redeemingId === v.id;
              return (
                <View key={v.id} style={styles.voucherRow} testID={`fulfillment-sell-voucher-${v.id}`}>
                  <Text style={styles.voucherCode} selectable>{v.code}</Text>
                  {canRedeem ? (
                    <TouchableOpacity
                      testID={`fulfillment-redeem-${v.id}`}
                      style={[styles.redeemBtn, busy && styles.btnDisabled]}
                      onPress={() => onRedeem(v)}
                      disabled={busy}
                    >
                      <Text style={styles.redeemText}>
                        {busy ? '…' : t({ zh: '核销', en: 'Redeem' })}
                      </Text>
                    </TouchableOpacity>
                  ) : (
                    <Text style={[styles.voucherStatus, { color: vm.color }]}>{vm.label}</Text>
                  )}
                </View>
              );
            })}

            {/* agent/manual 型：待履约进度提示。 */}
            {(o.fulfillmentType === 'agent' || o.fulfillmentType === 'manual') && o.status === 'paid' ? (
              <Text style={styles.hint}>
                {o.fulfillmentType === 'agent'
                  ? t({ zh: '🤖 已派发给你的 Agent，完成后确认即可放款。', en: '🤖 Dispatched to your agent; confirm to release funds.' })
                  : t({ zh: '✍️ 待你手动交付，交付后标记完成放款。', en: '✍️ Awaiting manual delivery; mark done to release funds.' })}
              </Text>
            ) : null}
          </View>
        );
      })}
    </>
  );
}

const styles = themedStyles(() => StyleSheet.create({
  tabs: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  tab: { flex: 1, paddingVertical: 10, borderRadius: 10, backgroundColor: colors.bgCard, borderWidth: 1, borderColor: colors.border, alignItems: 'center' },
  tabActive: { borderColor: colors.accent, backgroundColor: colors.bgCard },
  tabText: { color: colors.textMuted, fontSize: 13, fontWeight: '700' },
  tabTextActive: { color: colors.accent },
  dim: { color: colors.textMuted, fontSize: 13, lineHeight: 19, paddingVertical: 8 },
  hint: { color: colors.textMuted, fontSize: 12, lineHeight: 18, marginTop: 8 },
  orderCard: { backgroundColor: colors.bgCard, borderRadius: 12, padding: 14, marginBottom: 8, borderWidth: 1, borderColor: colors.border },
  orderHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  orderTitle: { flex: 1, color: colors.textPrimary, fontSize: 14, fontWeight: '700' },
  orderMeta: { color: colors.textMuted, fontSize: 12, marginTop: 4 },
  badge: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  badgeText: { fontSize: 11, fontWeight: '700' },
  voucherRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: colors.bgPrimary, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, marginTop: 8, gap: 8 },
  voucherCode: { flex: 1, color: colors.textPrimary, fontSize: 13, fontWeight: '700', fontFamily: 'monospace' },
  voucherStatus: { fontSize: 12, fontWeight: '700' },
  redeemBtn: { backgroundColor: colors.accent, borderRadius: 8, paddingHorizontal: 14, paddingVertical: 6 },
  redeemText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  btnDisabled: { opacity: 0.5 },
}));

export default FulfillmentPanel;
