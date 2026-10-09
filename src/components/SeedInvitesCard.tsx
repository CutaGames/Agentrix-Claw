/**
 * L6-11 "My invites" on the passport screen (behind EXPO_PUBLIC_SEED_INVITES=1). A member shares their codes; anyone
 * else can redeem one. Renders nothing while the server switch is off.
 */
import React, { useState } from 'react';
import { Share, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getApiConfig } from '../services/api';
import { mobileV6HttpTransport } from '../services/mobileV6Runtime';
import {
  SEED_INVITES_FAILURE_COPY,
  SeedInvitesError,
  createMobileSeedInvitesClient,
  seedInviteShareLink,
  type MobileSeedInvitesClientV0,
} from '../services/seedInvites';
import { useAuthStore } from '../stores/authStore';
import { useI18n } from '../stores/i18nStore';
import { useThemedStyles, type Palette } from '../theme/useTheme';

function mobileSeedInvitesClient(): MobileSeedInvitesClientV0 {
  return createMobileSeedInvitesClient({
    transport: mobileV6HttpTransport,
    baseUrl: getApiConfig().baseUrl || 'https://api.agentrix.top/api',
    token: () => getApiConfig().token || useAuthStore.getState().token,
  });
}

export function SeedInvitesCard() {
  const { language } = useI18n();
  const lang = language === 'zh' ? 'zh' : 'en';
  const styles = useThemedStyles(makeStyles);
  const queryClient = useQueryClient();
  const key = ['four-zone', 'seed-invites'];
  const query = useQuery({ queryKey: key, queryFn: () => mobileSeedInvitesClient().mine(), retry: 0 });
  const [draft, setDraft] = useState('');
  const [notice, setNotice] = useState('');

  const failure = query.error instanceof SeedInvitesError ? query.error.failure : query.error ? 'unavailable' : null;
  if (failure === 'closed') return null;

  const redeem = async () => {
    try {
      await mobileSeedInvitesClient().redeem(draft);
      setDraft('');
      setNotice(lang === 'zh' ? '已加入，下面是你的邀请码。' : 'You have joined. Your codes are below.');
      await queryClient.invalidateQueries({ queryKey: key });
    } catch (error) {
      setNotice(SEED_INVITES_FAILURE_COPY[error instanceof SeedInvitesError ? error.failure : 'unavailable'][lang]);
    }
  };

  const view = query.data;
  return (
    <View style={styles.card} testID="seed-invites-card">
      <Text style={styles.title}>{lang === 'zh' ? '我的邀请' : 'My invites'}</Text>
      {failure ? <Text style={styles.muted}>{SEED_INVITES_FAILURE_COPY[failure][lang]}</Text> : null}
      {view && view.member
        ? view.codes.map((invite) => (
            <View key={invite.code} style={styles.row}>
              <Text style={styles.code}>{invite.code}</Text>
              {invite.status === 'redeemed' ? (
                <Text style={styles.muted}>{lang === 'zh' ? '已使用' : 'Used'}</Text>
              ) : (
                <TouchableOpacity accessibilityRole="button" onPress={() => void Share.share({ message: seedInviteShareLink(invite.code) })}>
                  <Text style={styles.link}>{lang === 'zh' ? '分享' : 'Share'}</Text>
                </TouchableOpacity>
              )}
            </View>
          ))
        : null}
      {view && !view.member ? (
        <View style={styles.row}>
          <TextInput
            value={draft}
            onChangeText={setDraft}
            autoCapitalize="characters"
            maxLength={32}
            placeholder={lang === 'zh' ? '邀请码' : 'Invite code'}
            style={styles.input}
            accessibilityLabel={lang === 'zh' ? '邀请码' : 'Invite code'}
          />
          <TouchableOpacity accessibilityRole="button" disabled={!draft.trim()} onPress={() => void redeem()}>
            <Text style={styles.link}>{lang === 'zh' ? '兑换' : 'Redeem'}</Text>
          </TouchableOpacity>
        </View>
      ) : null}
      {notice ? <Text style={styles.muted}>{notice}</Text> : null}
    </View>
  );
}

const makeStyles = (p: Palette) =>
  StyleSheet.create({
    card: { backgroundColor: p.card, borderRadius: 16, padding: 16, marginTop: 12, gap: 8 },
    title: { color: p.text, fontSize: 16, fontWeight: '700' },
    row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    code: { color: p.text, fontSize: 15, letterSpacing: 1 },
    muted: { color: p.textMuted, fontSize: 13 },
    link: { color: p.accent, fontSize: 14, fontWeight: '600' },
    input: { flex: 1, color: p.text, borderWidth: 1, borderColor: p.border, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 },
  });
