/**
 * TwinAskSettingsScreen — 分身 → 问遍身边人 → 设置 (twinAsk.ts, twinAskView.ts). Only in builds with
 * `EXPO_PUBLIC_TWIN_ASK=1`. Whether your twin answers friends first, how many times a day friends may ask you in the
 * app, what your twin may tell them (your own words, by topic), and which topics each relationship tier may ask about.
 * Opening topics to a tier asks you to confirm it is you; closing them saves at once.
 */
import React, { useRef, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Switch, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useI18n } from '../../stores/i18nStore';
import { useThemedStyles, type Palette } from '../../theme/useTheme';
import { RELATIONSHIP_TIER_COPY_V1 } from '../../../shared/types/relationship-book';
import {
  TWIN_ASK_LIMITS_V0,
  TWIN_ASK_TOPIC_LABELS_V0,
  TWIN_ASK_TWIN_TOPICS_V0,
  type TwinAskProfileV0,
  type TwinAskSharingTierV0,
  type TwinAskTwinTopicV0,
  type TwinFriendFactInputV0,
  type TwinFriendFactV0,
} from '../../../shared/types/twin-ask';
import { StepUpSheet } from '../../components/StepUpSheet';
import { saveTwinAskSharing } from '../../services/twinAsk';
import { mobileTwinAskClient } from '../../services/twinAskSession';
import {
  TWIN_ASK_DAILY_CAP_CHOICES,
  TWIN_ASK_SHARING_STEP_UP_REASON,
  twinAskDailyCapWords,
  twinAskFactFits,
  twinAskFactFromForm,
  twinAskFactSourceWords,
  twinAskFactsByTopic,
  twinAskFailureWords,
  twinAskProblemWords,
  twinAskProfilePatch,
  twinAskSharingChange,
  twinAskSharingSaveWords,
  twinAskWidenWords,
  type TwinAskWords,
} from '../../services/twinAskView';
import { TwinAskChip } from './TwinAskChip';

type Tier = TwinAskSharingTierV0['tier'];
type Notice = { words: TwinAskWords; ok: boolean };

const PROFILE_KEY = ['twin-ask', 'profile'];
const FACTS_KEY = ['twin-ask', 'facts'];
const SHARING_KEY = ['twin-ask', 'sharing'];
const L = TWIN_ASK_LIMITS_V0;
const SAVED: TwinAskWords = { en: 'Saved.', zh: '已保存。' };
const OPT_IN_WORDS: TwinAskWords = { en: 'Let my twin answer friends first', zh: '朋友问我时，分身先替我答' };
const FULL_WORDS: TwinAskWords = {
  en: `Up to ${L.factsMax} entries in all and ${L.factsPerTopicMax} per topic.`,
  zh: `最多 ${L.factsMax} 条，每个话题最多 ${L.factsPerTopicMax} 条。`,
};

export function TwinAskSettingsScreen() {
  const { t } = useI18n();
  const styles = useThemedStyles(makeStyles);
  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content} testID="twin-ask-settings-screen" keyboardShouldPersistTaps="handled">
      <Text style={styles.title} accessibilityRole="header">
        {t({ en: 'Ask-around settings', zh: '问遍身边人设置' })}
      </Text>
      <ProfileSection />
      <FactsSection />
      <SharingSection />
    </ScrollView>
  );
}

function Retry({ words, onRetry, testID }: { words: TwinAskWords; onRetry: () => void; testID: string }) {
  const { t } = useI18n();
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={styles.section}>
      <Text style={styles.problem}>{t(words)}</Text>
      <TouchableOpacity style={styles.secondary} onPress={onRetry} accessibilityRole="button" testID={testID}>
        <Text style={styles.secondaryText}>{t({ en: 'Try again', zh: '重试' })}</Text>
      </TouchableOpacity>
    </View>
  );
}

