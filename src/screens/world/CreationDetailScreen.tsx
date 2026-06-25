/**
 * CreationDetailScreen — 创作详情 / 留言 / 分享(World Creation & Feed,task 8.3)。
 *
 * spec: ui-design §7;需求 8.1–8.4。
 *   - 留言:`creationApi.commentCreation`;点赞:`likeCreation`;关注:`followCreator`;
 *     分享:`shareCreation`(深链 + Web 预览兜底);举报:`reportCreation`(需求 3.4)。
 */
import React, { useCallback, useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  Share,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { colors } from '../../theme/colors';
import { useI18n } from '../../stores/i18nStore';
import {
  commentCreation,
  listCreationComments,
  likeCreation,
  followCreator,
  forkCreation,
  shareCreation,
  reportCreation,
} from '../../services/creationApi';
import type { CreationComment } from '../../../shared/types/creation-api';
import { themedStyles } from '../../theme/useTheme';

interface RouteParams { creationId: string; title?: string }

export default function CreationDetailScreen() {
  const { t } = useI18n();
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { creationId, title } = (route.params ?? {}) as RouteParams;

  const [comments, setComments] = useState<CreationComment[]>([]);
  const [draft, setDraft] = useState('');
  const [liked, setLiked] = useState(false);
  const [following, setFollowing] = useState(false);
  const [posting, setPosting] = useState(false);

  // 打开详情时加载已有留言(需求 8.1:留言墙不再总是空的)。
  useEffect(() => {
    let cancelled = false;
    listCreationComments(creationId)
      .then((r) => { if (!cancelled) setComments(r.items ?? []); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [creationId]);

  const onComment = useCallback(async () => {
    const text = draft.trim();
    if (!text) return;
    setPosting(true);
    try {
      const res = await commentCreation(creationId, { text });
      setComments((prev) => [res.comment, ...prev]);
      setDraft('');
    } catch (e: any) {
      Alert.alert(t({ en: 'Comment failed', zh: '留言失败' }), e?.message ?? String(e));
    } finally {
      setPosting(false);
    }
  }, [creationId, draft, t]);

  const onLike = useCallback(async () => {
    const next = !liked;
    setLiked(next);
    try { await likeCreation(creationId, { liked: next }); } catch { setLiked(!next); }
  }, [creationId, liked]);

  const onFollow = useCallback(async () => {
    const next = !following;
    setFollowing(next);
    try { await followCreator(creationId, { following: next }); } catch { setFollowing(!next); }
  }, [creationId, following]);

  const onRemix = useCallback(() => {
    Alert.alert(
      t({ en: 'Remix this creation', zh: 'Remix 这个创作' }),
      t({ en: 'Create your own derivative. When it earns, the original creator gets a 10% lineage royalty.', zh: '基于它做一个你自己的衍生作品。衍生作品每次成交,原作者获得 10% 血缘分润。' }),
      [
        { text: t({ en: 'Cancel', zh: '取消' }), style: 'cancel' },
        {
          text: t({ en: 'Remix', zh: 'Remix' }),
          onPress: () => {
            forkCreation(creationId)
              .then((res) => {
                const c = res.creation;
                navigation.navigate('CreationExperience', { creationId: c.id, type: c.type, title: c.title });
              })
              .catch((e: any) => Alert.alert(t({ en: 'Remix failed', zh: 'Remix 失败' }), e?.message ?? ''));
          },
        },
      ],
    );
  }, [creationId, navigation, t]);

  const onShare = useCallback(async () => {
    try {
      const res = await shareCreation(creationId);
      await Share.share({ message: `${title ?? 'Agentrix'} → ${res.deepLink}\n${res.webPreviewUrl}` });
    } catch (e: any) {
      Alert.alert(t({ en: 'Share failed', zh: '分享失败' }), e?.message ?? String(e));
    }
  }, [creationId, title, t]);

  const onReport = useCallback(() => {
    Alert.alert(
      t({ en: 'Report', zh: '举报' }),
      t({ en: 'Report this creation for review?', zh: '举报这个创作交审核?' }),
      [
        { text: t({ en: 'Cancel', zh: '取消' }), style: 'cancel' },
        {
          text: t({ en: 'Report', zh: '举报' }),
          style: 'destructive',
          onPress: async () => {
            try {
              await reportCreation(creationId, { reporterId: '', reason: 'user report' });
              Alert.alert(t({ en: 'Reported', zh: '已举报' }), t({ en: 'Thanks, our team will review.', zh: '已受理,我们会尽快审核。' }));
            } catch (e: any) {
              Alert.alert(t({ en: 'Report failed', zh: '举报失败' }), e?.message ?? String(e));
            }
          },
        },
      ],
    );
  }, [creationId, t]);

  return (
    <View style={styles.container}>
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => navigation.goBack()}><Text style={styles.backText}>‹ {t({ en: 'Back', zh: '返回' })}</Text></TouchableOpacity>
        <TouchableOpacity onPress={onReport}><Text style={styles.reportText}>⋯ {t({ en: 'Report', zh: '举报' })}</Text></TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.content} testID="creation-detail-scroll">
        <Text style={styles.title}>{title ?? t({ en: 'Creation', zh: '创作' })}</Text>

        <View style={styles.actionRow}>
          <TouchableOpacity style={[styles.actionBtn, liked && styles.actionActive]} onPress={onLike}>
            <Text style={styles.actionText}>{liked ? '♥' : '♡'} {t({ en: 'Like', zh: '点赞' })}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.actionBtn, following && styles.actionActive]} onPress={onFollow}>
            <Text style={styles.actionText}>👤 {following ? t({ en: 'Following', zh: '已关注' }) : t({ en: 'Follow', zh: '关注' })}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionBtn} onPress={onShare}>
            <Text style={styles.actionText}>↗ {t({ en: 'Share', zh: '分享' })}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionBtn} onPress={onRemix} testID="creation-remix-btn">
            <Text style={styles.actionText}>🔀 {t({ en: 'Remix', zh: 'Remix' })}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionBtn} onPress={() => navigation.navigate('CreationExperience', { creationId, title })}>
            <Text style={styles.actionText}>🚪 {t({ en: 'Enter', zh: '进入' })}</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.sectionTitle}>💬 {t({ en: 'Comments', zh: '留言' })} ({comments.length})</Text>
        {comments.map((c) => (
          <View key={c.id} style={styles.commentRow}>
            <Text style={styles.commentAuthor}>{c.authorName ?? t({ en: 'User', zh: '用户' })}</Text>
            <Text style={styles.commentText}>{c.text}</Text>
          </View>
        ))}
        {comments.length === 0 ? <Text style={styles.dim}>{t({ en: 'Be the first to comment.', zh: '来抢沙发。' })}</Text> : null}
      </ScrollView>

      <View style={styles.inputBar}>
        <TextInput
          style={styles.input}
          placeholder={t({ en: 'Say something…', zh: '说点什么…' })}
          placeholderTextColor={colors.textMuted}
          value={draft}
          onChangeText={setDraft}
        />
        <TouchableOpacity style={[styles.sendBtn, (posting || !draft.trim()) && styles.btnDisabled]} onPress={onComment} disabled={posting || !draft.trim()}>
          <Text style={styles.sendText}>{t({ en: 'Send', zh: '发送' })}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = themedStyles(() => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgPrimary },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 56, paddingBottom: 8 },
  backText: { color: colors.textPrimary, fontSize: 16, fontWeight: '600' },
  reportText: { color: colors.textMuted, fontSize: 13 },
  content: { paddingHorizontal: 16, paddingBottom: 100 },
  title: { color: colors.textPrimary, fontSize: 22, fontWeight: '800', marginBottom: 16 },
  actionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 20 },
  actionBtn: { backgroundColor: colors.bgCard, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8, borderWidth: 1, borderColor: colors.border },
  actionActive: { borderColor: colors.accent },
  actionText: { color: colors.textPrimary, fontSize: 13, fontWeight: '600' },
  sectionTitle: { color: colors.textPrimary, fontSize: 16, fontWeight: '700', marginBottom: 10 },
  dim: { color: colors.textMuted, fontSize: 13 },
  commentRow: { backgroundColor: colors.bgCard, borderRadius: 10, padding: 12, marginBottom: 8, borderWidth: 1, borderColor: colors.border },
  commentAuthor: { color: colors.accent, fontSize: 12, fontWeight: '700', marginBottom: 4 },
  commentText: { color: colors.textPrimary, fontSize: 14 },
  inputBar: { flexDirection: 'row', gap: 8, padding: 12, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.bgSecondary },
  input: { flex: 1, backgroundColor: colors.bgCard, borderRadius: 10, borderWidth: 1, borderColor: colors.border, color: colors.textPrimary, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14 },
  sendBtn: { backgroundColor: colors.accent, borderRadius: 10, paddingHorizontal: 18, justifyContent: 'center' },
  btnDisabled: { opacity: 0.5 },
  sendText: { color: '#fff', fontSize: 14, fontWeight: '700' },
}));
