/**
 * BuyerOrdersScreen — 我下的单 (M1 "订单只读", EXPO_PUBLIC_MOBILE_M0=1; buyerOrders.ts).
 *
 * Read-only list of the orders this account placed (buyer view, shared decoder), newest first; tapping one
 * opens it in place. Nothing is written from here: paying, accepting, disputing, cancelling and refunds open
 * the Web order page, and the link says which of them is open there.
 *
 * `route.params.ref` (an `ord_…` id, from the `order_update` notice or 收入与回执) opens that order. One that is
 * not in the list is read on its own; one the server does not know for this account says so.
 */
import React from 'react';
import { ActivityIndicator, Linking, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { buyerOrderNextOnWeb, readBuyerOrder, readBuyerOrders, type BuyerOrderNextOnWeb, type BuyerOrderRead, type BuyerOrdersRead } from '../../services/buyerOrders';
import { getBuyerOrderWebUrl, isOrderRef } from '../../services/webHandoff';
import { orderEscrowTimeline } from '../../services/twinOrderTimeline';
import { TwinOrderProgress, TwinOrderTimeline } from './TwinOrderTimeline';
import { useAuthStore } from '../../stores/authStore';
import { useI18n } from '../../stores/i18nStore';
import { useThemedStyles, type Palette } from '../../theme/useTheme';
import { formatDuration, formatMoney, type OrderBuyerView } from '../../../shared/types/order-escrow-view';
import type { OrderKindV1, OrderStatusV1 } from '../../../shared/types/order-escrow';

type Lang = 'zh' | 'en';
type Copy = { zh: string; en: string };

const STATUS_TEXT: Record<OrderStatusV1, Copy> = {
  awaiting_payment: { zh: '等你付款', en: 'Waiting for your payment' },
  paid: { zh: '已付款，等对方交付', en: 'Paid, waiting for delivery' },
  delivered: { zh: '已交付，等你验收', en: 'Delivered, waiting for you to accept' },
  accepted: { zh: '已验收，等放款', en: 'Accepted, release pending' },
  settled: { zh: '已完成', en: 'Completed' },
  cancelled: { zh: '已取消', en: 'Cancelled' },
  refund_pending: { zh: '退款处理中', en: 'Refund in progress' },
  refunded: { zh: '已退款', en: 'Refunded' },
  disputed: { zh: '你提出了异议，平台处理中', en: 'Disputed, platform reviewing' },
  unknown: { zh: '结果待确认', en: 'Result being confirmed' },
};

const KIND_TEXT: Record<OrderKindV1, Copy> = {
  paid_question: { zh: '付费问答', en: 'Paid question' },
  consultation_deposit: { zh: '咨询定金', en: 'Consultation deposit' },
};

const NEXT_ON_WEB: Record<BuyerOrderNextOnWeb, Copy> = {
  pay: { zh: '到网页上付款', en: 'Pay on the web' },
  accept_or_dispute: { zh: '到网页上验收或提出异议', en: 'Accept or dispute on the web' },
  accept: { zh: '到网页上验收', en: 'Accept on the web' },
  refund: { zh: '到网页上申请退款', en: 'Ask for a refund on the web' },
  cancel: { zh: '到网页上取消', en: 'Cancel on the web' },
  view: { zh: '在网页上打开', en: 'Open on the web' },
};

function readCopy(state: BuyerOrdersRead | { kind: 'loading' }): Copy | null {
  if (state.kind === 'loading' || state.kind === 'ready') return null;
  if (state.kind === 'unavailable') {
    switch (state.reason) {
      case 'not_enabled':
        return { zh: '下单还没开放。', en: 'Orders are not open yet.' };
      case 'authentication_required':
        return { zh: '登录后才能看你下的单。', en: 'Sign in to see the orders you placed.' };
      default:
        return { zh: '读不到订单。', en: 'Orders could not be found.' };
    }
  }
  return { zh: '订单暂时读不到，可以重新读取。', en: 'Orders could not be read right now. Try again.' };
}

export function BuyerOrdersScreen({ route }: { route?: { params?: { ref?: string } } }) {
  const { t, language } = useI18n();
  const lang: Lang = language === 'zh' ? 'zh' : 'en';
  const say = (copy: Copy) => copy[lang];
  const styles = useThemedStyles(makeStyles);
  const token = useAuthStore((state) => state.token);
  const linkedRef = isOrderRef(route?.params?.ref) ? (route?.params?.ref as string) : null;
  const [openId, setOpenId] = React.useState<string | null>(linkedRef);
  React.useEffect(() => {
    if (linkedRef) setOpenId(linkedRef);
  }, [linkedRef]);

  const query = useQuery({
    queryKey: ['four-zone', 'buyer-orders'],
    queryFn: () => readBuyerOrders(),
    enabled: Boolean(token),
    retry: 0,
  });
  const state: BuyerOrdersRead | { kind: 'loading' } = !token
    ? { kind: 'unavailable', reason: 'authentication_required' }
    : query.data ?? (query.isError ? { kind: 'error', reason: 'unexpected', retryable: true } : { kind: 'loading' });
  const listed = state.kind === 'ready' ? state.orders : [];
  const linkedInList = linkedRef !== null && listed.some((order) => order.orderId === linkedRef);
  // An order from a notice that the list does not carry is read on its own.
  const linked = useQuery({
    queryKey: ['four-zone', 'buyer-order', linkedRef ?? ''],
    queryFn: () => readBuyerOrder(linkedRef as string),
    enabled: Boolean(token && linkedRef && state.kind === 'ready' && !linkedInList),
    retry: 0,
  });
  const linkedRead: BuyerOrderRead | undefined = linked.data;
  const orders = linkedRead?.kind === 'ready' && !linkedInList ? [linkedRead.order, ...listed] : listed;
  const linkedMissing = state.kind === 'ready' && linkedRef !== null && !linkedInList && linkedRead !== undefined && linkedRead.kind !== 'ready';

  const open = (url: string | null) => {
    if (url) void Linking.openURL(url).catch(() => undefined);
  };
  const notice = readCopy(state);

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content} testID="buyer-orders-screen">
      <Text style={styles.title} accessibilityRole="header">
        {t({ en: 'Orders you placed', zh: '我下的单' })}
      </Text>
      {state.kind === 'loading' || linked.isFetching ? <ActivityIndicator /> : null}
      {notice ? (
        <View style={styles.notice} testID={`buyer-orders-read-state-${state.kind}`}>
          <Text style={styles.noticeText}>{say(notice)}</Text>
          {state.kind === 'error' ? (
            <TouchableOpacity onPress={() => void query.refetch()} accessibilityRole="button" style={styles.linkButton}>
              <Text style={styles.linkText}>{t({ en: 'Read again', zh: '重新读取' })}</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      ) : null}
      {linkedMissing ? (
        <View style={styles.notice} testID="buyer-orders-linked-missing">
          <Text style={styles.noticeText}>
            {linkedRead?.kind === 'unavailable' && linkedRead.reason === 'not_found'
              ? t({ en: 'That order is not one you placed. If your twin took it, it is under Income.', zh: '这笔单不是你下的。如果是分身接的单，在「收入与回执」里。' })
              : t({ en: 'That order could not be read right now.', zh: '这笔单暂时读不到。' })}
          </Text>
        </View>
      ) : null}
      {state.kind === 'ready' && orders.length === 0 ? (
        <Text style={styles.muted} testID="buyer-orders-empty">
          {t({ en: 'You have not placed an order yet.', zh: '你还没有下过单。' })}
        </Text>
      ) : null}
      {orders.map((order: OrderBuyerView) => {
        const expanded = openId === order.orderId;
        const steps = orderEscrowTimeline(order, 'buyer');
        const next = buyerOrderNextOnWeb(order);
        const title = `${say(KIND_TEXT[order.kind])} · ${formatMoney(order.total)}`;
        const deadlinePassed = order.status === 'awaiting_payment' && Boolean(order.paymentDeadline) && Date.parse(order.paymentDeadline as string) <= Date.now();
        return (
          <View key={order.orderId} style={styles.card} testID={`buyer-order-${order.orderId}`}>
            <TouchableOpacity
              onPress={() => setOpenId(expanded ? null : order.orderId)}
              accessibilityRole="button"
              accessibilityState={{ expanded }}
              accessibilityLabel={`${title}, ${say(STATUS_TEXT[order.status])}`}
            >
              <Text style={styles.cardTitle}>{title}</Text>
              <Text style={styles.muted}>{`${t({ en: 'To', zh: '向' })} ${order.seller.displayName}`}</Text>
              <Text style={order.status === 'awaiting_payment' || order.status === 'delivered' ? styles.toneTodo : order.status === 'unknown' || order.status === 'disputed' ? styles.toneWarn : styles.toneMuted}>
                {say(STATUS_TEXT[order.status])}
              </Text>
              <TwinOrderProgress steps={steps} />
              <Text style={styles.muted}>
                {`${t({ en: 'Updated', zh: '更新于' })} ${order.updatedAt.slice(0, 16).replace('T', ' ')}`}
                {order.environment === 'test' ? ` · ${t({ en: 'test order, no real money', zh: '测试订单，不动真钱' })}` : ''}
              </Text>
            </TouchableOpacity>
            {expanded ? (
              <View style={styles.detail} testID={`buyer-order-detail-${order.orderId}`}>
                <Text style={styles.label}>{t({ en: 'What you wrote', zh: '你写的' })}</Text>
                <Text style={styles.body} selectable>
                  {order.buyerNote}
                </Text>
                {order.status === 'awaiting_payment' && order.paymentDeadline ? (
                  <Text style={styles.helper} testID={`buyer-order-deadline-${order.orderId}`}>
                    {deadlinePassed
                      ? t({ en: 'The payment window has passed; this order will be cancelled automatically.', zh: '付款时间已过，这笔订单会自动取消。' })
                      : `${t({ en: 'Pay before', zh: '请在这之前付款：' })} ${new Date(order.paymentDeadline).toLocaleString()}`}
                  </Text>
                ) : null}
                <TwinOrderTimeline steps={steps} justDone={[]} />
                {order.delivery ? (
                  <>
                    <Text style={styles.label}>{t({ en: 'What they delivered', zh: '对方交付的内容' })}</Text>
                    <Text style={styles.body} selectable>
                      {order.delivery.answerText ?? t({ en: '(attachments only, open it on the web)', zh: '（只有附件，请在网页上看）' })}
                    </Text>
                    {order.status === 'delivered' ? (
                      <Text style={styles.muted}>
                        {`${t({ en: 'Acceptance window', zh: '验收期' })} ${formatDuration(order.acceptanceWindowSeconds, lang === 'zh')} · ${t({ en: 'accepted automatically when it ends', zh: '期满自动验收' })}`}
                      </Text>
                    ) : null}
                  </>
                ) : null}
                {order.status === 'unknown' ? (
                  <Text style={styles.helper}>{t({ en: 'The result is being confirmed. Do not pay again.', zh: '结果待确认，请不要重复付款。' })}</Text>
                ) : null}
                <TouchableOpacity
                  onPress={() => open(getBuyerOrderWebUrl(order.orderId))}
                  accessibilityRole="link"
                  style={styles.linkButton}
                  testID={`buyer-order-open-web-${order.orderId}`}
                >
                  <Text style={styles.linkText}>{say(NEXT_ON_WEB[next])}</Text>
                </TouchableOpacity>
              </View>
            ) : null}
          </View>
        );
      })}
      <Text style={styles.helper}>
        {t({
          en: 'On the phone you can read the orders you placed. Paying, accepting, disputes and refunds happen on the web.',
          zh: '手机上可以看你下的单。付款、验收、异议和退款在网页上处理。',
        })}
      </Text>
    </ScrollView>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: c.bgPrimary },
    content: { padding: 18, paddingBottom: 48, gap: 14 },
    title: { color: c.textPrimary, fontSize: 26, fontWeight: '800' },
    notice: { backgroundColor: c.bgCard, borderRadius: 16, padding: 14, borderWidth: 1, borderColor: c.warning, gap: 4 },
    noticeText: { color: c.textSecondary, fontSize: 13, lineHeight: 19 },
    linkButton: { alignSelf: 'flex-start', marginTop: 6, minHeight: 44, justifyContent: 'center' },
    linkText: { color: c.accent, fontSize: 13, fontWeight: '800' },
    card: { backgroundColor: c.bgCard, borderRadius: 16, padding: 14, borderWidth: 1, borderColor: c.border, gap: 6 },
    cardTitle: { color: c.textPrimary, fontSize: 16, fontWeight: '800' },
    detail: { gap: 6, marginTop: 6, borderTopWidth: 1, borderTopColor: c.border, paddingTop: 10 },
    label: { color: c.textSecondary, fontSize: 12, fontWeight: '800' },
    body: { color: c.textPrimary, fontSize: 14, lineHeight: 21 },
    muted: { color: c.textMuted, fontSize: 12, lineHeight: 17 },
    toneTodo: { color: c.warning, fontSize: 13, fontWeight: '800' },
    toneWarn: { color: c.danger, fontSize: 13, fontWeight: '800' },
    toneMuted: { color: c.textSecondary, fontSize: 13, fontWeight: '700' },
    helper: { color: c.textMuted, fontSize: 12, lineHeight: 17 },
  });
