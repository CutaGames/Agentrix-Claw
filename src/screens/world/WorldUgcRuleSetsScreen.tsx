/**
 * WorldUgcRuleSetsScreen — 🛠️ UGC 游戏规则集 (Phase D, 二期)。
 *
 * design: docs/WORLD_ENGINE_X_AGENTRIX_ABILITY_BINDING_DESIGN_2026-05-29 Phase D。
 *
 * 让玩家用自己的角色做可分享的自定义挑战:创建规则集(回合上限/伤害倍率/胜利条件) →
 * 拿到 shareCode 分享给好友 → 好友加载游玩。本屏:我的规则集列表 + 快速创建 + 分享码。
 */
import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  RefreshControl,
  Alert,
  Share,
  Platform,
} from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { colors } from '../../theme/colors';
import { useI18n } from '../../stores/i18nStore';
import {
  listMyRuleSets,
  createRuleSet,
  deleteRuleSet,
  type WorldGameRuleSet,
} from '../../services/worldEngineApi';

const DMG_PRESETS = [
  { label: '标准', value: 1.0 },
  { label: '高伤', value: 1.5 },
  { label: '狂暴', value: 2.0 },
];
const ROUNDS_PRESETS = [10, 20, 30];

export function WorldUgcRuleSetsScreen() {
  const { t } = useI18n();
  const queryClient = useQueryClient();

  const [name, setName] = useState('');
  const [dmg, setDmg] = useState(1.0);
  const [maxRounds, setMaxRounds] = useState(20);
  const [creating, setCreating] = useState(false);

  const q = useQuery({
    queryKey: ['ugc-rulesets'],
    queryFn: listMyRuleSets,
    staleTime: 30_000,
  });
  const items = q.data?.items ?? [];

  const onCreate = useCallback(async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      Alert.alert('需要名称', '给你的玩法起个名字');
      return;
    }
    setCreating(true);
    try {
      await createRuleSet({
        name: trimmed,
        rules: { damageMultiplier: dmg, maxRounds, critEnabled: true, winCondition: 'ko' },
      });
      setName('');
      queryClient.invalidateQueries({ queryKey: ['ugc-rulesets'] });
    } catch (e: any) {
      Alert.alert('创建失败', e?.message || '请稍后再试');
    } finally {
      setCreating(false);
    }
  }, [name, dmg, maxRounds, queryClient]);

  const onShare = useCallback(async (rs: WorldGameRuleSet) => {
    try {
      await Share.share({
        message: `来挑战我的玩法「${rs.name}」!分享码:${rs.shareCode}\nagentrix://world-engine/ugc/${rs.shareCode}`,
      });
    } catch {
      // ignore
    }
  }, []);

  const onDelete = useCallback((rs: WorldGameRuleSet) => {
    Alert.alert('删除规则集', `确定删除「${rs.name}」?`, [
      { text: '取消', style: 'cancel' },
      {
        text: '删除',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteRuleSet(rs.id);
            queryClient.invalidateQueries({ queryKey: ['ugc-rulesets'] });
          } catch (e: any) {
            Alert.alert('删除失败', e?.message || '请稍后再试');
          }
        },
      },
    ]);
  }, [queryClient]);

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={q.isFetching} onRefresh={() => queryClient.invalidateQueries({ queryKey: ['ugc-rulesets'] })} tintColor={colors.primary} />}
    >
      <Text style={styles.title}>🛠️ {t({ en: 'My Game Modes', zh: '我的玩法' })}</Text>
      <Text style={styles.subtitle}>
        {t({ en: 'Design a custom challenge and share its code with friends.', zh: '设计自定义挑战,把分享码发给好友裂变。' })}
      </Text>

      {/* 创建器 */}
      <View style={styles.creator}>
        <TextInput
          style={styles.input}
          placeholder={t({ en: 'Mode name (e.g. Berserk Blitz)', zh: '玩法名称(如:狂暴速攻)' })}
          placeholderTextColor={colors.textMuted}
          value={name}
          onChangeText={setName}
          maxLength={40}
        />
        <Text style={styles.fieldLabel}>{t({ en: 'Damage', zh: '伤害倍率' })}</Text>
        <View style={styles.chipRow}>
          {DMG_PRESETS.map((p) => (
            <Chip key={p.value} label={p.label} active={dmg === p.value} onPress={() => setDmg(p.value)} />
          ))}
        </View>
        <Text style={styles.fieldLabel}>{t({ en: 'Max Rounds', zh: '回合上限' })}</Text>
        <View style={styles.chipRow}>
          {ROUNDS_PRESETS.map((r) => (
            <Chip key={r} label={`${r}`} active={maxRounds === r} onPress={() => setMaxRounds(r)} />
          ))}
        </View>
        <TouchableOpacity style={[styles.createBtn, creating && { opacity: 0.5 }]} onPress={onCreate} disabled={creating}>
          {creating ? <ActivityIndicator color="#fff" /> : <Text style={styles.createBtnText}>{t({ en: 'Create & get share code', zh: '创建并生成分享码' })}</Text>}
        </TouchableOpacity>
      </View>

      {/* 列表 */}
      <Text style={styles.sectionHeader}>{t({ en: 'My rule sets', zh: '我创建的' })}</Text>
      {q.isLoading ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: 20 }} />
      ) : items.length === 0 ? (
        <Text style={styles.empty}>{t({ en: 'No rule sets yet. Create one above.', zh: '还没有玩法,在上面创建一个吧。' })}</Text>
      ) : (
        items.map((rs) => (
          <View key={rs.id} style={styles.ruleCard}>
            <View style={{ flex: 1 }}>
              <Text style={styles.ruleName}>{rs.name}</Text>
              <Text style={styles.ruleMeta}>
                ⚔ x{rs.rules.damageMultiplier ?? 1} · {rs.rules.maxRounds ?? 20} 回合 · 🔥 {rs.playCount} 次游玩
              </Text>
              <Text style={styles.ruleCode}>分享码 {rs.shareCode}</Text>
            </View>
            <View style={styles.ruleActions}>
              <TouchableOpacity style={styles.shareBtn} onPress={() => onShare(rs)}>
                <Text style={styles.shareBtnText}>分享</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => onDelete(rs)}>
                <Text style={styles.deleteText}>删除</Text>
              </TouchableOpacity>
            </View>
          </View>
        ))
      )}
    </ScrollView>
  );
}

