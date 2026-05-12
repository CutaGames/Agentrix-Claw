/**
 * SoulPickerScreen — 移动端灵魂切换（Phase 1 W2 · MB-2.1）
 *
 * 与桌面 SoulPicker 形态对齐：
 *   - 6 族群 Tab（A 已开放，B-F 锁定）
 *   - 卡片网格
 *   - 调用 mobilePetSdk.switchSoul
 */
import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
  Alert,
} from 'react-native';
import {
  type PetClan,
  type PetSoulSummary,
  listSouls,
  switchSoul,
  getPetState,
} from '../../services/mobilePetSdk';
import { colors } from '../../theme/colors';

const CLANS: Array<{ id: PetClan; label: string; emoji: string; locked?: boolean }> = [
  { id: 'A_office', label: '效率派', emoji: '🦾' },
  { id: 'B_life', label: '生活家', emoji: '🍳' },
  { id: 'C_learn', label: '学习圈', emoji: '📚' },
  { id: 'D_play', label: '娱乐部', emoji: '🎮' },
  { id: 'E_web3', label: 'Web3', emoji: '💎' },
  { id: 'F_family', label: '家有萌宠', emoji: '🏡' },
];

const SOUL_EMOJI: Record<string, string> = {
  claw: '🦾',
  tinker: '🛠️',
  sentry: '🛡️',
  hawk: '📊',
  owl: '🦉',
  fox: '🦊',
  dragon: '🐉',
};

export function SoulPickerScreen() {
  const [clan, setClan] = useState<PetClan>('A_office');
  const [souls, setSouls] = useState<PetSoulSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [switching, setSwitching] = useState<string | null>(null);
  const [activeSoul, setActiveSoul] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async (target: PetClan) => {
    setLoading(true);
    setError(null);
    try {
      const list = await listSouls({ clan: target });
      setSouls(list);
    } catch (err: any) {
      const message = err?.message || String(err);
      setError(message);
      Alert.alert('加载失败', message);
      setSouls([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh(clan);
  }, [clan, refresh]);

  useEffect(() => {
    getPetState()
      .then((st) => setActiveSoul(st.soul_template_id ?? null))
      .catch(() => undefined);
  }, []);

  const onPick = useCallback(
    async (id: string) => {
      if (switching || activeSoul === id) return;
      setSwitching(id);
      setError(null);
      try {
        const next = await switchSoul(id);
        setActiveSoul(next.soul_template_id ?? id);
      } catch (err: any) {
        const message = err?.message || String(err);
        setError(message);
        Alert.alert('切换失败', message);
      } finally {
        setSwitching(null);
      }
    },
    [switching, activeSoul],
  );

  return (
    <View testID="pet-soul-screen" style={styles.root}>
      <View style={styles.header}>
        <Text style={styles.title}>选择灵魂</Text>
        <Text style={styles.subtitle}>灵魂决定性格；皮肤可随时换装。切换不丢亲密度与记忆。</Text>
      </View>

      {error ? (
        <View testID="pet-soul-error" style={styles.errorBanner}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : null}

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.tabsRow}
      >
        {CLANS.map((c) => {
          const active = c.id === clan;
          return (
            <Pressable
              key={c.id}
              testID={`pet-soul-tab-${c.id}`}
              onPress={() => !c.locked && setClan(c.id)}
              style={[styles.tab, active && styles.tabActive, c.locked && styles.tabLocked]}
            >
              <Text style={[styles.tabText, active && styles.tabTextActive]}>
                {c.emoji} {c.label}
                {c.locked ? ' 🔒' : ''}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      <ScrollView contentContainerStyle={styles.grid}>
        {loading && souls.length === 0 ? (
          <ActivityIndicator color={colors.accent} style={{ marginTop: 32 }} />
        ) : souls.length === 0 ? (
          <Text style={styles.empty}>该族群暂无灵魂</Text>
        ) : (
          souls.map((s) => {
            const isActive = activeSoul === s.id;
            const isBusy = switching === s.id;
            return (
              <View key={s.id} testID={`pet-soul-card-${s.id}`} style={[styles.card, isActive && styles.cardActive]}>
                <View style={styles.cardHead}>
                  <Text style={styles.avatar}>{SOUL_EMOJI[s.id] ?? '🐾'}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.name}>
                      {s.display_name}
                      <Text style={styles.tier}> · {s.tier}</Text>
                    </Text>
                    <Text style={styles.archetype}>{s.archetype}</Text>
                  </View>
                </View>
                <Text style={styles.tagline} numberOfLines={2}>
                  {s.tagline}
                </Text>
                <Pressable
                  testID={`pet-soul-switch-${s.id}`}
                  disabled={isActive || isBusy}
                  onPress={() => onPick(s.id)}
                  style={[styles.btn, isActive && styles.btnActive]}
                >
                  <Text style={[styles.btnText, isActive && styles.btnTextActive]}>
                    {isActive ? '✓ 当前灵魂' : isBusy ? '切换中…' : '选这只'}
                  </Text>
                </Pressable>
              </View>
            );
          })
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background ?? '#0b0b13' },
  header: { padding: 16, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.08)' },
  title: { fontSize: 18, fontWeight: '600', color: colors.text ?? '#fff' },
  subtitle: { fontSize: 12, color: 'rgba(255,255,255,0.6)', marginTop: 4 },
  errorBanner: {
    marginHorizontal: 12,
    marginTop: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: 'rgba(127,29,29,0.32)',
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.35)',
  },
  errorText: { color: '#fecaca', fontSize: 12, lineHeight: 18 },
  tabsRow: { paddingHorizontal: 12, paddingVertical: 10, gap: 8 },
  tab: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.06)',
    marginRight: 8,
  },
  tabActive: { backgroundColor: 'rgba(16,185,129,0.2)' },
  tabLocked: { opacity: 0.5 },
  tabText: { color: 'rgba(255,255,255,0.7)', fontSize: 12 },
  tabTextActive: { color: '#6ee7b7' },
  grid: { padding: 12, gap: 12 },
  empty: { color: 'rgba(255,255,255,0.5)', textAlign: 'center', marginTop: 32 },
  card: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderColor: 'rgba(255,255,255,0.1)',
    borderWidth: 1,
    borderRadius: 14,
    padding: 12,
    marginBottom: 12,
  },
  cardActive: {
    borderColor: 'rgba(16,185,129,0.6)',
    backgroundColor: 'rgba(16,185,129,0.08)',
  },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 8 },
  avatar: { fontSize: 32, marginRight: 12 },
  name: { color: '#fff', fontSize: 14, fontWeight: '600' },
  tier: { color: 'rgba(255,255,255,0.5)', fontSize: 11, fontWeight: '400' },
  archetype: { color: 'rgba(255,255,255,0.6)', fontSize: 12 },
  tagline: { color: 'rgba(255,255,255,0.7)', fontSize: 12, lineHeight: 18, marginBottom: 10 },
  btn: {
    backgroundColor: '#10b981',
    borderRadius: 8,
    paddingVertical: 8,
    alignItems: 'center',
  },
  btnActive: { backgroundColor: 'rgba(16,185,129,0.3)' },
  btnText: { color: '#000', fontSize: 13, fontWeight: '600' },
  btnTextActive: { color: '#6ee7b7' },
});

export default SoulPickerScreen;
