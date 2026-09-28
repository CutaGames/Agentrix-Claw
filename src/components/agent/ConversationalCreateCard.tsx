/**
 * ConversationalCreateCard — 对话式创作结果卡片（移动端）。
 *
 * spec: .kiro/specs/world-growth-mobile-experience/{requirements,design}.md
 *   §Components and Interfaces 7（Conversational_Create_Card）
 *   - _Requirements:
 *       6.1 —— `create_shop`/`create_place` 成功 ⇒ 渲染「已开店🎉/已建成🎉 + 封面 + 状态」。
 *       6.2 —— 展示 shareCode 对应的落地页链接（landingUrl）+ 深链（deepLink）+ 一键分享。
 *       6.3 —— 「进入」→ 打开该创作的 CreationDetail / CreationExperience。
 *       6.4 —— 仍在追问缺失必填槽位（need_more_info）⇒ 渲染追问项（missingRequired），
 *              而非成功卡片。
 *       6.5 —— 工具失败 / 质量门不过（rejected/failed）⇒ 渲染可读理由 + 补齐引导，
 *              而非成功卡片。
 *
 * 设计取向：**纯呈现组件**。消费跨端单一来源的 {@link ConversationalCreateResult}
 * （`shared/types/conversational-create`，两条 chat 路径以一致字段透出），据 `status`
 * 渲染四态。把「解析 meta 事件 / 在聊天流挂载本卡」的接线留给 task 8.2
 * （`AgentChatScreen` + `unifiedAgent`/`openclaw.service`）。
 *
 * 封面「绝不黑屏」：与 CreationCard（task 5.2）同口径——`coverUrl` 为可渲染
 * Real_Cover_Image（`isRenderableCover`）时渲染 `<Image>`，否则/加载失败回退到
 * 确定性渐变封面（CoverArt 风格：渐变 + emoji + 标题），复用 Feed 卡片的美学。
 */
import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  Image,
  StyleSheet,
  TouchableOpacity,
  Linking,
  Share,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';

import { useColors, useThemedStyles, type Palette } from '../../theme/useTheme';
import { useI18n } from '../../stores/i18nStore';
import { recordGrowthEvent } from '../../services/growthEvents';
import {
  conversationalCreateCardViewModel,
  type ConversationalCreateResult,
} from '../../../shared/types/conversational-create';

/** 创作类型 → 「进入」的目标 label + 成功标题措辞（6.1）。 */
export type ConversationalCreateKind = 'shop' | 'place';

export interface ConversationalCreateCardProps {
  /** 对话式创作结果（跨端单一来源；据 status 渲染四态）。 */
  result: ConversationalCreateResult;
  /**
   * 该创作类型（决定成功标题「已开店🎉」vs「已建成🎉」及封面 emoji）。
   * 由 task 8.2 从工具名（create_shop / create_place）映射传入;缺省按 'shop'。
   */
  kind?: ConversationalCreateKind;
  /**
   * 「进入」覆盖回调（可选）。未提供时默认经导航打开
   * CreationDetail（有 creationId 时），供 chat 内直接跳转（6.3）。
   */
  onEnter?: (result: ConversationalCreateResult) => void;
}

/** 一组沉稳的封面渐变色（与 CreationCard CoverArt 同款，按 id 哈希确定性挑选）。 */
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
  for (let i = 0; i < s.length; i += 1) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h % mod;
}

/**
 * CoverArt — 无真实封面（非 https / 加载失败）时的确定性渐变封面。
 * 绝不黑屏（R7.5 同口径）：渐变双色 + 类型 emoji + 标题。
 */
