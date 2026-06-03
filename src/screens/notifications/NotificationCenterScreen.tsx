import React, { useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  SafeAreaView, Alert,
} from 'react-native';
import { colors } from '../../theme/colors';
import { useNotificationStore, AppNotification } from '../../stores/notificationStore';

function typeIconAndColor(type: AppNotification['type']): { icon: string; color: string } {
  switch (type) {
    case 'agent_chat': return { icon: '🤖', color: '#00d4ff' };
    case 'skill_install': return { icon: '⚡', color: '#a855f7' };
    case 'payment': return { icon: '💳', color: '#22c55e' };
    case 'referral': return { icon: '🎁', color: '#f59e0b' };
    default: return { icon: '🔔', color: colors.textMuted };
  }
}

function timeAgo(ts: number): string {
  const diff = Math.floor((Date.now() - ts) / 1000);
  if (diff < 60) return 'Just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function NotificationItem({
  item,
  onMarkRead,
}: {
  item: AppNotification;
  onMarkRead: (id: string) => void;
}) {
  const { icon, color } = typeIconAndColor(item.type);
  return (
    <TouchableOpacity
      style={[styles.item, !item.read && styles.itemUnread]}
      onPress={() => onMarkRead(item.id)}
      activeOpacity={0.7}
    >
      <View style={[styles.iconContainer, { backgroundColor: color + '22' }]}>
        <Text style={styles.iconEmoji}>{icon}</Text>
      </View>
      <View style={styles.textBlock}>
        <View style={styles.titleRow}>
          <Text style={styles.itemTitle} numberOfLines={1}>{item.title}</Text>
          {!item.read && <View style={styles.unreadDot} />}
        </View>
        <Text style={styles.itemBody} numberOfLines={2}>{item.body}</Text>
        <Text style={styles.itemTime}>{timeAgo(item.createdAt)}</Text>
      </View>
    </TouchableOpacity>
  );
}

export function NotificationCenterScreen() {
  const { notifications, unreadCount, markRead, markAllRead, clearNotifications } = useNotificationStore();

  const handleMarkRead = useCallback((id: string) => markRead(id), [markRead]);

  const handleClearAll = () => {
    Alert.alert('Clear all notifications?', '', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Clear', style: 'destructive', onPress: clearNotifications },
    ]);
  };

  const renderEmpty = () => (
    <View style={styles.empty}>
      <Text style={styles.emptyIcon}>🔕</Text>
      <Text style={styles.emptyTitle}>No notifications yet</Text>
      <Text style={styles.emptyBody}>You're all caught up!</Text>
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Notifications</Text>
        <View style={styles.headerActions}>
          {unreadCount > 0 && (
            <TouchableOpacity style={styles.headerBtn} onPress={markAllRead}>
              <Text style={styles.headerBtnText}>Mark all read</Text>
            </TouchableOpacity>
          )}
          {notifications.length > 0 && (
            <TouchableOpacity style={styles.headerBtn} onPress={handleClearAll}>
              <Text style={[styles.headerBtnText, { color: '#ef4444' }]}>Clear</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Badge */}
      {unreadCount > 0 && (
        <View style={styles.unreadBanner}>
          <Text style={styles.unreadBannerText}>{unreadCount} unread</Text>
        </View>
      )}

      <FlatList
        data={notifications}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <NotificationItem item={item} onMarkRead={handleMarkRead} />}
        ListEmptyComponent={renderEmpty}
        contentContainerStyle={notifications.length === 0 ? { flex: 1 } : { paddingBottom: 32 }}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgPrimary },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border ?? '#2a3a52',
  },
  headerTitle: { color: colors.textPrimary, fontSize: 22, fontWeight: '700' },
  headerActions: { flexDirection: 'row', gap: 12 },
  headerBtn: { paddingVertical: 4, paddingHorizontal: 8 },
  headerBtnText: { color: colors.accent, fontSize: 14, fontWeight: '600' },
  unreadBanner: {
    backgroundColor: colors.accent + '22',
    paddingVertical: 6,
    paddingHorizontal: 20,
  },
  unreadBannerText: { color: colors.accent, fontSize: 13, fontWeight: '600' },
  item: {
    flexDirection: 'row',
    padding: 16,
    gap: 14,
    backgroundColor: colors.bgPrimary,
  },
  itemUnread: { backgroundColor: '#1a2235' },
  iconContainer: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconEmoji: { fontSize: 20 },
  textBlock: { flex: 1 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 3 },
  itemTitle: {
    color: colors.textPrimary,
    fontSize: 15,
    fontWeight: '600',
    flex: 1,
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.accent,
  },
  itemBody: { color: colors.textMuted, fontSize: 13, lineHeight: 18, marginBottom: 4 },
  itemTime: { color: colors.textMuted + 'aa', fontSize: 11 },
  separator: {
    height: 1,
    backgroundColor: colors.border ?? '#2a3a52',
    marginLeft: 74,
  },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10 },
  emptyIcon: { fontSize: 48 },
  emptyTitle: { color: colors.textPrimary, fontSize: 18, fontWeight: '700' },
  emptyBody: { color: colors.textMuted, fontSize: 14 },
});
