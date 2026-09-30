import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { colors } from '../../theme/colors';
import { useI18n } from '../../stores/i18nStore';
import {
  createRemoteDesktopCommand,
  fetchDesktopState,
  getMobileDesktopApprovalId,
  normalizeMobileDesktopApproval,
  respondToDesktopApproval,
  type MobileSubmittableDesktopCommandKind,
  type MobileDesktopApproval,
  type MobileDesktopCommand,
  type MobileDesktopState,
} from '../../services/desktopSync';
import { fetchOperationsContinuity, requestOperationsFollowUp, type OperationsContinuityState } from '../../services/operations';
import { WatchDataLayerService } from '../../services/wearables/watchDataLayerBridge.service';
import { themedStyles } from '../../theme/useTheme';
import { isMobileApprovalBlockedError, mobileApprovalCapabilities, mobileApprovalStatus } from '../../services/mobileApprovalPolicy';
import {
  describeDeviceSafetyReceipt,
  describeDeviceSafetyReceiptsProblem,
  groupDeviceSafetyReceipts,
  readDeviceSafetyReceipts,
  type DeviceSafetyReceiptsRead,
} from '../../services/deviceSafetyReceipts';
import { useReduceMotion } from '../../hooks/useReduceMotion';

const prettyJson = (value: unknown) => {
  if (value == null) return 'No result';
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
};

/**
 * A receipt that was not there at the previous read slides in over 250 ms (showcase A: the stop is
 * pulled on the computer, then the receipt shows up here). Nothing moves on the first read, on
 * later renders, or with reduce motion on.
 */
function FreshReceipt({ fresh, children }: { fresh: boolean; children: React.ReactNode }) {
  const reduceMotion = useReduceMotion();
  const progress = useRef(new Animated.Value(fresh ? 0 : 1)).current;
  useEffect(() => {
    if (!fresh) return;
    if (reduceMotion) {
      progress.setValue(1);
      return;
    }
    progress.setValue(0);
    Animated.timing(progress, { toValue: 1, duration: 250, useNativeDriver: true }).start();
  }, [fresh, reduceMotion, progress]);
  const translateY = progress.interpolate({ inputRange: [0, 1], outputRange: [8, 0] });
  return <Animated.View style={{ opacity: progress, transform: [{ translateY }] }}>{children}</Animated.View>;
}

