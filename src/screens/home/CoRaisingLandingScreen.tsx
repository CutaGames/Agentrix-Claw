/**
 * CoRaisingLandingScreen — real implementation (Sprint C1).
 *
 * Landing page for `agentrix://home/co-raising/:token` invite links.
 *   - peekInvite() is public — shows pet preview even before sign-in
 *   - feedCoRaisingPet() requires auth (AXP reward + friend attribution)
 *
 * Spec: MOBILE_REFACTOR_AND_ECOSYSTEM_PLAN_2026-05 §6.1.
 */
import React, { useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useRoute, useNavigation, type RouteProp } from '@react-navigation/native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { colors } from '../../theme/colors';
import { useI18n } from '../../stores/i18nStore';
import { useAuthStore } from '../../stores/authStore';
import {
  peekCoRaisingInvite,
  feedCoRaisingPet,
} from '../../services/coraising.api';
import type { HomeStackParamList } from '../../navigation/types';
import { themedStyles } from '../../theme/useTheme';

type Route = RouteProp<HomeStackParamList, 'CoRaisingLanding'>;

export function CoRaisingLandingScreen() {
  const route = useRoute<Route>();
  const navigation = useNavigation<any>();
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const isAuthed = useAuthStore((s) => s.isAuthenticated);
  const token = route.params?.token ?? '';

  const peekQ = useQuery({
    queryKey: ['coraising-peek', token],
    queryFn: () => peekCoRaisingInvite(token),
    enabled: !!token,
    retry: 1,
  });

  const feedMut = useMutation({
    mutationFn: () => feedCoRaisingPet({ token }),
    onSuccess: (result) => {
      Alert.alert(
        t({ en: 'Thanks!', zh: '谢谢！' }),
        t({
          en: `You gave +${result.energy_given} energy and earned ${result.axp_awarded} AXP.`,
          zh: `喂养成功 · +${result.energy_given} 能量 · +${result.axp_awarded} AXP`,
        }),
      );
      queryClient.invalidateQueries({ queryKey: ['coraising-peek', token] });
      queryClient.invalidateQueries({ queryKey: ['axp-balance'] });
    },
    onError: (err: any) => {
      Alert.alert(t({ en: 'Failed', zh: '失败' }), err?.message ?? 'unknown');
    },
  });

  const onFeed = useCallback(() => {
    if (!isAuthed) {
      Alert.alert(
        t({ en: 'Sign in to feed', zh: '登录后可喂养' }),
        t({
          en: 'Sign in to feed this pet and earn AXP rewards.',
          zh: '登录后即可喂养 + 获得 AXP',
        }),
        [
          { text: t({ en: 'Later', zh: '稍后' }), style: 'cancel' },
          {
            text: t({ en: 'Sign in', zh: '登录' }),
            onPress: () => navigation.navigate('Auth', { screen: 'Login' }),
          },
        ],
      );
      return;
    }
    feedMut.mutate();
  }, [feedMut, isAuthed, navigation, t]);

  if (!token) {
    return (
      <View style={styles.center}>
        <Text style={styles.emoji}>🤝</Text>
        <Text style={styles.title}>
          {t({ en: 'Co-Raising', zh: '共养' })}
        </Text>
        <Text style={styles.body}>
          {t({
            en: 'Open a co-raising invite link to feed a friend\'s pet and earn AXP together.',
            zh: '打开共养邀请链接，帮朋友喂宠，一起赚 AXP。',
          })}
        </Text>
      </View>
    );
  }

  if (peekQ.isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.accent} size="large" />
      </View>
    );
  }

  if (peekQ.isError) {
    return (
      <ScrollView contentContainerStyle={styles.center}>
        <Text style={styles.emoji}>🚫</Text>
        <Text style={styles.title}>
          {t({ en: 'Invite not available', zh: '邀请不可用' })}
        </Text>
        <Text style={styles.body}>
          {t({
            en: 'This invite may have expired or been cancelled.',
            zh: '此邀请可能已过期或被取消。',
          })}
        </Text>
      </ScrollView>
    );
  }

  const peek = peekQ.data!;
  const splitPct = (peek.split_bps / 100).toFixed(peek.split_bps % 100 === 0 ? 0 : 2);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.emoji}>🐾</Text>
      <Text style={styles.title}>
        {t({ en: 'Help raise this pet', zh: '帮忙养这只主宠' })}
      </Text>
      <Text style={styles.body}>
        {t({
          en: `Each feed gives +2 energy. You'll earn AXP and ${splitPct}% of future earnings.`,
          zh: `每次喂养 +2 能量。你将获得 AXP 奖励，未来赚取收益的 ${splitPct}% 会分给你。`,
        })}
      </Text>

      <View style={styles.statsCard}>
        <View style={styles.stat}>
          <Text style={styles.statValue}>{peek.feeders_count}</Text>
          <Text style={styles.statLabel}>{t({ en: 'Feeders', zh: '喂养者' })}</Text>
        </View>
        <View style={styles.stat}>
          <Text style={styles.statValue}>{peek.total_feeds}</Text>
          <Text style={styles.statLabel}>{t({ en: 'Total feeds', zh: '总喂养' })}</Text>
        </View>
        <View style={styles.stat}>
          <Text style={styles.statValue}>{splitPct}%</Text>
          <Text style={styles.statLabel}>{t({ en: 'Your split', zh: '你的分成' })}</Text>
        </View>
      </View>

      <TouchableOpacity
        style={styles.feedBtn}
        onPress={onFeed}
        disabled={feedMut.isPending}
      >
        {feedMut.isPending ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.feedBtnText}>
            🌱 {t({ en: 'Feed pet (+AXP)', zh: '喂养（+AXP）' })}
          </Text>
        )}
      </TouchableOpacity>

      <Text style={styles.footer}>
        {t({
          en: 'One feed per day per friend. Pet levels up based on total feeds and energy.',
          zh: '每位好友每日可喂一次。总喂养次数与能量决定宠物成长速度。',
        })}
      </Text>
    </ScrollView>
  );
}

const styles = themedStyles(() => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgPrimary },
  content: { padding: 24, alignItems: 'center' },
  center: { flex: 1, backgroundColor: colors.bgPrimary, padding: 24, alignItems: 'center', justifyContent: 'center' },
  emoji: { fontSize: 64, marginTop: 32, marginBottom: 16 },
  title: { fontSize: 22, fontWeight: '800', color: colors.textPrimary, textAlign: 'center', marginBottom: 12 },
  body: { fontSize: 14, color: colors.textMuted, textAlign: 'center', lineHeight: 22, marginBottom: 20 },
  statsCard: {
    flexDirection: 'row',
    backgroundColor: colors.bgCard,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 20,
    width: '100%',
  },
  stat: { flex: 1, alignItems: 'center' },
  statValue: { fontSize: 24, fontWeight: '800', color: colors.accent },
  statLabel: { fontSize: 11, color: colors.textMuted, marginTop: 2 },
  feedBtn: {
    backgroundColor: colors.accent,
    borderRadius: 16,
    paddingVertical: 16,
    paddingHorizontal: 32,
    alignItems: 'center',
    alignSelf: 'stretch',
    marginBottom: 12,
  },
  feedBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  footer: { fontSize: 11, color: colors.textMuted, textAlign: 'center', opacity: 0.7, marginTop: 12 },
}));
