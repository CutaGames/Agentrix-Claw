import React from 'react';
import { ScrollView, SafeAreaView, StyleSheet } from 'react-native';
import { useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import { ShareCardView } from '../components/ShareCardView';
import { useAuthStore } from '../stores/authStore';
import { colors } from '../theme/colors';
import type { ShareCardRouteParams } from '../navigation/types';

type RouteT = RouteProp<Record<'ShareCard', ShareCardRouteParams>, 'ShareCard'>;

export function ShareCardScreen() {
  const route = useRoute<RouteT>();
  const {
    shareUrl,
    title,
    userName,
    subtitle,
    headerEmoji,
    categoryLabel,
    priceLabel,
    statsLabel,
    description,
    tags,
    ctaLabel,
    accentFrom,
    accentTo,
  } = route.params;
  const user = useAuthStore((s) => s.user);

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <ShareCardView
          shareUrl={shareUrl}
          title={title ?? 'Agentrix Claw'}
          subtitle={subtitle}
          headerEmoji={headerEmoji}
          userName={userName ?? user?.nickname ?? user?.email}
          categoryLabel={categoryLabel}
          priceLabel={priceLabel}
          statsLabel={statsLabel}
          description={description}
          tags={tags}
          ctaLabel={ctaLabel}
          accentFrom={accentFrom}
          accentTo={accentTo}
        />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bgPrimary },
  scroll: { flexGrow: 1, justifyContent: 'center', paddingVertical: 24 },
});