export function DesktopControlScreen() {
  const { t } = useI18n();
  const [state, setState] = useState<MobileDesktopState | null>(null);
  const [continuity, setContinuity] = useState<OperationsContinuityState | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | undefined>(undefined);
  const [safety, setSafety] = useState<DeviceSafetyReceiptsRead | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  // Receipt refs seen at the previous read; `null` until the first read (which never animates).
  const seenReceipts = useRef<Set<string> | null>(null);

  const loadState = useCallback(async (isRefresh = false) => {
    try {
      if (isRefresh) setRefreshing(true);
      else setLoading(true);
      const [next, nextContinuity] = await Promise.all([
        fetchDesktopState(),
        fetchOperationsContinuity().catch(() => null),
      ]);
      setState(next);
      setContinuity(nextContinuity);
      setLoadFailed(false);
      if (!selectedDeviceId && next.devices[0]?.deviceId) {
        setSelectedDeviceId(next.devices[0].deviceId);
      }
    } catch {
      // Said on the page, not in a dialog: the 5 s poll would raise a new one every 5 seconds.
      setLoadFailed(true);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [selectedDeviceId]);

  useEffect(() => {
    void loadState();
    const timer = setInterval(() => {
      void loadState(true);
    }, 5000);
    return () => clearInterval(timer);
  }, [loadState]);

  // Emergency-stop receipts (device-safety contract v1) are reports the computer sends after the fact,
  // not live state: read them when the page opens and on pull-to-refresh, not on the 5 s poll. Read-only.
  const loadSafety = useCallback(async () => {
    try {
      setSafety(await readDeviceSafetyReceipts());
    } catch {
      setSafety({ kind: 'error', reason: 'unexpected', retryable: true });
    }
  }, []);

  useEffect(() => {
    void loadSafety();
  }, [loadSafety]);

  useEffect(() => {
    if (safety?.kind === 'ready') seenReceipts.current = new Set(safety.receipts.map((receipt) => receipt.receiptRef));
  }, [safety]);

  const devices = state?.devices || [];
  const commands = state?.commands || [];
  const approvals = (state?.approvals || []).map(normalizeMobileDesktopApproval).filter(Boolean);
  const sessions = state?.sessions || [];

  const selectedDevice = useMemo(
    () => devices.find((device) => device.deviceId === selectedDeviceId) || devices[0],
    [devices, selectedDeviceId],
  );

  // M0: the phone only queues read-only, body-free commands. Shell, file
  // read/write and URL open run on the computer behind its own approval.
  const submitCommand = useCallback(async (kind: MobileSubmittableDesktopCommandKind, title: string) => {
    try {
      setSubmitting(true);
      await createRemoteDesktopCommand({
        title,
        kind,
        targetDeviceId: selectedDevice?.deviceId,
        requesterDeviceId: 'mobile-app',
      });
      await loadState(true);
      Alert.alert(
        t({ en: 'Queued', zh: '已下发' }),
        t({ en: 'Desktop command was queued successfully.', zh: '桌面命令已成功下发。' }),
      );
    } catch (error: any) {
      Alert.alert(
        t({ en: 'Command Failed', zh: '命令失败' }),
        error?.message || t({ en: 'Could not queue desktop command.', zh: '无法下发桌面命令。' }),
      );
    } finally {
      setSubmitting(false);
    }
  }, [loadState, selectedDevice, t]);

  const handleApproval = useCallback(async (approval: MobileDesktopApproval, decision: 'approved' | 'rejected') => {
    const safeApprovalId = getMobileDesktopApprovalId(approval);
    if (!safeApprovalId) {
      Alert.alert(t({ en: 'Approval Failed', zh: '审批失败' }), t({ en: 'Missing approval id. Refresh desktop state and try again.', zh: '缺少审批ID，请刷新桌面状态后重试。' }));
      await loadState(true);
      return;
    }
    try {
      await respondToDesktopApproval(approval, decision);
      await loadState(true);
    } catch (error: any) {
      Alert.alert(
        t({ en: 'Approval Failed', zh: '审批失败' }),
        isMobileApprovalBlockedError(error)
          ? t({ en: 'This approval can only be confirmed on the computer.', zh: '这条审批只能在电脑上确认。' })
          : error?.message || t({ en: 'Could not respond to approval.', zh: '无法处理审批。' }),
      );
      await loadState(true);
    }
  }, [loadState, t]);

  const syncContinuityToWatch = useCallback(async () => {
    if (!continuity?.wearableSummary) {
      Alert.alert(t({ en: 'Continuity', zh: '连续任务' }), t({ en: 'No continuity summary is available yet.', zh: '暂时没有可同步的连续任务摘要。' }));
      return;
    }
    try {
      const payload = {
        kind: 'operations-continuity',
        summary: continuity.wearableSummary,
        sessions: continuity.sessions.slice(0, 3),
        syncedAt: Date.now(),
      };
      await WatchDataLayerService.putDataItem('/agentrix/session/state', payload);
      await WatchDataLayerService.broadcastMessage('/agentrix/session/state', payload);
      Alert.alert(t({ en: 'Synced', zh: '已同步' }), t({ en: 'Continuity summary was sent to Wear OS.', zh: '连续任务摘要已发送到 Wear OS。' }));
    } catch (error: any) {
      Alert.alert(t({ en: 'Watch Sync Failed', zh: '手表同步失败' }), error?.message || t({ en: 'Could not sync to watch.', zh: '无法同步到手表。' }));
    }
  }, [continuity, t]);

  const requestFollowUp = useCallback(async (sessionId: string, title?: string) => {
    try {
      await requestOperationsFollowUp({
        sessionId,
        title: title || 'Resume Agentrix session',
        targetDeviceId: selectedDevice?.deviceId,
        requesterDeviceId: 'mobile-app',
        action: 'resume-on-desktop',
      });
      await loadState(true);
      Alert.alert(t({ en: 'Queued', zh: '已下发' }), t({ en: 'Follow-up was queued for the desktop.', zh: '已为桌面端下发继续任务。' }));
    } catch (error: any) {
      Alert.alert(t({ en: 'Follow-up Failed', zh: '继续任务失败' }), error?.message || t({ en: 'Could not queue follow-up.', zh: '无法下发继续任务。' }));
    }
  }, [loadState, selectedDevice?.deviceId, t]);

  const latestCommands = commands.slice(0, 8) as MobileDesktopCommand[];
  const safetyGroups = safety?.kind === 'ready' ? groupDeviceSafetyReceipts(safety, devices.map((device) => device.deviceId)) : [];

  if (loading && !state) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={colors.accent} />
        <Text style={styles.loadingText}>{t({ en: 'Loading desktop state…', zh: '正在加载桌面状态…' })}</Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => {
            void loadState(true);
            void loadSafety();
          }}
        />
      }
    >
      <View style={styles.heroCard}>
        <Text style={styles.heroTitle}>{t({ en: 'Desktop Control', zh: '桌面控制' })}</Text>
        <Text style={styles.heroSub}>
          {selectedDevice
            ? t({ en: `Connected to ${selectedDevice.deviceId}`, zh: `已连接设备 ${selectedDevice.deviceId}` })
            : t({ en: 'Scan the desktop QR code first to pair a device.', zh: '请先扫描桌面二维码以配对设备。' })}
        </Text>
        {loadFailed ? (
          <Text style={styles.loadError} testID="desktop-control-load-error">
            {t({ en: 'Could not load your computers. Pull down to try again.', zh: '电脑状态加载失败，下拉重试。' })}
          </Text>
        ) : null}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{t({ en: 'Paired Devices', zh: '已配对设备' })}</Text>
        {devices.length === 0 ? (
          <Text style={styles.emptyText}>{t({ en: 'No desktop devices online.', zh: '当前没有在线桌面设备。' })}</Text>
        ) : (
          devices.map((device) => (
            <TouchableOpacity
              key={device.deviceId}
              style={[styles.deviceCard, selectedDevice?.deviceId === device.deviceId && styles.deviceCardActive]}
              onPress={() => setSelectedDeviceId(device.deviceId)}
              activeOpacity={0.85}
            >
              <Text style={styles.deviceTitle}>{device.deviceId}</Text>
              <Text style={styles.deviceMeta}>{device.platform} · {new Date(device.lastSeenAt).toLocaleString()}</Text>
              {!!device.context?.workspaceHint && (
                <Text style={styles.deviceContext}>{device.context.workspaceHint}</Text>
              )}
              {!!device.context?.activeWindowTitle && (
                <Text style={styles.deviceContext}>{device.context.activeWindowTitle}</Text>
              )}
            </TouchableOpacity>
          ))
        )}
      </View>

      <View style={styles.section} testID="device-safety-receipts">
        <Text style={styles.sectionTitle}>{t({ en: 'Emergency-stop receipts', zh: '急停回执' })}</Text>
        {!safety ? (
          <ActivityIndicator color={colors.accent} />
        ) : safety.kind !== 'ready' ? (
          <Text style={styles.emptyText} testID="device-safety-receipts-unavailable">{t(describeDeviceSafetyReceiptsProblem(safety))}</Text>
        ) : (
          <>
            {safetyGroups.length === 0 ? (
              <Text style={styles.emptyText}>{t({ en: 'No emergency-stop receipts yet.', zh: '还没有急停回执。' })}</Text>
            ) : null}
            {safetyGroups.map((group) => (
              <View key={group.deviceId ?? 'unknown-computer'} style={styles.card} testID="device-safety-computer">
                <Text style={styles.cardTitle}>
                  {group.deviceId === null
                    ? t({ en: 'Computer unknown', zh: '读不到是哪台电脑' })
                    : group.listed
                      ? group.deviceId
                      : t({ en: `${group.deviceId} (not in the list above)`, zh: `${group.deviceId}（不在上面的列表里）` })}
                </Text>
                {group.receipts.length === 0 && group.unreadable === 0 ? (
                  <Text style={styles.cardMeta}>{t({ en: 'No emergency-stop receipt from this computer yet.', zh: '这台电脑还没有急停回执。' })}</Text>
                ) : null}
                {group.receipts.map((receipt) => {
                  const line = describeDeviceSafetyReceipt(receipt);
                  const fresh = seenReceipts.current !== null && !seenReceipts.current.has(line.receiptRef);
                  return (
                    <FreshReceipt key={line.receiptRef} fresh={fresh}>
                    <View style={styles.receiptRow} testID="device-safety-receipt">
                      <Text style={styles.receiptTitle}>{t(line.title)}</Text>
                      <Text style={styles.cardMeta}>{new Date(line.at).toLocaleString()} · {t(line.origin)}</Text>
                      {line.budget ? (
                        <Text style={line.budgetTone === 'ok' ? styles.budgetOk : styles.budgetWarn} testID={`device-safety-budget-${line.budgetTone}`}>
                          {t(line.budget)}
                        </Text>
                      ) : null}
                      <Text style={styles.cardMeta}>{line.gates.map((gate) => t(gate)).join(' · ')}</Text>
                      {line.approvalsRejected ? <Text style={styles.cardMeta}>{t(line.approvalsRejected)}</Text> : null}
                      {line.reason ? <Text style={styles.cardMeta}>{t({ en: `Note: ${line.reason}`, zh: `说明：${line.reason}` })}</Text> : null}
                    </View>
                    </FreshReceipt>
                  );
                })}
                {group.more > 0 ? (
                  <Text style={styles.cardMeta}>{t({ en: `${group.more} older receipts are not listed.`, zh: `还有 ${group.more} 条更早的回执没有列出。` })}</Text>
                ) : null}
                {group.unreadable > 0 ? (
                  <Text style={styles.cardMeta} testID="device-safety-unreadable">
                    {t({ en: `${group.unreadable} receipt(s) could not be read and are not shown.`, zh: `另有 ${group.unreadable} 条回执读不到，没有显示。` })}
                  </Text>
                ) : null}
              </View>
            ))}
            <Text style={styles.emptyText}>
              {t({
                en: 'Each computer reports its stops after they happen, so the newest receipt may not be how it is right now.',
                zh: '回执是电脑事后上报的，最近一条不一定是它现在的状态。',
              })}
            </Text>
          </>
        )}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{t({ en: 'Quick Actions', zh: '快捷操作' })}</Text>
        <View style={styles.rowWrap}>
          <TouchableOpacity style={styles.actionChip} disabled={submitting || !selectedDevice} onPress={() => void submitCommand('context', 'Fetch Desktop Context')}>
            <Text style={styles.actionChipText}>{t({ en: 'Fetch Context', zh: '获取上下文' })}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionChip} disabled={submitting || !selectedDevice} onPress={() => void submitCommand('active-window', 'Get Active Window')}>
            <Text style={styles.actionChipText}>{t({ en: 'Active Window', zh: '当前窗口' })}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionChip} disabled={submitting || !selectedDevice} onPress={() => void submitCommand('list-windows', 'List Open Windows')}>
            <Text style={styles.actionChipText}>{t({ en: 'List Windows', zh: '窗口列表' })}</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.section} testID="mobile-operations-continuity">
        <Text style={styles.sectionTitle}>{t({ en: 'Agent Continuity', zh: '连续任务' })}</Text>
        <View style={styles.continuityGrid}>
          <View style={styles.statPill}>
            <Text style={styles.statValue}>{continuity?.wearableSummary.runningTaskCount ?? 0}</Text>
            <Text style={styles.statLabel}>{t({ en: 'Running', zh: '运行中' })}</Text>
          </View>
          <View style={styles.statPill}>
            <Text style={styles.statValue}>{continuity?.wearableSummary.pendingApprovalCount ?? approvals.filter((item) => item.status === 'pending').length}</Text>
            <Text style={styles.statLabel}>{t({ en: 'Approvals', zh: '审批' })}</Text>
          </View>
          <View style={styles.statPill}>
            <Text style={styles.statValue}>{continuity?.wearableSummary.onlineDeviceCount ?? devices.length}</Text>
            <Text style={styles.statLabel}>{t({ en: 'Online', zh: '在线' })}</Text>
          </View>
        </View>
        <TouchableOpacity style={styles.primaryButton} onPress={() => void syncContinuityToWatch()} testID="sync-continuity-watch-button">
          <Text style={styles.primaryButtonText}>{t({ en: 'Sync To Watch', zh: '同步到手表' })}</Text>
        </TouchableOpacity>
        {continuity?.sessions.slice(0, 3).map((session) => (
          <View key={session.sessionId} style={styles.card} testID="continuity-session-card">
            <Text style={styles.cardTitle}>{session.title}</Text>
            <Text style={styles.cardMeta}>{session.messageCount} messages · {session.deviceType} · {session.activeTaskCount} active</Text>
            <TouchableOpacity style={styles.secondaryButton} onPress={() => void requestFollowUp(session.sessionId, session.title)}>
              <Text style={styles.secondaryButtonText}>{t({ en: 'Continue On Desktop', zh: '在桌面继续' })}</Text>
            </TouchableOpacity>
          </View>
        ))}
      </View>

      <View style={styles.section} testID="desktop-control-local-only-notice">
        <Text style={styles.sectionTitle}>{t({ en: 'Commands and files', zh: '命令与文件' })}</Text>
        <Text style={styles.emptyText}>
          {t({
            en: 'Running commands, opening links and reading or writing files happen on the computer itself, after you approve them there. The phone can only view status and answer approvals the computer sends.',
            zh: '执行命令、打开网页、读写文件只在电脑上进行，并在电脑上确认。手机只能查看状态，并处理电脑发来的审批。',
          })}
        </Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{t({ en: 'Pending Approvals', zh: '待处理审批' })}</Text>
        {approvals.filter((item) => ['pending', 'expired'].includes(mobileApprovalStatus(item))).length === 0 ? (
          <Text style={styles.emptyText}>{t({ en: 'No pending approvals.', zh: '暂无待处理审批。' })}</Text>
        ) : (
          approvals.filter((item) => ['pending', 'expired'].includes(mobileApprovalStatus(item))).map((approval, index) => {
            const approvalId = getMobileDesktopApprovalId(approval);
            if (!approvalId) return null;
            // Approval-card contract v1 (mobileApprovalPolicy): reject any level, also after expiry; approve L0 / L1 only.
            const caps = mobileApprovalCapabilities(approval);
            return (
            <View key={approvalId || `${approval.taskId}-${index}`} style={styles.card}>
              <Text style={styles.cardTitle}>{approval.title}</Text>
              <Text style={styles.cardBody}>{approval.description}</Text>
              <Text style={styles.cardMeta}>Risk {approval.riskLevel}</Text>
              {!caps.canApprove && mobileApprovalStatus(approval) === 'expired' ? (
                <Text style={styles.cardMeta} testID="approval-expired-hint">
                  {t({ en: 'Expired: it can no longer be approved, but you can reject it.', zh: '已过期，不能再批准；这里仍可以拒绝。' })}
                </Text>
              ) : !caps.canApprove && caps.approveBlockedReason === 'requires_local_confirmation' ? (
                <Text style={styles.cardMeta} testID="approval-local-only-hint">
                  {t({ en: 'Higher risk: approve it on the computer that asked. You can reject it here.', zh: '较高风险：请在发起它的电脑上批准；这里可以拒绝。' })}
                </Text>
              ) : null}
              <View style={styles.rowWrap}>
                {caps.canReject ? (
                  <TouchableOpacity style={styles.secondaryButton} onPress={() => void handleApproval(approval, 'rejected')}>
                    <Text style={styles.secondaryButtonText}>{t({ en: 'Reject', zh: '拒绝' })}</Text>
                  </TouchableOpacity>
                ) : null}
                {caps.canApprove ? (
                  <TouchableOpacity style={styles.primaryButtonSmall} onPress={() => void handleApproval(approval, 'approved')}>
                    <Text style={styles.primaryButtonText}>{t({ en: 'Approve', zh: '批准' })}</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            </View>
          );})
        )}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{t({ en: 'Recent Commands', zh: '最近命令' })}</Text>
        {latestCommands.length === 0 ? (
          <Text style={styles.emptyText}>{t({ en: 'No commands yet.', zh: '暂无命令记录。' })}</Text>
        ) : (
          latestCommands.map((command) => (
            <View key={command.commandId} style={styles.card}>
              <Text style={styles.cardTitle}>{command.title}</Text>
              <Text style={styles.cardMeta}>{command.kind} · {command.status}</Text>
              <Text style={styles.resultText}>{prettyJson(command.result || command.error)}</Text>
            </View>
          ))
        )}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{t({ en: 'Synced Sessions', zh: '同步会话' })}</Text>
        {sessions.length === 0 ? (
          <Text style={styles.emptyText}>{t({ en: 'No synced sessions yet.', zh: '暂无同步会话。' })}</Text>
        ) : (
          sessions.slice(0, 6).map((session) => (
            <View key={session.sessionId} style={styles.card}>
              <Text style={styles.cardTitle}>{session.title}</Text>
              <Text style={styles.cardMeta}>{session.messageCount} messages · {session.deviceType}</Text>
            </View>
          ))
        )}
      </View>
    </ScrollView>
  );
}

