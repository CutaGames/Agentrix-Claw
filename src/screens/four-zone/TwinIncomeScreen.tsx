/**
 * TwinIncomeScreen — 分身 → 收入与回执 (T7 orders on the phone; REQ-mobile-049, I-036).
 *
 * Read-only list of the orders the twin took (seller view, shared decoder), newest
 * first. Tapping one opens it in place. The only action is "deliver the saved draft":
 * shown when the order is paid and the draft on the server is reviewable (the digest
 * over the text on screen equals the server's); the phone sends that digest and no
 * content, so exactly what the owner read goes out. Writing the answer, refunds and
 * disputes open the Web order page.
 *
 * `route.params.ref` (an `ord_…` id, from the `order_update` notice) opens that order.
 */
import React from 'react';
import { ActivityIndicator, Alert, Linking, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAgentPassport } from '../../hooks/useAgentPassport';
import {
  deliverTwinOrderDraft,
  readTwinOrders,
  summarizeTwinOrder,
  twinOrderDeliverIdempotencyKey,
  type TwinOrderDeliverOutcome,
  type TwinOrdersRead,
} from '../../services/twinOrders';
import { getBuyerOrderWebUrl, getSellerOrderWebUrl, getTwinWebUrl, isOrderRef } from '../../services/webHandoff';
import { doneStepIds, newlyDoneSteps, orderEscrowTimeline, type TimelineStepId } from '../../services/twinOrderTimeline';
import { TwinOrderProgress, TwinOrderTimeline } from './TwinOrderTimeline';
import { useAuthStore } from '../../stores/authStore';
import { useI18n } from '../../stores/i18nStore';
import { useThemedStyles, type Palette } from '../../theme/useTheme';
import { formatDuration, formatMoney, type OrderSellerView } from '../../../shared/types/order-escrow-view';
import type { OrderKindV1, OrderStatusV1 } from '../../../shared/types/order-escrow';

type Lang = 'zh' | 'en';
type Copy = { zh: string; en: string };

const STATUS_TEXT: Record<OrderStatusV1, Copy> = {
  awaiting_payment: { zh: '等买方付款', en: 'Awaiting payment' },
  paid: { zh: '已付款，等你交付', en: 'Paid, waiting for you' },
  delivered: { zh: '已交付，等买方验收', en: 'Delivered, awaiting acceptance' },
  accepted: { zh: '已验收，等放款', en: 'Accepted, release pending' },
  settled: { zh: '已放款', en: 'Released' },
  cancelled: { zh: '已取消', en: 'Cancelled' },
  refund_pending: { zh: '退款处理中', en: 'Refund in progress' },
  refunded: { zh: '已退款', en: 'Refunded' },
  disputed: { zh: '买方有异议，平台处理中', en: 'Disputed, platform reviewing' },
  unknown: { zh: '结果待确认', en: 'Result being confirmed' },
};

/** Where the money is not going to the owner: no big payout number for these. */
const NO_PAYOUT: ReadonlySet<OrderStatusV1> = new Set(['cancelled', 'refund_pending', 'refunded']);

const KIND_TEXT: Record<OrderKindV1, Copy> = {
  paid_question: { zh: '付费问答', en: 'Paid question' },
  consultation_deposit: { zh: '咨询定金', en: 'Consultation deposit' },
};

function readCopy(state: TwinOrdersRead | { kind: 'loading' }, lang: Lang): Copy | null {
  if (state.kind === 'loading' || state.kind === 'ready') return null;
  if (state.kind === 'unavailable') {
    switch (state.reason) {
      case 'not_enabled':
        return { zh: '接单还没开放。', en: 'Orders are not open yet.' };
      case 'authentication_required':
        return { zh: '登录后才能看分身接的单。', en: 'Sign in to see the orders your twin took.' };
      case 'agent_ref_required':
        return { zh: '读不到这只 Agent 的编号，没法列出订单。', en: 'This Agent’s id could not be read, so its orders cannot be listed.' };
      default:
        return { zh: '读不到订单。', en: 'Orders could not be found.' };
    }
  }
  return { zh: '订单暂时读不到，可以重新读取。', en: 'Orders could not be read right now. Try again.' };
}

function deliverProblem(outcome: TwinOrderDeliverOutcome): Copy | null {
  switch (outcome.kind) {
    case 'delivered':
      return null;
    case 'changed':
      return { zh: '订单或草稿刚刚变了，已重新读取。请再看一遍再交付。', en: 'The order or its draft just changed and was read again. Review it before delivering.' };
    case 'needs_web':
      return { zh: '这一步要到网页上完成（可能要重新登录）。', en: 'Finish this on the web (you may need to sign in again).' };
    case 'blocked':
      return { zh: '没有可以原样交付的草稿，请到网页上写回答。', en: 'There is no draft to deliver as it stands. Write the answer on the web.' };
    default:
      return outcome.retryable
        ? { zh: '没有发出去，请重试。', en: 'It was not sent. Try again.' }
        : { zh: '没有交付，请到网页上处理。', en: 'Not delivered. Handle it on the web.' };
  }
}

