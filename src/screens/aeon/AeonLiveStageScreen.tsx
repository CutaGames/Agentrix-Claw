/**
 * AeonLiveStageScreen — 现场活动 / 脱口秀直播厅(社交场所 Step 2 / Stage 原语落地)。
 *
 * 在已验证的 /aeon 实时房间之上叠加"舞台"语义:房间 id 以 'aeon-live-' 前缀,
 * 后端 StageService 据此启用舞台规则。
 *   - 角色:host(主持)/ speaker(台上发言)/ audience(观众)。首个进场真人自动成 host。
 *   - 上台:观众「举手」→ host 看到举手广播 → 「请上台」批准(stage_invite)。
 *   - 下台:speaker 自己「下台」或 host 请其下台(stage_leave_stage)。
 *   - 打赏:观众给台上发言者打赏 AXP(stage_tip)→ 真实价值流转(扣打赏者、入发言者),
 *     全场广播打赏气泡 + 维护本场"人气榜"(累计被打赏)。
 *   - 群聊:复用 chat 事件,作为现场弹幕/讨论。
 *
 * 身份铁律 R3:台上/台下/每条打赏都带 ✋🤖 徽章;agent 代发/代打赏标注归因。
 * 降级:socket.io 不可用 → 明确提示"直播厅需要实时连接"。
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
  Modal,
  Alert,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { colors } from '../../theme/colors';
import { PetSpriteImage } from '../../components/PetSpriteImage';
import { useActivePet } from '../../services/activePet.service';
import { connectAeonRoom, type AeonRealtimeHandle } from '../../services/aeon/aeonRealtimeClient';
import { AeonTutorialOverlay, useAeonTutorial } from '../../components/aeon/AeonTutorialOverlay';
import type {
  AeonCharacterSnapshot,
  AeonServerEvent,
  AeonBadge,
  AeonStageRole,
} from '../../../shared/types/aeon-sync';

/** 默认主直播厅房间 id(无指定活动时进的常驻厅;'aeon-live-' 前缀触发后端舞台规则)。 */
const DEFAULT_LIVE_ROOM_ID = 'aeon-live-main';
const TIP_PRESETS = [10, 50, 100, 500];

interface ChatMsg {
  key: string;
  fromCharId: string;
  text: string;
  attribution?: string;
  serverTs: number;
}
interface FeedItem {
  key: string;
  kind: 'tip' | 'hand';
  text: string;
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

function roleOf(c: AeonCharacterSnapshot): AeonStageRole {
  return c.stageRole ?? 'audience';
}

export default function AeonLiveStageScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const activePet = useActivePet();
  const tutorial = useAeonTutorial('aeon_tutorial_live_v1');

  // 活动厅:由 AeonEvents 进来时透传 roomId(= aeon-live-<eventId>)+ 标题;
  // 直接进"直播厅"则用默认常驻主厅。
  const roomId: string = route.params?.roomId ?? DEFAULT_LIVE_ROOM_ID;
  const hallTitle: string = route.params?.title ?? '永曜城直播厅';

  const [chars, setChars] = useState<Record<string, AeonCharacterSnapshot>>({});
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [feed, setFeed] = useState<FeedItem[]>([]);
  const [tipTotals, setTipTotals] = useState<Record<string, number>>({});
  const [raisedHands, setRaisedHands] = useState<Record<string, string>>({}); // charId -> name
  const [draft, setDraft] = useState('');
  const [connected, setConnected] = useState(false);
  const [degraded, setDegraded] = useState(false);
  const [tipTarget, setTipTarget] = useState<AeonCharacterSnapshot | null>(null);

  const handleRef = useRef<AeonRealtimeHandle | null>(null);
  const scrollRef = useRef<ScrollView | null>(null);
  const seq = useRef(0);

  const myCharId = activePet.id;

  const mySnapshot = useMemo<AeonCharacterSnapshot>(
    () => ({
      charId: activePet.id,
      ownerUserId: activePet.id,
      controlState: 'manual',
      isAgentDriven: false,
      badge: 'human',
      clan: (activePet.clan as AeonCharacterSnapshot['clan']) ?? 'A',
      x: 3,
      y: 5,
      facing: 'right',
      sprite: 'idle',
      displayName: activePet.name,
      stageRole: 'audience',
    }),
    [activePet],
  );