function Chip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity style={[styles.chip, active && styles.chipActive]} onPress={onPress}>
      <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgPrimary },
  content: { padding: 16, paddingTop: Platform.OS === 'ios' ? 60 : 28, paddingBottom: 80 },
  title: { fontSize: 22, fontWeight: '700', color: colors.textPrimary, marginBottom: 4 },
  subtitle: { fontSize: 13, color: colors.textMuted, marginBottom: 20 },

  creator: { backgroundColor: colors.bgCard, borderRadius: 14, borderWidth: 1, borderColor: colors.border, padding: 16, marginBottom: 24 },
  input: { backgroundColor: colors.bgPrimary, borderRadius: 10, borderWidth: 1, borderColor: colors.border, color: colors.textPrimary, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, marginBottom: 12 },
  fieldLabel: { color: colors.textSecondary, fontSize: 12, marginBottom: 6 },
  chipRow: { flexDirection: 'row', gap: 8, marginBottom: 14 },
  chip: { paddingVertical: 8, paddingHorizontal: 16, borderRadius: 20, backgroundColor: colors.bgPrimary, borderWidth: 1, borderColor: colors.border },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { color: colors.textSecondary, fontSize: 13 },
  chipTextActive: { color: '#fff', fontWeight: '700' },
  createBtn: { backgroundColor: colors.primary, borderRadius: 12, paddingVertical: 13, alignItems: 'center', marginTop: 4 },
  createBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },

  sectionHeader: { fontSize: 13, fontWeight: '600', color: colors.textSecondary, marginBottom: 10 },
  empty: { color: colors.textMuted, fontSize: 13, textAlign: 'center', paddingVertical: 24 },

  ruleCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.bgCard, borderRadius: 12, borderWidth: 1, borderColor: colors.border, padding: 14, marginBottom: 10 },
  ruleName: { color: colors.textPrimary, fontSize: 15, fontWeight: '700', marginBottom: 4 },
  ruleMeta: { color: colors.textMuted, fontSize: 12, marginBottom: 4 },
  ruleCode: { color: colors.accent, fontSize: 12, fontWeight: '600' },
  ruleActions: { alignItems: 'flex-end', gap: 8 },
  shareBtn: { backgroundColor: colors.primary, borderRadius: 8, paddingVertical: 6, paddingHorizontal: 16 },
  shareBtnText: { color: '#fff', fontSize: 13, fontWeight: '600' },
  deleteText: { color: '#ef4444', fontSize: 12 },
});

export default WorldUgcRuleSetsScreen;
