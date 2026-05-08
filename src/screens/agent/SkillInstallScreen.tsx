import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert, ActivityIndicator } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';
import { colors } from '../../theme/colors';
import { installSkillToInstance, getInstanceById, restartInstance } from '../../services/openclaw.service';
import { useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '../../stores/authStore';
import { useI18n } from '../../stores/i18nStore';
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
  const { t, language } = useI18n();
  const queryClient = useQueryClient();
  const [installing, setInstalling] = useState(false);
  const [done, setDone] = useState(false);
  const [instanceStatus, setInstanceStatus] = useState<InstanceStatus>('unknown');
  const [restarting, setRestarting] = useState(false);

  useEffect(() => {
    if (!activeInstance?.id) return;
    // Use the local activeInstance status first (already known), then verify via API
    const localStatus = (activeInstance.status ?? 'unknown') as InstanceStatus;
    if (['active', 'disconnected', 'error'].includes(localStatus)) {
      setInstanceStatus(localStatus);
    }
    getInstanceById(activeInstance.id)
      .then((inst) => {
        const s = (inst?.status ?? localStatus) as InstanceStatus;
        setInstanceStatus(['active', 'disconnected', 'error'].includes(s) ? s : localStatus);
      })
      .catch(() => {
        // Keep local status on API failure rather than showing 'unknown'
        if (localStatus === 'active') setInstanceStatus('active');
      });
  }, [activeInstance?.id]);

  const handleRestart = async () => {
    if (!activeInstance?.id) return;
    setRestarting(true);
    try {
      await restartInstance(activeInstance.id);
      Alert.alert(t({ en: 'Restart Sent', zh: '重启已发送' }), t({ en: 'Restarting Agent, please wait...', zh: '正在重启 Agent，请稍候…' }));
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
      Alert.alert(t({ en: 'Restart Failed', zh: '重启失败' }), e?.message || t({ en: 'Cannot restart Agent, please try later.', zh: '无法重启 Agent，请稍后重试。' }));
      setRestarting(false);
    }
  };

  const handleInstall = async () => {
    if (!activeInstance) {
      Alert.alert(
        t({ en: 'No Agent Connected', zh: '未绑定 agent' }),
        t({ en: 'Please deploy or connect an OpenClaw instance first, then install skills.', zh: '请先在「Agent」页面绑定或部署一个 OpenClaw 实例，然后再安装 Skill。' }),
        [{ text: t({ en: 'Connect', zh: '去绑定' }), onPress: () => navigation.navigate('AgentOnboarding' as any) }, { text: t({ en: 'Cancel', zh: '取消' }), style: 'cancel' }]
      );
      return;
    }
    if (instanceStatus === 'error') {
      Alert.alert(
        t({ en: 'Agent Error', zh: 'Agent 异常' }),
        t({ en: 'Agent is in error state. We recommend restarting before installing.', zh: 'Agent 当前状态异常。建议先重启 Agent 再安装 Skill。' }),
        [
          { text: t({ en: 'Restart', zh: '重启' }), onPress: handleRestart },
          { text: t({ en: 'Install Anyway', zh: '仍要安装' }), onPress: doInstall },
          { text: t({ en: 'Cancel', zh: '取消' }), style: 'cancel' },
        ]
      );
      return;
    }
    doInstall();
  };

  const doInstall = async () => {
    if (!skillId) {
      // No specific skill selected — navigate to marketplace to browse
      (navigation as any).navigate('Discover', { screen: 'Marketplace' });
      return;
    }
    setInstalling(true);
    try {
      const result = await installSkillToInstance(activeInstance!.id, skillId);
      void queryClient.invalidateQueries({ queryKey: ['instance-skills', activeInstance!.id] });
      void queryClient.invalidateQueries({ queryKey: ['my-skills', activeInstance!.id] });
      const isActiveNow = (result as any)?.skillActive || (result as any)?.platformHosted;
      const pendingMsg = (result as any)?.pendingDeploy
        ? `\n\n${t({ en: 'Note: The skill will auto-deploy when your agent reconnects.', zh: '注意：技能将在 Agent 重新连接后自动部署。' })}`
        : '';
      setDone(true);
      Alert.alert(
        t({ en: '✅ Installed!', zh: '✅ 安装成功！' }),
        isActiveNow
          ? `${skillName || 'Skill'} ${t({ en: 'is now active on', zh: '现已在以下 Agent 上激活：' })} ${activeInstance!.name}`
          : `${skillName || 'Skill'} ${t({ en: 'has been installed to', zh: '已安装到' })} ${activeInstance!.name}${pendingMsg}`,
        [{ text: 'OK', onPress: () => navigation.goBack() }]
      );
    } catch (e: any) {
      Alert.alert(
        t({ en: 'Install Failed', zh: '安装失败' }),
        e?.message || t({ en: 'Please make sure your Agent is online and try again.', zh: '请确认 Agent 实例在线后重试。' })
      );
    } finally {
      setInstalling(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.emoji}>{done ? '✅' : '⚡'}</Text>
      <Text style={styles.title}>{done ? t({ en: 'Installed!', zh: '安装成功！' }) : `${t({ en: 'Install', zh: '安装' })} ${skillName || 'Skill'}`}</Text>

      {activeInstance ? (
        <View style={styles.instanceInfo}>
          <Text style={styles.sub}>{t({ en: 'Install to:', zh: '安装到：' })}{activeInstance.name}</Text>
          <Text style={[styles.statusBadge, { color: STATUS_COLORS[instanceStatus] }]}>
            {STATUS_LABELS[instanceStatus]}
          </Text>
        </View>
      ) : (
        <Text style={styles.sub}>⚠️ {t({ en: 'No Agent connected', zh: '未绑定 Agent 实例' })}</Text>
      )}

      {instanceStatus === 'error' && !done && (
        <TouchableOpacity
          style={[styles.restartBtn, restarting && styles.btnLoading]}
          onPress={handleRestart}
          disabled={restarting}
        >
          {restarting
            ? <ActivityIndicator color={colors.primary} />
            : <Text style={styles.restartText}>{t({ en: '🔄 Restart Agent', zh: '🔄 重启 Agent' })}</Text>}
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
            : <Text style={styles.btnText}>{t({ en: 'Install Now', zh: '立即安装' })}</Text>}
        </TouchableOpacity>
      )}
      <TouchableOpacity onPress={() => navigation.goBack()}>
        <Text style={styles.cancel}>{done ? t({ en: 'Back', zh: '返回' }) : t({ en: 'Cancel', zh: '取消' })}</Text>
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