  const applyServerEvent = useCallback((ev: AeonServerEvent) => {
    switch (ev.t) {
      case 'room_state': {
        const next: Record<string, AeonCharacterSnapshot> = {};
        for (const c of ev.chars) next[c.charId] = c;
        setChars(next);
        break;
      }
      case 'char_upsert':
        setChars((prev) => ({ ...prev, [ev.char.charId]: ev.char }));
        // 上台后从举手队列清掉
        if (ev.char.stageRole === 'speaker' || ev.char.stageRole === 'host') {
          setRaisedHands((prev) => {
            if (!prev[ev.char.charId]) return prev;
            const n = { ...prev };
            delete n[ev.char.charId];
            return n;
          });
        }
        break;
      case 'char_leave':
        setChars((prev) => {
          const n = { ...prev };
          delete n[ev.charId];
          return n;
        });
        setRaisedHands((prev) => {
          if (!prev[ev.charId]) return prev;
          const n = { ...prev };
          delete n[ev.charId];
          return n;
        });
        break;
      case 'chat': {
        seq.current += 1;
        setMessages((prev) => [
          ...prev.slice(-149),
          { key: `${ev.serverTs}-${ev.fromCharId}-${seq.current}`, fromCharId: ev.fromCharId, text: ev.text, attribution: ev.attribution, serverTs: ev.serverTs },
        ]);
        break;
      }
      case 'stage_hand_raised':
        setRaisedHands((prev) => ({ ...prev, [ev.fromCharId]: ev.displayName }));
        seq.current += 1;
        setFeed((prev) => [...prev.slice(-49), { key: `h-${ev.serverTs}-${seq.current}`, kind: 'hand', text: `✋ ${ev.displayName} 举手想上台`, serverTs: ev.serverTs }]);
        break;
      case 'stage_tip':
        setTipTotals((prev) => ({ ...prev, [ev.targetCharId]: ev.totalToTarget }));
        seq.current += 1;
        setFeed((prev) => [
          ...prev.slice(-49),
          {
            key: `t-${ev.serverTs}-${seq.current}`,
            kind: 'tip',
            text: `🎁 ${ev.fromName} 给 ${ev.targetName} 打赏 ${ev.amount} AXP${ev.attribution ? `(${ev.attribution})` : ''}`,
            serverTs: ev.serverTs,
          },
        ]);
        break;
      case 'action':
        // 打赏失败回执(仅自己收到)。
        if (ev.action?.startsWith('tip_failed:')) {
          Alert.alert('打赏失败', ev.action.slice('tip_failed:'.length) || '请稍后再试');
        }
        break;
      default:
        break;
    }
  }, []);

  useEffect(() => {
    const handle = connectAeonRoom({
      roomId,
      snapshot: mySnapshot,
      onServerEvent: applyServerEvent,
      onConnected: () => setConnected(true),
      onDisconnected: () => setConnected(false),
      debug: __DEV__,
    });
    handleRef.current = handle;
    if (handle.isDegraded) setDegraded(true);
    return () => handle.disconnect();
  }, [mySnapshot, applyServerEvent, roomId]);

