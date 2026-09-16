/**
 * DramaRunner — 互动剧(分支叙事)原生播放器(短剧 MVP)。
 *
 * 闭环:播放(场景流)→ 选择(分支)→ 进入未解锁集时弹 AXP 解锁(服务端权威)→
 * 打赏作者(复用 tipCreation)。故事由后端 `getDramaStory` 提供;解锁状态由
 * `getDramaState` / `unlockDramaEpisode` 维护(第 1 集恒免费)。
 *
 * 视觉:手机竖屏微短剧;背景用渐变关键字/emoji(无真人视频,规避成本陷阱)。
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
  Modal,
  Image,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { colors } from '../../theme/colors';
import { getDramaState, unlockDramaEpisode, tipCreation } from '../../services/creationApi';
import { setPendingPrefill } from '../../services/conversationStore';
import { speakCompanionReply, stopCompanionVoice } from '../../services/onboarding/companionVoice';
import type { DramaStory, DramaScene } from '../../../shared/types/drama';
import { themedStyles } from '../../theme/useTheme';

/** 旁白/非真人说话者(不提供"找TA聊"):旁白、未知来电、主角本人(玩家代入)。 */
const NON_CHARACTER_SPEAKERS = new Set(['旁白', '未知号码', '林夏', '我']);

/** 背景渐变关键字 → 两色渐变(用纯色叠加近似,无需额外依赖)。 */
const BG_GRADIENTS: Record<string, [string, string]> = {
  night: ['#0b1026', '#1b2350'],
  rain: ['#10141c', '#26303f'],
  sunset: ['#3a1f3d', '#7a3b2e'],
  office: ['#11161d', '#1f2a36'],
  cafe: ['#2a1d14', '#4a3522'],
};

function bgColorsFor(bg?: string): [string, string] {
  if (bg && BG_GRADIENTS[bg]) return BG_GRADIENTS[bg];
  return ['#0e1016', '#181c26'];
}

/** 非渐变关键字的 bg 视作 emoji 装饰。 */
function bgEmoji(bg?: string): string | null {
  if (!bg) return null;
  if (BG_GRADIENTS[bg]) return null;
  if (/^https?:/i.test(bg)) return null; // 图片 URL(本 demo 不渲染外图)
  return bg; // emoji
}

