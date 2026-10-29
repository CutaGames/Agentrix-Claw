/**
 * CardExchangePanel — under the QR code on TwinQrScreen when the code is a card-exchange code (L8 R6). Polls the exchange
 * while it waits, shows who scanned, and lets the person confirm or call it off. Nothing reaches either relationship
 * book until both people have confirmed. Only in builds with `EXPO_PUBLIC_CARD_EXCHANGE=1`.
 */
import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useI18n } from '../stores/i18nStore';
import { CARD_EXCHANGE_STATE_COPY_V1, type CardExchangeViewV1 } from '../../shared/types/card-exchange';
import { CARD_EXCHANGE_FAILURE_COPY, CardExchangeError } from '../services/cardExchange';
import { mobileCardExchangeClient } from '../services/cardExchangeSession';

const failureOf = (error: unknown) => (error instanceof CardExchangeError ? error.failure : 'unavailable');

export function CardExchangePanel({ exchangeRef }: { exchangeRef: string }) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const key = ['card-exchange', exchangeRef] as const;
  const status = useQuery({
    queryKey: key,
    queryFn: () => mobileCardExchangeClient().get(exchangeRef),
    retry: 0,
    // Poll while it can still change.
    refetchInterval: (query) => {
      const state = (query.state.data as CardExchangeViewV1 | undefined)?.state;
      return state === 'open' || state === 'claimed' ? 3000 : false;
    },
  });
  const settle = (view: CardExchangeViewV1) => queryClient.setQueryData(key, view);
  const confirm = useMutation({ mutationFn: () => mobileCardExchangeClient().confirm(exchangeRef), onSuccess: settle });
  const cancel = useMutation({ mutationFn: () => mobileCardExchangeClient().cancel(exchangeRef), onSuccess: settle });
  const busy = confirm.isPending || cancel.isPending;
  const error = status.error ?? confirm.error ?? cancel.error;
  const view = status.data;

  return (
    <View style={styles.panel} testID="card-exchange-panel">
      {view ? (
        <>
          <Text style={styles.state} accessibilityRole="header">{t(CARD_EXCHANGE_STATE_COPY_V1[view.state])}</Text>
          {view.counterpartPresent ? (
            <Text style={styles.line}>{`${t({ en: 'With: ', zh: '对方：' })}${view.counterpartName ?? t({ en: '(no name shown)', zh: '（没留名字）' })}`}</Text>
          ) : null}
          {view.state === 'claimed' && view.theyConfirmed ? <Text style={styles.line}>{t({ en: 'They have confirmed.', zh: '对方已确认。' })}</Text> : null}
          {view.state === 'confirmed' ? (
            <Text style={styles.line}>
              {view.recorded
                ? t({ en: 'Added to both relationship books.', zh: '已经记进双方的关系簿。' })
                : t({ en: 'Confirmed. Adding to the books…', zh: '已确认，正在记进关系簿…' })}
            </Text>
          ) : null}
          {view.state === 'claimed' || view.state === 'open' ? (
            <View style={styles.actions}>
              {view.state === 'claimed' && !view.youConfirmed ? (
                <TouchableOpacity style={styles.primary} onPress={() => confirm.mutate()} disabled={busy} accessibilityRole="button" testID="card-exchange-confirm">
                  <Text style={styles.primaryText}>{t({ en: 'This is them, confirm', zh: '核对无误，确认' })}</Text>
                </TouchableOpacity>
              ) : null}
              {view.state === 'claimed' && view.youConfirmed ? <Text style={styles.line}>{t({ en: 'You confirmed. Waiting for them.', zh: '你已确认，等对方确认。' })}</Text> : null}
              <TouchableOpacity style={styles.secondary} onPress={() => cancel.mutate()} disabled={busy} accessibilityRole="button" testID="card-exchange-cancel">
                <Text style={styles.secondaryText}>{t({ en: 'Call it off', zh: '取消' })}</Text>
              </TouchableOpacity>
            </View>
          ) : null}
        </>
      ) : null}
      {error ? <Text style={styles.line} testID="card-exchange-notice">{t(CARD_EXCHANGE_FAILURE_COPY[failureOf(error)])}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  panel: { marginTop: 16, alignSelf: 'stretch', gap: 6, alignItems: 'center' },
  state: { color: '#ffffff', fontSize: 15, fontWeight: '700' },
  line: { color: '#cbd5e1', fontSize: 13, textAlign: 'center' },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, justifyContent: 'center', marginTop: 6 },
  primary: { minHeight: 44, paddingHorizontal: 16, borderRadius: 12, backgroundColor: '#0a84c6', alignItems: 'center', justifyContent: 'center' },
  primaryText: { color: '#ffffff', fontSize: 14, fontWeight: '700' },
  secondary: { minHeight: 44, paddingHorizontal: 16, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.12)', alignItems: 'center', justifyContent: 'center' },
  secondaryText: { color: '#ffffff', fontSize: 14, fontWeight: '600' },
});
