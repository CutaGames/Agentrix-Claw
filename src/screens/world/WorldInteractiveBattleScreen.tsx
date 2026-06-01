/**
 * WorldInteractiveBattleScreen — 🎮 玩家决策战斗 (Phase B)。
 *
 * design: docs/WORLD_ENGINE_X_AGENTRIX_ABILITY_BINDING_DESIGN_2026-05-29 §3 支柱3。
 *
 * 逐回合决策:每回合玩家从 攻击/蓄力/防御 三选一(攻击可选技能),服务器权威结算
 * (防守方 AI 由 seed 派生),返回本回合明细 + 新局面。资源层:行动力(energy)/充能(charge)。
 *
 * 与"快速对战"(WorldBattleArena 自动结算)并存,这里是有操作感的策略层。
 */
import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
  Platform,
  Image,
} from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import {
  startInteractiveBattle,
  startTrainingBattle,
  stepInteractiveBattle,
  type InteractiveBattleState,
  type InteractiveRound,
  type BattleDecision,
  type BattleActionType,
} from '../../services/worldEngineApi';
import { PetSpriteImage } from '../../components/PetSpriteImage';
import { useActivePet } from '../../services/activePet.service';

interface RouteParams {
  challengerAssetId: string;
  defenderAssetId: string;
  /** 训练模式: 战斗已由 /train 创建好, 直接用这个 id 不再 start */
  preStartedBattleId?: string;
  training?: boolean;
  /** UGC 玩法分享码:用"我的玩法"开打时透传,后端据此应用自定义规则。 */
  ruleSetShareCode?: string;
  ruleSetName?: string;
  /** 真实身份(头像/名字), 避免写死的 🦊/👹。 */
  challengerName?: string;
  challengerPortraitUrl?: string | null;
  defenderName?: string;
  defenderPortraitUrl?: string | null;
}

const ENERGY_MAX = 3;
const CHARGE_MAX = 3;

