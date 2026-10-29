/**
 * AccountExportCard — "Export all my data" (L8 2nd batch A8, accountExport.ts).
 * Rendered only behind EXPO_PUBLIC_ACCOUNT_EXPORT=1; renders nothing while the server switch is off.
 * The JSON file is written to the app cache and handed to the share sheet; the owner decides where it goes.
 */
import React, { useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system/legacy';
import { ACCOUNT_EXPORT_COPY_V2 as COPY, accountExportFailureCopyV2 } from '../../shared/client/account-export';
import { getApiConfig } from '../services/api';
import { createMobileAccountExportClient } from '../services/accountExport';
import { mobileV6HttpTransport } from '../services/mobileV6Runtime';
import { useAuthStore } from '../stores/authStore';
import { useI18n } from '../stores/i18nStore';
import { useThemedStyles, type Palette } from '../theme/useTheme';

function client() {
  return createMobileAccountExportClient({
    transport: mobileV6HttpTransport,
    baseUrl: getApiConfig().baseUrl || 'https://api.agentrix.top/api',
    token: () => getApiConfig().token || useAuthStore.getState().token,
  });
}

export function AccountExportCard() {
  const { language } = useI18n();
  const lang = language === 'zh' ? 'zh' : 'en';
  const styles = useThemedStyles(makeStyles);
  const [state, setState] = useState<'idle' | 'working' | 'closed'>('idle');
  const [notice, setNotice] = useState('');

  const run = async () => {
    setState('working');
    setNotice('');
    const result = await client().exportAll();
    if (result.ok === false) {
      if (result.failure === 'closed') {
        setState('closed');
        return;
      }
      const copy = accountExportFailureCopyV2(result.failure);
      setNotice(copy ? copy[lang] : '');
      setState('idle');
      return;
    }
    try {
      const path = `${FileSystem.cacheDirectory ?? ''}${result.fileName}`;
      await FileSystem.writeAsStringAsync(path, result.text);
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(path, { mimeType: 'application/json', dialogTitle: COPY.title[lang] });
      }
      setNotice(COPY.done[lang]);
    } catch {
      setNotice(COPY.failed[lang]);
    }
    setState('idle');
  };

  if (state === 'closed') return null;
  return (
    <View style={styles.card} testID="account-export-card">
      <Text style={styles.title}>{COPY.title[lang]}</Text>
      <Text style={styles.muted}>{COPY.scope[lang]}</Text>
      <TouchableOpacity accessibilityRole="button" disabled={state === 'working'} onPress={() => void run()}>
        {state === 'working' ? <ActivityIndicator /> : <Text style={styles.action}>{COPY.action[lang]}</Text>}
      </TouchableOpacity>
      {notice ? <Text style={styles.muted}>{notice}</Text> : null}
    </View>
  );
}

const makeStyles = (p: Palette) =>
  StyleSheet.create({
    card: { backgroundColor: p.card, borderRadius: 16, padding: 16, marginBottom: 12, gap: 8 },
    title: { color: p.text, fontSize: 16, fontWeight: '700' },
    action: { color: p.accent, fontSize: 14, fontWeight: '700' },
    muted: { color: p.textMuted, fontSize: 13 },
  });
