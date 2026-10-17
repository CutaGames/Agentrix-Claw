/**
 * PlazaSearchModal — Sprint 3 Task 3.7
 *
 * Unified search modal for the Plaza tab. Searches across skins, skills,
 * and tasks via `GET /api/v1/market/search`.
 */
import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  Modal,
  TextInput,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  Pressable,
} from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { colors } from '../../theme/colors';
import { useI18n } from '../../stores/i18nStore';
import {
  fetchMarketSearch,
  SkinSearchItem,
  SkillSearchItem,
  TaskSearchItem,
} from '../../services/marketSearch.api';
import type { PlazaStackParamList } from '../../navigation/types';
import { themedStyles } from '../../theme/useTheme';

type Nav = NativeStackNavigationProp<PlazaStackParamList, 'PlazaRoot'>;

interface Props {
  visible: boolean;
  onClose: () => void;
}

export function PlazaSearchModal({ visible, onClose }: Props) {
  const { t } = useI18n();
  const navigation = useNavigation<Nav>();
  const [query, setQuery] = useState('');
  const [submitted, setSubmitted] = useState('');

  const { data, isLoading, isError } = useQuery({
    queryKey: ['market-search', submitted],
    queryFn: () => fetchMarketSearch(submitted, 5),
    enabled: submitted.trim().length > 0,
    staleTime: 30_000,
  });

  const handleSubmit = useCallback(() => {
    if (query.trim().length > 0) {
      setSubmitted(query.trim());
    }
  }, [query]);

  const handleSkinPress = (skin: SkinSearchItem) => {
    onClose();
    navigation.navigate('PetsSkins');
  };

  const handleSkillPress = (skill: SkillSearchItem) => {
    onClose();
    navigation.navigate('SkillDetail', { skillId: skill.id, skillName: skill.name });
  };

  const handleTaskPress = (task: TaskSearchItem) => {
    onClose();
    navigation.navigate('TaskDetail', { taskId: task.id });
  };

  const hasResults =
    data &&
    (data.skins.items.length > 0 ||
      data.skills.items.length > 0 ||
      data.tasks.items.length > 0);

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet">
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <TextInput
            style={styles.searchInput}
            placeholder={t({ en: 'Search skins, skills, tasks...', zh: '搜索皮肤、技能、任务...' })}
            placeholderTextColor={colors.textMuted}
            value={query}
            onChangeText={setQuery}
            onSubmitEditing={handleSubmit}
            returnKeyType="search"
            autoFocus
          />
          <TouchableOpacity style={styles.cancelBtn} onPress={onClose}>
            <Text style={styles.cancelText}>{t({ en: 'Cancel', zh: '取消' })}</Text>
          </TouchableOpacity>
        </View>

        {/* Results */}
        <FlatList
          data={[1]} // single item to render all sections
          keyExtractor={() => 'results'}
          contentContainerStyle={styles.results}
          renderItem={() => (
            <View>
              {isLoading && (
                <ActivityIndicator color={colors.accent} style={{ marginTop: 40 }} />
              )}

              {isError && submitted.length > 0 && (
                <View style={styles.emptyWrap}>
                  <Text style={styles.emptyEmoji}>🚫</Text>
                  <Text style={styles.emptyText}>
                    {t({ en: 'Search failed. Try again.', zh: '搜索失败，请重试。' })}
                  </Text>
                </View>
              )}

              {!isLoading && submitted.length > 0 && !hasResults && !isError && (
                <View style={styles.emptyWrap}>
                  <Text style={styles.emptyEmoji}>🔍</Text>
                  <Text style={styles.emptyText}>
                    {t({ en: 'No results found', zh: '未找到结果' })}
                  </Text>
                </View>
              )}

              {submitted.length === 0 && (
                <View style={styles.emptyWrap}>
                  <Text style={styles.emptyEmoji}>🔍</Text>
                  <Text style={styles.emptyText}>
                    {t({
                      en: 'Search across skins, skills, and tasks',
                      zh: '跨皮肤、技能、任务搜索',
                    })}
                  </Text>
                </View>
              )}

              {/* Skins section */}
              {data && data.skins.items.length > 0 && (
                <View style={styles.section}>
                  <Text style={styles.sectionTitle}>
                    🎨 {t({ en: 'Skins', zh: '皮肤' })} ({data.skins.count})
                  </Text>
                  {data.skins.items.map((skin) => (
                    <Pressable
                      key={skin.id}
                      style={styles.resultRow}
                      onPress={() => handleSkinPress(skin)}
                    >
                      <Text style={styles.resultIcon}>🎨</Text>
                      <View style={styles.resultBody}>
                        <Text style={styles.resultName} numberOfLines={1}>
                          {skin.displayName}
                        </Text>
                        <Text style={styles.resultMeta}>
                          Clan {skin.clan}
                          {skin.priceUsd != null ? ` · $${skin.priceUsd.toFixed(2)}` : ''}
                        </Text>
                      </View>
                      <Text style={styles.resultArrow}>›</Text>
                    </Pressable>
                  ))}
                </View>
              )}

              {/* Skills section */}
              {data && data.skills.items.length > 0 && (
                <View style={styles.section}>
                  <Text style={styles.sectionTitle}>
                    ⚡ {t({ en: 'Skills', zh: '技能' })} ({data.skills.count})
                  </Text>
                  {data.skills.items.map((skill) => (
                    <Pressable
                      key={skill.id}
                      style={styles.resultRow}
                      onPress={() => handleSkillPress(skill)}
                    >
                      <Text style={styles.resultIcon}>{skill.icon || '⚡'}</Text>
                      <View style={styles.resultBody}>
                        <Text style={styles.resultName} numberOfLines={1}>
                          {skill.name}
                        </Text>
                        <Text style={styles.resultMeta} numberOfLines={1}>
                          {skill.category} · ⭐ {skill.rating.toFixed(1)}
                        </Text>
                      </View>
                      <Text style={styles.resultArrow}>›</Text>
                    </Pressable>
                  ))}
                </View>
              )}

              {/* Tasks section */}
              {data && data.tasks.items.length > 0 && (
                <View style={styles.section}>
                  <Text style={styles.sectionTitle}>
                    💼 {t({ en: 'Tasks', zh: '任务' })} ({data.tasks.count})
                  </Text>
                  {data.tasks.items.map((task) => (
                    <Pressable
                      key={task.id}
                      style={styles.resultRow}
                      onPress={() => handleTaskPress(task)}
                    >
                      <Text style={styles.resultIcon}>💼</Text>
                      <View style={styles.resultBody}>
                        <Text style={styles.resultName} numberOfLines={1}>
                          {task.title}
                        </Text>
                        <Text style={styles.resultMeta}>
                          {task.type} · ${task.budget}
                        </Text>
                      </View>
                      <Text style={styles.resultArrow}>›</Text>
                    </Pressable>
                  ))}
                </View>
              )}
            </View>
          )}
        />
      </View>
    </Modal>
  );
}

const styles = themedStyles(() => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgPrimary },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 12,
    gap: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  searchInput: {
    flex: 1,
    backgroundColor: colors.bgCard,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 15,
    color: colors.textPrimary,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cancelBtn: { paddingHorizontal: 4 },
  cancelText: { fontSize: 14, fontWeight: '600', color: colors.accent },
  results: { padding: 16, paddingBottom: 40 },
  emptyWrap: { alignItems: 'center', marginTop: 60 },
  emptyEmoji: { fontSize: 40, marginBottom: 12 },
  emptyText: { fontSize: 14, color: colors.textMuted, textAlign: 'center' },
  section: { marginBottom: 20 },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: 10,
  },
  resultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.bgCard,
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 10,
  },
  resultIcon: { fontSize: 20 },
  resultBody: { flex: 1 },
  resultName: { fontSize: 14, fontWeight: '600', color: colors.textPrimary },
  resultMeta: { fontSize: 11, color: colors.textMuted, marginTop: 2 },
  resultArrow: { fontSize: 18, fontWeight: '600', color: colors.textMuted },
}));
