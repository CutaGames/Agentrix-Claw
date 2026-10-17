/**
 * MyConnectionsScreen — 我的 → 连接 on the phone (A9 / M1, EXPO_PUBLIC_COMPOSIO_CONNECT=1, composioConnect.ts). One row per
 * app the server allows (Gmail, Google Calendar, Notion, GitHub): connect opens Composio's own page in the in-app
 * browser; when the browser closes the server re-checks the connection. Disconnect asks first. No web hand-off.
 */
import React from 'react';
import { ActivityIndicator, Alert, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useI18n } from '../../stores/i18nStore';
import { useThemedStyles, type Palette } from '../../theme/useTheme';
import {
  COMPOSIO_CONNECT_TOOLKITS_V0,
  type ComposioConnectionStatusV0,
  type ComposioConnectionViewV0,
  type ComposioToolkitV0,
} from '../../../shared/types/composio-connect';
import { COMPOSIO_CONNECT_FAILURE_COPY, COMPOSIO_TOOLKIT_COPY, ComposioConnectError } from '../../services/composioConnect';
import { mobileComposioConnectClient } from '../../services/composioConnectSession';

export const connectionsQueryKey = ['four-zone', 'composio-connections'] as const;
const failureOf = (error: unknown) => (error instanceof ComposioConnectError ? error.failure : 'unavailable');

const STATUS_COPY: Readonly<Record<ComposioConnectionStatusV0, { zh: string; en: string }>> = {
  pending: { zh: '等你在授权页完成', en: 'Waiting for you to finish on the sign-in page' },
  active: { zh: '已连接', en: 'Connected' },
  needs_reconnect: { zh: '要重新连接', en: 'Needs reconnecting' },
  failed: { zh: '上次没连上', en: 'Last attempt did not connect' },
  revoked: { zh: '已断开', en: 'Disconnected' },
};

/** The newest connection per app; older rows are history. */
function latestByToolkit(items: ComposioConnectionViewV0[]): Map<ComposioToolkitV0, ComposioConnectionViewV0> {
  const out = new Map<ComposioToolkitV0, ComposioConnectionViewV0>();
  for (const item of [...items].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))) {
    if (!out.has(item.toolkit)) out.set(item.toolkit, item);
  }
  return out;
}

