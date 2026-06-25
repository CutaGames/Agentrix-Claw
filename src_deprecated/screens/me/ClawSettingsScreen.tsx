import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, Alert } from 'react-native';
import { colors } from '../../theme/colors';
import { useAuthStore } from '../../stores/authStore';

const SETTING_GROUPS = [
  {
    title: 'Agent',
    items: [
      { id: 'lang', icon: '🌐', label: 'Language', value: 'English' },
      { id: 'notify', icon: '🔔', label: 'Notifications', value: 'On' },
      { id: 'theme', icon: '🎨', label: 'Theme', value: 'Dark' },
    ],
  },
  {
    title: 'Developer',
    items: [
      { id: 'api', icon: '🔑', label: 'API Keys', value: '' },
      { id: 'logs', icon: '📋', label: 'Debug Logs', value: '' },
    ],
  },
  {
    title: 'About',
    items: [
      { id: 'version', icon: 'ℹ️', label: 'App Version', value: '1.0.0' },
      { id: 'terms', icon: '📜', label: 'Terms of Service', value: '' },
      { id: 'privacy', icon: '🔒', label: 'Privacy Policy', value: '' },
    ],
  },
];

export function ClawSettingsScreen() {
  const clearAuth = useAuthStore((s) => s.clearAuth);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {SETTING_GROUPS.map((group) => (
        <View key={group.title} style={styles.group}>
          <Text style={styles.groupTitle}>{group.title}</Text>
          <View style={styles.groupItems}>
            {group.items.map((item, i) => (
              <TouchableOpacity
                key={item.id}
                style={[styles.item, i < group.items.length - 1 && styles.itemBorder]}
              >
                <Text style={styles.itemIcon}>{item.icon}</Text>
                <Text style={styles.itemLabel}>{item.label}</Text>
                {item.value ? <Text style={styles.itemValue}>{item.value}</Text> : null}
                <Text style={styles.itemArrow}>›</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      ))}

      <TouchableOpacity
        style={styles.dangerBtn}
        onPress={() => Alert.alert('Sign Out', 'Are you sure?', [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Sign Out', style: 'destructive', onPress: clearAuth },
        ])}
      >
        <Text style={styles.dangerBtnText}>Sign Out</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgPrimary },
  content: { padding: 16, paddingBottom: 40, gap: 20 },
  group: { gap: 8 },
  groupTitle: { fontSize: 12, fontWeight: '700', color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5, paddingLeft: 4 },
  groupItems: { backgroundColor: colors.bgCard, borderRadius: 14, overflow: 'hidden', borderWidth: 1, borderColor: colors.border },
  item: { flexDirection: 'row', alignItems: 'center', padding: 14, gap: 12 },
  itemBorder: { borderBottomWidth: 1, borderBottomColor: colors.border },
  itemIcon: { fontSize: 18, width: 26 },
  itemLabel: { flex: 1, fontSize: 15, color: colors.textPrimary },
  itemValue: { fontSize: 13, color: colors.textMuted },
  itemArrow: { fontSize: 20, color: colors.textMuted },
  dangerBtn: { alignItems: 'center', padding: 14, backgroundColor: colors.bgCard, borderRadius: 14, borderWidth: 1, borderColor: colors.error + '55' },
  dangerBtnText: { color: colors.error, fontWeight: '700', fontSize: 15 },
});
