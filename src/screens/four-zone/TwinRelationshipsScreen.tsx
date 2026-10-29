/**
 * TwinRelationshipsScreen — 分身 → 关系簿 (L8 R4; relationshipBook.ts). Only in builds with
 * `EXPO_PUBLIC_RELATIONSHIP_BOOK=1`. The people the owner has dealt with, newest contact first, with a tier label the
 * owner can set. It is the owner's private record: nothing here is shown to visitors or to the public twin. The tier is a
 * label and gives the other side no permission. Contact details are fetched only when one person is opened.
 */
import React, { useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useI18n } from '../../stores/i18nStore';
import { useThemedStyles, type Palette } from '../../theme/useTheme';
import {
  RELATIONSHIP_SOURCE_COPY_V1,
  RELATIONSHIP_TIERS_V1,
  RELATIONSHIP_TIER_COPY_V1,
  RELATIONSHIP_VERIFICATION_COPY_V1,
  relationshipOpenItemsLabelV1,
  type RelationshipContactViewV1,
  type RelationshipTierV1,
} from '../../../shared/types/relationship-book';
import { RELATIONSHIP_BOOK_FAILURE_COPY, RelationshipBookError } from '../../services/relationshipBook';
import { mobileRelationshipBookClient } from '../../services/relationshipBookSession';

export const relationshipBookQueryKey = ['four-zone', 'relationship-book'] as const;
const failureOf = (error: unknown) => (error instanceof RelationshipBookError ? error.failure : 'unavailable');

