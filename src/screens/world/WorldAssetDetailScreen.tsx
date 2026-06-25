/**
 * WorldAssetDetailScreen — 世界资产详情 (P0 #1, 2026-06-01).
 *
 * 此前资产库点卡片只弹一个 Alert(TODO)。现在跳到真正的详情页:
 *   - 头图: 3D styledMesh 缩略 / 2D 立绘(扫描照片)兜底 + 生成状态条
 *   - 属性五维 (hp/atk/def/spd/int) 条形可视化
 *   - 技能列表(攻/防/辅)
 *   - 性格标签 + 背景故事
 *   - 战绩 (W/L) + 等级
 *   - 灵魂链接状态(是否已化身主宠)
 *   - 操作: ⚔ 去对战 / 🛒 上架出售 / 🦊 化身主宠 / ✏️ 重命名
 *
 * 全部走已有 worldEngineApi (getWorldAsset / getSoulStatus / incarnateAsset /
 * updateWorldAsset)。无 mock。
 */
import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  Alert,
  Modal,
  TextInput,
} from 'react-native';
import { useNavigation, useRoute, useFocusEffect, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import * as Haptics from 'expo-haptics';
import { colors } from '../../theme/colors';
import { useI18n } from '../../stores/i18nStore';
import {
  getWorldAsset,
  getSoulStatus,
  incarnateAsset,
  unincarnateAsset,
  updateWorldAsset,
  type WorldAssetSummary,
  type SoulStatusResponse,
  type GenerationStatus,
} from '../../services/worldEngineApi';
import type { WorldStackParamList } from '../../navigation/WorldStackNavigator';
import { themedStyles } from '../../theme/useTheme';

type Nav = NativeStackNavigationProp<WorldStackParamList, 'WorldAssetDetail'>;
type Rt = RouteProp<WorldStackParamList, 'WorldAssetDetail'>;

const STAT_META: { key: string; label: string; color: string }[] = [
  { key: 'hp', label: 'HP', color: '#22c55e' },
  { key: 'atk', label: 'ATK', color: '#ef4444' },
  { key: 'def', label: 'DEF', color: '#3b82f6' },
  { key: 'spd', label: 'SPD', color: '#eab308' },
  { key: 'int', label: 'INT', color: '#a855f7' },
];

const SKILL_TYPE_EMOJI: Record<string, string> = {
  offensive: '⚔️',
  defensive: '🛡️',
  utility: '✨',
};

export function WorldAssetDetailScreen() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<Rt>();
  const { t } = useI18n();
  const { assetId, assetName } = route.params;

  const [asset, setAsset] = useState<WorldAssetSummary | null>(null);
  const [soul, setSoul] = useState<SoulStatusResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const [renameDraft, setRenameDraft] = useState('');

  const load = useCallback(async () => {
    try {
      const [a, s] = await Promise.all([
        getWorldAsset(assetId),
        getSoulStatus(assetId).catch(() => null),
      ]);
      setAsset(a);
      setSoul(s);
    } catch (e: any) {
      Alert.alert(t({ en: 'Load failed', zh: '加载失败' }), e?.message || '');
    } finally {
      setLoading(false);
    }
  }, [assetId, t]);

  useEffect(() => {
    void load();
  }, [load]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const onBattle = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    // 战斗已退役(需求 11.1):原"对战"入口改为返回资产库。
    (navigation as any).navigate('WorldAssetInventory');
  }, [navigation, assetId]);

  const onListForSale = useCallback(() => {
    (navigation as any).navigate('WorldAssetListing', { assetId, assetName: asset?.name });
  }, [navigation, assetId, asset?.name]);

  const onIncarnate = useCallback(() => {
    if (!asset) return;
    const alreadyIncarnated = soul?.isActiveIncarnation;
    if (alreadyIncarnated) {
      Alert.alert(
        t({ en: 'Revert incarnation', zh: '解除化身' }),
        t({ en: 'Stop using this character as your main pet form?', zh: '不再用这个角色作为主宠的世界形态?' }),
        [
          { text: t({ en: 'Cancel', zh: '取消' }), style: 'cancel' },
          {
            text: t({ en: 'Revert', zh: '解除' }),
            onPress: async () => {
              try {
                setBusy(true);
                await unincarnateAsset(assetId);
                await load();
              } catch (e: any) {
                Alert.alert(t({ en: 'Failed', zh: '操作失败' }), e?.message || '');
              } finally {
                setBusy(false);
              }
            },
          },
        ],
      );
      return;
    }
    Alert.alert(
      t({ en: '🦊 Incarnate as main pet', zh: '🦊 化身主宠' }),
      t({
        en: `Make "${asset.name}" your main pet's world form? Its soul (intimacy / emotion / memory) carries over.`,
        zh: `把「${asset.name}」化身为你主宠的世界形态?灵魂(亲密度/情绪/记忆)会延续到这个角色上。`,
      }),
      [
        { text: t({ en: 'Cancel', zh: '取消' }), style: 'cancel' },
        {
          text: t({ en: 'Incarnate', zh: '化身' }),
          onPress: async () => {
            try {
              setBusy(true);
              const r = await incarnateAsset(assetId);
              await load();
              Alert.alert(
                t({ en: 'Incarnation done', zh: '化身成功' }),
                t({
                  en: `Your pet "${r.petName}" (intimacy Lv.${r.intimacyLevel}) now lives in the world as "${asset.name}".`,
                  zh: `你的主宠「${r.petName}」(亲密度 Lv.${r.intimacyLevel})现在以「${asset.name}」的形态活在世界里。`,
                }),
              );
            } catch (e: any) {
              Alert.alert(t({ en: 'Failed', zh: '化身失败' }), e?.message || '');
            } finally {
              setBusy(false);
            }
          },
        },
      ],
    );
  }, [asset, soul, assetId, load, t]);

  const submitRename = useCallback(async () => {
    const trimmed = renameDraft.trim();
    if (!trimmed) {
      Alert.alert(t({ en: 'Name required', zh: '请输入名称' }));
      return;
    }
    if (trimmed.length > 30) {
      Alert.alert(t({ en: 'Name too long', zh: '名称过长' }), t({ en: 'Max 30 characters', zh: '不能超过 30 个字符' }));
      return;
    }
    try {
      setBusy(true);
      await updateWorldAsset(assetId, { name: trimmed });
      setRenameOpen(false);
      await load();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e: any) {
      Alert.alert(t({ en: 'Rename failed', zh: '重命名失败' }), e?.message || '');
    } finally {
      setBusy(false);
    }
  }, [assetId, renameDraft, load, t]);

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={colors.accent} />
        <Text style={styles.dim}>{assetName || t({ en: 'Loading…', zh: '加载中…' })}</Text>
      </View>
    );
  }

  if (!asset) {
    return (
      <View style={styles.centered}>
        <Text style={styles.dim}>{t({ en: 'Asset not found', zh: '资产不存在' })}</Text>
        <TouchableOpacity style={styles.secondaryBtn} onPress={() => navigation.goBack()}>
          <Text style={styles.secondaryBtnText}>{t({ en: 'Back', zh: '返回' })}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const heroUri = asset.styledMeshUrl || asset.meshUrl || asset.portraitUrl || null;
  const statMax = Math.max(
    100,
    ...STAT_META.map((m) => asset.stats?.[m.key] || 0),
  );
  const battleTotal = asset.battleWins + asset.battleLosses;
  const winRate = battleTotal > 0 ? Math.round((asset.battleWins / battleTotal) * 100) : 0;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Header bar */}
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backBtnText}>‹ {t({ en: 'Back', zh: '返回' })}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => {
            setRenameDraft(asset.name);
            setRenameOpen(true);
          }}
          style={styles.renameBtn}
        >
          <Text style={styles.renameBtnText}>✏️</Text>
        </TouchableOpacity>
      </View>

      <MeshStatusChip status={asset.generationStatus} t={t} />

      {/* Hero */}
      <View style={styles.hero}>
        {heroUri ? (
          <Image source={{ uri: heroUri }} style={styles.heroImg} resizeMode="cover" />
        ) : (
          <View style={[styles.heroImg, styles.heroPlaceholder]}>
            <Text style={styles.heroPlaceholderText}>🦊</Text>
          </View>
        )}
        {soul?.isActiveIncarnation && (
          <View style={styles.incarnateBadge}>
            <Text style={styles.incarnateBadgeText}>🦊 {t({ en: 'Main pet', zh: '主宠化身' })}</Text>
          </View>
        )}
      </View>

      <Text style={styles.name}>{asset.name}</Text>
      <View style={styles.metaRow}>
        <Text style={styles.metaPill}>Lv.{asset.level}</Text>
        <Text style={styles.metaPill}>
          {asset.category === 'character' ? t({ en: 'Character', zh: '角色' }) : asset.category === 'weapon' ? t({ en: 'Weapon', zh: '武器' }) : t({ en: 'Dungeon', zh: '副本' })}
        </Text>
        {asset.boundAgentId && <Text style={styles.metaPill}>🤖 Agent</Text>}
      </View>

      {/* Battle record */}
      <View style={styles.recordCard}>
        <View style={styles.recordItem}>
          <Text style={styles.recordNum}>{asset.battleWins}</Text>
          <Text style={styles.recordLabel}>{t({ en: 'Wins', zh: '胜' })}</Text>
        </View>
        <View style={styles.recordDivider} />
        <View style={styles.recordItem}>
          <Text style={styles.recordNum}>{asset.battleLosses}</Text>
          <Text style={styles.recordLabel}>{t({ en: 'Losses', zh: '负' })}</Text>
        </View>
        <View style={styles.recordDivider} />
        <View style={styles.recordItem}>
          <Text style={styles.recordNum}>{winRate}%</Text>
          <Text style={styles.recordLabel}>{t({ en: 'Win rate', zh: '胜率' })}</Text>
        </View>
      </View>

      {/* Stats */}
      <Text style={styles.sectionTitle}>{t({ en: 'Stats', zh: '属性' })}</Text>
      <View style={styles.statsCard}>
        {STAT_META.map((m) => {
          const v = asset.stats?.[m.key] || 0;
          return (
            <View key={m.key} style={styles.statRow}>
              <Text style={styles.statLabel}>{m.label}</Text>
              <View style={styles.statBarTrack}>
                <View style={[styles.statBarFill, { width: `${Math.min(100, (v / statMax) * 100)}%`, backgroundColor: m.color }]} />
              </View>
              <Text style={styles.statValue}>{v}</Text>
            </View>
          );
        })}
      </View>

      {/* Skills */}
      {asset.skills && asset.skills.length > 0 && (
        <>
          <Text style={styles.sectionTitle}>{t({ en: 'Skills', zh: '技能' })}</Text>
          <View style={styles.skillsCard}>
            {asset.skills.map((sk, i) => (
              <View key={i} style={styles.skillRow}>
                <Text style={styles.skillEmoji}>{SKILL_TYPE_EMOJI[sk.type || 'utility'] || '✨'}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.skillName}>{sk.name}</Text>
                  {!!sk.description && <Text style={styles.skillDesc}>{sk.description}</Text>}
                </View>
              </View>
            ))}
          </View>
        </>
      )}

      {/* Personality */}
      {asset.personalityTraits && asset.personalityTraits.length > 0 && (
        <>
          <Text style={styles.sectionTitle}>{t({ en: 'Personality', zh: '性格' })}</Text>
          <View style={styles.tagWrap}>
            {asset.personalityTraits.map((tr, i) => (
              <Text key={i} style={styles.tag}>{tr}</Text>
            ))}
          </View>
        </>
      )}

      {/* Backstory */}
      {!!asset.backstory && (
        <>
          <Text style={styles.sectionTitle}>{t({ en: 'Backstory', zh: '背景故事' })}</Text>
          <Text style={styles.backstory}>{asset.backstory}</Text>
        </>
      )}

      {/* Actions */}
      <View style={styles.actions}>
        <TouchableOpacity style={[styles.actionBtn, styles.actionPrimary]} onPress={onBattle} disabled={busy}>
          <Text style={styles.actionPrimaryText}>⚔️ {t({ en: 'Battle', zh: '去对战' })}</Text>
        </TouchableOpacity>
        <View style={styles.actionRow}>
          <TouchableOpacity style={[styles.actionBtn, styles.actionSecondary, { flex: 1 }]} onPress={onIncarnate} disabled={busy}>
            <Text style={styles.actionSecondaryText}>
              {soul?.isActiveIncarnation ? `🦊 ${t({ en: 'Revert', zh: '解除化身' })}` : `🦊 ${t({ en: 'Incarnate', zh: '化身主宠' })}`}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.actionBtn, styles.actionSecondary, { flex: 1 }]} onPress={onListForSale} disabled={busy}>
            <Text style={styles.actionSecondaryText}>🛒 {t({ en: 'Sell', zh: '上架出售' })}</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={{ height: 40 }} />

      {/* Rename modal */}
      <Modal visible={renameOpen} transparent animationType="fade" onRequestClose={() => setRenameOpen(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>{t({ en: 'Rename', zh: '重命名' })}</Text>
            <TextInput
              value={renameDraft}
              onChangeText={setRenameDraft}
              placeholder={t({ en: 'New name (max 30)', zh: '新名称(最多 30 字符)' })}
              placeholderTextColor={colors.textMuted}
              maxLength={30}
              style={styles.modalInput}
              autoFocus
            />
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.modalCancelBtn} onPress={() => setRenameOpen(false)}>
                <Text style={styles.modalCancelText}>{t({ en: 'Cancel', zh: '取消' })}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalConfirmBtn} onPress={submitRename} disabled={busy}>
                <Text style={styles.modalConfirmText}>{t({ en: 'Save', zh: '保存' })}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

