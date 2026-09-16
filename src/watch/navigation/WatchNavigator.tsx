import React, { useRef, useState, useCallback } from 'react';
import {
  View,
  ScrollView,
  StyleSheet,
  Dimensions,
  NativeSyntheticEvent,
  NativeScrollEvent,
} from 'react-native';
import { watchColors } from '../theme/watchColors';
import { WatchHomeScreen } from '../screens/WatchHomeScreen';
import { WatchChatScreen } from '../screens/WatchChatScreen';
import { WatchHealthScreen } from '../screens/WatchHealthScreen';
import { WatchAlertsScreen } from '../screens/WatchAlertsScreen';
import { WatchSettingsScreen } from '../screens/WatchSettingsScreen';

const { width } = Dimensions.get('window');

const SCREENS = [
  { key: 'home', component: WatchHomeScreen },
  { key: 'chat', component: WatchChatScreen },
  { key: 'health', component: WatchHealthScreen },
  { key: 'alerts', component: WatchAlertsScreen },
  { key: 'settings', component: WatchSettingsScreen },
] as const;

/**
 * Horizontal pager — swipe left/right to switch between screens.
 * Dots indicator at the bottom.
 */
export function WatchNavigator() {
  const scrollRef = useRef<ScrollView>(null);
  const [activeIdx, setActiveIdx] = useState(0);

  const onMomentumEnd = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const idx = Math.round(e.nativeEvent.contentOffset.x / width);
      setActiveIdx(idx);
    },
    [],
  );

  return (
    <View style={styles.container}>
      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={onMomentumEnd}
        style={styles.pager}
      >
        {SCREENS.map(({ key, component: Screen }) => (
          <View key={key} style={styles.page}>
            <Screen />
          </View>
        ))}
      </ScrollView>

      {/* Dot indicators */}
      <View style={styles.dots}>
        {SCREENS.map((s, i) => (
          <View
            key={s.key}
            style={[styles.dot, i === activeIdx && styles.dotActive]}
          />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: watchColors.bg,
  },
  pager: {
    flex: 1,
  },
  page: {
    width,
    flex: 1,
  },
  dots: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingBottom: 8,
    gap: 6,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: watchColors.textMuted,
  },
  dotActive: {
    backgroundColor: watchColors.accent,
    width: 8,
    height: 8,
    borderRadius: 4,
  },
});
