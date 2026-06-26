/**
 * CreationCard —「带类型卡片协议」组件(World Creation & Feed · task 3.4)。
 *
 * spec: .kiro/specs/world-creation-feed/{requirements,design,ui-design}.md
 *   - 对照 ui-design.md §3「创作流 Feed」:全屏沉浸预览 + 右侧互动条 + 底部信息 +
 *     随 CreationType 变化的主行动。
 *   - _Requirements:
 *       5.3 —— 统一「带类型卡片协议」:同一流内混排 game/shop/livestream/stage/place,
 *             每类给出与类型匹配的主行动(▶️玩 / 🛒买 / 🔴看 / 🎤现场 / 🚪逛)。
 *       5.4 —— 卡片内联互动入口:点赞 / 留言 / 分享 / 关注创作者(+ 举报,需求 5.10)。
 *       5.5 —— 点赞/留言/分享/关注即时反馈并更新对应计数(乐观更新)。
 *
 * 设计要点(与相邻任务的边界):
 *   - **预览 vs 进入分离(需求 5.2)**:本卡只渲染轻量预览物(封面/首帧),
 *     主行动是**显式动作**,点击才进入/下单(滑动期间不实例化体验)。
 *   - **slot for 3.5(shop 流内快捷下单)**:`onShopOrder` —— 提供则 shop 主行动走它
 *     (3.5 填入数量+下单组件);未提供时回退到 `onEnter`(进入完整体验下单)。
 *   - **slot for 3.6(livestream/stage 直接进入 + 预加载)**:`onLivestreamEnter`、
 *     `isActive`(当前居中卡)预留给进行中直播自动高亮/直接进入。
 *   - **slot for 8.3(创作详情/留言页)**:`onOpenComments` —— 提供则留言按钮跳详情页;
 *     未提供时本卡内置轻量留言 composer(自洽,不依赖 8.3)。
 *
 * 互动一律走 `creationApi`(likeCreation/commentCreation/shareCreation/followCreator/
 * reportCreation),失败回滚乐观状态;计数初值取 `item.metrics`。
 */
import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Image,
  Pressable,
  Modal,
  TextInput,
  Share,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';

import { colors } from '../../../theme/colors';
import {
  likeCreation,
  commentCreation,
  shareCreation,
  followCreator,
  reportCreation,
} from '../../../services/creationApi';
import {
  isLiveType,
  isCreationLiveNow,
  preferredPreviewUri,
} from '../../../services/creationFeed';
import { useAuthStore } from '../../../stores/authStore';
import type {
  CreationDiscoveryItem,
  CreationType,
} from '../../../../shared/types/creation';
import { themedStyles } from '../../../theme/useTheme';

type Translate = (d: { zh: string; en: string }) => string;

/** 创作类型 → 预览占位表意 emoji(无预览图时的轻量兜底)。 */
const TYPE_EMOJI: Record<CreationType, string> = {
  game: '🎮',
  drama: '🎭',
  shop: '🛒',
  livestream: '🔴',
  stage: '🎤',
  place: '🚪',
};

/**
 * 创作类型 → 主行动文案(需求 5.3)。
 * game ▶️玩 / drama 🎭看·选 / shop 🛒买 / livestream 🔴看 / stage 🎤现场 / place 🚪逛。
 */
const TYPE_ACTION: Record<CreationType, { zh: string; en: string }> = {
  game: { zh: '▶️ 开始玩', en: '▶️ Play' },
  drama: { zh: '🎭 开始看', en: '🎭 Watch' },
  shop: { zh: '🛒 进店下单', en: '🛒 Shop' },
  livestream: { zh: '🔴 进入直播', en: '🔴 Watch live' },
  stage: { zh: '🎤 进入现场', en: '🎤 Enter stage' },
  place: { zh: '🚪 进去逛逛', en: '🚪 Explore' },
};

/** 创作类型 → 角标中文短标签(封面右上)。 */
const TYPE_LABEL: Record<CreationType, string> = {
  game: '游戏',
  drama: '互动剧',
  shop: '店铺',
  livestream: '直播',
  stage: '舞台',
  place: '场所',
};

