/**
 * MattersHomeScreen — 事项 zone root (flag `mobile.four_zone_ia`).
 *
 * 待我处理 (M3-a; product doc 5.3 / 5.4): one list, soonest expiry first
 * (`mattersPending.ts`), built only from backend reads:
 *   - desktop approvals: inline "允许一次" / "拒绝", each two taps (button +
 *     confirm). Buttons follow `mobileApprovalPolicy`, which mirrors what the
 *     backend accepts from the phone; the list shows the backend read-back
 *     after every decision, never an optimistic state.
 *   - open 分身复核 items: opened on Web (content decisions are Web-only, D16).
 * 电脑上 appears only when a computer is paired (5.5); 目标 / 日程 / 灵感 are
 * not built yet and open the honest notice.
 */
import React from 'react';
import { ActivityIndicator, Alert, Linking, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useI18n } from '../../stores/i18nStore';
import { useAuthStore } from '../../stores/authStore';
import { useNotificationStore } from '../../stores/notificationStore';
import { useThemedStyles, type Palette } from '../../theme/useTheme';
import { fetchDesktopState, respondToDesktopApproval, type MobileDesktopApproval } from '../../services/desktopSync';
import { isMobileApprovalBlockedError, type MobileApprovalDecision } from '../../services/mobileApprovalPolicy';
import { buildMattersPending, mattersDueLabel, type MattersPendingItem } from '../../services/mattersPending';
import { fetchTwinReviewQueue } from '../../services/twinReviewQueue';
import { isSafeTwinAgentId } from '../../services/twinStatus';
import { getTwinWebUrl } from '../../services/webHandoff';
import { NAV_CATALOG, visibleNavTabs } from '../../navigation/navCatalog';
import { ZONE_UNAVAILABLE_ROUTE } from '../../navigation/four-zone/fourZoneRoutes';

type Lang = 'zh' | 'en';

const DESKTOP_STATE_KEY = ['four-zone', 'desktop-state'];

function blockedHint(item: MattersPendingItem, lang: Lang): string | null {
  const caps = item.capabilities;
  if (!caps || item.kind !== 'computer_approval') return null;
  if (item.expired || caps.approveBlockedReason === 'expired') {
    return lang === 'zh' ? '已过期。如仍需要，请在电脑上重新发起。' : 'Expired. Ask again from the computer if still needed.';
  }
  if (caps.approveBlockedReason === 'requires_local_confirmation') {
    return lang === 'zh' ? '高风险：请在电脑上批准或拒绝。' : 'High risk: approve or reject on the computer.';
  }
  if (caps.approveBlockedReason === 'requires_receipt_refs') {
    return lang === 'zh' ? '请在电脑上批准；这里可以拒绝。' : 'Approve this on the computer. You can reject it here.';
  }
  return null;
}

function priorityLabel(item: MattersPendingItem, lang: Lang): string {
  if (item.kind === 'computer_approval') {
    const risk = item.risk === 'unknown' || !item.risk ? (lang === 'zh' ? '风险未知' : 'unknown risk') : item.risk;
    return lang === 'zh' ? `电脑审批 · ${risk}` : `Computer approval · ${risk}`;
  }
  const byPriority = {
    critical: { zh: '分身复核 · 紧急', en: 'Twin review · urgent' },
    action: { zh: '分身复核 · 待处理', en: 'Twin review · action' },
    review: { zh: '分身复核', en: 'Twin review' },
    insight: { zh: '分身复核 · 建议', en: 'Twin review · insight' },
  } as const;
  return byPriority[item.priority][lang];
}

