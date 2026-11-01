/**
 * SignInAppsCard — the apps the owner signed in to with Agentrix, on the passport screen (L8 3A E1, agentrixOauthApps.ts).
 * Rendered only behind EXPO_PUBLIC_AGENTRIX_OAUTH=1; renders nothing while the server switch is off.
 * Lists each app, what it may read, and disconnects it (at once, after a second tap).
 */
import React, { useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { agentrixOauthClientLabelV1, agentrixOauthLastUsedTextV1, agentrixOauthScopeLinesV1, type AgentrixOauthConnectedAppV1 } from '../../shared/types/agentrix-oauth';
import {
  AGENTRIX_OAUTH_APPS_FAILURE_COPY,
  AgentrixOauthAppsError,
  createMobileAgentrixOauthAppsClient,
  type MobileAgentrixOauthAppsClientV1,
} from '../services/agentrixOauthApps';
import { getApiConfig } from '../services/api';
import { mobileV6HttpTransport } from '../services/mobileV6Runtime';
import { useAuthStore } from '../stores/authStore';
import { useI18n } from '../stores/i18nStore';
import { useThemedStyles, type Palette } from '../theme/useTheme';

function mobileClient(): MobileAgentrixOauthAppsClientV1 {
  return createMobileAgentrixOauthAppsClient({
    transport: mobileV6HttpTransport,
    baseUrl: getApiConfig().baseUrl || 'https://api.agentrix.top/api',
    token: () => getApiConfig().token || useAuthStore.getState().token,
  });
}

export function SignInAppsCard() {
  const { language } = useI18n();
  const lang = language === 'zh' ? 'zh' : 'en';
  const styles = useThemedStyles(makeStyles);
  const queryClient = useQueryClient();
  const key = ['four-zone', 'agentrix-oauth-apps'];
  const query = useQuery({ queryKey: key, queryFn: () => mobileClient().list(), retry: 0 });
  const [notice, setNotice] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const failure = query.error instanceof AgentrixOauthAppsError ? query.error.failure : query.error ? 'unavailable' : null;
  if (failure === 'closed') return null;

  const revoke = async (app: AgentrixOauthConnectedAppV1) => {
    try {
      await mobileClient().revoke(app.passId);
      setNotice(lang === 'zh' ? '已断开，马上生效。' : 'Disconnected. It takes effect now.');
    } catch (error) {
      setNotice(AGENTRIX_OAUTH_APPS_FAILURE_COPY[error instanceof AgentrixOauthAppsError ? error.failure : 'unavailable'][lang]);
    }
    setConfirming(null);
    await queryClient.invalidateQueries({ queryKey: key });
  };

  return (
    <View style={styles.card} testID="agentrix-oauth-apps-card">
      <Text style={styles.title}>{lang === 'zh' ? '用 Agentrix 登录的应用' : 'Apps you signed in to with Agentrix'}</Text>
      <Text style={styles.muted}>
        {lang === 'zh' ? '每个应用只能读你留给它的那几项。断开马上生效。' : 'Each app can read only what you left for it. Disconnecting takes effect at once.'}
      </Text>
      {failure ? <Text style={styles.muted}>{AGENTRIX_OAUTH_APPS_FAILURE_COPY[failure][lang]}</Text> : null}
      {query.data && query.data.length === 0 ? <Text style={styles.muted}>{lang === 'zh' ? '还没有应用。' : 'No apps yet.'}</Text> : null}
      {query.data
        ? query.data.map((app) => (
            <View key={app.passId} style={styles.item}>
              <Text style={styles.text}>
                <Text style={styles.strong}>{agentrixOauthClientLabelV1(app.clientId, app.clientName)}</Text>
                {` · ${agentrixOauthLastUsedTextV1(app.lastUsedAt, lang)}`}
              </Text>
              <View style={styles.actions}>
                <TouchableOpacity accessibilityRole="button" accessibilityState={{ expanded: open === app.passId }} onPress={() => setOpen(open === app.passId ? null : app.passId)}>
                  <Text style={styles.link}>{open === app.passId ? (lang === 'zh' ? '收起' : 'Hide') : lang === 'zh' ? '看它能读什么' : 'See what it may read'}</Text>
                </TouchableOpacity>
                {confirming !== app.passId ? (
                  <TouchableOpacity accessibilityRole="button" onPress={() => setConfirming(app.passId)}>
                    <Text style={styles.link}>{lang === 'zh' ? '断开' : 'Disconnect'}</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
              {confirming === app.passId ? (
                <View style={styles.actions}>
                  <Text style={styles.muted}>{lang === 'zh' ? '断开后它马上读不到了。' : 'It loses access at once.'}</Text>
                  <TouchableOpacity accessibilityRole="button" onPress={() => void revoke(app)}>
                    <Text style={styles.danger}>{lang === 'zh' ? '确认断开' : 'Disconnect'}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity accessibilityRole="button" onPress={() => setConfirming(null)}>
                    <Text style={styles.link}>{lang === 'zh' ? '取消' : 'Cancel'}</Text>
                  </TouchableOpacity>
                </View>
              ) : null}
              {open === app.passId ? (
                <View style={styles.detail}>
                  {agentrixOauthScopeLinesV1(app.scopes).map((line) => (
                    <Text key={line.en} style={styles.muted}>{`• ${line[lang]}`}</Text>
                  ))}
                </View>
              ) : null}
            </View>
          ))
        : null}
      {notice ? <Text style={styles.muted}>{notice}</Text> : null}
    </View>
  );
}

const makeStyles = (p: Palette) =>
  StyleSheet.create({
    card: { backgroundColor: p.card, borderRadius: 16, padding: 16, marginTop: 12, gap: 8 },
    title: { color: p.text, fontSize: 16, fontWeight: '700' },
    item: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: p.border, paddingTop: 8, gap: 4 },
    text: { color: p.text, fontSize: 13 },
    strong: { fontWeight: '700' },
    actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, alignItems: 'center' },
    detail: { gap: 2 },
    link: { color: p.accent, fontSize: 13 },
    danger: { color: p.accent, fontSize: 13, fontWeight: '700' },
    muted: { color: p.textMuted, fontSize: 13 },
  });
