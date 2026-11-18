/**
 * TwinTelegramForward — the "Telegram" button next to a personal link's "Forward" button (twinTelegram.ts). It forwards
 * the same link as a Telegram link, which the friend opens in the platform bot's private chat. Rendered only in builds
 * with `EXPO_PUBLIC_TWIN_TELEGRAM=1`; shows nothing until the server has named its bot, and nothing at all when it
 * does not offer Telegram links.
 */
import React from 'react';
import { Share, StyleSheet, Text, TouchableOpacity } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useI18n } from '../../stores/i18nStore';
import { useThemedStyles, type Palette } from '../../theme/useTheme';
import type { TwinTelegramKindV0 } from '../../../shared/types/twin-telegram';
import { TWIN_TELEGRAM_ENABLED, twinTelegramLinkOf, twinTelegramShareWords } from '../../services/twinTelegram';
import { mobileTwinTelegramClient } from '../../services/twinTelegramSession';

interface Props {
  kind: TwinTelegramKindV0;
  /** The personal web link this button stands next to. */
  url: string;
  /** `row`: beside the Forward button. `stack`: under it. */
  layout: 'row' | 'stack';
  testID?: string;
}

export function TwinTelegramForward({ kind, url, layout, testID }: Props) {
  const { t } = useI18n();
  const styles = useThemedStyles(makeStyles);
  const bot = useQuery({
    queryKey: ['twin-telegram', 'bot-name'],
    queryFn: () => mobileTwinTelegramClient().botName(),
    enabled: TWIN_TELEGRAM_ENABLED,
    retry: false,
    staleTime: 10 * 60 * 1000,
  });
  const link = TWIN_TELEGRAM_ENABLED ? twinTelegramLinkOf(bot.data, kind, url) : null;
  if (link === null) return null;
  return (
    <TouchableOpacity
      style={[styles.button, layout === 'row' ? styles.row : styles.stack]}
      onPress={() => {
        Share.share({ message: t(twinTelegramShareWords(kind, link)) }).catch((): void => undefined);
      }}
      accessibilityRole="button"
      accessibilityLabel={t({ en: 'Forward as a Telegram link', zh: '转发 Telegram 链接' })}
      testID={testID}
    >
      <Text style={styles.text}>Telegram</Text>
    </TouchableOpacity>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    button: { minHeight: 36, paddingHorizontal: 14, borderRadius: 10, borderWidth: 1, borderColor: c.accent, alignItems: 'center', justifyContent: 'center' },
    row: { marginLeft: 8 },
    stack: { alignSelf: 'flex-start', marginTop: 8 },
    text: { color: c.accent, fontSize: 13, fontWeight: '700' },
  });
