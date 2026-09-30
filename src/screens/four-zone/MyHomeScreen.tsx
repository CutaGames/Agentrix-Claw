/**
 * MyHomeScreen — 我的 zone root in the four-zone IA (M1-d).
 *
 * Replaces the legacy Profile menu (38 routes, product doc 5.1) with the
 * catalog's `my` tabs only. Product doc 5.4: the first three are 带入与备份,
 * 设备 and 钱包. Tabs not built on the phone open the honest notice.
 */
import React from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useI18n } from '../../stores/i18nStore';
import { useAuthStore } from '../../stores/authStore';
import { useThemedStyles, type Palette } from '../../theme/useTheme';
import { NAV_CATALOG } from '../../navigation/navCatalog';
import { ZONE_UNAVAILABLE_ROUTE, fourZoneTarget } from '../../navigation/four-zone/fourZoneRoutes';
import { MY_HOME_FEATURED_TABS, myHomeTabOrder } from '../../navigation/four-zone/myHome';

export function MyHomeScreen() {
  const { t } = useI18n();
  const styles = useThemedStyles(makeStyles);
  const navigation = useNavigation<any>();
  const user = useAuthStore((state) => state.user);
  const tabs = myHomeTabOrder();

  const open = (tab: string) => {
    const target = fourZoneTarget('my', tab);
    if (target === 'unavailable') {
      navigation.navigate(ZONE_UNAVAILABLE_ROUTE, { zone: 'my', tab });
      return;
    }
    navigation.navigate(target.screen, { tab });
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content} testID="my-home-screen">
      <Text style={styles.title} accessibilityRole="header">
        {t(NAV_CATALOG.my.label)}
      </Text>
      {user?.email || user?.nickname ? <Text style={styles.meta}>{user?.nickname || user?.email}</Text> : null}
      {tabs.map((tab) => {
        const featured = (MY_HOME_FEATURED_TABS as readonly string[]).includes(tab.id);
        return (
          <TouchableOpacity
            key={tab.id}
            style={[styles.row, featured && styles.rowFeatured]}
            onPress={() => open(tab.id)}
            accessibilityRole="button"
            accessibilityLabel={t(tab.label)}
            testID={`my-tab-${tab.id}`}
          >
            <Text style={[styles.rowLabel, featured && styles.rowLabelFeatured]}>{t(tab.label)}</Text>
            <View>
              <Text style={styles.chevron}>›</Text>
            </View>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: c.bgPrimary },
    content: { padding: 20, gap: 10 },
    title: { color: c.textPrimary, fontSize: 26, fontWeight: '800' },
    meta: { color: c.textMuted, fontSize: 13, marginBottom: 6 },
    row: {
      minHeight: 52,
      backgroundColor: c.bgCard,
      borderColor: c.border,
      borderWidth: 1,
      borderRadius: 14,
      paddingHorizontal: 16,
      paddingVertical: 12,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    rowFeatured: { minHeight: 64 },
    rowLabel: { color: c.textPrimary, fontSize: 15, fontWeight: '600' },
    rowLabelFeatured: { fontSize: 17, fontWeight: '700' },
    chevron: { color: c.textMuted, fontSize: 20 },
  });