/** 一组沉稳的封面渐变色(按 id 哈希确定性挑选,保证同一创作封面稳定)。 */
const COVER_PALETTES: [string, string][] = [
  ['#4b2a6b', '#7c3aed'],
  ['#1e3a8a', '#2563eb'],
  ['#0f5132', '#16a34a'],
  ['#7a3b2e', '#ea580c'],
  ['#4a148c', '#c2185b'],
  ['#0e3a4a', '#0891b2'],
  ['#3a1f3d', '#9d174d'],
];

function hashIndex(s: string, mod: number): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h % mod;
}

/** 按标题关键字挑一个更贴题的封面图标(避免所有游戏都是同一个 🎮)。 */
function pickCoverEmoji(title: string, fallback: string): string {
  const s = (title || '').toLowerCase();
  const rules: [RegExp, string][] = [
    [/2048/, '🔢'],
    [/俄罗斯方块|tetris|方块/, '🧱'],
    [/五子棋|gomoku|围棋|象棋|棋/, '⚫'],
    [/消消乐|match|宝石|消除/, '💎'],
    [/飞行射击|雷电|射击|shoot|弹幕|战机/, '🚀'],
    [/pong|弹球|乒乓|打砖块|breakout/, '🏓'],
    [/hextris|六边形|hex/, '🔷'],
    [/塔防|tower\s*defense/, '🗼'],
    [/贪吃蛇|snake/, '🐍'],
    [/扑克|poker|德州|纸牌|card/, '🃏'],
    [/赛车|race|racing|drift/, '🏎️'],
    [/拼图|puzzle|益智/, '🧩'],
    [/迷宫|maze/, '🧭'],
    [/钢琴|音乐|music|节奏|rhythm/, '🎹'],
    [/恋爱|心动|甜宠|romance|爱情/, '💗'],
    [/悬疑|推理|侦探|mystery|案/, '🕵️'],
    [/剧|drama|story|story/, '🎭'],
  ];
  for (const [re, emoji] of rules) if (re.test(s)) return emoji;
  return fallback;
}

/**
 * CoverArt — 无预览图时的生成式封面(确定性渐变 + 大表意图标 + 标题 + 类型角标)。
 * 让所有缺图的种子/创作都有一个像样的"封面",分享海报与卡片均受益(无需后端/图床)。
 */
function CoverArt({ id, title, emoji, typeLabel }: { id: string; title: string; emoji: string; typeLabel: string }) {
  const [c1, c2] = COVER_PALETTES[hashIndex(id || title, COVER_PALETTES.length)];
  return (
    <View style={[styles.previewImage, styles.coverWrap, { backgroundColor: c1 }]}>
      <View style={[styles.coverHalf, { backgroundColor: c1 }]} />
      <View style={[styles.coverHalf, { backgroundColor: c2 }]} />
      <View style={styles.coverOverlay} pointerEvents="none">
        {typeLabel ? (
          <View style={styles.coverTypeChip}><Text style={styles.coverTypeText}>{typeLabel}</Text></View>
        ) : null}
        <Text style={styles.coverEmoji}>{emoji}</Text>
        <Text style={styles.coverTitle} numberOfLines={2}>{title}</Text>
      </View>
    </View>
  );
}

/** 举报原因预设(需求 5.10 举报入口)。 */
const REPORT_REASONS: { key: string; label: { zh: string; en: string } }[] = [
  { key: 'inappropriate', label: { zh: '违规/不适内容', en: 'Inappropriate' } },
  { key: 'spam', label: { zh: '垃圾广告', en: 'Spam' } },
  { key: 'scam', label: { zh: '欺诈/虚假', en: 'Scam' } },
  { key: 'other', label: { zh: '其他', en: 'Other' } },
];

/** 紧凑计数展示(1200 → 1.2k)。 */
export function compactCount(n: number): string {
  if (n < 1000) return String(n);
  if (n < 1_000_000) return `${(n / 1000).toFixed(n % 1000 === 0 ? 0 : 1)}k`;
  return `${(n / 1_000_000).toFixed(1)}m`;
}