export function MattersHomeScreen() {
  const { t, language } = useI18n();
  const lang: Lang = language === 'zh' ? 'zh' : 'en';
  const styles = useThemedStyles(makeStyles);
  const navigation = useNavigation<any>();
  const queryClient = useQueryClient();
  const signedIn = useAuthStore((state) => !!state.token);
  const activeInstance = useAuthStore((state) => state.activeInstance);
  const agentAccountId: string = activeInstance?.agentAccountId ?? activeInstance?.metadata?.agentAccountId ?? '';
  const approvalNotifications = useNotificationStore((state) => state.approvalCount);
  const desktop = useQuery({
    queryKey: DESKTOP_STATE_KEY,
    queryFn: fetchDesktopState,
    enabled: signedIn,
    retry: 0,
    staleTime: 15_000,
  });
  const reviewKey = ['four-zone', 'twin-review', agentAccountId];
  const review = useQuery({
    queryKey: reviewKey,
    queryFn: () => fetchTwinReviewQueue(agentAccountId),
    enabled: signedIn && isSafeTwinAgentId(agentAccountId),
    retry: 0,
    staleTime: 30_000,
  });
  const now = Date.now();
  const reviewState = review.data;
  const approvals = desktop.data?.approvals ?? [];
  const items = buildMattersPending({
    approvals,
    twinReview: reviewState?.kind === 'ready' ? reviewState.data.open : [],
    now,
  });
  const approvalById = new Map<string, MobileDesktopApproval>();
  for (const approval of approvals) {
    const id = String(approval?.approvalId ?? '').trim();
    if (id) approvalById.set(id, approval);
  }
  // A twin that is not set up (or switched off) is not an error; any other failure is said out loud.
  const reviewFailed =
    review.isError || (reviewState !== undefined && (reviewState.kind === 'error' || reviewState.kind === 'unsupported_schema'));
  const hasPairedComputer = (desktop.data?.devices?.length ?? 0) > 0;
  const tabs = visibleNavTabs('matters', { hasPairedComputer });
  const openUnavailable = (tab: string) => navigation.navigate(ZONE_UNAVAILABLE_ROUTE, { zone: 'matters', tab });

  const decide = useMutation({
    mutationFn: ({ approval, decision }: { approval: MobileDesktopApproval; decision: MobileApprovalDecision }) =>
      respondToDesktopApproval(approval, decision),
    onError: (error: any) => {
      const reason = isMobileApprovalBlockedError(error) ? error.reason : error?.message;
      Alert.alert(t({ en: 'Not recorded', zh: '没有生效' }), reason || t({ en: 'Try again.', zh: '请重试。' }));
    },
    // The list shows the backend read-back, not what we sent.
    onSettled: () => void queryClient.invalidateQueries({ queryKey: DESKTOP_STATE_KEY }),
  });

  const confirmDecision = (item: MattersPendingItem, decision: MobileApprovalDecision) => {
    const approval = approvalById.get(item.id);
    if (!approval) return;
    const approve = decision === 'approved';
    Alert.alert(
      approve ? t({ en: 'Allow once?', zh: '允许一次？' }) : t({ en: 'Reject?', zh: '拒绝？' }),
      item.title,
      [
        { text: t({ en: 'Cancel', zh: '取消' }), style: 'cancel' },
        {
          text: approve ? t({ en: 'Allow once', zh: '允许一次' }) : t({ en: 'Reject', zh: '拒绝' }),
          style: approve ? 'default' : 'destructive',
          onPress: () => decide.mutate({ approval, decision }),
        },
      ],
    );
  };

  const openReviewOnWeb = () => void Linking.openURL(getTwinWebUrl(agentAccountId || null)).catch(() => undefined);
  const loading = desktop.isLoading || (review.isLoading && review.fetchStatus !== 'idle');
  const refreshing = desktop.isRefetching || review.isRefetching;
  const refresh = () => {
    void desktop.refetch();
    if (isSafeTwinAgentId(agentAccountId)) void review.refetch();
  };

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}
      testID="matters-home-screen"
    >
      <Text style={styles.title} accessibilityRole="header">
        {t(NAV_CATALOG.matters.label)}
      </Text>
      <Text style={styles.section}>{t({ en: 'For you', zh: '待我处理' })}</Text>
      <View style={styles.list} testID="matters-pending-list">
        {loading ? <ActivityIndicator /> : null}
        {desktop.isError ? (
          <Text style={styles.muted} testID="matters-pending-desktop-error">
            {t({ en: 'Could not load computer approvals. Pull to retry.', zh: '电脑审批加载失败，下拉重试。' })}
          </Text>
        ) : null}
        {reviewFailed ? (
          <Text style={styles.muted} testID="matters-pending-review-error">
            {t({ en: 'Could not load twin review items. Pull to retry.', zh: '分身复核加载失败，下拉重试。' })}
          </Text>
        ) : null}
        {!loading && !desktop.isError && items.length === 0 ? (
          <Text style={styles.muted} testID="matters-pending-empty">
            {t({ en: 'Nothing is waiting for you.', zh: '没有要你处理的事。' })}
          </Text>
        ) : null}
        {items.map((item) => {
          const due = mattersDueLabel(item, now, lang);
          const hint = blockedHint(item, lang);
          const caps = item.capabilities;
          const busy = decide.isPending && decide.variables?.approval?.approvalId === item.id;
          return (
            <View key={item.key} style={styles.card} testID={`matters-pending-${item.key}`}>
              <View style={styles.cardHeader}>
                <Text style={styles.cardKind}>{priorityLabel(item, lang)}</Text>
                {due ? <Text style={item.expired ? styles.dueExpired : styles.due}>{due}</Text> : null}
              </View>
              <Text style={styles.cardTitle} numberOfLines={3}>
                {item.title || t({ en: '(no text)', zh: '（无内容）' })}
              </Text>
              {item.detail ? (
                <Text style={styles.cardDetail} numberOfLines={3}>
                  {item.detail}
                </Text>
              ) : null}
              {hint ? <Text style={styles.hint}>{hint}</Text> : null}
              {item.kind === 'computer_approval' && caps && (caps.canApprove || caps.canReject) ? (
                <View style={styles.actions}>
                  {caps.canReject ? (
                    <TouchableOpacity
                      style={styles.rejectButton}
                      onPress={() => confirmDecision(item, 'rejected')}
                      disabled={busy}
                      accessibilityRole="button"
                      accessibilityLabel={`${t({ en: 'Reject', zh: '拒绝' })} ${item.title}`}
                      testID={`matters-reject-${item.id}`}
                    >
                      <Text style={styles.rejectText}>{t({ en: 'Reject', zh: '拒绝' })}</Text>
                    </TouchableOpacity>
                  ) : null}
                  {caps.canApprove ? (
                    <TouchableOpacity
                      style={styles.approveButton}
                      onPress={() => confirmDecision(item, 'approved')}
                      disabled={busy}
                      accessibilityRole="button"
                      accessibilityLabel={`${t({ en: 'Allow once', zh: '允许一次' })} ${item.title}`}
                      testID={`matters-approve-${item.id}`}
                    >
                      <Text style={styles.approveText}>{t({ en: 'Allow once', zh: '允许一次' })}</Text>
                    </TouchableOpacity>
                  ) : null}
                  {busy ? <ActivityIndicator /> : null}
                </View>
              ) : null}
              {item.kind === 'twin_review' ? (
                <TouchableOpacity
                  style={styles.linkButton}
                  onPress={openReviewOnWeb}
                  accessibilityRole="button"
                  accessibilityLabel={t({ en: 'Review on the web', zh: '到网页上复核' })}
                  testID={`matters-review-web-${item.id}`}
                >
                  <Text style={styles.linkText}>{t({ en: 'Review on the web', zh: '到网页上复核' })}</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          );
        })}
      </View>
      <Row
        styles={styles}
        label={t({ en: 'Other approvals', zh: '其他待批准' })}
        value={String(approvalNotifications)}
        onPress={() => navigation.navigate('Inbox')}
        testID="matters-inbox-approvals"
      />
      {tabs
        .filter((tab) => tab.id !== 'pending')
        .map((tab) => (
          <Row
            key={tab.id}
            styles={styles}
            label={t(tab.label)}
            onPress={() => (tab.id === 'on-computer' ? navigation.navigate('MattersDesktop') : openUnavailable(tab.id))}
            testID={`matters-tab-${tab.id}`}
          />
        ))}
    </ScrollView>
  );
}

