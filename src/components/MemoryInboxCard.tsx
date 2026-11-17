/**
 * MemoryInboxCard — what the Agent wants to remember, waiting for the owner (L8 1b A2, memoryProposals.ts).
 * Rendered only behind EXPO_PUBLIC_MEMORY_PROPOSALS=1; renders nothing while the server switch is off.
 *
 * In builds that also have asking around (EXPO_PUBLIC_TWIN_ASK=1) each memory has a tick, "friends may hear this too"
 * (twinAskMemoryShare.ts): keeping the memory then also saves the words — as the owner edits them, under one topic — as
 * an entry their twin may pass on to friends. Without the tick, keeping a memory tells friends nothing. "Keep all" only
 * covers the memories that are not ticked.
 */
import React, { useState } from 'react';
import { StyleSheet, Switch, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  MEMORY_PROPOSALS_SECTION_COPY_V1 as COPY,
  MEMORY_PROPOSAL_CATEGORY_COPY_V1,
  MEMORY_PROPOSAL_SOURCE_COPY_V1,
} from '../../shared/client/memory-proposals';
import type { MemoryProposalDecisionV1 } from '../../shared/types/memory-proposal';
import { memoryProposalReadableText } from '../../shared/types/memory-proposal-text';
import { TWIN_ASK_LIMITS_V0, TWIN_ASK_TOPIC_LABELS_V0, TWIN_ASK_TWIN_TOPICS_V0 } from '../../shared/types/twin-ask';
import { TwinAskChip } from '../screens/four-zone/TwinAskChip';
import { getApiConfig } from '../services/api';
import { createMobileMemoryProposalsClient } from '../services/memoryProposals';
import { mobileV6HttpTransport } from '../services/mobileV6Runtime';
import { TWIN_ASK_ENABLED } from '../services/twinAsk';
import {
  TWIN_ASK_MEMORY_WORDS as SHARE,
  keepAndShareTwinAskMemory,
  retryTwinAskMemoryEntry,
  twinAskMemoryDraft,
  type TwinAskMemoryDraft,
  type TwinAskMemoryEntryResult,
} from '../services/twinAskMemoryShare';
import { mobileTwinAskClient } from '../services/twinAskSession';
import type { TwinAskWords } from '../services/twinAskView';
import { useAuthStore } from '../stores/authStore';
import { useI18n } from '../stores/i18nStore';
import { useThemedStyles, type Palette } from '../theme/useTheme';

const FACTS_KEY = ['twin-ask', 'facts'];

function client() {
  return createMobileMemoryProposalsClient({
    transport: mobileV6HttpTransport,
    baseUrl: getApiConfig().baseUrl || 'https://api.agentrix.top/api',
    token: () => getApiConfig().token || useAuthStore.getState().token,
  });
}

