/**
 * CreationDetailScreen — 创作详情 / 留言 / 分享(World Creation & Feed,task 8.3)。
 *
 * spec: ui-design §7;需求 8.1–8.4。
 *   - 留言:`creationApi.commentCreation`;点赞:`likeCreation`;关注:`followCreator`;
 *     分享:`shareCreation`(深链 + Web 预览兜底);举报:`reportCreation`(需求 3.4)。
 */
import React, { useCallback, useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  Share,
  Image,
  ActivityIndicator,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
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
import { preferredPreviewUri, coverDisplayState } from '../../services/creationFeed';
import { navDetailToExperience } from '../../services/creationEnterFlow';
import { recordTapThrough } from '../../services/growthEvents';
import { CoverArt, pickCoverEmoji, TYPE_EMOJI, TYPE_LABEL } from './components/CoverArt';
import { ShopQuickOrder } from './components/ShopQuickOrder';
import type { CreationComment } from '../../../shared/types/creation-api';
import type {
  CreationDiscoveryItem,
  Offering,
  CreationVerb,
} from '../../../shared/types/creation';
import { themedStyles } from '../../theme/useTheme';

interface RouteParams {
  creationId: string;
  title?: string;
  /** task 6.1 · R4.1:Feed 透传的发现投影项(封面/创作者/offerings 来源,避免二次请求)。 */
  item?: CreationDiscoveryItem;
}

/** 可下单动词(Orderable_Offering):含消费类动词的 offering 才在详情作为「可下单项」展示。 */
const ORDERABLE_VERBS: CreationVerb[] = ['order', 'book', 'subscribe', 'donate'];

/** 该 offering 是否可下单(含消费类动词)。 */
function isOrderableOffering(o: Offering): boolean {
  return Array.isArray(o.verbs) && o.verbs.some((v) => ORDERABLE_VERBS.includes(v));
}

export default function CreationDetailScreen() {
  const { t } = useI18n();
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { creationId, title, item } = (route.params ?? {}) as RouteParams;

  const insets = useSafeAreaInsets();
  const [comments, setComments] = useState<CreationComment[]>([]);
  const [draft, setDraft] = useState('');
  const [liked, setLiked] = useState(false);
  const [following, setFollowing] = useState(false);
  const [posting, setPosting] = useState(false);

  // ── task 7.1 · R5.1/5.2/5.3:详情内选中 Orderable_Offering → ShopQuickOrder ──
  // 走服务端权威结算(creationApi.purchaseCreation);成功后可达「我的订单/凭证」
  // (MyOrdersVouchers 屏,listMyOrders / listMyVouchers),校验订单/凭证可见闭环。
  const [orderOpen, setOrderOpen] = useState(false);
  const [orderOfferingId, setOrderOfferingId] = useState<string | null>(null);
  const openQuickOrder = useCallback((offeringId?: string) => {
    setOrderOfferingId(offeringId ?? null);
    setOrderOpen(true);
  }, []);
  const onViewOrders = useCallback(() => {
    navigation.navigate('MyOrdersVouchers');
  }, [navigation]);

  // ── task 6.1 · R4.1:封面 + 创作者 + offerings(可下单项) ──
  // 数据来自 Feed 透传的发现投影项(item),无 get-by-id 端点,避免二次请求;
  // 其余调用方不带 item 时优雅降级(仅标题 + 留言,保持向后兼容)。
  const displayTitle = item?.title ?? title ?? t({ en: 'Creation', zh: '创作' });
  const previewUri = item ? preferredPreviewUri(item) : '';
  const [coverFailed, setCoverFailed] = useState(false);
  const [coverLoading, setCoverLoading] = useState(true);
  const coverState = coverDisplayState({ url: previewUri, loading: coverLoading, failed: coverFailed });
  // 仅当 URL 可渲染(非 generated:// / 非空 / https)且未加载失败时,才尝试加载真图;
  // 否则走 CoverArt 生成式兜底封面(绝不黑屏,R7.5 同口径)。
  const attemptRealCover = !!item && coverState !== 'error';

  // 可下单 offering(含消费动词);展示价 AXP/USD 分开表述(R5.5 合规红线,不呈现兑换比例)。
  const offerings = useMemo<Offering[]>(
    () => (item?.offerings ?? []).filter(isOrderableOffering),
    [item],
  );

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

  // ── task 6.3 · R4.6:Tap_Through 埋点 ──
  // 点击「进入/进去逛逛」= 一次 enter_attempt(fire-and-forget,不阻断导航主流程);
  // 成功打开 Creation_Experience 的 enter_success 在 CreationExperienceScreen 发。
  const onEnter = useCallback(() => {
    recordTapThrough('attempt', creationId);
    // task 6.4:导航意图收敛到纯函数 navDetailToExperience(透传 type/title/item,不丢参数)。
    const intent = navDetailToExperience(creationId, displayTitle, item);
    navigation.navigate(intent.screen, intent.params);
  }, [creationId, item, displayTitle, navigation]);

  return (
    <View style={styles.container}>
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => navigation.goBack()}><Text style={styles.backText}>‹ {t({ en: 'Back', zh: '返回' })}</Text></TouchableOpacity>
        <TouchableOpacity onPress={onReport}><Text style={styles.reportText}>⋯ {t({ en: 'Report', zh: '举报' })}</Text></TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.content} testID="creation-detail-scroll">
        {/* ── 封面(R4.1):真图优先,不可渲染/加载失败 → CoverArt 生成式兜底,绝不黑屏 ── */}
        <View style={styles.coverWrap} testID="creation-detail-cover">
          {attemptRealCover ? (
            <>
              <Image
                testID="creation-detail-cover-image"
                source={{ uri: previewUri }}
                style={styles.cover}
                resizeMode="cover"
                onLoadStart={() => setCoverLoading(true)}
                onLoad={() => setCoverLoading(false)}
                onError={() => setCoverFailed(true)}
              />
              {coverState === 'loading' ? (
                <View style={[styles.cover, styles.coverSkeleton]} pointerEvents="none">
                  <ActivityIndicator color={colors.accent} />
                </View>
              ) : null}
            </>
          ) : item ? (
            <CoverArt
              id={item.id}
              title={displayTitle}
              emoji={pickCoverEmoji(displayTitle, TYPE_EMOJI[item.type] ?? '🌍')}
              typeLabel={TYPE_LABEL[item.type] ?? ''}
              style={styles.cover}
            />
          ) : null}
        </View>

        <Text style={styles.title}>{displayTitle}</Text>

        {/* ── 创作者(R4.1) ── */}
        {item?.creator ? (
          <View style={styles.creatorRow} testID="creation-detail-creator">
            <Text style={styles.creatorEmoji}>{TYPE_EMOJI[item.type] ?? '🌍'}</Text>
            <Text style={styles.creatorName} numberOfLines={1}>
              {item.creator.name ? `@${item.creator.name}` : t({ en: 'Anonymous creator', zh: '匿名创作者' })}
            </Text>
          </View>
        ) : null}

        {item?.summary ? <Text style={styles.summary}>{item.summary}</Text> : null}

        {/* ── offerings(可下单项,R4.1/R5.1):点选任一项 → ShopQuickOrder 走服务端权威结算。
             AXP/USD 分开表述,不呈现固定兑换比例(R5.5 合规红线)。 ── */}
        {offerings.length > 0 ? (
          <View style={styles.offeringsSection} testID="creation-detail-offerings">
            <Text style={styles.sectionTitle}>🛒 {t({ en: 'Available to order', zh: '可下单' })}</Text>
            {offerings.map((o) => (
              <TouchableOpacity
                key={o.id}
                style={styles.offeringRow}
                testID={`creation-detail-offering-${o.id}`}
                accessibilityRole="button"
                accessibilityLabel={t({ en: 'Order this item', zh: '下单此商品' })}
                onPress={() => openQuickOrder(o.id)}
              >
                <View style={styles.offeringInfo}>
                  <Text style={styles.offeringName} numberOfLines={1}>{o.name}</Text>
                  {o.description ? (
                    <Text style={styles.offeringDesc} numberOfLines={2}>{o.description}</Text>
                  ) : null}
                </View>
                <View style={styles.offeringPrices}>
                  {typeof o.price?.axp === 'number' ? (
                    <Text style={styles.priceAxp}>{o.price.axp} AXP</Text>
                  ) : null}
                  {typeof o.price?.usd === 'number' ? (
                    <Text style={styles.priceUsd}>${o.price.usd}</Text>
                  ) : null}
                  {o.price?.axp === undefined && o.price?.usd === undefined ? (
                    <Text style={styles.priceFree}>{t({ en: 'Free', zh: '免费' })}</Text>
                  ) : null}
                  <Text style={styles.orderCta}>{t({ en: 'Order ›', zh: '下单 ›' })}</Text>
                </View>
              </TouchableOpacity>
            ))}
            <Text style={styles.offeringHint}>
              {t({ en: 'Tap an item to order — settled server-side.', zh: '点选商品即可下单,服务端权威结算。' })}
            </Text>
          </View>
        ) : null}

        {/* ── 进入/进去逛逛(R4.1;进入体验的会话/降级在 task 6.2 接线) ── */}
        <TouchableOpacity
          testID="creation-detail-enter"
          style={styles.enterBtn}
          accessibilityRole="button"
          onPress={onEnter}
        >
          <Text style={styles.enterBtnText}>
            {item?.type === 'shop'
              ? `🛒 ${t({ en: 'Enter shop', zh: '进店逛逛' })}`
              : `🚪 ${t({ en: 'Enter', zh: '进去逛逛' })}`}
          </Text>
        </TouchableOpacity>

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
          <TouchableOpacity style={styles.actionBtn} onPress={onEnter}>
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

      {/* task 7.1 · R5.1/5.2/5.3:选中 Orderable_Offering → 服务端权威下单;成功后
          「查看我的订单/凭证」可达 MyOrdersVouchers(listMyOrders / listMyVouchers)。 */}
      {item ? (
        <ShopQuickOrder
          item={item}
          visible={orderOpen}
          onClose={() => setOrderOpen(false)}
          bottomInset={insets.bottom}
          t={t}
          initialOfferingId={orderOfferingId}
          onViewOrders={onViewOrders}
        />
      ) : null}
    </View>
  );
}

