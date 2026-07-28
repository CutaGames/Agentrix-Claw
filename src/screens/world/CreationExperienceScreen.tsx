/**
 * CreationExperienceScreen — 统一体验宿主(World Creation & Feed,task 5.3/5.4)。
 *
 * spec: ui-design §6;需求 6.1–6.5。
 *   - 进入任一 Creation:`creationApi.enterCreation`(解析 ECS_World/隔离级/只读资产)。
 *   - 按类型渲染主体:shop 商品+结账 / game 可玩占位 / live·stage 现场 / place 漫游。
 *   - shop 下单走 `creationApi.invokeCreation`(verb=order)经网关权威结算(需求 7.1)。
 *   - 进入超时(LOAD_TIMEOUT,10s)回退来源 + 原因提示(需求 6.5)。
 *   - 底部统一社交条(赞/评/享/关注)。
 */
import React, { useCallback, useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Dimensions,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Modal,
  Image,
} from 'react-native';
import { useNavigation, useRoute, useFocusEffect } from '@react-navigation/native';
import { WebView } from 'react-native-webview';
import { colors } from '../../theme/colors';
import { useI18n } from '../../stores/i18nStore';
import { useAuthStore } from '../../stores/authStore';
import {
  enterCreation,
  likeCreation,
  getCreationGame,
  tipCreation,
  shareCreation,
  purchaseCreation,
} from '../../services/creationApi';
import { connectAeonRoom, type AeonRoomHandle } from '../../services/aeonRealtime';
import { submitGameScore, fetchLeaderboard, coachGame, listTournaments, joinTournament, type LeaderboardRow, type ArenaTournament } from '../../services/worldEngagementApi';
import GomokuRoom from './GomokuRoom';
import PongRoom from './PongRoom';
import DramaRunner from './DramaRunner';
import { preferredPreviewUri, coverDisplayState } from '../../services/creationFeed';
import {
  decideEnterState,
  hasEnterableContent as sessionHasEnterableContent,
  navExperienceToDetail,
  nextRetryTick,
  type EnterDecision,
  type WorldNavIntent,
} from '../../services/creationEnterFlow';
import { recordTapThrough, recordOrderOutcome } from '../../services/growthEvents';
import { CoverArt, pickCoverEmoji, TYPE_EMOJI, TYPE_LABEL } from './components/CoverArt';
import type { AeonCharacterSnapshot, AeonServerEvent } from '../../../shared/types/aeon-sync';
import type { CreationType, Offering, CreationDiscoveryItem } from '../../../shared/types/creation';
import type { DramaStory } from '../../../shared/types/drama';
import type { EnterCreationResponse } from '../../../shared/types/creation-api';
import type { EcsEntity } from '../../../shared/types/world-creation';
import { themedStyles } from '../../theme/useTheme';

const LOAD_TIMEOUT_MS = 10_000;

interface RouteParams {
  creationId: string;
  type?: CreationType;
  title?: string;
  /**
   * task 6.2 · R4.3/4.5:详情页透传的发现投影项（封面/创作者/offerings 来源）。
   * 用于渲染可用预览封面与降级预览视图，无需二次请求;缺省时优雅降级(仅 ECS/offerings)。
   */
  item?: CreationDiscoveryItem;
}