export interface CreationCardProps {
  /** 发现投影项(卡片渲染所需信息已齐备,无需二次请求,需求 1.8)。 */
  item: CreationDiscoveryItem;
  /** 单卡高度(= 分页容器高,保证整屏吸附)。 */
  height: number;
  /** 顶部安全区(留给顶部排序条,避免遮挡)。 */
  topInset: number;
  /** 底部安全区。 */
  bottomInset: number;
  /** 是否当前居中卡(task 3.6:用于决定下一张预加载;直播态由 schedule 派生,不依赖此)。 */
  isActive: boolean;
  /** 进入完整体验(显式动作;需求 5.2)。game/place 主行动默认走此。 */
  onEnter: (item: CreationDiscoveryItem) => void;
  /** i18n 翻译函数。 */
  t: Translate;
  /**
   * task 3.6:省流模式。开启时抑制自动预加载/视频自动播放,预览只取静态缩略图(需求 5.10)。
   */
  dataSaver?: boolean;
  /**
   * task 3.7:是否渲染重型预览物(默认 true)。
   * 由屏幕用 `shouldRenderPreview(index, activeIndex)` 计算:仅近屏窗口(当前卡 ± 半径)
   * 内渲染图片/视频;离屏卡传 false → 回收为轻量占位,释放资源,保证滑动帧率(需求 5.2/5.6)。
   */
  renderPreview?: boolean;
  /** slot(task 3.5):shop 流内快捷下单;未提供时 shop 回退到 onEnter。 */
  onShopOrder?: (item: CreationDiscoveryItem) => void;
  /**
   * slot(task 3.6):livestream/stage **进行中**时直接进入直播/现场(需求 5.8);
   * 未提供或活动未进行时回退到 onEnter(进入预览/详情)。
   */
  onLivestreamEnter?: (item: CreationDiscoveryItem) => void;
  /** slot(task 8.3):留言按钮跳创作详情/留言页;未提供时使用内置轻量 composer。 */
  onOpenComments?: (item: CreationDiscoveryItem) => void;
}

/**
 * 「带类型卡片协议」卡片。完整渲染:预览物 + 底部信息 + 类型主行动 + 右侧互动条。
 * 替换 CreationFeedScreen 中 task 3.3 的占位卡体。
 */
