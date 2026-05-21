import React, { useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Platform,
} from 'react-native';
import { DrawerContentComponentProps } from '@react-navigation/drawer';
import { useAuthStore } from '../stores/authStore';
import { colors } from '../theme/colors';
import { useI18n } from '../stores/i18nStore';

const STATUS_COLORS: Record<string, string> = {
  active: '#22c55e',
  disconnected: '#9CA3AF',
  error: '#ef4444',
};

export function AgentDrawerContent({ navigation }: DrawerContentComponentProps) {
  const { t } = useI18n();
  const activeInstance = useAuthStore((s) => s.activeInstance);
  const user = useAuthStore((s) => s.user);
  const setActiveInstance = useAuthStore((s) => s.setActiveInstance);
  const instances = user?.openClawInstances ?? [];
  const [instancePickerOpen, setInstancePickerOpen] = React.useState(false);

  const navigateAndClose = useCallback(
    (screen: string, params?: any) => {
      navigation.closeDrawer();
      // Use fully-qualified nested path: Drawer → MainTabs → Agent tab → target screen
      // Direct 'Agent' resolution can fail on native when the screen is >1 level deep.
      (navigation as any).navigate('MainTabs', {
        screen: 'Agent',
        params: { screen, params },
      });
    },
    [navigation],
  );

  const handleInstanceSelect = useCallback(
    (instanceId: string) => {
      setActiveInstance(instanceId);
      setInstancePickerOpen(false);
    },
    [setActiveInstance],
  );

  const handleAddAgent = useCallback(() => {
    navigation.closeDrawer();
    (navigation as any).navigate('MainTabs', {
      screen: 'Agent',
      params: { screen: 'DeploySelect' },
    });
  }, [navigation]);

  // Token/storage display from activeInstance metadata or placeholder
  const tokenUsed = activeInstance?.metadata?.tokenUsed ?? 0;
  const tokenTotal = activeInstance?.metadata?.tokenTotal ?? 32000;
  const tokenPercent = tokenTotal > 0 ? Math.round((tokenUsed / tokenTotal) * 100) : 0;

  return (
    <View style={styles.container}>
      <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* ── Instance Switcher ── */}
        <TouchableOpacity
          style={styles.instanceSwitcher}
          onPress={() => setInstancePickerOpen(!instancePickerOpen)}
          activeOpacity={0.7}
        >
          <View style={styles.instanceRow}>
            <View
              style={[
                styles.instanceDot,
                { backgroundColor: STATUS_COLORS[activeInstance?.status ?? 'disconnected'] },
              ]}
            />
            <View style={styles.instanceInfo}>
              <Text style={styles.instanceName} numberOfLines={1}>
                {activeInstance?.name || t({ en: 'No Agent', zh: '无智能体' })}
              </Text>
              <Text style={styles.instanceMeta}>
                {activeInstance
                  ? `${activeInstance.deployType === 'cloud' ? '☁️' : '💻'} ${activeInstance.deployType} · ${activeInstance.status}`
                  : t({ en: 'Tap to connect', zh: '点击连接' })}
              </Text>
            </View>
            <Text style={styles.chevron}>{instancePickerOpen ? '▴' : '▾'}</Text>
          </View>
        </TouchableOpacity>

        {/* ── Instance Picker Dropdown ── */}
        {instancePickerOpen && (
          <View style={styles.instanceDropdown}>
            {instances.map((inst) => (
              <TouchableOpacity
                key={inst.id}
                style={[
                  styles.instanceOption,
                  inst.id === activeInstance?.id && styles.instanceOptionActive,
                ]}
                onPress={() => handleInstanceSelect(inst.id)}
                activeOpacity={0.7}
              >
                <View
                  style={[
                    styles.instanceDot,
                    { backgroundColor: STATUS_COLORS[inst.status ?? 'disconnected'] },
                  ]}
                />
                <Text
                  style={[
                    styles.instanceOptionText,
                    inst.id === activeInstance?.id && styles.instanceOptionTextActive,
                  ]}
                  numberOfLines={1}
                >
                  {inst.id === activeInstance?.id ? '✓ ' : ''}
                  {inst.name}
                </Text>
                <Text style={styles.instanceOptionMeta}>
                  {inst.deployType === 'cloud' ? '☁️' : inst.deployType === 'local' ? '💻' : '⚙️'}
                </Text>
              </TouchableOpacity>
            ))}
            <TouchableOpacity
              style={styles.addAgentBtn}
              onPress={handleAddAgent}
              activeOpacity={0.7}
            >
              <Text style={styles.addAgentText}>
                ➕ {t({ en: 'New / Connect Agent', zh: '新建 / 连接 Agent' })}
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {/* ── Status Card ── */}
        {activeInstance && (
          <View style={styles.statusCard}>
            <View style={styles.statusRow}>
              <Text style={styles.statusLabel}>Token</Text>
              <Text style={styles.statusValue}>{tokenPercent}%</Text>
            </View>
            <View style={styles.progressBar}>
              <View
                style={[
                  styles.progressFill,
                  {
                    width: `${Math.min(tokenPercent, 100)}%`,
                    backgroundColor:
                      tokenPercent > 85 ? '#ef4444' : tokenPercent > 60 ? '#F59E0B' : '#22c55e',
                  },
                ]}
              />
            </View>
            <Text style={styles.statusDetail}>
              {activeInstance.version ? `v${activeInstance.version}` : ''} ·{' '}
              {activeInstance.status === 'active'
                ? t({ en: 'Online', zh: '在线' })
                : t({ en: 'Offline', zh: '离线' })}
            </Text>
          </View>
        )}

        {/* ── Quick Menu ── */}
        <Text style={styles.sectionTitle}>
          {t({ en: 'Management', zh: '管理' })}
        </Text>
        {[
          { icon: '🧠', label: t({ en: 'Memory Hub', zh: '记忆中心' }), screen: 'MemoryManagement' },
          { icon: '⚙️', label: t({ en: 'Workflows', zh: '工作流' }), screen: 'WorkflowList' },
          { icon: '🛠️', label: t({ en: 'Skills', zh: '技能管理' }), screen: 'SkillInstall', params: { skillId: '', skillName: '' } },
          { icon: '📋', label: t({ en: 'Activity Logs', zh: '运行日志' }), screen: 'AgentLogs' },
        ].map((item) => (
          <TouchableOpacity
            key={item.screen}
            style={styles.menuItem}
            onPress={() => navigateAndClose(item.screen, item.params)}
            activeOpacity={0.7}
          >
            <Text style={styles.menuIcon}>{item.icon}</Text>
            <Text style={styles.menuLabel}>{item.label}</Text>
            <Text style={styles.menuArrow}>❯</Text>
          </TouchableOpacity>
        ))}

        {/* ── Devices ── */}
        <Text style={styles.sectionTitle}>
          {t({ en: 'Devices & Connections', zh: '设备与连接' })}
        </Text>
        {[
          { icon: '🖥️', label: t({ en: 'Desktop Control', zh: '桌面控制' }), screen: 'DesktopControl' },
          { icon: '⌚', label: t({ en: 'Wearables', zh: '可穿戴设备' }), screen: 'WearableHub' },
          { icon: '📷', label: t({ en: 'Scan & Connect', zh: '扫码连接' }), screen: 'Scan' },
        ].map((item) => (
          <TouchableOpacity
            key={item.screen}
            style={styles.menuItem}
            onPress={() => navigateAndClose(item.screen)}
            activeOpacity={0.7}
          >
            <Text style={styles.menuIcon}>{item.icon}</Text>
            <Text style={styles.menuLabel}>{item.label}</Text>
            <Text style={styles.menuArrow}>❯</Text>
          </TouchableOpacity>
        ))}

        {/* ── Security ── */}
        <Text style={styles.sectionTitle}>
          {t({ en: 'Security & Team', zh: '安全与团队' })}
        </Text>
        {[
          { icon: '🔐', label: t({ en: 'Permissions', zh: '权限管理' }), screen: 'AgentPermissions' },
          { icon: '🤖', label: t({ en: 'Agent Accounts', zh: 'Agent 账号' }), screen: 'AgentAccount' },
          { icon: '👥', label: t({ en: 'Team Space', zh: '团队空间' }), screen: 'TeamSpace' },
        ].map((item) => (
          <TouchableOpacity
            key={item.screen}
            style={styles.menuItem}
            onPress={() => navigateAndClose(item.screen)}
            activeOpacity={0.7}
          >
            <Text style={styles.menuIcon}>{item.icon}</Text>
            <Text style={styles.menuLabel}>{item.label}</Text>
            <Text style={styles.menuArrow}>❯</Text>
          </TouchableOpacity>
        ))}

        {/* ── Full Console Link ── */}
        <TouchableOpacity
          style={[styles.menuItem, styles.consoleLink]}
          onPress={() => navigateAndClose('AgentConsole')}
          activeOpacity={0.7}
        >
          <Text style={styles.menuIcon}>⚙️</Text>
          <Text style={[styles.menuLabel, { color: colors.accent }]}>
            {t({ en: 'Full Agent Console', zh: 'Agent 完整控制台' })}
          </Text>
          <Text style={styles.menuArrow}>❯</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bgPrimary,
    paddingTop: Platform.OS === 'ios' ? 56 : 36,
  },
  scroll: {
    flex: 1,
    paddingHorizontal: 16,
  },
  // ── Instance Switcher ──
  instanceSwitcher: {
    backgroundColor: colors.bgCard,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
    marginBottom: 12,
  },
  instanceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  instanceDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  instanceInfo: {
    flex: 1,
  },
  instanceName: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  instanceMeta: {
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 2,
  },
  chevron: {
    fontSize: 14,
    color: colors.textMuted,
  },
  // ── Instance Dropdown ──
  instanceDropdown: {
    backgroundColor: colors.bgCard,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 12,
    overflow: 'hidden',
  },
  instanceOption: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 14,
    gap: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  instanceOptionActive: {
    backgroundColor: colors.accent + '15',
  },
  instanceOptionText: {
    flex: 1,
    fontSize: 14,
    color: colors.textPrimary,
  },
  instanceOptionTextActive: {
    fontWeight: '700',
    color: colors.accent,
  },
  instanceOptionMeta: {
    fontSize: 14,
  },
  addAgentBtn: {
    paddingVertical: 12,
    paddingHorizontal: 14,
    alignItems: 'center',
  },
  addAgentText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.accent,
  },
  // ── Status Card ──
  statusCard: {
    backgroundColor: colors.bgCard,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
    marginBottom: 16,
  },
  statusRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  statusLabel: {
    fontSize: 13,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  statusValue: {
    fontSize: 13,
    color: colors.textPrimary,
    fontWeight: '700',
  },
  progressBar: {
    height: 6,
    backgroundColor: colors.bgSecondary,
    borderRadius: 3,
    overflow: 'hidden',
    marginBottom: 8,
  },
  progressFill: {
    height: '100%',
    borderRadius: 3,
  },
  statusDetail: {
    fontSize: 12,
    color: colors.textMuted,
  },
  // ── Menu ──
  sectionTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: 16,
    marginBottom: 8,
    paddingHorizontal: 4,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 13,
    paddingHorizontal: 4,
    gap: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  menuIcon: {
    fontSize: 18,
    width: 26,
    textAlign: 'center',
  },
  menuLabel: {
    flex: 1,
    fontSize: 15,
    color: colors.textPrimary,
  },
  menuArrow: {
    fontSize: 14,
    color: colors.textMuted,
  },
  consoleLink: {
    marginTop: 8,
    marginBottom: 32,
    borderBottomWidth: 0,
  },
});
