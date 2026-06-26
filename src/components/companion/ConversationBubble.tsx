/**
 * ConversationBubble — BottomSheet that surfaces the companion conversation
 * without leaving the current tab.
 *
 * Phase 1 strategy (T5):
 *   - Snap points 65% and 100%. Pull to 100% jumps to Summon Tab so the
 *     user keeps the same conversation in full-screen mode.
 *   - Reuses AgentChatScreen as the chat surface. Phase 1 doesn't lift
 *     useVoiceSession into a shared store yet; instead the bubble is a
 *     **launcher / preview** that lets the user start a turn in 65% and
 *     dump them into full Summon when more space is needed. This avoids
 *     a 1500-line refactor of useVoiceSession before we ship 4-tab IA.
 *   - When `autoOpenCamera` arrives we launch expo-image-picker first,
 *     then jump straight to AgentChat with the photo attachment in the
 *     route params (existing AgentChatScreen path supports this).
 *
 * Wave 4+ (T5.2 follow-up) will lift the streaming chat state into a
 * shared `conversationStore` so 65% and full-screen render the same
 * messages live without re-mounting AgentChatScreen.
 *
 * Spec: requirements.md R2.1 / R2.6 / R2.7, design.md §Components/Core 2.
 */
import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  Pressable,
  ActivityIndicator,
} from 'react-native';
import {
  BottomSheetBackdrop,
  BottomSheetModal,
  BottomSheetView,
  BottomSheetScrollView,
} from '@gorhom/bottom-sheet';
import * as ImagePicker from 'expo-image-picker';
import { colors } from '../../theme/colors';
import { useActivePet } from '../../services/activePet.service';
import { useAuthStore } from '../../stores/authStore';
import { useI18n } from '../../stores/i18nStore';
import { useVoiceSession } from '../../hooks/useVoiceSession';
import { navRefNavigate } from '../../navigation/navigationRef';
import { companionEvents } from '../../services/companionEvents.service';
import {
  subscribeConversation,
  setPendingPrefill,
  appendConversationMessages,
  getConversationSnapshot,
  type ConversationSnapshot,
} from '../../services/conversationStore';
import {
  conversationBubbleRef,
  type ConversationBubbleHandle,
  type ConversationBubblePresentOpts,
} from './sheetRefRegistry';
import { speakCompanionReply, stopCompanionVoice } from '../../services/onboarding/companionVoice';
import { getOnboardingTtsSpeaker } from '../../services/onboarding/ttsSpeaker';
import { themedStyles } from '../../theme/useTheme';

const SNAP_POINTS = ['65%', '100%'];

/** A live voice turn rendered inside the bubble (independent of the
 *  conversationStore which AgentChatScreen owns). */
interface BubbleVoiceMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  streaming?: boolean;
}

/**
 * BubbleVoiceController — 方案B: real in-bubble voice.
 *
 * Mounted ONLY while the bubble sheet is open AND voice is active, so the
 * heavy useVoiceSession side-effects (mic, wake-word, background audio,
 * realtime WS) never run globally (ConversationBubble itself is always
 * mounted in CompanionLayer). Unmounting tears the realtime session down.
 *
 * Runs the SAME realtime duplex path as the proven "red phone" voice on
 * AgentChatScreen (server-side STT→LLM→TTS over the /voice WS); the realtime
 * callbacks deliver the user transcript + streamed assistant reply, which we
 * lift back into the bubble's own message list. Renders nothing itself.
 */
function BubbleVoiceController(props: {
  token: string;
  instanceId: string;
  instanceName?: string;
  language: 'zh' | 'en';
  onUserMessage: (text: string) => void;
  onAssistantChunk: (chunk: string) => void;
  onAssistantEnd: () => void;
  onError: (message: string) => void;
  onPhase: (phase: string, connected: boolean, listening: boolean) => void;
}) {
  const { t } = useI18n();
  const vs = useVoiceSession({
    token: props.token,
    language: props.language,
    instanceId: props.instanceId,
    instanceName: props.instanceName,
    voiceModeRequested: true,
    duplexModeRequested: true,
    useRealtimeChannel: true,
    isSending: false,
    onSendMessage: () => {
      // Realtime duplex: the /voice gateway runs STT→LLM→TTS server-side and
      // streams the reply back via the realtime callbacks below, so there is
      // no client-side send pipeline to drive here.
    },
    onRealtimeUserMessage: props.onUserMessage,
    onRealtimeAssistantChunk: props.onAssistantChunk,
    onRealtimeAssistantResponseEnd: props.onAssistantEnd,
    onRealtimeError: props.onError,
    onStopCurrentResponse: () => {},
    t,
  });

  useEffect(() => {
    props.onPhase(vs.voicePhase, vs.realtimeConnected, vs.liveListening);
  }, [vs.voicePhase, vs.realtimeConnected, vs.liveListening]); // eslint-disable-line react-hooks/exhaustive-deps

  return null;
}

