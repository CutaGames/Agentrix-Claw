/**
 * PhotoMimicSeasonScreen — G1 宠物模仿秀 MVP (one-screen).
 *
 * Shows current season theme + leaderboard + submit inline modal + vote.
 * Per docs/G1_PHOTO_MIMIC_GAME_2026-05.zh-CN.md §5.
 */
import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  TextInput,
  Alert,
  Image,
  FlatList,
  Modal,
  Pressable,
} from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { colors } from '../../theme/colors';
import { useI18n } from '../../stores/i18nStore';
import { showAxpToast } from '../../stores/axpToastStore';
import {
  fetchCurrentSeason,
  fetchLeaderboard,
  submitMimicEntry,
  castMimicVote,
  fetchTodayVotes,
  type PhotoMimicSeason,
  type PhotoMimicEntry,
} from '../../services/photoMimic.api';
import { themedStyles } from '../../theme/useTheme';

export function PhotoMimicSeasonScreen() {
  const { t } = useI18n();
  const qc = useQueryClient();
  const [showSubmit, setShowSubmit] = useState(false);

  const seasonQ = useQuery({
    queryKey: ['photo-mimic-season'],
    queryFn: fetchCurrentSeason,
    staleTime: 60_000,
  });

  const season = seasonQ.data;

  if (seasonQ.isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.accent} size="large" />
      </View>
    );
  }

  if (!season) {
    return (
      <View style={styles.center}>
        <Text style={styles.emptyEmoji}>📸</Text>
        <Text style={styles.emptyTitle}>{t({ en: 'No active season', zh: '暂无活跃赛季' })}</Text>
        <Text style={styles.emptyBody}>
          {t({ en: 'The next Photo Mimic season will start soon. Check back later!', zh: '下一轮宠物模仿秀即将开启，敬请期待！' })}
        </Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Season header */}
      <View style={styles.header}>
        <Text style={styles.headerEmoji}>📸</Text>
        <Text style={styles.headerTitle}>
          {t({ en: season.theme_title_en || 'Photo Mimic', zh: season.theme_title_zh || '宠物模仿秀' })}
        </Text>
        <Text style={styles.headerDesc}>
          {t({ en: season.theme_desc_en || '', zh: season.theme_desc_zh || '' })}
        </Text>
        <View style={styles.prizeRow}>
          <Text style={styles.prizeLabel}>🏆 {t({ en: 'Prize Pool', zh: '奖金池' })}</Text>
          <Text style={styles.prizeValue}>{Number(season.prize_pool_axp).toLocaleString()} AXP</Text>
        </View>
        <StatusBadge season={season} t={t} />
      </View>

      {/* Submit CTA */}
      {season.status === 'submitting' && (
        <TouchableOpacity style={styles.submitCta} onPress={() => setShowSubmit(true)} activeOpacity={0.85}>
          <Text style={styles.submitCtaText}>📸 {t({ en: 'Enter the contest', zh: '参赛' })}</Text>
        </TouchableOpacity>
      )}

      {/* Leaderboard */}
      <Text style={styles.sectionTitle}>{t({ en: 'Leaderboard', zh: '排行榜' })}</Text>
      <LeaderboardGrid seasonId={season.id} t={t} qc={qc} />

      {/* Submit modal */}
      <SubmitModal
        visible={showSubmit}
        seasonId={season.id}
        onClose={() => setShowSubmit(false)}
        onSuccess={() => {
          setShowSubmit(false);
          qc.invalidateQueries({ queryKey: ['photo-mimic-leaderboard'] });
        }}
        t={t}
      />
    </ScrollView>
  );
}

function StatusBadge({ season, t }: { season: PhotoMimicSeason; t: any }) {
  const now = Date.now();
  let label = '';
  let remaining = '';
  if (season.status === 'submitting') {
    const close = new Date(season.submit_close_at).getTime();
    const days = Math.max(0, Math.ceil((close - now) / 86400_000));
    label = t({ en: 'Submitting', zh: '提交中' });
    remaining = `${days}d`;
  } else if (season.status === 'voting') {
    const close = new Date(season.vote_close_at).getTime();
    const days = Math.max(0, Math.ceil((close - now) / 86400_000));
    label = t({ en: 'Voting', zh: '投票中' });
    remaining = `${days}d`;
  } else {
    label = t({ en: 'Settled', zh: '已结算' });
  }
  return (
    <View style={styles.statusBadge}>
      <Text style={styles.statusText}>{label} · {remaining}</Text>
    </View>
  );
}

