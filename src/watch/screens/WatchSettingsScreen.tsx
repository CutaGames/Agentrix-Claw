import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Switch,
} from 'react-native';
import { watchColors } from '../theme/watchColors';
import { watchLayout } from '../theme/watchLayout';

type SyncInterval = 30 | 60 | 300;

export function WatchSettingsScreen() {
  const [syncInterval, setSyncInterval] = useState<SyncInterval>(60);
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [hapticEnabled, setHapticEnabled] = useState(true);
  const [isLoggedIn] = useState(false); // MVP: placeholder

  const intervalOptions: { value: SyncInterval; label: string }[] = [
    { value: 30, label: '30秒' },
    { value: 60, label: '1分钟' },
    { value: 300, label: '5分钟' },
  ];

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <Text style={styles.title}>设置</Text>

      {/* Login Status */}
      <View style={styles.section}>
        <Text style={styles.sectionLabel}>账户</Text>
        <View style={styles.row}>
          <Text style={styles.rowLabel}>状态</Text>
          <Text style={[styles.rowValue, { color: isLoggedIn ? watchColors.success : watchColors.warning }]}>
            {isLoggedIn ? '已登录' : '未登录'}
          </Text>
        </View>
        {!isLoggedIn && (
          <TouchableOpacity style={styles.loginBtn}>
            <Text style={styles.loginBtnText}>扫码登录</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Sync Interval */}
      <View style={styles.section}>
        <Text style={styles.sectionLabel}>同步间隔</Text>
        <View style={styles.chips}>
          {intervalOptions.map((opt) => (
            <TouchableOpacity
              key={opt.value}
              style={[
                styles.chip,
                syncInterval === opt.value && styles.chipActive,
              ]}
              onPress={() => setSyncInterval(opt.value)}
            >
              <Text
                style={[
                  styles.chipText,
                  syncInterval === opt.value && styles.chipTextActive,
                ]}
              >
                {opt.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Notifications */}
      <View style={styles.section}>
        <Text style={styles.sectionLabel}>通知</Text>
        <View style={styles.toggleRow}>
          <Text style={styles.rowLabel}>告警通知</Text>
          <Switch
            value={notificationsEnabled}
            onValueChange={setNotificationsEnabled}
            trackColor={{ false: watchColors.textMuted, true: watchColors.primary }}
            thumbColor={watchColors.text}
          />
        </View>
        <View style={styles.toggleRow}>
          <Text style={styles.rowLabel}>震动反馈</Text>
          <Switch
            value={hapticEnabled}
            onValueChange={setHapticEnabled}
            trackColor={{ false: watchColors.textMuted, true: watchColors.primary }}
            thumbColor={watchColors.text}
          />
        </View>
      </View>

      {/* About */}
      <View style={styles.section}>
        <Text style={styles.sectionLabel}>关于</Text>
        <View style={styles.row}>
          <Text style={styles.rowLabel}>版本</Text>
          <Text style={styles.rowValue}>v0.1.0-watch</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.rowLabel}>平台</Text>
          <Text style={styles.rowValue}>Wear OS</Text>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: watchColors.bg,
  },
  content: {
    padding: watchLayout.safePadding,
    minHeight: watchLayout.screenHeight,
  },
  title: {
    color: watchColors.textSecondary,
    fontSize: watchLayout.fontCaption,
    textAlign: 'center',
    marginBottom: watchLayout.gapLg,
  },
  section: {
    marginBottom: watchLayout.gapLg,
  },
  sectionLabel: {
    color: watchColors.accent,
    fontSize: watchLayout.fontMicro,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: watchLayout.gap,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
  },
  rowLabel: {
    color: watchColors.text,
    fontSize: watchLayout.fontCaption,
  },
  rowValue: {
    color: watchColors.textSecondary,
    fontSize: watchLayout.fontCaption,
  },
  toggleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4,
  },
  loginBtn: {
    backgroundColor: watchColors.primary,
    borderRadius: watchLayout.radiusFull,
    paddingVertical: 10,
    alignItems: 'center',
    marginTop: watchLayout.gap,
  },
  loginBtnText: {
    color: watchColors.text,
    fontSize: watchLayout.fontCaption,
    fontWeight: '600',
  },
  chips: {
    flexDirection: 'row',
    gap: 6,
  },
  chip: {
    flex: 1,
    backgroundColor: watchColors.surface,
    borderRadius: watchLayout.radiusFull,
    paddingVertical: 8,
    alignItems: 'center',
  },
  chipActive: {
    backgroundColor: watchColors.primary,
  },
  chipText: {
    color: watchColors.textSecondary,
    fontSize: watchLayout.fontMicro,
  },
  chipTextActive: {
    color: watchColors.text,
    fontWeight: '600',
  },
});
