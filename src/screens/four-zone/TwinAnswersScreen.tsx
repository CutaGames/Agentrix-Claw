/**
 * TwinAnswersScreen — M0 "问答与服务" (EXPO_PUBLIC_MOBILE_M0=1, twinAnswers.ts): the five answers visitors meet, edited on
 * the phone, and "update the card" with a preview of the services before anything is accepted. Answers can be spoken
 * (hold to speak, M1 "语音访谈"); the transcript lands in the text box and is saved only when the owner taps Save. Native
 * only; it does not open the web. Facts in these answers reach the twin's memory through the import, and the screen says so.
 */
import React, { useMemo, useState } from 'react';
import { ActivityIndicator, Alert, RefreshControl, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useI18n } from '../../stores/i18nStore';
import { useAuthStore } from '../../stores/authStore';
import { useThemedStyles, type Palette } from '../../theme/useTheme';
import { VoiceAnswerButton } from '../../components/VoiceAnswerButton';
import {
  acceptTwinCardServices,
  fetchTwinAnswers,
  newTwinAnswerKey,
  previewTwinCardServices,
  saveTwinAnswer,
  twinAnswerQuestions,
  type TwinAnswerCommandOutcome,
  type TwinAnswerQuestionId,
  type TwinCardServicesPreview,
} from '../../services/twinAnswers';

export const twinAnswersQueryKey = (agentAccountId: string) => ['four-zone', 'twin-answers', agentAccountId] as const;

type Copy = { en: string; zh: string };

function outcomeCopy(outcome: TwinAnswerCommandOutcome<unknown>): Copy | null {
  switch (outcome.kind) {
    case 'done':
      return null;
    case 'invalid':
      return outcome.reason === 'empty'
        ? { en: 'Write something first.', zh: '先写点内容。' }
        : outcome.reason === 'too_long'
          ? { en: 'Too long: keep it under 4,000 characters.', zh: '太长了，请控制在 4000 字以内。' }
          : { en: 'This looks like a password or key. Remove it; the twin must never repeat it.', zh: '这里像是密码或密钥，请删掉——分身绝不能复述它。' };
    case 'rejected':
      return outcome.reasonCode === 'plan_stale'
        ? { en: 'An answer changed after the preview. Preview again.', zh: '预览之后答案又改了，请重新预览。' }
        : { en: `The twin did not take it (${outcome.reasonCode}).`, zh: `分身没有接受（${outcome.reasonCode}）。` };
    case 'blocked':
      return outcome.reason === 'authentication_required' ? { en: 'Sign in again.', zh: '请重新登录。' } : { en: 'Pick your Agent first.', zh: '先选好你的 Agent。' };
    case 'failed':
      return outcome.retryable ? { en: 'Network problem. Try again.', zh: '网络不稳，请再试一次。' } : { en: `Could not save (${outcome.reason}).`, zh: `没能保存（${outcome.reason}）。` };
  }
}

