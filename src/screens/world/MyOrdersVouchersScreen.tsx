/**
 * MyOrdersVouchersScreen — 买家「我的订单 / 我的凭证」(world-growth-mobile-experience · task 7.1)。
 *
 * spec: .kiro/specs/world-growth-mobile-experience/{requirements,design}.md
 *   - _Requirements:
 *       5.2 —— 购买结算成功后,订单在「我的订单」(`creationApi.listMyOrders`)可见。
 *       5.3 —— voucher 履约类型的购买,对应凭证在「我的凭证」(`creationApi.listMyVouchers`)可见。
 *
 * 复用锚点(不重建):读侧履约视图 `creationApi.listMyOrders` / `listMyVouchers`
 * (world-shop-fulfillment task 5 的单一履约引擎读侧),本屏只做展示 + 分段切换 + 刷新。
 *
 * 定位:下单成功后从 ShopQuickOrder / 体验宿主可达此屏,校验「订单/凭证可见」这条闭环。
 */
import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { colors } from '../../theme/colors';
import { useI18n } from '../../stores/i18nStore';
import { listMyOrders, listMyVouchers } from '../../services/creationApi';
import type {
  BuyerFulfillmentOrderView,
  FulfillmentVoucherView,
  FulfillmentOrderStatus,
  FulfillmentVoucherStatus,
} from '../../../shared/types/creation-api';
import { themedStyles } from '../../theme/useTheme';

type Tab = 'orders' | 'vouchers';

type Translate = (d: { zh: string; en: string }) => string;

/** 订单状态 → 友好文案 + 配色。 */
function orderStatusMeta(status: FulfillmentOrderStatus, t: Translate): { label: string; color: string } {
  switch (status) {
    case 'fulfilled':
      return { label: t({ zh: '已履约', en: 'Fulfilled' }), color: colors.success };
    case 'paid':
      return { label: t({ zh: '待履约', en: 'Paid' }), color: colors.warning };
    case 'refunded':
      return { label: t({ zh: '已退款', en: 'Refunded' }), color: colors.textMuted };
    case 'failed':
    default:
      return { label: t({ zh: '失败', en: 'Failed' }), color: colors.danger };
  }
}

/** 凭证状态 → 友好文案 + 配色。 */
function voucherStatusMeta(status: FulfillmentVoucherStatus, t: Translate): { label: string; color: string } {
  switch (status) {
    case 'issued':
      return { label: t({ zh: '未核销', en: 'Active' }), color: colors.success };
    case 'redeemed':
      return { label: t({ zh: '已核销', en: 'Redeemed' }), color: colors.textMuted };
    case 'revoked':
    default:
      return { label: t({ zh: '已作废', en: 'Revoked' }), color: colors.danger };
  }
}

