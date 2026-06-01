/**
 * SkillPackScreen — One-tap core skill batch installation for new users.
 * Shown after auto-provision to let users quickly equip their Agent.
 */
import React, { useState, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView,
  ActivityIndicator, SafeAreaView,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useQuery } from '@tanstack/react-query';
import { colors } from '../../theme/colors';
import { apiFetch } from '../../services/api';
import { installSkillToInstance } from '../../services/openclaw.service';
import { useAuthStore } from '../../stores/authStore';
import { useI18n } from '../../stores/i18nStore';
import type { AgentStackParamList } from '../../navigation/types';

type Nav = NativeStackNavigationProp<AgentStackParamList, 'SkillPack'>;

interface SkillItem {
  id: string;
  name: string;
  displayName?: string;
  description?: string;
  icon?: string;
}

/** Core skills — hardcoded fallback when API is unreachable */
const CORE_SKILLS: SkillItem[] = [
  { id: 'web-search', name: 'Web Search', icon: '🔍', description: 'Search the internet for real-time information' },
  { id: 'file-reader', name: 'File Reader', icon: '📄', description: 'Read and analyze documents, PDFs, spreadsheets' },
  { id: 'calendar', name: 'Calendar', icon: '📅', description: 'Manage schedules and set reminders' },
  { id: 'weather', name: 'Weather', icon: '🌤️', description: 'Get weather forecasts and alerts' },
  { id: 'translator', name: 'Translator', icon: '🌐', description: 'Translate between 100+ languages' },
  { id: 'code-interpreter', name: 'Code Interpreter', icon: '💻', description: 'Execute code and analyze data' },
  { id: 'image-gen', name: 'Image Generation', icon: '🎨', description: 'Generate images from text descriptions' },
  { id: 'calculator', name: 'Calculator', icon: '🧮', description: 'Advanced math and unit conversions' },
];

