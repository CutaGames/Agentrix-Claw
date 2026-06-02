/**
 * AeonPlotVisitScreen — 拜访别人的领地(地图社交)。
 *
 * 从地图点一个标记进来:看到地主是谁、地块名,可以:
 *   - 🏙️ 进入领地(进 2.5D 场景)
 *   - 💬 留言(地块留言板)
 *   - 👋 私信地主(跨 tab 到 Plaza DM —— "加好友"的轻量实现)
 * 自己的地块不显示私信按钮。
 */
import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator,
  TextInput, Alert, KeyboardAvoidingView, Platform,
} from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import * as Haptics from 'expo-haptics';
import { colors } from '../../theme/colors';
import { useAuthStore } from '../../stores/authStore';
import {
  listPlotMessages, postPlotMessage, enterPlot,
  type AeonPlotMessageDto,
} from '../../services/aeon/aeonApi';
import type { WorldStackParamList } from '../../navigation/WorldStackNavigator';

type Nav = NativeStackNavigationProp<WorldStackParamList, 'AeonPlotVisit'>;
type Rt = RouteProp<WorldStackParamList, 'AeonPlotVisit'>;

export default function AeonPlotVisitScreen() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<Rt>();
  const { plotId, displayName, ownerUserId, ownerName } = route.params;
  const myUserId = useAuthStore((s) => s.user?.id);
  const isMine = ownerUserId && ownerUserId === myUserId;

  const [messages, setMessages] = useState<AeonPlotMessageDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState('');
  const [posting, setPosting] = useState(false);

  const load = useCallback(async () => {
    try {
      setMessages(await listPlotMessages(plotId));
    } catch {
      setMessages([]);
    } finally {
      setLoading(false);
    }
  }, [plotId]);

  useEffect(() => { void load(); }, [load]);

  const onEnter = useCallback(async () => {
    try { await enterPlot(plotId); } catch { /* 非 owner 拜访忽略 */ }
    (navigation as any).navigate('AeonScene', { plotId, displayName });
  }, [navigation, plotId, displayName]);

  const onPost = useCallback(async () => {
    const body = draft.trim();
    if (!body) return;
    try {
      setPosting(true);
      const msg = await postPlotMessage(plotId, body);
      setMessages((prev) => [msg, ...prev]);
      setDraft('');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e: any) {
      Alert.alert('留言失败', e?.message || '请稍后再试');
    } finally {
      setPosting(false);
    }
  }, [draft, plotId]);

  const onMessageOwner = useCallback(() => {
    if (!ownerUserId) return;
    // 跨 tab 到 Plaza 的私信屏(加好友的轻量实现:先能私聊)。
    (navigation as any).navigate('Plaza', {
      screen: 'DirectMessage',
      params: { userId: ownerUserId, userName: ownerName || '领地主人' },
    });
  }, [navigation, ownerUserId, ownerName]);

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.back}><Text style={styles.backText}>‹ 返回</Text></TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>{displayName || '领地'}</Text>
        <View style={{ minWidth: 56 }} />
      </View>

      {/* 地主信息卡 */}
      <View style={styles.ownerCard}>
        <View style={styles.ownerAvatar}><Text style={styles.ownerAvatarText}>{(ownerName || '?').slice(0, 1)}</Text></View>
        <View style={{ flex: 1 }}>
          <Text style={styles.ownerName}>{ownerName || '匿名居民'}{isMine ? '(你)' : ''}</Text>
          <Text style={styles.ownerSub}>{displayName || '未命名领地'}</Text>
        </View>
      </View>

      {/* 行动 */}
      <View style={styles.actions}>
        <TouchableOpacity style={[styles.actionBtn, styles.actionPrimary]} onPress={onEnter}>
          <Text style={styles.actionPrimaryText}>🏙️ 进入领地</Text>
        </TouchableOpacity>
        {!isMine && ownerUserId ? (
          <TouchableOpacity style={[styles.actionBtn, styles.actionSecondary]} onPress={onMessageOwner}>
            <Text style={styles.actionSecondaryText}>👋 私信地主</Text>
          </TouchableOpacity>
        ) : null}
      </View>

      <Text style={styles.sectionTitle}>💬 留言板</Text>
      {loading ? (
        <ActivityIndicator color={colors.accent} style={{ marginTop: 20 }} />
      ) : (
        <FlatList
          style={{ flex: 1 }}
          data={messages}
          keyExtractor={(m) => m.id}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 16 }}
          ListEmptyComponent={<Text style={styles.empty}>还没有留言。来留下第一条吧。</Text>}
          renderItem={({ item }) => (
            <View style={styles.msgRow}>
              <Text style={styles.msgAuthor}>{item.authorName}</Text>
              <Text style={styles.msgBody}>{item.body}</Text>
              <Text style={styles.msgTime}>{new Date(item.createdAt).toLocaleString()}</Text>
            </View>
          )}
        />
      )}

      {/* 留言输入 */}
      <View style={styles.inputBar}>
        <TextInput
          style={styles.input}
          placeholder={isMine ? '给来访者留个欢迎语…' : `给 ${ownerName || '地主'} 留言…`}
          placeholderTextColor={colors.textMuted}
          value={draft}
          onChangeText={setDraft}
          maxLength={280}
          multiline
        />
        <TouchableOpacity style={[styles.sendBtn, (!draft.trim() || posting) && { opacity: 0.5 }]} onPress={onPost} disabled={!draft.trim() || posting}>
          <Text style={styles.sendBtnText}>{posting ? '…' : '留言'}</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgPrimary },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 56, paddingBottom: 12 },
  back: { minWidth: 56 }, backText: { color: colors.textPrimary, fontSize: 16, fontWeight: '600' },
  headerTitle: { color: colors.textPrimary, fontSize: 18, fontWeight: '800', flex: 1, textAlign: 'center' },
  ownerCard: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.bgCard, borderRadius: 14, padding: 14, marginHorizontal: 16, borderWidth: 1, borderColor: colors.border },
  ownerAvatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
  ownerAvatarText: { color: '#fff', fontSize: 18, fontWeight: '800' },
  ownerName: { color: colors.textPrimary, fontSize: 16, fontWeight: '700' },
  ownerSub: { color: colors.textMuted, fontSize: 12, marginTop: 2 },
  actions: { flexDirection: 'row', gap: 12, paddingHorizontal: 16, marginTop: 12 },
  actionBtn: { flex: 1, borderRadius: 12, paddingVertical: 13, alignItems: 'center' },
  actionPrimary: { backgroundColor: colors.accent },
  actionPrimaryText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  actionSecondary: { backgroundColor: colors.bgCard, borderWidth: 1, borderColor: colors.border },
  actionSecondaryText: { color: colors.textPrimary, fontSize: 14, fontWeight: '600' },
  sectionTitle: { color: colors.textPrimary, fontSize: 15, fontWeight: '700', marginTop: 18, marginBottom: 8, paddingHorizontal: 16 },
  empty: { color: colors.textMuted, fontSize: 13, textAlign: 'center', marginTop: 24 },
  msgRow: { backgroundColor: colors.bgCard, borderRadius: 12, padding: 12, marginBottom: 10, borderWidth: 1, borderColor: colors.border },
  msgAuthor: { color: colors.accent, fontSize: 13, fontWeight: '700' },
  msgBody: { color: colors.textPrimary, fontSize: 14, marginTop: 4, lineHeight: 19 },
  msgTime: { color: colors.textMuted, fontSize: 11, marginTop: 6 },
  inputBar: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, padding: 12, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.bgSecondary },
  input: { flex: 1, backgroundColor: colors.bgPrimary, color: colors.textPrimary, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, maxHeight: 100, borderWidth: 1, borderColor: colors.border },
  sendBtn: { backgroundColor: colors.accent, borderRadius: 10, paddingHorizontal: 18, paddingVertical: 12 },
  sendBtnText: { color: '#fff', fontSize: 14, fontWeight: '700' },
});
