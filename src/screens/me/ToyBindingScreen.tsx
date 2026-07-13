/**
 * ToyBindingScreen — Sprint 4 Task 4.5 / 4.7 / 4.8
 *
 * ClawCore Toy device pairing and management screen.
 *
 * Sections:
 * 1. Device Discovery — BLE scan for nearby Agentrix/ClawCore devices
 * 2. Pairing Flow — 6-digit code input + backend verification
 * 3. Device Management — list paired devices with battery/firmware/unpair
 *
 * Navigation: Me Tab → Devices → "Pair New Device" button
 */
import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  TextInput,
  ActivityIndicator,
  Alert,
  FlatList,
} from 'react-native';
import { colors } from '../../theme/colors';
import { useI18n } from '../../stores/i18nStore';
import {
  checkBleStatus,
  startBleScan,
  stopBleScan,
  pairDevice,
  getPairedDevices,
  unpairDevice,
  checkDeviceOta,
  DiscoveredDevice,
  PairedDevice,
  BleStatus,
} from '../../services/ble.service';
import { themedStyles } from '../../theme/useTheme';

type ScreenMode = 'list' | 'scanning' | 'pairing' | 'paired';

export function ToyBindingScreen() {
  const { t } = useI18n();

  const [mode, setMode] = useState<ScreenMode>('list');
  const [bleStatus, setBleStatus] = useState<BleStatus>('unknown');
  const [discoveredDevices, setDiscoveredDevices] = useState<DiscoveredDevice[]>([]);
  const [pairedDevices, setPairedDevices] = useState<PairedDevice[]>([]);
  const [selectedDevice, setSelectedDevice] = useState<DiscoveredDevice | null>(null);
  const [pairingCode, setPairingCode] = useState('');
  const [isPairing, setIsPairing] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  // Load paired devices on mount
  useEffect(() => {
    loadPairedDevices();
    checkBle();
  }, []);

  const checkBle = async () => {
    const status = await checkBleStatus();
    setBleStatus(status);
  };

  const loadPairedDevices = async () => {
    setIsLoading(true);
    try {
      const devices = await getPairedDevices();
      setPairedDevices(devices);
    } catch {
      // Silently fail — show empty list
    } finally {
      setIsLoading(false);
    }
  };

  // ── Scanning ─────────────────────────────────────────────────────────────

  const handleStartScan = useCallback(async () => {
    setError('');
    setDiscoveredDevices([]);
    setMode('scanning');

    try {
      await startBleScan((device) => {
        setDiscoveredDevices((prev) => {
          if (prev.find((d) => d.id === device.id)) return prev;
          return [...prev, device];
        });
      });
    } catch (err: any) {
      setError(err?.message || t({ en: 'Failed to start scan.', zh: '扫描启动失败。' }));
      setMode('list');
    }
  }, [t]);

  const handleStopScan = () => {
    stopBleScan();
    if (discoveredDevices.length === 0) {
      setMode('list');
    }
  };

  // ── Pairing ──────────────────────────────────────────────────────────────

  const handleSelectDevice = (device: DiscoveredDevice) => {
    stopBleScan();
    setSelectedDevice(device);
    setPairingCode('');
    setMode('pairing');
  };

  const handlePairingCodeChange = (text: string) => {
    // Only allow digits, max 6
    const cleaned = text.replace(/\D/g, '').slice(0, 6);
    setPairingCode(cleaned);

    // Auto-submit when 6 digits entered
    if (cleaned.length === 6 && selectedDevice) {
      submitPairingCode(selectedDevice.id, cleaned);
    }
  };

  const submitPairingCode = async (deviceId: string, code: string) => {
    setIsPairing(true);
    setError('');

    try {
      const response = await pairDevice(deviceId, code);
      if (response.success && response.device) {
        setPairedDevices((prev) => [...prev, response.device!]);
        setMode('paired');
      } else {
        setError(response.error || t({ en: 'Pairing failed. Check the code and try again.', zh: '配对失败，请检查配对码后重试。' }));
      }
    } catch (err: any) {
      setError(err?.message || t({ en: 'Pairing failed.', zh: '配对失败。' }));
    } finally {
      setIsPairing(false);
    }
  };

  // ── Device Management ────────────────────────────────────────────────────

  const handleUnpair = (device: PairedDevice) => {
    Alert.alert(
      t({ en: 'Unpair Device', zh: '解除配对' }),
      t({ en: `Unpair "${device.name}"?`, zh: `确定解除 "${device.name}" 的配对？` }),
      [
        { text: t({ en: 'Cancel', zh: '取消' }), style: 'cancel' },
        {
          text: t({ en: 'Unpair', zh: '解除' }),
          style: 'destructive',
          onPress: async () => {
            try {
              await unpairDevice(device.id);
              setPairedDevices((prev) => prev.filter((d) => d.id !== device.id));
            } catch {
              Alert.alert(t({ en: 'Error', zh: '错误' }), t({ en: 'Failed to unpair device.', zh: '解除配对失败。' }));
            }
          },
        },
      ],
    );
  };

  const handleCheckOta = async (device: PairedDevice) => {
    try {
      const ota = await checkDeviceOta(device.id);
      if (ota.available) {
        Alert.alert(
          t({ en: 'Update Available', zh: '有可用更新' }),
          t({ en: `Version ${ota.version}: ${ota.releaseNotes || ''}`, zh: `版本 ${ota.version}：${ota.releaseNotes || ''}` }),
        );
      } else {
        Alert.alert(
          t({ en: 'Up to Date', zh: '已是最新' }),
          t({ en: 'Your device firmware is up to date.', zh: '设备固件已是最新版本。' }),
        );
      }
    } catch {
      Alert.alert(t({ en: 'Error', zh: '错误' }), t({ en: 'Failed to check for updates.', zh: '检查更新失败。' }));
    }
  };

  // ── Render ───────────────────────────────────────────────────────────────

  if (bleStatus === 'unsupported') {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.bigIcon}>🚫</Text>
        <Text style={styles.errorText}>
          {t({ en: 'Bluetooth is not supported on this device.', zh: '此设备不支持蓝牙。' })}
        </Text>
      </View>
    );
  }

  if (bleStatus === 'powered_off') {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.bigIcon}>📴</Text>
        <Text style={styles.errorText}>
          {t({ en: 'Please enable Bluetooth to pair devices.', zh: '请开启蓝牙以配对设备。' })}
        </Text>
      </View>
    );
  }

  // Pairing success view
  if (mode === 'paired') {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.bigIcon}>✅</Text>
        <Text style={styles.successTitle}>
          {t({ en: 'Paired!', zh: '配对成功！' })}
        </Text>
        <Text style={styles.successSubtitle}>
          {selectedDevice?.name || ''}
        </Text>
        <Pressable style={styles.primaryBtn} onPress={() => { setMode('list'); loadPairedDevices(); }}>
          <Text style={styles.primaryBtnText}>
            {t({ en: 'Done', zh: '完成' })}
          </Text>
        </Pressable>
      </View>
    );
  }

  // Pairing code input view
  if (mode === 'pairing' && selectedDevice) {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.bigIcon}>🔗</Text>
        <Text style={styles.pairingTitle}>
          {t({ en: `Pairing with ${selectedDevice.name}`, zh: `正在配对 ${selectedDevice.name}` })}
        </Text>
        <Text style={styles.pairingHint}>
          {t({ en: 'Enter the 6-digit code shown on your device', zh: '输入设备上显示的 6 位配对码' })}
        </Text>

        <PairingCodeInput
          value={pairingCode}
          onChange={handlePairingCodeChange}
          disabled={isPairing}
        />

        {isPairing && <ActivityIndicator color={colors.accent} style={styles.loader} />}
        {error ? <Text style={styles.errorText}>{error}</Text> : null}

        <Pressable style={styles.secondaryBtn} onPress={() => setMode('scanning')}>
          <Text style={styles.secondaryBtnText}>
            {t({ en: 'Cancel', zh: '取消' })}
          </Text>
        </Pressable>
      </View>
    );
  }

  // Scanning view
  if (mode === 'scanning') {
    return (
      <View style={styles.container}>
        <View style={styles.scanHeader}>
          <Text style={styles.sectionTitle}>
            {t({ en: 'Scanning for devices...', zh: '正在扫描设备...' })}
          </Text>
          <ActivityIndicator color={colors.accent} size="small" />
        </View>

        {discoveredDevices.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyText}>
              {t({ en: 'Make sure your device is powered on and nearby.', zh: '请确保设备已开机且在附近。' })}
            </Text>
          </View>
        ) : (
          <FlatList
            data={discoveredDevices}
            keyExtractor={(d) => d.id}
            renderItem={({ item: device }) => (
              <Pressable style={styles.deviceRow} onPress={() => handleSelectDevice(device)}>
                <Text style={styles.deviceIcon}>
                  {device.type === 'claw' ? '🦀' : device.type === 'agx' ? '🤖' : '📟'}
                </Text>
                <View style={styles.deviceInfo}>
                  <Text style={styles.deviceName}>{device.name}</Text>
                  <Text style={styles.deviceRssi}>
                    {t({ en: 'Signal', zh: '信号' })}: {device.rssi} dBm
                  </Text>
                </View>
                <Text style={styles.chevron}>›</Text>
              </Pressable>
            )}
          />
        )}

        <Pressable style={styles.secondaryBtn} onPress={handleStopScan}>
          <Text style={styles.secondaryBtnText}>
            {t({ en: 'Stop Scan', zh: '停止扫描' })}
          </Text>
        </Pressable>
      </View>
    );
  }

  // Default: Device list view
  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Paired Devices Section */}
      <Text style={styles.sectionTitle}>
        {t({ en: 'My Devices', zh: '我的设备' })}
      </Text>

      {isLoading ? (
        <ActivityIndicator color={colors.accent} style={styles.loader} />
      ) : pairedDevices.length === 0 ? (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyIcon}>📟</Text>
          <Text style={styles.emptyText}>
            {t({ en: 'No paired devices yet.', zh: '暂无已配对设备。' })}
          </Text>
        </View>
      ) : (
        pairedDevices.map((device) => (
          <View key={device.id} style={styles.pairedCard}>
            <View style={styles.pairedHeader}>
              <Text style={styles.pairedIcon}>
                {device.type === 'claw' ? '🦀' : '🤖'}
              </Text>
              <View style={styles.pairedInfo}>
                <Text style={styles.pairedName}>{device.name}</Text>
                <Text style={styles.pairedMeta}>
                  {device.firmwareVersion ? `FW ${device.firmwareVersion}` : ''}
                  {device.batteryLevel != null ? ` · 🔋 ${device.batteryLevel}%` : ''}
                </Text>
                {device.lastActive && (
                  <Text style={styles.pairedLastActive}>
                    {t({ en: 'Last active', zh: '最后活跃' })}: {device.lastActive}
                  </Text>
                )}
              </View>
            </View>
            <View style={styles.pairedActions}>
              <Pressable style={styles.smallBtn} onPress={() => handleCheckOta(device)}>
                <Text style={styles.smallBtnText}>
                  {t({ en: 'Check OTA', zh: '检查更新' })}
                </Text>
              </Pressable>
              <Pressable style={[styles.smallBtn, styles.dangerBtn]} onPress={() => handleUnpair(device)}>
                <Text style={[styles.smallBtnText, styles.dangerText]}>
                  {t({ en: 'Unpair', zh: '解除' })}
                </Text>
              </Pressable>
            </View>
          </View>
        ))
      )}

      {/* Pair New Device Button */}
      <Pressable style={styles.primaryBtn} onPress={handleStartScan}>
        <Text style={styles.primaryBtnText}>
          {t({ en: '+ Pair New Device', zh: '+ 配对新设备' })}
        </Text>
      </Pressable>

      {error ? <Text style={styles.errorText}>{error}</Text> : null}
    </ScrollView>
  );
}