export const CreationCard = React.memo(function CreationCard({
  item,
  height,
  topInset,
  bottomInset,
  isActive: _isActive,
  onEnter,
  t,
  dataSaver = false,
  renderPreview = true,
  onShopOrder,
  onLivestreamEnter,
  onOpenComments,
}: CreationCardProps) {
  const currentAccountId = useAuthStore((s) => s.user?.id);
  const navigation = useNavigation<any>();

  // ── 互动乐观状态(需求 5.5:即时反馈 + 更新计数) ──
  const [liked, setLiked] = useState(false);
  const [likeCount, setLikeCount] = useState(item.metrics.likes);
  const [following, setFollowing] = useState(false);
  const [commentCount, setCommentCount] = useState(item.metrics.comments);

  // 内置留言 composer(onOpenComments 未提供时启用)
  const [commentOpen, setCommentOpen] = useState(false);
  const [commentText, setCommentText] = useState('');
  const [commentSubmitting, setCommentSubmitting] = useState(false);

  // 举报弹层
  const [reportOpen, setReportOpen] = useState(false);
  const [reportSubmitting, setReportSubmitting] = useState(false);

  const previewUri = preferredPreviewUri(item, dataSaver);
  const hasPreview = previewUri.length > 0;
  // task 3.7:离屏卡(renderPreview=false)回收重型预览图,只显示轻量占位,释放内存。
  const showPreviewImage = hasPreview && renderPreview;
  const typeEmoji = TYPE_EMOJI[item.type] ?? '🌍';
  const creatorAccountId = item.creator?.accountId ?? '';
  const isOwnCreation = !!currentAccountId && currentAccountId === creatorAccountId;

  // ── 直播/现场是否"正在进行"(需求 5.8;从 offerings 可用时段派生,见 creationFeed) ──
  const live = isLiveType(item) && isCreationLiveNow(item);

  // ── 主行动:按 CreationType 路由(需求 5.3) ──
  const onMainAction = useCallback(() => {
    switch (item.type) {
      case 'shop':
        // 3.5 流内快捷下单优先;否则进入完整体验内下单(需求 5.7 的进入路径)。
        (onShopOrder ?? onEnter)(item);
        break;
      case 'livestream':
      case 'stage':
        // 3.6:活动进行中直接进入直播/现场(需求 5.8);未开始/已结束回退到预览/进入。
        if (live) {
          (onLivestreamEnter ?? onEnter)(item);
        } else {
          onEnter(item);
        }
        break;
      default:
        onEnter(item);
    }
  }, [item, live, onEnter, onShopOrder, onLivestreamEnter]);

  // ── 点赞(乐观,幂等;需求 5.5 / 8.2) ──
  const onToggleLike = useCallback(async () => {
    const next = !liked;
    setLiked(next);
    setLikeCount((c) => Math.max(0, c + (next ? 1 : -1)));
    try {
      const r = await likeCreation(item.id, { liked: next });
      setLiked(r.liked);
      setLikeCount(r.likeCount);
    } catch {
      // 回滚乐观更新
      setLiked(!next);
      setLikeCount((c) => Math.max(0, c + (next ? -1 : 1)));
    }
  }, [liked, item.id]);

  // ── 关注创作者(乐观;需求 5.5 / 8.3) ──
  const onToggleFollow = useCallback(async () => {
    if (!creatorAccountId || isOwnCreation) return;
    const next = !following;
    setFollowing(next);
    try {
      const r = await followCreator(item.id, { following: next });
      setFollowing(r.following);
    } catch {
      setFollowing(!next);
    }
  }, [following, item.id, creatorAccountId, isOwnCreation]);

  // ── 分享(乐观反馈 + 系统分享面;需求 5.5 / 8.4) ──
  const onShare = useCallback(async () => {
    try {
      const r = await shareCreation(item.id);
      const url = r.webPreviewUrl || r.deepLink;
      const catLabel = ({ game: '🎮 游戏', drama: '🎭 互动剧', shop: '🛒 店铺', livestream: '🔴 直播', stage: '🎤 舞台', place: '🚪 场所' } as Record<string, string>)[item.type] || '🎮 游戏';
      const accent = ({ game: ['#1e3a8a', '#2563eb'], drama: ['#4b2a6b', '#9d174d'], shop: ['#0f5132', '#16a34a'], livestream: ['#7a1f2e', '#ef4444'], stage: ['#3a1f3d', '#c2185b'], place: ['#0e3a4a', '#0891b2'] } as Record<string, [string, string]>)[item.type] || ['#5b8cff', '#7c3aed'];
      // 海报式分享(与 skill/商品一致):跳 ShareCard,带真实封面图 + 二维码 + 截图分享。
      navigation.navigate('ShareCard', {
        shareUrl: url || `https://agentrix.top/c/${item.id}`,
        title: item.title,
        subtitle: t({ en: 'Play on Agentrix', zh: '来 Agentrix 一起玩' }),
        headerEmoji: TYPE_EMOJI[item.type] ?? '🎮',
        imageUrl: previewUri || undefined,
        categoryLabel: catLabel,
        description: item.summary,
        ctaLabel: t({ en: 'Scan to play', zh: '扫码即玩' }),
        accentFrom: accent[0],
        accentTo: accent[1],
      });
    } catch {
      // 失败兜底:退回系统分享(纯链接)。
      try {
        const r = await shareCreation(item.id);
        const url = r.deepLink || r.webPreviewUrl;
        await Share.share({ message: `${item.title}${url ? `\n${url}` : ''}`, url: url || undefined, title: item.title });
      } catch { /* 静默 */ }
    }
  }, [item.id, item.title, item.type, item.summary, previewUri, navigation, t]);

  // ── 留言:有 onOpenComments 则跳详情页(8.3),否则内置 composer ──
  const onCommentPress = useCallback(() => {
    if (onOpenComments) {
      onOpenComments(item);
      return;
    }
    setCommentOpen(true);
  }, [onOpenComments, item]);

  const submitComment = useCallback(async () => {
    const text = commentText.trim();
    if (!text || commentSubmitting) return;
    setCommentSubmitting(true);
    // 乐观:先更新计数,失败回滚。
    setCommentCount((c) => c + 1);
    try {
      const r = await commentCreation(item.id, { text });
      setCommentCount(r.commentCount);
      setCommentText('');
      setCommentOpen(false);
    } catch {
      setCommentCount((c) => Math.max(0, c - 1));
      Alert.alert(t({ zh: '留言失败', en: 'Comment failed' }), t({ zh: '请稍后重试。', en: 'Please try again.' }));
    } finally {
      setCommentSubmitting(false);
    }
  }, [commentText, commentSubmitting, item.id, t]);

  // ── 举报(需求 5.10) ──
  const submitReport = useCallback(
    async (reasonKey: string, reasonLabel: string) => {
      if (reportSubmitting) return;
      setReportSubmitting(true);
      try {
        await reportCreation(item.id, {
          reporterId: currentAccountId ?? 'anonymous',
          reason: reasonKey,
        });
        setReportOpen(false);
        Alert.alert(
          t({ zh: '举报已提交', en: 'Report submitted' }),
          t({ zh: `我们会尽快审核「${reasonLabel}」。`, en: `We'll review "${reasonLabel}" soon.` }),
        );
      } catch {
        Alert.alert(t({ zh: '举报失败', en: 'Report failed' }), t({ zh: '请稍后重试。', en: 'Please try again.' }));
      } finally {
        setReportSubmitting(false);
      }
    },
    [reportSubmitting, item.id, currentAccountId, t],
  );

  const canEnter = item.canEnter;

  // 主行动文案:实时类活动未进行时给出"未开始"态文案(仍可点开预览/详情)。
  const mainActionLabel = isLiveType(item) && !live
    ? item.type === 'livestream'
      ? { zh: '🔴 直播未开始 · 看详情', en: '🔴 Offline · Details' }
      : { zh: '🎤 演出未开始 · 看详情', en: '🎤 Not started · Details' }
    : TYPE_ACTION[item.type] ?? TYPE_ACTION.place;

  return (
    <View style={[styles.card, { height }]}>
      {/* ── 预览物区(全屏沉浸,轻量;不实例化体验,需求 5.2) ── */}
      {showPreviewImage ? (
        <Image source={{ uri: previewUri }} style={styles.previewImage} resizeMode="cover" />
      ) : (
        <CoverArt id={item.id} title={item.title} emoji={pickCoverEmoji(item.title, typeEmoji)} typeLabel={TYPE_LABEL[item.type] ?? ''} />
      )}

      {/* 底部压暗,提升文字可读性 */}
      <View style={styles.scrim} pointerEvents="none" />

      {/* ── 右侧互动条(需求 5.4:赞/评/享/关注/举报) ── */}
      <View style={[styles.sideBar, { bottom: bottomInset + 140, top: topInset + 56 }]}>
        <SideAction
          testID={`creation-card-like-${item.id}`}
          icon={liked ? '❤️' : '🤍'}
          label={compactCount(likeCount)}
          active={liked}
          onPress={onToggleLike}
          accessibilityLabel={t({ zh: '点赞', en: 'Like' })}
        />
        <SideAction
          testID={`creation-card-comment-${item.id}`}
          icon="💬"
          label={compactCount(commentCount)}
          onPress={onCommentPress}
          accessibilityLabel={t({ zh: '留言', en: 'Comment' })}
        />
        <SideAction
          testID={`creation-card-share-${item.id}`}
          icon="↗"
          label={t({ zh: '分享', en: 'Share' })}
          onPress={onShare}
          accessibilityLabel={t({ zh: '分享', en: 'Share' })}
        />
        {!isOwnCreation ? (
          <SideAction
            testID={`creation-card-follow-${item.id}`}
            icon={following ? '✓' : '👤＋'}
            label={following ? t({ zh: '已关注', en: 'Following' }) : t({ zh: '关注', en: 'Follow' })}
            active={following}
            onPress={onToggleFollow}
            accessibilityLabel={t({ zh: '关注创作者', en: 'Follow creator' })}
          />
        ) : null}
        <SideAction
          testID={`creation-card-report-${item.id}`}
          icon="⋯"
          label={t({ zh: '举报', en: 'Report' })}
          onPress={() => setReportOpen(true)}
          accessibilityLabel={t({ zh: '举报', en: 'Report' })}
        />
      </View>

      {/* ── 底部信息 + 类型主行动 ── */}
      <View style={[styles.bottomInfo, { paddingBottom: bottomInset + 24 }]}>
        <Text style={styles.creator} numberOfLines={1}>
          {typeEmoji} {item.creator?.name ? `@${item.creator.name}` : t({ zh: '匿名创作者', en: 'Anonymous' })}
        </Text>
        <Text style={styles.title} numberOfLines={2}>
          {item.title}
        </Text>
        {item.summary ? (
          <Text style={styles.summary} numberOfLines={2}>
            {item.summary}
          </Text>
        ) : null}

        {/* 标签条:类型 / 地理 / 商家(来自发现投影,无需二次请求) */}
        <View style={styles.tagRow}>
          <Text style={styles.tag}>{t({ zh: 'AI 生成', en: 'AI made' })}</Text>
          {item.geo ? <Text style={styles.tag}>📍{t({ zh: '地图', en: 'Map' })}</Text> : null}
          {item.poi ? <Text style={styles.tag}>🏪{item.poi.name}</Text> : null}
          {item.type === 'shop' ? <Text style={styles.tag}>🛒{t({ zh: '可下单', en: 'Shop' })}</Text> : null}
          {isLiveType(item) ? (
            live ? (
              <Text style={[styles.tag, styles.liveTag]}>🔴 {t({ zh: '进行中', en: 'LIVE' })}</Text>
            ) : (
              <Text style={styles.tag}>⏳ {t({ zh: '未开始', en: 'Upcoming' })}</Text>
            )
          ) : null}
        </View>

        {/* 主行动(随 CreationType 变;需求 5.3):显式进入/下单,滑动不触发。 */}
        <Pressable
          testID={`creation-card-action-${item.id}`}
          accessibilityRole="button"
          style={({ pressed }) => [
            styles.mainAction,
            !canEnter && styles.mainActionDisabled,
            pressed && canEnter && styles.mainActionPressed,
          ]}
          onPress={onMainAction}
          disabled={!canEnter}
        >
          <Text style={styles.mainActionText}>{t(mainActionLabel)}</Text>
        </Pressable>

        <Text style={styles.swipeHint}>▲ {t({ zh: '上滑看下一个创作', en: 'Swipe up for next' })}</Text>
      </View>

      {/* ── 内置留言 composer(onOpenComments 未提供时) ── */}
      <Modal
        visible={commentOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setCommentOpen(false)}
      >
        <Pressable style={styles.modalBackdrop} onPress={() => setCommentOpen(false)}>
          <Pressable style={[styles.sheet, { paddingBottom: bottomInset + 16 }]} onPress={() => {}}>
            <Text style={styles.sheetTitle}>💬 {t({ zh: '说点什么', en: 'Say something' })}</Text>
            <TextInput
              testID={`creation-card-comment-input-${item.id}`}
              style={styles.commentInput}
              placeholder={t({ zh: '友善留言…', en: 'Be kind…' })}
              placeholderTextColor={colors.textMuted}
              value={commentText}
              onChangeText={setCommentText}
              multiline
              maxLength={500}
              autoFocus
            />
            <Pressable
              testID={`creation-card-comment-submit-${item.id}`}
              accessibilityRole="button"
              style={({ pressed }) => [
                styles.sheetBtn,
                (!commentText.trim() || commentSubmitting) && styles.sheetBtnDisabled,
                pressed && styles.mainActionPressed,
              ]}
              onPress={submitComment}
              disabled={!commentText.trim() || commentSubmitting}
            >
              {commentSubmitting ? (
                <ActivityIndicator color={colors.textInverse} />
              ) : (
                <Text style={styles.sheetBtnText}>{t({ zh: '发送', en: 'Send' })}</Text>
              )}
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      {/* ── 举报弹层 ── */}
      <Modal
        visible={reportOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setReportOpen(false)}
      >
        <Pressable style={styles.modalBackdrop} onPress={() => setReportOpen(false)}>
          <Pressable style={[styles.sheet, { paddingBottom: bottomInset + 16 }]} onPress={() => {}}>
            <Text style={styles.sheetTitle}>⚠️ {t({ zh: '举报这个创作', en: 'Report this creation' })}</Text>
            {REPORT_REASONS.map((r) => (
              <Pressable
                key={r.key}
                testID={`creation-card-report-reason-${r.key}`}
                accessibilityRole="button"
                style={({ pressed }) => [styles.reasonRow, pressed && styles.reasonRowPressed]}
                onPress={() => submitReport(r.key, t(r.label))}
                disabled={reportSubmitting}
              >
                <Text style={styles.reasonText}>{t(r.label)}</Text>
              </Pressable>
            ))}
            {reportSubmitting ? <ActivityIndicator color={colors.accent} style={{ marginTop: 8 }} /> : null}
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
});

/** 右侧互动条单项(图标 + 计数/文案)。 */
function SideAction({
  icon,
  label,
  onPress,
  active,
  testID,
  accessibilityLabel,
}: {
  icon: string;
  label: string;
  onPress: () => void;
  active?: boolean;
  testID?: string;
  accessibilityLabel?: string;
}) {
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={({ pressed }) => [styles.sideItem, pressed && styles.sideItemPressed]}
    >
      <Text style={[styles.sideIcon, active && styles.sideIconActive]}>{icon}</Text>
      <Text style={styles.sideLabel}>{label}</Text>
    </Pressable>
  );
}