function ProfileSection() {
  const { t } = useI18n();
  const styles = useThemedStyles(makeStyles);
  const queryClient = useQueryClient();
  const saved = useQuery({ queryKey: PROFILE_KEY, queryFn: () => mobileTwinAskClient().profile() });
  const [draft, setDraft] = useState<TwinAskProfileV0 | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const save = useMutation({
    mutationFn: (patch: Partial<TwinAskProfileV0>) => mobileTwinAskClient().updateProfile(patch),
    onSuccess: (profile) => {
      queryClient.setQueryData(PROFILE_KEY, profile);
      setDraft(null);
      setNotice({ words: SAVED, ok: true });
    },
    onError: (error) => setNotice({ words: twinAskFailureWords(error), ok: false }),
  });

  if (saved.isPending) return <ActivityIndicator />;
  if (saved.isError) return <Retry words={twinAskFailureWords(saved.error)} onRetry={() => void saved.refetch()} testID="twin-ask-profile-retry" />;

  const current = draft ?? saved.data;
  const patch = twinAskProfilePatch(saved.data, current);
  const cap = current.dailyCap ?? L.perFriendPerDayMax;
  const change = (next: Partial<TwinAskProfileV0>): void => {
    setNotice(null);
    setDraft({ ...current, ...next });
  };
  return (
    <View style={styles.section}>
      <View style={styles.switchRow}>
        <View style={styles.grow}>
          <Text style={styles.body}>{t(OPT_IN_WORDS)}</Text>
          <Text style={styles.muted}>
            {t({
              en: `When a friend you have both placed in a tier asks in the app, your twin passes on what you wrote below, at most ${L.quotesMax} entries. Anything it can't answer, and questions only you should answer, come to you. When this is off, every question comes to you.`,
              zh: `打开后，互相定过档的朋友在 App 里问你，分身先照你下面写好的话转述，一次最多 ${L.quotesMax} 条；分身答不了的、只该本人答的，转给你本人。关着时，朋友的问题都直接转给你。`,
            })}
          </Text>
        </View>
        <Switch value={current.optIn} onValueChange={(optIn) => change({ optIn })} accessibilityLabel={t(OPT_IN_WORDS)} testID="twin-ask-opt-in" />
      </View>
      <Text style={styles.label}>{t({ en: 'Times a day friends may ask me in the app', zh: '每天在 App 里最多被问几次' })}</Text>
      <View style={styles.chips}>
        {TWIN_ASK_DAILY_CAP_CHOICES.map((choice) => (
          <TwinAskChip key={choice} label={t(twinAskDailyCapWords(choice))} on={cap === choice} onPress={() => change({ dailyCap: choice })} testID={`twin-ask-cap-${choice}`} />
        ))}
      </View>
      <Text style={styles.muted}>{t({ en: 'After that, friends can only ask you by link.', zh: '超过以后，朋友只能发链接问你。' })}</Text>
      {notice ? (
        <Text style={notice.ok ? styles.saved : styles.problem} testID="twin-ask-profile-notice">
          {t(notice.words)}
        </Text>
      ) : null}
      <TouchableOpacity
        style={[styles.button, (!patch || save.isPending) && styles.dim]}
        disabled={!patch || save.isPending}
        onPress={() => {
          if (patch) save.mutate(patch);
        }}
        accessibilityRole="button"
        testID="twin-ask-profile-save"
      >
        {save.isPending ? <ActivityIndicator /> : <Text style={styles.buttonText}>{t({ en: 'Save', zh: '保存' })}</Text>}
      </TouchableOpacity>
    </View>
  );
}

