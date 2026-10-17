/**
 * ZoneUnavailableScreen — honest notice for a catalog tab that is not built
 * on the phone yet (product doc 5.6 "不可用就显示不可用"). Never shows guessed
 * or placeholder data.
 *
 * M1-i: also the "this link no longer works" page for old deep links in the
 * four-zone IA (`reason: link_retired | link_unknown`, a fixed code; nothing
 * from the link itself is shown).
 */
import React from 'react';
import { Linking, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useI18n } from '../../stores/i18nStore';
import { useThemedStyles, type Palette } from '../../theme/useTheme';
import { NAV_CATALOG, isNavTab, isNavZoneId } from '../../navigation/navCatalog';
import { isFourZoneLinkNoticeReason } from '../../navigation/four-zone/fourZoneLegacyLinks';
import { getZoneWebUrl } from '../../services/webHandoff';

export function ZoneUnavailableScreen() {
  const { t } = useI18n();
  const styles = useThemedStyles(makeStyles);
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const zone = isNavZoneId(route.params?.zone) ? route.params.zone : null;
  const tab = zone && isNavTab(zone, route.params?.tab) ? route.params.tab : null;
  const zoneLabel = zone ? t(NAV_CATALOG[zone].label) : '';
  const tabLabel = zone && tab ? t(NAV_CATALOG[zone].tabs.find((item) => item.id === tab)!.label) : '';
  const linkReason = !zone && isFourZoneLinkNoticeReason(route.params?.reason) ? route.params.reason : null;
  // M1-j: a tab Web already serves can be opened there (shared `/go/` link, no ref carried).
  const webUrl = zone && tab ? getZoneWebUrl(zone, tab) : null;
  if (linkReason) {
    return (
      <View style={styles.screen} testID="zone-link-notice-screen">
        <Text style={styles.title} accessibilityRole="header">
          {t({ en: 'This link no longer works', zh: '这个链接已失效' })}
        </Text>
        <Text style={styles.body} testID={`zone-link-notice-${linkReason}`}>
          {linkReason === 'link_retired'
            ? t({
                en: 'It points to a feature that has been taken down. Nothing was opened or started.',
                zh: '它指向的功能已经下线。没有打开任何页面，也没有启动任何操作。',
              })
            : t({
                en: 'The app does not recognise this link. Nothing was opened or started.',
                zh: 'App 识别不了这个链接。没有打开任何页面，也没有启动任何操作。',
              })}
        </Text>
        <TouchableOpacity
          style={styles.button}
          onPress={() => navigation.goBack()}
          accessibilityRole="button"
          accessibilityLabel={t({ en: 'Go back', zh: '返回' })}
        >
          <Text style={styles.buttonText}>{t({ en: 'Go back', zh: '返回' })}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.screen} testID="zone-unavailable-screen">
      <Text style={styles.title} accessibilityRole="header">
        {tabLabel || t({ en: 'Not available yet', zh: '暂未开放' })}
      </Text>
      {zoneLabel ? <Text style={styles.meta}>{zoneLabel}</Text> : null}
      <Text style={styles.body}>
        {t({
          en: 'This part is not on the phone yet. Nothing was started and no data is shown in its place.',
          zh: '这部分还没有上线到手机。没有启动任何操作，也不会用示例数据代替。',
        })}
      </Text>
      {webUrl ? (
        <TouchableOpacity
          style={styles.primary}
          onPress={() => void Linking.openURL(webUrl).catch(() => undefined)}
          accessibilityRole="button"
          accessibilityLabel={t({ en: 'Open on the web', zh: '在网页上打开' })}
          testID="zone-unavailable-open-web"
        >
          <Text style={styles.primaryText}>{t({ en: 'Open on the web', zh: '在网页上打开' })}</Text>
        </TouchableOpacity>
      ) : null}
      <TouchableOpacity
        style={styles.button}
        onPress={() => navigation.goBack()}
        accessibilityRole="button"
        accessibilityLabel={t({ en: 'Go back', zh: '返回' })}
      >
        <Text style={styles.buttonText}>{t({ en: 'Go back', zh: '返回' })}</Text>
      </TouchableOpacity>
    </View>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: c.bgPrimary, padding: 24, justifyContent: 'center', gap: 12 },
    title: { color: c.textPrimary, fontSize: 22, fontWeight: '800' },
    meta: { color: c.textMuted, fontSize: 13 },
    body: { color: c.textSecondary, fontSize: 15, lineHeight: 22 },
    button: {
      marginTop: 12,
      alignSelf: 'flex-start',
      backgroundColor: c.bgSecondary,
      borderColor: c.border,
      borderWidth: 1,
      borderRadius: 12,
      paddingHorizontal: 18,
      paddingVertical: 12,
      minHeight: 44,
      justifyContent: 'center',
    },
    buttonText: { color: c.textPrimary, fontSize: 14, fontWeight: '700' },
    primary: {
      marginTop: 12,
      alignSelf: 'flex-start',
      backgroundColor: c.primary,
      borderRadius: 12,
      paddingHorizontal: 18,
      paddingVertical: 12,
      minHeight: 44,
      justifyContent: 'center',
    },
    // Token pair: text on the primary fill is onAccent (11.4).
    primaryText: { color: c.onAccent, fontSize: 14, fontWeight: '800' },
  });