function Row({
  styles,
  label,
  value,
  onPress,
  testID,
}: {
  styles: ReturnType<typeof makeStyles>;
  label: string;
  value?: string;
  onPress: () => void;
  testID: string;
}) {
  return (
    <TouchableOpacity
      style={styles.row}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={value !== undefined ? `${label} ${value}` : label}
      testID={testID}
    >
      <Text style={styles.rowLabel}>{label}</Text>
      <View style={styles.rowRight}>
        {value !== undefined ? <Text style={styles.rowValue}>{value}</Text> : null}
        <Text style={styles.chevron}>›</Text>
      </View>
    </TouchableOpacity>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: c.bgPrimary },
    content: { padding: 20, gap: 10 },
    title: { color: c.textPrimary, fontSize: 26, fontWeight: '800', marginBottom: 6 },
    section: { color: c.textSecondary, fontSize: 13, fontWeight: '700', marginTop: 8 },
    muted: { color: c.textMuted, fontSize: 13 },
    list: { gap: 10 },
    card: { backgroundColor: c.bgCard, borderColor: c.border, borderWidth: 1, borderRadius: 14, padding: 14, gap: 6 },
    cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
    cardKind: { color: c.textSecondary, fontSize: 12, fontWeight: '700', flexShrink: 1 },
    due: { color: c.warning, fontSize: 12, fontWeight: '800' },
    dueExpired: { color: c.textMuted, fontSize: 12, fontWeight: '800' },
    cardTitle: { color: c.textPrimary, fontSize: 15, fontWeight: '700', lineHeight: 21 },
    cardDetail: { color: c.textSecondary, fontSize: 13, lineHeight: 19 },
    hint: { color: c.textMuted, fontSize: 12, lineHeight: 17 },
    actions: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: 10, marginTop: 4 },
    rejectButton: {
      minHeight: 44,
      paddingHorizontal: 16,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: c.danger,
      alignItems: 'center',
      justifyContent: 'center',
    },
    rejectText: { color: c.danger, fontSize: 14, fontWeight: '800' },
    // Token pair: text on the primary fill is onAccent (11.4).
    approveButton: { minHeight: 44, paddingHorizontal: 16, borderRadius: 12, backgroundColor: c.primary, alignItems: 'center', justifyContent: 'center' },
    approveText: { color: c.onAccent, fontSize: 14, fontWeight: '800' },
    linkButton: { alignSelf: 'flex-start', minHeight: 36, justifyContent: 'center' },
    linkText: { color: c.accent, fontSize: 13, fontWeight: '800' },
    row: {
      minHeight: 52,
      backgroundColor: c.bgCard,
      borderColor: c.border,
      borderWidth: 1,
      borderRadius: 14,
      paddingHorizontal: 16,
      paddingVertical: 12,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    rowLabel: { color: c.textPrimary, fontSize: 15, fontWeight: '600', flexShrink: 1 },
    rowRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    rowValue: { color: c.textPrimary, fontSize: 15, fontWeight: '800' },
    chevron: { color: c.textMuted, fontSize: 20 },
  });
