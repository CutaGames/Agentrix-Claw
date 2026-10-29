/**
 * MemoryInboxCard — what the Agent wants to remember, waiting for the owner (L8 1b A2, memoryProposals.ts).
 * Rendered only behind EXPO_PUBLIC_MEMORY_PROPOSALS=1; renders nothing while the server switch is off.
 */
import React, { useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  MEMORY_PROPOSALS_SECTION_COPY_V1 as COPY,
  MEMORY_PROPOSAL_CATEGORY_COPY_V1,
  MEMORY_PROPOSAL_SOURCE_COPY_V1,
} from '../../shared/client/memory-proposals';
import type { MemoryProposalDecisionV1 } from '../../shared/types/memory-proposal';
import { memoryProposalReadableText } from '../../shared/types/memory-proposal-text';
import { getApiConfig } from '../services/api';
import { createMobileMemoryProposalsClient } from '../services/memoryProposals';
import { mobileV6HttpTransport } from '../services/mobileV6Runtime';
import { useAuthStore } from '../stores/authStore';
import { useI18n } from '../stores/i18nStore';
import { useThemedStyles, type Palette } from '../theme/useTheme';

function client() {
  return createMobileMemoryProposalsClient({
    transport: mobileV6HttpTransport,
    baseUrl: getApiConfig().baseUrl || 'https://api.agentrix.top/api',
    token: () => getApiConfig().token || useAuthStore.getState().token,
  });
}

export function MemoryInboxCard() {
  const { language } = useI18n();
  const lang = language === 'zh' ? 'zh' : 'en';
  const styles = useThemedStyles(makeStyles);
  const queryClient = useQueryClient();
  const key = ['memory-proposals'];
  const query = useQuery({
    queryKey: key,
    queryFn: async () => {
      const result = await client().list();
      if (!result.ok) throw new Error(result.failure);
      return result.value;
    },
    retry: 0,
  });
  const [notice, setNotice] = useState('');

  if (query.error instanceof Error && query.error.message === 'closed') return null;

  const decide = async (ids: string[], decision: MemoryProposalDecisionV1) => {
    if (ids.length === 0) return;
    const result = await client().decide(ids, decision);
    const failed = !result.ok || result.value.some((entry) => entry.result === 'failed');
    setNotice(failed ? COPY.failed[lang] : COPY.done[lang]);
    await queryClient.invalidateQueries({ queryKey: key });
  };

  const proposals = query.data ?? [];
  return (
    <View style={styles.card} testID="memory-inbox-card">
      <Text style={styles.title}>{COPY.title[lang]}</Text>
      <Text style={styles.muted}>{COPY.scope[lang]}</Text>
      {query.error ? <Text style={styles.muted}>{COPY.unreadable[lang]}</Text> : null}
      {query.data && proposals.length === 0 ? <Text style={styles.muted}>{COPY.empty[lang]}</Text> : null}
      {proposals.length > 0 ? (
        <TouchableOpacity accessibilityRole="button" onPress={() => void decide(proposals.map((p) => p.id), 'accept')}>
          <Text style={styles.action}>{`${COPY.acceptAll[lang]} (${proposals.length})`}</Text>
        </TouchableOpacity>
      ) : null}
      {proposals.map((proposal) => (
        <View key={proposal.id} style={styles.item}>
          <Text style={styles.text} selectable>{memoryProposalReadableText(proposal.text ?? '')}</Text>
          <Text style={styles.muted}>
            {`${MEMORY_PROPOSAL_SOURCE_COPY_V1[proposal.source.kind][lang]} · ${MEMORY_PROPOSAL_CATEGORY_COPY_V1[proposal.category][lang]}`}
          </Text>
          <View style={styles.row}>
            <TouchableOpacity accessibilityRole="button" onPress={() => void decide([proposal.id], 'accept')}>
              <Text style={styles.action}>{COPY.accept[lang]}</Text>
            </TouchableOpacity>
            <TouchableOpacity accessibilityRole="button" onPress={() => void decide([proposal.id], 'reject')}>
              <Text style={styles.muted}>{COPY.reject[lang]}</Text>
            </TouchableOpacity>
          </View>
        </View>
      ))}
      {notice ? <Text style={styles.muted}>{notice}</Text> : null}
    </View>
  );
}

const makeStyles = (p: Palette) =>
  StyleSheet.create({
    card: { backgroundColor: p.card, borderRadius: 16, padding: 16, marginBottom: 12, gap: 8 },
    title: { color: p.text, fontSize: 16, fontWeight: '700' },
    item: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: p.border, paddingTop: 8, gap: 4 },
    text: { color: p.text, fontSize: 13, lineHeight: 19 },
    row: { flexDirection: 'row', gap: 16, marginTop: 4 },
    action: { color: p.accent, fontSize: 13, fontWeight: '700' },
    muted: { color: p.textMuted, fontSize: 13 },
  });
