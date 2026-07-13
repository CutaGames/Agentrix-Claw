/**
 * GreetingCardInboxScreen — real implementation (Sprint C2).
 *
 * Segmented view: 📬 Inbox | 📤 Outbox.
 * Tapping a card redeems AXP reward (first time only).
 */
import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Pressable,
  Alert,
  RefreshControl,
} from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { colors } from '../../theme/colors';
import { useI18n } from '../../stores/i18nStore';
import {
  fetchGreetingInbox,
  fetchGreetingOutbox,
  redeemGreetingCard,
  GreetingCardView,
} from '../../services/greeting.api';
import { themedStyles } from '../../theme/useTheme';

type Mode = 'inbox' | 'outbox';

export function GreetingCardInboxScreen() {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const [mode, setMode] = useState<Mode>('inbox');

  const inboxQ = useQuery({
    queryKey: ['greeting-inbox'],
    queryFn: () => fetchGreetingInbox(30),
    staleTime: 30_000,
    retry: 1,
  });
  const outboxQ = useQuery({
    queryKey: ['greeting-outbox'],
    queryFn: () => fetchGreetingOutbox(30),
    staleTime: 30_000,
    retry: 1,
  });

  const redeemMut = useMutation({
    mutationFn: redeemGreetingCard,
    onSuccess: (r) => {
      if (r.already) {
        Alert.alert(
          t({ en: 'Already redeemed', zh: '已领取' }),
          t({ en: 'This card was already redeemed.', zh: '这张贺卡已经领取过了。' }),
        );
      } else {
        Alert.alert(
          t({ en: '+AXP', zh: '+AXP' }),
          t({
            en: `You earned ${r.axp_awarded} AXP from this card!`,
            zh: `你从这张贺卡获得 ${r.axp_awarded} AXP！`,
          }),
        );
      }
      queryClient.invalidateQueries({ queryKey: ['greeting-inbox'] });
      queryClient.invalidateQueries({ queryKey: ['axp-balance'] });
    },
    onError: (err: any) => {
      Alert.alert(t({ en: 'Failed', zh: '失败' }), err?.message ?? 'unknown');
    },
  });

  const current = mode === 'inbox' ? inboxQ : outboxQ;
  const items = current.data?.items ?? [];

  const onRefresh = useCallback(() => {
    current.refetch();
  }, [current]);

  const onCardTap = useCallback(
    (card: GreetingCardView) => {
      if (mode === 'inbox' && !card.redeemed_at) {
        redeemMut.mutate(card.token);
      }
    },
    [mode, redeemMut],
  );

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl
          refreshing={current.isRefetching}
          onRefresh={onRefresh}
          tintColor={colors.accent}
        />
      }
    >
      <Text style={styles.title}>📬 {t({ en: 'Greeting Cards', zh: '宠物贺卡' })}</Text>
      <View style={styles.tabBar}>
        <TouchableOpacity
          style={[styles.tab, mode === 'inbox' && styles.tabActive]}
          onPress={() => setMode('inbox')}
        >
          <Text style={[styles.tabText, mode === 'inbox' && styles.tabTextActive]}>
            📬 {t({ en: 'Inbox', zh: '收件' })}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, mode === 'outbox' && styles.tabActive]}
          onPress={() => setMode('outbox')}
        >
          <Text style={[styles.tabText, mode === 'outbox' && styles.tabTextActive]}>
            📤 {t({ en: 'Sent', zh: '发件' })}
          </Text>
        </TouchableOpacity>
      </View>

      {current.isLoading && items.length === 0 ? (
        <ActivityIndicator color={colors.accent} style={{ marginTop: 30 }} />
      ) : items.length === 0 ? (
        <Text style={styles.empty}>
          {mode === 'inbox'
            ? t({ en: 'No cards received yet.', zh: '暂无收到的贺卡。' })
            : t({ en: 'No cards sent yet.', zh: '暂未发送贺卡。' })}
        </Text>
      ) : (
        items.map((c) => <Card key={c.id} card={c} mode={mode} onTap={onCardTap} t={t} />)
      )}
    </ScrollView>
  );
}

function Card({
  card,
  mode,
  onTap,
  t,
}: {
  card: GreetingCardView;
  mode: Mode;
  onTap: (c: GreetingCardView) => void;
  t: any;
}) {
  const isUnredeemed = mode === 'inbox' && !card.redeemed_at;
  return (
    <Pressable
      style={[styles.card, isUnredeemed && styles.cardHighlighted]}
      onPress={() => onTap(card)}
    >
      <View style={styles.cardHead}>
        <Text style={styles.template}>{card.template}</Text>
        <Text style={styles.statusPill}>
          {isUnredeemed ? `+${card.axp_reward} AXP` : card.status}
        </Text>
      </View>
      {card.message ? (
        <Text style={styles.message} numberOfLines={3}>{card.message}</Text>
      ) : (
        <Text style={[styles.message, { fontStyle: 'italic', opacity: 0.7 }]}>
          {t({ en: 'No message', zh: '（没有留言）' })}
        </Text>
      )}
      <Text style={styles.meta}>
        {mode === 'inbox'
          ? t({ en: `From ${card.sender_id.slice(0, 8)}…`, zh: `来自 ${card.sender_id.slice(0, 8)}…` })
          : t({ en: `To ${card.receiver_hint ?? card.receiver_id?.slice(0, 8) ?? 'link'}…`, zh: `寄给 ${card.receiver_hint ?? card.receiver_id?.slice(0, 8) ?? '链接收件人'}` })}
        {' · '}
        {new Date(card.created_at).toISOString().slice(0, 10)}
      </Text>
    </Pressable>
  );
}

const styles = themedStyles(() => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgPrimary },
  content: { padding: 16, paddingBottom: 40 },
  title: { fontSize: 22, fontWeight: '800', color: colors.textPrimary, marginBottom: 12 },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: colors.bgCard,
    borderRadius: 999,
    padding: 4,
    marginBottom: 16,
  },
  tab: { flex: 1, paddingVertical: 8, borderRadius: 999, alignItems: 'center' },
  tabActive: { backgroundColor: colors.accent },
  tabText: { fontSize: 13, fontWeight: '600', color: colors.textMuted },
  tabTextActive: { color: '#fff' },
  card: {
    backgroundColor: colors.bgCard,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 10,
  },
  cardHighlighted: { borderColor: colors.accent, backgroundColor: colors.accent + '12' },
  cardHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  template: { fontSize: 13, fontWeight: '700', color: colors.textPrimary, textTransform: 'uppercase' },
  statusPill: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.accent,
    backgroundColor: colors.accent + '20',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  message: { fontSize: 14, color: colors.textPrimary, marginBottom: 8, lineHeight: 20 },
  meta: { fontSize: 11, color: colors.textMuted },
  empty: {
    fontSize: 13,
    color: colors.textMuted,
    textAlign: 'center',
    lineHeight: 20,
    marginTop: 40,
    paddingHorizontal: 20,
  },
}));