function FactsSection() {
  const { t } = useI18n();
  const styles = useThemedStyles(makeStyles);
  const queryClient = useQueryClient();
  const facts = useQuery({ queryKey: FACTS_KEY, queryFn: () => mobileTwinAskClient().facts() });
  const [editing, setEditing] = useState<string | null>(null);
  const [topic, setTopic] = useState<TwinAskTwinTopicV0 | null>(null);
  const [text, setText] = useState('');
  const [notice, setNotice] = useState<Notice | null>(null);

  const reset = (): void => {
    setEditing(null);
    setText('');
  };
  const refresh = (): void => {
    void queryClient.invalidateQueries({ queryKey: FACTS_KEY });
  };
  const saveFact = useMutation({
    mutationFn: (input: TwinFriendFactInputV0) => (editing ? mobileTwinAskClient().replaceFact(editing, input) : mobileTwinAskClient().addFact(input)),
    onSuccess: () => {
      reset();
      setNotice({ words: SAVED, ok: true });
      refresh();
    },
    onError: (error) => setNotice({ words: twinAskFailureWords(error), ok: false }),
  });
  const removeFact = useMutation({
    mutationFn: (id: string) => mobileTwinAskClient().removeFact(id),
    onSuccess: (_result, id) => {
      if (id === editing) reset();
      setNotice(null);
      refresh();
    },
    onError: (error) => setNotice({ words: twinAskFailureWords(error), ok: false }),
  });

  const list = facts.data ?? [];
  const others = list.filter((fact) => fact.id !== editing);
  const full = topic !== null && !twinAskFactFits(others, topic);
  const busy = saveFact.isPending || removeFact.isPending;

  const submit = (): void => {
    const input = twinAskFactFromForm(topic, text);
    if (input.ok === false) {
      setNotice({ words: twinAskProblemWords(input.reasonCode, input.field), ok: false });
      return;
    }
    if (!twinAskFactFits(others, input.value.topic)) {
      setNotice({ words: FULL_WORDS, ok: false });
      return;
    }
    setNotice(null);
    saveFact.mutate(input.value);
  };
  const startEdit = (fact: TwinFriendFactV0): void => {
    setEditing(fact.id);
    setTopic(fact.topic);
    setText(fact.text);
    setNotice(null);
  };
  const askRemove = (fact: TwinFriendFactV0): void => {
    Alert.alert(t({ en: 'Delete this entry?', zh: '删除这一条？' }), fact.text, [
      { text: t({ en: 'Keep it', zh: '先不删' }), style: 'cancel' },
      { text: t({ en: 'Delete', zh: '删除' }), style: 'destructive', onPress: () => removeFact.mutate(fact.id) },
    ]);
  };

  return (
    <View style={styles.section}>
      <Text style={styles.heading}>
        {t({ en: `What your twin may tell friends (${list.length}/${L.factsMax})`, zh: `分身可以告诉朋友的话（${list.length}/${L.factsMax}）` })}
      </Text>
      <Text style={styles.muted}>
        {t({
          en: `Your twin only passes these on word for word, at most ${L.quotesMax} at a time. No amounts of money, contact details, links, addresses or children's names.`,
          zh: `分身只原样转述这些话，一次最多 ${L.quotesMax} 条。不要写钱数、联系方式、链接、地址或孩子的名字。`,
        })}
      </Text>
      {facts.isPending ? <ActivityIndicator /> : null}
      {facts.isError ? <Retry words={twinAskFailureWords(facts.error)} onRetry={() => void facts.refetch()} testID="twin-ask-facts-retry" /> : null}
      {twinAskFactsByTopic(list).map((group) => (
        <View key={group.topic} style={styles.group}>
          <Text style={styles.label}>{t(TWIN_ASK_TOPIC_LABELS_V0[group.topic])}</Text>
          {group.facts.map((fact) => (
            <View key={fact.id} style={[styles.factRow, fact.id === editing && styles.factEditing]} testID={`twin-ask-fact-${fact.id}`}>
              <View style={styles.grow}>
                <Text style={styles.body}>{fact.text}</Text>
                <FactSource source={fact.source} />
              </View>
              <TouchableOpacity style={styles.linkButton} disabled={busy} onPress={() => startEdit(fact)} accessibilityRole="button" testID={`twin-ask-fact-edit-${fact.id}`}>
                <Text style={styles.linkText}>{t({ en: 'Edit', zh: '改' })}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.linkButton} disabled={busy} onPress={() => askRemove(fact)} accessibilityRole="button" testID={`twin-ask-fact-delete-${fact.id}`}>
                <Text style={styles.dangerLink}>{t({ en: 'Delete', zh: '删' })}</Text>
              </TouchableOpacity>
            </View>
          ))}
        </View>
      ))}
      <Text style={styles.label}>{t(editing ? { en: 'Edit the entry', zh: '修改这一条' } : { en: 'Add an entry', zh: '新写一条' })}</Text>
      <View style={styles.chips}>
        {TWIN_ASK_TWIN_TOPICS_V0.map((value) => (
          <TwinAskChip key={value} label={t(TWIN_ASK_TOPIC_LABELS_V0[value])} on={topic === value} onPress={() => setTopic(value)} testID={`twin-ask-fact-topic-${value}`} />
        ))}
      </View>
      <TextInput
        style={styles.input}
        value={text}
        onChangeText={setText}
        maxLength={L.factMax}
        multiline
        placeholder={t({ en: 'e.g. The beef noodles are good; expect a queue at noon', zh: '比如：牛肉面不错，中午人多要排队' })}
        accessibilityLabel={t({ en: 'Entry', zh: '条目' })}
        testID="twin-ask-fact-input"
      />
      {full ? <Text style={styles.problem}>{t(FULL_WORDS)}</Text> : null}
      {notice ? (
        <Text style={notice.ok ? styles.saved : styles.problem} testID="twin-ask-facts-notice">
          {t(notice.words)}
        </Text>
      ) : null}
      <View style={styles.actions}>
        <TouchableOpacity style={[styles.button, styles.grow, busy && styles.dim]} disabled={busy} onPress={submit} accessibilityRole="button" testID="twin-ask-fact-save">
          {saveFact.isPending ? <ActivityIndicator /> : <Text style={styles.buttonText}>{t(editing ? { en: 'Save changes', zh: '保存修改' } : { en: 'Add', zh: '添加' })}</Text>}
        </TouchableOpacity>
        {editing ? (
          <TouchableOpacity
            style={styles.secondary}
            onPress={() => {
              reset();
              setNotice(null);
            }}
            accessibilityRole="button"
            testID="twin-ask-fact-cancel"
          >
            <Text style={styles.secondaryText}>{t({ en: 'Cancel', zh: '取消' })}</Text>
          </TouchableOpacity>
        ) : null}
      </View>
    </View>
  );
}

