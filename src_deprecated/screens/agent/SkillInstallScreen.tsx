import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert, ActivityIndicator } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';
import { colors } from '../../theme/colors';
import { installSkillToInstance, getInstanceById, restartInstance } from '../../services/openclaw.service';
import { useAuthStore } from '../../stores/authStore';
import type { AgentStackParamList } from '../../navigation/types';

type Nav = NativeStackNavigationProp<AgentStackParamList, 'SkillInstall'>;
type RouteT = RouteProp<AgentStackParamList, 'SkillInstall'>;

type InstanceStatus = 'active' | 'disconnected' | 'error' | 'unknown';

const STATUS_COLORS: Record<InstanceStatus, string> = {
  active: '#22c55e',
  disconnected: '#f59e0b',
  error: '#ef4444',
  unknown: '#6b7280',
};

const STATUS_LABELS: Record<InstanceStatus, string> = {
  active: '● Online',
  disconnected: '● Offline',
  error: '● Error',
  unknown: '● Unknown',
};

export function SkillInstallScreen() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<RouteT>();
  const activeInstance = useAuthStore((s) => s.activeInstance);
  const { skillId, skillName } = route.params;
  const [installing, setInstalling] = useState(false);
  const [done, setDone] = useState(false);
  const [instanceStatus, setInstanceStatus] = useState<InstanceStatus>('unknown');
  const [restarting, setRestarting] = useState(false);

  useEffect(() => {
    if (!activeInstance?.id) return;
    getInstanceById(activeInstance.id)
      .then((inst) => {
        const s = (inst?.status ?? 'unknown') as InstanceStatus;
        setInstanceStatus(['active', 'disconnected', 'error'].includes(s) ? s : 'unknown');
      })
      .catch(() => setInstanceStatus('unknown'));
  }, [activeInstance?.id]);

  const handleRestart = async () => {
    if (!activeInstance?.id) return;
    setRestarting(true);
    try {
      await restartInstance(activeInstance.id);
      Alert.alert('重启已发送', '正在重启 Agent，请稍候…');
      // Poll after 4s
      setTimeout(() => {
        getInstanceById(activeInstance.id)
          .then((inst) => {
            const s = (inst?.status ?? 'unknown') as InstanceStatus;
            setInstanceStatus(['active', 'disconnected', 'error'].includes(s) ? s : 'unknown');
          })
          .catch(() => {})
          .finally(() => setRestarting(false));
      }, 4000);
    } catch (e: any) {
      Alert.alert('重启失败', e?.message || '无法重启 Agent，请稍后重试。');
      setRestarting(false);
    }
  };

  const handleInstall = async () => {
    if (!activeInstance) {
      Alert.alert(
        '未绑定 agent',
        '请先在「Agent」页面绑定或部署一个 OpenClaw 实例，然后再安装 Skill。',
        [{ text: '去绑定', onPress: () => navigation.navigate('AgentOnboarding' as any) }, { text: '取消', style: 'cancel' }]
      );
      return;
    }
    if (instanceStatus === 'error') {
      Alert.alert('Agent 异常', 'Agent 当前状态异常。建议先重启 Agent 再安装 Skill。', [
        { text: '重启', onPress: handleRestart },
        { text: '仍要安装', onPress: doInstall },
        { text: '取消', style: 'cancel' },
      ]);
      return;
    }
    doInstall();
  };

  const doInstall = async () => {
    if (!skillId) return;
    setInstalling(true);
    try {
      await installSkillToInstance(activeInstance!.id, skillId);
      setDone(true);
      setTimeout(() => navigation.goBack(), 1200);
    } catch (e: any) {
      Alert.alert('安装失败', e?.message || '请确认 Agent 实例在线后重试。');
    } finally {
      setInstalling(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.emoji}>{done ? '✅' : '⚡'}</Text>
      <Text style={styles.title}>{done ? '安装成功！' : `安装 ${skillName || 'Skill'}`}</Text>

      {activeInstance ? (
        <View style={styles.instanceInfo}>
          <Text style={styles.sub}>安装到：{activeInstance.name}</Text>
          <Text style={[styles.statusBadge, { color: STATUS_COLORS[instanceStatus] }]}>
            {STATUS_LABELS[instanceStatus]}
          </Text>
        </View>
      ) : (
        <Text style={styles.sub}>⚠️ 未绑定 Agent 实例</Text>
      )}

      {instanceStatus === 'error' && !done && (
        <TouchableOpacity
          style={[styles.restartBtn, restarting && styles.btnLoading]}
          onPress={handleRestart}
          disabled={restarting}
        >
          {restarting
            ? <ActivityIndicator color={colors.primary} />
            : <Text style={styles.restartText}>🔄 重启 Agent</Text>}
        </TouchableOpacity>
      )}

      {!done && (
        <TouchableOpacity
          style={[styles.btn, installing && styles.btnLoading]}
          onPress={handleInstall}
          disabled={installing}
        >
          {installing
            ? <ActivityIndicator color='#fff' />
            : <Text style={styles.btnText}>立即安装</Text>}
        </TouchableOpacity>
      )}
      <TouchableOpacity onPress={() => navigation.goBack()}>
        <Text style={styles.cancel}>{done ? '返回' : '取消'}</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgPrimary, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 14 },
  emoji: { fontSize: 56 },
  title: { fontSize: 22, fontWeight: '700', color: colors.textPrimary, textAlign: 'center' },
  instanceInfo: { alignItems: 'center', gap: 4 },
  sub: { fontSize: 14, color: colors.textSecondary, textAlign: 'center' },
  statusBadge: { fontSize: 13, fontWeight: '600' },
  btn: { backgroundColor: colors.primary, borderRadius: 14, padding: 16, paddingHorizontal: 40, minWidth: 160, alignItems: 'center' },
  btnLoading: { opacity: 0.6 },
  btnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  restartBtn: { borderWidth: 1.5, borderColor: colors.primary, borderRadius: 12, padding: 12, paddingHorizontal: 28, minWidth: 160, alignItems: 'center' },
  restartText: { color: colors.primary, fontWeight: '600', fontSize: 15 },
  cancel: { color: colors.textMuted, fontSize: 14, marginTop: 4 },
});