export function TwinIncomeScreen({ route }: { route?: { params?: { tab?: string; ref?: string } } }) {
  const { t, language } = useI18n();
  const lang: Lang = language === 'zh' ? 'zh' : 'en';
  const say = (copy: Copy) => copy[lang];
  const styles = useThemedStyles(makeStyles);
  const queryClient = useQueryClient();
  const token = useAuthStore((state) => state.token);
  const activeInstance = useAuthStore((state) => state.activeInstance);
  const agentAccountId: string = activeInstance?.agentAccountId ?? activeInstance?.metadata?.agentAccountId ?? '';
  const linkedRef = isOrderRef(route?.params?.ref) ? (route?.params?.ref as string) : null;
  const [openId, setOpenId] = React.useState<string | null>(linkedRef);
  React.useEffect(() => {
    if (linkedRef) setOpenId(linkedRef);
  }, [linkedRef]);

  // Orders are keyed by the Agent's external id (agentUniqueId), read from the owner's passport projection.
  const passport = useAgentPassport(agentAccountId || undefined);
  const sellerAgentRef = passport.state.kind === 'ready' ? passport.state.data.agentRef : null;
  const ordersKey = ['four-zone', 'twin-orders', sellerAgentRef ?? ''];
  const query = useQuery({
    queryKey: ordersKey,
    queryFn: () => readTwinOrders(sellerAgentRef as string),
    enabled: Boolean(token && sellerAgentRef),
    retry: 0,
  });
  const passportFailed = passport.state.kind !== 'ready' && passport.state.kind !== 'unknown';
  const state: TwinOrdersRead | { kind: 'loading' } = !token
    ? { kind: 'unavailable', reason: 'authentication_required' }
    : passportFailed
      ? passport.state.kind === 'error'
        ? { kind: 'error', reason: 'agent_ref_unreadable', retryable: true }
        : { kind: 'unavailable', reason: 'agent_ref_required' }
      : query.data ?? (query.isError ? { kind: 'error', reason: 'unexpected', retryable: true } : { kind: 'loading' });

  const deliver = useMutation({
    mutationFn: ({ order, digest }: { order: OrderSellerView; digest: string }) =>
      // Same key for the same draft and version: a retry is a replay, never a second delivery.
      deliverTwinOrderDraft(order, digest, twinOrderDeliverIdempotencyKey(order, digest)),
    onSuccess: (outcome) => {
      const problem = deliverProblem(outcome);
      if (problem) Alert.alert(t({ en: 'Not delivered', zh: '没有交付' }), say(problem));
    },
    onError: () => Alert.alert(t({ en: 'Not delivered', zh: '没有交付' }), t({ en: 'Try again.', zh: '请重试。' })),
    // What the list shows is always the server's read-back.
    onSettled: () => void queryClient.invalidateQueries({ queryKey: ordersKey }),
  });

  const confirmDeliver = (order: OrderSellerView, digest: string) =>
    Alert.alert(
      t({ en: 'Deliver this answer?', zh: '交付这份回答？' }),
      t({
        en: 'The buyer receives exactly the text above. After delivery they have the acceptance window to accept or dispute it.',
        zh: '买方会收到上面这段原文。交付后买方在验收期内验收或提出异议。',
      }),
      [
        { text: t({ en: 'Cancel', zh: '取消' }), style: 'cancel' },
        { text: t({ en: 'Deliver', zh: '确认交付' }), onPress: () => deliver.mutate({ order, digest }) },
      ],
    );
  const open = (url: string | null) => {
    if (url) void Linking.openURL(url).catch(() => undefined);
  };

  const notice = readCopy(state, lang);
  const orders = state.kind === 'ready' ? state.orders : [];
  // Which timeline steps were done at the last read of each order: a step that is done now but was
  // not then is a state change, and only that animates (showcase A). The first read never animates.
  const seenDone = React.useRef(new Map<string, Set<TimelineStepId>>());
  const timelines = orders.map((order) => {
    const steps = orderEscrowTimeline(order);
    return { orderId: order.orderId, steps, justDone: newlyDoneSteps(seenDone.current.get(order.orderId), steps) };
  });
  React.useEffect(() => {
    for (const item of timelines) seenDone.current.set(item.orderId, doneStepIds(item.steps));
  });
  const linkedMissing = state.kind === 'ready' && linkedRef !== null && !orders.some((order) => order.orderId === linkedRef);

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content} testID="twin-income-screen">
      <Text style={styles.title} accessibilityRole="header">
        {t({ en: 'Income', zh: '收入与回执' })}
      </Text>
      {state.kind === 'loading' ? <ActivityIndicator /> : null}
      {notice ? (
        <View style={styles.notice} testID={`twin-income-read-state-${state.kind}`}>
          <Text style={styles.noticeText}>{say(notice)}</Text>
          {state.kind === 'error' ? (
            <TouchableOpacity
              onPress={() => {
                if (passport.state.kind === 'error') passport.refetch();
                else void query.refetch();
              }}
              accessibilityRole="button"
              style={styles.linkButton}
            >
              <Text style={styles.linkText}>{t({ en: 'Read again', zh: '重新读取' })}</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      ) : null}
      {state.kind === 'ready' && orders.length === 0 ? (
        <Text style={styles.muted} testID="twin-income-empty">
          {t({ en: 'Your twin has not taken an order yet.', zh: '分身还没有接过单。' })}
        </Text>
      ) : null}
      {linkedMissing ? (
        <View style={styles.notice} testID="twin-income-linked-missing">
          <Text style={styles.noticeText}>
            {t({ en: 'That order is not in your twin’s list. It may be an order you placed:', zh: '这笔单不在分身接的单里，可能是你下的单：' })}
          </Text>
          <TouchableOpacity onPress={() => open(getBuyerOrderWebUrl(linkedRef as string))} accessibilityRole="link" style={styles.linkButton} testID="twin-income-linked-open-buyer">
            <Text style={styles.linkText}>{t({ en: 'Open it on the web', zh: '在网页上打开' })}</Text>
          </TouchableOpacity>
        </View>
      ) : null}
      {orders.map((order, orderIndex) => {
        const summary = summarizeTwinOrder(order);
        const expanded = openId === order.orderId;
        const timeline = timelines[orderIndex];
        const title = `${say(KIND_TEXT[order.kind])} · ${formatMoney(order.amounts.total)}`;
        return (
          <View key={order.orderId} style={styles.card} testID={`twin-order-${order.orderId}`}>
            <TouchableOpacity
              onPress={() => setOpenId(expanded ? null : order.orderId)}
              accessibilityRole="button"
              accessibilityState={{ expanded }}
              accessibilityLabel={`${title}, ${say(STATUS_TEXT[order.status])}`}
            >
              <Text style={styles.cardTitle}>{title}</Text>
              <Text style={order.status === 'paid' ? styles.toneTodo : order.status === 'unknown' || order.status === 'disputed' ? styles.toneWarn : styles.toneMuted}>
                {say(STATUS_TEXT[order.status])}
              </Text>
              <TwinOrderProgress steps={timeline.steps} />
              <Text style={styles.muted}>
                {`${t({ en: 'Updated', zh: '更新于' })} ${order.updatedAt.slice(0, 16).replace('T', ' ')}`}
                {summary.test ? ` · ${t({ en: 'test order, no real money', zh: '测试订单，不动真钱' })}` : ''}
              </Text>
            </TouchableOpacity>
            {expanded ? (
              <View style={styles.detail} testID={`twin-order-detail-${order.orderId}`}>
                <Text style={styles.label}>{t({ en: 'The buyer wrote', zh: '买方写的' })}</Text>
                <Text style={styles.body} selectable>
                  {order.buyerNote}
                </Text>
                <Text style={styles.muted}>
                  {order.buyer.kind === 'visitor' ? t({ en: 'Buyer: a visitor (email only)', zh: '买方：访客（只留了邮箱）' }) : t({ en: 'Buyer: a signed-in user', zh: '买方：已登录的用户' })}
                </Text>
                {summary.proceeds && !NO_PAYOUT.has(order.status) ? (
                  <View style={styles.money} testID={`twin-order-money-${order.orderId}`}>
                    <Text style={styles.moneyLabel}>
                      {order.status === 'settled' ? t({ en: 'Released to you', zh: '已放款，到手' }) : t({ en: 'You receive after release', zh: '放款后到手' })}
                    </Text>
                    <Text style={order.status === 'settled' ? styles.moneyValueDone : styles.moneyValue}>{formatMoney(summary.proceeds)}</Text>
                    <Text style={styles.muted}>
                      {`${t({ en: 'Order total', zh: '订单金额' })} ${formatMoney(order.amounts.total)} · ${t({ en: 'platform fee', zh: '平台费' })} ${formatMoney(order.amounts.platformFee)}`}
                    </Text>
                  </View>
                ) : null}
                <TwinOrderTimeline steps={timeline.steps} justDone={timeline.justDone} />
                {order.delivery ? (
                  <>
                    <Text style={styles.label}>{t({ en: 'What was delivered', zh: '已交付的内容' })}</Text>
                    <Text style={styles.body} selectable>
                      {order.delivery.answerText ?? t({ en: '(attachments only)', zh: '（只有附件）' })}
                    </Text>
                    {order.status === 'delivered' ? (
                      <Text style={styles.muted}>
                        {`${t({ en: 'Acceptance window', zh: '验收期' })} ${formatDuration(order.acceptanceWindowSeconds, lang === 'zh')}`}
                      </Text>
                    ) : null}
                  </>
                ) : null}
                {summary.reviewable ? (
                  <View style={styles.draft} testID={`twin-order-draft-${order.orderId}`}>
                    <Text style={styles.label}>{t({ en: 'Your saved answer (read it in full before delivering)', zh: '已保存的回答（交付前请读完）' })}</Text>
                    <Text style={styles.body} selectable>
                      {summary.reviewable.draft.answerText ?? ''}
                    </Text>
                    <TouchableOpacity
                      style={styles.primaryButton}
                      disabled={deliver.isPending}
                      onPress={() => confirmDeliver(order, summary.reviewable!.digest)}
                      accessibilityRole="button"
                      accessibilityLabel={t({ en: 'Deliver this answer', zh: '确认交付这份回答' })}
                      testID={`twin-order-deliver-${order.orderId}`}
                    >
                      <Text style={styles.primaryText}>{t({ en: 'Deliver this answer', zh: '确认交付这份回答' })}</Text>
                    </TouchableOpacity>
                    {deliver.isPending ? <ActivityIndicator /> : null}
                  </View>
                ) : null}
                {summary.answerOnWeb ? (
                  <Text style={styles.helper} testID={`twin-order-answer-on-web-${order.orderId}`}>
                    {t({ en: 'No saved answer yet. Write it on the web; you can deliver it here once it is saved.', zh: '还没有保存的回答。请到网页上写，保存后可以回到这里交付。' })}
                  </Text>
                ) : null}
                <TouchableOpacity
                  onPress={() => open(getSellerOrderWebUrl(agentAccountId, order.orderId))}
                  accessibilityRole="link"
                  style={styles.linkButton}
                  testID={`twin-order-open-web-${order.orderId}`}
                >
                  <Text style={styles.linkText}>
                    {summary.answerOnWeb ? t({ en: 'Write the answer on the web', zh: '到网页上写回答' }) : t({ en: 'Open on the web (refunds, disputes)', zh: '在网页上打开（退款、异议）' })}
                  </Text>
                </TouchableOpacity>
              </View>
            ) : null}
          </View>
        );
      })}
      <TouchableOpacity style={styles.secondaryButton} onPress={() => open(getTwinWebUrl(agentAccountId || null))} accessibilityRole="button" testID="twin-income-open-web">
        <Text style={styles.secondaryButtonText}>{t({ en: 'Services and prices on the web', zh: '到网页上管理服务和价格' })}</Text>
      </TouchableOpacity>
      <Text style={styles.helper}>
        {t({
          en: 'On the phone you can read orders and deliver an answer you already saved. Writing answers, refunds and disputes happen on the web.',
          zh: '手机上可以看订单、交付已经保存的回答。写回答、退款和异议在网页上处理。',
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
    draft: { gap: 8, marginTop: 4 },
    label: { color: c.textSecondary, fontSize: 12, fontWeight: '800' },
    body: { color: c.textPrimary, fontSize: 14, lineHeight: 21 },
    muted: { color: c.textMuted, fontSize: 12, lineHeight: 17 },
    toneTodo: { color: c.warning, fontSize: 13, fontWeight: '800' },
    toneWarn: { color: c.danger, fontSize: 13, fontWeight: '800' },
    toneMuted: { color: c.textSecondary, fontSize: 13, fontWeight: '700' },
    primaryButton: { minHeight: 48, borderRadius: 14, backgroundColor: c.primary, alignItems: 'center', justifyContent: 'center' },
    primaryText: { color: c.onAccent, fontSize: 15, fontWeight: '800' },
    secondaryButton: { minHeight: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: c.border },
    secondaryButtonText: { color: c.textPrimary, fontSize: 15, fontWeight: '700' },
    helper: { color: c.textMuted, fontSize: 12, lineHeight: 17 },
    money: { backgroundColor: c.bgSecondary, borderRadius: 14, padding: 12, gap: 2, marginTop: 4 },
    moneyLabel: { color: c.textSecondary, fontSize: 12, fontWeight: '800' },
    moneyValue: { color: c.textPrimary, fontSize: 28, fontWeight: '900', fontVariant: ['tabular-nums'] },
    moneyValueDone: { color: c.success, fontSize: 28, fontWeight: '900', fontVariant: ['tabular-nums'] },
  });
