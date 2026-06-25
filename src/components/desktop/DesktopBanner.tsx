/**
 * DesktopBanner — 移动端「解锁专业能力 · 连接电脑」跨端常驻 banner(Requirement 7,Design §6)。
 *
 * spec:   .kiro/specs/soul-companion-onboarding/{requirements,design}.md
 * task:   4.1(Requirements 7.1, 7.2, 7.3, 7.3a, 7.4,Design §6)
 *
 * 行为(Design §6):
 *   - 常驻入口(R7.1):移动端主界面常驻;`variant='persistent'` 折叠为一条卡片,点按展开。
 *   - 展开介绍多端特色(R7.2):手机端=陪伴/查询/管日程;桌面端=Computer Use、vibe coding;
 *     同一灵魂、同一份记忆跨端同步。
 *   - 首连(未配对过,R7.3 / R7.4):「连接电脑」→ 复用 `createBindSession()` 展示 QR +
 *     桌面端下载链接 + 配对步骤;轮询 `pollBindSession(sessionId)` 直至 `confirmed`。
 *     **复用既有 OpenClaw QR 配对协议,不新建**(C8)。
 *   - 已配对过(R7.3a):跳过首连引导,直接展示跨端状态/管理入口(presence 设备列表)。
 *
 * 复用(不重写):
 *   - `createBindSession` / `pollBindSession`(openclaw.service)——QR 配对链路(C8)。
 *   - `mapRawInstance` + `authStore.addInstance/setActiveInstance`——确认后登记新实例
 *     (镜像 OpenClawBindScreen 的既有 QR bind 流程)。
 *   - `detectDesktopPairedBefore`(onboarding/externalFacts)——与 Soul_Birth 编排器共用的
 *     单一「曾配对桌面端」检测路径(R7.3a)。
 *   - `queryPresence` / `subscribePresence`(presence.service)——已配对视图的设备在线列表
 *     (R8.5;失败/无 socket.io 静默降级)。
 *   - `QrCode`(common/QrCode)——QR 渲染(react-native-qrcode-svg,未装时文本占位)。
 *
 * 与编排器衔接(Task 4.2 拥有):本组件以 `variant='embedded'` + `onPaired` / `onLater` 暴露
 * 干净 API,供 `ConnectDesktopStep` 内嵌首连引导——本任务**不**改动 SoulBirthHost /
 * ConnectDesktopStep。
 *
 * 安全:QR/bind 会话为敏感配对流;下载链接与配对步骤可见,但**不**把 `qrData`/token 写入
 * 日志(R7.4 安全注记)。
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Linking,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { colors } from '../../theme/colors';
import { QrCode } from '../common/QrCode';
import { useAuthStore } from '../../stores/authStore';
import { useSoulBirthStore } from '../../stores/soulBirthStore';
import {
  createBindSession,
  pollBindSession,
  type OpenClawInstanceInfo,
} from '../../services/openclaw.service';
import { mapRawInstance } from '../../services/auth';
import { detectDesktopPairedBefore } from '../onboarding/externalFacts';
import {
  queryPresence,
  subscribePresence,
  type PresenceDevice,
  type DevicePresence,
  type PresenceSubscription,
} from '../../services/presence.service';
import { themedStyles } from '../../theme/useTheme';

// ── Tuning constants ──────────────────────────────────────────────────────────
/** pollBindSession 轮询间隔(ms)。与 OpenClawBindScreen 同量级,够灵敏又不过载。 */
const POLL_INTERVAL_MS = 2_500;

/** 桌面端下载入口(与 LocalDeployScreen / LocalConnectScreen 既有链接一致)。 */
const DOWNLOAD_PAGE_URL = 'https://agentrix.top/download';
const DOWNLOAD_WIN_URL = 'https://api.agentrix.top/downloads/Agentrix-Claw-Setup.exe';
const DOWNLOAD_MAC_URL = 'https://api.agentrix.top/downloads/agentrix-claw-mac';