export function SkillPackScreen() {
  const navigation = useNavigation<Nav>();
  const { t } = useI18n();
  const activeInstance = useAuthStore((s) => s.activeInstance);

  const [selected, setSelected] = useState<Set<string>>(() => new Set(CORE_SKILLS.map(s => s.id)));
  const [installing, setInstalling] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });

  // Try fetching real skills from marketplace; fallback to hardcoded core list
  const { data: skills } = useQuery({
    queryKey: ['skill-pack-core'],
    queryFn: async () => {
      try {
        const res = await apiFetch<{ skills: SkillItem[] }>('/unified-marketplace/trending?limit=8');
        return res?.skills?.length ? res.skills : CORE_SKILLS;
      } catch {
        return CORE_SKILLS;
      }
    },
    staleTime: 5 * 60 * 1000,
  });

  const displaySkills = skills ?? CORE_SKILLS;

  const toggleSkill = useCallback((id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const selectAll = useCallback(() => {
    setSelected(new Set(displaySkills.map(s => s.id)));
  }, [displaySkills]);

  const goToChat = useCallback(() => {
    if (activeInstance) {
      navigation.navigate('AgentChat', { instanceId: activeInstance.id, instanceName: activeInstance.name });
    } else {
      navigation.navigate('AgentChat', {});
    }
  }, [activeInstance, navigation]);

  const handleInstall = useCallback(async () => {
    if (!activeInstance) { goToChat(); return; }

    const toInstall = displaySkills.filter(s => selected.has(s.id));
    if (toInstall.length === 0) { goToChat(); return; }

    setInstalling(true);
    setProgress({ done: 0, total: toInstall.length });

    for (const skill of toInstall) {
      try {
        await installSkillToInstance(activeInstance.id, skill.id);
      } catch { /* skip failed */ }
      setProgress(prev => ({ ...prev, done: prev.done + 1 }));
    }

    setInstalling(false);
    goToChat();
  }, [activeInstance, displaySkills, selected, goToChat]);

  // ── Installing progress view ──────────────────────────────────────────
  if (installing) {
    return (
      <SafeAreaView style={styles.loadingContainer}>
        <Text style={styles.loadingEmoji}>⚡</Text>
        <Text style={styles.loadingTitle}>
          {t({ en: 'Installing Skills...', zh: '正在安装技能...' })}
        </Text>
        <View style={styles.progressBar}>
          <View style={[styles.progressFill, { width: `${progress.total ? (progress.done / progress.total) * 100 : 0}%` }]} />
        </View>
        <Text style={styles.progressText}>{progress.done}/{progress.total}</Text>
      </SafeAreaView>
    );
  }

  // ── Main selection view ───────────────────────────────────────────────
  return (
    <SafeAreaView style={styles.container}>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        <Text style={styles.emoji}>🧰</Text>
        <Text style={styles.title}>
          {t({ en: 'Power Up Your Agent', zh: '为你的智能体加载技能' })}
        </Text>
        <Text style={styles.subtitle}>
          {t({
            en: 'Select the skills you want. We recommend keeping all for the best experience.',
            zh: '选择你需要的技能。我们推荐全部安装以获得最佳体验。',
          })}
        </Text>

        <TouchableOpacity style={styles.selectAllBtn} onPress={selectAll}>
          <Text style={styles.selectAllText}>
            {selected.size === displaySkills.length
              ? t({ en: `✅ All ${displaySkills.length} selected`, zh: `✅ 已全选 ${displaySkills.length} 项` })
              : t({ en: `Select All (${displaySkills.length})`, zh: `全选 (${displaySkills.length})` })}
          </Text>
        </TouchableOpacity>

        {displaySkills.map(skill => {
          const isOn = selected.has(skill.id);
          return (
            <TouchableOpacity
              key={skill.id}
              style={[styles.skillCard, isOn && styles.skillCardSelected]}
              onPress={() => toggleSkill(skill.id)}
              activeOpacity={0.7}
            >
              <Text style={styles.skillCheck}>{isOn ? '☑️' : '⬜'}</Text>
              <Text style={styles.skillIcon}>{skill.icon || '⚡'}</Text>
              <View style={styles.skillInfo}>
                <Text style={styles.skillName}>{skill.displayName || skill.name}</Text>
                {skill.description ? (
                  <Text style={styles.skillDesc} numberOfLines={2}>{skill.description}</Text>
                ) : null}
              </View>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* Bottom action bar */}
      <View style={styles.bottomBar}>
        <TouchableOpacity style={styles.installBtn} onPress={handleInstall}>
          <Text style={styles.installBtnText}>
            {selected.size > 0
              ? t({ en: `Install ${selected.size} Skills & Start`, zh: `安装 ${selected.size} 个技能并开始` })
              : t({ en: 'Skip & Start Chatting', zh: '跳过并开始对话' })}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.skipBtn} onPress={goToChat}>
          <Text style={styles.skipBtnText}>{t({ en: 'Skip for now', zh: '暂时跳过' })}</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgPrimary },
  scroll: { flex: 1 },
  scrollContent: { padding: 20, paddingBottom: 140 },
  emoji: { fontSize: 48, textAlign: 'center', marginTop: 24 },
  title: { fontSize: 22, fontWeight: '800', color: colors.textPrimary, textAlign: 'center', marginTop: 12 },
  subtitle: { fontSize: 14, color: colors.textMuted, textAlign: 'center', marginTop: 8, marginBottom: 20, lineHeight: 20 },
  selectAllBtn: { alignSelf: 'flex-end', marginBottom: 12, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, backgroundColor: colors.primary + '18' },
  selectAllText: { fontSize: 13, color: colors.primary, fontWeight: '600' },
  skillCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.bgCard, borderRadius: 14, padding: 14, marginBottom: 10, borderWidth: 1.5, borderColor: colors.border, gap: 12 },
  skillCardSelected: { borderColor: colors.primary + '88', backgroundColor: colors.primary + '08' },
  skillCheck: { fontSize: 18 },
  skillIcon: { fontSize: 28 },
  skillInfo: { flex: 1 },
  skillName: { fontSize: 15, fontWeight: '700', color: colors.textPrimary },
  skillDesc: { fontSize: 12, color: colors.textMuted, marginTop: 3, lineHeight: 17 },
  bottomBar: { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: colors.bgPrimary, paddingHorizontal: 20, paddingTop: 12, paddingBottom: 34, borderTopWidth: 1, borderColor: colors.border },
  installBtn: { backgroundColor: colors.primary, borderRadius: 14, paddingVertical: 16, alignItems: 'center' },
  installBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  skipBtn: { alignItems: 'center', paddingVertical: 12 },
  skipBtnText: { fontSize: 14, color: colors.textMuted },
  loadingContainer: { flex: 1, backgroundColor: colors.bgPrimary, alignItems: 'center', justifyContent: 'center', padding: 32 },
  loadingEmoji: { fontSize: 48 },
  loadingTitle: { fontSize: 18, fontWeight: '700', color: colors.textPrimary, marginTop: 16 },
  progressBar: { width: '80%', height: 6, backgroundColor: colors.bgSecondary, borderRadius: 3, marginTop: 20, overflow: 'hidden' },
  progressFill: { height: '100%', backgroundColor: colors.primary, borderRadius: 3 },
  progressText: { fontSize: 14, color: colors.textMuted, marginTop: 8 },
});