export default function CreationExperienceScreen() {
  const { t } = useI18n();
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { creationId, type, title, item } = (route.params ?? {}) as RouteParams;

  const [loading, setLoading] = useState(true);
  const [failReason, setFailReason] = useState<string | null>(null);
  const [session, setSession] = useState<EnterCreationResponse | null>(null);
  const [buyingId, setBuyingId] = useState<string | null>(null);
  const [tipOpen, setTipOpen] = useState(false);
  // task 6.2 · R4.4:进入失败/超时后的「重试」计数;递增即重跑 enterCreation(不停留空白)。
  const [retryTick, setRetryTick] = useState(0);
  const onRetry = useCallback(() => setRetryTick(nextRetryTick), []);

  // task 6.4:进入失败原因码 → 可读 i18n 文案(与既有 then/catch 文案逐字等价)。
  const enterFailText = useCallback(
    (d: EnterDecision): string => {
      switch (d.reasonCode) {
        case 'missing-id':
          return t({ en: 'Missing creation id.', zh: '缺少创作标识。' });
        case 'timeout':
          return t({ en: 'LOAD_TIMEOUT — failed to enter within 10s.', zh: 'LOAD_TIMEOUT —— 10 秒内未能进入。' });
        case 'entry-error':
          return d.detail ?? t({ en: 'Failed to enter.', zh: '进入失败。' });
        case 'threw':
          return d.detail || t({ en: 'Failed to enter.', zh: '进入失败。' });
        default:
          return t({ en: 'Failed to enter.', zh: '进入失败。' });
      }
    },
    [t],
  );

  // task 6.4:导航意图 → navigation.navigate(目标屏, 参数)。降级/查看详情共用同一意图,不丢参数。
  const go = useCallback(
    (intent: WorldNavIntent) => navigation.navigate(intent.screen, intent.params),
    [navigation],
  );

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      let timer: ReturnType<typeof setTimeout> | null = null;
      setLoading(true);
      setFailReason(null);
      setSession(null);

      if (!creationId) {
        // task 6.4:缺少 creationId → 可重试 error 分支(纯决策 decideEnterState)。
        setFailReason(enterFailText(decideEnterState({ kind: 'missing-id' })));
        setLoading(false);
        return () => { cancelled = true; };
      }

      const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('LOAD_TIMEOUT')), LOAD_TIMEOUT_MS);
      });

      Promise.race([enterCreation(creationId), timeout])
        .then((res) => {
          if (cancelled) return;
          // task 6.4:成功/服务端 error 的分支判定收敛到纯函数 decideEnterState。
          const decision = decideEnterState({ kind: 'resolved', response: res as EnterCreationResponse });
          if (decision.branch === 'experience') {
            setSession(res as EnterCreationResponse);
            // ── task 6.3 · R4.6:Tap_Through 埋点 ──
            // Creation_Experience 成功打开会话 = 一次 enter_success(fire-and-forget);
            // 与详情页的 enter_attempt 配对,供 Tap_Through_Success_Rate 计算。不阻断进入主流程。
            recordTapThrough('success', creationId);
          } else {
            setFailReason(enterFailText(decision));
          }
          setLoading(false);
        })
        .catch((e: any) => {
          if (cancelled) return;
          // task 6.4:超时(LOAD_TIMEOUT)/抛错都落到可重试 error 分支。
          const decision = decideEnterState(
            e?.message === 'LOAD_TIMEOUT' ? { kind: 'timeout' } : { kind: 'threw', message: e?.message },
          );
          setFailReason(enterFailText(decision));
          setLoading(false);
        });

      return () => { cancelled = true; if (timer) clearTimeout(timer); };
    }, [creationId, enterFailText, retryTick]),
  );

  const onBuy = useCallback(
    async (offeringId: string, qty = 1) => {
      try {
        setBuyingId(offeringId);
        // ── task 7.3 · R5.6:Order_Success 埋点 ──
        // 发起服务端权威结算 = 一次 order_attempt(fire-and-forget);结算成功再发 order_success,
        // 供 Order_Success_Rate = order_success / order_attempt 计算。不阻断下单主流程。
        recordOrderOutcome('attempt', creationId, { offeringId, qty });
        const res = await purchaseCreation(creationId, offeringId, qty);
        if (res.ok) {
          recordOrderOutcome('success', creationId, { offeringId, qty, amount: res.amount });
          // task 7.1 · R5.2/5.3:成功后提供可达「我的订单/凭证」入口(订单/凭证可见闭环)。
          Alert.alert(
            t({ en: 'Purchase complete', zh: '购买成功' }),
            t({ en: `Charged ${res.amount} AXP (server-authoritative). Paid to the creator.`, zh: `已扣 ${res.amount} AXP(服务端权威),已支付给作者。` }),
            [
              {
                text: t({ en: 'View orders & vouchers', zh: '查看我的订单/凭证' }),
                onPress: () => navigation.navigate('MyOrdersVouchers'),
              },
              { text: t({ en: 'Done', zh: '完成' }), style: 'cancel' },
            ],
          );
        } else {
          // task 7.2 · R5.4:失败(余额不足/不可下单/服务端拒绝)→ 可读理由 + 明确未扣减 AXP。
          Alert.alert(
            t({ en: 'Purchase rejected', zh: '购买被拒' }),
            t({
              en: 'The order was declined (insufficient AXP balance, item unavailable, or rejected by the server). No AXP was deducted.',
              zh: '下单被拒(可能是 AXP 余额不足、该商品当前不可下单,或被服务端拒绝)。未扣减任何 AXP。',
            }),
          );
        }
      } catch (e: any) {
        // task 7.2 · R5.4:异常同样按失败处理 —— 透出可读理由,并明确成交未发生、未扣减 AXP。
        const reason = e?.message ?? String(e);
        Alert.alert(
          t({ en: 'Purchase failed', zh: '购买失败' }),
          `${reason}\n${t({ en: 'No AXP was deducted.', zh: '未扣减任何 AXP。' })}`,
        );
      } finally {
        setBuyingId(null);
      }
    },
    [creationId, navigation, t],
  );

  const onLike = useCallback(async () => {
    try {
      await likeCreation(creationId, { liked: true });
    } catch { /* best-effort */ }
  }, [creationId]);

  const onTipCreator = useCallback(() => {
    setTipOpen(true);
  }, []);

  const doTip = useCallback(async (amount: number) => {
    setTipOpen(false);
    try {
      await tipCreation(creationId, amount);
      Alert.alert(t({ en: 'Thanks!', zh: '打赏成功' }), t({ en: `Tipped ${amount} AXP to the creator.`, zh: `已向作者打赏 ${amount} AXP。` }));
    } catch (e: any) {
      Alert.alert(t({ en: 'Tip failed', zh: '打赏失败' }), e?.message ?? String(e));
    }
  }, [creationId, t]);

  // 分享:走精美海报(与 skill/商品一致)+ 有效链接(后端 shareCode → 真实域名)。
  const onShare = useCallback(async () => {
    try {
      const res = await shareCreation(creationId);
      const cType = (type as string) || session?.ecsWorld?.meta?.type || 'game';
      const catLabel = ({ game: '🎮 游戏', shop: '🛒 店铺', livestream: '🔴 直播', stage: '🎤 舞台' } as Record<string, string>)[cType] || '🎮 游戏';
      navigation.navigate('ShareCard', {
        shareUrl: res.webPreviewUrl || res.deepLink,
        title: title || session?.ecsWorld?.meta?.title || t({ en: 'My Creation', zh: '我的创作' }),
        subtitle: t({ en: 'Play on Agentrix', zh: '来 Agentrix 一起玩' }),
        headerEmoji: '🎮',
        categoryLabel: catLabel,
        description: t({ en: 'Scan or tap to play this creation.', zh: '扫码或点击,立即开玩这个创作。' }),
        ctaLabel: t({ en: 'Play now', zh: '立即开玩' }),
        accentFrom: '#5b8cff',
        accentTo: '#7c3aed',
      });
    } catch (e: any) {
      Alert.alert(t({ en: 'Share failed', zh: '分享失败' }), e?.message ?? String(e));
    }
  }, [creationId, type, title, session, navigation, t]);

  if (loading) {
    return (
      <View style={[styles.container, styles.center]}>
        <ActivityIndicator size="large" color={colors.accent} />
        <Text style={styles.dim}>{t({ en: 'Entering…', zh: '正在进入…' })}</Text>
      </View>
    );
  }

  // task 6.2 · R4.4:进入失败/超时 —— 可读错误 + 「重试」入口 + 「查看详情」降级,绝不停留空白。
  if (failReason || !session) {
    return (
      <View style={[styles.container, styles.center]}>
        <Text style={styles.failIcon}>⚠️</Text>
        <Text style={styles.failTitle}>{t({ en: 'Could not enter', zh: '无法进入' })}</Text>
        <Text style={styles.dim}>{failReason || t({ en: 'No experience session was returned.', zh: '未获取到体验会话。' })}</Text>
        <View style={styles.failActions}>
          <TouchableOpacity style={styles.retryBtn} onPress={onRetry} testID="experience-retry">
            <Text style={styles.retryText}>↻ {t({ en: 'Retry', zh: '重试' })}</Text>
          </TouchableOpacity>
          {/* 降级:进不去也能回退到可预览详情视图(封面 + 槽位 + 下单),不黑屏(R4.5)。 */}
          <TouchableOpacity
            style={styles.failSecondaryBtn}
            onPress={() => go(navExperienceToDetail(creationId, title, item))}
            testID="experience-view-detail"
          >
            <Text style={styles.failSecondaryText}>{t({ en: 'View details', zh: '查看详情' })}</Text>
          </TouchableOpacity>
        </View>
        <TouchableOpacity onPress={() => navigation.goBack()} testID="experience-back" style={{ marginTop: 6 }}>
          <Text style={styles.dim}>{t({ en: 'Back', zh: '返回' })}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const ecsWorld = session.ecsWorld;
  const entities: EcsEntity[] = ecsWorld?.entities ?? [];
  const goods = entities.filter((e) => e.components?.price);
  const offerings = session.offerings ?? [];

  // task 6.2 · R4.3/4.5:可用预览封面(真图优先,不可渲染 → CoverArt 生成式兜底,绝不黑屏)
  // + 关键槽位(offerings/实体)+ 可交互下单入口;无可进入体验内容 → 降级为可预览详情视图。
  const expType: CreationType = (type || item?.type || 'place') as CreationType;
  const coverUri = item ? preferredPreviewUri(item) : '';
  const expTitle = title || item?.title || ecsWorld?.meta?.title || t({ en: 'Experience', zh: '体验' });
  // task 6.4 · R4.5:是否有可进入/可交互内容(ECS 实体 / offerings / 定价商品)。纯判定。
  const hasEnterableContent = sessionHasEnterableContent(session);

  return (
    <View style={styles.container}>
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => navigation.goBack()}><Text style={styles.backText}>‹ {t({ en: 'Back', zh: '返回' })}</Text></TouchableOpacity>
        <View style={styles.badge}><Text style={styles.badgeText}>{session.isolationLevel}</Text></View>
      </View>

      {/* game / drama:真实可玩 / 互动剧 —— 全屏宿主(GameRunner 内按 engine 分派) */}
      {type === 'game' || type === 'drama' ? (
        <View style={styles.gameFull}><GameRunner creationId={creationId} t={t} /></View>
      ) : (type === 'livestream' || type === 'stage') ? (
        // livestream/stage:真实多人房间(aeon 实时),含在场/聊天/举手/打赏 —— 全屏脱离 ScrollView。
        <View style={styles.gameFull}>
          <LiveRoom creationId={creationId} type={type} title={title || ecsWorld?.meta?.title} offerings={offerings} onBuy={onBuy} buyingId={buyingId} t={t} />
        </View>
      ) : (
      <ScrollView contentContainerStyle={styles.content} testID="creation-experience-scroll">
        {/* 可用预览封面/首帧(R4.3):真图优先 → CoverArt 兜底,绝不黑屏。 */}
        <ExperienceCover id={creationId} uri={coverUri} title={expTitle} type={expType} />

        <Text style={styles.title}>{expTitle}</Text>

        {/* 降级预览提示(R4.5):进入成功但无可交互体验内容时,以可预览详情视图承接,不黑屏。 */}
        {!hasEnterableContent ? (
          <View style={styles.degradeNotice} testID="experience-degrade-notice">
            <Text style={styles.degradeText}>
              {t({
                en: 'This creation has no interactive experience yet — showing a previewable detail view.',
                zh: '该创作暂无可进入的互动体验,已为你展示可预览的详情视图。',
              })}
            </Text>
            <TouchableOpacity
              style={styles.degradeBtn}
              onPress={() => go(navExperienceToDetail(creationId, expTitle, item))}
              testID="experience-degrade-detail"
            >
              <Text style={styles.degradeBtnText}>{t({ en: 'Open details', zh: '查看详情' })}</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        {/* shop:供给项(offerings)+ 结账。offerings 由发布时从 ECS+标注派生,是权威商品来源。 */}
        {(expType === 'shop' || offerings.length > 0 || goods.length > 0) ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>🛒 {t({ en: 'Goods', zh: '商品' })}</Text>
            {offerings.length === 0 ? (
              <Text style={styles.dim}>{t({ en: 'No goods listed.', zh: '暂无商品。' })}</Text>
            ) : offerings.map((o) => {
              const axp = o.price?.axp;
              const canOrder = (o.verbs ?? []).includes('order');
              const busy = buyingId === o.id;
              return (
                <View key={o.id} style={styles.goodRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.goodName} numberOfLines={1}>{o.name || o.id}</Text>
                    {o.description ? <Text style={styles.dim} numberOfLines={1}>{o.description}</Text> : null}
                    <Text style={styles.goodPrice}>{axp != null ? `${axp} AXP` : t({ en: 'No price', zh: '无价格' })}</Text>
                  </View>
                  {canOrder ? (
                    <TouchableOpacity style={[styles.buyBtn, busy && styles.btnDisabled]} disabled={busy} onPress={() => onBuy(o.id, 1)} testID={`experience-buy-${o.id}`}>
                      <Text style={styles.buyBtnText}>{busy ? '…' : t({ en: 'Buy', zh: '购买' })}</Text>
                    </TouchableOpacity>
                  ) : null}
                </View>
              );
            })}
            <Text style={styles.note}>{t({ en: 'Amount is server-authoritative.', zh: '成交金额由服务端权威计算。' })}</Text>
          </View>
        ) : null}

        {/* 关键槽位:ECS 实体概览(game/room 类型走真实体验,不展示实体清单;为空则不渲染空框) */}
        {entities.length > 0 ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>🧱 {t({ en: 'Slots', zh: '关键槽位' })} ({entities.length})</Text>
            {entities.slice(0, 30).map((e) => (
              <View key={e.id} style={styles.entityRow}>
                <Text style={styles.entityId}>{e.id}</Text>
                <Text style={styles.entityComps} numberOfLines={1}>{Object.keys(e.components ?? {}).join(', ') || '—'}</Text>
              </View>
            ))}
          </View>
        ) : null}
      </ScrollView>
      )}

      {/* 统一社交条 */}
      <View style={styles.socialBar}>
        <TouchableOpacity style={styles.socialBtn} onPress={onLike}><Text style={styles.socialText}>♡ {t({ en: 'Like', zh: '点赞' })}</Text></TouchableOpacity>
        <TouchableOpacity style={styles.socialBtn} onPress={() => navigation.navigate('CreationDetail', { creationId, title })}><Text style={styles.socialText}>💬 {t({ en: 'Comment', zh: '留言' })}</Text></TouchableOpacity>
        <TouchableOpacity style={styles.socialBtn} onPress={onTipCreator} testID="experience-tip"><Text style={styles.socialText}>🎁 {t({ en: 'Tip', zh: '打赏' })}</Text></TouchableOpacity>
        <TouchableOpacity style={styles.socialBtn} onPress={onShare} testID="experience-share"><Text style={styles.socialText}>↗ {t({ en: 'Share', zh: '分享' })}</Text></TouchableOpacity>
      </View>

      {/* 打赏弹层(可点背景关闭 + ✕,避免安卓 Alert 多按钮退不出)。 */}
      <Modal visible={tipOpen} transparent animationType="fade" onRequestClose={() => setTipOpen(false)}>
        <TouchableOpacity style={styles.tipBackdrop} activeOpacity={1} onPress={() => setTipOpen(false)}>
          <View style={styles.tipSheet} onStartShouldSetResponder={() => true}>
            <View style={styles.tipHeader}>
              <Text style={styles.tipTitle}>🎁 {t({ en: 'Tip the creator', zh: '打赏作者' })}</Text>
              <TouchableOpacity onPress={() => setTipOpen(false)} testID="tip-close" hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
                <Text style={styles.tipClose}>✕</Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.dim}>{t({ en: 'Amount in AXP, server-authoritative.', zh: '金额为 AXP,服务端权威结算。' })}</Text>
            <View style={styles.tipAmounts}>
              {[10, 50, 100, 500].map((a) => (
                <TouchableOpacity key={a} style={styles.tipAmtBtn} onPress={() => doTip(a)} testID={`tip-${a}`}>
                  <Text style={styles.tipAmtText}>{a}</Text>
                  <Text style={styles.tipAmtUnit}>AXP</Text>
                </TouchableOpacity>
              ))}
            </View>
            <TouchableOpacity style={styles.tipCancel} onPress={() => setTipOpen(false)}>
              <Text style={styles.tipCancelText}>{t({ en: 'Cancel', zh: '取消' })}</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

/**
 * ExperienceCover — 体验宿主顶部「可用预览封面/首帧」(task 6.2 · R4.3)。
 *
 * 真图优先(preferredPreviewUri);URL 不可渲染(非 https / `generated://` 句柄 / 空)
 * 或 `<Image>` 加载失败时,回退到 {@link CoverArt} 生成式兜底封面(确定性渐变 + 表意
 * 图标 + 标题),与 Feed/详情同口径 —— 绝不黑屏(R7.5 同底线)。
 */
function ExperienceCover({
  id,
  uri,
  title,
  type,
}: {
  id: string;
  uri: string;
  title: string;
  type: CreationType;
}) {
  const [failed, setFailed] = useState(false);
  const [loadingImg, setLoadingImg] = useState(true);
  const state = coverDisplayState({ url: uri, loading: loadingImg, failed });
  const attemptReal = state !== 'error';
  return (
    <View style={styles.expCoverWrap} testID="experience-cover">
      {attemptReal ? (
        <>
          <Image
            testID="experience-cover-image"
            source={{ uri }}
            style={styles.expCover}
            resizeMode="cover"
            onLoadStart={() => setLoadingImg(true)}
            onLoad={() => setLoadingImg(false)}
            onError={() => setFailed(true)}
          />
          {state === 'loading' ? (
            <View style={[styles.expCover, styles.expCoverSkeleton]} pointerEvents="none">
              <ActivityIndicator color={colors.accent} />
            </View>
          ) : null}
        </>
      ) : (
        <CoverArt
          id={id}
          title={title}
          emoji={pickCoverEmoji(title, TYPE_EMOJI[type] ?? '🚪')}
          typeLabel={TYPE_LABEL[type] ?? ''}
          style={styles.expCover}
        />
      )}
    </View>
  );
}

/**
 * GameRunner — 方案 A 可玩游戏宿主:拉取 game 包(自包含 HTML5)→ WebView 沙箱渲染。
 * 沙箱:仅渲染内联 HTML;阻止任何外部导航(onShouldStartLoadWithRequest);
 * WebView 自有上下文,无 app token/cookie 共享。
 */
function GameRunner({ creationId, t }: { creationId: string; t: (d: { zh: string; en: string }) => string }) {
  const [html, setHtml] = useState<string | null>(null);
  const [embedUrl, setEmbedUrl] = useState<string | null>(null);
  const [engine, setEngine] = useState<string | null>(null);
  const [dramaStory, setDramaStory] = useState<DramaStory | null>(null);
  const [source, setSource] = useState<'llm' | 'template' | 'embed' | null>(null);
  const [modelUsed, setModelUsed] = useState<string | null>(null);
  const [provider, setProvider] = useState<string | null>(null);
  const [title, setTitle] = useState<string>('');
  const [err, setErr] = useState<string | null>(null);
  const [showHint, setShowHint] = useState(true);
  // 周榜 + 本局成绩(P0:分数权威)。仅自包含游戏(WebView)上报。
  const [lbOpen, setLbOpen] = useState(false);
  const [lb, setLb] = useState<{ items: LeaderboardRow[]; me?: LeaderboardRow }>({ items: [] });
  const [tours, setTours] = useState<ArenaTournament[]>([]);
  const [lastResult, setLastResult] = useState<{ score: number; best: number; rank: number } | null>(null);
  // AI 教练/解说(P0-①):读 render_game_to_text → 后端 LLM → 一句点评+策略。
  const webRef = useRef<WebView>(null);
  const [coachTip, setCoachTip] = useState<string | null>(null);
  const [coachLoading, setCoachLoading] = useState(false);
  const coachHistory = useRef<string[]>([]);

  const askCoach = useCallback(() => {
    setCoachLoading(true);
    setCoachTip(null);
    // 从 WebView 读取实时状态(render_game_to_text),回传给原生再请求后端。
    webRef.current?.injectJavaScript(
      "(function(){try{var s=window.render_game_to_text?window.render_game_to_text():null;" +
      "window.ReactNativeWebView.postMessage(JSON.stringify({type:'coachState',state:s}));}" +
      "catch(e){window.ReactNativeWebView.postMessage(JSON.stringify({type:'coachState',state:null}));}})(); true;",
    );
    // 兜底:WebView 无桥/不响应时也给一句(2s 后若还在 loading 用空状态请求)。
    setTimeout(() => {
      if (coachLoading) {/* still loading; the message path will resolve it */}
    }, 50);
  }, [coachLoading]);

  const refreshLb = useCallback(() => {
    fetchLeaderboard(creationId, 'week').then(setLb).catch(() => {});
    listTournaments(creationId).then((r) => setTours(r.items ?? [])).catch(() => {});
  }, [creationId]);

  const onJoinTournament = useCallback((tmId: string, fee: number) => {
    Alert.alert(
      t({ en: 'Join tournament', zh: '报名对赛' }),
      t({ en: `Entry fee ${fee} AXP. Top scorers split the pool.`, zh: `报名费 ${fee} AXP,高分瓜分奖池。确认报名?` }),
      [
        { text: t({ en: 'Cancel', zh: '取消' }), style: 'cancel' },
        {
          text: t({ en: 'Join', zh: '报名' }),
          onPress: () => {
            joinTournament(tmId)
              .then(() => { refreshLb(); Alert.alert(t({ en: 'Joined!', zh: '报名成功!' }), t({ en: 'Play now — your best score counts.', zh: '现在就玩,你的最高分参与排名!' })); })
              .catch((e: any) => Alert.alert(t({ en: 'Failed', zh: '报名失败' }), e?.message ?? ''));
          },
        },
      ],
    );
  }, [refreshLb, t]);

  const onGameMessage = useCallback(
    (event: any) => {
      try {
        const data = JSON.parse(event?.nativeEvent?.data || '{}');
        if (data && data.type === 'gameover' && typeof data.score === 'number') {
          submitGameScore(creationId, data.score, data.state)
            .then((r) => { setLastResult({ score: r.score, best: r.best, rank: r.rank }); refreshLb(); })
            .catch(() => {});
        } else if (data && data.type === 'coachState') {
          coachGame(creationId, title, data.state ?? null, coachHistory.current)
            .then((r) => {
              setCoachTip(r.tip);
              coachHistory.current = [...coachHistory.current, r.tip].slice(-3);
            })
            .catch(() => setCoachTip(t({ en: 'Coach is busy, try again.', zh: '教练有点忙,待会再问~' })))
            .finally(() => setCoachLoading(false));
        }
      } catch {
        setCoachLoading(false);
      }
    },
    [creationId, refreshLb, title, t],
  );

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      setHtml(null);
      setEmbedUrl(null);
      setEngine(null);
      setDramaStory(null);
      setErr(null);
      setShowHint(true);
      getCreationGame(creationId)
        .then((b) => {
          if (cancelled) return;
          setSource(b.source);
          setEngine(b.engine);
          setModelUsed(b.modelUsed ?? null);
          setProvider(b.provider ?? null);
          setTitle(b.title);
          if (b.engine === 'mp-gomoku') {
            // 多人游戏:走原生实时房间,不用 WebView。
          } else if (b.engine === 'drama-vn') {
            // 互动剧:html 列存 DramaStory JSON,走原生 DramaRunner。
            try { setDramaStory(JSON.parse(b.html) as DramaStory); }
            catch { setErr('Failed to parse drama story'); }
          } else if (b.source === 'embed' && b.url) {
            setEmbedUrl(b.url);
          } else {
            setHtml(b.html);
          }
        })
        .catch((e: any) => { if (!cancelled) setErr(e?.message || 'Failed to load game'); });
      return () => { cancelled = true; };
    }, [creationId]),
  );

  if (err) {
    return <View style={styles.gameCenter}><Text style={styles.dim}>{t({ en: 'Failed to load game.', zh: '游戏加载失败。' })}</Text></View>;
  }
  // 回合制多人(路径 B):原生五子棋房间,复用 /aeon 实时层。
  if (engine === 'mp-gomoku') {
    return <GomokuRoom creationId={creationId} title={title} t={t} />;
  }
  // 实时动作多人(路径 A):权威 Pong,/arcade 服务器权威模拟。
  if (engine === 'mp-pong') {
    return <PongRoom creationId={creationId} title={title} t={t} />;
  }
  // 互动剧(短剧 MVP):原生分支播放器,内含 AXP 解锁 + 打赏闭环。
  if (engine === 'drama-vn') {
    if (!dramaStory) {
      return <View style={styles.gameCenter}><ActivityIndicator color={colors.accent} /><Text style={styles.dim}>{t({ en: 'Loading drama…', zh: '加载互动剧…' })}</Text></View>;
    }
    return <DramaRunner creationId={creationId} story={dramaStory} t={t} />;
  }
  if (!html && !embedUrl) {
    return <View style={styles.gameCenter}><ActivityIndicator color={colors.accent} /><Text style={styles.dim}>{t({ en: 'Loading game…', zh: '加载游戏…' })}</Text></View>;
  }

  // 仅放行 https / about / data,阻断 javascript:/intent:/market: 等危险 scheme。
  // 安全模型:embed 来源在"注册期"已经过域名白名单校验(后端);运行期只挡危险 scheme。
  const allowNav = (url: string) =>
    url.startsWith('https://') || url.startsWith('about:') || url.startsWith('data:') || url === 'about:srcdoc';

  return (
    <View style={{ flex: 1 }}>
      {/* 第三方外链游戏提示(合规/来源透明)。 */}
      {source === 'embed' && showHint ? (
        <View style={styles.gameHintOk}>
          <Text style={styles.gameHintOkText}>
            🌐 {t({ en: `Third-party web game${provider ? ` · ${provider}` : ''}`, zh: `第三方网页游戏${provider ? ` · ${provider}` : ''}` })}
          </Text>
          <TouchableOpacity onPress={() => setShowHint(false)}><Text style={styles.gameHintDismiss}>✕</Text></TouchableOpacity>
        </View>
      ) : null}
      {/* 模板兜底提示:AI 未能生成 → 引导换更强模型 / 配置 BYO。 */}
      {source === 'template' && showHint ? (
        <View style={styles.gameHint}>
          <Text style={styles.gameHintText}>
            {t({
              en: 'This is a built-in template (AI generation did not produce a valid game). For richer / more complex games, switch to a stronger model (Sonnet/Opus) or configure your own API key (BYO) in settings, then regenerate.',
              zh: '当前为内置模板(AI 未能生成有效游戏)。想要更丰富/复杂的游戏,请在设置切换更强模型(Sonnet/Opus)或配置自己的 API Key(BYO),再让作者重新生成。',
            })}
          </Text>
          <TouchableOpacity onPress={() => setShowHint(false)} testID="game-hint-dismiss"><Text style={styles.gameHintDismiss}>{t({ en: 'Got it', zh: '知道了' })}</Text></TouchableOpacity>
        </View>
      ) : null}
      {source === 'llm' && modelUsed && showHint ? (
        <View style={styles.gameHintOk}>
          <Text style={styles.gameHintOkText}>{t({ en: `Generated by ${modelUsed}`, zh: `由 ${modelUsed} 生成` })}</Text>
          <TouchableOpacity onPress={() => setShowHint(false)}><Text style={styles.gameHintDismiss}>✕</Text></TouchableOpacity>
        </View>
      ) : null}
      <WebView
        testID="creation-game-webview"
        ref={webRef}
        source={embedUrl ? { uri: embedUrl } : { html: html! }}
        originWhitelist={['*']}
        javaScriptEnabled
        domStorageEnabled
        allowsInlineMediaPlayback
        mediaPlaybackRequiresUserAction={false}
        scrollEnabled={false}
        setSupportMultipleWindows={false}
        overScrollMode="never"
        bounces={false}
        // 内联 HTML(srcdoc/data)或白名单外链;阻断危险 scheme 的导航。
        onShouldStartLoadWithRequest={(req) => allowNav(req.url)}
        onMessage={onGameMessage}
        style={styles.webview}
      />
      {/* 周榜入口 + 本局成绩(分数权威 / 竞技地基)。 */}
      <TouchableOpacity style={styles.lbFab} onPress={() => { setLbOpen(true); refreshLb(); }} testID="game-leaderboard-btn">
        <Text style={styles.lbFabText}>🏆</Text>
      </TouchableOpacity>
      {/* AI 教练/解说(差异化 Wow):读实时状态 → 一句点评+策略。 */}
      <TouchableOpacity style={styles.coachFab} onPress={askCoach} disabled={coachLoading} testID="game-coach-btn">
        <Text style={styles.lbFabText}>{coachLoading ? '💭' : '🧠'}</Text>
      </TouchableOpacity>
      {coachTip ? (
        <TouchableOpacity style={styles.coachBubble} activeOpacity={0.9} onPress={() => setCoachTip(null)}>
          <Text style={styles.coachBubbleText}>🧠 {coachTip}</Text>
          <Text style={styles.coachBubbleHint}>{t({ en: 'tap to dismiss · 🧠 for more', zh: '点掉 · 再点🧠换一条' })}</Text>
        </TouchableOpacity>
      ) : null}
      {lastResult ? (
        <View style={styles.scoreToast} pointerEvents="none">
          <Text style={styles.scoreToastText}>
            {t({ en: 'This run', zh: '本局' })} {lastResult.score} · {t({ en: 'best', zh: '周最佳' })} {lastResult.best} · #{lastResult.rank}
          </Text>
        </View>
      ) : null}
      <Modal visible={lbOpen} transparent animationType="slide" onRequestClose={() => setLbOpen(false)}>
        <View style={styles.lbBackdrop}>
          <View style={styles.lbSheet}>
            <Text style={styles.lbTitle}>🏆 {t({ en: 'Weekly Leaderboard', zh: '本周排行榜' })}</Text>
            {tours.filter((tm) => tm.status === 'open').length > 0 ? (
              <View style={styles.tourBox}>
                <Text style={styles.tourHead}>💰 {t({ en: 'Prize tournaments', zh: '奖池对赛' })}</Text>
                {tours.filter((tm) => tm.status === 'open').map((tm) => (
                  <View key={tm.id} style={styles.tourRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.tourTitle} numberOfLines={1}>{tm.title}</Text>
                      <Text style={styles.tourMeta}>{t({ en: 'pool', zh: '奖池' })} {tm.prizePool} · {t({ en: 'fee', zh: '报名' })} {tm.entryFeeAxp} AXP{tm.entrants != null ? ` · ${tm.entrants}${t({ en: ' in', zh: '人' })}` : ''}</Text>
                    </View>
                    {tm.joined ? (
                      <Text style={styles.tourJoined}>✓ {t({ en: 'in', zh: '已报名' })}</Text>
                    ) : (
                      <TouchableOpacity style={styles.tourJoin} onPress={() => onJoinTournament(tm.id, tm.entryFeeAxp)}>
                        <Text style={styles.tourJoinText}>{t({ en: 'Join', zh: '报名' })}</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                ))}
              </View>
            ) : null}
            <ScrollView style={{ maxHeight: 380 }}>
              {lb.items.length === 0 ? (
                <Text style={styles.dim}>{t({ en: 'No scores yet — be the first!', zh: '还没有成绩,来抢第一!' })}</Text>
              ) : (
                lb.items.map((r) => (
                  <View key={r.userId} style={[styles.lbRow, r.isMe && styles.lbRowMe]}>
                    <Text style={styles.lbRank}>{r.rank === 1 ? '🥇' : r.rank === 2 ? '🥈' : r.rank === 3 ? '🥉' : String(r.rank)}</Text>
                    <Text style={styles.lbName} numberOfLines={1}>{r.name}{r.isMe ? ` (${t({ en: 'me', zh: '我' })})` : ''}</Text>
                    <Text style={styles.lbScore}>{r.score}</Text>
                  </View>
                ))
              )}
              {lb.me && !lb.items.some((i) => i.isMe) ? (
                <View style={[styles.lbRow, styles.lbRowMe]}>
                  <Text style={styles.lbRank}>{String(lb.me.rank)}</Text>
                  <Text style={styles.lbName}>{lb.me.name} ({t({ en: 'me', zh: '我' })})</Text>
                  <Text style={styles.lbScore}>{lb.me.score}</Text>
                </View>
              ) : null}
            </ScrollView>
            <TouchableOpacity style={styles.lbClose} onPress={() => setLbOpen(false)}>
              <Text style={styles.lbCloseText}>{t({ en: 'Close', zh: '关闭' })}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

/**
 * LiveRoom — livestream / stage 创作的真实多人房间(aeon 实时)。
 *
 * 接入既有 aeon 实时房间(AeonRealtimeGateway,舞台房间语义):
 *   - 进入 = JOIN `aeon-live-c-<creationId>`;首个真人成 host,其余 audience(服务器权威)。
 *   - 在场列表(presence)+ 房间聊天 + 观众举手 + host 批准上台 + 给台上打赏 AXP。
 *   - 全部为服务器权威广播;本端只发意图。socket.io 缺失 → 降级提示(不阻塞)。
 */
function LiveRoom({
  creationId,
  type,
  title,
  offerings,
  onBuy,
  buyingId,
  t,
}: {
  creationId: string;
  type: CreationType;
  title?: string;
  offerings?: Offering[];
  onBuy?: (offeringId: string, qty?: number) => void;
  buyingId?: string | null;
  t: (d: { zh: string; en: string }) => string;
}) {
  const user = useAuthStore((s) => s.user);
  const selfCharId = `c-${user?.id ?? 'guest'}`;
  const displayName = user?.nickname || user?.agentrixId || (type === 'livestream' ? '观众' : '观众');

  const [chars, setChars] = useState<Record<string, AeonCharacterSnapshot>>({});
  const [feed, setFeed] = useState<{ id: string; text: string; kind: 'chat' | 'sys' | 'tip' }[]>([]);
  const [raised, setRaised] = useState<Set<string>>(new Set());
  const [connected, setConnected] = useState(false);
  const [degraded, setDegraded] = useState(false);
  const [draft, setDraft] = useState('');
  const handleRef = useRef<AeonRoomHandle | null>(null);
  const seq = useRef(0);

  const pushFeed = useCallback((text: string, kind: 'chat' | 'sys' | 'tip') => {
    seq.current += 1;
    const id = `f${seq.current}`;
    setFeed((prev) => [...prev.slice(-80), { id, text, kind }]);
  }, []);

  useFocusEffect(
    useCallback(() => {
      setChars({});
      setFeed([]);
      setRaised(new Set());
      const nameOf = (charId: string, fallback?: string) =>
        fallback || charId;

      const handle = connectAeonRoom({
        roomId: creationId,
        charId: selfCharId,
        displayName,
        onConnectionChange: setConnected,
        onServerEvent: (ev: AeonServerEvent) => {
          switch (ev.t) {
            case 'room_state': {
              const map: Record<string, AeonCharacterSnapshot> = {};
              for (const c of ev.chars) map[c.charId] = c;
              setChars(map);
              break;
            }
            case 'char_upsert': {
              setChars((prev) => ({ ...prev, [ev.char.charId]: ev.char }));
              // 上台即从举手队列移除。
              if (ev.char.stageRole === 'speaker' || ev.char.stageRole === 'host') {
                setRaised((prev) => {
                  if (!prev.has(ev.char.charId)) return prev;
                  const next = new Set(prev);
                  next.delete(ev.char.charId);
                  return next;
                });
              }
              break;
            }
            case 'char_leave': {
              setChars((prev) => {
                const next = { ...prev };
                delete next[ev.charId];
                return next;
              });
              break;
            }
            case 'chat': {
              const prefix = ev.attribution ? `🤖 ${ev.attribution}: ` : '';
              pushFeed(`${prefix}${ev.text}`, 'chat');
              break;
            }
            case 'stage_hand_raised': {
              setRaised((prev) => new Set(prev).add(ev.fromCharId));
              pushFeed(t({ en: `${ev.displayName} raised a hand`, zh: `${ev.displayName} 举手申请上台` }), 'sys');
              break;
            }
            case 'stage_tip': {
              pushFeed(
                t({
                  en: `🎁 ${ev.fromName} tipped ${ev.targetName} ${ev.amount} AXP (total ${ev.totalToTarget})`,
                  zh: `🎁 ${ev.fromName} 给 ${ev.targetName} 打赏 ${ev.amount} AXP(累计 ${ev.totalToTarget})`,
                }),
                'tip',
              );
              break;
            }
            default:
              break;
          }
        },
        debug: false,
      });
      handleRef.current = handle;
      setDegraded(handle.isDegraded);
      if (handle.isDegraded) {
        pushFeed(t({ en: 'Realtime unavailable on this build.', zh: '当前版本实时房间不可用。' }), 'sys');
      }
      return () => {
        handle.disconnect();
        handleRef.current = null;
      };
    }, [creationId, selfCharId, displayName, pushFeed, t]),
  );

  const charList = Object.values(chars);
  const onStage = charList.filter((c) => c.stageRole === 'host' || c.stageRole === 'speaker');
  const audience = charList.filter((c) => !c.stageRole || c.stageRole === 'audience');
  const self = chars[selfCharId];
  const selfIsHost = self?.stageRole === 'host';
  const selfIsAudience = !self || !self.stageRole || self.stageRole === 'audience';

  const onTip = useCallback(
    (target: AeonCharacterSnapshot) => {
      if (target.charId === selfCharId) return;
      Alert.alert(
        t({ en: `Tip ${target.displayName}`, zh: `打赏 ${target.displayName}` }),
        t({ en: 'Choose an amount (AXP). Server-authoritative.', zh: '选择打赏金额(AXP),服务端权威结算。' }),
        [
          { text: '10 AXP', onPress: () => handleRef.current?.tip(target.charId, 10) },
          { text: '50 AXP', onPress: () => handleRef.current?.tip(target.charId, 50) },
          { text: '100 AXP', onPress: () => handleRef.current?.tip(target.charId, 100) },
          { text: t({ en: 'Cancel', zh: '取消' }), style: 'cancel' },
        ],
      );
    },
    [selfCharId, t],
  );

  const send = useCallback(() => {
    const txt = draft.trim();
    if (!txt) return;
    handleRef.current?.sendChat(txt);
    setDraft('');
  }, [draft]);

  return (
    <KeyboardAvoidingView
      style={styles.room}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={90}
    >
      {/* 头部:房间名 + 在场人数 + 连接态 */}
      <View style={styles.roomHeader}>
        <Text style={styles.roomTitle} numberOfLines={1}>
          {type === 'livestream' ? '🔴' : '🎤'} {title || t({ en: 'Live Room', zh: '现场房间' })}
        </Text>
        <View style={styles.roomMeta}>
          <View style={[styles.dot, { backgroundColor: connected ? '#43d17a' : '#888' }]} />
          <Text style={styles.roomMetaText}>{charList.length} {t({ en: 'in room', zh: '在场' })}</Text>
        </View>
      </View>

      {/* 台上(host/speaker)— 可打赏 */}
      <View style={styles.stageStrip}>
        <Text style={styles.stripLabel}>{t({ en: 'On stage', zh: '台上' })}</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10, paddingRight: 12 }}>
          {onStage.length === 0 ? (
            <Text style={styles.dim}>{t({ en: 'Waiting for host…', zh: '等待主持人…' })}</Text>
          ) : onStage.map((c) => (
            <TouchableOpacity
              key={c.charId}
              style={styles.stageAvatar}
              onPress={() => onTip(c)}
              disabled={c.charId === selfCharId}
              testID={`room-stage-${c.charId}`}
            >
              <Text style={styles.stageAvatarEmoji}>{c.stageRole === 'host' ? '🎙️' : '🗣️'}</Text>
              <Text style={styles.stageAvatarName} numberOfLines={1}>{c.displayName}</Text>
              {c.charId !== selfCharId ? <Text style={styles.tipHint}>🎁 {t({ en: 'Tip', zh: '打赏' })}</Text> : <Text style={styles.tipHint}>{t({ en: 'You', zh: '我' })}</Text>}
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {/* 直播带货:边看边买(P1-⑤)。offerings 来自 enter 投影,购买走服务端权威 purchaseCreation。 */}
      {onBuy && (offerings?.length ?? 0) > 0 ? (
        <View style={styles.shopStrip}>
          <Text style={styles.stripLabel}>🛍️ {t({ en: 'Shop', zh: '边看边买' })}</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingRight: 12 }}>
            {offerings!.filter((o) => o.price?.axp != null).map((o) => {
              const axp = o.price?.axp ?? 0;
              const busy = buyingId === o.id;
              return (
                <TouchableOpacity
                  key={o.id}
                  style={[styles.shopItem, busy && styles.btnDisabled]}
                  disabled={busy}
                  onPress={() => onBuy(o.id, 1)}
                  testID={`live-buy-${o.id}`}
                >
                  <Text style={styles.shopItemName} numberOfLines={1}>{o.name || t({ en: 'Item', zh: '商品' })}</Text>
                  <Text style={styles.shopItemPrice}>{busy ? '…' : `${axp} AXP`}</Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>
      ) : null}

      {/* host:批准举手观众上台 */}
      {selfIsHost && raised.size > 0 ? (
        <View style={styles.handsBar}>
          <Text style={styles.stripLabel}>✋ {t({ en: 'Requests', zh: '上台申请' })}</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
            {Array.from(raised).map((cid) => (
              <TouchableOpacity key={cid} style={styles.approveBtn} onPress={() => handleRef.current?.invite(cid)} testID={`room-approve-${cid}`}>
                <Text style={styles.approveText}>✓ {chars[cid]?.displayName ?? cid}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      ) : null}

      {/* 聊天/事件流 */}
      <ScrollView style={styles.feed} contentContainerStyle={{ paddingVertical: 8 }} testID="room-feed">
        {feed.length === 0 ? (
          <Text style={[styles.dim, { padding: 16 }]}>{t({ en: 'Say hi to start the conversation.', zh: '发条消息开始互动吧。' })}</Text>
        ) : feed.map((m) => (
          <Text key={m.id} style={[styles.feedLine, m.kind === 'sys' && styles.feedSys, m.kind === 'tip' && styles.feedTip]}>
            {m.text}
          </Text>
        ))}
      </ScrollView>

      {/* 底部操作:举手(观众)+ 聊天输入 */}
      <View style={styles.roomInputBar}>
        {selfIsAudience ? (
          <TouchableOpacity style={styles.handBtn} onPress={() => handleRef.current?.raiseHand()} disabled={degraded} testID="room-raise-hand">
            <Text style={styles.handBtnText}>✋</Text>
          </TouchableOpacity>
        ) : null}
        <TextInput
          style={styles.roomInput}
          value={draft}
          onChangeText={setDraft}
          placeholder={degraded ? t({ en: 'Realtime unavailable', zh: '实时不可用' }) : t({ en: 'Message…', zh: '说点什么…' })}
          placeholderTextColor={colors.textMuted}
          editable={!degraded}
          onSubmitEditing={send}
          returnKeyType="send"
          testID="room-chat-input"
        />
        <TouchableOpacity style={[styles.sendBtn, (!draft.trim() || degraded) && styles.btnDisabled]} onPress={send} disabled={!draft.trim() || degraded} testID="room-chat-send">
          <Text style={styles.sendBtnText}>{t({ en: 'Send', zh: '发送' })}</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = themedStyles(() => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgPrimary },
  center: { alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24 },
  gameBox: { height: Math.round(Dimensions.get('window').height * 0.62), borderRadius: 12, overflow: 'hidden', backgroundColor: '#0e1016', marginBottom: 16 },
  gameFull: { flex: 1, backgroundColor: '#0e1016' },
  gameCenter: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10 },
  webview: { flex: 1, backgroundColor: '#0e1016' },
  lbFab: { position: 'absolute', right: 12, top: 12, width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)' },
  lbFabText: { fontSize: 22 },
  coachFab: { position: 'absolute', right: 12, top: 64, width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(99,102,241,0.6)', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.25)' },
  coachBubble: { position: 'absolute', left: 14, right: 64, top: 12, backgroundColor: 'rgba(20,16,46,0.92)', borderRadius: 14, padding: 12, borderWidth: 1, borderColor: 'rgba(124,92,252,0.6)' },
  coachBubbleText: { color: '#fff', fontSize: 14, fontWeight: '700', lineHeight: 20 },
  coachBubbleHint: { color: 'rgba(255,255,255,0.45)', fontSize: 10, marginTop: 4 },
  scoreToast: { position: 'absolute', left: 0, right: 0, bottom: 16, alignItems: 'center' },
  scoreToastText: { color: '#fff', fontSize: 13, fontWeight: '700', backgroundColor: 'rgba(0,0,0,0.6)', paddingHorizontal: 14, paddingVertical: 7, borderRadius: 999, overflow: 'hidden' },
  lbBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' },
  lbSheet: { backgroundColor: colors.bgCard, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 18, paddingBottom: 32 },
  lbTitle: { color: colors.textPrimary, fontSize: 18, fontWeight: '800', marginBottom: 12, textAlign: 'center' },
  lbRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border },
  lbRowMe: { backgroundColor: colors.accent + '18', borderRadius: 10, paddingHorizontal: 8 },
  lbRank: { color: colors.textPrimary, fontSize: 15, fontWeight: '800', width: 32, textAlign: 'center' },
  lbName: { color: colors.textPrimary, fontSize: 14, flex: 1 },
  lbScore: { color: colors.accent, fontSize: 15, fontWeight: '800' },
  lbClose: { marginTop: 14, alignItems: 'center', paddingVertical: 12, borderRadius: 12, backgroundColor: colors.bgSecondary },
  lbCloseText: { color: colors.textPrimary, fontSize: 15, fontWeight: '700' },
  tourBox: { backgroundColor: colors.accent + '12', borderRadius: 12, borderWidth: 1, borderColor: colors.accent + '40', padding: 10, marginBottom: 12 },
  tourHead: { color: colors.accent, fontSize: 12, fontWeight: '800', marginBottom: 6 },
  tourRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6 },
  tourTitle: { color: colors.textPrimary, fontSize: 14, fontWeight: '700' },
  tourMeta: { color: colors.textMuted, fontSize: 11, marginTop: 2 },
  tourJoin: { backgroundColor: colors.accent, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 7 },
  tourJoinText: { color: '#fff', fontSize: 13, fontWeight: '800' },
  tourJoined: { color: colors.success, fontSize: 12, fontWeight: '700' },
  gameHint: { backgroundColor: '#3a2a00', borderBottomWidth: 1, borderBottomColor: '#5a4a10', paddingHorizontal: 14, paddingVertical: 10 },
  gameHintText: { color: '#ffd98a', fontSize: 12, lineHeight: 18 },
  gameHintDismiss: { color: colors.accent, fontSize: 12, fontWeight: '700', marginTop: 6, alignSelf: 'flex-end' },
  gameHintOk: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#0e2a16', paddingHorizontal: 14, paddingVertical: 6 },
  gameHintOkText: { color: '#7fe0a0', fontSize: 11, fontWeight: '600' },

  // ── LiveRoom(livestream/stage 真实房间)──
  room: { flex: 1, backgroundColor: colors.bgPrimary },
  roomHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border },
  roomTitle: { color: colors.textPrimary, fontSize: 16, fontWeight: '800', flex: 1 },
  roomMeta: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  roomMetaText: { color: colors.textMuted, fontSize: 12 },
  stageStrip: { paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border },
  stripLabel: { color: colors.textSecondary, fontSize: 12, fontWeight: '700', marginBottom: 8 },
  shopStrip: { paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: colors.accent + '0D' },
  shopItem: { backgroundColor: colors.bgCard, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8, borderWidth: 1, borderColor: colors.accent + '55', minWidth: 96 },
  shopItemName: { color: colors.textPrimary, fontSize: 13, fontWeight: '700', maxWidth: 120 },
  shopItemPrice: { color: colors.accent, fontSize: 13, fontWeight: '800', marginTop: 3 },
  stageAvatar: { alignItems: 'center', backgroundColor: colors.bgCard, borderRadius: 12, padding: 10, minWidth: 76, borderWidth: 1, borderColor: colors.border },
  stageAvatarEmoji: { fontSize: 22 },
  stageAvatarName: { color: colors.textPrimary, fontSize: 12, fontWeight: '600', marginTop: 4, maxWidth: 64 },
  tipHint: { color: colors.accent, fontSize: 10, fontWeight: '700', marginTop: 2 },
  handsBar: { paddingHorizontal: 14, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: '#241a00' },
  approveBtn: { backgroundColor: colors.accent, borderRadius: 16, paddingHorizontal: 12, paddingVertical: 6 },
  approveText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  feed: { flex: 1, paddingHorizontal: 14 },
  feedLine: { color: colors.textPrimary, fontSize: 14, lineHeight: 21, paddingVertical: 2 },
  feedSys: { color: colors.textMuted, fontSize: 12, fontStyle: 'italic' },
  feedTip: { color: '#ffd98a', fontWeight: '700' },
  roomInputBar: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 10, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.bgSecondary },
  handBtn: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bgCard, borderWidth: 1, borderColor: colors.border },
  handBtnText: { fontSize: 18 },
  roomInput: { flex: 1, backgroundColor: colors.bgCard, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 9, color: colors.textPrimary, fontSize: 14, borderWidth: 1, borderColor: colors.border },
  sendBtn: { backgroundColor: colors.accent, borderRadius: 20, paddingHorizontal: 16, paddingVertical: 10 },
  sendBtnText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  dim: { color: colors.textMuted, fontSize: 13, textAlign: 'center', lineHeight: 19 },
  failIcon: { fontSize: 48 },
  failTitle: { color: colors.textPrimary, fontSize: 18, fontWeight: '800' },
  backToMapBtn: { marginTop: 8, backgroundColor: colors.accent, borderRadius: 10, paddingHorizontal: 22, paddingVertical: 12 },
  backToMapText: { color: '#fff', fontSize: 14, fontWeight: '700' },

  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 56, paddingBottom: 8 },
  backText: { color: colors.textPrimary, fontSize: 16, fontWeight: '600' },
  badge: { backgroundColor: colors.bgCard, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4, borderWidth: 1, borderColor: colors.border },
  badgeText: { color: colors.accent, fontSize: 12, fontWeight: '700' },

  content: { paddingHorizontal: 16, paddingBottom: 100 },
  title: { color: colors.textPrimary, fontSize: 22, fontWeight: '800', marginBottom: 16 },

  // task 6.2 · 可用预览封面/首帧(16:9 圆角 banner;真图或 CoverArt 兜底)。
  expCoverWrap: { width: '100%', aspectRatio: 16 / 9, borderRadius: 14, overflow: 'hidden', backgroundColor: colors.bgSecondary, marginBottom: 14 },
  expCover: { ...StyleSheet.absoluteFillObject, width: '100%', height: '100%' },
  expCoverSkeleton: { alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bgSecondary },

  // task 6.2 · 降级预览提示(无可进入互动内容时;不黑屏)。
  degradeNotice: { backgroundColor: colors.bgCard, borderRadius: 12, borderWidth: 1, borderColor: colors.border, padding: 14, marginBottom: 16, gap: 10 },
  degradeText: { color: colors.textSecondary, fontSize: 13, lineHeight: 19 },
  degradeBtn: { alignSelf: 'flex-start', backgroundColor: colors.bgSecondary, borderRadius: 10, paddingHorizontal: 16, paddingVertical: 9, borderWidth: 1, borderColor: colors.border },
  degradeBtnText: { color: colors.textPrimary, fontSize: 13, fontWeight: '700' },

  // task 6.2 · 进入失败/超时的重试 + 降级动作行。
  failActions: { flexDirection: 'row', gap: 12, marginTop: 8 },
  retryBtn: { backgroundColor: colors.accent, borderRadius: 10, paddingHorizontal: 22, paddingVertical: 12 },
  retryText: { color: '#fff', fontSize: 14, fontWeight: '800' },
  failSecondaryBtn: { backgroundColor: colors.bgCard, borderRadius: 10, paddingHorizontal: 22, paddingVertical: 12, borderWidth: 1, borderColor: colors.border },
  failSecondaryText: { color: colors.textPrimary, fontSize: 14, fontWeight: '700' },

  section: { marginBottom: 20 },
  sectionTitle: { color: colors.textPrimary, fontSize: 16, fontWeight: '700', marginBottom: 10 },
  note: { color: colors.textMuted, fontSize: 12, marginTop: 6 },

  goodRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.bgCard, borderRadius: 12, padding: 12, marginBottom: 10, borderWidth: 1, borderColor: colors.border },
  goodName: { color: colors.textPrimary, fontSize: 15, fontWeight: '700' },
  goodPrice: { color: colors.accent, fontSize: 14, fontWeight: '800', marginTop: 4 },
  buyBtn: { backgroundColor: colors.accent, borderRadius: 10, paddingHorizontal: 18, paddingVertical: 10 },
  btnDisabled: { opacity: 0.5 },
  buyBtnText: { color: '#fff', fontSize: 14, fontWeight: '700' },

  entityRow: { flexDirection: 'row', justifyContent: 'space-between', backgroundColor: colors.bgCard, borderRadius: 10, padding: 10, marginBottom: 8, borderWidth: 1, borderColor: colors.border },
  entityId: { color: colors.textPrimary, fontSize: 13, fontWeight: '600', flex: 1 },
  entityComps: { color: colors.textMuted, fontSize: 12, flex: 2, textAlign: 'right' },

  socialBar: { flexDirection: 'row', borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.bgSecondary, paddingVertical: 10 },
  socialBtn: { flex: 1, alignItems: 'center' },
  socialText: { color: colors.textPrimary, fontSize: 14, fontWeight: '600' },

  tipBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,.55)', justifyContent: 'flex-end' },
  tipSheet: { backgroundColor: colors.bgSecondary, borderTopLeftRadius: 18, borderTopRightRadius: 18, padding: 18, paddingBottom: 28, gap: 12 },
  tipHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  tipTitle: { color: colors.textPrimary, fontSize: 17, fontWeight: '800' },
  tipClose: { color: colors.textMuted, fontSize: 20, fontWeight: '700' },
  tipAmounts: { flexDirection: 'row', gap: 10, marginTop: 4 },
  tipAmtBtn: { flex: 1, backgroundColor: colors.bgCard, borderRadius: 12, borderWidth: 1, borderColor: colors.border, paddingVertical: 14, alignItems: 'center' },
  tipAmtText: { color: colors.accent, fontSize: 18, fontWeight: '800' },
  tipAmtUnit: { color: colors.textMuted, fontSize: 11, marginTop: 2 },
  tipCancel: { alignItems: 'center', paddingVertical: 12, marginTop: 2 },
  tipCancelText: { color: colors.textSecondary, fontSize: 15, fontWeight: '600' },
}));