/** 首连配对步骤文案(R7.4:扫码 + 下载 + 配对步骤)。 */
const PAIRING_STEPS: string[] = [
  '在电脑上打开 agentrix.top/download,下载并安装 Agentrix 桌面端',
  '打开桌面端,选择「连接手机 / 扫码登录」',
  '用桌面端扫描下方二维码,完成跨端配对',
];

/** 多端特色介绍(R7.2)。 */
const MOBILE_FEATURES = '陪伴 · 随时问答 · 管日程/邮件';
const DESKTOP_FEATURES = 'Computer Use · vibe coding · 专业生产力';

// ── Types ─────────────────────────────────────────────────────────────────────
export interface DesktopBannerProps {
  /**
   * 展示形态:
   *  - `persistent`(默认):主界面常驻折叠条,点按展开(R7.1)。
   *  - `embedded`:供 onboarding `ConnectDesktopStep`(Task 4.2)内嵌——默认展开,
   *    直接呈现介绍 + 首连引导,不渲染折叠态。
   */
  variant?: 'persistent' | 'embedded';
  /**
   * 配对成功回调(pollBindSession → `confirmed`)。Task 4.2 据此建立 presence +
   * 推进 `connect_desktop` 步骤(R7.7 / R8.1)。本组件已自行 addInstance 登记实例。
   */
  onPaired?: (instance: OpenClawInstanceInfo) => void;
  /**
   * 可选「稍后连接」入口。`embedded` 模式渲染为按钮(Task 4.2 接 `onComplete`,R7.6);
   * `persistent` 模式忽略。
   */
  onLater?: () => void;
  /**
   * 覆盖用于查询 presence / 跨端状态的实例 id;省略则取
   * `authStore.activeInstance.id ?? soulBirthStore.instanceId`。
   */
  instanceId?: string | null;
}

/** banner 内部视图状态机。 */
type Mode = 'collapsed' | 'intro' | 'connecting' | 'paired';

// ── Helpers ─────────────────────────────────────────────────────────────────────
const DEVICE_LABEL: Record<PresenceDevice, string> = {
  mobile: '📱 手机',
  desktop: '🖥 电脑',
};

/** lastSeen(epoch ms)→ 人类可读相对时间。 */
function formatLastSeen(lastSeen: number): string {
  const diff = Date.now() - lastSeen;
  if (!Number.isFinite(diff) || diff < 0) return '刚刚';
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return '刚刚';
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} 分钟前`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} 小时前`;
  return `${Math.floor(hr / 24)} 天前`;
}

const openUrl = (url: string) => {
  void Linking.openURL(url).catch(() => {
    /* 打开外链失败静默吞掉:不阻塞 banner。 */
  });
};