export default function DramaRunner({
  creationId,
  story,
  t,
}: {
  creationId: string;
  story: DramaStory;
  t: (d: { zh: string; en: string }) => string;
}) {
  const sceneById = useMemo(() => {
    const m: Record<string, DramaScene> = {};
    for (const s of story.scenes) m[s.id] = s;
    return m;
  }, [story]);

  const [currentId, setCurrentId] = useState<string>(story.startSceneId);
  const [unlocked, setUnlocked] = useState<number[]>([1]);
  const [pendingEpisode, setPendingEpisode] = useState<number | null>(null);
  const [pendingTargetId, setPendingTargetId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [tipOpen, setTipOpen] = useState(false);
  const [voiceOn, setVoiceOn] = useState(false);
  const navigation = useNavigation<any>();

  useEffect(() => {
    let cancelled = false;
    getDramaState(creationId)
      .then((s) => { if (!cancelled) setUnlocked(s.unlockedEpisodes ?? [1]); })
      .catch(() => { /* 离线/失败:第 1 集仍可看 */ });
    return () => { cancelled = true; };
  }, [creationId]);

  // #2 TTS:开启朗读时,每切换场景朗读当前台词(复用 companionVoice 限频/降级)。
  useEffect(() => {
    if (!voiceOn) { stopCompanionVoice(); return; }
    const sc = sceneById[currentId];
    if (sc?.text) {
      stopCompanionVoice();
      const prefix = sc.speaker && sc.speaker !== '旁白' ? `${sc.speaker}:` : '';
      void speakCompanionReply(`${prefix}${sc.text}`, {});
    }
  }, [currentId, voiceOn, sceneById]);

  // 离开时停止朗读。
  useEffect(() => () => stopCompanionVoice(), []);

  // #3 活体 agent 演角色:把当前角色带去召唤(Summon)继续聊(剧外延展,ReelShort 给不了)。
  const summonCharacter = useCallback((name: string) => {
    const persona =
      `【角色扮演】你现在是互动剧《${story.title}》中的角色「${name}」。` +
      `请始终以 ${name} 的身份、性格与说话风格和我对话,记住剧情设定,不要跳出角色。先用一句话和我打个招呼。`;
    setPendingPrefill({ text: persona } as any);
    try {
      navigation.navigate('Main', { screen: 'Summon', params: { screen: 'SummonRoot', params: { prefillText: persona } } });
    } catch {
      try { navigation.navigate('AgentChat', { prefillText: persona }); } catch { /* noop */ }
    }
  }, [navigation, story.title]);

  const episodeMeta = useCallback(
    (ep: number) => story.episodes.find((e) => e.episode === ep),
    [story],
  );

  /** 跳到目标场景;若其所属集未解锁 → 拦截并弹解锁。 */
  const go = useCallback(
    (toId: string) => {
      const sc = sceneById[toId];
      if (!sc) return;
      if (!unlocked.includes(sc.episode)) {
        setPendingEpisode(sc.episode);
        setPendingTargetId(toId);
        return;
      }
      setCurrentId(toId);
    },
    [sceneById, unlocked],
  );

  const doUnlock = useCallback(async () => {
    if (pendingEpisode == null) return;
    setBusy(true);
    setNotice(null);
    try {
      const res = await unlockDramaEpisode(creationId, pendingEpisode);
      setUnlocked(res.unlockedEpisodes ?? unlocked);
      const target = pendingTargetId;
      setPendingEpisode(null);
      setPendingTargetId(null);
      if (target) setCurrentId(target);
    } catch (e: any) {
      const msg = String(e?.message ?? e);
      setNotice(
        /insufficient|不足|balance/i.test(msg)
          ? t({ en: 'Not enough AXP.', zh: 'AXP 余额不足。' })
          : t({ en: 'Unlock failed, try again.', zh: '解锁失败,请重试。' }),
      );
    } finally {
      setBusy(false);
    }
  }, [pendingEpisode, pendingTargetId, creationId, unlocked, t]);

  const doTip = useCallback(async (amount: number) => {
    setTipOpen(false);
    try {
      await tipCreation(creationId, amount);
      setNotice(t({ en: `Tipped ${amount} AXP. Thanks!`, zh: `已打赏 ${amount} AXP,感谢支持!` }));
    } catch (e: any) {
      setNotice(t({ en: 'Tip failed.', zh: '打赏失败。' }));
    }
  }, [creationId, t]);

  const scene = sceneById[currentId];
  if (!scene) {
    return <View style={styles.center}><Text style={styles.dim}>{t({ en: 'Scene missing.', zh: '场景缺失。' })}</Text></View>;
  }

  const [bgTop, bgBottom] = bgColorsFor(scene.bg);
  const emoji = bgEmoji(scene.bg);
  const bgUrl = scene.bg && /^https?:/i.test(scene.bg) ? scene.bg : null;
  const curEp = episodeMeta(scene.episode);
  const pendingMeta = pendingEpisode != null ? episodeMeta(pendingEpisode) : null;

  return (
    <View style={[styles.container, { backgroundColor: bgTop }]}>
      {/* 背景:有 AI 场景图 → 渲染图片 + 压暗;否则上下两色块近似渐变 + 可选 emoji 大图 */}
      {bgUrl ? (
        <>
          <Image source={{ uri: bgUrl }} style={styles.bgFill} resizeMode="cover" />
          <View style={[styles.bgFill, styles.bgImageScrim]} pointerEvents="none" />
        </>
      ) : (
        <>
          <View style={styles.bgFill}>
            <View style={[styles.bgHalf, { backgroundColor: bgTop }]} />
            <View style={[styles.bgHalf, { backgroundColor: bgBottom }]} />
          </View>
          {emoji ? <Text style={styles.bgEmoji}>{emoji}</Text> : null}
        </>
      )}

      {/* 顶部:集信息 + 朗读开关 + 打赏 */}
      <View style={styles.topRow}>
        <View style={styles.epPill}>
          <Text style={styles.epPillText}>{curEp?.title ?? `第 ${scene.episode} 集`}</Text>
        </View>
        <View style={styles.topBtns}>
          <TouchableOpacity style={styles.iconBtn} onPress={() => setVoiceOn((v) => !v)} testID="drama-voice">
            <Text style={styles.iconBtnText}>{voiceOn ? '🔊' : '🔈'}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.tipBtn} onPress={() => setTipOpen(true)} testID="drama-tip">
            <Text style={styles.tipBtnText}>🎁 {t({ en: 'Tip', zh: '打赏' })}</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* 台词区 */}
      <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent}>
        {scene.speaker ? <Text style={styles.speaker}>{scene.speaker}</Text> : null}
        <Text style={styles.line}>{scene.text}</Text>
        {scene.speaker && !NON_CHARACTER_SPEAKERS.has(scene.speaker) ? (
          <TouchableOpacity style={styles.summonBtn} onPress={() => summonCharacter(scene.speaker!)} testID="drama-summon">
            <Text style={styles.summonText}>🗣 {t({ en: `Chat with ${scene.speaker}`, zh: `找「${scene.speaker}」聊聊` })}</Text>
          </TouchableOpacity>
        ) : null}
      </ScrollView>

      {notice ? (
        <TouchableOpacity style={styles.notice} onPress={() => setNotice(null)}>
          <Text style={styles.noticeText}>{notice}</Text>
        </TouchableOpacity>
      ) : null}

      {/* 底部:选择 / 继续 / 结局 */}
      <View style={styles.controls}>
        {scene.ending ? (
          <TouchableOpacity style={styles.restartBtn} onPress={() => setCurrentId(story.startSceneId)} testID="drama-restart">
            <Text style={styles.restartText}>↻ {t({ en: 'Watch again', zh: '重新观看' })}</Text>
          </TouchableOpacity>
        ) : scene.choices && scene.choices.length > 0 ? (
          scene.choices.map((c) => (
            <TouchableOpacity key={c.id} style={styles.choiceBtn} onPress={() => go(c.next)} testID={`drama-choice-${c.id}`}>
              <Text style={styles.choiceText}>{c.label}</Text>
            </TouchableOpacity>
          ))
        ) : scene.next ? (
          <TouchableOpacity style={styles.nextBtn} onPress={() => go(scene.next!)} testID="drama-next">
            <Text style={styles.nextText}>{t({ en: 'Continue', zh: '继续' })} ▸</Text>
          </TouchableOpacity>
        ) : (
          <Text style={styles.dim}>{t({ en: 'The end.', zh: '完。' })}</Text>
        )}
      </View>

      {/* 解锁弹层(进入未解锁集) */}
      <Modal visible={pendingEpisode != null} transparent animationType="fade" onRequestClose={() => setPendingEpisode(null)}>
        <View style={styles.backdrop}>
          <View style={styles.sheet}>
            <Text style={styles.sheetTitle}>🔒 {pendingMeta?.title ?? t({ en: 'Unlock episode', zh: '解锁本集' })}</Text>
            <Text style={styles.sheetDesc}>
              {t({
                en: `Unlock with ${pendingMeta?.unlockCostAxp ?? 0} AXP to keep watching. Server-authoritative.`,
                zh: `用 ${pendingMeta?.unlockCostAxp ?? 0} AXP 解锁后续剧情(服务端权威结算)。`,
              })}
            </Text>
            <TouchableOpacity style={[styles.unlockBtn, busy && styles.btnDisabled]} disabled={busy} onPress={doUnlock} testID="drama-unlock-confirm">
              <Text style={styles.unlockText}>
                {busy ? '…' : t({ en: `Unlock · ${pendingMeta?.unlockCostAxp ?? 0} AXP`, zh: `解锁 · ${pendingMeta?.unlockCostAxp ?? 0} AXP` })}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.cancelBtn} onPress={() => { setPendingEpisode(null); setPendingTargetId(null); }}>
              <Text style={styles.cancelText}>{t({ en: 'Maybe later', zh: '以后再说' })}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* 打赏弹层 */}
      <Modal visible={tipOpen} transparent animationType="fade" onRequestClose={() => setTipOpen(false)}>
        <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={() => setTipOpen(false)}>
          <View style={styles.sheet} onStartShouldSetResponder={() => true}>
            <Text style={styles.sheetTitle}>🎁 {t({ en: 'Tip the creator', zh: '打赏作者' })}</Text>
            <View style={styles.tipAmounts}>
              {[10, 50, 100, 500].map((a) => (
                <TouchableOpacity key={a} style={styles.tipAmtBtn} onPress={() => doTip(a)} testID={`drama-tip-${a}`}>
                  <Text style={styles.tipAmtText}>{a}</Text>
                  <Text style={styles.tipAmtUnit}>AXP</Text>
                </TouchableOpacity>
              ))}
            </View>
            <TouchableOpacity style={styles.cancelBtn} onPress={() => setTipOpen(false)}>
              <Text style={styles.cancelText}>{t({ en: 'Cancel', zh: '取消' })}</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

