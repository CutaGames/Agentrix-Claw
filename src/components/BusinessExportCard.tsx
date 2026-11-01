/**
 * BusinessExportCard — L9 P2-7 "take your business data with you" (businessExport.ts).
 * Rendered only behind EXPO_PUBLIC_ACCOUNT_EXPORT_BUSINESS_V1=1. It asks the L9 list first and draws nothing until the
 * answer is "in"; a 404 from the export routes (a server switch off) makes it disappear. The JSON file is written to the
 * app cache and handed to the share sheet; "check what is left" shows counts only.
 */
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system/legacy';
import { BUSINESS_EXPORT_COPY_V1 as COPY, businessExportFailureCopyV1, type BusinessExportFailureV1 } from '../../shared/client/account-export-business';
import type { BusinessExportCheckV1 } from '../../shared/types/account-export-business';
import { getApiConfig } from '../services/api';
import { createMobileBusinessExportClient, readMobileL9Cohort } from '../services/businessExport';
import { mobileV6HttpTransport } from '../services/mobileV6Runtime';
import { useAuthStore } from '../stores/authStore';
import { useI18n } from '../stores/i18nStore';
import { useThemedStyles, type Palette } from '../theme/useTheme';

function deps() {
  return {
    transport: mobileV6HttpTransport,
    baseUrl: getApiConfig().baseUrl || 'https://api.agentrix.top/api',
    token: () => getApiConfig().token || useAuthStore.getState().token,
  };
}

const LABELS = {
  customers: { zh: '客户', en: 'Customers' },
  answers: { zh: '问答', en: 'Questions and answers' },
  introductions: { zh: '转介账', en: 'Introduction ledger' },
  receipts: { zh: '回执', en: 'Receipts' },
} as const;

export function BusinessExportCard() {
  const { language } = useI18n();
  const lang = language === 'zh' ? 'zh' : 'en';
  const styles = useThemedStyles(makeStyles);
  const [cohort, setCohort] = useState<'loading' | 'in' | 'out'>('loading');
  const [state, setState] = useState<'idle' | 'working' | 'checking' | 'closed'>('idle');
  const [notice, setNotice] = useState('');
  const [check, setCheck] = useState<BusinessExportCheckV1 | null>(null);

  useEffect(() => {
    let live = true;
    void readMobileL9Cohort(deps()).then((gate) => {
      if (live) setCohort(gate);
    });
    return () => {
      live = false;
    };
  }, []);

  const fail = (failure: BusinessExportFailureV1) => {
    if (failure === 'closed') {
      setState('closed');
      return;
    }
    const copy = businessExportFailureCopyV1(failure);
    setNotice(copy ? copy[lang] : '');
    setState('idle');
  };

  const run = async () => {
    setState('working');
    setNotice('');
    const result = await createMobileBusinessExportClient(deps()).exportAll();
    if (result.ok === false) {
      fail(result.failure);
      return;
    }
    const path = `${FileSystem.cacheDirectory ?? ''}${result.fileName}`;
    try {
      await FileSystem.writeAsStringAsync(path, result.text);
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(path, { mimeType: 'application/json', dialogTitle: COPY.title[lang] });
      }
      setNotice(COPY.done[lang]);
    } catch {
      setNotice(COPY.failed[lang]);
    } finally {
      // Review D-R4: the file holds customers' contacts; once the share sheet is closed it does not stay in the app cache.
      await FileSystem.deleteAsync(path, { idempotent: true }).catch(() => undefined);
    }
    setState('idle');
  };

  const runCheck = async () => {
    setState('checking');
    setNotice('');
    const result = await createMobileBusinessExportClient(deps()).check();
    if (result.ok === false) {
      setCheck(null);
      fail(result.failure);
      return;
    }
    setCheck(result.value);
    setState('idle');
  };

  if (cohort !== 'in' || state === 'closed') return null;
  const busy = state === 'working' || state === 'checking';
  return (
    <View style={styles.card} testID="business-export-card">
      <Text style={styles.title}>{COPY.title[lang]}</Text>
      <Text style={styles.muted}>{COPY.scope[lang]}</Text>
      <TouchableOpacity accessibilityRole="button" disabled={busy} onPress={() => void run()} testID="business-export-take">
        {state === 'working' ? <ActivityIndicator /> : <Text style={styles.action}>{COPY.action[lang]}</Text>}
      </TouchableOpacity>
      {notice ? <Text style={styles.muted}>{notice}</Text> : null}

      <Text style={styles.subtitle}>{COPY.checkTitle[lang]}</Text>
      <Text style={styles.muted}>{COPY.checkHelp[lang]}</Text>
      <TouchableOpacity accessibilityRole="button" disabled={busy} onPress={() => void runCheck()} testID="business-export-check">
        {state === 'checking' ? <ActivityIndicator /> : <Text style={styles.action}>{COPY.checkAction[lang]}</Text>}
      </TouchableOpacity>
      {check ? (
        <View style={styles.result} testID="business-export-check-result">
          <Text style={styles.muted}>{`${LABELS.customers[lang]}: ${check.counts.customers.active + check.counts.customers.deleted}`}</Text>
          <Text style={styles.muted}>{`${LABELS.answers[lang]}: ${check.counts.answers.privateTurns + check.counts.answers.decisions + check.counts.answers.reviewItems}`}</Text>
          <Text style={styles.muted}>{`${LABELS.introductions[lang]}: ${check.counts.introductions.introducer + check.counts.introductions.introduced}`}</Text>
          <Text style={styles.muted}>{`${LABELS.receipts[lang]}: ${check.counts.receipts}`}</Text>
          {check.deletedStillHoldingContact > 0 ? <Text style={styles.muted}>{COPY.checkHolding[lang]}</Text> : null}
          <Text style={styles.verdict}>
            {check.verifiedEmpty ? COPY.checkClean[lang] : check.unavailable.length > 0 ? COPY.checkUnread[lang] : COPY.checkLeft[lang]}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

const makeStyles = (p: Palette) =>
  StyleSheet.create({
    card: { backgroundColor: p.card, borderRadius: 16, padding: 16, marginBottom: 12, gap: 8 },
    title: { color: p.text, fontSize: 16, fontWeight: '700' },
    subtitle: { color: p.text, fontSize: 15, fontWeight: '700', marginTop: 4 },
    action: { color: p.accent, fontSize: 14, fontWeight: '700' },
    muted: { color: p.textMuted, fontSize: 13 },
    result: { gap: 2 },
    verdict: { color: p.text, fontSize: 13, fontWeight: '700' },
  });
