/**
 * TwinIdentityCredential — 身份凭证 on the passport screen (L5 backend 9 option B, mobile; identityCredential.ts).
 * Read-only: issued date, whether the signature checks out, the DID, public ID and passport number. Issuing and
 * downloading stay on the Web. Rendered only behind EXPO_PUBLIC_SOUL_CORE_IDENTITY_VC_ENABLED=1; a 404 from the
 * server switch (or for an Agent that is not yours) shows nothing.
 */
import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { getApiConfig } from '../../services/api';
import {
  IDENTITY_CREDENTIAL_SIGNATURE_COPY,
  createMobileIdentityCredentialClient,
  identityCredentialView,
  type MobileIdentityCredentialClientV0,
} from '../../services/identityCredential';
import { mobileV6HttpTransport } from '../../services/mobileV6Runtime';
import { useAuthStore } from '../../stores/authStore';
import { useI18n } from '../../stores/i18nStore';
import { useThemedStyles, type Palette } from '../../theme/useTheme';

function mobileIdentityCredentialClient(): MobileIdentityCredentialClientV0 {
  return createMobileIdentityCredentialClient({
    transport: mobileV6HttpTransport,
    baseUrl: getApiConfig().baseUrl || 'https://api.agentrix.top/api',
    token: () => getApiConfig().token || useAuthStore.getState().token,
  });
}

export function TwinIdentityCredential({ agentAccountId }: { agentAccountId: string }) {
  const { t } = useI18n();
  const styles = useThemedStyles(makeStyles);
  const query = useQuery({
    queryKey: ['four-zone', 'identity-credential', agentAccountId],
    queryFn: () => mobileIdentityCredentialClient().read(agentAccountId),
    enabled: Boolean(agentAccountId),
    retry: 0,
    staleTime: 30_000,
  });
  const unreadable = query.isError || query.data?.kind === 'unreadable';
  const view = identityCredentialView(unreadable ? { kind: 'unreadable' } : query.data ?? 'loading');
  if (!view) return null;
  return (
    <>
      <Text style={styles.section}>{t({ en: 'Identity credential', zh: '身份凭证' })}</Text>
      <View style={styles.block} testID="twin-identity-credential">
        <Text style={styles.headline}>
          {t(view.headline)}
          {view.signature ? (
            <Text style={view.signature === 'checks_out' ? styles.ok : styles.danger} testID={`twin-identity-credential-${view.signature}`}>
              {` · ${t(IDENTITY_CREDENTIAL_SIGNATURE_COPY[view.signature])}`}
            </Text>
          ) : null}
        </Text>
        {view.did ? (
          <Text style={styles.did} selectable>
            {view.did}
          </Text>
        ) : null}
        {view.notes.map((note) => (
          <Text key={note.en} style={styles.note}>
            {t(note)}
          </Text>
        ))}
        {unreadable ? (
          <TouchableOpacity onPress={() => void query.refetch()} accessibilityRole="button" style={styles.linkButton}>
            <Text style={styles.linkText}>{t({ en: 'Read again', zh: '重新读取' })}</Text>
          </TouchableOpacity>
        ) : null}
      </View>
    </>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    section: { color: c.textSecondary, fontSize: 13, fontWeight: '700', marginTop: 4 },
    block: { backgroundColor: c.bgCard, borderRadius: 16, padding: 15, borderWidth: 1, borderColor: c.border, gap: 8 },
    headline: { color: c.textPrimary, fontSize: 14, fontWeight: '800' },
    ok: { color: c.success, fontSize: 13, fontWeight: '800' },
    danger: { color: c.danger, fontSize: 13, fontWeight: '800' },
    did: { color: c.textSecondary, fontSize: 12, lineHeight: 18 },
    note: { color: c.textSecondary, fontSize: 13, lineHeight: 20 },
    linkButton: { alignSelf: 'flex-start', minHeight: 44, justifyContent: 'center' },
    linkText: { color: c.accent, fontSize: 13, fontWeight: '800' },
  });
