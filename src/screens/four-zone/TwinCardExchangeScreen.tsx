/**
 * TwinCardExchangeScreen — 分身 → 交换名片 (L8 R6; cardExchange.ts). Only in builds with `EXPO_PUBLIC_CARD_EXCHANGE=1`
 * (and the relationship book on). Pick the name you want to show and, if you like, an event label and where you are;
 * the code then shows full screen (TwinQrScreen) for the other person to scan. Nothing reaches either relationship book
 * until both of you have seen who the other is and confirmed. No contact details are exchanged.
 */
import React, { useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, TouchableOpacity } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useMutation } from '@tanstack/react-query';
import { APP_URL } from '../../config/env';
import { useI18n } from '../../stores/i18nStore';
import { useThemedStyles, type Palette } from '../../theme/useTheme';
import { RELATIONSHIP_LIMITS_V1 } from '../../../shared/types/relationship-book';
import { CARD_EXCHANGE_FAILURE_COPY, CardExchangeError } from '../../services/cardExchange';
import { mobileCardExchangeClient } from '../../services/cardExchangeSession';

const failureOf = (error: unknown) => (error instanceof CardExchangeError ? error.failure : 'unavailable');

export function TwinCardExchangeScreen() {
  const { t } = useI18n();
  const styles = useThemedStyles(makeStyles);
  const navigation = useNavigation<{ navigate: (name: 'TwinQr', params: { link: string; name?: string | null; headline?: string | null; exchangeRef: string }) => void }>();
  const [name, setName] = useState('');
  const [place, setPlace] = useState('');
  const [eventTag, setEventTag] = useState('');
  const start = useMutation({
    mutationFn: () =>
      mobileCardExchangeClient().create(APP_URL, {
        ...(name.trim() ? { displayName: name.trim() } : {}),
        ...(place.trim() ? { metNote: place.trim() } : {}),
        ...(eventTag.trim() ? { eventTag: eventTag.trim() } : {}),
      }),
    onSuccess: (created) => navigation.navigate('TwinQr', { link: created.link, name: name.trim() || null, headline: eventTag.trim() || null, exchangeRef: created.exchangeRef }),
  });

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content} testID="twin-card-exchange-screen" keyboardShouldPersistTaps="handled">
      <Text style={styles.title} accessibilityRole="header">{t({ en: 'Swap cards', zh: '交换名片' })}</Text>
      <Text style={styles.muted}>
        {t({
          en: 'Show a code; the other person scans it and signs in. You each see who the other is and confirm. Only then does each relationship book get one entry: where you met and the event, no contact details.',
          zh: '出示一个码，对方扫码并登录。双方都看清楚对方是谁并确认以后，各自的关系簿才会记一条：在哪认识、哪个活动，不交换联系方式。',
        })}
      </Text>
      <Text style={styles.label}>{t({ en: 'The name to show them (optional)', zh: '给对方看的名字（选填）' })}</Text>
      <TextInput style={styles.input} value={name} onChangeText={setName} maxLength={RELATIONSHIP_LIMITS_V1.displayNameMax} accessibilityLabel={t({ en: 'The name to show them', zh: '给对方看的名字' })} testID="card-exchange-name" />
      <Text style={styles.label}>{t({ en: 'Where we are (optional)', zh: '在哪认识（选填）' })}</Text>
      <TextInput style={styles.input} value={place} onChangeText={setPlace} maxLength={RELATIONSHIP_LIMITS_V1.metNoteMax} accessibilityLabel={t({ en: 'Where we are', zh: '在哪认识' })} testID="card-exchange-place" />
      <Text style={styles.label}>{t({ en: 'Event label (optional)', zh: '活动标签（选填）' })}</Text>
      <TextInput style={styles.input} value={eventTag} onChangeText={setEventTag} maxLength={RELATIONSHIP_LIMITS_V1.eventTagMax} accessibilityLabel={t({ en: 'Event label', zh: '活动标签' })} testID="card-exchange-event" />
      <TouchableOpacity style={styles.button} onPress={() => start.mutate()} disabled={start.isPending} accessibilityRole="button" testID="card-exchange-start">
        <Text style={styles.buttonText}>{t({ en: 'Show my code', zh: '出示我的码' })}</Text>
      </TouchableOpacity>
      {start.isError ? <Text style={styles.muted} testID="card-exchange-error">{t(CARD_EXCHANGE_FAILURE_COPY[failureOf(start.error)])}</Text> : null}
    </ScrollView>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: c.bgPrimary },
    content: { padding: 16, gap: 10 },
    title: { color: c.textPrimary, fontSize: 20, fontWeight: '800' },
    muted: { color: c.textMuted, fontSize: 13, lineHeight: 19 },
    label: { color: c.textSecondary, fontSize: 13, fontWeight: '600', marginTop: 6 },
    input: { minHeight: 44, borderRadius: 12, borderWidth: 1, borderColor: c.border, paddingHorizontal: 12, color: c.textPrimary, backgroundColor: c.bgCard },
    button: { minHeight: 44, marginTop: 12, borderRadius: 12, backgroundColor: c.accent, alignItems: 'center', justifyContent: 'center' },
    buttonText: { color: c.onAccent, fontSize: 15, fontWeight: '700' },
  });
