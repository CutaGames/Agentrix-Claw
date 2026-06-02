/**
 * ModelCatalogSheet — unified mobile model picker.
 *
 * Replaces the cramped full-screen modal that previously rendered a flat
 * ScrollView of 20+ entries. Adds:
 *   • search box (matches label OR provider, case-insensitive)
 *   • provider-tier grouping (Local / Free / Pro / Enterprise)
 *   • visible badge + provider on every row, no truncation on long labels
 *     like "Claude Opus 4.7 (Platform)"
 *
 * Surface parity with desktop ChatPanel's new model popover.
 */
import React, { useMemo, useState } from 'react';
import {
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { colors } from '../../theme/colors';
import { useI18n } from '../../stores/i18nStore';

export interface ModelCatalogEntry {
  id: string;
  label: string;
  provider: string;
  icon?: string;
  badge?: string;
  tier?: 'local' | 'free' | 'pro' | 'enterprise';
  description?: string;
}

export interface ModelCatalogSheetProps {
  visible: boolean;
  onClose: () => void;
  models: ModelCatalogEntry[];
  activeModelId?: string;
  onSelect: (model: ModelCatalogEntry) => void;
  /** Shown under the title. */
  subtitle?: string;
  /** Shown when `models` is empty (or only 1 entry). */
  emptyHint?: string;
}

type TierFilter = 'all' | 'local' | 'free' | 'pro' | 'enterprise';

const TIER_ORDER: Array<Exclude<TierFilter, 'all'>> = ['local', 'free', 'pro', 'enterprise'];

const TIER_LABEL: Record<Exclude<TierFilter, 'all'>, { en: string; zh: string }> = {
  local: { en: 'Local', zh: '本地' },
  free: { en: 'Free', zh: '免费' },
  pro: { en: 'Pro', zh: '专业' },
  enterprise: { en: 'Enterprise', zh: '企业' },
};

function inferTier(m: ModelCatalogEntry): Exclude<TierFilter, 'all'> {
  if (m.tier) return m.tier;
  const id = m.id.toLowerCase();
  if (id.startsWith('local') || id.includes('gemma') || id.includes('-nano')) return 'local';
  if (id.includes('opus') || id.includes('gpt-5') || id.includes('claude-sonnet-4')) return 'pro';
  return 'free';
}

export function ModelCatalogSheet({
  visible,
  onClose,
  models,
  activeModelId,
  onSelect,
  subtitle,
  emptyHint,
}: ModelCatalogSheetProps) {
  const { t } = useI18n();
  const [query, setQuery] = useState('');
  const [tierFilter, setTierFilter] = useState<TierFilter>('all');

  const grouped = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = models.filter((m) => {
      if (q) {
        const hay = `${m.label} ${m.provider} ${m.id} ${m.description || ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (tierFilter !== 'all' && inferTier(m) !== tierFilter) return false;
      return true;
    });
    const byTier: Record<Exclude<TierFilter, 'all'>, ModelCatalogEntry[]> = {
      local: [], free: [], pro: [], enterprise: [],
    };
    for (const m of filtered) byTier[inferTier(m)].push(m);
    return byTier;
  }, [models, query, tierFilter]);

  const totalFiltered = grouped.local.length + grouped.free.length + grouped.pro.length + grouped.enterprise.length;

  const handleClose = () => {
    setQuery('');
    setTierFilter('all');
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={handleClose}>
      <TouchableOpacity
        testID="model-catalog-overlay"
        accessibilityLabel="model-catalog-overlay"
        style={styles.overlay}
        onPress={handleClose}
        activeOpacity={1}
      >
        <View style={styles.sheet} onStartShouldSetResponder={() => true}>
          <View style={styles.grabber} />
          <Text style={styles.title}>{t({ en: 'Switch Model', zh: '切换模型' })}</Text>
          {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}

          {/* Search */}
          <View style={styles.searchRow}>
            <Text style={styles.searchIcon}>🔍</Text>
            <TextInput
              testID="model-catalog-search"
              accessibilityLabel="model-catalog-search"
              style={styles.searchInput}
              placeholder={t({ en: 'Search model or provider', zh: '搜索模型或厂商' })}
              placeholderTextColor={colors.textMuted}
              value={query}
              onChangeText={setQuery}
              autoCorrect={false}
              autoCapitalize="none"
            />
            {!!query && (
              <TouchableOpacity onPress={() => setQuery('')} style={styles.clearBtn}>
                <Text style={styles.clearText}>✕</Text>
              </TouchableOpacity>
            )}
          </View>

          {/* Tier filter chips */}
          <View style={styles.chipRow}>
            {(['all', ...TIER_ORDER] as TierFilter[]).map((f) => {
              const active = tierFilter === f;
              const label = f === 'all'
                ? t({ en: 'All', zh: '全部' })
                : t(TIER_LABEL[f]);
              return (
                <TouchableOpacity
                  key={f}
                  testID={`model-catalog-tier-${f}`}
                  style={[styles.chip, active && styles.chipActive]}
                  onPress={() => setTierFilter(f)}
                >
                  <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <ScrollView style={styles.list} keyboardShouldPersistTaps="handled">
            {TIER_ORDER.map((tier) => {
              const items = grouped[tier];
              if (items.length === 0) return null;
              return (
                <View key={tier} style={styles.group}>
                  <Text style={styles.groupHeader}>
                    {t(TIER_LABEL[tier])} · {items.length}
                  </Text>
                  {items.map((m) => {
                    const isActive = m.id === activeModelId;
                    return (
                      <TouchableOpacity
                        key={m.id}
                        testID={`model-catalog-row-${m.id}`}
                        style={[styles.row, isActive && styles.rowActive]}
                        onPress={() => onSelect(m)}
                        activeOpacity={0.7}
                      >
                        <Text style={styles.rowIcon}>{m.icon || '🤖'}</Text>
                        <View style={styles.rowInfo}>
                          <View style={styles.rowLabelLine}>
                            <Text style={styles.rowLabel} numberOfLines={1}>{m.label}</Text>
                            {m.badge && (
                              <View style={styles.badge}>
                                <Text style={styles.badgeText}>{m.badge}</Text>
                              </View>
                            )}
                          </View>
                          <Text style={styles.rowProvider} numberOfLines={1}>{m.provider}</Text>
                          {m.description && (
                            <Text style={styles.rowDescription} numberOfLines={2}>{m.description}</Text>
                          )}
                        </View>
                        {isActive && <Text style={styles.rowCheck}>✓</Text>}
                      </TouchableOpacity>
                    );
                  })}
                </View>
              );
            })}
            {totalFiltered === 0 && (
              <Text style={styles.empty}>
                {emptyHint || t({
                  en: 'No matching models. Clear filters or add API keys.',
                  zh: '没有匹配的模型。清除筛选或前往 设置 → API 密钥 添加。',
                })}
              </Text>
            )}
          </ScrollView>
        </View>
      </TouchableOpacity>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: '#00000099' },
  sheet: {
    backgroundColor: colors.bgCard,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 8,
    paddingBottom: 32,
    maxHeight: '82%',
  },
  grabber: {
    alignSelf: 'center', width: 40, height: 4, borderRadius: 2,
    backgroundColor: colors.border, marginBottom: 8,
  },
  title: { color: colors.textPrimary, fontSize: 18, fontWeight: '700', textAlign: 'center' },
  subtitle: { color: colors.textSecondary, fontSize: 12, textAlign: 'center', marginTop: 4, paddingHorizontal: 24 },
  searchRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    marginHorizontal: 16, marginTop: 12,
    backgroundColor: colors.input, borderRadius: 12,
    paddingHorizontal: 12,
  },
  searchIcon: { fontSize: 14, color: colors.textMuted },
  searchInput: { flex: 1, color: colors.textPrimary, fontSize: 14, paddingVertical: 10 },
  clearBtn: { padding: 6 },
  clearText: { color: colors.textMuted, fontSize: 14 },
  chipRow: {
    flexDirection: 'row', flexWrap: 'wrap', gap: 6,
    paddingHorizontal: 16, marginTop: 10, marginBottom: 6,
  },
  chip: {
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 14,
    backgroundColor: colors.bgSecondary, borderWidth: 1, borderColor: colors.border,
  },
  chipActive: { backgroundColor: colors.primary + '22', borderColor: colors.primary },
  chipText: { color: colors.textSecondary, fontSize: 12, fontWeight: '600' },
  chipTextActive: { color: colors.primary },
  list: { marginTop: 4 },
  group: { paddingTop: 10 },
  groupHeader: {
    paddingHorizontal: 18, paddingBottom: 6,
    color: colors.textMuted, fontSize: 11, fontWeight: '700', letterSpacing: 1,
    textTransform: 'uppercase',
  },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 12, paddingHorizontal: 18,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border,
  },
  rowActive: { backgroundColor: colors.primary + '0f' },
  rowIcon: { fontSize: 22 },
  rowInfo: { flex: 1, gap: 2 },
  rowLabelLine: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  rowLabel: { color: colors.textPrimary, fontSize: 15, fontWeight: '600', flexShrink: 1 },
  rowProvider: { color: colors.textSecondary, fontSize: 12 },
  rowDescription: { color: colors.textMuted, fontSize: 11, lineHeight: 15 },
  badge: { backgroundColor: colors.accent + '22', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 1 },
  badgeText: { color: colors.accent, fontSize: 10, fontWeight: '700' },
  rowCheck: { color: colors.accent, fontSize: 18, fontWeight: '700' },
  empty: { textAlign: 'center', color: colors.textMuted, fontSize: 13, paddingVertical: 40, paddingHorizontal: 32, lineHeight: 20 },
});

export default ModelCatalogSheet;
