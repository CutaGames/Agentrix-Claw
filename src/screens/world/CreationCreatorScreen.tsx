/**
 * CreationCreatorScreen — 统一创作器(World Creation & Feed,task 4.4)。
 *
 * spec: .kiro/specs/world-creation-feed/{requirements,design,ui-design}.md
 *   - ui-design §5:单一动作流 — 描述 → 生成 → 预览 → 选址(可选)→ 发布。
 *   - 需求 2.1 / 2.2 / 2.9:低门槛"单一动作";三档连续谱(promptDrive/coEdit/handBuild);
 *     offering 与 Agent 能力由系统自动派生,创作者**不写接口**(只读展示)。
 *   - 需求 1.6 / 1.7:选址可选(仅内容创作可无 geo,仅进创作流)。
 *   - 需求 3.1 / 3.2 / 3.6:发布过审 + 预览物 + shareCode。
 *
 * 对接 `creationApi`(task 0.3 适配层 / 统一端点):createCreation(inline prompt)→
 * continueCreation(coEdit)→ publishCreation。Tier_C 由后端强制派发(返回 dispatch/task)。
 */
import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { colors } from '../../theme/colors';
import { useI18n } from '../../stores/i18nStore';
import {
  createCreation,
  continueCreation,
  publishCreation,
  checkCreationQuality,
  importCreationGame,
  generateDrama,
  generateCreationCover,
  illustrateDrama,
  setCreationOfferings,
} from '../../services/creationApi';
import type { CreationType } from '../../../shared/types/creation';
import type { SubstrateTier } from '../../../shared/types/world-creation';
import type { CreationMode } from '../../../shared/types/world-creation-api';
import { themedStyles } from '../../theme/useTheme';

const TYPES: { value: CreationType; emoji: string; label: { en: string; zh: string } }[] = [
  // game 置顶为默认(当前最成熟、真实可玩的类型)。
  { value: 'game', emoji: '🎮', label: { en: 'Game', zh: '游戏' } },
  { value: 'drama', emoji: '🎭', label: { en: 'Drama', zh: '互动剧' } },
  { value: 'shop', emoji: '🛒', label: { en: 'Shop', zh: '店铺' } },
  { value: 'stage', emoji: '🎤', label: { en: 'Stage', zh: '舞台' } },
  { value: 'livestream', emoji: '🔴', label: { en: 'Live', zh: '直播' } },
  // 'place'(场所)暂时下架:目前为空壳,无真实玩法(见 WCF_WHAT_ACTUALLY_WORKS)。
];

const MODES: { value: CreationMode; label: { en: string; zh: string } }[] = [
  { value: 'promptDrive', label: { en: 'Prompt', zh: '提示词' } },
  { value: 'coEdit', label: { en: 'Co-edit', zh: '协同编辑' } },
  { value: 'handBuild', label: { en: 'Hand-build', zh: '手动搭建' } },
];

