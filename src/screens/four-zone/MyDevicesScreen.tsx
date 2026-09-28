/**
 * MyDevicesScreen — 我的 → 设备 (M1-k, flag `mobile.four_zone_ia`).
 *
 * Computers (desktop-sync) and hardware devices (device registry) in one
 * list, each read shown as loaded / empty / failed on its own. A computer
 * opens 事项 → 电脑上; pairing opens the existing device screen; watches open
 * the wearable hub.
 *
 * M1-l (E30 补偿措施①): each active hardware device has a one-tap 解绑
 * (tightening, confirm first). The list shown afterwards is the backend
 * read-back, never an optimistic removal. A `device_paired` push (ref = the
 * device id) opens this list with that device highlighted and its unbind
 * button up front; an unknown ref highlights nothing.
 */
import React from 'react';
import { ActivityIndicator, Alert, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useI18n } from '../../stores/i18nStore';
import { useAuthStore } from '../../stores/authStore';
import { useThemedStyles, type Palette } from '../../theme/useTheme';
import { fetchDesktopState } from '../../services/desktopSync';
import {
  canRevokeDevice,
  fetchRegisteredDevices,
  findFocusedDevice,
  lastSeenLabel,
  normalizeComputers,
  revokeMyDevice,
  shortDeviceId,
  type DeviceRevokeOutcome,
  type MobileRegisteredDevice,
} from '../../services/myDevices';

type Lang = 'zh' | 'en';

