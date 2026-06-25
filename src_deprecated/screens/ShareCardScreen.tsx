import React from 'react';
import { ScrollView, SafeAreaView, StyleSheet } from 'react-native';
import { useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import { ShareCardView } from '../components/ShareCardView';
import { useAuthStore } from '../stores/authStore';
import { colors } from '../theme/colors';
import type { MeStackParamList } from '../navigation/types';

type RouteT = RouteProp<MeStackParamList, 'ShareCard'>;

export function ShareCardScreen() {
  const route = useRoute<RouteT>();
  const { shareUrl, title, userName } = route.params;
  const user = useAuthStore((s) => s.user);

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <ShareCardView
          shareUrl={shareUrl}
          title={title ?? 'ClawLink'}
          userName={userName ?? user?.nickname ?? user?.email}
        />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bgPrimary },
  scroll: { flexGrow: 1, justifyContent: 'center', paddingVertical: 24 },
});