/** Where the entry was written, when it was not this page: one of the owner's answers, or memory review. */
function FactSource({ source }: { source: TwinFriendFactV0['source'] }) {
  const { t } = useI18n();
  const styles = useThemedStyles(makeStyles);
  const words = twinAskFactSourceWords(source);
  return words ? <Text style={styles.muted}>{t(words)}</Text> : null;
}

function SharingSection() {
  const { t } = useI18n();
  const styles = useThemedStyles(makeStyles);
  const queryClient = useQueryClient();
  const sharing = useQuery({ queryKey: SHARING_KEY, queryFn: () => mobileTwinAskClient().sharing() });
  const [picked, setPicked] = useState<Partial<Record<Tier, TwinAskTwinTopicV0[]>>>({});
  const [notice, setNotice] = useState<(Notice & { tier: Tier }) | null>(null);
  const [busyTier, setBusyTier] = useState<Tier | null>(null);
  const [stepUpVisible, setStepUpVisible] = useState(false);
  const stepUpAnswer = useRef<((confirmed: boolean) => void) | null>(null);

  const confirmStepUp = (): Promise<boolean> =>
    new Promise<boolean>((resolve) => {
      stepUpAnswer.current = resolve;
      setStepUpVisible(true);
    });
  const closeStepUp = (confirmed: boolean): void => {
    setStepUpVisible(false);
    stepUpAnswer.current?.(confirmed);
    stepUpAnswer.current = null;
  };

  const toggle = (tier: TwinAskSharingTierV0, topic: TwinAskTwinTopicV0): void => {
    const current = picked[tier.tier] ?? tier.topics;
    const next = current.includes(topic) ? current.filter((value) => value !== topic) : [...current, topic];
    const nextPicked = { ...picked };
    nextPicked[tier.tier] = TWIN_ASK_TWIN_TOPICS_V0.filter((value) => next.includes(value));
    setPicked(nextPicked);
    setNotice(null);
  };
  const commit = async (tier: Tier, topics: TwinAskTwinTopicV0[]): Promise<void> => {
    setBusyTier(tier);
    try {
      const client = mobileTwinAskClient();
      const preview = await client.previewSharing({ tier, topics });
      const result = await saveTwinAskSharing(client, preview, confirmStepUp);
      if (result.kind === 'saved') {
        queryClient.setQueryData(SHARING_KEY, result.sharing);
        setPicked((prev) => {
          const next = { ...prev };
          delete next[tier];
          return next;
        });
      } else if (result.failure === 'changed') {
        void sharing.refetch();
      }
      setNotice({ tier, words: twinAskSharingSaveWords(result), ok: result.kind === 'saved' });
    } catch (error) {
      setNotice({ tier, words: twinAskFailureWords(error), ok: false });
    } finally {
      setBusyTier(null);
    }
  };
  const save = (tier: TwinAskSharingTierV0, topics: TwinAskTwinTopicV0[]): void => {
    const change = twinAskSharingChange(tier, topics);
    if (!change) return;
    if (change.added.length === 0) {
      void commit(tier.tier, topics);
      return;
    }
    Alert.alert(t({ en: 'Open more topics to this tier?', zh: '给这一档多开放话题？' }), t(twinAskWidenWords(RELATIONSHIP_TIER_COPY_V1[tier.tier], change.added)), [
      { text: t({ en: 'Not now', zh: '先不' }), style: 'cancel' },
      { text: t({ en: 'Continue', zh: '继续' }), onPress: () => void commit(tier.tier, topics) },
    ]);
  };

  return (
    <View style={styles.section}>
      <Text style={styles.heading}>{t({ en: 'Which topics each tier may ask about', zh: '每一档朋友能问哪些话题' })}</Text>
      <Text style={styles.muted}>
        {t({
          en: 'Tiers are the ones you gave friends in your relationship book. Opening more topics asks you to confirm it is you; closing them saves at once.',
          zh: '档位就是你在关系簿里给朋友定的档。给某一档多开放话题要先确认是你本人；收回话题马上生效。',
        })}
      </Text>
      {sharing.isPending ? <ActivityIndicator /> : null}
      {sharing.isError ? <Retry words={twinAskFailureWords(sharing.error)} onRetry={() => void sharing.refetch()} testID="twin-ask-sharing-retry" /> : null}
      {(sharing.data?.tiers ?? []).map((tier) => {
        const topics = picked[tier.tier] ?? tier.topics;
        const changed = twinAskSharingChange(tier, topics) !== null;
        const busy = busyTier !== null;
        return (
          <View key={tier.tier} style={styles.card} testID={`twin-ask-tier-${tier.tier}`}>
            <Text style={styles.cardTitle}>{t(RELATIONSHIP_TIER_COPY_V1[tier.tier])}</Text>
            {tier.available ? (
              <>
                <View style={styles.chips}>
                  {TWIN_ASK_TWIN_TOPICS_V0.map((topic) => (
                    <TwinAskChip
                      key={topic}
                      label={t(TWIN_ASK_TOPIC_LABELS_V0[topic])}
                      on={topics.includes(topic)}
                      onPress={() => toggle(tier, topic)}
                      disabled={busy}
                      testID={`twin-ask-tier-${tier.tier}-${topic}`}
                    />
                  ))}
                </View>
                {notice && notice.tier === tier.tier ? (
                  <Text style={notice.ok ? styles.saved : styles.problem} testID={`twin-ask-tier-notice-${tier.tier}`}>
                    {t(notice.words)}
                  </Text>
                ) : null}
                {changed ? (
                  <TouchableOpacity style={[styles.button, busy && styles.dim]} disabled={busy} onPress={() => save(tier, topics)} accessibilityRole="button" testID={`twin-ask-tier-save-${tier.tier}`}>
                    {busyTier === tier.tier ? <ActivityIndicator /> : <Text style={styles.buttonText}>{t({ en: 'Save this tier', zh: '保存这一档' })}</Text>}
                  </TouchableOpacity>
                ) : null}
              </>
            ) : (
              <Text style={styles.muted}>{t({ en: "This tier can't open topics, so your twin doesn't answer friends in it.", zh: '这一档不能开放话题，分身不替这一档的朋友答。' })}</Text>
            )}
          </View>
        );
      })}
      <StepUpSheet visible={stepUpVisible} onConfirmed={() => closeStepUp(true)} onCancel={() => closeStepUp(false)} reason={TWIN_ASK_SHARING_STEP_UP_REASON} />
    </View>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: c.bgPrimary },
    content: { padding: 16, gap: 12, paddingBottom: 40 },
    title: { color: c.textPrimary, fontSize: 20, fontWeight: '800' },
    heading: { color: c.textPrimary, fontSize: 17, fontWeight: '700', marginTop: 12 },
    muted: { color: c.textMuted, fontSize: 13, lineHeight: 19 },
    body: { color: c.textPrimary, fontSize: 15, lineHeight: 21 },
    label: { color: c.textSecondary, fontSize: 13, fontWeight: '600' },
    section: { gap: 8 },
    group: { gap: 6 },
    card: { padding: 14, borderRadius: 12, backgroundColor: c.bgCard, borderWidth: 1, borderColor: c.border, gap: 8 },
    cardTitle: { color: c.textPrimary, fontSize: 16, fontWeight: '700' },
    switchRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    factRow: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, borderRadius: 12, backgroundColor: c.bgCard, borderWidth: 1, borderColor: c.border },
    factEditing: { borderColor: c.accent },
    input: {
      minHeight: 88,
      padding: 12,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: c.bgCard,
      color: c.textPrimary,
      fontSize: 15,
      textAlignVertical: 'top',
    },
    grow: { flex: 1 },
    actions: { flexDirection: 'row', gap: 8 },
    button: { minHeight: 44, paddingHorizontal: 16, borderRadius: 12, backgroundColor: c.accent, alignItems: 'center', justifyContent: 'center' },
    buttonText: { color: c.onAccent, fontSize: 15, fontWeight: '700' },
    secondary: { minHeight: 44, paddingHorizontal: 16, borderRadius: 12, borderWidth: 1, borderColor: c.border, alignItems: 'center', justifyContent: 'center' },
    secondaryText: { color: c.textPrimary, fontSize: 14, fontWeight: '600' },
    linkButton: { minHeight: 36, paddingHorizontal: 8, alignItems: 'center', justifyContent: 'center' },
    linkText: { color: c.accent, fontSize: 14, fontWeight: '600' },
    dangerLink: { color: c.error, fontSize: 14, fontWeight: '600' },
    saved: { color: c.accent, fontSize: 14, fontWeight: '600' },
    problem: { color: c.error, fontSize: 14, lineHeight: 20, fontWeight: '600' },
    dim: { opacity: 0.45 },
  });