function CoverArt({
  seed,
  title,
  emoji,
  styles,
}: {
  seed: string;
  title: string;
  emoji: string;
  styles: ReturnType<typeof makeStyles>;
}) {
  const [c1, c2] = COVER_PALETTES[hashIndex(seed || title || 'x', COVER_PALETTES.length)];
  return (
    <View style={[styles.cover, styles.coverWrap, { backgroundColor: c1 }]}>
      <View style={[styles.coverHalf, { backgroundColor: c1 }]} />
      <View style={[styles.coverHalf, { backgroundColor: c2 }]} />
      <View style={styles.coverOverlay} pointerEvents="none">
        <Text style={styles.coverEmoji}>{emoji}</Text>
        {title ? (
          <Text style={styles.coverTitle} numberOfLines={2}>
            {title}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

/**
 * ConversationalCreateCard — 据 `result.status` 渲染四态：
 *   - created         → 「已开店🎉/已建成🎉 + 封面 + 落地页 + 一键分享 + 进入」（6.1/6.2/6.3）
 *   - need_more_info  → 追问缺失必填槽位（6.4）
 *   - rejected/failed → 可读理由 + 补齐引导（6.5）
 */
export function ConversationalCreateCard({
  result,
  kind = 'shop',
  onEnter,
}: ConversationalCreateCardProps) {
  const c = useColors();
  const styles = useThemedStyles(makeStyles);
  const { t } = useI18n();
  const navigation = useNavigation<any>();

  const [coverFailed, setCoverFailed] = useState(false);

  // 据 status 派生的纯视图模型（四态判定 + affordances；见 shared/types）。
  const vm = conversationalCreateCardViewModel(result, kind);
  const emoji = vm.emoji;

  // ── 「进入」→ CreationDetail / CreationExperience（6.3） ──
  const handleEnter = useCallback(() => {
    if (onEnter) {
      onEnter(result);
      return;
    }
    if (result.creationId) {
      navigation.navigate('CreationDetail', {
        creationId: result.creationId,
        title: result.title,
      });
    }
  }, [onEnter, result, navigation]);

  // ── 一键分享（6.2）：优先落地页链接，回退深链 ──
  const shareUrl = vm.shareUrl;
  const handleShare = useCallback(async () => {
    if (!shareUrl) return;
    const title = result.title || t({ zh: '我的新创作', en: 'My new creation' });
    try {
      await Share.share({
        message: `${title}\n${shareUrl}`,
        url: shareUrl || undefined,
        title,
      });
      recordGrowthEvent({
        eventType: 'share',
        sourceType: 'creation',
        sourceEntityId: result.creationId ?? result.shareCode ?? 'conversational_create',
        channel: 'chat_card',
      });
    } catch {
      // 用户取消分享，静默。
    }
  }, [shareUrl, result, t]);

  const openLanding = useCallback(() => {
    if (result.landingUrl) Linking.openURL(result.landingUrl).catch(() => undefined);
  }, [result.landingUrl]);

  // ── 追问缺失必填槽位（6.4） ──
  if (vm.variant === 'need_more_info') {
    const missing = vm.missingRequired;
    return (
      <View style={styles.card} testID="conversational-create-card-need-more-info">
        <Text style={styles.headline}>✨ {t({ zh: '再补充一点就能开', en: 'Almost there' })}</Text>
        <Text style={styles.body}>
          {t({
            zh: '为了把它做得更像样,还需要你补充这些信息:',
            en: 'To make it great, please add a bit more:',
          })}
        </Text>
        {missing.length > 0 ? (
          <View style={styles.missingList}>
            {missing.map((key) => (
              <View key={key} style={styles.missingItem}>
                <Text style={styles.missingDot}>·</Text>
                <Text style={styles.missingText}>{key}</Text>
              </View>
            ))}
          </View>
        ) : (
          <Text style={styles.body}>
            {t({ zh: '继续在对话里告诉我更多细节即可。', en: 'Just tell me more in the chat.' })}
          </Text>
        )}
        <Text style={styles.hint}>
          {t({ zh: '直接在下面回复补齐即可继续 👇', en: 'Reply below to continue 👇' })}
        </Text>
      </View>
    );
  }

  // ── 失败 / 质量门不过（6.5） ──
  if (vm.variant === 'rejected' || vm.variant === 'failed') {
    const isRejected = vm.isRejected;
    return (
      <View style={styles.card} testID={`conversational-create-card-${result.status}`}>
        <Text style={styles.headline}>
          {isRejected
            ? `🛠️ ${t({ zh: '还差一步', en: 'One more step' })}`
            : `⚠️ ${t({ zh: '暂时没能创建', en: "Couldn't create yet" })}`}
        </Text>
        <Text style={styles.body}>
          {result.reason ||
            (isRejected
              ? t({ zh: '这个创作还没达到发布标准,调整后可重试。', en: 'It didn\'t meet the publish bar yet — tweak and retry.' })
              : t({ zh: '创建过程出了点问题,请稍后重试。', en: 'Something went wrong — please try again.' }))}
        </Text>
        <Text style={styles.hint}>
          {t({
            zh: '在对话里告诉我想怎么调整,我来帮你补齐后重试。',
            en: 'Tell me how to adjust it in the chat and I\'ll retry.',
          })}
        </Text>
      </View>
    );
  }

  // ── 成功:已开店🎉 / 已建成🎉（6.1/6.2/6.3） ──
  const title = result.title || t({ zh: '我的新创作', en: 'My new creation' });
  const showRealCover = vm.hasRenderableCover && !coverFailed;

  return (
    <View style={styles.card} testID="conversational-create-card-created">
      {/* 封面(绝不黑屏):真图 or 渐变兜底 */}
      {showRealCover ? (
        <Image
          testID="conversational-create-card-cover"
          source={{ uri: result.coverUrl }}
          style={styles.cover}
          resizeMode="cover"
          onError={() => setCoverFailed(true)}
        />
      ) : (
        <CoverArt seed={result.creationId ?? result.shareCode ?? title} title={title} emoji={emoji} styles={styles} />
      )}

      <View style={styles.body2}>
        <Text style={styles.successTitle}>
          {kind === 'place'
            ? `🎉 ${t({ zh: '已建成', en: 'It\'s live' })}`
            : `🎉 ${t({ zh: '已开店', en: 'Shop is open' })}`}
        </Text>
        <Text style={styles.creationName} numberOfLines={2}>
          {title}
        </Text>

        {/* 落地页链接(6.2):可点击打开 */}
        {result.landingUrl ? (
          <TouchableOpacity onPress={openLanding} activeOpacity={0.7}>
            <Text style={styles.link} numberOfLines={1}>
              🔗 {result.landingUrl}
            </Text>
          </TouchableOpacity>
        ) : null}

        {/* 行动:一键分享(6.2) + 进入(6.3) */}
        <View style={styles.btnRow}>
          {shareUrl ? (
            <TouchableOpacity
              testID="conversational-create-card-share"
              style={[styles.btn, styles.btnGhost]}
              onPress={handleShare}
              activeOpacity={0.85}
            >
              <Text style={styles.btnGhostText}>↗ {t({ zh: '一键分享', en: 'Share' })}</Text>
            </TouchableOpacity>
          ) : null}
          {result.creationId || onEnter ? (
            <TouchableOpacity
              testID="conversational-create-card-enter"
              style={[styles.btn, styles.btnPrimary]}
              onPress={handleEnter}
              activeOpacity={0.85}
            >
              <Text style={styles.btnPrimaryText}>
                {kind === 'place'
                  ? `🚪 ${t({ zh: '进去逛逛', en: 'Explore' })}`
                  : `🛒 ${t({ zh: '进店看看', en: 'Visit shop' })}`}
              </Text>
            </TouchableOpacity>
          ) : null}
        </View>
      </View>
    </View>
  );
}

function makeStyles(c: Palette) {
  return StyleSheet.create({
    card: {
      backgroundColor: c.bgCard,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: c.border,
      overflow: 'hidden',
      marginTop: 6,
    },
    // ── 成功卡封面 ──
    cover: { width: '100%', height: 160, backgroundColor: c.bgSecondary },
    coverWrap: { flexDirection: 'row', overflow: 'hidden' },
    coverHalf: { flex: 1, height: '100%' },
    coverOverlay: {
      ...StyleSheet.absoluteFillObject,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 20,
    },
    coverEmoji: {
      fontSize: 56,
      marginBottom: 8,
      textShadowColor: 'rgba(0,0,0,0.35)',
      textShadowOffset: { width: 0, height: 2 },
      textShadowRadius: 10,
    },
    coverTitle: {
      color: '#fff',
      fontSize: 18,
      fontWeight: '900',
      textAlign: 'center',
      textShadowColor: 'rgba(0,0,0,0.5)',
      textShadowOffset: { width: 0, height: 1 },
      textShadowRadius: 8,
    },
    body2: { padding: 14, gap: 8 },
    successTitle: { color: c.success, fontSize: 16, fontWeight: '900' },
    creationName: { color: c.textPrimary, fontSize: 15, fontWeight: '700' },
    link: { color: c.accent, fontSize: 12, fontWeight: '600', marginTop: 2 },
    btnRow: { flexDirection: 'row', gap: 8, marginTop: 6 },
    btn: { flex: 1, paddingVertical: 11, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
    btnPrimary: { backgroundColor: c.accent },
    btnPrimaryText: { color: c.textInverse, fontSize: 14, fontWeight: '800' },
    btnGhost: { backgroundColor: 'transparent', borderWidth: 1, borderColor: c.border },
    btnGhostText: { color: c.textPrimary, fontSize: 14, fontWeight: '700' },
    // ── need_more_info / rejected / failed ──
    headline: { color: c.textPrimary, fontSize: 15, fontWeight: '800', padding: 14, paddingBottom: 0 },
    body: { color: c.textSecondary, fontSize: 13, lineHeight: 19, paddingHorizontal: 14, paddingTop: 8 },
    hint: { color: c.textMuted, fontSize: 12, lineHeight: 18, padding: 14, paddingTop: 10 },
    missingList: { paddingHorizontal: 14, paddingTop: 10, gap: 6 },
    missingItem: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
    missingDot: { color: c.accent, fontSize: 14, fontWeight: '900', lineHeight: 20 },
    missingText: { color: c.textPrimary, fontSize: 14, fontWeight: '600', flex: 1, lineHeight: 20 },
  });
}

export default ConversationalCreateCard;