// ── PairingCodeInput Component (Task 4.7) ──────────────────────────────────

function PairingCodeInput({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (text: string) => void;
  disabled: boolean;
}) {
  const digits = value.padEnd(6, ' ').split('');

  return (
    <View style={codeStyles.container}>
      <View style={codeStyles.boxes}>
        {digits.map((digit, i) => (
          <View
            key={i}
            style={[
              codeStyles.box,
              digit.trim() ? codeStyles.boxFilled : null,
              i === value.length ? codeStyles.boxActive : null,
            ]}
          >
            <Text style={codeStyles.digit}>{digit.trim() || ''}</Text>
          </View>
        ))}
      </View>
      {/* Hidden TextInput for keyboard */}
      <TextInput
        style={codeStyles.hiddenInput}
        value={value}
        onChangeText={onChange}
        keyboardType="number-pad"
        maxLength={6}
        autoFocus
        editable={!disabled}
        caretHidden
      />
    </View>
  );
}

const codeStyles = themedStyles(() => StyleSheet.create({
  container: {
    marginVertical: 24,
    alignItems: 'center',
  },
  boxes: {
    flexDirection: 'row',
    gap: 8,
  },
  box: {
    width: 44,
    height: 56,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: colors.border,
    backgroundColor: colors.bgCard,
    justifyContent: 'center',
    alignItems: 'center',
  },
  boxFilled: {
    borderColor: colors.accent,
  },
  boxActive: {
    borderColor: colors.primary,
  },
  digit: {
    color: colors.text,
    fontSize: 24,
    fontWeight: '700',
  },
  hiddenInput: {
    position: 'absolute',
    opacity: 0,
    width: '100%',
    height: '100%',
  },
}));