export const ConversationBubble = forwardRef<ConversationBubbleHandle>(
  function ConversationBubble(_props, externalRef) {
    const sheetRef = useRef<BottomSheetModal>(null);
    // Navigate via shared navigationRef — NOT useNavigation() (throws at the
    // CompanionLayer sibling position; root cause of the dead ball).
    const navigation = useMemo(
      () => ({ navigate: (...args: any[]) => navRefNavigate(...args) }),
      [],
    );
    const pet = useActivePet();
    const { language } = useI18n();
    const token = useAuthStore((s) => s.token);
    const activeInstance = useAuthStore((s) => s.activeInstance);

    const [draft, setDraft] = useState('');
    const [pendingAttachments, setPendingAttachments] = useState<
      Array<{ uri: string; kind: 'image' | 'audio' }>
    >([]);
    const [voiceActive, setVoiceActive] = useState(false);
    const [busy, setBusy] = useState(false);
    /** 正在朗读的助手消息 id(用于 🔊 高亮 + 二次点击停止)。 */
    const [speakingId, setSpeakingId] = useState<string | null>(null);
    /** 气泡是否已展开(sheet 打开)——用于仅在打开时挂载语音控制器。 */
    const [sheetOpen, setSheetOpen] = useState(false);
    /** 方案B:气泡内实时语音的本地消息列表 + 状态。 */
    const [voiceMessages, setVoiceMessages] = useState<BubbleVoiceMessage[]>([]);
    const [voiceStatus, setVoiceStatus] = useState<string>('');

    const voiceCanRun = voiceActive && sheetOpen && !!token && !!activeInstance?.id;

    const handleVoiceUserMessage = useCallback((text: string) => {
      const clean = (text || '').trim();
      if (!clean) return;
      const uid = `vu-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      const aid = `va-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      // 合并进主对话历史:语音转写的用户话立即写入共享 store(召唤页 focus 时会并入)。
      appendConversationMessages([{ id: uid, role: 'user', content: clean, createdAt: Date.now() }]);
      setVoiceMessages((prev) => [
        ...prev,
        { id: uid, role: 'user', content: clean },
        { id: aid, role: 'assistant', content: '', streaming: true },
      ]);
    }, []);

    const handleVoiceAssistantChunk = useCallback((chunk: string) => {
      if (!chunk) return;
      setVoiceMessages((prev) => {
        const next = [...prev];
        // Append to the last streaming assistant message, or start one.
        for (let i = next.length - 1; i >= 0; i--) {
          if (next[i].role === 'assistant' && next[i].streaming) {
            next[i] = { ...next[i], content: next[i].content + chunk };
            return next;
          }
        }
        next.push({ id: `a-${Date.now()}`, role: 'assistant', content: chunk, streaming: true });
        return next;
      });
    }, []);

    const handleVoiceAssistantEnd = useCallback(() => {
      setVoiceMessages((prev) => {
        let appended = false;
        return prev.map((m) => {
          if (m.role === 'assistant' && m.streaming) {
            // 助手回复完成 → 把最终文本并入共享主对话历史(召唤页可见)。
            if (!appended && m.content) {
              appendConversationMessages([{ id: m.id, role: 'assistant', content: m.content, createdAt: Date.now() }]);
              appended = true;
            }
            return { ...m, streaming: false };
          }
          return m;
        });
      });
    }, []);

    const handleVoiceError = useCallback((message: string) => {
      setVoiceStatus(message || '语音出错');
    }, []);

    const handleVoicePhase = useCallback((phase: string, connected: boolean, listening: boolean) => {
      if (!connected) setVoiceStatus('连接中…');
      else if (listening || phase === 'recording') setVoiceStatus('在听…');
      else if (phase === 'thinking') setVoiceStatus('思考中…');
      else if (phase === 'speaking') setVoiceStatus('回应中…');
      else setVoiceStatus('已就绪');
    }, []);

    // P-9 Q2 (T5.2/T5.4) — live mirror of the active conversation so the
    // bubble shows the SAME messages + routing badge as the full Summon
    // screen. AgentChatScreen publishes; we subscribe.
    const [convo, setConvo] = useState<ConversationSnapshot>(() =>
      getConversationSnapshot(),
    );
    useEffect(() => subscribeConversation(setConvo), []);

    // Show the most recent turns in the bubble preview (skip system rows).
    const visibleMessages = useMemo(
      () =>
        convo.messages
          .filter((m) => m.role !== 'system' && m.id !== 'welcome')
          .slice(-12),
      [convo.messages],
    );

    // When in-bubble voice is active, render its own live turn list; otherwise
    // mirror the shared conversation (AgentChatScreen).
    const displayMessages = useMemo(
      () => (voiceActive && voiceMessages.length > 0 ? (voiceMessages as any[]) : (visibleMessages as any[])),
      [voiceActive, voiceMessages, visibleMessages],
    );

    const reset = useCallback(() => {
      setDraft('');
      setPendingAttachments([]);
      setVoiceActive(false);
      setBusy(false);
      setSpeakingId(null);
      setVoiceMessages([]);
      setVoiceStatus('');
      stopCompanionVoice();
    }, []);

    /**
     * 朗读一条助手回复(R9.8):复用 ttsSpeaker 的同会话限频/缓存/降级。
     * 再次点击同一条 → 停止播放。被限频/失败时静默降级(文字本已在气泡里)。
     */
    const handleSpeak = useCallback(
      (id: string, text: string) => {
        if (speakingId === id) {
          stopCompanionVoice();
          setSpeakingId(null);
          return;
        }
        setSpeakingId(id);
        void speakCompanionReply(text, {
          onDegrade: () => setSpeakingId((cur) => (cur === id ? null : cur)),
        }).then((outcome) => {
          // 入队成功(played/cached)→ 播放队列排空后复位高亮;
          // 被限频/降级(throttled/degraded)→ 立即复位。
          if (outcome === 'played' || outcome === 'cached') {
            void getOnboardingTtsSpeaker()
              .whenIdle()
              .then(() => setSpeakingId((cur) => (cur === id ? null : cur)));
          } else {
            setSpeakingId((cur) => (cur === id ? null : cur));
          }
        });
      },
      [speakingId],
    );

    const present = useCallback(
      (opts?: ConversationBubblePresentOpts) => {
        reset();
        if (opts?.initialPrompt) setDraft(opts.initialPrompt);
        if (opts?.attachments?.length) setPendingAttachments(opts.attachments);
        if (opts?.autoActivateVoice) setVoiceActive(true);
        setSheetOpen(true);
        sheetRef.current?.present();

        if (opts?.autoOpenCamera) {
          // Fire-and-forget; user may dismiss while picker is open.
          (async () => {
            try {
              const perm = await ImagePicker.requestCameraPermissionsAsync();
              if (!perm.granted) return;
              setBusy(true);
              const res = await ImagePicker.launchCameraAsync({
                allowsEditing: false,
                quality: 0.85,
                exif: false,
              });
              if (!res.canceled && res.assets?.[0]) {
                setPendingAttachments((prev) => [
                  ...prev,
                  { uri: res.assets![0]!.uri, kind: 'image' as const },
                ]);
                if (!opts.initialPrompt) setDraft('这是什么?');
              }
            } catch (err) {
              console.warn('[ConversationBubble] camera failed:', err);
            } finally {
              setBusy(false);
            }
          })();
        }
      },
      [reset],
    );

    const dismiss = useCallback(() => {
      sheetRef.current?.dismiss();
      reset();
    }, [reset]);

    const expandToFull = useCallback(() => {
      sheetRef.current?.snapToIndex(1);
    }, []);

    // Register the imperative handle into both the forwarded ref and the
    // module-scope registry so non-React callers (deep-link handler,
    // companion ball single-tap) can call present() too.
    const handle = useMemo<ConversationBubbleHandle>(
      () => ({ present, dismiss, expandToFull }),
      [present, dismiss, expandToFull],
    );

    useImperativeHandle(externalRef, () => handle, [handle]);

    useEffect(() => {
      conversationBubbleRef.current = handle;
      return () => {
        conversationBubbleRef.current = null;
      };
    }, [handle]);

    const renderBackdrop = useCallback(
      (props: any) => (
        <BottomSheetBackdrop
          {...props}
          appearsOnIndex={0}
          disappearsOnIndex={-1}
          pressBehavior="close"
          opacity={0.4}
        />
      ),
      [],
    );

    const handleSendOrJump = useCallback(() => {
      // Q2: bubble = launcher into full Summon. We now ALSO write the draft
      // into the shared conversationStore so AgentChatScreen picks it up via
      // consumePendingPrefill() on focus — robust against the Summon→AgentChat
      // navigator nesting that drops route params. Nav params kept too for
      // back-compat with the legacy ball flow.
      const params: any = {
        autoVoice: voiceActive,
        prefillText: draft || undefined,
        attachments: pendingAttachments.length ? pendingAttachments : undefined,
      };
      setPendingPrefill({
        text: draft || undefined,
        attachments: pendingAttachments.length ? pendingAttachments : undefined,
        autoVoice: voiceActive,
      });
      sheetRef.current?.dismiss();
      reset();
      try {
        navigation.navigate('Main', { screen: 'Summon', params: { screen: 'SummonRoot', params } });
      } catch {
        // Fallback for nested navigator differences in older builds
        navigation.navigate('AgentChat', params);
      }
    }, [voiceActive, draft, pendingAttachments, navigation, reset]);

    const handleSnapChange = useCallback(
      (index: number) => {
        if (index === 1) {
          // 100% — escalate to full-screen Summon and dismiss bubble.
          // Defer one frame so the snap animation can complete cleanly.
          setTimeout(() => handleSendOrJump(), 200);
        }
      },
      [handleSendOrJump],
    );

    const handleSheetDismiss = useCallback(() => {
      setSheetOpen(false);
      reset();
      // Phase 1: explicitly tell mode bus the user closed the bubble so
      // the ball can fall back to companion mode if it had transitioned
      // to whisper / listening for this turn.
      companionEvents.emit({
        type: 'mode-changed',
        from: 'whisper',
        to: 'companion',
        source: 'bubble-dismissed',
      });
    }, [reset]);

    return (
      <BottomSheetModal
        ref={sheetRef}
        snapPoints={SNAP_POINTS}
        index={0}
        backdropComponent={renderBackdrop}
        backgroundStyle={styles.sheetBg}
        handleIndicatorStyle={styles.handleIndicator}
        enableDismissOnClose
        onChange={handleSnapChange}
        onDismiss={handleSheetDismiss}
        keyboardBehavior="interactive"
        keyboardBlurBehavior="restore"
      >
        <BottomSheetView style={styles.container}>
          {/* 方案B: real in-bubble realtime voice — mounted only while open +
              active so its mic/WS side-effects never run globally. */}
          {voiceCanRun && (
            <BubbleVoiceController
              token={token as string}
              instanceId={activeInstance!.id}
              instanceName={convo.agentName || pet.name}
              language={language === 'zh' ? 'zh' : 'en'}
              onUserMessage={handleVoiceUserMessage}
              onAssistantChunk={handleVoiceAssistantChunk}
              onAssistantEnd={handleVoiceAssistantEnd}
              onError={handleVoiceError}
              onPhase={handleVoicePhase}
            />
          )}
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerLeft}>
              <Text style={styles.headerEmoji}>🐾</Text>
              <View>
                <Text style={styles.headerName}>{convo.agentName || pet.name}</Text>
                <Text style={styles.headerMode}>
                  {voiceActive ? (voiceStatus || '在听…') : convo.busy ? '思考中…' : '准备好了'}
                </Text>
              </View>
            </View>
            <View style={styles.headerRight}>
              <TouchableOpacity onPress={expandToFull} style={styles.iconBtn} accessibilityLabel="放大到全屏">
                <Text style={styles.iconText}>⛶</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={dismiss} style={styles.iconBtn} accessibilityLabel="关闭">
                <Text style={styles.iconText}>✕</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Routing badge (top-right of body) — live from conversationStore,
              reflecting whether the current turn runs on-device (📱 本地) or
              in the cloud (🌐 云端). Published by AgentChatScreen. */}
          <View style={styles.routingBadgeRow}>
            <View style={styles.routingBadge}>
              <Text style={styles.routingBadgeText}>
                {convo.routing === 'local' ? '📱 本地' : '🌐 云端'}
              </Text>
            </View>
          </View>

          {/* Body — live message mirror (Q2). Shows the same conversation as
              the full Summon screen; empty state falls back to the launcher
              hint. */}
          <View style={styles.body}>
            {pendingAttachments.length > 0 && (
              <View style={styles.attachmentRow}>
                {pendingAttachments.map((a, idx) => (
                  <View key={idx} style={styles.attachmentChip}>
                    <Text style={styles.attachmentChipText}>
                      {a.kind === 'image' ? '🖼' : '🎙'} 已附 1 项
                    </Text>
                  </View>
                ))}
              </View>
            )}

            {displayMessages.length > 0 ? (
              <BottomSheetScrollView
                style={styles.messageList}
                contentContainerStyle={styles.messageListContent}
                showsVerticalScrollIndicator={false}
              >
                {displayMessages.map((m) => (
                  <View
                    key={m.id}
                    style={[
                      styles.msgRow,
                      m.role === 'user' ? styles.msgRowUser : styles.msgRowAssistant,
                    ]}
                  >
                    <View
                      style={[
                        styles.msgBubble,
                        m.role === 'user' ? styles.msgBubbleUser : styles.msgBubbleAssistant,
                        m.error ? styles.msgBubbleError : null,
                      ]}
                    >
                      <Text style={[styles.msgText, m.role === 'user' ? styles.msgTextUser : null]}>
                        {m.content || (m.streaming ? '…' : '')}
                        {m.attachmentCount ? `  📎${m.attachmentCount}` : ''}
                      </Text>
                      {/* 朗读助手回复(R9.8):复用 ttsSpeaker 限频/缓存。仅在
                          回复完成且有文本时出现,避免对流式中途内容反复合成。 */}
                      {m.role === 'assistant' && !m.streaming && !m.error && !!m.content && (
                        <TouchableOpacity
                          style={styles.speakBtn}
                          onPress={() => handleSpeak(m.id, m.content)}
                          accessibilityLabel={speakingId === m.id ? '停止朗读' : '朗读这条回复'}
                        >
                          <Text style={styles.speakBtnText}>
                            {speakingId === m.id ? '⏹ 停止' : '🔊 朗读'}
                          </Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  </View>
                ))}
                {convo.busy && (
                  <View style={styles.busyRow}>
                    <ActivityIndicator color={colors.accent} />
                    <Text style={styles.busyText}>思考中…</Text>
                  </View>
                )}
              </BottomSheetScrollView>
            ) : busy ? (
              <View style={styles.busyRow}>
                <ActivityIndicator color={colors.accent} />
                <Text style={styles.busyText}>相机准备中…</Text>
              </View>
            ) : (
              <Text style={styles.bodyHint}>
                直接说话或输入,我会接住。也可以先拍照,然后向我提问。
              </Text>
            )}
          </View>

          {/* Composer */}
          <View style={styles.composer}>
            <TouchableOpacity
              style={styles.composerIcon}
              onPress={async () => {
                try {
                  const res = await ImagePicker.launchImageLibraryAsync({
                    quality: 0.85,
                    allowsMultipleSelection: false,
                  });
                  if (!res.canceled && res.assets?.[0]) {
                    setPendingAttachments((prev) => [
                      ...prev,
                      { uri: res.assets![0]!.uri, kind: 'image' as const },
                    ]);
                  }
                } catch {
                  /* ignore */
                }
              }}
              accessibilityLabel="相册"
            >
              <Text style={styles.composerIconText}>📁</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.composerIcon}
              onPress={async () => {
                try {
                  const perm = await ImagePicker.requestCameraPermissionsAsync();
                  if (!perm.granted) return;
                  const res = await ImagePicker.launchCameraAsync({ quality: 0.85 });
                  if (!res.canceled && res.assets?.[0]) {
                    setPendingAttachments((prev) => [
                      ...prev,
                      { uri: res.assets![0]!.uri, kind: 'image' as const },
                    ]);
                    if (!draft) setDraft('这是什么?');
                  }
                } catch {
                  /* ignore */
                }
              }}
              accessibilityLabel="相机"
            >
              <Text style={styles.composerIconText}>📷</Text>
            </TouchableOpacity>
            <Pressable
              style={[styles.composerIcon, voiceActive && styles.composerIconActive]}
              onPress={() => setVoiceActive((v) => !v)}
              accessibilityLabel="切换语音"
            >
              <Text style={styles.composerIconText}>🎤</Text>
            </Pressable>

            <TextInput
              style={styles.input}
              value={draft}
              onChangeText={setDraft}
              placeholder="说点什么…"
              placeholderTextColor={colors.textMuted}
              multiline
              maxLength={500}
            />

            <TouchableOpacity
              style={[
                styles.sendBtn,
                draft.trim().length === 0 && pendingAttachments.length === 0 && !voiceActive
                  ? styles.sendBtnDisabled
                  : null,
              ]}
              onPress={handleSendOrJump}
              disabled={draft.trim().length === 0 && pendingAttachments.length === 0 && !voiceActive}
              accessibilityLabel="发送"
            >
              <Text style={styles.sendBtnText}>▶</Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.escapeHint}>↑ 上滑或点击 ⛶ 在 Summon 里继续完整对话</Text>
        </BottomSheetView>
      </BottomSheetModal>
    );
  },
);