function MeshStatusChip({ status, t }: { status?: GenerationStatus; t: (x: { en: string; zh: string }) => string }) {
  if (!status || status === 'complete') return null;
  if (status === 'card_only') {
    return (
      <View style={[styles.statusChip, styles.statusInfo]}>
        <Text style={styles.statusText}>🎴 {t({ en: '2D card · platform 3D not open (BYO provider to unlock)', zh: '2D 角色卡 · 平台 3D 暂未开放(可用自己的 provider 解锁)' })}</Text>
      </View>
    );
  }
  if (status === 'mesh_failed') {
    return (
      <View style={[styles.statusChip, styles.statusWarn]}>
        <Text style={styles.statusText}>⚠️ {t({ en: '3D failed — card still usable', zh: '3D 生成失败 — 角色卡仍可用' })}</Text>
      </View>
    );
  }
  return (
    <View style={[styles.statusChip, styles.statusPending]}>
      <Text style={styles.statusText}>⏳ {t({ en: '3D model hatching…', zh: '3D 模型孵化中…' })}</Text>
    </View>
  );
}

const styles = themedStyles(() => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgPrimary },
  content: { padding: 16, paddingBottom: 48 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bgPrimary, gap: 12 },
  dim: { color: colors.textMuted, fontSize: 14 },

  topBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  backBtn: { paddingVertical: 6, paddingRight: 12 },
  backBtnText: { color: colors.textPrimary, fontSize: 16, fontWeight: '600' },
  renameBtn: { padding: 6 },
  renameBtnText: { fontSize: 18 },

  statusChip: { borderRadius: 10, paddingVertical: 8, paddingHorizontal: 12, marginBottom: 12 },
  statusInfo: { backgroundColor: 'rgba(56,189,248,0.10)', borderWidth: 1, borderColor: 'rgba(56,189,248,0.3)' },
  statusWarn: { backgroundColor: 'rgba(245,158,11,0.12)', borderWidth: 1, borderColor: 'rgba(245,158,11,0.3)' },
  statusPending: { backgroundColor: 'rgba(99,102,241,0.12)', borderWidth: 1, borderColor: 'rgba(99,102,241,0.3)' },
  statusText: { color: colors.textPrimary, fontSize: 12 },

  hero: { width: '100%', aspectRatio: 1, borderRadius: 16, overflow: 'hidden', backgroundColor: '#0d0d1a' },
  heroImg: { width: '100%', height: '100%' },
  heroPlaceholder: { alignItems: 'center', justifyContent: 'center' },
  heroPlaceholderText: { fontSize: 72 },
  incarnateBadge: { position: 'absolute', top: 10, left: 10, backgroundColor: 'rgba(168,85,247,0.85)', borderRadius: 12, paddingHorizontal: 10, paddingVertical: 4 },
  incarnateBadgeText: { color: '#fff', fontSize: 12, fontWeight: '700' },

  name: { color: colors.textPrimary, fontSize: 24, fontWeight: '800', marginTop: 14 },
  metaRow: { flexDirection: 'row', gap: 8, marginTop: 8, flexWrap: 'wrap' },
  metaPill: { color: colors.textPrimary, backgroundColor: colors.bgSecondary, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 4, fontSize: 12, overflow: 'hidden' },

  recordCard: { flexDirection: 'row', backgroundColor: colors.bgSecondary, borderRadius: 14, padding: 16, marginTop: 16, alignItems: 'center' },
  recordItem: { flex: 1, alignItems: 'center' },
  recordNum: { color: colors.textPrimary, fontSize: 22, fontWeight: '800' },
  recordLabel: { color: colors.textMuted, fontSize: 12, marginTop: 2 },
  recordDivider: { width: 1, height: 32, backgroundColor: 'rgba(255,255,255,0.1)' },

  sectionTitle: { color: colors.textPrimary, fontSize: 16, fontWeight: '700', marginTop: 22, marginBottom: 10 },
  statsCard: { backgroundColor: colors.bgSecondary, borderRadius: 14, padding: 14, gap: 10 },
  statRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  statLabel: { color: colors.textMuted, fontSize: 12, width: 34 },
  statBarTrack: { flex: 1, height: 8, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.08)', overflow: 'hidden' },
  statBarFill: { height: '100%', borderRadius: 4 },
  statValue: { color: colors.textPrimary, fontSize: 13, fontWeight: '700', width: 36, textAlign: 'right' },

  skillsCard: { backgroundColor: colors.bgSecondary, borderRadius: 14, padding: 8 },
  skillRow: { flexDirection: 'row', gap: 10, padding: 10, alignItems: 'flex-start' },
  skillEmoji: { fontSize: 20 },
  skillName: { color: colors.textPrimary, fontSize: 14, fontWeight: '600' },
  skillDesc: { color: colors.textMuted, fontSize: 12, marginTop: 2, lineHeight: 17 },

  tagWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tag: { color: colors.accent, backgroundColor: 'rgba(108,92,231,0.12)', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 6, fontSize: 13 },

  backstory: { color: colors.textSecondary, fontSize: 14, lineHeight: 22 },

  actions: { marginTop: 24, gap: 12 },
  actionRow: { flexDirection: 'row', gap: 12 },
  actionBtn: { borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  actionPrimary: { backgroundColor: colors.accent },
  actionPrimaryText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  actionSecondary: { backgroundColor: colors.bgSecondary, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
  actionSecondaryText: { color: colors.textPrimary, fontSize: 14, fontWeight: '600' },

  secondaryBtn: { backgroundColor: colors.bgSecondary, borderRadius: 10, paddingHorizontal: 20, paddingVertical: 10 },
  secondaryBtnText: { color: colors.textPrimary, fontSize: 14 },

  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', alignItems: 'center', paddingHorizontal: 32 },
  modalCard: { width: '100%', backgroundColor: colors.bgSecondary, borderRadius: 14, padding: 20 },
  modalTitle: { color: colors.textPrimary, fontSize: 18, fontWeight: '700', marginBottom: 16, textAlign: 'center' },
  modalInput: { backgroundColor: colors.bgPrimary, color: colors.textPrimary, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', marginBottom: 16 },
  modalActions: { flexDirection: 'row', gap: 12 },
  modalCancelBtn: { flex: 1, paddingVertical: 12, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.08)', alignItems: 'center' },
  modalCancelText: { color: colors.textMuted, fontSize: 14 },
  modalConfirmBtn: { flex: 1, paddingVertical: 12, borderRadius: 10, backgroundColor: colors.accent, alignItems: 'center' },
  modalConfirmText: { color: '#fff', fontSize: 14, fontWeight: '600' },
}));

export default WorldAssetDetailScreen;