// ── Main Styles ────────────────────────────────────────────────────────────

const styles = themedStyles(() => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    padding: 16,
    paddingBottom: 40,
  },
  centerContainer: {
    flex: 1,
    backgroundColor: colors.background,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  bigIcon: {
    fontSize: 64,
    marginBottom: 16,
  },
  sectionTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 12,
  },
  scanHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 16,
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  emptyCard: {
    backgroundColor: colors.bgCard,
    borderRadius: 14,
    padding: 32,
    alignItems: 'center',
    marginBottom: 16,
  },
  emptyIcon: {
    fontSize: 40,
    marginBottom: 12,
  },
  emptyText: {
    color: colors.textSecondary,
    fontSize: 14,
    textAlign: 'center',
  },
  // Discovered device row
  deviceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.bgCard,
    borderRadius: 12,
    padding: 14,
    marginHorizontal: 16,
    marginBottom: 8,
  },
  deviceIcon: {
    fontSize: 28,
    marginRight: 12,
  },
  deviceInfo: {
    flex: 1,
  },
  deviceName: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '600',
  },
  deviceRssi: {
    color: colors.textSecondary,
    fontSize: 12,
    marginTop: 2,
  },
  chevron: {
    color: colors.textSecondary,
    fontSize: 22,
  },
  // Paired device card
  pairedCard: {
    backgroundColor: colors.bgCard,
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  pairedHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  pairedIcon: {
    fontSize: 32,
    marginRight: 12,
  },
  pairedInfo: {
    flex: 1,
  },
  pairedName: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '700',
  },
  pairedMeta: {
    color: colors.textSecondary,
    fontSize: 12,
    marginTop: 2,
  },
  pairedLastActive: {
    color: colors.textMuted,
    fontSize: 11,
    marginTop: 2,
  },
  pairedActions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 12,
  },
  smallBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  smallBtnText: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: '600',
  },
  dangerBtn: {
    borderColor: colors.error + '40',
  },
  dangerText: {
    color: colors.error,
  },
  // Pairing view
  pairingTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 8,
  },
  pairingHint: {
    color: colors.textSecondary,
    fontSize: 14,
    textAlign: 'center',
  },
  // Buttons
  primaryBtn: {
    backgroundColor: colors.accent,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 16,
  },
  primaryBtnText: {
    color: colors.textInverse,
    fontSize: 16,
    fontWeight: '700',
  },
  secondaryBtn: {
    backgroundColor: 'transparent',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: 14,
    paddingHorizontal: 24,
    alignItems: 'center',
    marginTop: 12,
  },
  secondaryBtnText: {
    color: colors.textSecondary,
    fontSize: 16,
    fontWeight: '600',
  },
  successTitle: {
    color: colors.success,
    fontSize: 22,
    fontWeight: '700',
    marginBottom: 4,
  },
  successSubtitle: {
    color: colors.textSecondary,
    fontSize: 16,
    marginBottom: 24,
  },
  errorText: {
    color: colors.error,
    fontSize: 14,
    textAlign: 'center',
    marginTop: 12,
  },
  loader: {
    marginVertical: 16,
  },
}));