export function MyConnectionsScreen() {
  const { t } = useI18n();
  const styles = useThemedStyles(makeStyles);
  const queryClient = useQueryClient();
  const list = useQuery({ queryKey: connectionsQueryKey, queryFn: () => mobileComposioConnectClient().list(), retry: 0, staleTime: 15_000 });
  const refreshList = () => void queryClient.invalidateQueries({ queryKey: connectionsQueryKey });
  const onError = (error: unknown) => Alert.alert(t({ en: 'Not done', zh: '没有完成' }), t(COMPOSIO_CONNECT_FAILURE_COPY[failureOf(error)]));
  const connect = useMutation({
    mutationFn: async (toolkit: ComposioToolkitV0) => {
      const client = mobileComposioConnectClient();
      const started = await client.connect(toolkit);
      await WebBrowser.openBrowserAsync(started.redirectUrl);
      // The page returns to the web, not the app; ask the server what Composio says now.
      await client.refresh(started.connectionRef).catch(() => undefined);
    },
    onError,
    onSettled: refreshList,
  });
  const recheck = useMutation({ mutationFn: (connectionRef: string) => mobileComposioConnectClient().refresh(connectionRef), onError, onSettled: refreshList });
  const disconnect = useMutation({ mutationFn: (connectionRef: string) => mobileComposioConnectClient().disconnect(connectionRef), onError, onSettled: refreshList });
  const confirmDisconnect = (toolkit: ComposioToolkitV0, connectionRef: string) =>
    Alert.alert(t({ en: 'Disconnect?', zh: '断开连接？' }), t({ en: `Your Agent will no longer reach ${COMPOSIO_TOOLKIT_COPY[toolkit].en}.`, zh: `断开后 Agent 就不能再访问 ${COMPOSIO_TOOLKIT_COPY[toolkit].zh}。` }), [
      { text: t({ en: 'Cancel', zh: '取消' }), style: 'cancel' },
      { text: t({ en: 'Disconnect', zh: '断开' }), style: 'destructive', onPress: () => disconnect.mutate(connectionRef) },
    ]);
  const failure = list.isError ? failureOf(list.error) : null;
  const data = list.data;
  const latest = data ? latestByToolkit(data.items) : new Map<ComposioToolkitV0, ComposioConnectionViewV0>();
  const busy = connect.isPending || recheck.isPending || disconnect.isPending;

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={list.isRefetching} onRefresh={() => void list.refetch()} />}
      testID="my-connections-screen"
    >
      <Text style={styles.title} accessibilityRole="header">{t({ en: 'Connected apps', zh: '连接的应用' })}</Text>
      <Text style={styles.muted}>
        {t({
          en: "Connect apps for your Agent through Composio. You sign in on the app's and Composio's own pages; we never see your passwords. When you come back, pull to refresh if the status has not changed.",
          zh: '通过 Composio 把应用连接给你的 Agent。授权在应用和 Composio 自己的页面上完成，我们看不到你的密码。授权完回来，状态没变就下拉刷新一下。',
        })}
      </Text>
      {list.isLoading ? <ActivityIndicator /> : null}
      {failure ? <Text style={styles.problem} testID="my-connections-error">{t(COMPOSIO_CONNECT_FAILURE_COPY[failure])}</Text> : null}
      {data && !data.configured ? (
        <Text style={styles.muted}>{t({ en: 'Connecting apps is not set up on the server yet.', zh: '服务端还没配好应用连接。' })}</Text>
      ) : null}
      {data
        ? COMPOSIO_CONNECT_TOOLKITS_V0.map((toolkit) => {
            const item = latest.get(toolkit);
            const status = item?.status;
            const canConnect = data.configured && data.available.includes(toolkit) && (!status || status === 'revoked' || status === 'failed' || status === 'needs_reconnect');
            return (
              <View key={toolkit} style={styles.card} testID={`my-connection-${toolkit}`}>
                <Text style={styles.cardTitle}>{t(COMPOSIO_TOOLKIT_COPY[toolkit])}</Text>
                <Text style={status === 'active' ? styles.ok : styles.detail}>{status ? t(STATUS_COPY[status]) : t({ en: 'Not connected', zh: '没连接' })}</Text>
                <View style={styles.actions}>
                  {canConnect ? (
                    <TouchableOpacity style={styles.primary} disabled={busy} onPress={() => connect.mutate(toolkit)} accessibilityRole="button">
                      <Text style={styles.primaryText}>{status === 'needs_reconnect' ? t({ en: 'Reconnect', zh: '重新连接' }) : t({ en: 'Connect', zh: '连接' })}</Text>
                    </TouchableOpacity>
                  ) : null}
                  {item && status === 'pending' ? (
                    <TouchableOpacity style={styles.button} disabled={busy} onPress={() => recheck.mutate(item.connectionRef)} accessibilityRole="button">
                      <Text style={styles.buttonText}>{t({ en: 'I finished, check again', zh: '我授权完了，再查一次' })}</Text>
                    </TouchableOpacity>
                  ) : null}
                  {item && (status === 'active' || status === 'pending' || status === 'needs_reconnect') ? (
                    <TouchableOpacity style={styles.danger} disabled={busy} onPress={() => confirmDisconnect(toolkit, item.connectionRef)} accessibilityRole="button">
                      <Text style={styles.dangerText}>{t({ en: 'Disconnect', zh: '断开' })}</Text>
                    </TouchableOpacity>
                  ) : null}
                </View>
              </View>
            );
          })
        : null}
    </ScrollView>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: c.bgPrimary },
    content: { padding: 20, gap: 10 },
    title: { color: c.textPrimary, fontSize: 24, fontWeight: '800' },
    muted: { color: c.textMuted, fontSize: 13, lineHeight: 19 },
    ok: { color: c.accent, fontSize: 13, fontWeight: '700' },
    problem: { color: c.danger, fontSize: 13 },
    card: { backgroundColor: c.bgCard, borderColor: c.border, borderWidth: 1, borderRadius: 14, padding: 14, gap: 6 },
    cardTitle: { color: c.textPrimary, fontSize: 15, fontWeight: '700' },
    detail: { color: c.textSecondary, fontSize: 13, lineHeight: 19 },
    actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 6 },
    primary: { minHeight: 44, paddingHorizontal: 18, borderRadius: 12, backgroundColor: c.accent, alignItems: 'center', justifyContent: 'center' },
    primaryText: { color: c.onAccent, fontSize: 14, fontWeight: '800' },
    button: { minHeight: 44, paddingHorizontal: 16, borderRadius: 12, borderWidth: 1, borderColor: c.border, alignItems: 'center', justifyContent: 'center' },
    buttonText: { color: c.textPrimary, fontSize: 14, fontWeight: '700' },
    danger: { minHeight: 44, paddingHorizontal: 16, borderRadius: 12, borderWidth: 1, borderColor: c.danger, alignItems: 'center', justifyContent: 'center' },
    dangerText: { color: c.danger, fontSize: 14, fontWeight: '800' },
  });