  useEffect(() => {
    const id = setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 50);
    return () => clearTimeout(id);
  }, [messages.length]);

  const send = useCallback((ev: Parameters<NonNullable<typeof handleRef.current>['send']>[0]) => {
    const h = handleRef.current;
    if (h && h.isConnected()) h.send(ev);
  }, []);

  const sendChat = useCallback(() => {
    const text = draft.trim();
    if (!text) return;
    send({ t: 'chat', text, scope: 'room' });
    setDraft('');
  }, [draft, send]);

  const occupants = Object.values(chars);
  const me = chars[myCharId];
  const myRole = me ? roleOf(me) : 'audience';
  const onStage = occupants
    .filter((c) => roleOf(c) === 'host' || roleOf(c) === 'speaker')
    .sort((a, b) => (roleOf(a) === 'host' ? -1 : roleOf(b) === 'host' ? 1 : 0));
  const audience = occupants.filter((c) => roleOf(c) === 'audience');
  const iAmHost = myRole === 'host';
  const handList = Object.entries(raisedHands);

  const doTip = useCallback(
    (amount: number) => {
      if (!tipTarget) return;
      send({ t: 'stage_tip', targetCharId: tipTarget.charId, amount });
      setTipTarget(null);
    },
    [tipTarget, send],
  );

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backTxt}>‹</Text>
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>🎤 {hallTitle}</Text>
          <Text style={styles.sub}>
            {degraded ? '直播厅需要实时连接(不可用)' : connected ? `现场 · ${occupants.length} 人 · 你是${myRole === 'host' ? '主持' : myRole === 'speaker' ? '嘉宾' : '观众'}` : '连接中…'}
          </Text>
        </View>
        <TouchableOpacity style={styles.helpBtn} onPress={() => tutorial.setOpen(true)}>
          <Text style={styles.helpBtnText}>怎么玩?</Text>
        </TouchableOpacity>
      </View>

      {/* 舞台区:host + speakers,带人气(累计打赏)。点台上角色 → 打赏。 */}
      <View style={styles.stage}>
        <Text style={styles.stageLabel}>🎭 台上</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.stageRow}>
          {onStage.length === 0 ? (
            <Text style={styles.stageEmpty}>台上暂时没人。第一个进来的人是主持,可以邀请观众上台。</Text>
          ) : (
            onStage.map((c) => {
              const isMe = c.charId === myCharId;
              const role = roleOf(c);
              const total = tipTotals[c.charId] ?? 0;
              return (
                <TouchableOpacity
                  key={c.charId}
                  style={[styles.stageCard, role === 'host' && styles.stageCardHost]}
                  disabled={isMe}
                  onPress={() => setTipTarget(c)}
                >
                  <Text style={styles.stageRoleTag}>{role === 'host' ? '主持' : '嘉宾'} {badgeEmoji(c.badge)}</Text>
                  <View style={styles.stageHalo}>
                    <PetSpriteImage sprite={(c.sprite as any) || 'talk'} size={52} clan={c.clan} facing={c.facing} />
                  </View>
                  <Text style={styles.stageName} numberOfLines={1}>{c.displayName}{isMe ? '(你)' : ''}</Text>
                  <Text style={styles.stageTip}>🎁 {total}</Text>
                  {!isMe ? <Text style={styles.stageTipCta}>打赏</Text> : null}
                </TouchableOpacity>
              );
            })
          )}
        </ScrollView>
        {/* 我的舞台动作:观众举手 / 嘉宾下台 */}
        <View style={styles.myActions}>
          {myRole === 'audience' ? (
            <TouchableOpacity style={[styles.actBtn, (!connected || degraded) && styles.actBtnDisabled]} disabled={!connected || degraded} onPress={() => send({ t: 'stage_raise_hand' })}>
              <Text style={styles.actBtnTxt}>✋ 举手上台</Text>
            </TouchableOpacity>
          ) : myRole === 'speaker' ? (
            <TouchableOpacity style={styles.actBtnGhost} onPress={() => send({ t: 'stage_leave_stage' })}>
              <Text style={styles.actBtnGhostTxt}>⬇️ 下台</Text>
            </TouchableOpacity>
          ) : (
            <Text style={styles.hostHint}>你是主持人。下方有人举手时点「请上台」邀请 TA。</Text>
          )}
        </View>
      </View>

      {/* host 专属:举手队列 */}
      {iAmHost && handList.length > 0 ? (
        <View style={styles.handQueue}>
          <Text style={styles.handQueueLabel}>举手中({handList.length}):</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
            {handList.map(([cid, name]) => (
              <TouchableOpacity key={cid} style={styles.handChip} onPress={() => send({ t: 'stage_invite', targetCharId: cid })}>
                <Text style={styles.handChipName} numberOfLines={1}>✋ {name}</Text>
                <Text style={styles.handChipCta}>请上台</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      ) : null}

      {/* 现场动态条(打赏/举手广播) */}
      {feed.length > 0 ? (
        <View style={styles.feedBar}>
          <Text style={styles.feedText} numberOfLines={1}>{feed[feed.length - 1].text}</Text>
        </View>
      ) : null}

      {/* 弹幕/讨论 */}
      <ScrollView ref={scrollRef} style={styles.chatScroll} contentContainerStyle={styles.chatContent}>
        {degraded ? (
          <View style={styles.degradedCard}>
            <Text style={styles.degradedTitle}>直播厅需要实时连接</Text>
            <Text style={styles.degradedBody}>当前环境未启用实时通道,稍后再试或检查网络。</Text>
          </View>
        ) : messages.length === 0 ? (
          <Text style={styles.emptyChat}>💬 还没有人说话。发条弹幕活跃下气氛,或举手上台开麦。</Text>
        ) : (
          messages.map((m) => {
            const sender = chars[m.fromCharId];
            const mine = m.fromCharId === myCharId;
            return (
              <View key={m.key} style={styles.msgRow}>
                <Text style={styles.msgBadge}>{sender ? badgeEmoji(sender.badge) : '👤'}</Text>
                <Text style={styles.msgName} numberOfLines={1}>{sender?.displayName ?? '观众'}{mine ? '(你)' : ''}:</Text>
                <Text style={styles.msgText}>{m.text}</Text>
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
          placeholder={degraded ? '实时不可用' : '发条弹幕…'}
          placeholderTextColor={colors.textMuted}
          editable={!degraded && connected}
          maxLength={200}
          onSubmitEditing={sendChat}
          returnKeyType="send"
          blurOnSubmit={false}
        />
        <TouchableOpacity style={[styles.sendBtn, (!draft.trim() || !connected || degraded) && styles.sendBtnDisabled]} onPress={sendChat} disabled={!draft.trim() || !connected || degraded}>
          <Text style={styles.sendTxt}>发送</Text>
        </TouchableOpacity>
      </View>

      {/* 打赏弹窗 */}
      <Modal visible={tipTarget != null} transparent animationType="fade" onRequestClose={() => setTipTarget(null)}>
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setTipTarget(null)}>
          <View style={styles.tipCard}>
            <Text style={styles.tipTitle}>给 {tipTarget?.displayName} 打赏</Text>
            <Text style={styles.tipSub}>用 AXP 打赏台上发言者,实时到账 TA 的钱包。</Text>
            <View style={styles.tipPresetRow}>
              {TIP_PRESETS.map((amt) => (
                <TouchableOpacity key={amt} style={styles.tipPreset} onPress={() => doTip(amt)}>
                  <Text style={styles.tipPresetTxt}>{amt}</Text>
                  <Text style={styles.tipPresetUnit}>AXP</Text>
                </TouchableOpacity>
              ))}
            </View>
            <TouchableOpacity style={styles.tipCancel} onPress={() => setTipTarget(null)}>
              <Text style={styles.tipCancelTxt}>取消</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      <AeonTutorialOverlay
        storageKey="aeon_tutorial_live_v1"
        controlledOpen={tutorial.open}
        onClose={() => tutorial.setOpen(false)}
        title="🎤 永曜城直播厅"
        steps={[
          { icon: '🎭', title: '台上 / 台下', body: '第一个进来的人是主持(host)。台上是发言嘉宾,台下是观众。每个角色都带 ✋真人 / 🤖agent 徽章。' },
          { icon: '✋', title: '举手上台', body: '观众点「举手上台」,主持会看到你举手,点「请上台」就能把你变成发言嘉宾。' },
          { icon: '🎁', title: '打赏赚 AXP', body: '点台上的嘉宾给 TA 打赏 AXP —— 真实价值实时到账 TA 钱包。台上发言越精彩,人气榜(🎁累计)越高。' },
          { icon: '💬', title: '发弹幕', body: '下方输入框发弹幕参与现场讨论,全场实时可见。' },
        ]}
        ctaLabel="开始"
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

  stage: { backgroundColor: '#140e2e', borderBottomWidth: 1, borderBottomColor: 'rgba(167,139,250,0.3)', paddingVertical: 10 },
  stageLabel: { color: colors.textSecondary, fontSize: 12, fontWeight: '700', paddingHorizontal: 16, marginBottom: 6 },
  stageRow: { paddingHorizontal: 12, gap: 10, alignItems: 'flex-end', minHeight: 110 },
  stageEmpty: { color: colors.textMuted, fontSize: 12, paddingHorizontal: 8, maxWidth: 280 },
  stageCard: { width: 92, alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 12, padding: 8, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' },
  stageCardHost: { borderColor: '#f5c84c', backgroundColor: 'rgba(245,200,76,0.10)' },
  stageRoleTag: { color: colors.textSecondary, fontSize: 10, fontWeight: '700' },
  stageHalo: { width: 52, height: 52, alignItems: 'center', justifyContent: 'center', borderRadius: 26, backgroundColor: 'rgba(8,12,28,0.35)', marginVertical: 2 },
  stageName: { color: colors.textPrimary, fontSize: 11, fontWeight: '600', maxWidth: 84, textAlign: 'center' },
  stageTip: { color: '#f5c84c', fontSize: 11, fontWeight: '700', marginTop: 2 },
  stageTipCta: { color: colors.accent, fontSize: 10, fontWeight: '700', marginTop: 2 },
  myActions: { paddingHorizontal: 16, paddingTop: 8, alignItems: 'flex-start' },
  actBtn: { backgroundColor: colors.accent, borderRadius: 18, paddingHorizontal: 16, paddingVertical: 8 },
  actBtnDisabled: { opacity: 0.4 },
  actBtnTxt: { color: '#fff', fontSize: 13, fontWeight: '700' },
  actBtnGhost: { backgroundColor: colors.bgCard, borderRadius: 18, paddingHorizontal: 16, paddingVertical: 8, borderWidth: 1, borderColor: colors.border },
  actBtnGhostTxt: { color: colors.textSecondary, fontSize: 13, fontWeight: '700' },
  hostHint: { color: '#f5c84c', fontSize: 12 },

  handQueue: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 8, gap: 8, backgroundColor: 'rgba(245,200,76,0.08)' },
  handQueueLabel: { color: '#f5c84c', fontSize: 12, fontWeight: '700' },
  handChip: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.bgCard, borderRadius: 14, paddingHorizontal: 10, paddingVertical: 6, borderWidth: 1, borderColor: '#f5c84c' },
  handChipName: { color: colors.textPrimary, fontSize: 12, maxWidth: 90 },
  handChipCta: { color: colors.accent, fontSize: 12, fontWeight: '700' },

  feedBar: { paddingHorizontal: 16, paddingVertical: 6, backgroundColor: 'rgba(167,139,250,0.10)' },
  feedText: { color: colors.textSecondary, fontSize: 12 },

  chatScroll: { flex: 1 },
  chatContent: { padding: 12, gap: 6 },
  emptyChat: { color: colors.textMuted, fontSize: 13, textAlign: 'center', paddingTop: 32, paddingHorizontal: 24, lineHeight: 20 },
  degradedCard: { backgroundColor: colors.bgCard, borderRadius: 12, borderWidth: 1, borderColor: colors.border, padding: 16, marginTop: 24 },
  degradedTitle: { color: colors.textPrimary, fontSize: 15, fontWeight: '700', marginBottom: 6 },
  degradedBody: { color: colors.textMuted, fontSize: 13, lineHeight: 19 },
  msgRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap' },
  msgBadge: { fontSize: 13, marginRight: 4 },
  msgName: { color: colors.textSecondary, fontSize: 12, fontWeight: '600', maxWidth: 110 },
  msgText: { color: colors.textPrimary, fontSize: 14, flexShrink: 1, marginLeft: 4 },

  inputBar: { flexDirection: 'row', alignItems: 'center', padding: 10, gap: 8, borderTopWidth: 1, borderTopColor: colors.border },
  input: { flex: 1, backgroundColor: colors.bgCard, borderRadius: 20, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 14, paddingVertical: 8, color: colors.textPrimary, fontSize: 14 },
  sendBtn: { backgroundColor: colors.accent, borderRadius: 20, paddingHorizontal: 16, paddingVertical: 10 },
  sendBtnDisabled: { opacity: 0.4 },
  sendTxt: { color: '#fff', fontSize: 14, fontWeight: '700' },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center', padding: 24 },
  tipCard: { width: '100%', maxWidth: 340, backgroundColor: colors.bgCard, borderRadius: 16, borderWidth: 1, borderColor: colors.border, padding: 20 },
  tipTitle: { color: colors.textPrimary, fontSize: 17, fontWeight: '700' },
  tipSub: { color: colors.textMuted, fontSize: 12, marginTop: 6, marginBottom: 14, lineHeight: 18 },
  tipPresetRow: { flexDirection: 'row', gap: 10, justifyContent: 'space-between' },
  tipPreset: { flex: 1, backgroundColor: 'rgba(245,200,76,0.12)', borderRadius: 12, borderWidth: 1, borderColor: '#f5c84c', paddingVertical: 12, alignItems: 'center' },
  tipPresetTxt: { color: '#f5c84c', fontSize: 18, fontWeight: '800' },
  tipPresetUnit: { color: '#f5c84c', fontSize: 10 },
  tipCancel: { paddingVertical: 12, alignItems: 'center', marginTop: 8 },
  tipCancelTxt: { color: colors.textMuted, fontSize: 14 },
});
