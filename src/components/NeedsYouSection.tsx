/**
 * NeedsYouSection — the top of the M0 home 需要你 (needsYou.ts; behind EXPO_PUBLIC_MOBILE_M0=1). One card per decision,
 * every action done here: approve or reject a payment (SpendApprovalCard, with its own step-up), give another Agent's
 * sender a tier, copy a follow-up draft, mark a goal done. The 事项 list (computer approvals, twin review) stays below
 * it on the same screen. A source that is closed or failed shows nothing; the rest still shows.
 */
import React, { useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AGENT_COLLABORATION_TIERS_V0, type AgentCollaborationTierV0 } from '../../shared/types/agent-collaboration';
import { getApiConfig } from '../services/api';
import { mobileV6HttpTransport } from '../services/mobileV6Runtime';
import {
  AGENT_COLLABORATION_KIND_COPY,
  AGENT_COLLABORATION_TIER_COPY,
  agentCollaborationVerificationCopy,
  createMobileAgentCollaborationClient,
} from '../services/agentCollaboration';
import { OWNER_FOLLOW_UPS_ENABLED, createMobileOwnerGoalsClient, ownerFollowUpCopy } from '../services/ownerGoals';
import { SPEND_APPROVAL_CARD_ENABLED } from '../services/spendApproval';
import { buildNeedsYou, needsYouSummary, readPendingSpendApprovals, type NeedsYouCardV0 } from '../services/needsYou';
import { SpendApprovalCard } from './SpendApprovalCard';
import { useAuthStore } from '../stores/authStore';
import { useI18n } from '../stores/i18nStore';
import { useThemedStyles, type Palette } from '../theme/useTheme';

const base = () => getApiConfig().baseUrl || 'https://api.agentrix.top/api';
const token = () => getApiConfig().token || useAuthStore.getState().token;
const deps = () => ({ transport: mobileV6HttpTransport, baseUrl: base(), token });
const KEY = ['m0', 'needs-you'] as const;
const TIER_CHOICES = ['stranger', ...AGENT_COLLABORATION_TIERS_V0] as const;

async function quiet<T>(read: () => Promise<T>): Promise<T | null> {
  try {
    return await read();
  } catch {
    return null;
  }
}