function LeaderboardGrid({ seasonId, t, qc }: { seasonId: string; t: any; qc: any }) {
  const lbQ = useQuery({
    queryKey: ['photo-mimic-leaderboard', seasonId],
    queryFn: () => fetchLeaderboard(seasonId),
    staleTime: 30_000,
  });

  const voteMut = useMutation({
    mutationFn: (entryId: string) => castMimicVote(entryId),
    onSuccess: (res) => {
      showAxpToast({
        amount: 0,
        emoji: '🗳',
        reason: { en: `Voted! ${res.daily_votes_remaining} left today`, zh: `已投票 · 今日剩 ${res.daily_votes_remaining} 票` },
      });
      qc.invalidateQueries({ queryKey: ['photo-mimic-leaderboard'] });
    },
    onError: (e: any) => Alert.alert('Vote failed', e?.message ?? 'unknown'),
  });

  if (lbQ.isLoading) return <ActivityIndicator color={colors.accent} style={{ marginTop: 20 }} />;
  const items = lbQ.data?.items ?? [];
  if (items.length === 0) {
    return <Text style={styles.emptyBody}>{t({ en: 'No entries yet. Be the first!', zh: '还没有作品，快来第一个参赛！' })}</Text>;
  }

  return (
    <View style={styles.grid}>
      {items.map((entry, idx) => (
        <View key={entry.id} style={styles.entryCard}>
          <View style={styles.entryImageBox}>
            {entry.sourceImageUrl ? (
              <Image source={{ uri: entry.sourceImageUrl }} style={styles.entryImage} resizeMode="cover" />
            ) : (
              <Text style={styles.entryPlaceholder}>📷</Text>
            )}
            <View style={styles.rankBadge}>
              <Text style={styles.rankText}>#{idx + 1}</Text>
            </View>
          </View>
          <Text style={styles.entryCaption} numberOfLines={1}>{entry.caption || '—'}</Text>
          <View style={styles.entryFooter}>
            <Text style={styles.voteCount}>🗳 {entry.voteCount}</Text>
            <TouchableOpacity
              style={styles.voteBtn}
              onPress={() => voteMut.mutate(entry.id)}
              disabled={voteMut.isPending}
            >
              <Text style={styles.voteBtnText}>{t({ en: 'Vote', zh: '投票' })}</Text>
            </TouchableOpacity>
          </View>
        </View>
      ))}
    </View>
  );
}