const styles = themedStyles(() => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgPrimary },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 56, paddingBottom: 8 },
  backText: { color: colors.textPrimary, fontSize: 16, fontWeight: '600' },
  reportText: { color: colors.textMuted, fontSize: 13 },
  content: { paddingHorizontal: 16, paddingBottom: 100 },

  // 封面 banner(R4.1):16:9 圆角,真图或 CoverArt 兜底。
  coverWrap: { width: '100%', aspectRatio: 16 / 9, borderRadius: 14, overflow: 'hidden', backgroundColor: colors.bgSecondary, marginBottom: 14 },
  cover: { ...StyleSheet.absoluteFillObject, width: '100%', height: '100%' },
  coverSkeleton: { alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bgSecondary },

  title: { color: colors.textPrimary, fontSize: 22, fontWeight: '800', marginBottom: 8 },

  // 创作者
  creatorRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  creatorEmoji: { fontSize: 18 },
  creatorName: { color: colors.textSecondary, fontSize: 15, fontWeight: '700', flexShrink: 1 },
  summary: { color: colors.textSecondary, fontSize: 14, lineHeight: 20, marginBottom: 14 },

  // offerings(可下单项)
  offeringsSection: { marginBottom: 16, gap: 8 },
  offeringRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.bgCard,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  offeringInfo: { flex: 1, marginRight: 12 },
  offeringName: { color: colors.textPrimary, fontSize: 15, fontWeight: '700' },
  offeringDesc: { color: colors.textSecondary, fontSize: 12, marginTop: 2, lineHeight: 16 },
  offeringPrices: { alignItems: 'flex-end', gap: 2 },
  priceAxp: { color: colors.accent, fontSize: 15, fontWeight: '800' },
  priceUsd: { color: colors.textSecondary, fontSize: 12, fontWeight: '600' },
  priceFree: { color: colors.textMuted, fontSize: 13, fontWeight: '600' },
  orderCta: { color: colors.accent, fontSize: 12, fontWeight: '700', marginTop: 2 },
  offeringHint: { color: colors.textMuted, fontSize: 12, marginTop: 2 },

  // 进入按钮
  enterBtn: {
    backgroundColor: colors.accent,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginBottom: 20,
  },
  enterBtnText: { color: colors.textInverse, fontSize: 16, fontWeight: '800' },
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
