/**
 * TwinVoiceScreen — 分身 → 分身的声音 (L5 backend 10, mobile; twinVoice.ts). Only in builds with
 * `EXPO_PUBLIC_TWIN_VOICE_ELEVENLABS_ENABLED=1`.
 *
 * The voice: add a voice from the owner's own ElevenLabs account by its ID, confirm it, stop using it, delete it
 * (deleting asks first and says the voice stays in their own account). Below, the owner asks their own twin once; a
 * decided answer can be rendered in their voice at most once (each rendering spends their ElevenLabs credits) and
 * played here next to the AI label. The audio file is deleted when the answer goes away. Consent and keys stay on Web.
 */
import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, RefreshControl, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Audio } from 'expo-av';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useI18n } from '../../stores/i18nStore';
import { useAuthStore } from '../../stores/authStore';
import { useThemedStyles, type Palette } from '../../theme/useTheme';
import { DIGITAL_TWIN_AI_MEDIA_LABEL_V1 } from '../../../shared/types/digital-twin-body';
import type { TwinAnswerOutputV1 } from '../../../shared/types/digital-twin-answer';
import {
  TWIN_VOICE_STATE_COPY,
  TwinVoiceError,
  normalizeVoiceId,
  twinAnswerVoiceCopy,
  twinAnswerVoiceable,
  twinAskFailureCopy,
  twinAskIdempotencyKey,
  twinPlaybackReason,
  twinVoiceFailureCopy,
  type MobileTwinVoiceAsset,
  type TwinVoiceAction,
} from '../../services/twinVoice';
import { deleteTwinVoiceFile, mobileTwinVoiceClient } from '../../services/twinVoiceSession';

type Styles = ReturnType<typeof makeStyles>;
type T = (copy: { en: string; zh: string }) => string;

export const twinVoiceQueryKey = (agentAccountId: string) => ['four-zone', 'twin-voice', agentAccountId] as const;
const ANSWERS_KEPT = 5;

function AnswerVoice({ agentId, answer, styles, t }: { agentId: string; answer: TwinAnswerOutputV1; styles: Styles; t: T }) {
  const [busy, setBusy] = useState(false);
  const [played, setPlayed] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const mediaRef = useRef<string | null>(null);
  const fileRef = useRef<string | null>(null);
  const soundRef = useRef<Audio.Sound | null>(null);

  useEffect(
    () => () => {
      void soundRef.current?.unloadAsync().catch(() => undefined);
      if (fileRef.current) void deleteTwinVoiceFile(fileRef.current);
    },
    [],
  );

  const play = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const client = mobileTwinVoiceClient();
      if (!mediaRef.current) {
        let rendering;
        try {
          rendering = await client.render(agentId, answer);
        } catch (error) {
          setMessage(t(twinVoiceFailureCopy(error)));
          return;
        }
        if (rendering.kind === 'no_voice') return setMessage(t(twinAnswerVoiceCopy(rendering.reasonCode)));
        if (rendering.kind === 'no_playback') return setMessage(t({ en: 'This voice source cannot be played back.', zh: '这个声音来源不支持回放。' }));
        mediaRef.current = rendering.mediaRef;
      }
      if (!fileRef.current) {
        try {
          fileRef.current = await client.fetchAudio(agentId, mediaRef.current);
        } catch (error) {
          setMessage(t(twinAnswerVoiceCopy(twinPlaybackReason(error))));
          return;
        }
      }
      await soundRef.current?.unloadAsync().catch(() => undefined);
      await Audio.setAudioModeAsync({ allowsRecordingIOS: false, playsInSilentModeIOS: true }).catch(() => undefined);
      const { sound } = await Audio.Sound.createAsync({ uri: fileRef.current }, { shouldPlay: true });
      soundRef.current = sound;
      setPlayed(true);
    } catch {
      setMessage(t(twinAnswerVoiceCopy(null)));
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.voiceBox} testID="twin-answer-voice">
      <TouchableOpacity
        style={styles.button}
        disabled={busy}
        onPress={() => void play()}
        accessibilityRole="button"
        accessibilityState={{ disabled: busy, busy }}
        accessibilityLabel={t({ en: 'Hear this in my voice', zh: '用我的声音听这段' })}
        testID="twin-answer-voice-play"
      >
        {busy ? <ActivityIndicator /> : <Text style={styles.buttonText}>{played ? t({ en: 'Play again', zh: '再听一遍' }) : t({ en: 'Hear this in my voice', zh: '用我的声音听这段' })}</Text>}
      </TouchableOpacity>
      {played ? (
        <Text style={styles.aiLabel} testID="twin-answer-voice-ai-label">
          {t({ en: DIGITAL_TWIN_AI_MEDIA_LABEL_V1.en, zh: DIGITAL_TWIN_AI_MEDIA_LABEL_V1['zh-CN'] })}
        </Text>
      ) : (
        <Text style={styles.muted}>{t({ en: 'Made in your own ElevenLabs account on your credits; Agentrix keeps no audio.', zh: '在你自己的 ElevenLabs 账户里生成，用你的额度；Agentrix 不保存音频。' })}</Text>
      )}
      {message ? (
        <Text style={styles.detail} accessibilityLiveRegion="polite" testID="twin-answer-voice-message">
          {message}
        </Text>
      ) : null}
    </View>
  );
}