export function NeedsYouSection() {
  const { language } = useI18n();
  const lang = language === 'zh' ? 'zh' : 'en';
  const styles = useThemedStyles(makeStyles);
  const queryClient = useQueryClient();
  const [notice, setNotice] = useState('');

  const query = useQuery({
    queryKey: KEY,
    queryFn: async () => {
      const goals = createMobileOwnerGoalsClient(deps());
      const [approvals, requests, followUps, goalList] = await Promise.all([
        SPEND_APPROVAL_CARD_ENABLED ? readPendingSpendApprovals({ ...deps(), token: token() }, Date.now()) : Promise.resolve(null),
        quiet(() => createMobileAgentCollaborationClient(deps()).requests()),
        OWNER_FOLLOW_UPS_ENABLED ? quiet(() => goals.followUps()) : Promise.resolve(null),
        quiet(() => goals.list()),
      ]);
      return buildNeedsYou({ approvals, requests, followUps, goals: goalList, matters: null }, Date.now());
    },
    retry: 0,
    staleTime: 15_000,
  });
  const cards = query.data ?? [];

  const act = async (action: () => Promise<unknown>, done: string) => {
    try {
      await action();
      setNotice(done);
    } catch {
      setNotice(lang === 'zh' ? '没成功，请稍后再试。' : 'That did not work. Please try again.');
    }
    await queryClient.invalidateQueries({ queryKey: KEY });
  };

  const setTier = (card: NeedsYouCardV0, tier: AgentCollaborationTierV0 | 'stranger') =>
    act(
      () => createMobileAgentCollaborationClient(deps()).setTier(card.request!.identity, tier === 'stranger' ? null : tier),
      lang === 'zh' ? '已更新分档。' : 'Tier updated.',
    );

  return (
    <View style={styles.wrap} testID="needs-you">
      <View style={styles.summary}>
        <Text style={styles.summaryText}>{query.isLoading ? (lang === 'zh' ? '正在看有什么要你管…' : 'Checking what needs you…') : needsYouSummary(cards, lang)}</Text>
      </View>
      {cards.map((card) => {
        if (card.kind === 'spend_approval' && card.spend) {
          return <SpendApprovalCard key={card.key} approvalRef={card.id} initial={card.spend} testID="needs-you-approval" />;
        }
        return (
          <View key={card.key} style={styles.card} testID={`needs-you-${card.kind}`}>
            <Text style={[styles.kind, KIND_COLOR[card.kind] ? { color: KIND_COLOR[card.kind] } : null]}>{KIND_LABEL[card.kind][lang]}</Text>
            {card.kind === 'agent_request' && card.request ? (
              <>
                <Text style={styles.title} selectable>{card.title}</Text>
                <Text style={styles.detail}>
                  {`${AGENT_COLLABORATION_KIND_COPY[card.request.kind][lang]} · ${agentCollaborationVerificationCopy(card.request)[lang]}`}
                  {card.request.proposedStartAt ? ` · ${new Date(card.request.proposedStartAt).toLocaleString()}` : ''}
                </Text>
                <View style={styles.actions}>
                  {TIER_CHOICES.map((tier) => (
                    <TouchableOpacity key={tier} accessibilityRole="button" onPress={() => void setTier(card, tier)}>
                      <Text style={styles.chip}>{AGENT_COLLABORATION_TIER_COPY[tier][lang]}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </>
            ) : card.kind === 'goal_check_in' ? (
              <>
                <Text style={styles.title}>{card.title}</Text>
                <View style={styles.actions}>
                  <TouchableOpacity
                    accessibilityRole="button"
                    onPress={() => void act(() => createMobileOwnerGoalsClient(deps()).update(card.id, { status: 'done' }), lang === 'zh' ? '已标为完成。' : 'Marked done.')}
                  >
                    <Text style={styles.primary}>{lang === 'zh' ? '标为完成' : 'Mark done'}</Text>
                  </TouchableOpacity>
                </View>
              </>
            ) : (
              <>
                <Text style={styles.title} selectable>
                  {card.kind === 'lead_no_reply' ? card.title : followUpLine(card, lang)}
                </Text>
                {card.draft ? (
                  <View style={styles.actions}>
                    <TouchableOpacity
                      accessibilityRole="button"
                      onPress={() => void Clipboard.setStringAsync(card.draft![lang]).then(() => setNotice(lang === 'zh' ? '已复制跟进草稿。' : 'Follow-up copied.'))}
                    >
                      <Text style={styles.primary}>{lang === 'zh' ? '复制跟进草稿' : 'Copy follow-up'}</Text>
                    </TouchableOpacity>
                  </View>
                ) : null}
              </>
            )}
          </View>
        );
      })}
      {notice ? <Text style={styles.notice}>{notice}</Text> : null}
    </View>
  );
}

function followUpLine(card: NeedsYouCardV0, lang: 'zh' | 'en'): string {
  if (card.kind !== 'booking_soon' && card.kind !== 'deposit_unpaid') return card.title;
  const at = card.at ?? card.title;
  return ownerFollowUpCopy({ cardId: card.key, kind: card.kind, refId: card.id, agentAccountId: '', dueAt: at, startsAt: at }, (iso) => new Date(iso).toLocaleString())[lang];
}

const KIND_LABEL: Record<NeedsYouCardV0['kind'], { zh: string; en: string }> = {
  spend_approval: { zh: '要你批准', en: 'Needs your approval' },
  agent_request: { zh: '别人的 Agent 发来的', en: "From someone's Agent" },
  lead_no_reply: { zh: '线索两天没回', en: 'Lead waiting two days' },
  deposit_unpaid: { zh: '定金没付', en: 'Deposit not paid' },
  booking_soon: { zh: '24 小时内的预约', en: 'Booking within 24 hours' },
  goal_check_in: { zh: '该复盘了', en: 'Time to check in' },
  computer_approval: { zh: '电脑发来的审批', en: 'From your computer' },
  twin_review: { zh: '分身复核', en: 'Twin review' },
};

const KIND_COLOR: Partial<Record<NeedsYouCardV0['kind'], string>> = {
  agent_request: '#6d4fd8',
  lead_no_reply: '#b45309',
  deposit_unpaid: '#b45309',
  booking_soon: '#15803d',
};

const makeStyles = (p: Palette) =>
  StyleSheet.create({
    wrap: { gap: 10, marginBottom: 12 },
    summary: { backgroundColor: p.text, borderRadius: 16, paddingVertical: 12, paddingHorizontal: 14 },
    summaryText: { color: p.card, fontSize: 13, lineHeight: 19 },
    card: { backgroundColor: p.card, borderRadius: 16, padding: 13, gap: 4 },
    kind: { alignSelf: 'flex-start', fontSize: 11, fontWeight: '700', borderRadius: 10, overflow: 'hidden', paddingHorizontal: 8, paddingVertical: 2, color: p.accent, backgroundColor: p.border },
    title: { color: p.text, fontSize: 14, fontWeight: '600', lineHeight: 20 },
    detail: { color: p.textMuted, fontSize: 12.5, lineHeight: 18 },
    actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 6 },
    chip: { color: p.accent, fontSize: 13, fontWeight: '600' },
    primary: { color: p.accent, fontSize: 14, fontWeight: '700' },
    notice: { color: p.textMuted, fontSize: 13 },
  });
