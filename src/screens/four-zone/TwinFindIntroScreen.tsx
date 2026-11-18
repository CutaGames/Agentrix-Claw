/**
 * TwinFindIntroScreen — 分身 → 帮我找人 → 有人想介绍我 (twinFind.ts, twinFindView.ts). Only in builds with
 * `EXPO_PUBLIC_TWIN_FIND=1`. The page of the person a friend would like to introduce: who is asking, what about, and what
 * the friend wrote. They agree with a name and an optional line written for the asker, or say no; until the asker has
 * agreed too they can take it back. Saying no or taking it back ends their part: the asker is never told who it was.
 */
import React, { useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useI18n } from '../../stores/i18nStore';
import { useThemedStyles, type Palette } from '../../theme/useTheme';
import { TWIN_ASK_TOPIC_LABELS_V0 } from '../../../shared/types/twin-ask';
import { TWIN_FIND_LIMITS_V0, type TwinFindConsentV0, type TwinFindIntroViewV0 } from '../../../shared/types/twin-find';
import { TwinFindError } from '../../services/twinFind';
import { mobileTwinFindClient } from '../../services/twinFindSession';
import { twinAskWhenWords } from '../../services/twinAskView';
import {
  TWIN_FIND_CONSENT_WORDS,
  twinFindConsentFromForm,
  twinFindFailureWords,
  twinFindIntroStateWords,
  twinFindProblemWords,
  twinFindTimeLeftWords,
  type TwinFindWords,
} from '../../services/twinFindView';

type IntroRoute = RouteProp<{ TwinFindIntro: { bridgeId: string } }, 'TwinFindIntro'>;

const L = TWIN_FIND_LIMITS_V0;

