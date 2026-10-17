/**
 * SharePagesCard — 共享页 on the passport screen (L6-2, sharePages.ts). Rendered only behind EXPO_PUBLIC_SHARE_PAGES=1;
 * renders nothing while the server switch is off. The owner makes a link, shares it, and can revoke it.
 */
import React, { useState } from 'react';
import { Share, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { SHARE_PAGE_KINDS_V1, type SharePageKindV1 } from '../../shared/types/share-pages';
import { getApiConfig } from '../services/api';
import { mobileV6HttpTransport } from '../services/mobileV6Runtime';
import {
  SHARE_PAGES_FAILURE_COPY,
  SHARE_PAGE_KIND_COPY,
  SharePagesError,
  createMobileSharePagesClient,
  sharePagePublicLink,
  type MobileSharePagesClientV0,
  sharePageStatsCopy,
} from '../services/sharePages';
import { useAuthStore } from '../stores/authStore';
import { useI18n } from '../stores/i18nStore';
import { useThemedStyles, type Palette } from '../theme/useTheme';

function mobileSharePagesClient(): MobileSharePagesClientV0 {
  return createMobileSharePagesClient({
    transport: mobileV6HttpTransport,
    baseUrl: getApiConfig().baseUrl || 'https://api.agentrix.top/api',
    token: () => getApiConfig().token || useAuthStore.getState().token,
  });
}

export function SharePagesCard() {
  const { language } = useI18n();
  const lang = language === 'zh' ? 'zh' : 'en';
  const styles = useThemedStyles(makeStyles);
  const queryClient = useQueryClient();
  const key = ['four-zone', 'share-pages'];
  const query = useQuery({ queryKey: key, queryFn: () => mobileSharePagesClient().mine(), retry: 0 });
  const [kind, setKind] = useState<SharePageKindV1>('quote');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [bookingUrl, setBookingUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');

  const failure = query.error instanceof SharePagesError ? query.error.failure : query.error ? 'unavailable' : null;
  if (failure === 'closed') return null;

  const create = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const page = await mobileSharePagesClient().create({ kind, title, body, ...(bookingUrl.trim() ? { bookingUrl: bookingUrl.trim() } : {}) });
      setTitle('');
      setBody('');
      setBookingUrl('');
      setNotice(lang === 'zh' ? '链接已生成，可以分享了。' : 'Link ready to share.');
      await queryClient.invalidateQueries({ queryKey: key });
      void Share.share({ message: sharePagePublicLink(page.token) });
    } catch (error) {
      setNotice(SHARE_PAGES_FAILURE_COPY[error instanceof SharePagesError ? error.failure : 'unavailable'][lang]);
    } finally {
      setBusy(false);
    }
  };

  const revoke = async (shareId: string) => {
    try {
      await mobileSharePagesClient().revoke(shareId);
      setNotice(lang === 'zh' ? '链接已撤销。' : 'Link revoked.');
      await queryClient.invalidateQueries({ queryKey: key });
    } catch (error) {
      setNotice(SHARE_PAGES_FAILURE_COPY[error instanceof SharePagesError ? error.failure : 'unavailable'][lang]);
    }
  };

  return (
    <View style={styles.card} testID="share-pages-card">
      <Text style={styles.title}>{lang === 'zh' ? '共享页' : 'Share pages'}</Text>
      <View style={styles.kinds}>
        {SHARE_PAGE_KINDS_V1.map((option) => (
          <TouchableOpacity key={option} accessibilityRole="radio" accessibilityState={{ selected: kind === option }} onPress={() => setKind(option)}>
            <Text style={kind === option ? styles.kindOn : styles.kind}>{SHARE_PAGE_KIND_COPY[option][lang]}</Text>
          </TouchableOpacity>
        ))}
      </View>
      <TextInput value={title} onChangeText={setTitle} maxLength={120} placeholder={lang === 'zh' ? '标题' : 'Title'} style={styles.input} accessibilityLabel={lang === 'zh' ? '标题' : 'Title'} />
      <TextInput
        value={body}
        onChangeText={setBody}
        multiline
        placeholder={lang === 'zh' ? '正文' : 'Body'}
        style={[styles.input, styles.body]}
        accessibilityLabel={lang === 'zh' ? '正文' : 'Body'}
      />
      <TextInput
        value={bookingUrl}
        onChangeText={setBookingUrl}
        autoCapitalize="none"
        placeholder={lang === 'zh' ? '预约链接（可选，只能是本站地址）' : 'Booking link (optional, this site only)'}
        style={styles.input}
        accessibilityLabel={lang === 'zh' ? '预约链接' : 'Booking link'}
      />
      <TouchableOpacity accessibilityRole="button" disabled={busy || !title.trim() || !body.trim()} onPress={() => void create()}>
        <Text style={[styles.link, busy || !title.trim() || !body.trim() ? styles.disabled : null]}>{lang === 'zh' ? '生成链接' : 'Create link'}</Text>
      </TouchableOpacity>
      {failure ? <Text style={styles.muted}>{SHARE_PAGES_FAILURE_COPY[failure][lang]}</Text> : null}
      {(query.data ?? []).map((page) => (
        <View key={page.shareId} style={styles.row}>
          <Text style={styles.text} numberOfLines={3}>
            <Text style={styles.strong}>{page.title}</Text>
            {` · ${SHARE_PAGE_KIND_COPY[page.kind][lang]} · ${lang === 'zh' ? `${page.replyCount} 条回复` : `${page.replyCount} replies`}`}
            {page.status === 'revoked' ? (lang === 'zh' ? ' · 已撤销' : ' · Revoked') : ''}
            {page.stats ? `\n${sharePageStatsCopy(page.stats)[lang]}` : ''}
          </Text>
          {page.status === 'active' ? (
            <View style={styles.actions}>
              <TouchableOpacity accessibilityRole="button" onPress={() => void Share.share({ message: sharePagePublicLink(page.token) })}>
                <Text style={styles.link}>{lang === 'zh' ? '分享' : 'Share'}</Text>
              </TouchableOpacity>
              <TouchableOpacity accessibilityRole="button" onPress={() => void revoke(page.shareId)}>
                <Text style={styles.muted}>{lang === 'zh' ? '撤销' : 'Revoke'}</Text>
              </TouchableOpacity>
            </View>
          ) : null}
        </View>
      ))}
      {notice ? <Text style={styles.muted}>{notice}</Text> : null}
    </View>
  );
}

const makeStyles = (p: Palette) =>
  StyleSheet.create({
    card: { backgroundColor: p.card, borderRadius: 16, padding: 16, marginTop: 12, gap: 8 },
    title: { color: p.text, fontSize: 16, fontWeight: '700' },
    kinds: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
    kind: { color: p.textMuted, fontSize: 13 },
    kindOn: { color: p.accent, fontSize: 13, fontWeight: '700' },
    input: { color: p.text, borderWidth: 1, borderColor: p.border, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 },
    body: { minHeight: 72, textAlignVertical: 'top' },
    row: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: p.border, paddingTop: 8, gap: 4 },
    actions: { flexDirection: 'row', gap: 16 },
    text: { color: p.text, fontSize: 13 },
    strong: { fontWeight: '700' },
    muted: { color: p.textMuted, fontSize: 13 },
    link: { color: p.accent, fontSize: 14, fontWeight: '600' },
    disabled: { opacity: 0.4 },
  });
