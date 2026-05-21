import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
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
  type DesktopCommandKind,
  type MobileDesktopCommand,
  type MobileDesktopState,
} from '../../services/desktopSync';
import { fetchOperationsContinuity, requestOperationsFollowUp, type OperationsContinuityState } from '../../services/operations';
import { WatchDataLayerService } from '../../services/wearables/watchDataLayerBridge.service';

const prettyJson = (value: unknown) => {
  if (value == null) return 'No result';
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
};

export function DesktopControlScreen() {
  const { t } = useI18n();
  const [state, setState] = useState<MobileDesktopState | null>(null);
  const [continuity, setContinuity] = useState<OperationsContinuityState | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | undefined>(undefined);
  const [shellCommand, setShellCommand] = useState('');
  const [browserUrl, setBrowserUrl] = useState('https://agentrix.top');
  const [filePath, setFilePath] = useState('');
  const [fileContent, setFileContent] = useState('');

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
      if (!selectedDeviceId && next.devices[0]?.deviceId) {
        setSelectedDeviceId(next.devices[0].deviceId);
      }
    } catch (error: any) {
      Alert.alert(
        t({ en: 'Desktop Sync', zh: '桌面同步' }),
        error?.message || t({ en: 'Failed to load desktop state.', zh: '加载桌面状态失败。' }),
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [selectedDeviceId, t]);

  useEffect(() => {
    void loadState();
    const timer = setInterval(() => {
      void loadState(true);
    }, 5000);
    return () => clearInterval(timer);
  }, [loadState]);

  const devices = state?.devices || [];
  const commands = state?.commands || [];
  const approvals = (state?.approvals || []).map(normalizeMobileDesktopApproval).filter(Boolean);
  const sessions = state?.sessions || [];

  const selectedDevice = useMemo(
    () => devices.find((device) => device.deviceId === selectedDeviceId) || devices[0],
    [devices, selectedDeviceId],
  );

  const submitCommand = useCallback(async (kind: DesktopCommandKind, title: string, payload?: Record<string, unknown>) => {
    try {
      setSubmitting(true);
      await createRemoteDesktopCommand({
        title,
        kind,
        targetDeviceId: selectedDevice?.deviceId,
        requesterDeviceId: 'mobile-app',
        payload,
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

  const handleApproval = useCallback(async (approvalId: string, decision: 'approved' | 'rejected') => {
    const safeApprovalId = String(approvalId || '').trim();
    if (!safeApprovalId) {
      Alert.alert(t({ en: 'Approval Failed', zh: '审批失败' }), t({ en: 'Missing approval id. Refresh desktop state and try again.', zh: '缺少审批ID，请刷新桌面状态后重试。' }));
      await loadState(true);
      return;
    }
    try {
      await respondToDesktopApproval(safeApprovalId, { decision });
      await loadState(true);
    } catch (error: any) {
      Alert.alert(
        t({ en: 'Approval Failed', zh: '审批失败' }),
        error?.message || t({ en: 'Could not respond to approval.', zh: '无法处理审批。' }),
      );
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
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void loadState(true)} />}
    >
      <View style={styles.heroCard}>
        <Text style={styles.heroTitle}>{t({ en: 'Desktop Control', zh: '桌面控制' })}</Text>
        <Text style={styles.heroSub}>
          {selectedDevice
            ? t({ en: `Connected to ${selectedDevice.deviceId}`, zh: `已连接设备 ${selectedDevice.deviceId}` })
            : t({ en: 'Scan the desktop QR code first to pair a device.', zh: '请先扫描桌面二维码以配对设备。' })}
        </Text>
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

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{t({ en: 'Run Shell Command', zh: '执行命令' })}</Text>
        <TextInput
          value={shellCommand}
          onChangeText={setShellCommand}
          placeholder={t({ en: 'npm test', zh: '例如 npm test' })}
          placeholderTextColor={colors.textMuted}
          style={styles.input}
        />
        <TouchableOpacity
          style={styles.primaryButton}
          disabled={submitting || !selectedDevice || !shellCommand.trim()}
          onPress={() => void submitCommand('run-command', shellCommand.trim(), { command: shellCommand.trim(), timeoutMs: 60000 })}
        >
          <Text style={styles.primaryButtonText}>{t({ en: 'Queue Command', zh: '下发命令' })}</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{t({ en: 'Browser', zh: '浏览器' })}</Text>
        <TextInput value={browserUrl} onChangeText={setBrowserUrl} placeholder="https://..." placeholderTextColor={colors.textMuted} style={styles.input} />
        <TouchableOpacity
          style={styles.primaryButton}
          disabled={submitting || !selectedDevice || !browserUrl.trim()}
          onPress={() => void submitCommand('open-browser', `Open ${browserUrl.trim()}`, { url: browserUrl.trim() })}
        >
          <Text style={styles.primaryButtonText}>{t({ en: 'Open On Desktop', zh: '在桌面打开' })}</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{t({ en: 'Files', zh: '文件' })}</Text>
        <TextInput value={filePath} onChangeText={setFilePath} placeholder={t({ en: 'C:\\path\\to\\file.txt', zh: '输入文件路径' })} placeholderTextColor={colors.textMuted} style={styles.input} />
        <TextInput
          value={fileContent}
          onChangeText={setFileContent}
          placeholder={t({ en: 'Optional file content for write-file', zh: '写文件时填写内容' })}
          placeholderTextColor={colors.textMuted}
          style={[styles.input, styles.multilineInput]}
          multiline
        />
        <View style={styles.rowWrap}>
          <TouchableOpacity
            style={styles.secondaryButton}
            disabled={submitting || !selectedDevice || !filePath.trim()}
            onPress={() => void submitCommand('read-file', `Read ${filePath.trim()}`, { path: filePath.trim() })}
          >
            <Text style={styles.secondaryButtonText}>{t({ en: 'Read File', zh: '读取文件' })}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.secondaryButton}
            disabled={submitting || !selectedDevice || !filePath.trim()}
            onPress={() => void submitCommand('write-file', `Write ${filePath.trim()}`, { path: filePath.trim(), content: fileContent })}
          >
            <Text style={styles.secondaryButtonText}>{t({ en: 'Write File', zh: '写入文件' })}</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{t({ en: 'Pending Approvals', zh: '待处理审批' })}</Text>
        {approvals.filter((item) => item.status === 'pending').length === 0 ? (
          <Text style={styles.emptyText}>{t({ en: 'No pending approvals.', zh: '暂无待处理审批。' })}</Text>
        ) : (
          approvals.filter((item) => item.status === 'pending').map((approval, index) => {
            const approvalId = getMobileDesktopApprovalId(approval);
            if (!approvalId) return null;
            return (
            <View key={approvalId || `${approval.taskId}-${index}`} style={styles.card}>
              <Text style={styles.cardTitle}>{approval.title}</Text>
              <Text style={styles.cardBody}>{approval.description}</Text>
              <Text style={styles.cardMeta}>Risk {approval.riskLevel}</Text>
              <View style={styles.rowWrap}>
                <TouchableOpacity style={styles.secondaryButton} onPress={() => void handleApproval(approvalId, 'rejected')}>
                  <Text style={styles.secondaryButtonText}>{t({ en: 'Reject', zh: '拒绝' })}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.primaryButtonSmall} onPress={() => void handleApproval(approvalId, 'approved')}>
                  <Text style={styles.primaryButtonText}>{t({ en: 'Approve', zh: '批准' })}</Text>
                </TouchableOpacity>
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

const styles = StyleSheet.create({
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
  input: {
    backgroundColor: colors.bgSecondary,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    color: colors.textPrimary,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
  },
  multilineInput: {
    minHeight: 96,
    textAlignVertical: 'top',
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
    color: '#fff',
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
  resultText: {
    color: colors.textSecondary,
    fontSize: 12,
    lineHeight: 18,
  },
});