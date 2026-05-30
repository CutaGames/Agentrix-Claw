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
} from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import {
  startInteractiveBattle,
  stepInteractiveBattle,
  type InteractiveBattleState,
  type InteractiveRound,
  type BattleDecision,
  type BattleActionType,
} from '../../services/worldEngineApi';

interface RouteParams {
  challengerAssetId: string;
  defenderAssetId: string;
}

const ENERGY_MAX = 3;
const CHARGE_MAX = 3;

export default function WorldInteractiveBattleScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<RouteProp<{ p: RouteParams }, 'p'>>();
  const { challengerAssetId, defenderAssetId } = route.params;

  const [battleId, setBattleId] = useState<string | null>(null);
  const [state, setState] = useState<InteractiveBattleState | null>(null);
  const [skills, setSkills] = useState<{ name: string; damageBase?: number }[]>([]);
  const [log, setLog] = useState<InteractiveRound[]>([]);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ winnerSide: string; xpAwarded: { challenger: number; defender: number } } | null>(null);
  const [skillPickerOpen, setSkillPickerOpen] = useState(false);

  // 开局
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await startInteractiveBattle({ challengerAssetId, defenderAssetId });
        if (cancelled) return;
        setBattleId(r.battleId);
        setState(r.state);
        setSkills(r.challengerSkills.filter((s) => (s.damageBase ?? 0) > 0));
      } catch (e: any) {
        if (!cancelled) setError(e?.message || '开始战斗失败');
      } finally {
        if (!cancelled) setBusy(false);
      }
    })();
    return () => { cancelled = true; };
  }, [challengerAssetId, defenderAssetId]);

  const submit = useCallback(
    async (decision: BattleDecision) => {
      if (!battleId || busy || state?.status === 'completed') return;
      setBusy(true);
      setSkillPickerOpen(false);
      try {
        const r = await stepInteractiveBattle(battleId, decision);
        setState(r.state);
        setLog((prev) => [r.round, ...prev]);
        if (r.result) {
          setResult({ winnerSide: r.result.winnerSide, xpAwarded: r.result.xpAwarded });
        }
      } catch (e: any) {
        setError(e?.message || '出招失败');
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
      <Text style={styles.title}>🎮 决策对战 · 第 {state?.round ?? 0} 回合</Text>

      {/* 双方状态 */}
      <View style={styles.combatants}>
        <Combatant label="你" emoji="🦊" hp={c?.hp ?? 0} energy={c?.energy ?? 0} charge={c?.charge ?? 0} defending={c?.defending} side="me" />
        <Text style={styles.vs}>VS</Text>
        <Combatant label="对手" emoji="👹" hp={d?.hp ?? 0} energy={d?.energy ?? 0} charge={d?.charge ?? 0} defending={d?.defending} side="foe" />
      </View>

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
    </View>
  );
}

function actionLabel(a: BattleActionType): string {
  return a === 'attack' ? '攻击' : a === 'charge' ? '蓄力' : '防御';
}

function Combatant({ label, emoji, hp, energy, charge, defending, side }: {
  label: string; emoji: string; hp: number; energy: number; charge: number; defending?: boolean; side: 'me' | 'foe';
}) {
  return (
    <View style={styles.combatant}>
      <Text style={styles.combatantEmoji}>{emoji}{defending ? '🛡️' : ''}</Text>
      <Text style={styles.combatantLabel}>{label}</Text>
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
  title: { color: '#fff', fontSize: 18, fontWeight: '700', marginBottom: 16, textAlign: 'center' },

  combatants: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 },
  combatant: { flex: 1, alignItems: 'center', backgroundColor: '#1a1a2e', borderRadius: 14, padding: 12 },
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