export default function CreationCreatorScreen() {
  const { t } = useI18n();
  const navigation = useNavigation<any>();

  const [type, setType] = useState<CreationType>('game');
  const [title, setTitle] = useState('');
  const [prompt, setPrompt] = useState('');
  const [mode, setMode] = useState<CreationMode>('promptDrive');
  const [substrateTier] = useState<SubstrateTier>('A');

  // 选址(可选):放到地图 or 仅创作流(需求 1.6/1.7)。
  // 普通用户不懂经纬度 —— 勾选后用设备 GPS 自动取当前位置(expo-location,优雅降级)。
  const [placeOnMap, setPlaceOnMap] = useState(false);
  const [geoCoords, setGeoCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [geoStatus, setGeoStatus] = useState<'idle' | 'locating' | 'ok' | 'failed'>('idle');

  // 创作进度状态。
  const [creationId, setCreationId] = useState<string | null>(null);
  const [generated, setGenerated] = useState(false);
  const [instruction, setInstruction] = useState('');
  const [shareCode, setShareCode] = useState<string | null>(null);
  const [manifestVersion, setManifestVersion] = useState<number | null>(null);

  const [generating, setGenerating] = useState(false);
  const [editing, setEditing] = useState(false);
  const [publishing, setPublishing] = useState(false);

  // 嵌入已有网页游戏(快速扩库:自上传/开源库/分发网络外链)。
  const [embedUrl, setEmbedUrl] = useState('');
  const [embedding, setEmbedding] = useState(false);
  const [artBusy, setArtBusy] = useState(false);
  // 店铺商品编辑(type==='shop'):简单 {name, priceAxp, description} 行。
  const [products, setProducts] = useState<Array<{ name: string; priceAxp: string; description: string }>>([
    { name: '', priceAxp: '', description: '' },
  ]);
  const [savingProducts, setSavingProducts] = useState(false);

  const onEmbedGame = useCallback(async () => {
    if (!creationId || !embedUrl.trim()) return;
    setEmbedding(true);
    try {
      // 导入用户自己网站上的游戏(任意公网 https URL)。
      await importCreationGame(creationId, embedUrl.trim());
      setEmbedUrl('');
      Alert.alert(
        t({ en: 'Web game imported', zh: '网页游戏已导入' }),
        t({ en: 'This creation now plays your imported web game.', zh: '该创作现在将加载你导入的网页游戏。' }),
      );
    } catch (e: any) {
      Alert.alert(
        t({ en: 'Import failed', zh: '导入失败' }),
        e?.message?.includes('https') || e?.message?.includes('public')
          ? t({ en: 'URL must be a public https address.', zh: '网址须为公网 https 地址。' })
          : (e?.message ?? String(e)),
      );
    } finally {
      setEmbedding(false);
    }
  }, [creationId, embedUrl, t]);

  // 店铺商品:保存为创作的 offerings(发布后体验页可购买,服务端权威结算)。
  const onSaveProducts = useCallback(async () => {
    if (!creationId) return;
    const items = products
      .map((p) => ({ name: p.name.trim(), priceAxp: Math.max(0, Math.round(Number(p.priceAxp) || 0)), description: p.description.trim() || undefined }))
      .filter((p) => p.name);
    if (items.length === 0) {
      Alert.alert(t({ en: 'Add a product', zh: '先加个商品' }), t({ en: 'Enter at least one product name.', zh: '至少填一个商品名称。' }));
      return;
    }
    setSavingProducts(true);
    try {
      const r = await setCreationOfferings(creationId, items);
      Alert.alert(t({ en: 'Saved', zh: '已保存' }), t({ en: `${r.count} product(s) listed. Publish to put them on sale.`, zh: `已上架 ${r.count} 个商品,发布后即可被购买。` }));
    } catch (e: any) {
      Alert.alert(t({ en: 'Save failed', zh: '保存失败' }), e?.message ?? String(e));
    } finally {
      setSavingProducts(false);
    }
  }, [creationId, products, t]);

  // AI 出图:封面(所有类型)/ 互动剧场景插画(drama)。用 BYO Bedrock 图像模型。
  const onGenerateArt = useCallback(async () => {
    if (!creationId) return;
    setArtBusy(true);
    try {
      if (type === 'drama') {
        const r = await illustrateDrama(creationId);
        Alert.alert(
          t({ en: 'Art generated', zh: '插画已生成' }),
          t({ en: `Cover + ${r.sceneImages} scene image(s) created.`, zh: `已生成封面 + ${r.sceneImages} 张场景图。` }),
        );
      } else {
        await generateCreationCover(creationId);
        Alert.alert(t({ en: 'Cover generated', zh: '封面已生成' }), t({ en: 'AI cover set as preview.', zh: 'AI 封面已设为预览图。' }));
      }
    } catch (e: any) {
      const msg = String(e?.message ?? e);
      Alert.alert(
        t({ en: 'Image generation failed', zh: '出图失败' }),
        /image model|AccessDenied|not accessible|enable/i.test(msg)
          ? t({ en: 'Your Bedrock account needs image-model access (Titan Image Generator / Stability). Enable it in the Bedrock console.', zh: '你的 Bedrock 账号需要开通图像模型权限(Titan Image Generator / Stability),请在 Bedrock 控制台启用后重试。' })
          : msg,
      );
    } finally {
      setArtBusy(false);
    }
  }, [creationId, type, t]);

  const resolveGeo = useCallback(():
    | { lat: number; lng: number }
    | undefined => {
    if (!placeOnMap) return undefined;
    return geoCoords ?? undefined;
  }, [placeOnMap, geoCoords]);

  // 取当前位置(expo-location,带超时兜底;无 GPS/权限被拒 → 优雅失败可重试)。
  const fetchLocation = useCallback(async () => {
    setGeoStatus('locating');
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires, global-require
      const Location = require('expo-location');
      const perm = await Location.requestForegroundPermissionsAsync();
      if (perm?.status !== 'granted') {
        setGeoStatus('failed');
        return;
      }
      const pos: any = await Promise.race([
        Location.getCurrentPositionAsync({ accuracy: Location.Accuracy?.Low ?? 2 }),
        new Promise((resolve) => setTimeout(() => resolve(null), 10_000)),
      ]);
      if (pos?.coords && Number.isFinite(pos.coords.latitude) && Number.isFinite(pos.coords.longitude)) {
        setGeoCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setGeoStatus('ok');
      } else {
        setGeoStatus('failed');
      }
    } catch {
      setGeoStatus('failed');
    }
  }, []);

  const onToggleMap = useCallback(() => {
    setPlaceOnMap((prev) => {
      const next = !prev;
      if (next && !geoCoords) void fetchLocation();
      return next;
    });
  }, [geoCoords, fetchLocation]);

  // ① 生成:create(含 inline prompt,单一动作)→ 拿到 creationId + 草稿。
  const onGenerate = useCallback(async () => {
    if (!title.trim()) {
      Alert.alert(t({ en: 'Title required', zh: '需要标题' }), t({ en: 'Give your creation a name.', zh: '给你的创作起个名字。' }));
      return;
    }
    if (!prompt.trim()) {
      Alert.alert(t({ en: 'Describe it', zh: '描述一下' }), t({ en: 'Describe what AI should build.', zh: '描述你想让 AI 造什么。' }));
      return;
    }
    if (placeOnMap && !resolveGeo()) {
      Alert.alert(
        t({ en: 'Location not ready', zh: '位置未就绪' }),
        t({ en: 'Tap "Use my location" to set a spot, or turn off map placement.', zh: '点「用当前位置」获取定位,或关闭"放到世界地图"。' }),
      );
      return;
    }
    setGenerating(true);
    try {
      const res = await createCreation({
        type,
        title: title.trim(),
        substrateTier,
        prompt: prompt.trim(),
        surface: 'mobile',
        geo: resolveGeo(),
      });
      if (res.error) {
        Alert.alert(t({ en: 'Generation failed', zh: '生成失败' }), res.error.detail);
        return;
      }
      setCreationId(res.creation.id);
      setGenerated(true);
      // 互动剧:create 后立即生成分支故事(LLM→JSON,失败兜底自研剧本,保证可玩)。
      if (type === 'drama') {
        try {
          await generateDrama(res.creation.id);
        } catch (e: any) {
          Alert.alert(
            t({ en: 'Drama generation note', zh: '互动剧生成提示' }),
            t({ en: 'Used a fallback story; you can regenerate later.', zh: '已使用兜底剧本,可稍后重新生成。' }),
          );
        }
      }
      // Tier_C 被强制派发到桌面/Agent(需求 2.6)。
      if (res.dispatch?.mustDispatch && res.task) {
        Alert.alert(
          t({ en: 'Dispatched off-device', zh: '已派发离线生成' }),
          t({
            en: 'Tier_C creations are built on Desktop/Agent. Track the task status.',
            zh: 'Tier_C 创作在桌面/Agent 上构建,可跟踪任务状态。',
          }),
          [
            { text: t({ en: 'OK', zh: '好' }), style: 'cancel' },
            { text: t({ en: 'View task', zh: '查看任务' }), onPress: () => navigation.navigate('CreationTaskStatus', { taskId: res.task!.taskId }) },
          ],
        );
      }
    } catch (e: any) {
      Alert.alert(t({ en: 'Generation failed', zh: '生成失败' }), e?.message ?? String(e));
    } finally {
      setGenerating(false);
    }
  }, [type, title, prompt, substrateTier, placeOnMap, resolveGeo, t, navigation]);

  // ② 协同编辑(coEdit):自然语言增改,作用于同一 ECS_World(需求 2.2/2.3)。
  const onCoEdit = useCallback(async () => {
    if (!creationId || !instruction.trim()) return;
    setEditing(true);
    try {
      const res = await continueCreation(creationId, {
        mode: 'coEdit',
        surface: 'mobile',
        instruction: instruction.trim(),
        dispatchTarget: 'desktop',
      } as any);
      if ((res as any).error) {
        Alert.alert(t({ en: 'Edit failed', zh: '编辑失败' }), (res as any).error.detail);
        return;
      }
      setInstruction('');
      Alert.alert(t({ en: 'Applied', zh: '已应用' }), t({ en: 'Your edit was applied.', zh: '你的修改已应用。' }));
    } catch (e: any) {
      Alert.alert(t({ en: 'Edit failed', zh: '编辑失败' }), e?.message ?? String(e));
    } finally {
      setEditing(false);
    }
  }, [creationId, instruction, t]);

  // ③ 发布:过审 → 派生 offering/能力清单 → shareCode(需求 3.1/3.2/3.6/1.11)。
  const onPublish = useCallback(async () => {
    if (!creationId) return;
    setPublishing(true);
    try {
      // 发布前质量门预检(阶段 3.1/4.1):首发商业型不达标先给可行动提示,避免直接发布失败。
      try {
        const pre = await checkCreationQuality(creationId);
        if (pre.enforced && !pre.quality.pass) {
          const reasons = pre.quality.failed.flatMap((f) => f.reasons);
          Alert.alert(
            t({ en: 'Almost there — quality check', zh: '差一点 · 质量检查' }),
            (reasons.length ? reasons : [t({ en: 'Please improve the creation before publishing.', zh: '发布前请先完善创作。' })]).join('\n\n'),
          );
          return;
        }
      } catch {
        // 预检失败(网络等)不阻断:交给发布时的服务端权威判定兜底。
      }

      const res = await publishCreation(creationId);
      if (!res.published) {
        const isQuality = res.error?.error === 'QUALITY_REJECTED';
        Alert.alert(
          isQuality
            ? t({ en: 'Quality check not passed', zh: '质量未达标' })
            : t({ en: 'Publish rejected', zh: '发布被拒' }),
          res.error?.detail ??
            (isQuality
              ? t({ en: 'Please improve the creation and try again.', zh: '请完善创作后重试。' })
              : t({ en: 'Moderation rejected.', zh: '审核未通过。' })),
        );
        return;
      }
      setShareCode(res.shareCode ?? null);
      setManifestVersion(res.manifestVersion ?? null);
      Alert.alert(
        t({ en: 'Published', zh: '发布成功' }),
        res.shareCode
          ? t({ en: `Share code: ${res.shareCode}`, zh: `分享码:${res.shareCode}` })
          : t({ en: 'Your creation is live.', zh: '你的创作已上线。' }),
      );
    } catch (e: any) {
      Alert.alert(t({ en: 'Publish failed', zh: '发布失败' }), e?.message ?? String(e));
    } finally {
      setPublishing(false);
    }
  }, [creationId, t]);

  return (
    <View style={styles.root}>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content} testID="creation-creator-scroll">
        <Text style={styles.title}>✨ {t({ en: 'New Creation', zh: '新建创作' })}</Text>

        {/* 类型 */}
        <Text style={styles.label}>{t({ en: 'Type', zh: '类型' })}</Text>
        <View style={styles.chipRow}>
          {TYPES.map((ty) => (
            <TouchableOpacity
              key={ty.value}
              style={[styles.chip, type === ty.value && styles.chipActive]}
              onPress={() => setType(ty.value)}
              testID={`creator-type-${ty.value}`}
            >
              <Text style={[styles.chipText, type === ty.value && styles.chipTextActive]}>
                {ty.emoji} {t(ty.label)}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* drama 引导:互动剧 = 分支叙事 + 选择 + AXP 解锁,prompt 给"题材/人设/冲突"。 */}
        {type === 'drama' ? (
          <View style={styles.gameGuide} testID="creator-drama-guide">
            <Text style={styles.gameGuideTitle}>🎭 {t({ en: 'About interactive drama', zh: '关于互动剧' })}</Text>
            <Text style={styles.gameGuideText}>
              {t({
                en: '• AI writes a branching short drama (3 episodes): scenes + choices + multiple endings.\n• Episode 1 is free; later episodes unlock with AXP; viewers can tip you.\n• Describe the genre, characters, and central conflict (e.g. urban suspense romance). No video — text + scene art.',
                zh: '• AI 生成分支短剧(3 集):场景 + 选择 + 多结局。\n• 第 1 集免费,后续集用 AXP 解锁,观众还能打赏你。\n• 描述题材、人设、核心冲突(如:都市悬疑甜宠)。无真人视频 —— 图文 + 场景图。',
              })}
            </Text>
          </View>
        ) : null}

        {/* game 引导:生成质量与所用模型强相关 + 复杂度边界 + BYO 建议(需求:游戏质量随模型)。 */}
        {type === 'game' ? (
          <View style={styles.gameGuide} testID="creator-game-guide">
            <Text style={styles.gameGuideTitle}>🎮 {t({ en: 'About AI-generated games', zh: '关于 AI 生成游戏' })}</Text>
            <Text style={styles.gameGuideText}>
              {t({
                en: '• Best for simple single-player 2D games: puzzle (2048/match), arcade (snake/breakout), board/card, light tower-defense.\n• Quality depends on YOUR model: free tier uses Haiku (weaker); Pro+ uses Sonnet; configure your own API key (BYO) for Opus / best results.\n• Too complex (3D, multiplayer, heavy assets) is not supported on mobile — use Desktop instead.\n• Describe the rules, controls and win/lose clearly to get a better result.',
                zh: '• 适合简单单机 2D 游戏:益智(2048/消除)、街机(贪吃蛇/打砖块)、棋牌、轻量塔防。\n• 质量取决于你用的模型:免费档用 Haiku(较弱);Pro+ 用 Sonnet;配置自己的 API Key(BYO)可用 Opus / 效果最佳。\n• 过于复杂(3D、联网对战、重素材)手机端不支持 —— 请用电脑端。\n• 把规则、操作方式、胜负条件描述清楚,生成效果更好。',
              })}
            </Text>
          </View>
        ) : null}

        {/* ① 描述 */}
        <Text style={styles.sectionTitle}>① {t({ en: 'Describe what to build', zh: '描述你想造什么' })}</Text>
        <TextInput
          testID="creator-title-input"
          style={styles.input}
          placeholder={t({ en: 'Creation name', zh: '创作名称' })}
          placeholderTextColor={colors.textMuted}
          value={title}
          onChangeText={setTitle}
          maxLength={60}
        />
        <View style={styles.modeRow}>
          {MODES.map((m) => (
            <TouchableOpacity
              key={m.value}
              style={[styles.modeBtn, mode === m.value && styles.modeBtnActive]}
              onPress={() => setMode(m.value)}
              testID={`creator-mode-${m.value}`}
            >
              <Text style={[styles.modeBtnText, mode === m.value && styles.modeBtnTextActive]}>{t(m.label)}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <TextInput
          testID="creator-prompt-input"
          style={[styles.input, styles.multiline]}
          placeholder={t({ en: 'e.g. A cozy late-night pour-over cafe, americano ¥18, seat reservation', zh: '例如:一家安静的深夜手冲咖啡馆,美式 18,可预约座位' })}
          placeholderTextColor={colors.textMuted}
          value={prompt}
          onChangeText={setPrompt}
          multiline
        />

        {/* 选址(可选) */}
        <TouchableOpacity style={styles.toggleRow} onPress={onToggleMap} testID="creator-toggle-map">
          <Text style={styles.toggleBox}>{placeOnMap ? '☑' : '☐'}</Text>
          <Text style={styles.toggleText}>
            {t({ en: 'Place on the world map (optional)', zh: '放到世界地图(可选)' })}
          </Text>
        </TouchableOpacity>
        {placeOnMap ? (
          <View style={styles.geoBox}>
            <TouchableOpacity
              style={styles.geoBtn}
              onPress={() => void fetchLocation()}
              disabled={geoStatus === 'locating'}
              testID="creator-use-location"
            >
              {geoStatus === 'locating' ? (
                <ActivityIndicator color={colors.accent} />
              ) : (
                <Text style={styles.geoBtnText}>
                  📍 {geoStatus === 'ok'
                    ? t({ en: 'Location set · tap to refresh', zh: '已获取位置 · 点此刷新' })
                    : t({ en: 'Use my location', zh: '用当前位置' })}
                </Text>
              )}
            </TouchableOpacity>
            {geoStatus === 'ok' && geoCoords ? (
              <Text style={styles.geoHint}>📌 {geoCoords.lat.toFixed(4)}, {geoCoords.lng.toFixed(4)}</Text>
            ) : null}
            {geoStatus === 'failed' ? (
              <Text style={styles.geoHint}>{t({ en: 'Could not get location (permission/GPS). You can still publish to the feed without a map spot.', zh: '未能获取定位(权限/GPS)。也可不放地图,仅发到创作流。' })}</Text>
            ) : null}
          </View>
        ) : null}

        <TouchableOpacity
          style={[styles.primaryBtn, generating && styles.btnDisabled]}
          onPress={onGenerate}
          disabled={generating}
          testID="creator-generate-btn"
        >
          {generating ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryBtnText}>✨ {t({ en: 'Let AI generate', zh: '让 AI 生成' })}</Text>}
        </TouchableOpacity>

        {/* ② 生成后:预览 + 自动派生说明 + coEdit */}
        {generated ? (
          <>
            {/* AI 出图:封面(所有类型)+ 互动剧场景插画。用 BYO Bedrock 图像模型(Titan/Stability)。 */}
            <View style={styles.card} testID="creator-art-card">
              <Text style={styles.cardText}>🎨 {t({ en: 'AI cover & art', zh: 'AI 封面与插画' })}</Text>
              <Text style={styles.cardHint}>
                {t({
                  en: 'Generate a real cover image (shown on the feed card & share poster). For drama, also illustrates each episode. Uses your AWS Bedrock image model.',
                  zh: '生成真实封面图(创作流卡片 + 分享海报使用)。互动剧还会为每集生成场景插画。使用你的 AWS Bedrock 图像模型。',
                })}
              </Text>
              <TouchableOpacity
                style={[styles.secondaryBtn, artBusy && styles.btnDisabled]}
                onPress={onGenerateArt}
                disabled={artBusy}
                testID="creator-art-btn"
              >
                {artBusy ? <ActivityIndicator color={colors.accent} /> : (
                  <Text style={styles.secondaryBtnText}>
                    {type === 'drama' ? `🎬 ${t({ en: 'Generate cover + scene art', zh: '生成封面 + 场景插画' })}` : `🖼 ${t({ en: 'Generate AI cover', zh: '生成 AI 封面' })}`}
                  </Text>
                )}
              </TouchableOpacity>
            </View>

            {/* shop 类型:商品上架编辑(name/价格 AXP/描述)。保存为 offerings,发布后体验页可购买。 */}
            {type === 'shop' ? (
              <View style={styles.card} testID="creator-shop-card">
                <Text style={styles.cardText}>🛒 {t({ en: 'List products', zh: '上架商品' })}</Text>
                <Text style={styles.cardHint}>
                  {t({ en: 'Add products with an AXP price. Buyers pay AXP (server-authoritative), credited to you.', zh: '添加带 AXP 价格的商品。买家用 AXP 购买(服务端权威结算),收入归你。' })}
                </Text>
                {products.map((p, idx) => (
                  <View key={idx} style={styles.shopRow}>
                    <TextInput
                      style={[styles.input, { flex: 2, marginBottom: 0 }]}
                      value={p.name}
                      onChangeText={(v) => setProducts((prev) => prev.map((x, i) => (i === idx ? { ...x, name: v } : x)))}
                      placeholder={t({ en: 'Product name', zh: '商品名' })}
                      placeholderTextColor={colors.textMuted}
                    />
                    <TextInput
                      style={[styles.input, { flex: 1, marginBottom: 0 }]}
                      value={p.priceAxp}
                      onChangeText={(v) => setProducts((prev) => prev.map((x, i) => (i === idx ? { ...x, priceAxp: v.replace(/[^0-9]/g, '') } : x)))}
                      placeholder="AXP"
                      placeholderTextColor={colors.textMuted}
                      keyboardType="number-pad"
                    />
                  </View>
                ))}
                <View style={styles.shopBtns}>
                  <TouchableOpacity onPress={() => setProducts((prev) => [...prev, { name: '', priceAxp: '', description: '' }])}>
                    <Text style={styles.addProductText}>＋ {t({ en: 'Add', zh: '加一行' })}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.secondaryBtn, savingProducts && styles.btnDisabled, { flex: 1, marginLeft: 12 }]}
                    onPress={onSaveProducts}
                    disabled={savingProducts}
                    testID="creator-shop-save"
                  >
                    {savingProducts ? <ActivityIndicator color={colors.accent} /> : <Text style={styles.secondaryBtnText}>💾 {t({ en: 'Save products', zh: '保存商品' })}</Text>}
                  </TouchableOpacity>
                </View>
              </View>
            ) : null}

            {/* game 类型:可改为"嵌入已有网页游戏"(快速扩库:开源库/分发网络/自有外链)。 */}
            {type === 'game' ? (
              <View style={styles.card} testID="creator-embed-card">
                <Text style={styles.cardText}>🌐 {t({ en: 'Or import your own web game', zh: '或:导入我自己的网页游戏' })}</Text>
                <Text style={styles.cardHint}>
                  {t({
                    en: 'Already have a playable HTML5 game on your own site? Paste its https URL to import it directly (loads in a sandboxed player).',
                    zh: '已经在自己网站上做好了 HTML5 游戏?粘贴它的 https 网址直接导入(在沙箱播放器中加载)。',
                  })}
                </Text>
                <TextInput
                  style={styles.input}
                  value={embedUrl}
                  onChangeText={setEmbedUrl}
                  placeholder="https://your-site.com/your-game/"
                  placeholderTextColor={colors.textMuted}
                  autoCapitalize="none"
                  autoCorrect={false}
                  testID="creator-embed-url"
                />
                <TouchableOpacity
                  style={[styles.secondaryBtn, (embedding || !embedUrl.trim()) && styles.btnDisabled]}
                  onPress={onEmbedGame}
                  disabled={embedding || !embedUrl.trim()}
                  testID="creator-embed-btn"
                >
                  {embedding ? <ActivityIndicator color={colors.accent} /> : <Text style={styles.secondaryBtnText}>🔗 {t({ en: 'Import web game', zh: '导入网页游戏' })}</Text>}
                </TouchableOpacity>
              </View>
            ) : null}

            <Text style={styles.sectionTitle}>② {t({ en: 'Preview & auto-derived', zh: '预览与自动派生' })}</Text>
            <View style={styles.card}>
              <Text style={styles.cardText}>
                ✅ {t({ en: 'Draft generated.', zh: '草稿已生成。' })}
              </Text>
              <Text style={styles.cardHint}>
                🧾 {t({
                  en: 'On publish, the system auto-derives your offerings (goods/services) and Agent-callable capabilities (MCP tools) — you never write an API.',
                  zh: '发布时,系统会自动识别你的供给(商品/服务)并生成 Agent 可调用能力(MCP 工具)——你无需写任何接口。',
                })}
              </Text>
            </View>

            {/* coEdit:自然语言继续编辑 */}
            <TextInput
              style={[styles.input, styles.multiline]}
              placeholder={t({ en: 'Refine in words: e.g. add a window seat', zh: '用一句话继续改:例如"加一个靠窗座位"' })}
              placeholderTextColor={colors.textMuted}
              value={instruction}
              onChangeText={setInstruction}
              multiline
            />
            <TouchableOpacity
              style={[styles.secondaryBtn, editing && styles.btnDisabled]}
              onPress={onCoEdit}
              disabled={editing || !instruction.trim()}
              testID="creator-coedit-btn"
            >
              {editing ? <ActivityIndicator color={colors.accent} /> : <Text style={styles.secondaryBtnText}>🪄 {t({ en: 'Apply edit', zh: '应用修改' })}</Text>}
            </TouchableOpacity>
          </>
        ) : null}

        {/* 发布结果 */}
        {shareCode ? (
          <View style={[styles.card, styles.cardOk]}>
            <Text style={styles.cardText}>🎉 {t({ en: 'Published', zh: '已发布' })} · {t({ en: 'Share code', zh: '分享码' })}: {shareCode}</Text>
            {manifestVersion != null ? (
              <Text style={styles.cardHint}>🤖 {t({ en: 'Agent capabilities ready', zh: 'Agent 能力已就绪' })} (manifest v{manifestVersion})</Text>
            ) : null}
            <TouchableOpacity
              style={styles.manageBtn}
              onPress={() => navigation.navigate('MyWorld')}
              testID="creator-view-my-works"
            >
              <Text style={styles.manageBtnText}>🏙️ {t({ en: 'Manage my creations', zh: '查看 / 管理我的作品' })}</Text>
            </TouchableOpacity>
          </View>
        ) : null}
      </ScrollView>

      {/* ③ 发布(底部固定) */}
      <View style={styles.footer}>
        <TouchableOpacity
          style={[styles.publishBtn, (!generated || publishing) && styles.btnDisabled]}
          onPress={onPublish}
          disabled={!generated || publishing}
          testID="creator-publish-btn"
        >
          {publishing ? <ActivityIndicator color="#fff" /> : <Text style={styles.publishBtnText}>{t({ en: 'Submit for review & publish', zh: '提交审核并发布' })}</Text>}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = themedStyles(() => StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bgPrimary },
  scroll: { flex: 1 },
  content: { padding: 16, paddingBottom: 32 },
  title: { color: colors.textPrimary, fontSize: 22, fontWeight: '800', marginBottom: 16 },
  label: { color: colors.textSecondary, fontSize: 13, marginBottom: 8 },
  sectionTitle: { color: colors.textPrimary, fontSize: 16, fontWeight: '700', marginTop: 20, marginBottom: 10 },

  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 4 },
  chip: { paddingVertical: 8, paddingHorizontal: 14, borderRadius: 20, backgroundColor: colors.bgCard, borderWidth: 1, borderColor: colors.border },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { color: colors.textSecondary, fontSize: 13 },
  chipTextActive: { color: '#fff', fontWeight: '700' },

  gameGuide: { backgroundColor: colors.bgCard, borderRadius: 12, borderWidth: 1, borderColor: colors.border, padding: 12, marginTop: 10 },
  gameGuideTitle: { color: colors.textPrimary, fontSize: 14, fontWeight: '700', marginBottom: 6 },
  shopRow: { flexDirection: 'row', gap: 8, marginTop: 8 },
  shopBtns: { flexDirection: 'row', alignItems: 'center', marginTop: 12 },
  addProductText: { color: colors.accent, fontSize: 14, fontWeight: '700' },
  gameGuideText: { color: colors.textSecondary, fontSize: 12, lineHeight: 19 },

  input: { backgroundColor: colors.bgCard, borderRadius: 10, borderWidth: 1, borderColor: colors.border, color: colors.textPrimary, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, marginBottom: 12 },
  multiline: { minHeight: 90, textAlignVertical: 'top' },

  modeRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  modeBtn: { flex: 1, paddingVertical: 9, borderRadius: 10, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.bgCard, alignItems: 'center' },
  modeBtnActive: { borderColor: colors.accent },
  modeBtnText: { color: colors.textSecondary, fontSize: 13, fontWeight: '600' },
  modeBtnTextActive: { color: colors.accent },

  toggleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  toggleBox: { color: colors.accent, fontSize: 18 },
  toggleText: { color: colors.textSecondary, fontSize: 13 },
  geoBox: { marginBottom: 12, gap: 8 },
  geoBtn: { backgroundColor: colors.bgCard, borderRadius: 10, borderWidth: 1, borderColor: colors.accent, paddingVertical: 12, alignItems: 'center' },
  geoBtnText: { color: colors.accent, fontSize: 14, fontWeight: '700' },
  geoHint: { color: colors.textMuted, fontSize: 12, lineHeight: 17 },

  primaryBtn: { backgroundColor: colors.primary, borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginTop: 4 },
  primaryBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  secondaryBtn: { backgroundColor: colors.bgCard, borderRadius: 12, paddingVertical: 12, alignItems: 'center', borderWidth: 1, borderColor: colors.border },
  secondaryBtnText: { color: colors.accent, fontSize: 14, fontWeight: '600' },
  btnDisabled: { opacity: 0.5 },

  card: { backgroundColor: colors.bgCard, borderRadius: 12, borderWidth: 1, borderColor: colors.border, padding: 14, marginBottom: 12 },
  cardOk: { borderColor: 'rgba(16,185,129,0.4)', backgroundColor: 'rgba(16,185,129,0.10)' },
  cardText: { color: colors.textPrimary, fontSize: 14, fontWeight: '600' },
  cardHint: { color: colors.textMuted, fontSize: 12, lineHeight: 18, marginTop: 6 },
  manageBtn: { marginTop: 12, backgroundColor: colors.primary, borderRadius: 10, paddingVertical: 11, alignItems: 'center' },
  manageBtnText: { color: '#fff', fontSize: 14, fontWeight: '700' },

  footer: { padding: 16, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.bgSecondary },
  publishBtn: { backgroundColor: colors.accent, borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  publishBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
}));