export function TwinFindIntroScreen() {
  const { t } = useI18n();
  const styles = useThemedStyles(makeStyles);
  const navigation = useNavigation<{ goBack: () => void }>();
  const { bridgeId } = useRoute<IntroRoute>().params;
  const queryClient = useQueryClient();
  const key = ['twin-find', 'intro', bridgeId];
  // Set once they said no or took it back: the introduction is no longer theirs to read, so it is not asked for again.
  const [left, setLeft] = useState<'declined' | 'revoked' | null>(null);
  const intro = useQuery({ queryKey: key, queryFn: () => mobileTwinFindClient().intro(bridgeId), enabled: left === null });
  const [displayName, setDisplayName] = useState('');
  const [line, setLine] = useState('');
  const [problem, setProblem] = useState<TwinFindWords | null>(null);

  const onFail = (error: unknown): void => {
    setProblem(twinFindFailureWords(error));
    if (error instanceof TwinFindError && (error.failure === 'changed' || error.failure === 'closed')) void intro.refetch();
  };
  const onDone = (view: TwinFindIntroViewV0 | null, how: 'declined' | 'revoked'): void => {
    setProblem(null);
    void queryClient.invalidateQueries({ queryKey: ['twin-find', 'list'] });
    if (view === null) {
      queryClient.removeQueries({ queryKey: key });
      setLeft(how);
    } else {
      queryClient.setQueryData(key, view);
    }
  };
  const consent = useMutation({
    mutationFn: (value: TwinFindConsentV0) => mobileTwinFindClient().consent(bridgeId, value),
    onSuccess: (view) => onDone(view, 'declined'),
    onError: onFail,
  });
  const revoke = useMutation({ mutationFn: () => mobileTwinFindClient().revoke(bridgeId), onSuccess: () => onDone(null, 'revoked'), onError: onFail });
  const busy = consent.isPending || revoke.isPending;

  if (left !== null) {
    return (
      <ScrollView style={styles.screen} contentContainerStyle={styles.content} testID="twin-find-intro-left">
        <Text style={styles.title} accessibilityRole="header">
          {t(left === 'declined' ? { en: 'You said no', zh: '你说了这次不了' } : { en: 'You took it back', zh: '你撤回了同意' })}
        </Text>
        <Text style={styles.muted}>
          {t({
            en: 'Your friend is told this introduction did not go ahead. The asker is not told who it was.',
            zh: '朋友会知道这次介绍没有继续。提问的人不会知道是你。',
          })}
        </Text>
        <TouchableOpacity style={styles.button} onPress={() => navigation.goBack()} accessibilityRole="button" testID="twin-find-intro-done">
          <Text style={styles.buttonText}>{t({ en: 'Done', zh: '好了' })}</Text>
        </TouchableOpacity>
      </ScrollView>
    );
  }
  if (intro.isPending) {
    return (
      <View style={[styles.screen, styles.center]} testID="twin-find-intro-loading">
        <ActivityIndicator />
      </View>
    );
  }
  if (intro.isError) {
    return (
      <ScrollView style={styles.screen} contentContainerStyle={styles.content} testID="twin-find-intro-error">
        <Text style={styles.problem}>{t(twinFindFailureWords(intro.error))}</Text>
        <TouchableOpacity style={styles.secondary} onPress={() => void intro.refetch()} accessibilityRole="button" testID="twin-find-intro-retry">
          <Text style={styles.secondaryText}>{t({ en: 'Try again', zh: '重试' })}</Text>
        </TouchableOpacity>
      </ScrollView>
    );
  }

  const view = intro.data;
  const now = new Date();
  const topic = t(TWIN_ASK_TOPIC_LABELS_V0[view.topic]);
  const open = view.status === 'open';
  const timeLeft = open ? twinFindTimeLeftWords(view.endsAt, now) : null;

  const agree = (): void => {
    const decoded = twinFindConsentFromForm(displayName, line);
    if (decoded.ok === false) {
      setProblem(twinFindProblemWords(decoded.reasonCode, decoded.field));
      return;
    }
    setProblem(null);
    consent.mutate(decoded.value);
  };
  const confirmDecline = (): void => {
    Alert.alert(
      t({ en: 'Say no to this introduction?', zh: '这次不被介绍？' }),
      t({ en: `${view.bridgeName} is told it did not go ahead. ${view.askerName} is not told it was you.`, zh: `${view.bridgeName}会知道这次没有继续。${view.askerName}不会知道是你。` }),
      [
        { text: t({ en: 'Go back', zh: '返回' }), style: 'cancel' },
        { text: t({ en: 'Say no', zh: '这次不了' }), style: 'destructive', onPress: () => consent.mutate({ decision: 'decline' }) },
      ],
    );
  };
  const confirmRevoke = (): void => {
    Alert.alert(
      t({ en: 'Take your agreement back?', zh: '撤回同意？' }),
      t({ en: `${view.askerName} will no longer see your name and line.`, zh: `${view.askerName}就看不到你的称呼和那句话了。` }),
      [
        { text: t({ en: 'Keep it', zh: '先不撤' }), style: 'cancel' },
        { text: t({ en: 'Take it back', zh: '撤回' }), style: 'destructive', onPress: () => revoke.mutate() },
      ],
    );
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content} testID="twin-find-intro-screen" keyboardShouldPersistTaps="handled">
      <Text style={styles.title} accessibilityRole="header">
        {t({ en: `${view.bridgeName} would like to introduce you to ${view.askerName}`, zh: `${view.bridgeName}想把你介绍给${view.askerName}` })}
      </Text>
      <View style={styles.card}>
        <Text style={styles.label}>{t({ en: `${view.askerName} is asking · ${topic}`, zh: `${view.askerName}在找人 · ${topic}` })}</Text>
        <Text style={styles.question}>{view.question}</Text>
        {view.note ? <Text style={styles.muted}>{t({ en: `${view.bridgeName}: ${view.note}`, zh: `${view.bridgeName}说：${view.note}` })}</Text> : null}
        <Text style={styles.muted} testID="twin-find-intro-when">
          {t(open ? (timeLeft ?? { en: 'Ending now', zh: '马上结束' }) : { en: 'Ended', zh: '已结束' })}
        </Text>
      </View>
      <Text style={view.canConsent || view.myState === 'connected' ? styles.alert : styles.muted} testID="twin-find-intro-state">
        {t(twinFindIntroStateWords(view.myState, view.status))}
      </Text>
      {view.myDisplayName ? (
        <View style={styles.card} testID="twin-find-intro-mine">
          <Text style={styles.label}>{t({ en: `What ${view.askerName} sees about you`, zh: `${view.askerName}看到的你` })}</Text>
          <Text style={styles.personLabel}>{view.myDisplayName}</Text>
          {view.myLine ? <Text style={styles.body}>{view.myLine}</Text> : null}
          {view.connectedAt ? <Text style={styles.muted}>{t(twinAskWhenWords(new Date(view.connectedAt), now))}</Text> : null}
        </View>
      ) : null}

      {view.canConsent ? (
        <View style={styles.card} testID="twin-find-consent-form">
          <Text style={styles.muted}>{t(TWIN_FIND_CONSENT_WORDS)}</Text>
          <Text style={styles.label}>{t({ en: 'The name they should see', zh: '给对方看的称呼' })}</Text>
          <TextInput
            style={styles.input}
            value={displayName}
            onChangeText={setDisplayName}
            maxLength={L.displayNameMax}
            placeholder={t({ en: 'e.g. Master Li', zh: '比如：李师傅' })}
            returnKeyType="done"
            testID="twin-find-display-name"
          />
          <Text style={styles.label}>{t({ en: 'A line about you (optional)', zh: '介绍自己的一句话（可以不写）' })}</Text>
          <TextInput
            style={[styles.input, styles.line]}
            value={line}
            onChangeText={setLine}
            maxLength={L.lineMax}
            multiline
            placeholder={t({ en: 'e.g. Ten years of renovating old flats', zh: '比如：做了十年旧房翻新' })}
            testID="twin-find-line"
          />
          <Text style={styles.muted}>{t({ en: 'No contact details, links or addresses.', zh: '不要写联系方式、链接或地址。' })}</Text>
          <TouchableOpacity style={[styles.button, busy && styles.dim]} onPress={agree} disabled={busy} accessibilityRole="button" testID="twin-find-agree">
            {consent.isPending ? <ActivityIndicator /> : <Text style={styles.buttonText}>{t({ en: 'Agree to be introduced', zh: '同意被介绍' })}</Text>}
          </TouchableOpacity>
          <TouchableOpacity style={[styles.secondary, busy && styles.dim]} onPress={confirmDecline} disabled={busy} accessibilityRole="button" testID="twin-find-intro-decline">
            <Text style={styles.secondaryText}>{t({ en: 'No, thanks', zh: '这次不了' })}</Text>
          </TouchableOpacity>
        </View>
      ) : null}
      {view.canRevoke ? (
        <TouchableOpacity style={[styles.secondary, busy && styles.dim]} onPress={confirmRevoke} disabled={busy} accessibilityRole="button" testID="twin-find-revoke">
          <Text style={styles.secondaryText}>{t({ en: 'Take my agreement back', zh: '撤回同意' })}</Text>
        </TouchableOpacity>
      ) : null}
      {problem ? (
        <Text style={styles.problem} testID="twin-find-intro-problem">
          {t(problem)}
        </Text>
      ) : null}
    </ScrollView>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: c.bgPrimary },
    center: { alignItems: 'center', justifyContent: 'center' },
    content: { padding: 16, gap: 10, paddingBottom: 32 },
    title: { color: c.textPrimary, fontSize: 18, fontWeight: '800' },
    card: { padding: 14, borderRadius: 12, backgroundColor: c.bgCard, borderWidth: 1, borderColor: c.border, gap: 6 },
    question: { color: c.textPrimary, fontSize: 16, lineHeight: 23 },
    muted: { color: c.textMuted, fontSize: 13, lineHeight: 19 },
    body: { color: c.textPrimary, fontSize: 14, lineHeight: 20 },
    label: { color: c.textSecondary, fontSize: 13, fontWeight: '600' },
    alert: { color: c.accent, fontSize: 14, lineHeight: 20, fontWeight: '700' },
    problem: { color: c.error, fontSize: 14, lineHeight: 20, fontWeight: '600' },
    personLabel: { color: c.textPrimary, fontSize: 15, fontWeight: '700' },
    dim: { opacity: 0.45 },
    input: { minHeight: 44, borderRadius: 12, borderWidth: 1, borderColor: c.border, paddingHorizontal: 12, color: c.textPrimary, backgroundColor: c.bgPrimary },
    line: { minHeight: 66, paddingTop: 10, textAlignVertical: 'top' },
    button: { minHeight: 44, paddingHorizontal: 16, borderRadius: 12, backgroundColor: c.accent, alignItems: 'center', justifyContent: 'center' },
    buttonText: { color: c.onAccent, fontSize: 15, fontWeight: '700' },
    secondary: { minHeight: 44, paddingHorizontal: 16, borderRadius: 12, borderWidth: 1, borderColor: c.border, alignItems: 'center', justifyContent: 'center' },
    secondaryText: { color: c.textPrimary, fontSize: 14, fontWeight: '600' },
  });
