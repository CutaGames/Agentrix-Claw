/**
 * AeonPlazaScreen — 全服公共广场 + 实时群聊(社交场所 Step 1)。
 *
 * 这是永曜城的第一个"公共场所":一个不绑定任何地块的全服虚拟房间
 * (roomId = 'aeon-public-plaza'),所有玩家(真人/agent)都能进来同框 +
 * 实时群聊。复用已验证的 /aeon 网关(Task 7 双客户端在场测试 PASS):
 *   - 在场态:room_state / char_upsert / char_leave(头像条 + 在场计数)
 *   - 群聊:client `{t:'chat',scope:'room'}` → 服务器广播 `{t:'chat',...}`
 *     (agent 驱动的消息带 attribution 归因,R3.3)
 *
 * 身份铁律(R3):每条消息/每个头像按 badge 标 ✋ 真人 / 🤖 agent /
 * 🤖✋ 协同 / 🟣 NPC,以服务器下发为准,绝不混淆。
 *
 * 降级(design "实时 vs 异步双轨"):socket.io 不可用时群聊本质无法工作,
 * 明确提示"实时聊天不可用",而不是假装能发。
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { colors } from '../../theme/colors';
import { PetSpriteImage } from '../../components/PetSpriteImage';
import { useActivePet } from '../../services/activePet.service';
import { connectAeonRoom, type AeonRealtimeHandle } from '../../services/aeon/aeonRealtimeClient';
import { AeonTutorialOverlay, useAeonTutorial } from '../../components/aeon/AeonTutorialOverlay';
import type { AeonCharacterSnapshot, AeonServerEvent, AeonBadge } from '../../../shared/types/aeon-sync';

/** 全服公共广场固定房间 id(虚拟房间,不绑定地块;网关纯内存在场)。 */
const PUBLIC_PLAZA_ROOM_ID = 'aeon-public-plaza';

interface ChatMsg {
  key: string;
  fromCharId: string;
  text: string;
  attribution?: string;
  serverTs: number;
}

function badgeEmoji(b: AeonBadge): string {
  switch (b) {
    case 'human': return '✋';
    case 'agent': return '🤖';
    case 'copilot': return '🤖✋';
    case 'npc': return '🟣';
    default: return '✋';
  }
}

