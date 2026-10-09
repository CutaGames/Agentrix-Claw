/**
 * RemoteControlPanel — 嵌在 PetDetailSheet CrossDeviceCard 内的快捷控制面板。
 *
 * P-9 wave 10 T18.3:
 *   - 列出已配对设备(Phase 1 来自 authStore.user.openClawInstances 当桌面源)
 *   - 选定设备 + 停止类命令 → mintToken + socket emit execute
 *   - 5s ack timeout → 浮球 nudge mode + "对方设备未响应" capsule
 *   - 在 Form_Variant=night 时 executeMode='notify-only',backend 解释为通知
 *     而不是立即执行
 *
 * M0(2026-09-27):启动 Computer Use、切换 Pro 模式、进入工作模式、播报等
 * 放宽类命令从手机移除,只保留停止(收紧类)。白名单见
 * services/mobileRemoteExecutionPolicy.ts。
 *
 * Spec: requirements.md R8.5-R8.12, design.md §Components/Core 4.
 */
import React, { useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { colors } from '../../theme/colors';
import { useAuthStore } from '../../stores/authStore';
import { companionEvents } from '../../services/companionEvents.service';
import { sendRemoteControl } from '../../services/crossDeviceToken.service';
import { setCompanionMode, getCompanionMode } from '../../services/petMode';
import { addVoiceDiagnostic } from '../../services/voiceDiagnostics';
import type { MobileRemoteControlCommand } from '../../services/mobileRemoteExecutionPolicy';
import { themedStyles } from '../../theme/useTheme';

interface DeviceEntry {
  id: string;
  name: string;
  emoji: string;
  online: boolean;
  // Subset of mobile-allowed commands this device handles.
  commands: MobileRemoteControlCommand[];
}

// M0: the phone only sends stop commands (tightening, like an emergency
// stop). Start / toggle / broadcast are loosening actions and only run on the
// device itself. `sendRemoteControl` enforces the same allowlist.
const DESKTOP_COMMANDS: MobileRemoteControlCommand[] = [
  'desktop.computer-use.stop',
];

const COMMAND_LABEL: Record<MobileRemoteControlCommand, string> = {
  'desktop.computer-use.stop': '停止 Computer Use',
  'speaker.stop': '停止音频',
  'device.status.query': '查询状态',
};

interface RemoteControlPanelProps {
  /** Origin device id used for socket auth.deviceId. */
  originDeviceId: string;
  /** When companion form-variant is night, send notify-only mode. */
  isNight?: boolean;
}

export function RemoteControlPanel({ originDeviceId, isNight }: RemoteControlPanelProps) {
  const instances = useAuthStore((s) => s.user?.openClawInstances ?? []);
  const [busy, setBusy] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<{ ok: boolean; message: string } | null>(null);

  const devices = useMemo<DeviceEntry[]>(() => {
    const list: DeviceEntry[] = [];
    for (const inst of instances) {
      if (inst.deployType === 'local' || inst.deployType === 'cloud' || inst.deployType === 'server') {
        list.push({
          id: inst.id,
          name: `${inst.name} (桌面)`,
          emoji: '🖥',
          online: inst.status === 'active',
          commands: DESKTOP_COMMANDS,
        });
      }
    }
    // Phase 1 placeholder for speaker / watch — Phase 2 wires real device list.
    return list;
  }, [instances]);

  const triggerCommand = async (device: DeviceEntry, command: MobileRemoteControlCommand) => {
    if (busy) return;
    const key = `${device.id}:${command}`;
    setBusy(key);
    setLastResult(null);
    addVoiceDiagnostic('remote-control-panel', 'invoke', { device: device.id, command });

    // Stop is a tightening action: it goes out immediately without a
    // signing round-trip (product doc 8.3). The backend keeps stop commands
    // available even while the remote-mutation kill switch is off.
    const result = await sendRemoteControl({
      originDeviceId,
      targetDeviceId: device.id,
      command,
      executeMode: isNight ? 'notify-only' : 'execute',
    });
    setBusy(null);
    if (result.ok) {
      setLastResult({ ok: true, message: '已发送到目标设备' });
      companionEvents.emit({
        type: 'capsule-show',
        capsuleType: 'wallet', // re-use wallet capsule style for status
        payload: { delta: 0, currency: 'OK' },
        ttlMs: 2500,
      });
    } else {
      const reason = result.reason ?? 'failed';
      setLastResult({
        ok: false,
        message:
          reason === 'ack-timeout'
            ? '对方设备未响应'
            : reason === 'blocked-on-mobile'
              ? '这个操作只能在电脑上进行'
              : `失败 (${reason})`,
      });
      const cur = getCompanionMode();
      if (cur !== 'signing') {
        setCompanionMode('nudge', `remote-control:${reason}`, { ttlMs: 4000 });
      }
    }
  };

  if (devices.length === 0) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyText}>还没有配对设备 — 在 Me · 设备 里添加</Text>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      {devices.map((device) => (
        <View key={device.id} style={styles.deviceBlock}>
          <View style={styles.deviceHeader}>
            <Text style={styles.deviceEmoji}>{device.emoji}</Text>
            <Text style={styles.deviceName}>{device.name}</Text>
            <View
              style={[
                styles.devicePill,
                device.online ? styles.devicePillOnline : styles.devicePillOffline,
              ]}
            >
              <Text
                style={[
                  styles.devicePillText,
                  device.online ? styles.devicePillTextOnline : null,
                ]}
              >
                {device.online ? '已配对' : '未配对'}
              </Text>
            </View>
          </View>
          <Text style={styles.deviceHint}>
            手机上只能停止电脑上正在进行的操作;启动和切换模式请在电脑上完成。
          </Text>
          <View style={styles.commandsRow}>
            {device.commands.map((cmd) => {
              const isBusy = busy === `${device.id}:${cmd}`;
              return (
                <TouchableOpacity
                  key={cmd}
                  style={[styles.cmdBtn, isBusy ? styles.cmdBtnBusy : null]}
                  onPress={() => triggerCommand(device, cmd)}
                  disabled={!device.online || !!busy}
                  accessibilityLabel={COMMAND_LABEL[cmd]}
                >
                  {isBusy ? (
                    <ActivityIndicator color={colors.accent} size="small" />
                  ) : (
                    <Text style={styles.cmdBtnText}>{COMMAND_LABEL[cmd]}</Text>
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      ))}
      {lastResult ? (
        <Text style={[styles.resultText, lastResult.ok ? styles.resultOk : styles.resultFail]}>
          {lastResult.ok ? '✅ ' : '⚠️ '}
          {lastResult.message}
        </Text>
      ) : null}
      {isNight ? (
        <Text style={styles.nightHint}>夜间模式:命令以"通知"形式发送,目标设备早晨再确认。</Text>
      ) : null}
    </View>
  );
}

const styles = themedStyles(() => StyleSheet.create({
  root: { paddingTop: 4 },
  empty: { paddingVertical: 14, alignItems: 'center' },
  emptyText: { color: colors.textMuted, fontSize: 12 },
  deviceBlock: { paddingVertical: 8 },
  deviceHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  deviceHint: { color: colors.textMuted, fontSize: 10, marginTop: 4, marginBottom: 2 },
  deviceEmoji: { fontSize: 18 },
  deviceName: { color: colors.textPrimary, fontSize: 13, fontWeight: '600', flex: 1 },
  devicePill: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
    borderWidth: 1,
  },
  devicePillOnline: { backgroundColor: colors.success + '22', borderColor: colors.success },
  devicePillOffline: { backgroundColor: colors.bgPrimary, borderColor: colors.border },
  devicePillText: { fontSize: 10, color: colors.textMuted },
  devicePillTextOnline: { color: colors.success },
  commandsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 },
  cmdBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: colors.bgPrimary,
    borderRadius: 8,
    borderColor: colors.border,
    borderWidth: 1,
  },
  cmdBtnBusy: { backgroundColor: colors.accent + '22' },
  cmdBtnText: { color: colors.textPrimary, fontSize: 12 },
  resultText: { fontSize: 12, marginTop: 8 },
  resultOk: { color: colors.success },
  resultFail: { color: colors.warning },
  nightHint: { color: colors.textMuted, fontSize: 11, marginTop: 6, fontStyle: 'italic' },
}));