const styles = themedStyles(() => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bgPrimary,
  },
  content: {
    padding: 16,
    gap: 16,
    paddingBottom: 36,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bgPrimary,
    gap: 12,
  },
  loadingText: {
    color: colors.textSecondary,
    fontSize: 14,
  },
  heroCard: {
    backgroundColor: colors.bgSecondary,
    borderRadius: 18,
    padding: 18,
    borderWidth: 1,
    borderColor: colors.border,
  },
  heroTitle: {
    color: colors.textPrimary,
    fontSize: 24,
    fontWeight: '800',
    marginBottom: 8,
  },
  loadError: {
    color: colors.textSecondary,
    fontSize: 13,
    marginTop: 8,
  },
  heroSub: {
    color: colors.textSecondary,
    fontSize: 14,
    lineHeight: 20,
  },
  section: {
    gap: 10,
  },
  sectionTitle: {
    color: colors.textPrimary,
    fontSize: 18,
    fontWeight: '700',
  },
  emptyText: {
    color: colors.textMuted,
    fontSize: 14,
  },
  deviceCard: {
    backgroundColor: colors.bgSecondary,
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 4,
  },
  deviceCardActive: {
    borderColor: colors.accent,
  },
  deviceTitle: {
    color: colors.textPrimary,
    fontSize: 14,
    fontWeight: '700',
  },
  deviceMeta: {
    color: colors.textMuted,
    fontSize: 12,
  },
  deviceContext: {
    color: colors.textSecondary,
    fontSize: 13,
  },
  rowWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  continuityGrid: {
    flexDirection: 'row',
    gap: 10,
  },
  statPill: {
    flex: 1,
    backgroundColor: colors.bgSecondary,
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  statValue: {
    color: colors.textPrimary,
    fontSize: 22,
    fontWeight: '800',
  },
  statLabel: {
    color: colors.textMuted,
    fontSize: 12,
    marginTop: 3,
  },
  actionChip: {
    backgroundColor: colors.bgSecondary,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  actionChipText: {
    color: colors.textPrimary,
    fontSize: 13,
    fontWeight: '600',
  },
  primaryButton: {
    backgroundColor: colors.accent,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
  },
  primaryButtonSmall: {
    backgroundColor: colors.accent,
    borderRadius: 12,
    paddingHorizontal: 18,
    paddingVertical: 12,
    alignItems: 'center',
  },
  primaryButtonText: {
    color: colors.onAccent,
    fontSize: 14,
    fontWeight: '700',
  },
  secondaryButton: {
    backgroundColor: colors.bgSecondary,
    borderRadius: 12,
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  secondaryButtonText: {
    color: colors.textPrimary,
    fontSize: 13,
    fontWeight: '600',
  },
  card: {
    backgroundColor: colors.bgSecondary,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
    gap: 6,
  },
  cardTitle: {
    color: colors.textPrimary,
    fontSize: 14,
    fontWeight: '700',
  },
  cardBody: {
    color: colors.textSecondary,
    fontSize: 13,
    lineHeight: 19,
  },
  cardMeta: {
    color: colors.textMuted,
    fontSize: 12,
  },
  receiptRow: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: 8,
    gap: 2,
  },
  receiptTitle: {
    color: colors.textPrimary,
    fontSize: 15,
    fontWeight: '800',
  },
  budgetOk: {
    alignSelf: 'flex-start',
    backgroundColor: colors.success,
    color: colors.onSuccess,
    fontSize: 13,
    fontWeight: '800',
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 999,
    overflow: 'hidden',
    marginVertical: 2,
  },
  budgetWarn: {
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: colors.warning,
    color: colors.textPrimary,
    fontSize: 13,
    fontWeight: '700',
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 999,
    overflow: 'hidden',
    marginVertical: 2,
  },
  resultText: {
    color: colors.textSecondary,
    fontSize: 12,
    lineHeight: 18,
  },
}));