export default function AeonPlazaScreen() {
  const navigation = useNavigation<any>();
  const activePet = useActivePet();
  const tutorial = useAeonTutorial('aeon_tutorial_plaza_v1');

  const [chars, setChars] = useState<Record<string, AeonCharacterSnapshot>>({});
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [draft, setDraft] = useState('');
  const [connected, setConnected] = useState(false);
  const [degraded, setDegraded] = useState(false);
  const [connecting, setConnecting] = useState(true);

  const handleRef = useRef<AeonRealtimeHandle | null>(null);
  const scrollRef = useRef<ScrollView | null>(null);
  const msgSeq = useRef(0);

  // 我的角色快照(进广场用)。服务器会以鉴权 userId 覆盖归属。
  const mySnapshot = useMemo<AeonCharacterSnapshot>(
    () => ({
      charId: activePet.id,
      ownerUserId: activePet.id,
      controlState: 'manual',
      isAgentDriven: false,
      badge: 'human',
      clan: (activePet.clan as AeonCharacterSnapshot['clan']) ?? 'A',
      x: 2 + Math.floor(Math.random() * 3),
      y: 2 + Math.floor(Math.random() * 3),
      facing: 'right',
      sprite: 'idle',
      displayName: activePet.name,
    }),
    [activePet],
  );

  const applyServerEvent = useCallback(
    (ev: AeonServerEvent) => {
      switch (ev.t) {
        case 'room_state': {
          const next: Record<string, AeonCharacterSnapshot> = {};
          for (const c of ev.chars) next[c.charId] = c;
          setChars(next);
          break;
        }
        case 'char_upsert':
          setChars((prev) => ({ ...prev, [ev.char.charId]: ev.char }));
          break;
        case 'char_leave':
          setChars((prev) => {
            const next = { ...prev };
            delete next[ev.charId];
            return next;
          });
          break;
        case 'chat': {
          msgSeq.current += 1;
          const msg: ChatMsg = {
            key: `${ev.serverTs}-${ev.fromCharId}-${msgSeq.current}`,
            fromCharId: ev.fromCharId,
            text: ev.text,
            attribution: ev.attribution,
            serverTs: ev.serverTs,
          };
          setMessages((prev) => [...prev.slice(-199), msg]);
          break;
        }
        default:
          break;
      }
    },
    [],
  );

  useEffect(() => {
    const handle = connectAeonRoom({
      roomId: PUBLIC_PLAZA_ROOM_ID,
      snapshot: mySnapshot,
      onServerEvent: applyServerEvent,
      onConnected: () => {
        setConnected(true);
        setConnecting(false);
      },
      onDisconnected: () => setConnected(false),
      debug: __DEV__,
    });
    handleRef.current = handle;
    if (handle.isDegraded) {
      setDegraded(true);
      setConnecting(false);
    }
    return () => {
      handle.disconnect();
    };
  }, [mySnapshot, applyServerEvent]);

  const sendChat = useCallback(() => {
    const text = draft.trim();
    if (!text) return;
    const handle = handleRef.current;
    if (!handle || !handle.isConnected()) return;
    handle.send({ t: 'chat', text, scope: 'room' });
    setDraft('');
  }, [draft]);

  // 新消息自动滚到底
  useEffect(() => {
    const id = setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 50);
    return () => clearTimeout(id);
  }, [messages.length]);

  const occupants = Object.values(chars);
  const charById = chars;

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
    >
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backTxt}>‹</Text>
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>🎪 全服公共广场</Text>
          <Text style={styles.sub}>
            {degraded
              ? '实时聊天不可用(降级)'
              : connected
              ? `实时在线 · ${occupants.length} 人在场`
              : '连接中…'}
          </Text>
        </View>
        <TouchableOpacity style={styles.helpBtn} onPress={() => tutorial.setOpen(true)}>
          <Text style={styles.helpBtnText}>怎么玩?</Text>
        </TouchableOpacity>
      </View>

      {/* 在场头像条(身份徽章一眼区分真人/agent,R3) */}
      <View style={styles.rosterStripWrap}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.rosterStrip}>
          {occupants.length === 0 ? (
            <Text style={styles.rosterEmpty}>{connecting ? '进入广场中…' : '暂时没有其他人,发条消息招呼一下?'}</Text>
          ) : (
            occupants.map((c) => (
              <View key={c.charId} style={styles.avatarCol}>
                <Text style={styles.avatarBadge}>{badgeEmoji(c.badge)}</Text>
                <View style={styles.avatarHalo}>
                  <PetSpriteImage sprite={(c.sprite as any) || 'idle'} size={36} clan={c.clan} facing={c.facing} />
                </View>
                <Text style={styles.avatarName} numberOfLines={1}>{c.displayName}</Text>
              </View>
            ))
          )}
        </ScrollView>
      </View>

      {/* 聊天消息流 */}
      <ScrollView
        ref={scrollRef}
        style={styles.chatScroll}
        contentContainerStyle={styles.chatContent}
        onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: false })}
      >
        {degraded ? (
          <View style={styles.degradedCard}>
            <Text style={styles.degradedTitle}>实时聊天暂不可用</Text>
            <Text style={styles.degradedBody}>
              当前环境未启用实时连接(socket.io 不可用)。公共广场依赖实时通道,稍后再试或检查网络。
            </Text>
          </View>
        ) : messages.length === 0 ? (
          <View style={styles.emptyChat}>
            {connecting ? <ActivityIndicator color={colors.accent} /> : <Text style={styles.emptyEmoji}>💬</Text>}
            <Text style={styles.emptyChatText}>
              {connecting ? '连接广场…' : '广场很安静。发第一条消息,跟在场的人(和他们的 agent)打个招呼吧。'}
            </Text>
          </View>
        ) : (
          messages.map((m) => {
            const mine = m.fromCharId === activePet.id;
            const sender = charById[m.fromCharId];
            const name = sender?.displayName ?? '居民';
            const badge = sender ? badgeEmoji(sender.badge) : '👤';
            return (
              <View key={m.key} style={[styles.msgRow, mine && styles.msgRowMine]}>
                {!mine && <Text style={styles.msgBadge}>{badge}</Text>}
                <View style={[styles.bubble, mine ? styles.bubbleMine : styles.bubbleOther]}>
                  {!mine && <Text style={styles.msgSender} numberOfLines={1}>{name}</Text>}
                  <Text style={[styles.msgText, mine && styles.msgTextMine]}>{m.text}</Text>
                  {m.attribution ? <Text style={styles.msgAttribution}>🤖 {m.attribution}</Text> : null}
                </View>
                {mine && <Text style={styles.msgBadge}>{badgeEmoji('human')}</Text>}
              </View>
            );
          })
        )}
      </ScrollView>

      {/* 输入栏 */}
      <View style={styles.inputBar}>
        <TextInput
          style={styles.input}
          value={draft}
          onChangeText={setDraft}
          placeholder={degraded ? '实时聊天不可用' : '在广场说点什么…'}
          placeholderTextColor={colors.textMuted}
          editable={!degraded && connected}
          maxLength={300}
          onSubmitEditing={sendChat}
          returnKeyType="send"
          blurOnSubmit={false}
        />
        <TouchableOpacity
          style={[styles.sendBtn, (!draft.trim() || !connected || degraded) && styles.sendBtnDisabled]}
          onPress={sendChat}
          disabled={!draft.trim() || !connected || degraded}
        >
          <Text style={styles.sendTxt}>发送</Text>
        </TouchableOpacity>
      </View>

      <AeonTutorialOverlay
        storageKey="aeon_tutorial_plaza_v1"
        controlledOpen={tutorial.open}
        onClose={() => tutorial.setOpen(false)}
        title="🎪 全服公共广场"
        steps={[
          { icon: '🌍', title: '全服同框', body: '这里是不绑定地块的全服公共空间。所有在线玩家(和他们托管的 agent)都在同一个房间,实时同框、实时群聊。' },
          { icon: '✋', title: '真人还是 agent?', body: '每个头像 / 每条消息都带身份徽章:✋ 真人、🤖 agent、🤖✋ 协同。agent 替主人发言时会标注"由谁的 agent 执行"。' },
          { icon: '💬', title: '实时聊天', body: '下方输入框直接发言,全场实时可见。约人组队、聊任务、谈合作,从这里开始。' },
        ]}
        ctaLabel="开始逛广场"
        onCta={() => tutorial.setOpen(false)}
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgPrimary },
  header: { padding: 16, paddingBottom: 8, flexDirection: 'row', alignItems: 'center' },
  backBtn: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center', marginRight: 4 },
  backTxt: { color: colors.textPrimary, fontSize: 28, lineHeight: 30 },
  title: { color: colors.textPrimary, fontSize: 20, fontWeight: '700' },
  sub: { color: colors.textMuted, fontSize: 12, marginTop: 4 },
  helpBtn: { backgroundColor: colors.bgCard, borderRadius: 16, paddingHorizontal: 12, paddingVertical: 6, borderWidth: 1, borderColor: colors.border },
  helpBtnText: { color: colors.textSecondary, fontSize: 12, fontWeight: '600' },

  rosterStripWrap: { borderBottomWidth: 1, borderBottomColor: colors.border },
  rosterStrip: { paddingHorizontal: 12, paddingVertical: 8, gap: 12, alignItems: 'center', minHeight: 76 },
  rosterEmpty: { color: colors.textMuted, fontSize: 12, paddingHorizontal: 8 },
  avatarCol: { width: 52, alignItems: 'center' },
  avatarBadge: { fontSize: 11 },
  avatarHalo: {
    width: 36, height: 36, alignItems: 'center', justifyContent: 'center', borderRadius: 18,
    backgroundColor: 'rgba(8, 12, 28, 0.28)',
  },
  avatarName: { color: colors.textSecondary, fontSize: 9, maxWidth: 52, textAlign: 'center', marginTop: 2 },

  chatScroll: { flex: 1 },
  chatContent: { padding: 12, paddingBottom: 16, gap: 8 },
  emptyChat: { alignItems: 'center', justifyContent: 'center', paddingTop: 48, gap: 12 },
  emptyEmoji: { fontSize: 40 },
  emptyChatText: { color: colors.textMuted, fontSize: 13, textAlign: 'center', paddingHorizontal: 32, lineHeight: 20 },

  degradedCard: { backgroundColor: colors.bgCard, borderRadius: 12, borderWidth: 1, borderColor: colors.border, padding: 16, marginTop: 24 },
  degradedTitle: { color: colors.textPrimary, fontSize: 15, fontWeight: '700', marginBottom: 6 },
  degradedBody: { color: colors.textMuted, fontSize: 13, lineHeight: 19 },

  msgRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 6 },
  msgRowMine: { justifyContent: 'flex-end' },
  msgBadge: { fontSize: 14, marginBottom: 4 },
  bubble: { maxWidth: '76%', borderRadius: 14, paddingHorizontal: 12, paddingVertical: 8 },
  bubbleOther: { backgroundColor: colors.bgCard, borderWidth: 1, borderColor: colors.border, borderBottomLeftRadius: 4 },
  bubbleMine: { backgroundColor: colors.accent, borderBottomRightRadius: 4 },
  msgSender: { color: colors.textSecondary, fontSize: 11, fontWeight: '600', marginBottom: 2 },
  msgText: { color: colors.textPrimary, fontSize: 14, lineHeight: 19 },
  msgTextMine: { color: '#fff' },
  msgAttribution: { color: colors.textMuted, fontSize: 10, marginTop: 4, fontStyle: 'italic' },

  inputBar: { flexDirection: 'row', alignItems: 'center', padding: 10, gap: 8, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.bgPrimary },
  input: { flex: 1, backgroundColor: colors.bgCard, borderRadius: 20, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 14, paddingVertical: 8, color: colors.textPrimary, fontSize: 14, maxHeight: 100 },
  sendBtn: { backgroundColor: colors.accent, borderRadius: 20, paddingHorizontal: 16, paddingVertical: 10 },
  sendBtnDisabled: { opacity: 0.4 },
  sendTxt: { color: '#fff', fontSize: 14, fontWeight: '700' },
});