/** The words friends may hear and the topic they are filed under. */
function ShareEditor(props: { id: string; draft: TwinAskMemoryDraft; lang: 'zh' | 'en'; onChange: (draft: TwinAskMemoryDraft) => void }) {
  const styles = useThemedStyles(makeStyles);
  const { draft, lang } = props;
  return (
    <View style={styles.editor}>
      <View style={styles.chips}>
        {TWIN_ASK_TWIN_TOPICS_V0.map((topic) => (
          <TwinAskChip
            key={topic}
            label={TWIN_ASK_TOPIC_LABELS_V0[topic][lang]}
            on={draft.topic === topic}
            onPress={() => props.onChange({ ...draft, topic })}
            testID={`memory-share-topic-${props.id}-${topic}`}
          />
        ))}
      </View>
      <TextInput
        style={styles.input}
        value={draft.text}
        onChangeText={(text) => props.onChange({ ...draft, text })}
        maxLength={TWIN_ASK_LIMITS_V0.factMax}
        multiline
        accessibilityLabel={SHARE.entryLabel[lang]}
        testID={`memory-share-text-${props.id}`}
      />
      <Text style={styles.muted}>{SHARE.rules[lang]}</Text>
    </View>
  );
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
      if (result.ok === false) throw new Error(result.failure);
      return result.value;
    },
    retry: 0,
  });
  const [notice, setNotice] = useState('');
  /** Ticked memories: what friends may hear for each, by proposal id. */
  const [drafts, setDrafts] = useState<Record<string, TwinAskMemoryDraft>>({});
  const [draftProblem, setDraftProblem] = useState<{ id: string; words: TwinAskWords } | null>(null);
  /** The memory is kept but its entry for friends was not saved: only the entry is left to try again. */
  const [pending, setPending] = useState<{ draft: TwinAskMemoryDraft; words: TwinAskWords } | null>(null);
  const [busy, setBusy] = useState(false);
  const ticked = Object.keys(drafts).length > 0;
  const facts = useQuery({ queryKey: FACTS_KEY, queryFn: () => mobileTwinAskClient().facts(), enabled: TWIN_ASK_ENABLED && (ticked || pending !== null), retry: 0 });

  if (query.error instanceof Error && query.error.message === 'closed') return null;

  const untick = (ids: string[]): void => {
    setDrafts((current) => Object.fromEntries(Object.entries(current).filter(([id]) => !ids.includes(id))));
    setDraftProblem((current) => (current && ids.includes(current.id) ? null : current));
  };
  const keep = async (ids: string[]): Promise<boolean> => {
    const result = await client().decide(ids, 'accept');
    return result.ok && !result.value.some((entry) => entry.result === 'failed');
  };
  const decide = async (ids: string[], decision: MemoryProposalDecisionV1) => {
    if (ids.length === 0) return;
    const result = await client().decide(ids, decision);
    const failed = !result.ok || result.value.some((entry) => entry.result === 'failed');
    setNotice(failed ? COPY.failed[lang] : COPY.done[lang]);
    untick(ids);
    await queryClient.invalidateQueries({ queryKey: key });
  };
  const addFact: Parameters<typeof keepAndShareTwinAskMemory>[1]['addFact'] = (input) => mobileTwinAskClient().addFact(input);
  const afterEntry = (result: TwinAskMemoryEntryResult): void => {
    if (result.kind === 'shared') {
      setPending(null);
      setNotice(SHARE.shared[lang]);
      void queryClient.invalidateQueries({ queryKey: FACTS_KEY });
      return;
    }
    setNotice('');
    setPending({ draft: { topic: result.entry.topic, text: result.entry.text }, words: result.words });
  };
  const keepAndShare = async (id: string) => {
    const draft = drafts[id];
    if (!draft || busy) return;
    // One unsaved entry at a time: a second failure would replace the first one's words without a trace.
    if (pending) {
      setDraftProblem({ id, words: SHARE.pendingFirst });
      return;
    }
    setBusy(true);
    setDraftProblem(null);
    try {
      const result = await keepAndShareTwinAskMemory(draft, { keep: () => keep([id]), addFact, facts: facts.data ?? null });
      if (result.kind === 'invalid') {
        setDraftProblem({ id, words: result.words });
        return;
      }
      if (result.kind === 'not_kept') {
        setNotice(COPY.failed[lang]);
      } else {
        untick([id]);
        afterEntry(result);
      }
      await queryClient.invalidateQueries({ queryKey: key });
    } finally {
      setBusy(false);
    }
  };
  const retryEntry = async () => {
    if (!pending || busy) return;
    setBusy(true);
    try {
      const result = await retryTwinAskMemoryEntry(pending.draft, { addFact, facts: facts.data ?? null });
      if (result.kind === 'invalid') setPending({ draft: pending.draft, words: result.words });
      else afterEntry(result);
    } finally {
      setBusy(false);
    }
  };

  const proposals = query.data ?? [];
  const unticked = proposals.filter((proposal) => drafts[proposal.id] === undefined);
  return (
    <View style={styles.card} testID="memory-inbox-card">
      <Text style={styles.title}>{COPY.title[lang]}</Text>
      <Text style={styles.muted}>{COPY.scope[lang]}</Text>
      {query.error ? <Text style={styles.muted}>{COPY.unreadable[lang]}</Text> : null}
      {query.data && proposals.length === 0 ? <Text style={styles.muted}>{COPY.empty[lang]}</Text> : null}
      {pending ? (
        <View style={styles.item} testID="memory-share-pending">
          <Text style={styles.problem}>{`${SHARE.entryFailed[lang]} ${pending.words[lang]}`}</Text>
          <ShareEditor id="pending" draft={pending.draft} lang={lang} onChange={(draft) => setPending({ draft, words: pending.words })} />
          <View style={styles.row}>
            <TouchableOpacity accessibilityRole="button" disabled={busy} onPress={() => void retryEntry()} testID="memory-share-retry">
              <Text style={[styles.action, busy && styles.dim]}>{SHARE.retry[lang]}</Text>
            </TouchableOpacity>
            <TouchableOpacity accessibilityRole="button" disabled={busy} onPress={() => setPending(null)} testID="memory-share-drop">
              <Text style={styles.muted}>{SHARE.drop[lang]}</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : null}
      {unticked.length > 0 ? (
        <TouchableOpacity accessibilityRole="button" disabled={busy} onPress={() => void decide(unticked.map((p) => p.id), 'accept')}>
          <Text style={styles.action}>{`${COPY.acceptAll[lang]} (${unticked.length})`}</Text>
        </TouchableOpacity>
      ) : null}
      {proposals.map((proposal) => {
        const draft = drafts[proposal.id];
        const readable = memoryProposalReadableText(proposal.text ?? '');
        return (
          <View key={proposal.id} style={styles.item}>
            <Text style={styles.text} selectable>{readable}</Text>
            <Text style={styles.muted}>
              {`${MEMORY_PROPOSAL_SOURCE_COPY_V1[proposal.source.kind][lang]} · ${MEMORY_PROPOSAL_CATEGORY_COPY_V1[proposal.category][lang]}`}
            </Text>
            {TWIN_ASK_ENABLED && readable.trim() !== '' ? (
              <View style={styles.switchRow}>
                <Text style={[styles.text, styles.grow]}>{SHARE.tick[lang]}</Text>
                <Switch
                  value={draft !== undefined}
                  disabled={busy}
                  onValueChange={(on) => {
                    if (on) setDrafts((current) => ({ ...current, [proposal.id]: twinAskMemoryDraft(readable) }));
                    else untick([proposal.id]);
                  }}
                  accessibilityLabel={SHARE.tick[lang]}
                  testID={`memory-share-tick-${proposal.id}`}
                />
              </View>
            ) : null}
            {draft ? (
              <>
                <Text style={styles.muted}>{SHARE.tickHint[lang]}</Text>
                <ShareEditor id={proposal.id} draft={draft} lang={lang} onChange={(next) => setDrafts((current) => ({ ...current, [proposal.id]: next }))} />
                {draftProblem && draftProblem.id === proposal.id ? (
                  <Text style={styles.problem} testID={`memory-share-problem-${proposal.id}`}>
                    {draftProblem.words[lang]}
                  </Text>
                ) : null}
              </>
            ) : null}
            <View style={styles.row}>
              <TouchableOpacity
                accessibilityRole="button"
                disabled={busy}
                onPress={() => void (draft ? keepAndShare(proposal.id) : decide([proposal.id], 'accept'))}
                testID={`memory-accept-${proposal.id}`}
              >
                <Text style={[styles.action, busy && styles.dim]}>{draft ? SHARE.keepAndShare[lang] : COPY.accept[lang]}</Text>
              </TouchableOpacity>
              <TouchableOpacity accessibilityRole="button" disabled={busy} onPress={() => void decide([proposal.id], 'reject')}>
                <Text style={styles.muted}>{COPY.reject[lang]}</Text>
              </TouchableOpacity>
            </View>
          </View>
        );
      })}
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
    switchRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 4 },
    grow: { flex: 1 },
    editor: { gap: 8, marginTop: 4 },
    chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    input: {
      minHeight: 72,
      padding: 10,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: p.border,
      color: p.text,
      fontSize: 13,
      lineHeight: 19,
      textAlignVertical: 'top',
    },
    problem: { color: p.error, fontSize: 13, lineHeight: 19, fontWeight: '600' },
    dim: { opacity: 0.45 },
  });