const styles = themedStyles(() => StyleSheet.create({
  container: { flex: 1, overflow: 'hidden' },
  bgFill: { ...StyleSheet.absoluteFillObject },
  bgImageScrim: { backgroundColor: 'rgba(0,0,0,0.38)' },
  bgHalf: { flex: 1 },
  bgEmoji: { position: 'absolute', alignSelf: 'center', top: '22%', fontSize: 120, opacity: 0.18 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  dim: { color: 'rgba(255,255,255,0.6)', fontSize: 13, textAlign: 'center' },

  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 14 },
  epPill: { backgroundColor: 'rgba(0,0,0,0.45)', borderRadius: 14, paddingHorizontal: 12, paddingVertical: 6 },
  epPillText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  topBtns: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  iconBtn: { backgroundColor: 'rgba(0,0,0,0.45)', borderRadius: 14, paddingHorizontal: 10, paddingVertical: 6 },
  iconBtnText: { fontSize: 14 },
  tipBtn: { backgroundColor: 'rgba(0,0,0,0.45)', borderRadius: 14, paddingHorizontal: 12, paddingVertical: 6 },
  tipBtnText: { color: '#ffd98a', fontSize: 12, fontWeight: '700' },

  summonBtn: { alignSelf: 'flex-start', marginTop: 14, backgroundColor: 'rgba(127,224,255,0.16)', borderColor: '#7fe0ff', borderWidth: 1, borderRadius: 16, paddingHorizontal: 14, paddingVertical: 8 },
  summonText: { color: '#7fe0ff', fontSize: 13, fontWeight: '700' },

  body: { flex: 1, marginTop: 8 },
  bodyContent: { flexGrow: 1, justifyContent: 'flex-end', paddingHorizontal: 20, paddingBottom: 12 },
  speaker: { color: '#7fe0ff', fontSize: 14, fontWeight: '800', marginBottom: 8 },
  line: {
    color: '#fff', fontSize: 21, lineHeight: 31, fontWeight: '600',
    textShadowColor: 'rgba(0,0,0,0.6)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 6,
  },

  notice: { marginHorizontal: 16, marginBottom: 8, backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10 },
  noticeText: { color: '#ffd98a', fontSize: 13, textAlign: 'center' },

  controls: { paddingHorizontal: 16, paddingBottom: 24, gap: 10 },
  choiceBtn: {
    backgroundColor: 'rgba(91,140,255,0.92)', borderRadius: 14, paddingVertical: 15, paddingHorizontal: 16,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.25)',
  },
  choiceText: { color: '#fff', fontSize: 16, fontWeight: '700', textAlign: 'center' },
  nextBtn: { backgroundColor: 'rgba(255,255,255,0.16)', borderRadius: 14, paddingVertical: 15 },
  nextText: { color: '#fff', fontSize: 16, fontWeight: '700', textAlign: 'center' },
  restartBtn: { backgroundColor: 'rgba(255,255,255,0.16)', borderRadius: 14, paddingVertical: 15 },
  restartText: { color: '#fff', fontSize: 16, fontWeight: '700', textAlign: 'center' },

  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: colors.bgCard, borderTopLeftRadius: 18, borderTopRightRadius: 18, padding: 20, gap: 12 },
  sheetTitle: { color: colors.textPrimary, fontSize: 18, fontWeight: '800' },
  sheetDesc: { color: colors.textMuted, fontSize: 13, lineHeight: 19 },
  unlockBtn: { backgroundColor: colors.accent, borderRadius: 12, paddingVertical: 15, alignItems: 'center' },
  unlockText: { color: '#fff', fontSize: 16, fontWeight: '800' },
  btnDisabled: { opacity: 0.5 },
  cancelBtn: { paddingVertical: 12, alignItems: 'center' },
  cancelText: { color: colors.textMuted, fontSize: 14, fontWeight: '600' },
  tipAmounts: { flexDirection: 'row', justifyContent: 'space-between', gap: 10 },
  tipAmtBtn: { flex: 1, backgroundColor: colors.bgPrimary, borderRadius: 12, paddingVertical: 14, alignItems: 'center', borderWidth: 1, borderColor: colors.border },
  tipAmtText: { color: colors.textPrimary, fontSize: 18, fontWeight: '800' },
  tipAmtUnit: { color: colors.textMuted, fontSize: 11, marginTop: 2 },
}));