export function TwinAnswersScreen() {
  const { t, language } = useI18n();
  const lang = language === 'zh' ? 'zh' : 'en';
  const styles = useThemedStyles(makeStyles);
  const queryClient = useQueryClient();
  const activeInstance = useAuthStore((state) => state.activeInstance);
  const agentAccountId: string = activeInstance?.agentAccountId ?? activeInstance?.metadata?.agentAccountId ?? '';
  const key = twinAnswersQueryKey(agentAccountId);
  const questions = useMemo(() => twinAnswerQuestions(lang), [lang]);
  const [editing, setEditing] = useState<TwinAnswerQuestionId | null>(null);
  const [draft, setDraft] = useState('');
  const [spoken, setSpoken] = useState(false);
  const [preview, setPreview] = useState<TwinCardServicesPreview | null>(null);

  const answers = useQuery({ queryKey: key, queryFn: () => fetchTwinAnswers(agentAccountId), enabled: !!agentAccountId, retry: 0, staleTime: 15_000 });
  const refresh = () => void queryClient.invalidateQueries({ queryKey: key });
  const tell = (copy: Copy | null) => copy && Alert.alert(t({ en: 'Not done', zh: '没有完成' }), t(copy));

  const save = useMutation({
    mutationFn: ({ id, text, voice }: { id: TwinAnswerQuestionId; text: string; voice: boolean }) =>
      saveTwinAnswer(agentAccountId, id, text, lang, { idempotencyKey: newTwinAnswerKey('answer'), modality: voice ? 'voice_transcript' : 'text' }),
    onSuccess: (outcome) => {
      if (outcome.kind !== 'done') return tell(outcomeCopy(outcome));
      setEditing(null);
      setPreview(null);
      refresh();
    },
  });
  const previewCard = useMutation({
    mutationFn: () => previewTwinCardServices(agentAccountId),
    onSuccess: (outcome) => (outcome.kind === 'done' ? setPreview(outcome.value) : tell(outcomeCopy(outcome))),
  });
  const accept = useMutation({
    mutationFn: (plan: TwinCardServicesPreview) => acceptTwinCardServices(agentAccountId, plan, { idempotencyKey: newTwinAnswerKey('services') }),
    onSuccess: (outcome) => {
      if (outcome.kind !== 'done') return tell(outcomeCopy(outcome));
      setPreview(null);
      refresh();
      void queryClient.invalidateQueries({ queryKey: ['four-zone', 'twin-public-card', agentAccountId] });
    },
  });

  const data = answers.data?.kind === 'ready' ? answers.data.data : null;
  const readProblem = answers.data && answers.data.kind !== 'ready';

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      refreshControl={<RefreshControl refreshing={answers.isRefetching} onRefresh={() => void answers.refetch()} />}
      testID="twin-answers-screen"
    >
      <Text style={styles.title} accessibilityRole="header">
        {t({ en: 'Answers and services', zh: '问答与服务' })}
      </Text>
      <Text style={styles.muted}>
        {t({
          en: 'What visitors meet: change an answer here and it is saved as a new version (the earlier ones stay). Services go on your card only after you see the preview and confirm.',
          zh: '访客会碰到的内容。在这里改答案会存成新版本（旧版本保留）；服务要你看过预览、点确认后才会上名片。',
        })}
      </Text>
      {answers.isLoading && !!agentAccountId ? <ActivityIndicator /> : null}
      {readProblem ? (
        <Text style={styles.problem} testID="twin-answers-error">
          {t({ en: 'Could not read your answers. Pull to try again.', zh: '读不到你的答案，下拉再试一次。' })}
        </Text>
      ) : null}

      {data ? (
        <>
          <View style={styles.card} testID="twin-answers-card-services">
            <Text style={styles.cardTitle}>{t({ en: 'Services on your card now', zh: '名片上现在的服务' })}</Text>
            {data.cardServices.length === 0 ? <Text style={styles.muted}>{t({ en: 'None yet.', zh: '还没有。' })}</Text> : null}
            {data.cardServices.map((item, index) => (
              <Text key={`${index}-${item}`} style={styles.body}>
                · {item}
              </Text>
            ))}
            <TouchableOpacity
              style={styles.button}
              onPress={() => previewCard.mutate()}
              disabled={previewCard.isPending}
              accessibilityRole="button"
              testID="twin-answers-preview"
            >
              <Text style={styles.buttonText}>{t({ en: 'Update the card from my answers', zh: '按我的答案更新名片' })}</Text>
            </TouchableOpacity>
          </View>

          {preview ? (
            <View style={styles.card} testID="twin-answers-preview-card">
              <Text style={styles.cardTitle}>{t({ en: 'Your card will list', zh: '名片会列出这些服务' })}</Text>
              {preview.services.length === 0 ? <Text style={styles.muted}>{t({ en: 'Nothing: the card would show no services.', zh: '没有——名片上会不显示服务。' })}</Text> : null}
              {preview.services.map((item, index) => (
                <Text key={`${index}-${item}`} style={styles.body}>
                  · {item}
                </Text>
              ))}
              <View style={styles.actions}>
                <TouchableOpacity style={styles.primary} onPress={() => accept.mutate(preview)} disabled={accept.isPending} accessibilityRole="button" testID="twin-answers-accept">
                  <Text style={styles.primaryText}>{t({ en: 'Confirm', zh: '确认更新' })}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.button} onPress={() => setPreview(null)} accessibilityRole="button">
                  <Text style={styles.buttonText}>{t({ en: 'Not now', zh: '先不' })}</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : null}

          {questions.map((question) => {
            const current = data.answers[question.id];
            const open = editing === question.id;
            return (
              <View key={question.id} style={styles.card} testID={`twin-answer-${question.id}`}>
                <Text style={styles.cardTitle}>{question.prompt}</Text>
                {open ? (
                  <>
                    <TextInput
                      style={styles.input}
                      value={draft}
                      onChangeText={setDraft}
                      multiline
                      textAlignVertical="top"
                      maxLength={4000}
                      placeholder={question.splitLines ? t({ en: 'One item per line', zh: '每行一条' }) : ''}
                      accessibilityLabel={question.prompt}
                      testID={`twin-answer-input-${question.id}`}
                    />
                    <VoiceAnswerButton
                      testID={`twin-answer-voice-${question.id}`}
                      onText={(text) => {
                        setDraft((current) => (current.trim() ? `${current.replace(/\s+$/, '')}\n${text}` : text));
                        setSpoken(true);
                      }}
                    />
                    <View style={styles.actions}>
                      <TouchableOpacity
                        style={styles.primary}
                        onPress={() => save.mutate({ id: question.id, text: draft, voice: spoken })}
                        disabled={save.isPending}
                        accessibilityRole="button"
                        testID={`twin-answer-save-${question.id}`}
                      >
                        <Text style={styles.primaryText}>{t({ en: 'Save', zh: '保存' })}</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={styles.button} onPress={() => setEditing(null)} accessibilityRole="button">
                        <Text style={styles.buttonText}>{t({ en: 'Cancel', zh: '取消' })}</Text>
                      </TouchableOpacity>
                    </View>
                  </>
                ) : (
                  <>
                    <Text style={current ? styles.body : styles.muted}>{current ? current.text : t({ en: 'Not answered yet.', zh: '还没回答。' })}</Text>
                    <TouchableOpacity
                      style={styles.button}
                      onPress={() => {
                        setEditing(question.id);
                        setDraft(current?.text ?? '');
                        setSpoken(false);
                      }}
                      accessibilityRole="button"
                      testID={`twin-answer-edit-${question.id}`}
                    >
                      <Text style={styles.buttonText}>{current ? t({ en: 'Edit', zh: '修改' }) : t({ en: 'Answer', zh: '回答' })}</Text>
                    </TouchableOpacity>
                  </>
                )}
                {question.needsImport ? (
                  <Text style={styles.muted}>
                    {question.feedsCard
                      ? t({ en: 'Feeds the services on your card. The facts in it reach the twin’s memory the next time you write your answers into it.', zh: '会用来更新名片上的服务；里面的事实要下次把答案写进分身记忆后，分身回答时才会用上。' })
                      : t({ en: 'The twin uses these once your answers are written into its memory; saving here keeps the new version ready for that.', zh: '这些要把答案写进分身记忆后分身才会用上；在这里保存会把新版本准备好。' })}
                  </Text>
                ) : null}
              </View>
            );
          })}
        </>
      ) : null}
    </ScrollView>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: c.bgPrimary },
    content: { padding: 20, gap: 10 },
    title: { color: c.textPrimary, fontSize: 24, fontWeight: '800' },
    muted: { color: c.textMuted, fontSize: 13, lineHeight: 19 },
    problem: { color: c.danger, fontSize: 13 },
    card: { backgroundColor: c.bgCard, borderColor: c.border, borderWidth: 1, borderRadius: 14, padding: 14, gap: 8 },
    cardTitle: { color: c.textPrimary, fontSize: 15, fontWeight: '700', lineHeight: 21 },
    body: { color: c.textPrimary, fontSize: 14, lineHeight: 20 },
    input: { minHeight: 120, borderColor: c.border, borderWidth: 1, borderRadius: 12, padding: 12, color: c.textPrimary, fontSize: 14, lineHeight: 20, backgroundColor: c.bgPrimary },
    actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    primary: { minHeight: 44, paddingHorizontal: 18, borderRadius: 12, backgroundColor: c.accent, alignItems: 'center', justifyContent: 'center' },
    primaryText: { color: c.onAccent, fontSize: 14, fontWeight: '800' },
    button: { minHeight: 44, paddingHorizontal: 16, borderRadius: 12, borderWidth: 1, borderColor: c.border, alignItems: 'center', justifyContent: 'center', alignSelf: 'flex-start' },
    buttonText: { color: c.textPrimary, fontSize: 14, fontWeight: '700' },
  });
