/**
 * AgentPassCard — the Passes the owner has given out, on the passport screen (L8 1b A5, agentPass.ts).
 * Rendered only behind EXPO_PUBLIC_AGENT_PASS=1; renders nothing while the server switch is off.
 * Lists each Pass in plain words, shows what it allows, and revokes (at once, no extra confirmation step on the server).
 */
import React, { useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { agentPassPreviewV1, type AgentPassV1 } from '../../shared/types/agent-pass';
import { AGENT_PASS_FAILURE_COPY, AgentPassError, createMobileAgentPassClient, type MobileAgentPassClientV1 } from '../services/agentPass';
import { getApiConfig } from '../services/api';
import { mobileV6HttpTransport } from '../services/mobileV6Runtime';
import { useAuthStore } from '../stores/authStore';
import { useI18n } from '../stores/i18nStore';
import { useThemedStyles, type Palette } from '../theme/useTheme';

function mobileAgentPassClient(): MobileAgentPassClientV1 {
  return createMobileAgentPassClient({
    transport: mobileV6HttpTransport,
    baseUrl: getApiConfig().baseUrl || 'https://api.agentrix.top/api',
    token: () => getApiConfig().token || useAuthStore.getState().token,
  });
}

export function AgentPassCard() {
  const { language } = useI18n();
  const lang = language === 'zh' ? 'zh' : 'en';
  const styles = useThemedStyles(makeStyles);
  const queryClient = useQueryClient();
  const key = ['four-zone', 'agent-passes'];
  const query = useQuery({ queryKey: key, queryFn: () => mobileAgentPassClient().list(), retry: 0 });
  const [notice, setNotice] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);

  const failure = query.error instanceof AgentPassError ? query.error.failure : query.error ? 'unavailable' : null;
  if (failure === 'closed') return null;

  const revoke = async (pass: AgentPassV1) => {
    try {
      await mobileAgentPassClient().revoke(pass.id);
      setNotice(lang === 'zh' ? '已撤销，马上生效。' : 'Revoked. It takes effect now.');
    } catch (error) {
      setNotice(AGENT_PASS_FAILURE_COPY[error instanceof AgentPassError ? error.failure : 'unavailable'][lang]);
    }
    setConfirming(null);
    await queryClient.invalidateQueries({ queryKey: key });
  };

  return (
    <View style={styles.card} testID="agent-pass-card">
      <Text style={styles.title}>{lang === 'zh' ? '你发出去的通行证' : 'Passes you have given out'}</Text>
      <Text style={styles.muted}>
        {lang === 'zh'
          ? '每张通行证写明：谁、能读什么、为了什么、多久、几次。撤销马上生效。'
          : 'Each Pass says who, what they can read, for what, for how long and how often. Revoking takes effect at once.'}
      </Text>
      {failure ? <Text style={styles.muted}>{AGENT_PASS_FAILURE_COPY[failure][lang]}</Text> : null}
      {query.data && query.data.length === 0 ? <Text style={styles.muted}>{lang === 'zh' ? '还没有通行证。' : 'No Passes yet.'}</Text> : null}
      {query.data
        ? query.data.map((pass) => {
            const preview = agentPassPreviewV1(pass);
            return (
              <View key={pass.id} style={styles.item}>
                <Text style={styles.text}>
                  <Text style={styles.strong}>{preview.who[lang]}</Text>
                  {` · ${preview.statusCopy[lang]} · ${preview.uses[lang]}`}
                </Text>
                <View style={styles.actions}>
                  <TouchableOpacity accessibilityRole="button" accessibilityState={{ expanded: open === pass.id }} onPress={() => setOpen(open === pass.id ? null : pass.id)}>
                    <Text style={styles.link}>{open === pass.id ? (lang === 'zh' ? '收起' : 'Hide') : lang === 'zh' ? '看它能做什么' : 'See what it allows'}</Text>
                  </TouchableOpacity>
                  {preview.revocable && confirming !== pass.id ? (
                    <TouchableOpacity accessibilityRole="button" onPress={() => setConfirming(pass.id)}>
                      <Text style={styles.link}>{lang === 'zh' ? '撤销' : 'Revoke'}</Text>
                    </TouchableOpacity>
                  ) : null}
                </View>
                {confirming === pass.id ? (
                  <View style={styles.actions}>
                    <Text style={styles.muted}>{lang === 'zh' ? '撤销后对方马上读不到了。' : 'They lose access at once.'}</Text>
                    <TouchableOpacity accessibilityRole="button" onPress={() => void revoke(pass)}>
                      <Text style={styles.danger}>{lang === 'zh' ? '确认撤销' : 'Revoke'}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity accessibilityRole="button" onPress={() => setConfirming(null)}>
                      <Text style={styles.link}>{lang === 'zh' ? '取消' : 'Cancel'}</Text>
                    </TouchableOpacity>
                  </View>
                ) : null}
                {open === pass.id ? (
                  <View style={styles.detail}>
                    <Text style={styles.muted}>{lang === 'zh' ? '它可以：' : 'It allows:'}</Text>
                    {preview.can.map((line) => (
                      <Text key={line.en} style={styles.muted}>{`• ${line[lang]}`}</Text>
                    ))}
                    <Text style={styles.muted}>{`${preview.duration[lang]}${preview.expiresAt ? ` · ${new Date(preview.expiresAt).toLocaleString()}` : ''}`}</Text>
                  </View>
                ) : null}
              </View>
            );
          })
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