function SubmitModal({
  visible,
  seasonId,
  onClose,
  onSuccess,
  t,
}: {
  visible: boolean;
  seasonId: string;
  onClose: () => void;
  onSuccess: () => void;
  t: any;
}) {
  const [imageUrl, setImageUrl] = useState('');
  const [caption, setCaption] = useState('');

  const submitMut = useMutation({
    mutationFn: () =>
      submitMimicEntry({ season_id: seasonId, source_image_url: imageUrl.trim(), caption: caption.trim() || undefined }),
    onSuccess: () => {
      showAxpToast({ amount: 30, emoji: '📸', reason: { en: 'Photo Mimic entry reward', zh: '宠物模仿秀参赛奖励' } });
      setImageUrl('');
      setCaption('');
      onSuccess();
    },
    onError: (e: any) => Alert.alert('Submit failed', e?.message ?? 'unknown'),
  });

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.modalBackdrop} onPress={onClose}>
        <Pressable style={styles.modalSheet} onPress={(e) => e.stopPropagation()}>
          <Text style={styles.modalTitle}>📸 {t({ en: 'Submit your entry', zh: '提交参赛作品' })}</Text>
          <Text style={styles.modalDesc}>
            {t({ en: 'Paste an image URL (from camera roll upload or web). AI will turn it into a pet!', zh: '粘贴图片 URL（相册上传或网络图片）。AI 会把它变成萌宠！' })}
          </Text>
          <TextInput
            style={styles.modalInput}
            value={imageUrl}
            onChangeText={setImageUrl}
            placeholder="https://..."
            placeholderTextColor={colors.textMuted}
            autoCapitalize="none"
          />
          <TextInput
            style={styles.modalInput}
            value={caption}
            onChangeText={setCaption}
            placeholder={t({ en: 'Caption (optional)', zh: '说明（可选）' })}
            placeholderTextColor={colors.textMuted}
          />
          <TouchableOpacity
            style={[styles.modalSubmitBtn, !imageUrl.trim() && { opacity: 0.5 }]}
            onPress={() => submitMut.mutate()}
            disabled={!imageUrl.trim() || submitMut.isPending}
          >
            {submitMut.isPending ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.modalSubmitText}>🚀 {t({ en: 'Submit', zh: '提交' })}</Text>
            )}
          </TouchableOpacity>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = themedStyles(() => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgPrimary },
  content: { padding: 16, paddingBottom: 40 },
  center: { flex: 1, backgroundColor: colors.bgPrimary, alignItems: 'center', justifyContent: 'center', padding: 24 },
  emptyEmoji: { fontSize: 56, marginBottom: 12 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: colors.textPrimary, marginBottom: 8 },
  emptyBody: { fontSize: 13, color: colors.textMuted, textAlign: 'center', lineHeight: 20 },
  header: { alignItems: 'center', marginBottom: 16 },
  headerEmoji: { fontSize: 48, marginBottom: 8 },
  headerTitle: { fontSize: 22, fontWeight: '800', color: colors.textPrimary, textAlign: 'center', marginBottom: 6 },
  headerDesc: { fontSize: 13, color: colors.textMuted, textAlign: 'center', lineHeight: 20, marginBottom: 12 },
  prizeRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  prizeLabel: { fontSize: 13, color: colors.textMuted },
  prizeValue: { fontSize: 18, fontWeight: '800', color: '#fbbf24' },
  statusBadge: { marginTop: 8, backgroundColor: colors.accent + '20', borderRadius: 999, paddingHorizontal: 12, paddingVertical: 4 },
  statusText: { fontSize: 12, fontWeight: '600', color: colors.accent },
  submitCta: { backgroundColor: colors.accent, borderRadius: 14, paddingVertical: 14, alignItems: 'center', marginBottom: 16 },
  submitCtaText: { color: '#0B1220', fontSize: 16, fontWeight: '800' },
  sectionTitle: { fontSize: 14, fontWeight: '700', color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  entryCard: { width: '48%', backgroundColor: colors.bgCard, borderRadius: 14, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' },
  entryImageBox: { width: '100%', aspectRatio: 1, backgroundColor: colors.bgSecondary, alignItems: 'center', justifyContent: 'center' },
  entryImage: { width: '100%', height: '100%' },
  entryPlaceholder: { fontSize: 32 },
  rankBadge: { position: 'absolute', top: 6, left: 6, backgroundColor: 'rgba(0,0,0,0.7)', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  rankText: { fontSize: 10, fontWeight: '700', color: '#fff' },
  entryCaption: { fontSize: 12, color: colors.textPrimary, paddingHorizontal: 8, paddingTop: 6, fontWeight: '600' },
  entryFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 8, paddingVertical: 8 },
  voteCount: { fontSize: 12, color: colors.textMuted },
  voteBtn: { backgroundColor: colors.accent, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5 },
  voteBtnText: { fontSize: 11, fontWeight: '700', color: '#0B1220' },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  modalSheet: { backgroundColor: colors.bgCard, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20 },
  modalTitle: { fontSize: 18, fontWeight: '700', color: colors.textPrimary, marginBottom: 8 },
  modalDesc: { fontSize: 13, color: colors.textMuted, marginBottom: 14, lineHeight: 20 },
  modalInput: { backgroundColor: colors.bgPrimary, borderRadius: 10, padding: 12, fontSize: 14, color: colors.textPrimary, borderWidth: 1, borderColor: colors.border, marginBottom: 10 },
  modalSubmitBtn: { backgroundColor: colors.accent, borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginTop: 4 },
  modalSubmitText: { color: '#0B1220', fontSize: 15, fontWeight: '800' },
}));