export function DesktopBanner({
  variant = 'persistent',
  onPaired,
  onLater,
  instanceId: instanceIdProp,
}: DesktopBannerProps) {
  // 有效实例 id:props 覆盖 → 活跃实例 → birth 段产出实例。
  const activeInstanceId = useAuthStore((s) => s.activeInstance?.id ?? null);
  const soulBirthInstanceId = useSoulBirthStore((s) => s.instanceId);
  const effectiveInstanceId = useMemo(
    () => instanceIdProp ?? activeInstanceId ?? soulBirthInstanceId ?? null,
    [instanceIdProp, activeInstanceId, soulBirthInstanceId],
  );

  // 初始视图:persistent 折叠;embedded 直接展开介绍(检测完成后可能切到 paired)。
  const [mode, setMode] = useState<Mode>(variant === 'embedded' ? 'intro' : 'collapsed');
  const [pairedBefore, setPairedBefore] = useState<boolean>(false);
  const [qr, setQr] = useState<{ sessionId: string; qrData: string } | null>(null);
  const [qrExpired, setQrExpired] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [presences, setPresences] = useState<DevicePresence[]>([]);

  // 生命周期守卫 + 资源句柄。
  const disposedRef = useRef(false);
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const presenceSubRef = useRef<PresenceSubscription | null>(null);

  const clearPoll = useCallback(() => {
    if (pollTimerRef.current) {
      clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }
  }, []);

  // 卸载时彻底清理轮询与 presence 订阅,避免悬挂资源。
  useEffect(() => {
    return () => {
      disposedRef.current = true;
      clearPoll();
      presenceSubRef.current?.disconnect();
      presenceSubRef.current = null;
    };
  }, [clearPoll]);

  // ── 挂载时检测「曾配对桌面端」(R7.3a)。失败默认未配对,不阻塞(主线必达)。──────────
  useEffect(() => {
    let cancelled = false;
    detectDesktopPairedBefore()
      .then((paired) => {
        if (cancelled) return;
        setPairedBefore(paired);
        // embedded:已配对 → 直接展示跨端状态(跳过首连引导,R7.3a)。
        if (variant === 'embedded' && paired) setMode('paired');
      })
      .catch(() => {
        /* 检测失败 → 维持未配对态,首连引导照常可用。 */
      });
    return () => {
      cancelled = true;
    };
  }, [variant]);

  // ── 已配对视图:查询 + 订阅 presence 设备列表(R8.5)。──────────────────────────────
  useEffect(() => {
    if (mode !== 'paired' || !effectiveInstanceId) return;
    let cancelled = false;

    queryPresence(effectiveInstanceId)
      .then((snap) => {
        if (!cancelled) setPresences(snap.presences);
      })
      .catch(() => {
        /* 查询失败:设备列表留空,UI 给出降级文案,不阻塞。 */
      });

    const sub = subscribePresence({
      instanceId: effectiveInstanceId,
      onUpdate: (update) => {
        if (!cancelled) setPresences(update.presences);
      },
    });
    presenceSubRef.current = sub;

    return () => {
      cancelled = true;
      sub.disconnect();
      presenceSubRef.current = null;
    };
  }, [mode, effectiveInstanceId]);

  // ── 配对确认:登记实例 + 切到已配对视图 + 通知父级(R7.7 衔接)。──────────────────────
  const handleConfirmed = useCallback(
    (raw: OpenClawInstanceInfo) => {
      // 镜像 OpenClawBindScreen:把新实例登记进 authStore 并设为活跃。
      try {
        const mapped = mapRawInstance(raw);
        const { addInstance, setActiveInstance } = useAuthStore.getState();
        addInstance(mapped);
        if (mapped.id) setActiveInstance(mapped.id);
      } catch {
        /* 映射/登记失败不阻塞:仍切到已配对视图并回调父级。 */
      }
      setPairedBefore(true);
      setQr(null);
      setQrExpired(false);
      setMode('paired');
      onPaired?.(raw);
    },
    [onPaired],
  );

  // ── 轮询 pollBindSession 直至 confirmed / expired(C8 复用)。────────────────────────
  const beginPolling = useCallback(
    (sessionId: string) => {
      clearPoll();
      pollTimerRef.current = setInterval(async () => {
        try {
          const res = await pollBindSession(sessionId);
          if (disposedRef.current) return;
          if (res.status === 'confirmed' && res.instance) {
            clearPoll();
            handleConfirmed(res.instance);
          } else if (res.status === 'expired') {
            clearPoll();
            setQrExpired(true);
          }
        } catch {
          /* 轮询瞬时失败:保持轮询,等待下一次(网络抖动不致命)。 */
        }
      }, POLL_INTERVAL_MS);
    },
    [clearPoll, handleConfirmed],
  );

  // ── 「连接电脑」:创建 bind 会话 → 展示 QR → 起轮询(R7.3 / R7.4)。──────────────────
  const startConnect = useCallback(async () => {
    setError(null);
    setQrExpired(false);
    setQr(null);
    setMode('connecting');
    try {
      const session = await createBindSession();
      if (disposedRef.current) return;
      // 注意:qrData 含敏感配对载荷,只入 state 渲染,不写日志(R7.4 安全)。
      setQr({ sessionId: session.sessionId, qrData: session.qrData });
      beginPolling(session.sessionId);
    } catch {
      if (disposedRef.current) return;
      setError('暂时无法生成配对二维码,请稍后重试。');
      setMode('intro');
    }
  }, [beginPolling]);

  // 展开折叠条(persistent):已配对 → 直接跨端状态;否则 → 介绍 + 首连入口。
  const expand = useCallback(() => {
    setMode(pairedBefore ? 'paired' : 'intro');
  }, [pairedBefore]);

  const collapse = useCallback(() => {
    clearPoll();
    setQr(null);
    setQrExpired(false);
    setError(null);
    setMode('collapsed');
  }, [clearPoll]);

  // ── 渲染 ──────────────────────────────────────────────────────────────────────

  // 折叠态(persistent,R7.1):一条常驻入口卡片。
  if (mode === 'collapsed') {
    return (
      <Pressable
        style={styles.collapsedCard}
        onPress={expand}
        accessibilityRole="button"
        accessibilityLabel="解锁专业能力,连接电脑"
      >
        <Text style={styles.collapsedIcon}>🖥</Text>
        <View style={{ flex: 1 }}>
          <Text style={styles.collapsedTitle}>解锁专业能力 · 连接电脑</Text>
          <Text style={styles.collapsedSubtitle}>
            {pairedBefore ? '查看跨端在线状态与管理' : '同一个灵魂跨到桌面端,记忆全程同步'}
          </Text>
        </View>
        <Text style={styles.collapsedArrow}>›</Text>
      </Pressable>
    );
  }

  // 展开容器(intro / connecting / paired 共用外壳)。
  return (
    <View style={styles.expandedCard}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>🖥 连接你的电脑</Text>
        {variant === 'persistent' ? (
          <Pressable onPress={collapse} hitSlop={10} accessibilityRole="button" accessibilityLabel="收起">
            <Text style={styles.collapseText}>收起</Text>
          </Pressable>
        ) : null}
      </View>

      {/* 多端特色介绍(R7.2)——所有展开视图都展示,强化「同一灵魂跨端」叙事。 */}
      <View style={styles.featureBlock}>
        <View style={styles.featureRow}>
          <Text style={styles.featureDevice}>📱 手机</Text>
          <Text style={styles.featureDesc}>{MOBILE_FEATURES}</Text>
        </View>
        <View style={styles.featureRow}>
          <Text style={styles.featureDevice}>🖥 电脑</Text>
          <Text style={styles.featureDesc}>{DESKTOP_FEATURES}</Text>
        </View>
        <Text style={styles.featureSync}>同一灵魂、同一份记忆,跨端实时同步。</Text>
      </View>

      {mode === 'intro' ? (
        <IntroActions
          error={error}
          onConnect={startConnect}
          onLater={onLater}
        />
      ) : null}

      {mode === 'connecting' ? (
        <ConnectingView
          qrData={qr?.qrData ?? null}
          expired={qrExpired}
          onRefresh={startConnect}
          onLater={onLater}
        />
      ) : null}

      {mode === 'paired' ? (
        <PairedView
          hasInstance={!!effectiveInstanceId}
          presences={presences}
          onLater={onLater}
        />
      ) : null}
    </View>
  );
}