export function TwinRelationshipsScreen() {
  const { t, language } = useI18n();
  const lang: 'zh' | 'en' = language === 'zh' ? 'zh' : 'en';
  const styles = useThemedStyles(makeStyles);
  const queryClient = useQueryClient();
  const [notice, setNotice] = useState('');
  const [open, setOpen] = useState<RelationshipContactViewV1 | null>(null);
  const book = useQuery({ queryKey: relationshipBookQueryKey, queryFn: () => mobileRelationshipBookClient().list(), retry: 0, staleTime: 15_000 });
  const refresh = () => void queryClient.invalidateQueries({ queryKey: relationshipBookQueryKey });
  const view = useMutation({
    mutationFn: (contactRef: string) => mobileRelationshipBookClient().get(contactRef),
    onSuccess: setOpen,
    onError: (error: unknown) => setNotice(t(RELATIONSHIP_BOOK_FAILURE_COPY[failureOf(error)])),
  });
  const setTier = useMutation({
    mutationFn: ({ contactRef, tier }: { contactRef: string; tier: RelationshipTierV1 | null }) => mobileRelationshipBookClient().setTier(contactRef, tier),
    onSuccess: (updated) => setOpen((current) => (current && current.contactRef === updated.contactRef ? updated : current)),
    onError: (error: unknown) => setNotice(t(RELATIONSHIP_BOOK_FAILURE_COPY[failureOf(error)])),
    onSettled: refresh,
  });
  const busy = view.isPending || setTier.isPending;
  const when = (iso: string) => new Date(iso).toLocaleDateString(language === 'zh' ? 'zh-CN' : 'en-US', { year: 'numeric', month: 'short', day: 'numeric' });

  if (book.isLoading) return <ActivityIndicator />;
  if (book.isError) {
    return (
      <View style={styles.screen} testID="twin-relationships-screen">
        <Text style={styles.muted}>{t(RELATIONSHIP_BOOK_FAILURE_COPY[failureOf(book.error)])}</Text>
      </View>
    );
  }
  const items = book.data ?? [];
  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={book.isRefetching} onRefresh={() => void book.refetch()} />}
      testID="twin-relationships-screen"
    >
      <Text style={styles.title} accessibilityRole="header">{t({ en: 'Relationship book', zh: '关系簿' })}</Text>
      <Text style={styles.muted}>
        {t({
          en: 'Everyone you have dealt with. Only you can see this; your twin never uses it to answer visitors. A tier is a label for you and gives the other side no permission.',
          zh: '你打过交道的人。只有你看得到，分身不会拿它去回答访客。档位只是你的标签，不会让对方多得到任何权限。',
        })}
      </Text>
      {items.length === 0 ? <Text style={styles.muted}>{t({ en: 'No one yet. New visitors, bookings and requests show up here.', zh: '还没有人。新来的访客、预约和请求会出现在这里。' })}</Text> : null}
      {items.map((item) => (
        <TouchableOpacity key={item.contactRef} style={styles.card} onPress={() => view.mutate(item.contactRef)} disabled={busy} accessibilityRole="button" testID={`twin-relationship-${item.contactRef}`}>
          <Text style={styles.cardTitle}>{item.displayName ?? t({ en: '(no name)', zh: '（没留名字）' })}</Text>
          <Text style={styles.detail}>
            {`${item.tier ? t(RELATIONSHIP_TIER_COPY_V1[item.tier]) : t({ en: 'Not sorted', zh: '没分档' })} · ${t(RELATIONSHIP_SOURCE_COPY_V1[item.sourceKind])} · ${when(item.lastContactAt)}`}
          </Text>
          {item.openItems.length > 0 ? <Text style={styles.detail}>{`${t({ en: 'Still open: ', zh: '没结的事：' })}${relationshipOpenItemsLabelV1(item.openItems, lang)}`}</Text> : null}
        </TouchableOpacity>
      ))}
      {open ? (
        <View style={styles.card} testID="twin-relationship-detail">
          <Text style={styles.cardTitle}>{open.displayName ?? t({ en: '(no name)', zh: '（没留名字）' })}</Text>
          <Text style={styles.detail}>{t(RELATIONSHIP_VERIFICATION_COPY_V1[open.verification])}</Text>
          {open.contactState === 'unreadable' ? <Text style={styles.detail}>{t({ en: 'The contact details are sealed and cannot be opened right now.', zh: '联系方式已加密，现在打不开。' })}</Text> : null}
          {open.contact?.email ? <Text style={styles.detail} selectable>{open.contact.email}</Text> : null}
          {open.contact?.phone ? <Text style={styles.detail} selectable>{open.contact.phone}</Text> : null}
          {open.contact?.other ? <Text style={styles.detail} selectable>{open.contact.other}</Text> : null}
          {open.contact?.visitorMessage ? <Text style={styles.detail}>{`${t({ en: 'Their message: ', zh: '对方留言：' })}${open.contact.visitorMessage}`}</Text> : null}
          {open.ownerNote ? <Text style={styles.detail}>{`${t({ en: 'My note: ', zh: '我的备注：' })}${open.ownerNote}`}</Text> : null}
          <View style={styles.actions}>
            {RELATIONSHIP_TIERS_V1.map((tier) => (
              <TouchableOpacity
                key={tier}
                style={[styles.button, open.tier === tier ? styles.buttonOn : null]}
                onPress={() => setTier.mutate({ contactRef: open.contactRef, tier: open.tier === tier ? null : tier })}
                disabled={busy}
                accessibilityRole="button"
                accessibilityState={{ selected: open.tier === tier }}
                testID={`twin-relationship-tier-${tier}`}
              >
                <Text style={styles.buttonText}>{t(RELATIONSHIP_TIER_COPY_V1[tier])}</Text>
              </TouchableOpacity>
            ))}
            <TouchableOpacity style={styles.button} onPress={() => setOpen(null)} accessibilityRole="button">
              <Text style={styles.buttonText}>{t({ en: 'Close', zh: '关上' })}</Text>
            </TouchableOpacity>
          </View>
          <Text style={styles.muted}>{t({ en: 'Notes and deleting a person are on the web for now.', zh: '写备注和删除一个人，现在在网页上做。' })}</Text>
        </View>
      ) : null}
      {notice ? <Text style={styles.muted} testID="twin-relationships-notice">{notice}</Text> : null}
    </ScrollView>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: c.bgPrimary },
    content: { padding: 16, gap: 10 },
    title: { color: c.textPrimary, fontSize: 20, fontWeight: '800' },
    muted: { color: c.textMuted, fontSize: 13, lineHeight: 19 },
    card: { backgroundColor: c.bgCard, borderColor: c.border, borderWidth: 1, borderRadius: 14, padding: 14, gap: 6 },
    cardTitle: { color: c.textPrimary, fontSize: 15, fontWeight: '700' },
    detail: { color: c.textSecondary, fontSize: 13, lineHeight: 19 },
    actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 6 },
    button: { minHeight: 44, paddingHorizontal: 14, borderRadius: 12, borderWidth: 1, borderColor: c.border, alignItems: 'center', justifyContent: 'center' },
    buttonOn: { borderColor: c.accent },
    buttonText: { color: c.textPrimary, fontSize: 14, fontWeight: '700' },
  });