export function TwinVoiceScreen() {
  const { t, language } = useI18n();
  const styles = useThemedStyles(makeStyles);
  const queryClient = useQueryClient();
  const activeInstance = useAuthStore((state) => state.activeInstance);
  const agentId: string = activeInstance?.agentAccountId ?? activeInstance?.metadata?.agentAccountId ?? '';
  const key = twinVoiceQueryKey(agentId);
  const [voiceId, setVoiceId] = useState('');
  const [notice, setNotice] = useState<string | null>(null);
  const [question, setQuestion] = useState('');
  const [answers, setAnswers] = useState<TwinAnswerOutputV1[]>([]);
  const [askProblem, setAskProblem] = useState<string | null>(null);

  const voice = useQuery({ queryKey: key, queryFn: () => mobileTwinVoiceClient().read(agentId), enabled: !!agentId, retry: 0, staleTime: 15_000 });
  const add = useMutation({
    mutationFn: (raw: string) => mobileTwinVoiceClient().addVoice(agentId, raw),
    onMutate: () => setNotice(null),
    onSuccess: () => {
      setVoiceId('');
      setNotice(t({ en: 'Voice added. Once you have checked it is yours, choose “Use this voice”.', zh: '声音已加上。确认是你的声音后点「确认使用」。' }));
      void queryClient.invalidateQueries({ queryKey: key });
    },
    onError: (error) => setNotice(t(twinVoiceFailureCopy(error))),
  });
  const decide = useMutation({
    mutationFn: ({ assetId, action }: { assetId: string; action: TwinVoiceAction }) => mobileTwinVoiceClient().decide(agentId, assetId, action),
    onMutate: () => setNotice(null),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: key }),
    onError: (error) => setNotice(t(twinVoiceFailureCopy(error))),
  });
  const ask = useMutation({
    mutationFn: (text: string) => mobileTwinVoiceClient().ask(agentId, text, twinAskIdempotencyKey(), language === 'zh' ? 'zh-CN' : 'en'),
    onMutate: () => setAskProblem(null),
    onSuccess: (answer) => {
      setQuestion('');
      setAnswers((previous) => [answer, ...previous].slice(0, ANSWERS_KEPT));
    },
    onError: (error) => setAskProblem(t(twinAskFailureCopy(error))),
  });
  const busy = add.isPending || decide.isPending;

  const confirmDelete = (asset: MobileTwinVoiceAsset) =>
    Alert.alert(
      t({ en: 'Delete this voice?', zh: '删除这个声音？' }),
      t({ en: 'The twin stops using this voice. The voice itself stays in your own ElevenLabs account; delete it there if you want.', zh: '删除后分身不再用这个声音。声音本身还在你自己的 ElevenLabs 账户里，要删请去那边删。' }),
      [
        { text: t({ en: 'Cancel', zh: '取消' }), style: 'cancel' },
        { text: t({ en: 'Delete', zh: '删除' }), style: 'destructive', onPress: () => decide.mutate({ assetId: asset.assetId, action: 'delete' }) },
      ],
    );

  if (!agentId) {
    return (
      <View style={styles.screen}>
        <Text style={[styles.muted, styles.content]}>{t({ en: 'Pick an Agent first.', zh: '先选一只 Agent。' })}</Text>
      </View>
    );
  }

  const view = voice.data;
  const valid = normalizeVoiceId(voiceId);
  const readProblem = voice.isError
    ? voice.error instanceof TwinVoiceError && voice.error.failure === 'not_found'
      ? t({ en: 'This Agent has no twin yet, or it is not yours.', zh: '这只 Agent 还没有分身，或者不是你的。' })
      : voice.error instanceof TwinVoiceError && voice.error.failure === 'unavailable'
        ? t({ en: 'Twin voices are not open yet.', zh: '分身声音还没开放。' })
        : t({ en: 'The twin voice settings cannot be read right now.', zh: '暂时读不到分身声音的设置。' })
    : null;

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      refreshControl={<RefreshControl refreshing={voice.isFetching && !voice.isLoading} onRefresh={() => void voice.refetch()} />}
      testID="twin-voice-screen"
    >
      <Text style={styles.title}>{t({ en: 'Twin voice', zh: '分身的声音' })}</Text>
      <Text style={styles.muted}>
        {t({
          en: 'Make the voice in your own ElevenLabs account and paste its voice ID here. No sample passes through Agentrix and usage is billed to your account; voiced replies are always marked “AI generated”. The consent and your ElevenLabs key are set on the Web.',
          zh: '在你自己的 ElevenLabs 账户里做好声音，把声音 ID 填在这里。声音样本不经过 Agentrix，费用走你自己的账户；分身的语音回答都会标明「AI 生成」。同意和 ElevenLabs key 在网页上设置。',
        })}
      </Text>

      <View style={styles.card} testID="twin-voice">
        {voice.isLoading ? <ActivityIndicator /> : null}
        {readProblem ? (
          <Text style={styles.problem} testID="twin-voice-unavailable">
            {readProblem}
          </Text>
        ) : null}
        {view && !view.elevenLabsOpen ? (
          <Text style={styles.muted} testID="twin-voice-off">
            {t({ en: 'ElevenLabs voices are not open on the platform yet.', zh: '平台还没开 ElevenLabs 声音。' })}
          </Text>
        ) : null}
        {view && view.elevenLabsOpen ? (
          <>
            {view.killSwitch ? (
              <Text style={styles.problem} testID="twin-voice-paused">
                {t({ en: 'The platform has paused twin voices for now.', zh: '平台暂时停用了分身声音。' })}
              </Text>
            ) : null}
            {view.assets.map((asset) => (
              <View key={asset.assetId} style={styles.assetRow} testID={`twin-voice-asset-${asset.state}`}>
                <Text style={styles.cardTitle}>
                  {asset.voiceId} · {t(TWIN_VOICE_STATE_COPY[asset.state])}
                </Text>
                <View style={styles.actions}>
                  {asset.state === 'pending_review' ? (
                    <TouchableOpacity style={styles.button} disabled={busy} onPress={() => decide.mutate({ assetId: asset.assetId, action: 'approve' })} accessibilityRole="button" testID="twin-voice-approve">
                      <Text style={styles.buttonText}>{t({ en: 'Use this voice', zh: '确认使用' })}</Text>
                    </TouchableOpacity>
                  ) : null}
                  {asset.state === 'pending_review' || asset.state === 'approved' ? (
                    <TouchableOpacity style={styles.button} disabled={busy} onPress={() => decide.mutate({ assetId: asset.assetId, action: 'disable' })} accessibilityRole="button" testID="twin-voice-disable">
                      <Text style={styles.buttonText}>{t({ en: 'Disable', zh: '停用' })}</Text>
                    </TouchableOpacity>
                  ) : null}
                  <TouchableOpacity style={styles.dangerButton} disabled={busy} onPress={() => confirmDelete(asset)} accessibilityRole="button" testID="twin-voice-delete">
                    <Text style={styles.dangerText}>{t({ en: 'Delete', zh: '删除' })}</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))}
            <Text style={styles.label}>{t({ en: 'ElevenLabs voice ID', zh: 'ElevenLabs 声音 ID' })}</Text>
            <TextInput
              style={styles.input}
              value={voiceId}
              onChangeText={setVoiceId}
              autoCapitalize="none"
              autoCorrect={false}
              accessibilityLabel={t({ en: 'ElevenLabs voice ID', zh: 'ElevenLabs 声音 ID' })}
              testID="twin-voice-id"
            />
            {voiceId.trim() && !valid ? (
              <Text style={styles.problem} testID="twin-voice-id-invalid">
                {t({ en: 'A voice ID is 8 to 64 letters and digits.', zh: '声音 ID 是 8 到 64 位字母和数字。' })}
              </Text>
            ) : null}
            <TouchableOpacity
              style={[styles.primary, (!valid || busy || view.killSwitch) && styles.disabled]}
              disabled={!valid || busy || view.killSwitch}
              onPress={() => valid && add.mutate(valid)}
              accessibilityRole="button"
              accessibilityState={{ disabled: !valid || busy || view.killSwitch }}
              testID="twin-voice-add"
            >
              <Text style={styles.primaryText}>{t({ en: 'Add this voice', zh: '加上这个声音' })}</Text>
            </TouchableOpacity>
          </>
        ) : null}
        {notice ? (
          <Text style={styles.detail} accessibilityLiveRegion="polite" testID="twin-voice-message">
            {notice}
          </Text>
        ) : null}
      </View>

      <View style={styles.card} testID="twin-voice-ask">
        <Text style={styles.cardTitle}>{t({ en: 'Ask once, hear it in my voice', zh: '问一句，用我的声音听' })}</Text>
        <TextInput
          style={[styles.input, styles.question]}
          value={question}
          onChangeText={setQuestion}
          multiline
          placeholder={t({ en: 'Ask your twin something', zh: '问你的分身一句话' })}
          accessibilityLabel={t({ en: 'Question for your twin', zh: '问分身的话' })}
          testID="twin-voice-question"
        />
        <TouchableOpacity
          style={[styles.primary, (!question.trim() || ask.isPending) && styles.disabled]}
          disabled={!question.trim() || ask.isPending}
          onPress={() => ask.mutate(question)}
          accessibilityRole="button"
          testID="twin-voice-ask-send"
        >
          {ask.isPending ? <ActivityIndicator /> : <Text style={styles.primaryText}>{t({ en: 'Ask', zh: '问' })}</Text>}
        </TouchableOpacity>
        {askProblem ? (
          <Text style={styles.problem} testID="twin-voice-ask-problem">
            {askProblem}
          </Text>
        ) : null}
        {answers.map((answer) => (
          <View key={answer.turnRef.id} style={styles.answer} testID="twin-voice-answer">
            <Text style={styles.summary}>{answer.text}</Text>
            {answer.decision.noAnswerReason ? <Text style={styles.muted}>{answer.decision.noAnswerReason}</Text> : null}
            {twinAnswerVoiceable(answer) ? <AnswerVoice agentId={agentId} answer={answer} styles={styles} t={t} /> : null}
          </View>
        ))}
      </View>
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
    cardTitle: { color: c.textPrimary, fontSize: 15, fontWeight: '700' },
    detail: { color: c.textSecondary, fontSize: 13, lineHeight: 19 },
    summary: { color: c.textPrimary, fontSize: 14, lineHeight: 20 },
    label: { color: c.textSecondary, fontSize: 13, marginTop: 4 },
    input: { minHeight: 44, borderRadius: 12, borderWidth: 1, borderColor: c.border, paddingHorizontal: 12, color: c.textPrimary, fontSize: 15 },
    question: { minHeight: 72, paddingTop: 10, textAlignVertical: 'top' },
    assetRow: { gap: 6 },
    answer: { borderTopWidth: 1, borderTopColor: c.border, paddingTop: 10, gap: 6 },
    voiceBox: { gap: 4 },
    aiLabel: { color: c.textMuted, fontSize: 12 },
    actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    button: { minHeight: 44, paddingHorizontal: 16, borderRadius: 12, borderWidth: 1, borderColor: c.border, alignItems: 'center', justifyContent: 'center', alignSelf: 'flex-start' },
    buttonText: { color: c.textPrimary, fontSize: 14, fontWeight: '700' },
    dangerButton: { minHeight: 44, paddingHorizontal: 16, borderRadius: 12, borderWidth: 1, borderColor: c.danger, alignItems: 'center', justifyContent: 'center' },
    dangerText: { color: c.danger, fontSize: 14, fontWeight: '800' },
    primary: { minHeight: 44, borderRadius: 12, backgroundColor: c.primary, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
    primaryText: { color: c.onAccent, fontSize: 15, fontWeight: '800' },
    disabled: { opacity: 0.4 },
  });