export default DesktopBanner;

// ── Sub-views ────────────────────────────────────────────────────────────────

/** intro:介绍后的「连接电脑」CTA(R7.3 入口)。 */
function IntroActions({
  error,
  onConnect,
  onLater,
}: {
  error: string | null;
  onConnect: () => void;
  onLater?: () => void;
}) {
  return (
    <View>
      {error ? <Text style={styles.errorText}>{error}</Text> : null}
      <Pressable
        style={styles.primaryBtn}
        onPress={onConnect}
        accessibilityRole="button"
        accessibilityLabel="连接电脑"
      >
        <Text style={styles.primaryBtnText}>连接电脑</Text>
      </Pressable>
      {onLater ? (
        <Pressable
          style={styles.laterBtn}
          onPress={onLater}
          accessibilityRole="button"
          accessibilityLabel="稍后连接"
        >
          <Text style={styles.laterText}>稍后连接 →</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

/** connecting:QR + 下载链接 + 配对步骤 + 轮询等待(R7.3 / R7.4)。 */
function ConnectingView({
  qrData,
  expired,
  onRefresh,
  onLater,
}: {
  qrData: string | null;
  expired: boolean;
  onRefresh: () => void;
  onLater?: () => void;
}) {
  return (
    <ScrollView style={styles.connectScroll} contentContainerStyle={styles.connectContent}>
      {/* 1) 配对步骤(R7.4)。 */}
      <View style={styles.stepsBlock}>
        {PAIRING_STEPS.map((step, i) => (
          <View key={i} style={styles.stepRow}>
            <View style={styles.stepBadge}>
              <Text style={styles.stepBadgeText}>{i + 1}</Text>
            </View>
            <Text style={styles.stepText}>{step}</Text>
          </View>
        ))}
      </View>

      {/* 2) 下载链接(R7.4)。 */}
      <View style={styles.downloadRow}>
        <Pressable
          style={styles.downloadBtn}
          onPress={() => openUrl(DOWNLOAD_WIN_URL)}
          accessibilityRole="button"
          accessibilityLabel="下载 Windows 版"
        >
          <Text style={styles.downloadText}>⊞ Windows</Text>
        </Pressable>
        <Pressable
          style={styles.downloadBtn}
          onPress={() => openUrl(DOWNLOAD_MAC_URL)}
          accessibilityRole="button"
          accessibilityLabel="下载 macOS 版"
        >
          <Text style={styles.downloadText}> macOS</Text>
        </Pressable>
        <Pressable
          style={styles.downloadBtn}
          onPress={() => openUrl(DOWNLOAD_PAGE_URL)}
          accessibilityRole="button"
          accessibilityLabel="打开下载页"
        >
          <Text style={styles.downloadText}>↗ 下载页</Text>
        </Pressable>
      </View>

      {/* 3) QR + 状态(R7.3)。 */}
      <View style={styles.qrWrap}>
        {qrData ? (
          <>
            <View style={styles.qrBox}>
              <QrCode value={qrData} size={180} bgColor={colors.bgCard} fgColor={colors.textPrimary} />
            </View>
            {expired ? (
              <>
                <Text style={styles.qrExpiredText}>二维码已过期</Text>
                <Pressable
                  style={styles.refreshBtn}
                  onPress={onRefresh}
                  accessibilityRole="button"
                  accessibilityLabel="刷新二维码"
                >
                  <Text style={styles.refreshText}>🔄 刷新二维码</Text>
                </Pressable>
              </>
            ) : (
              <View style={styles.waitingRow}>
                <ActivityIndicator size="small" color={colors.accent} />
                <Text style={styles.waitingText}>等待电脑端扫码…</Text>
              </View>
            )}
          </>
        ) : (
          <ActivityIndicator size="large" color={colors.accent} style={{ marginVertical: 24 }} />
        )}
      </View>

      {onLater ? (
        <Pressable
          style={styles.laterBtn}
          onPress={onLater}
          accessibilityRole="button"
          accessibilityLabel="稍后连接"
        >
          <Text style={styles.laterText}>稍后连接 →</Text>
        </Pressable>
      ) : null}
    </ScrollView>
  );
}

/** paired:跨端状态/管理入口——presence 设备在线列表(R7.3a / R8.5)。 */
function PairedView({
  hasInstance,
  presences,
  onLater,
}: {
  hasInstance: boolean;
  presences: DevicePresence[];
  onLater?: () => void;
}) {
  return (
    <View>
      <Text style={styles.pairedHeading}>跨端状态</Text>
      {!hasInstance ? (
        <Text style={styles.mutedText}>暂未找到可用实例,稍后将自动同步跨端在线状态。</Text>
      ) : presences.length === 0 ? (
        <Text style={styles.mutedText}>正在同步设备在线状态…</Text>
      ) : (
        presences.map((p) => (
          <View key={p.device} style={styles.presenceRow}>
            <Text style={styles.presenceDevice}>{DEVICE_LABEL[p.device] ?? p.device}</Text>
            <View style={styles.presenceStatusWrap}>
              <View
                style={[
                  styles.presenceDot,
                  { backgroundColor: p.online ? colors.success : colors.textMuted },
                ]}
              />
              <Text style={[styles.presenceStatus, p.online && { color: colors.success }]}>
                {p.online ? '在线' : `离线 · ${formatLastSeen(p.lastSeen)}`}
              </Text>
            </View>
          </View>
        ))
      )}

      {onLater ? (
        <Pressable
          style={styles.primaryBtn}
          onPress={onLater}
          accessibilityRole="button"
          accessibilityLabel="完成"
        >
          <Text style={styles.primaryBtnText}>完成</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = themedStyles(() => StyleSheet.create({
  // collapsed
  collapsedCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.bgCard,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.accent + '55',
    paddingVertical: 14,
    paddingHorizontal: 14,
    gap: 12,
  },
  collapsedIcon: { fontSize: 24 },
  collapsedTitle: { color: colors.textPrimary, fontSize: 15, fontWeight: '700' },
  collapsedSubtitle: { color: colors.textSecondary, fontSize: 12, marginTop: 2 },
  collapsedArrow: { color: colors.textMuted, fontSize: 22 },

  // expanded shell
  expandedCard: {
    backgroundColor: colors.bgCard,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.accent + '55',
    padding: 16,
    gap: 14,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerTitle: { color: colors.textPrimary, fontSize: 17, fontWeight: '800' },
  collapseText: { color: colors.textMuted, fontSize: 13, fontWeight: '600' },

  // features (R7.2)
  featureBlock: {
    backgroundColor: colors.bgPrimary,
    borderRadius: 12,
    padding: 12,
    gap: 8,
  },
  featureRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  featureDevice: { color: colors.textPrimary, fontSize: 13, fontWeight: '700', width: 64 },
  featureDesc: { color: colors.textSecondary, fontSize: 13, flex: 1 },
  featureSync: { color: colors.accent, fontSize: 12, fontWeight: '600', marginTop: 2 },

  // intro / shared buttons
  primaryBtn: {
    backgroundColor: colors.primary,
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: 'center',
    marginTop: 4,
  },
  primaryBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  laterBtn: { marginTop: 12, paddingVertical: 10, alignItems: 'center' },
  laterText: { color: colors.textSecondary, fontSize: 14, fontWeight: '600' },
  errorText: { color: colors.error, fontSize: 13, marginBottom: 10, textAlign: 'center' },

  // connecting
  connectScroll: { maxHeight: 520 },
  connectContent: { gap: 16 },
  stepsBlock: { gap: 10 },
  stepRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  stepBadge: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.accent + '22',
    borderWidth: 1,
    borderColor: colors.accent + '88',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  stepBadgeText: { color: colors.accent, fontSize: 12, fontWeight: '800' },
  stepText: { color: colors.textSecondary, fontSize: 13, lineHeight: 19, flex: 1 },
  downloadRow: { flexDirection: 'row', gap: 8 },
  downloadBtn: {
    flex: 1,
    backgroundColor: colors.bgPrimary,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: 10,
    alignItems: 'center',
  },
  downloadText: { color: colors.textPrimary, fontSize: 12, fontWeight: '600' },
  qrWrap: { alignItems: 'center', gap: 12 },
  qrBox: {
    backgroundColor: colors.bgCard,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: colors.accent,
    padding: 6,
  },
  waitingRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  waitingText: { color: colors.textMuted, fontSize: 13, fontWeight: '600' },
  qrExpiredText: { color: colors.error, fontSize: 13, fontWeight: '600' },
  refreshBtn: {
    backgroundColor: colors.bgPrimary,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: 10,
    paddingHorizontal: 18,
  },
  refreshText: { color: colors.accent, fontSize: 14, fontWeight: '600' },

  // paired
  pairedHeading: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  mutedText: { color: colors.textMuted, fontSize: 13, lineHeight: 19 },
  presenceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.bgPrimary,
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginTop: 8,
  },
  presenceDevice: { color: colors.textPrimary, fontSize: 14, fontWeight: '600' },
  presenceStatusWrap: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  presenceDot: { width: 8, height: 8, borderRadius: 4 },
  presenceStatus: { color: colors.textMuted, fontSize: 13, fontWeight: '600' },
}));