const styles = themedStyles(() => StyleSheet.create({
  sheetBg: {
    backgroundColor: colors.bgCard,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
  },
  handleIndicator: {
    backgroundColor: colors.border,
    width: 40,
  },
  container: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 4,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 6,
    paddingBottom: 10,
    borderBottomColor: colors.border,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  headerEmoji: { fontSize: 28 },
  headerName: { color: colors.textPrimary, fontWeight: '700', fontSize: 16 },
  headerMode: { color: colors.textMuted, fontSize: 12, marginTop: 2 },
  headerRight: {
    flexDirection: 'row',
    gap: 4,
  },
  iconBtn: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
  },
  iconText: { color: colors.textPrimary, fontSize: 16, fontWeight: '600' },
  routingBadgeRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingTop: 10,
  },
  routingBadge: {
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 12,
    backgroundColor: colors.bgPrimary,
    borderColor: colors.border,
    borderWidth: 1,
  },
  routingBadgeText: { color: colors.textPrimary, fontSize: 11, fontWeight: '600' },
  body: {
    flex: 1,
    paddingTop: 12,
  },
  attachmentRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    paddingVertical: 8,
  },
  attachmentChip: {
    backgroundColor: colors.bgPrimary,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    borderColor: colors.border,
    borderWidth: 1,
  },
  attachmentChipText: { color: colors.textPrimary, fontSize: 12 },
  busyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 6,
  },
  busyText: { color: colors.textMuted, fontSize: 12 },
  bodyHint: {
    color: colors.textMuted,
    fontSize: 13,
    marginTop: 8,
    lineHeight: 18,
  },
  messageList: {
    flex: 1,
    marginTop: 8,
  },
  messageListContent: {
    paddingBottom: 8,
    gap: 8,
  },
  msgRow: {
    flexDirection: 'row',
    width: '100%',
  },
  msgRowUser: { justifyContent: 'flex-end' },
  msgRowAssistant: { justifyContent: 'flex-start' },
  msgBubble: {
    maxWidth: '82%',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 14,
  },
  msgBubbleUser: {
    backgroundColor: colors.accent,
    borderBottomRightRadius: 4,
  },
  msgBubbleAssistant: {
    backgroundColor: colors.bgPrimary,
    borderColor: colors.border,
    borderWidth: 1,
    borderBottomLeftRadius: 4,
  },
  msgBubbleError: {
    borderColor: '#ef4444',
    borderWidth: 1,
  },
  msgText: {
    color: colors.textPrimary,
    fontSize: 14,
    lineHeight: 19,
  },
  msgTextUser: {
    color: '#fff',
  },
  speakBtn: {
    marginTop: 6,
    alignSelf: 'flex-start',
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 8,
    backgroundColor: colors.bgCard,
    borderColor: colors.border,
    borderWidth: StyleSheet.hairlineWidth,
  },
  speakBtnText: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: '600',
  },
  composer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingTop: 10,
    paddingBottom: 6,
    borderTopColor: colors.border,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  composerIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bgPrimary,
    borderColor: colors.border,
    borderWidth: 1,
  },
  composerIconActive: {
    backgroundColor: colors.accent + '33',
    borderColor: colors.accent,
  },
  composerIconText: { fontSize: 18 },
  input: {
    flex: 1,
    minHeight: 36,
    maxHeight: 90,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: colors.bgPrimary,
    borderColor: colors.border,
    borderWidth: 1,
    color: colors.textPrimary,
    fontSize: 14,
  },
  sendBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accent,
  },
  sendBtnDisabled: {
    backgroundColor: colors.bgPrimary,
  },
  sendBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  escapeHint: {
    color: colors.textMuted,
    fontSize: 11,
    textAlign: 'center',
    paddingVertical: 8,
  },
}));