export default function WorldInteractiveBattleScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<RouteProp<{ p: RouteParams }, 'p'>>();
  const {
    challengerAssetId,
    defenderAssetId,
    training,
    ruleSetShareCode,
    ruleSetName,
    challengerName,
    challengerPortraitUrl,
    defenderName,
    defenderPortraitUrl,
  } = route.params;
  const activePet = useActivePet();

  const [battleId, setBattleId] = useState<string | null>(null);
  const [state, setState] = useState<InteractiveBattleState | null>(null);
  const [skills, setSkills] = useState<{ name: string; damageBase?: number }[]>([]);
  const [log, setLog] = useState<InteractiveRound[]>([]);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ winnerSide: string; xpAwarded: { challenger: number; defender: number } } | null>(null);
  const [skillPickerOpen, setSkillPickerOpen] = useState(false);
  // 首次进入展示玩法教程(怎么玩)。
  const [showHelp, setShowHelp] = useState(false);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires, global-require
        const AsyncStorage = require('@react-native-async-storage/async-storage').default;
        const seen = await AsyncStorage.getItem('agentrix_battle_tutorial_seen_v1');
        if (!cancelled && !seen) setShowHelp(true);
      } catch {
        /* best-effort: show help if storage unavailable */
        if (!cancelled) setShowHelp(true);
      }
    })();
    return () => { cancelled = true; };
  }, []);
  const dismissHelp = useCallback(() => {
    setShowHelp(false);
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires, global-require
      const AsyncStorage = require('@react-native-async-storage/async-storage').default;
      AsyncStorage.setItem('agentrix_battle_tutorial_seen_v1', '1').catch(() => {});
    } catch {
      /* ignore */
    }
  }, []);

  // 开局
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = training
          ? await startTrainingBattle({ challengerAssetId, difficulty: 'normal', ruleSetShareCode })
          : await startInteractiveBattle({ challengerAssetId, defenderAssetId, ruleSetShareCode });
        if (cancelled) return;
        setBattleId(r.battleId);
        setState(r.state);
        // 取攻击型技能;若一个都没有,给一个"基础攻击"兜底,保证选技能面板不空、能出招。
        const offensive = r.challengerSkills.filter((s) => (s.damageBase ?? 0) > 0);
        setSkills(offensive.length > 0 ? offensive : [{ name: '基础攻击', damageBase: 10 }]);
      } catch (e: any) {
        if (!cancelled) setError(e?.message || '开始战斗失败');
      } finally {
        if (!cancelled) setBusy(false);
      }
    })();
    return () => { cancelled = true; };
  }, [challengerAssetId, defenderAssetId, training, ruleSetShareCode]);

  const submit = useCallback(
    async (decision: BattleDecision) => {
      if (!battleId || busy || state?.status === 'completed') return;
      setBusy(true);
      setSkillPickerOpen(false);
      setError(null);
      try {
        const r = await stepInteractiveBattle(battleId, decision);
        setState(r.state);
        setLog((prev) => [r.round, ...prev]);
        if (r.result) {
          setResult({ winnerSide: r.result.winnerSide, xpAwarded: r.result.xpAwarded });
        }
      } catch (e: any) {
        setError(e?.message || '出招失败,请重试');
      } finally {
        setBusy(false);
      }
    },
    [battleId, busy, state],
  );

  const onAction = useCallback(
    (action: BattleActionType) => {
      if (action === 'attack') {
        if (skills.length > 1) {
          setSkillPickerOpen(true);
          return;
        }
        submit({ action: 'attack', skillIndex: 0 });
      } else {
        submit({ action });
      }
    },
    [skills, submit],
  );

  if (busy && !state) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color="#6c5ce7" />
        <Text style={styles.loadingText}>正在布置战场…</Text>
      </View>
    );
  }

  if (error && !state) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>{error}</Text>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Text style={styles.backBtnText}>返回</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const c = state?.challenger;
  const d = state?.defender;
  const ended = state?.status === 'completed';
  const playerWon = result?.winnerSide === 'challenger';

  return (
    <View style={styles.container}>
      <View style={styles.titleRow}>
        <Text style={styles.title}>🎮 决策对战 · 第 {state?.round ?? 0} 回合</Text>
        {ruleSetName ? <Text style={styles.rulesetTag} numberOfLines={1}>玩法「{ruleSetName}」</Text> : null}
        <TouchableOpacity style={styles.helpBtn} onPress={() => setShowHelp(true)} testID="battle-help-btn">
          <Text style={styles.helpBtnText}>怎么玩?</Text>
        </TouchableOpacity>
      </View>

      {/* 双方状态 */}
      <View style={styles.combatants}>
        <Combatant
          label={challengerName || '你的角色'}
          portraitUrl={challengerPortraitUrl}
          spriteClan={activePet.clan}
          fallbackEmoji="🦊"
          hp={c?.hp ?? 0}
          energy={c?.energy ?? 0}
          charge={c?.charge ?? 0}
          defending={c?.defending}
          side="me"
        />
        <Text style={styles.vs}>VS</Text>
        <Combatant
          label={defenderName || (training ? '训练假人' : '对手')}
          portraitUrl={defenderPortraitUrl}
          fallbackEmoji={training ? '🥋' : '👹'}
          hp={d?.hp ?? 0}
          energy={d?.energy ?? 0}
          charge={d?.charge ?? 0}
          defending={d?.defending}
          side="foe"
        />
      </View>

      {/* 出招/网络错误提示 — 之前 setError 后只在 (error && !state) 时显示,
          战斗中永远不显示, 导致"点了攻击下面空的"。现在战斗中也显示可重试横幅。 */}
      {error && state && !ended ? (
        <View style={styles.errorBanner}>
          <Text style={styles.errorBannerText}>⚠️ {error}</Text>
          <TouchableOpacity onPress={() => setError(null)}>
            <Text style={styles.errorBannerDismiss}>知道了</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {/* 结果 */}
      {ended ? (
        <View style={[styles.resultBox, playerWon ? styles.resultWin : styles.resultLose]}>
          <Text style={styles.resultTitle}>{playerWon ? '🎉 胜利!' : '💀 落败'}</Text>
          {result ? (
            <Text style={styles.resultXp}>
              你的角色获得 {result.xpAwarded.challenger} XP
            </Text>
          ) : null}
          <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
            <Text style={styles.backBtnText}>返回</Text>
          </TouchableOpacity>
        </View>
      ) : skillPickerOpen ? (
        /* 技能选择 */
        <View style={styles.actionBar}>
          <Text style={styles.skillPickHint}>选择技能</Text>
          <View style={styles.skillRow}>
            {skills.map((s, i) => (
              <TouchableOpacity key={i} style={styles.skillBtn} onPress={() => submit({ action: 'attack', skillIndex: i })}>
                <Text style={styles.skillBtnText} numberOfLines={1}>{s.name}</Text>
                <Text style={styles.skillBtnDmg}>⚔ {s.damageBase}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <TouchableOpacity onPress={() => setSkillPickerOpen(false)}>
            <Text style={styles.cancelText}>取消</Text>
          </TouchableOpacity>
        </View>
      ) : (
        /* 决策按钮 */
        <View style={styles.actionBar}>
          <ActionButton emoji="⚔️" label="攻击" hint={skills.length > 1 ? '选技能' : '消耗1行动力'} disabled={busy || (c?.energy ?? 0) < 1} onPress={() => onAction('attack')} />
          <ActionButton emoji="🔋" label="蓄力" hint="下次+60%伤害" disabled={busy} onPress={() => onAction('charge')} />
          <ActionButton emoji="🛡️" label="防御" hint="减伤50%+反弹" disabled={busy} onPress={() => onAction('defend')} />
        </View>
      )}

      {/* 回合日志 */}
      <Text style={styles.logHeader}>战斗记录</Text>
      <ScrollView style={styles.logScroll} contentContainerStyle={{ paddingBottom: 24 }}>
        {log.length === 0 ? (
          <Text style={styles.logEmpty}>选择一个行动开始战斗</Text>
        ) : (
          log.map((r) => (
            <View key={r.round} style={styles.logRow}>
              <Text style={styles.logRound}>R{r.round}</Text>
              <Text style={styles.logText}>
                你 {actionLabel(r.challengerAction)}
                {r.challengerDamageDealt > 0 ? ` → ${r.challengerDamageDealt}${r.challengerCrit ? ' 暴击!' : ''}` : ''}
                {'  ·  '}对手 {actionLabel(r.defenderAction)}
                {r.defenderDamageDealt > 0 ? ` → ${r.defenderDamageDealt}${r.defenderCrit ? ' 暴击!' : ''}` : ''}
              </Text>
            </View>
          ))
        )}
      </ScrollView>

      {/* 首次玩法教程 / 怎么玩 */}
      {showHelp ? (
        <View style={styles.helpOverlay}>
          <View style={styles.helpCard}>
            <Text style={styles.helpTitle}>🎮 怎么玩决策对战</Text>
            <Text style={styles.helpLine}>每回合从三个行动里选一个,目标是把对手的 HP 打到 0:</Text>
            <View style={styles.helpItem}>
              <Text style={styles.helpItemEmoji}>⚔️</Text>
              <Text style={styles.helpItemText}><Text style={styles.helpBold}>攻击</Text> — 消耗 1 行动力造成伤害。技能多时可选技能。</Text>
            </View>
            <View style={styles.helpItem}>
              <Text style={styles.helpItemEmoji}>🔋</Text>
              <Text style={styles.helpItemText}><Text style={styles.helpBold}>蓄力</Text> — 回满行动力,并让下次攻击 +60% 伤害。</Text>
            </View>
            <View style={styles.helpItem}>
              <Text style={styles.helpItemEmoji}>🛡️</Text>
              <Text style={styles.helpItemText}><Text style={styles.helpBold}>防御</Text> — 本回合减伤 50% 并反弹部分伤害。</Text>
            </View>
            <Text style={styles.helpTip}>💡 没行动力了就先蓄力;血量低就防御。胜利可获得 XP 升级你的角色。</Text>
            <TouchableOpacity style={styles.helpOkBtn} onPress={dismissHelp} testID="battle-help-ok">
              <Text style={styles.helpOkText}>开始战斗</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : null}
    </View>
  );
}

function actionLabel(a: BattleActionType): string {
  return a === 'attack' ? '攻击' : a === 'charge' ? '蓄力' : '防御';
}

function Combatant({ label, portraitUrl, spriteClan, fallbackEmoji, hp, energy, charge, defending, side }: {
  label: string; portraitUrl?: string | null; spriteClan?: 'A' | 'B' | 'C' | 'D' | 'E' | 'F'; fallbackEmoji: string; hp: number; energy: number; charge: number; defending?: boolean; side: 'me' | 'foe';
}) {
  return (
    <View style={styles.combatant}>
      <View style={styles.combatantAvatar}>
        {portraitUrl ? (
          <Image source={{ uri: portraitUrl }} style={styles.combatantImg} resizeMode="cover" />
        ) : spriteClan ? (
          <PetSpriteImage sprite="idle" size={56} clan={spriteClan} />
        ) : (
          <Text style={styles.combatantEmoji}>{fallbackEmoji}</Text>
        )}
        {defending ? <Text style={styles.combatantShield}>🛡️</Text> : null}
      </View>
      <Text style={styles.combatantLabel} numberOfLines={1}>{label}</Text>
      <Text style={styles.hpText}>HP {hp}</Text>
      <View style={styles.pips}>
        {Array.from({ length: ENERGY_MAX }).map((_, i) => (
          <View key={`e${i}`} style={[styles.pip, i < energy ? styles.pipEnergy : styles.pipEmpty]} />
        ))}
      </View>
      <View style={styles.pips}>
        {Array.from({ length: CHARGE_MAX }).map((_, i) => (
          <View key={`c${i}`} style={[styles.pip, i < charge ? styles.pipCharge : styles.pipEmpty]} />
        ))}
      </View>
    </View>
  );
}

function ActionButton({ emoji, label, hint, disabled, onPress }: {
  emoji: string; label: string; hint: string; disabled?: boolean; onPress: () => void;
}) {
  return (
    <TouchableOpacity style={[styles.actionBtn, disabled && { opacity: 0.4 }]} onPress={onPress} disabled={disabled}>
      <Text style={styles.actionEmoji}>{emoji}</Text>
      <Text style={styles.actionLabel}>{label}</Text>
      <Text style={styles.actionHint}>{hint}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a0a', paddingHorizontal: 16, paddingTop: Platform.OS === 'ios' ? 60 : 28 },
  center: { flex: 1, backgroundColor: '#0a0a0a', alignItems: 'center', justifyContent: 'center' },
  loadingText: { color: '#888', marginTop: 12 },
  errorText: { color: '#ef4444', fontSize: 14, marginBottom: 16, textAlign: 'center', paddingHorizontal: 32 },
  errorBanner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: 'rgba(239,68,68,0.12)', borderColor: 'rgba(239,68,68,0.4)', borderWidth: 1, borderRadius: 12, padding: 12, marginBottom: 12 },
  errorBannerText: { color: '#fca5a5', fontSize: 13, flex: 1 },
  errorBannerDismiss: { color: '#fca5a5', fontSize: 13, fontWeight: '700', marginLeft: 12 },
  title: { color: '#fff', fontSize: 18, fontWeight: '700', marginBottom: 16, textAlign: 'center' },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  rulesetTag: { color: '#a78bfa', fontSize: 11, marginLeft: 8, maxWidth: 120 },
  helpBtn: { marginLeft: 8, backgroundColor: '#2d2d44', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10 },
  helpBtnText: { color: '#bcaaff', fontSize: 12, fontWeight: '600' },
  helpOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.8)', alignItems: 'center', justifyContent: 'center', padding: 24 },
  helpCard: { backgroundColor: '#1a1a2e', borderRadius: 18, padding: 22, width: '100%', maxWidth: 380, borderWidth: 1, borderColor: '#6c5ce7' },
  helpTitle: { color: '#fff', fontSize: 18, fontWeight: '800', marginBottom: 12, textAlign: 'center' },
  helpLine: { color: '#ccc', fontSize: 13, marginBottom: 12, lineHeight: 19 },
  helpItem: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 10 },
  helpItemEmoji: { fontSize: 22, marginRight: 10, width: 28, textAlign: 'center' },
  helpItemText: { color: '#ddd', fontSize: 13, flex: 1, lineHeight: 19 },
  helpBold: { color: '#fff', fontWeight: '700' },
  helpTip: { color: '#9aa', fontSize: 12, marginTop: 6, marginBottom: 16, lineHeight: 18 },
  helpOkBtn: { backgroundColor: '#6c5ce7', paddingVertical: 14, borderRadius: 12, alignItems: 'center' },
  helpOkText: { color: '#fff', fontSize: 15, fontWeight: '700' },

  combatants: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 },
  combatant: { flex: 1, alignItems: 'center', backgroundColor: '#1a1a2e', borderRadius: 14, padding: 12 },
  combatantAvatar: { width: 56, height: 56, alignItems: 'center', justifyContent: 'center' },
  combatantImg: { width: 56, height: 56, borderRadius: 12 },
  combatantShield: { position: 'absolute', right: -4, bottom: -4, fontSize: 18 },
  combatantEmoji: { fontSize: 36 },
  combatantLabel: { color: '#aaa', fontSize: 12, marginTop: 2 },
  hpText: { color: '#fff', fontSize: 15, fontWeight: '700', marginTop: 4 },
  pips: { flexDirection: 'row', gap: 4, marginTop: 6 },
  pip: { width: 14, height: 6, borderRadius: 3 },
  pipEnergy: { backgroundColor: '#3b82f6' },
  pipCharge: { backgroundColor: '#f59e0b' },
  pipEmpty: { backgroundColor: '#2d2d44' },
  vs: { color: '#fff', fontSize: 16, fontWeight: '900', marginHorizontal: 10 },

  actionBar: { flexDirection: 'row', gap: 10, marginBottom: 20, minHeight: 96 },
  actionBtn: { flex: 1, backgroundColor: '#6c5ce7', borderRadius: 14, padding: 12, alignItems: 'center', justifyContent: 'center' },
  actionEmoji: { fontSize: 26 },
  actionLabel: { color: '#fff', fontSize: 15, fontWeight: '700', marginTop: 4 },
  actionHint: { color: 'rgba(255,255,255,0.7)', fontSize: 10, marginTop: 2, textAlign: 'center' },

  skillPickHint: { color: '#aaa', fontSize: 12, marginBottom: 8, width: '100%' },
  skillRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, flex: 1 },
  skillBtn: { backgroundColor: '#2d2d44', borderRadius: 10, paddingVertical: 10, paddingHorizontal: 14, alignItems: 'center', minWidth: 90 },
  skillBtnText: { color: '#fff', fontSize: 13, fontWeight: '600' },
  skillBtnDmg: { color: '#f59e0b', fontSize: 11, marginTop: 2 },
  cancelText: { color: '#888', fontSize: 13, alignSelf: 'center', marginTop: 8 },

  resultBox: { borderRadius: 16, padding: 24, alignItems: 'center', marginBottom: 20, borderWidth: 1 },
  resultWin: { backgroundColor: 'rgba(34,197,94,0.12)', borderColor: 'rgba(34,197,94,0.4)' },
  resultLose: { backgroundColor: 'rgba(239,68,68,0.12)', borderColor: 'rgba(239,68,68,0.4)' },
  resultTitle: { color: '#fff', fontSize: 24, fontWeight: '800', marginBottom: 8 },
  resultXp: { color: '#a78bfa', fontSize: 14, marginBottom: 16 },
  backBtn: { backgroundColor: '#6c5ce7', borderRadius: 12, paddingVertical: 12, paddingHorizontal: 32, marginTop: 8 },
  backBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },

  logHeader: { color: '#aaa', fontSize: 12, fontWeight: '600', marginBottom: 8 },
  logScroll: { flex: 1 },
  logEmpty: { color: '#555', fontSize: 13, textAlign: 'center', paddingVertical: 24 },
  logRow: { flexDirection: 'row', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: '#1a1a2e' },
  logRound: { color: '#6c5ce7', fontSize: 12, fontWeight: '700', width: 32 },
  logText: { color: '#ccc', fontSize: 12, flex: 1, lineHeight: 17 },
});
