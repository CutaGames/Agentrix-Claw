import React, { useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  ScrollView, Alert, ActivityIndicator,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';
import { useQuery } from '@tanstack/react-query';
import { colors } from '../../theme/colors';
import { apiFetch } from '../../services/api';
import { installSkillToInstance } from '../../services/openclaw.service';
import { useAuthStore } from '../../stores/authStore';
import type { MarketStackParamList } from '../../navigation/types';

type Nav = NativeStackNavigationProp<MarketStackParamList, 'SkillDetail'>;
type RouteT = RouteProp<MarketStackParamList, 'SkillDetail'>;

export function ClawSkillDetailScreen() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<RouteT>();
  const { skillId } = route.params;
  const activeInstance = useAuthStore((s) => s.activeInstance);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const [installing, setInstalling] = useState(false);

  const { data: skill, isLoading } = useQuery({
    queryKey: ['skill', skillId],
    queryFn: () => apiFetch<any>(`/skills/${skillId}`),
    enabled: !!skillId,
  });

  const handleInstallToAgent = async () => {
    if (!activeInstance) {
      Alert.alert('No Agent', 'Connect an OpenClaw instance first to install skills.');
      return;
    }
    if (!isAuthenticated) {
      Alert.alert('Sign in required', 'Please sign in to install skills.');
      return;
    }
    setInstalling(true);
    try {
      await installSkillToInstance(activeInstance.id, skillId);
      Alert.alert('✅ Installed!', `${skill?.name} has been installed to ${activeInstance.name}`);
    } catch (e: any) {
      const msg = e?.message || 'Install failed';
      if (msg.includes('payment') || msg.includes('balance')) {
        navigation.navigate('Checkout', { skillId, skillName: skill?.name });
      } else {
        Alert.alert('Install Failed', msg);
      }
    } finally {
      setInstalling(false);
    }
  };

  if (isLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    );
  }

  if (!skill) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>Skill not found</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Hero */}
      <View style={styles.hero}>
        <Text style={styles.heroIcon}>{skill.icon || '⚡'}</Text>
        <View style={{ flex: 1 }}>
          <Text style={styles.heroName}>{skill.name}</Text>
          <Text style={styles.heroAuthor}>by {skill.author?.nickname || skill.vendorName || 'Unknown'}</Text>
        </View>
      </View>

      {/* Stats */}
      <View style={styles.statsRow}>
        <View style={styles.stat}>
          <Text style={styles.statVal}>⭐ {skill.rating ? Number(skill.rating).toFixed(1) : '—'}</Text>
          <Text style={styles.statLbl}>Rating</Text>
        </View>
        <View style={styles.stat}>
          <Text style={styles.statVal}>{skill.installCount || 0}</Text>
          <Text style={styles.statLbl}>Installs</Text>
        </View>
        <View style={styles.stat}>
          <Text style={styles.statVal}>{skill.price === 0 ? 'Free' : `$${skill.price}`}</Text>
          <Text style={styles.statLbl}>Price</Text>
        </View>
      </View>

      {/* Description */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>About</Text>
        <Text style={styles.description}>{skill.description || 'No description available.'}</Text>
      </View>

      {/* What it does */}
      {skill.features?.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Features</Text>
          {skill.features.map((f: string, i: number) => (
            <Text key={i} style={styles.featureItem}>• {f}</Text>
          ))}
        </View>
      )}

      {/* Tags */}
      {skill.tags?.length > 0 && (
        <View style={styles.tagsRow}>
          {skill.tags.map((tag: string) => (
            <View key={tag} style={styles.tag}>
              <Text style={styles.tagText}>{tag}</Text>
            </View>
          ))}
        </View>
      )}

      {/* CTA */}
      <View style={styles.cta}>
        <TouchableOpacity
          style={[styles.installBtn, installing && styles.btnDisabled]}
          onPress={handleInstallToAgent}
          disabled={installing}
        >
          {installing ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <Text style={styles.installBtnText}>
              {!activeInstance ? '🔗 Connect Agent First' :
               skill.price === 0 ? '⚡ Install to Agent (Free)' : `💳 Buy & Install ($${skill.price})`}
            </Text>
          )}
        </TouchableOpacity>

        {activeInstance && (
          <Text style={styles.installTarget}>
            → Will be installed to: {activeInstance.name}
          </Text>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgPrimary },
  content: { padding: 20, paddingBottom: 40, gap: 20 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bgPrimary },
  errorText: { color: colors.error, fontSize: 15 },
  hero: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  heroIcon: { fontSize: 48 },
  heroName: { fontSize: 20, fontWeight: '800', color: colors.textPrimary },
  heroAuthor: { fontSize: 13, color: colors.textMuted },
  statsRow: { flexDirection: 'row', backgroundColor: colors.bgCard, borderRadius: 14, padding: 16, gap: 8, borderWidth: 1, borderColor: colors.border },
  stat: { flex: 1, alignItems: 'center', gap: 4 },
  statVal: { fontSize: 16, fontWeight: '700', color: colors.textPrimary },
  statLbl: { fontSize: 11, color: colors.textMuted, textTransform: 'uppercase' },
  section: { gap: 8 },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: colors.textPrimary },
  description: { fontSize: 14, color: colors.textSecondary, lineHeight: 22 },
  featureItem: { fontSize: 14, color: colors.textSecondary, lineHeight: 22 },
  tagsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tag: { backgroundColor: colors.bgCard, borderRadius: 16, paddingHorizontal: 12, paddingVertical: 5, borderWidth: 1, borderColor: colors.border },
  tagText: { fontSize: 12, color: colors.textSecondary, fontWeight: '600' },
  cta: { gap: 10 },
  installBtn: { backgroundColor: colors.primary, borderRadius: 14, padding: 17, alignItems: 'center' },
  btnDisabled: { opacity: 0.6 },
  installBtnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  installTarget: { fontSize: 12, color: colors.textMuted, textAlign: 'center' },
});