export function MyDevicesScreen() {
  const { t, language } = useI18n();
  const lang: Lang = language === 'zh' ? 'zh' : 'en';
  const styles = useThemedStyles(makeStyles);
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const signedIn = useAuthStore((state) => !!state.token);
  // Same key as 事项, so both screens share one read.
  const desktop = useQuery({
    queryKey: ['four-zone', 'desktop-state'],
    queryFn: fetchDesktopState,
    enabled: signedIn,
    retry: 0,
    staleTime: 15_000,
  });
  const queryClient = useQueryClient();
  const registryKey = ['four-zone', 'device-registry'];
  const registry = useQuery({
    queryKey: registryKey,
    queryFn: fetchRegisteredDevices,
    enabled: signedIn,
    retry: 0,
    staleTime: 30_000,
  });
  const computers = normalizeComputers(desktop.data);
  const hardware = registry.data ?? [];
  const focused = findFocusedDevice(hardware, route.params?.ref);
  const refresh = () => {
    void desktop.refetch();
    void registry.refetch();
  };
  const revoke = useMutation({
    mutationFn: (device: MobileRegisteredDevice) => revokeMyDevice(device),
    onSuccess: (outcome: DeviceRevokeOutcome) => {
      if (outcome.kind === 'revoked' && outcome.mode === 'legacy') {
        Alert.alert(
          t({ en: 'Signed out', zh: '已让它下线' }),
          t({
            en: 'Its login was revoked; it needs to be paired again to work. The server still lists it until the new device lifecycle is on.',
            zh: '它的登录凭据已撤销，要再用需要重新配对。服务器开启新的设备生命周期之前，列表里还会显示它。',
          }),
        );
      } else if (outcome.kind === 'conflict') {
        Alert.alert(t({ en: 'The device changed', zh: '设备状态有变化' }), t({ en: 'The list was reloaded. Check it and try again.', zh: '已重新读取列表，请确认后再试。' }));
      } else if (outcome.kind === 'blocked' || outcome.kind === 'failed') {
        Alert.alert(t({ en: 'Not unbound', zh: '没有解绑成功' }), outcome.reason);
      }
    },
    onError: (error: any) => Alert.alert(t({ en: 'Not unbound', zh: '没有解绑成功' }), error?.message || t({ en: 'Try again.', zh: '请重试。' })),
    // Always show what the backend says now.
    onSettled: () => void queryClient.invalidateQueries({ queryKey: registryKey }),
  });
  const confirmRevoke = (device: MobileRegisteredDevice) =>
    Alert.alert(
      t({ en: 'Unbind this device?', zh: '解绑这台设备？' }),
      t({
        en: 'It loses access to your account now and has to be paired again to be used. If you did not pair it, unbind it.',
        zh: '它会立即失去对你账号的访问，要再用需要重新配对。如果不是你本人配对的，请解绑。',
      }),
      [
        { text: t({ en: 'Cancel', zh: '取消' }), style: 'cancel' },
        { text: t({ en: 'Unbind', zh: '解绑' }), style: 'destructive', onPress: () => revoke.mutate(device) },
      ],
    );
  const statusLabel = (device: MobileRegisteredDevice) =>
    device.status === 'revoked'
      ? t({ en: 'Unbound', zh: '已解绑' })
      : device.status === 'retired'
        ? t({ en: 'Retired', zh: '已停用' })
        : device.online
          ? t({ en: 'Online', zh: '在线' })
          : t({ en: 'Offline', zh: '离线' });

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={desktop.isRefetching || registry.isRefetching} onRefresh={refresh} />}
      testID="my-devices-screen"
    >
      <Text style={styles.title} accessibilityRole="header">
        {t({ en: 'Devices', zh: '设备' })}
      </Text>

      {focused ? (
        <View style={styles.focusNotice} testID="my-devices-focus-notice">
          <Text style={styles.focusTitle}>{t({ en: 'A new device was connected', zh: '有新设备连接到你的账号' })}</Text>
          <Text style={styles.muted}>
            {t({
              en: 'It is highlighted below. If you did not pair it, unbind it now.',
              zh: '下面高亮的就是它。如果不是你本人配对的，请立即解绑。',
            })}
          </Text>
        </View>
      ) : null}
      <Text style={styles.section}>{t({ en: 'Computers', zh: '电脑' })}</Text>
      <View style={styles.block} testID="my-devices-computers">
        {desktop.isLoading ? <ActivityIndicator /> : null}
        {desktop.isError ? (
          <Text style={styles.muted}>{t({ en: 'Could not load computers. Pull to retry.', zh: '电脑列表加载失败，下拉重试。' })}</Text>
        ) : null}
        {desktop.data && computers.length === 0 ? (
          <Text style={styles.muted} testID="my-devices-computers-empty">
            {t({
              en: 'No computer yet. Install Agentrix on your computer and sign in with this account; it shows up here.',
              zh: '还没有电脑。在电脑上安装 Agentrix 并用这个账号登录后，会出现在这里。',
            })}
          </Text>
        ) : null}
        {computers.map((computer) => (
          <TouchableOpacity
            key={computer.deviceId}
            style={styles.item}
            onPress={() => navigation.navigate('Matters', { screen: 'MattersDesktop', params: { tab: 'on-computer' } })}
            accessibilityRole="button"
            accessibilityLabel={`${computer.platform} ${lastSeenLabel(computer.lastSeenAgoMs, lang)}`}
            testID={`my-devices-computer-${computer.deviceId}`}
          >
            <Text style={styles.itemLabel}>
              {computer.platform}
              {computer.appVersion ? ` · ${computer.appVersion}` : ''}
            </Text>
            <Text style={styles.itemHint}>
              {t({ en: 'Last seen', zh: '最后在线' })} {lastSeenLabel(computer.lastSeenAgoMs, lang)} · {shortDeviceId(computer.deviceId)}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={styles.section}>{t({ en: 'Hardware devices', zh: '硬件设备' })}</Text>
      <View style={styles.block} testID="my-devices-hardware">
        {registry.isLoading ? <ActivityIndicator /> : null}
        {registry.isError ? (
          <Text style={styles.muted}>{t({ en: 'Could not load hardware devices. Pull to retry.', zh: '硬件设备加载失败，下拉重试。' })}</Text>
        ) : null}
        {registry.data && hardware.length === 0 ? (
          <Text style={styles.muted} testID="my-devices-hardware-empty">
            {t({ en: 'No paired hardware device.', zh: '还没有配对的硬件设备。' })}
          </Text>
        ) : null}
        {hardware.map((device) => {
          const busy = revoke.isPending && revoke.variables?.deviceId === device.deviceId;
          return (
            <View
              key={device.deviceId}
              style={[styles.hardwareRow, focused?.deviceId === device.deviceId ? styles.hardwareFocused : null]}
              testID={`my-devices-hardware-${device.deviceId}`}
            >
              <View style={styles.hardwareText}>
                <Text style={styles.itemLabel}>{device.label ?? shortDeviceId(device.deviceId)}</Text>
                <Text style={styles.itemHint}>
                  {statusLabel(device)}
                  {device.label ? ` · ${shortDeviceId(device.deviceId)}` : ''}
                  {device.updatedAt ? ` · ${t({ en: 'updated', zh: '更新于' })} ${device.updatedAt.slice(0, 10)}` : ''}
                </Text>
              </View>
              {canRevokeDevice(device) ? (
                <TouchableOpacity
                  style={styles.revokeButton}
                  onPress={() => confirmRevoke(device)}
                  disabled={busy}
                  accessibilityRole="button"
                  accessibilityLabel={`${t({ en: 'Unbind', zh: '解绑' })} ${device.label ?? shortDeviceId(device.deviceId)}`}
                  testID={`my-devices-revoke-${device.deviceId}`}
                >
                  {busy ? <ActivityIndicator /> : <Text style={styles.revokeText}>{t({ en: 'Unbind', zh: '解绑' })}</Text>}
                </TouchableOpacity>
              ) : null}
            </View>
          );
        })}
      </View>

      <TouchableOpacity
        style={styles.row}
        onPress={() => navigation.navigate('ToyBinding')}
        accessibilityRole="button"
        accessibilityLabel={t({ en: 'Pair or remove hardware', zh: '配对或移除硬件设备' })}
        testID="my-devices-manage-hardware"
      >
        <Text style={styles.rowLabel}>{t({ en: 'Pair or remove hardware', zh: '配对或移除硬件设备' })}</Text>
        <Text style={styles.chevron}>›</Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={styles.row}
        onPress={() => navigation.navigate('WearableHub')}
        accessibilityRole="button"
        accessibilityLabel={t({ en: 'Watches and wearables', zh: '手表与穿戴设备' })}
        testID="my-devices-wearables"
      >
        <Text style={styles.rowLabel}>{t({ en: 'Watches and wearables', zh: '手表与穿戴设备' })}</Text>
        <Text style={styles.chevron}>›</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: c.bgPrimary },
    content: { padding: 20, gap: 10, paddingBottom: 40 },
    title: { color: c.textPrimary, fontSize: 26, fontWeight: '800', marginBottom: 6 },
    section: { color: c.textSecondary, fontSize: 13, fontWeight: '700', marginTop: 8 },
    muted: { color: c.textMuted, fontSize: 13, lineHeight: 19 },
    block: { backgroundColor: c.bgCard, borderColor: c.border, borderWidth: 1, borderRadius: 14, padding: 14, gap: 10 },
    item: { minHeight: 44, justifyContent: 'center', gap: 2 },
    hardwareRow: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 12 },
    hardwareText: { flex: 1, gap: 2 },
    hardwareFocused: { borderColor: c.warning, borderWidth: 1, borderRadius: 12, paddingHorizontal: 10 },
    focusNotice: { backgroundColor: c.bgCard, borderColor: c.warning, borderWidth: 1, borderRadius: 14, padding: 14, gap: 4 },
    focusTitle: { color: c.textPrimary, fontSize: 15, fontWeight: '800' },
    revokeButton: {
      minHeight: 40,
      minWidth: 72,
      paddingHorizontal: 14,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: c.danger,
      alignItems: 'center',
      justifyContent: 'center',
    },
    revokeText: { color: c.danger, fontSize: 13, fontWeight: '800' },
    itemLabel: { color: c.textPrimary, fontSize: 15, fontWeight: '700' },
    itemHint: { color: c.textMuted, fontSize: 12 },
    row: {
      minHeight: 52,
      backgroundColor: c.bgCard,
      borderColor: c.border,
      borderWidth: 1,
      borderRadius: 14,
      paddingHorizontal: 16,
      paddingVertical: 12,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    rowLabel: { color: c.textPrimary, fontSize: 15, fontWeight: '600', flexShrink: 1 },
    chevron: { color: c.textMuted, fontSize: 20 },
  });