function formatTime(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return '';
  const d = new Date(ms);
  return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours().toString().padStart(2, '0')}:${d
    .getMinutes()
    .toString()
    .padStart(2, '0')}`;
}

export default function MyOrdersVouchersScreen() {
  const { t } = useI18n();
  const [tab, setTab] = useState<Tab>('orders');
  const [orders, setOrders] = useState<BuyerFulfillmentOrderView[]>([]);
  const [vouchers, setVouchers] = useState<FulfillmentVoucherView[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [o, v] = await Promise.all([listMyOrders(), listMyVouchers()]);
      setOrders(o.orders ?? []);
      setVouchers(v.vouchers ?? []);
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    load();
  }, [load]);

  const renderOrder = useCallback(
    ({ item }: { item: BuyerFulfillmentOrderView }) => {
      const meta = orderStatusMeta(item.status, t);
      return (
        <View style={styles.card} testID={`my-order-${item.id}`}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardTitle} numberOfLines={1}>
              {item.offeringName || item.creationTitle || t({ zh: '订单', en: 'Order' })}
            </Text>
            <Text style={[styles.status, { color: meta.color }]}>{meta.label}</Text>
          </View>
          {item.creationTitle ? (
            <Text style={styles.sub} numberOfLines={1}>
              {item.creationTitle}
            </Text>
          ) : null}
          <View style={styles.cardFooter}>
            <Text style={styles.date}>{formatTime(item.createdAt)}</Text>
            <Text style={styles.amount}>
              {item.amount} {item.currency}
            </Text>
          </View>
          {item.vouchers.length > 0 ? (
            <Text style={styles.voucherHint}>
              🎟️ {t({ zh: '含凭证', en: 'Voucher' })} · {item.vouchers.length}
            </Text>
          ) : null}
        </View>
      );
    },
    [t],
  );

  const renderVoucher = useCallback(
    ({ item }: { item: FulfillmentVoucherView }) => {
      const meta = voucherStatusMeta(item.status, t);
      return (
        <View style={styles.card} testID={`my-voucher-${item.id}`}>
          <View style={styles.cardHeader}>
            <Text style={styles.voucherCode} numberOfLines={1}>
              🎟️ {item.code}
            </Text>
            <Text style={[styles.status, { color: meta.color }]}>{meta.label}</Text>
          </View>
          <View style={styles.cardFooter}>
            <Text style={styles.date}>{formatTime(item.issuedAt)}</Text>
            {item.redeemedAt ? (
              <Text style={styles.date}>
                {t({ zh: '核销于', en: 'Redeemed' })} {formatTime(item.redeemedAt)}
              </Text>
            ) : null}
          </View>
        </View>
      );
    },
    [t],
  );

  const renderEmpty = () => {
    if (loading) return null;
    return (
      <View style={styles.empty} testID="my-orders-empty">
        <Text style={styles.emptyIcon}>{tab === 'orders' ? '📋' : '🎟️'}</Text>
        <Text style={styles.emptyText}>
          {tab === 'orders'
            ? t({ zh: '暂无订单', en: 'No orders yet' })
            : t({ zh: '暂无凭证', en: 'No vouchers yet' })}
        </Text>
        <Text style={styles.emptySub}>
          {t({ zh: '去创作流里逛逛,下单后会出现在这里。', en: 'Browse the feed — your orders show up here.' })}
        </Text>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      {/* 分段:我的订单 / 我的凭证 */}
      <View style={styles.tabBar}>
        <TouchableOpacity
          testID="my-orders-tab"
          style={[styles.tab, tab === 'orders' && styles.tabActive]}
          onPress={() => setTab('orders')}
        >
          <Text style={[styles.tabText, tab === 'orders' && styles.tabTextActive]}>
            📋 {t({ zh: '我的订单', en: 'My Orders' })}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          testID="my-vouchers-tab"
          style={[styles.tab, tab === 'vouchers' && styles.tabActive]}
          onPress={() => setTab('vouchers')}
        >
          <Text style={[styles.tabText, tab === 'vouchers' && styles.tabTextActive]}>
            🎟️ {t({ zh: '我的凭证', en: 'My Vouchers' })}
          </Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.accent} />
        </View>
      ) : error ? (
        <View style={styles.center}>
          <Text style={styles.emptyIcon}>⚠️</Text>
          <Text style={styles.emptyText}>{t({ zh: '加载失败', en: 'Load failed' })}</Text>
          <Text style={styles.emptySub}>{error}</Text>
          <TouchableOpacity style={styles.retryBtn} onPress={onRefresh} testID="my-orders-retry">
            <Text style={styles.retryText}>↻ {t({ zh: '重试', en: 'Retry' })}</Text>
          </TouchableOpacity>
        </View>
      ) : tab === 'orders' ? (
        <FlatList
          data={orders}
          renderItem={renderOrder}
          keyExtractor={(o) => o.id}
          ListEmptyComponent={renderEmpty}
          contentContainerStyle={styles.listContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />}
        />
      ) : (
        <FlatList
          data={vouchers}
          renderItem={renderVoucher}
          keyExtractor={(v) => v.id}
          ListEmptyComponent={renderEmpty}
          contentContainerStyle={styles.listContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />}
        />
      )}
    </View>
  );
}

const styles = themedStyles(() => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgPrimary },
  tabBar: { flexDirection: 'row', gap: 8, padding: 12, paddingTop: 56 },
  tab: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: 'center',
    backgroundColor: colors.bgCard,
    borderWidth: 1,
    borderColor: colors.border,
  },
  tabActive: { borderColor: colors.accent, backgroundColor: colors.input },
  tabText: { color: colors.textSecondary, fontSize: 14, fontWeight: '700' },
  tabTextActive: { color: colors.textPrimary },
  listContent: { padding: 16, paddingBottom: 24 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8, padding: 24 },
  card: {
    backgroundColor: colors.bgCard,
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  cardTitle: { color: colors.textPrimary, fontSize: 15, fontWeight: '700', flex: 1, marginRight: 8 },
  voucherCode: { color: colors.accent, fontSize: 15, fontWeight: '800', flex: 1, marginRight: 8 },
  status: { fontSize: 12, fontWeight: '700' },
  sub: { color: colors.textSecondary, fontSize: 13, marginBottom: 6 },
  cardFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  date: { color: colors.textMuted, fontSize: 12 },
  amount: { color: colors.textPrimary, fontSize: 14, fontWeight: '700' },
  voucherHint: { color: colors.textSecondary, fontSize: 12, marginTop: 6 },
  empty: { alignItems: 'center', paddingTop: 60, gap: 6 },
  emptyIcon: { fontSize: 40 },
  emptyText: { color: colors.textPrimary, fontSize: 16, fontWeight: '700' },
  emptySub: { color: colors.textMuted, fontSize: 13, textAlign: 'center', paddingHorizontal: 24 },
  retryBtn: {
    marginTop: 8,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: colors.accent,
  },
  retryText: { color: colors.textInverse, fontSize: 14, fontWeight: '700' },
}));
