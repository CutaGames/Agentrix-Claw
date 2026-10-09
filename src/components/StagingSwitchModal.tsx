/**
 * StagingSwitchModal — "连接 staging" in a preview build (I-046 item 2).
 *
 * Opened by a long press on the version line in 我的 → 设置与隐私, and only in a build with
 * `EXPO_PUBLIC_STAGING_SWITCH=1` (the caller checks `STAGING_SWITCH_BUILD`; this component checks
 * again and renders nothing otherwise). The tester pastes the gate key; it goes straight into
 * SecureStore and is never shown again, logged or sent anywhere but the staging host.
 */
import React, { useState } from 'react';
import { Alert, DevSettings, Modal, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import * as Updates from 'expo-updates';
import { MMKV } from 'react-native-mmkv';
import { useI18n } from '../stores/i18nStore';
import { useAuthStore } from '../stores/authStore';
import { mmkv } from '../stores/mmkvStorage';
import { STAGING_HOST, STAGING_SELECTION, STAGING_SWITCH_BUILD } from '../config/stagingMode';
import { stagingSwitchFailureText, switchToProduction, switchToStaging, type StagingSwitchDeps } from '../services/stagingSwitch';
import { useThemedStyles, type Palette } from '../theme/useTheme';

function nativeSwitchDeps(): StagingSwitchDeps {
  return {
    clearAuth: () => useAuthStore.getState().clearAuth(),
    clearLocalData: async () => {
      await AsyncStorage.clear();
      mmkv.clearAll();
      // The default MMKV instance (pet setup) as well.
      new MMKV().clearAll();
    },
    secureSet: (key, value) => SecureStore.setItemAsync(key, value),
    secureDelete: (key) => SecureStore.deleteItemAsync(key),
    reload: async () => {
      try {
        await Updates.reloadAsync();
      } catch {
        // Development client: expo-updates cannot reload there.
        DevSettings.reload();
      }
    },
  };
}

export function StagingSwitchModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { t } = useI18n();
  const styles = useThemedStyles(makeStyles);
  const [key, setKey] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  if (!STAGING_SWITCH_BUILD) return null;
  const inStaging = STAGING_SELECTION.active;

  const confirmThen = (run: () => Promise<void>) => {
    Alert.alert(
      inStaging ? t({ en: 'Back to production', zh: '回到正式环境' }) : t({ en: 'Connect to staging', zh: '连接 staging' }),
      t({
        en: 'This signs you out, wipes this app\u2019s local data on this phone (settings, caches, pet setup) and restarts the app. Use a test phone.',
        zh: '会退出登录，清掉这台手机上 Agentrix 的所有本地数据（设置、缓存、宠物形象），然后重启 App。只在测试手机上用。',
      }),
      [
        { text: t({ en: 'Cancel', zh: '取消' }), style: 'cancel' },
        { text: t({ en: 'Continue', zh: '继续' }), style: 'destructive', onPress: () => void run() },
      ],
    );
  };

  const connect = () =>
    confirmThen(async () => {
      setBusy(true);
      setMessage(null);
      const result = await switchToStaging(key, nativeSwitchDeps());
      // Only reached when it did not reload.
      setBusy(false);
      setKey('');
      if (result.ok === false) setMessage(t(stagingSwitchFailureText(result.reason)));
    });

  const leave = () =>
    confirmThen(async () => {
      setBusy(true);
      setMessage(null);
      const result = await switchToProduction(nativeSwitchDeps());
      setBusy(false);
      if (result.ok === false) setMessage(t(stagingSwitchFailureText(result.reason)));
    });

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.sheet} testID="staging-switch-sheet">
          <Text style={styles.title}>{inStaging ? t({ en: 'Connected to staging', zh: '现在连着 staging' }) : t({ en: 'Connect to staging', zh: '连接 staging' })}</Text>
          <Text style={styles.body}>
            {inStaging
              ? t({ en: `This app talks to ${STAGING_HOST} only.`, zh: `这个 App 现在只连 ${STAGING_HOST}。` })
              : t({
                  en: `Paste the staging gate key. It is kept on this phone and sent only to ${STAGING_HOST}.`,
                  zh: `粘贴 staging 门禁 key。它只存在这台手机上，只发给 ${STAGING_HOST}。`,
                })}
          </Text>
          {!inStaging ? (
            <TextInput
              value={key}
              onChangeText={setKey}
              placeholder={t({ en: 'Gate key', zh: '门禁 key' })}
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
              editable={!busy}
              style={styles.input}
              testID="staging-switch-key"
            />
          ) : null}
          {message ? <Text style={styles.error}>{message}</Text> : null}
          <View style={styles.row}>
            <TouchableOpacity onPress={onClose} disabled={busy} style={styles.secondary} testID="staging-switch-cancel">
              <Text style={styles.secondaryText}>{t({ en: 'Close', zh: '关闭' })}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={inStaging ? leave : connect}
              disabled={busy || (!inStaging && !key.trim())}
              style={[styles.primary, (busy || (!inStaging && !key.trim())) && styles.disabled]}
              testID="staging-switch-confirm"
            >
              <Text style={styles.primaryText}>{inStaging ? t({ en: 'Back to production', zh: '回到正式环境' }) : t({ en: 'Connect', zh: '连接' })}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 24 },
    sheet: { backgroundColor: c.bgCard, borderRadius: 16, padding: 20, gap: 12, borderWidth: 1, borderColor: c.border },
    title: { color: c.textPrimary, fontSize: 18, fontWeight: '700' },
    body: { color: c.textSecondary, fontSize: 14, lineHeight: 20 },
    input: { borderWidth: 1, borderColor: c.border, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, color: c.textPrimary },
    error: { color: c.textSecondary, fontSize: 13 },
    row: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10 },
    secondary: { paddingHorizontal: 14, paddingVertical: 10 },
    secondaryText: { color: c.textSecondary, fontSize: 14, fontWeight: '600' },
    primary: { backgroundColor: c.accent, borderRadius: 10, paddingHorizontal: 16, paddingVertical: 10 },
    primaryText: { color: c.onAccent, fontSize: 14, fontWeight: '700' },
    disabled: { opacity: 0.5 },
  });
