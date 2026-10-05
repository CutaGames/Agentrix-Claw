/**
 * AgentRequestsCard — 别人的 Agent 发来的请求 on the passport screen (L6-1, agentCollaboration.ts).
 * Rendered only behind EXPO_PUBLIC_AGENT_COLLABORATION=1; renders nothing while the server switch is off.
 * Counterpart text is outside content: plain text only, and the owner's only action is giving the counterpart a tier.
 */
import React, { useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AGENT_COLLABORATION_TIERS_V0, type AgentCollaborationRequestViewV0 } from '../../shared/types/agent-collaboration';
import {
  AGENT_COLLABORATION_FAILURE_COPY,
  AGENT_COLLABORATION_KIND_COPY,
  AGENT_COLLABORATION_TIER_COPY,
  AgentCollaborationError,
  counterpartTier,
  createMobileAgentCollaborationClient,
  type MobileAgentCollaborationClientV0,
} from '../services/agentCollaboration';
import { getApiConfig } from '../services/api';
import { mobileV6HttpTransport } from '../services/mobileV6Runtime';
import { useAuthStore } from '../stores/authStore';
import { useI18n } from '../stores/i18nStore';
import { useThemedStyles, type Palette } from '../theme/useTheme';

const TIER_CHOICES = ['stranger', ...AGENT_COLLABORATION_TIERS_V0] as const;

function mobileAgentCollaborationClient(): MobileAgentCollaborationClientV0 {
  return createMobileAgentCollaborationClient({
    transport: mobileV6HttpTransport,
    baseUrl: getApiConfig().baseUrl || 'https://api.agentrix.top/api',
    token: () => getApiConfig().token || useAuthStore.getState().token,
  });
}

export function AgentRequestsCard() {
  const { language } = useI18n();
  const lang = language === 'zh' ? 'zh' : 'en';
  const styles = useThemedStyles(makeStyles);
  const queryClient = useQueryClient();
  const key = ['four-zone', 'agent-collaboration'];
  const query = useQuery({
    queryKey: key,
    queryFn: async () => {
      const client = mobileAgentCollaborationClient();
      const [requests, relationships] = await Promise.all([client.requests(), client.relationships()]);
      return { requests, relationships };
    },
    retry: 0,
  });
  const [notice, setNotice] = useState('');

  const failure = query.error instanceof AgentCollaborationError ? query.error.failure : query.error ? 'unavailable' : null;
  if (failure === 'closed') return null;

  const setTier = async (request: AgentCollaborationRequestViewV0, choice: (typeof TIER_CHOICES)[number]) => {
    try {
      await mobileAgentCollaborationClient().setTier(request.identity, choice === 'stranger' ? null : choice);
      setNotice(lang === 'zh' ? '已更新。' : 'Updated.');
      await queryClient.invalidateQueries({ queryKey: key });
    } catch (error) {
      setNotice(AGENT_COLLABORATION_FAILURE_COPY[error instanceof AgentCollaborationError ? error.failure : 'unavailable'][lang]);
    }
  };

  const data = query.data;
  return (
    <View style={styles.card} testID="agent-requests-card">
      <Text style={styles.title}>{lang === 'zh' ? '别人的 Agent 发来的请求' : "Requests from other people's Agents"}</Text>
      <Text style={styles.muted}>
        {lang === 'zh'
          ? '对方身份还没验证；内容来自外人，请自己判断。陌生人只能提问，给对方分档后才能约时间、发定金意向或文件。'
          : 'Identities are not verified yet and the text comes from outside. Strangers may only ask; give a tier to allow bookings, deposits or files.'}
      </Text>
      {failure ? <Text style={styles.muted}>{AGENT_COLLABORATION_FAILURE_COPY[failure][lang]}</Text> : null}
      {data && data.requests.length === 0 ? <Text style={styles.muted}>{lang === 'zh' ? '还没有请求。' : 'No requests yet.'}</Text> : null}
      {data
        ? data.requests.map((request) => {
            const current = counterpartTier(data.relationships, request.identity);
            return (
              <View key={request.receiptId} style={styles.request}>
                <Text style={styles.text}>
                  <Text style={styles.strong}>{request.counterpartName}</Text>
                  {` · ${request.identity.value} · ${AGENT_COLLABORATION_KIND_COPY[request.kind][lang]}`}
                  {request.proposedStartAt ? ` · ${new Date(request.proposedStartAt).toLocaleString()}` : ''}
                  {request.amountMinor !== null && request.currency ? ` · ${(request.amountMinor / 100).toFixed(2)} ${request.currency}` : ''}
                </Text>
                <Text style={styles.message} selectable>
                  {request.message}
                </Text>
                {request.fileUrl ? <Text style={styles.muted}>{request.fileUrl}</Text> : null}
                <View style={styles.tiers}>
                  {TIER_CHOICES.map((choice) => (
                    <TouchableOpacity
                      key={choice}
                      accessibilityRole="radio"
                      accessibilityState={{ selected: current === choice }}
                      onPress={() => (current === choice ? undefined : void setTier(request, choice))}
                    >
                      <Text style={current === choice ? styles.tierOn : styles.tier}>{AGENT_COLLABORATION_TIER_COPY[choice][lang]}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
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
    request: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: p.border, paddingTop: 8, gap: 4 },
    text: { color: p.text, fontSize: 13 },
    strong: { fontWeight: '700' },
    message: { color: p.text, fontSize: 13, lineHeight: 19 },
    tiers: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 4 },
    tier: { color: p.textMuted, fontSize: 13 },
    tierOn: { color: p.accent, fontSize: 13, fontWeight: '700' },
    muted: { color: p.textMuted, fontSize: 13 },
  });