const styles = themedStyles(() => StyleSheet.create({
  card: { width: '100%', backgroundColor: '#000', position: 'relative' },
  previewImage: { ...StyleSheet.absoluteFillObject, width: '100%', height: '100%' },
  previewPlaceholder: { backgroundColor: colors.bgSecondary, alignItems: 'center', justifyContent: 'center' },
  previewPlaceholderEmoji: { fontSize: 80, opacity: 0.5 },
  coverWrap: { overflow: 'hidden' },
  coverHalf: { flex: 1 },
  coverOverlay: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28 },
  coverTypeChip: { position: 'absolute', top: '18%', backgroundColor: 'rgba(0,0,0,0.35)', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 4 },
  coverTypeText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  coverEmoji: { fontSize: 96, marginBottom: 18, textShadowColor: 'rgba(0,0,0,0.35)', textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 10 },
  coverTitle: { color: '#fff', fontSize: 24, fontWeight: '900', textAlign: 'center', textShadowColor: 'rgba(0,0,0,0.5)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 8 },
  scrim: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: '45%',
    backgroundColor: 'rgba(0,0,0,0.28)',
  },

  // 右侧互动条
  sideBar: { position: 'absolute', right: 12, alignItems: 'center', justifyContent: 'flex-end', gap: 20 },
  sideItem: { alignItems: 'center', gap: 4 },
  sideItemPressed: { opacity: 0.6 },
  sideIcon: { color: '#fff', fontSize: 28, textAlign: 'center' },
  sideIconActive: { color: colors.accent },
  sideLabel: { color: '#fff', fontSize: 12, fontWeight: '600' },

  // 底部信息
  bottomInfo: { position: 'absolute', left: 0, right: 72, bottom: 0, paddingHorizontal: 16, gap: 6 },
  creator: { color: '#fff', fontSize: 15, fontWeight: '700' },
  title: { color: '#fff', fontSize: 18, fontWeight: '800', lineHeight: 24 },
  summary: { color: 'rgba(255,255,255,0.85)', fontSize: 13, lineHeight: 18 },
  tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 2 },
  tag: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '600',
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    overflow: 'hidden',
  },
  liveTag: { backgroundColor: colors.danger },
  mainAction: {
    marginTop: 10,
    backgroundColor: colors.accent,
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: 'center',
  },
  mainActionPressed: { opacity: 0.8 },
  mainActionDisabled: { backgroundColor: colors.border },
  mainActionText: { color: colors.textInverse, fontSize: 16, fontWeight: '800' },
  swipeHint: { color: 'rgba(255,255,255,0.6)', fontSize: 11, textAlign: 'center', marginTop: 6 },

  // Modals(留言 / 举报)
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: colors.bgCard,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    padding: 16,
    gap: 12,
  },
  sheetTitle: { color: colors.textPrimary, fontSize: 16, fontWeight: '800' },
  commentInput: {
    backgroundColor: colors.input,
    borderRadius: 12,
    padding: 12,
    minHeight: 80,
    color: colors.textPrimary,
    fontSize: 15,
    textAlignVertical: 'top',
  },
  sheetBtn: {
    backgroundColor: colors.accent,
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: 'center',
  },
  sheetBtnDisabled: { backgroundColor: colors.border },
  sheetBtnText: { color: colors.textInverse, fontSize: 16, fontWeight: '800' },
  reasonRow: {
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: colors.input,
  },
  reasonRowPressed: { opacity: 0.6 },
  reasonText: { color: colors.textPrimary, fontSize: 15, fontWeight: '600' },
}));

export default CreationCard;
