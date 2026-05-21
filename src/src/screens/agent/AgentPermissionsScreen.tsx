// 🔐 Agent Permissions & Security Screen
// Shows and manages all permission boundaries for the active AgentAccount
import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView,
  Switch, Alert, TextInput, Modal, FlatList,
} from 'react-native';
import { useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { colors } from '../../theme/colors';
import { apiFetch } from '../../services/api';
import type { AgentStackParamList } from '../../navigation/types';
import { useI18n } from '../../stores/i18nStore';
import { useAuthStore } from '../../stores/authStore';
import { bindAgentAccountToInstance } from '../../services/openclaw.service';
import {
  fetchUnifiedAgents,
  getUnifiedAgent,
  type UnifiedAgent,
} from '../../services/unifiedAgent';

type AgentAccount = UnifiedAgent;

type Route = RouteProp<AgentStackParamList, 'AgentPermissions'>;

// ── Types ──────────────────────────────────────────────────────────

interface CatalogModel {
  id: string;
  label: string;
  contextWindow: number;
  costTier: 'free' | 'low' | 'medium' | 'high';
  capabilities: string[];
  multimodal?: boolean;
  inputPrice?: string;
  outputPrice?: string;
  positioning?: string;
  freeApi?: boolean;
  freeNote?: string;
}

interface CatalogProvider {
  id: string;
  name: string;
  icon: string;
  region: 'international' | 'china';
  currency?: string;
  models: CatalogModel[];
}

interface UserSavedConfig {
  providerId: string;
  selectedModel: string;
  isDefault: boolean;
}

interface PermissionState {
  // Payment
  autonomousPaymentEnabled: boolean;
  confirmationThreshold: number;
  allowedCurrencies: string[];
  // Device
  fileReadEnabled: boolean;
  fileReadScope: string;
  programLaunchEnabled: boolean;
  screenshotEnabled: boolean;
  gpsEnabled: boolean;
  gpsAccuracy: 'city' | 'district' | 'exact';
  // Network & Tools
  webSearchEnabled: boolean;
  emailEnabled: boolean;
  twitterEnabled: boolean;
  telegramEnabled: boolean;
  mcpToolCount: number;
  // Skills
  skillSearchEnabled: boolean;
  skillInstallEnabled: boolean;
  skillExecuteEnabled: boolean;
  skillPublishEnabled: boolean;
  // Commerce
  commerceBrowseEnabled: boolean;
  commercePurchaseEnabled: boolean;
  orderManageEnabled: boolean;
  walletReadEnabled: boolean;
  quickpayEnabled: boolean;
  x402PayEnabled: boolean;
  // Agent-to-Agent (A2A)
  a2aDiscoverEnabled: boolean;
  a2aInvokeEnabled: boolean;
  // Task Marketplace
  taskSearchEnabled: boolean;
  taskPostEnabled: boolean;
  taskAcceptEnabled: boolean;
  taskSubmitEnabled: boolean;
  // Resource
  resourceSearchEnabled: boolean;
  resourcePublishEnabled: boolean;
}

const DEFAULT_PERMISSIONS: PermissionState = {
  autonomousPaymentEnabled: true,
  confirmationThreshold: 50,
  allowedCurrencies: ['USDT', 'ETH'],
  fileReadEnabled: true,
  fileReadScope: '~/Documents',
  programLaunchEnabled: true,
  screenshotEnabled: true,
  gpsEnabled: true,
  gpsAccuracy: 'city',
  webSearchEnabled: true,
  emailEnabled: true,
  twitterEnabled: true,
  telegramEnabled: true,
  mcpToolCount: 3,
  // Skills — all enabled by default
  skillSearchEnabled: true,
  skillInstallEnabled: true,
  skillExecuteEnabled: true,
  skillPublishEnabled: true,
  // Commerce
  commerceBrowseEnabled: true,
  commercePurchaseEnabled: true,
  orderManageEnabled: true,
  walletReadEnabled: true,
  quickpayEnabled: true,
  x402PayEnabled: true,
  // A2A
  a2aDiscoverEnabled: true,
  a2aInvokeEnabled: true,
  // Task Marketplace
  taskSearchEnabled: true,
  taskPostEnabled: true,
  taskAcceptEnabled: true,
  taskSubmitEnabled: true,
  // Resources
  resourceSearchEnabled: true,
  resourcePublishEnabled: true,
};

function normalizePermissions(value?: Partial<PermissionState> | null): PermissionState {
  return {
    ...DEFAULT_PERMISSIONS,
    ...(value || {}),
    allowedCurrencies: Array.isArray(value?.allowedCurrencies) && value?.allowedCurrencies.length
      ? value.allowedCurrencies.filter((currency): currency is string => typeof currency === 'string')
      : DEFAULT_PERMISSIONS.allowedCurrencies,
    gpsAccuracy:
      value?.gpsAccuracy === 'district' || value?.gpsAccuracy === 'exact'
        ? value.gpsAccuracy
        : DEFAULT_PERMISSIONS.gpsAccuracy,
    mcpToolCount: typeof value?.mcpToolCount === 'number' ? value.mcpToolCount : DEFAULT_PERMISSIONS.mcpToolCount,
    confirmationThreshold:
      typeof value?.confirmationThreshold === 'number'
        ? value.confirmationThreshold
        : DEFAULT_PERMISSIONS.confirmationThreshold,
  };
}

const CURRENCY_OPTIONS = ['USDT', 'ETH', 'USD'];

// ── Section header ──────────────────────────────────────────────────

function SectionHeader({ icon, title }: { icon: string; title: string }) {
  return (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionIcon}>{icon}</Text>
      <Text style={styles.sectionTitle}>{title}</Text>
    </View>
  );
}

// ── Permission row with switch ──────────────────────────────────────

function PermRow({
  label, sub, value, onChange, destructive,
}: {
  label: string; sub?: string; value: boolean;
  onChange: (v: boolean) => void; destructive?: boolean;
}) {
  return (
    <View style={styles.permRow}>
      <View style={{ flex: 1 }}>
        <Text style={[styles.permLabel, destructive && { color: colors.error }]}>{label}</Text>
        {sub ? <Text style={styles.permSub}>{sub}</Text> : null}
      </View>
      <Switch
        value={value}
        onValueChange={onChange}
        trackColor={{ false: colors.bgSecondary, true: colors.accent + '88' }}
        thumbColor={value ? colors.accent : colors.textMuted}
      />
    </View>
  );
}

// ── Main Screen ─────────────────────────────────────────────────────

export function AgentPermissionsScreen() {
  const route = useRoute<Route>();
  const agentAccountId = route.params?.agentAccountId;
  const queryClient = useQueryClient();
  const { t } = useI18n();
  const activeInstance = useAuthStore((s) => s.activeInstance);
  const updateInstance = useAuthStore((s) => s.updateInstance);

  const { data: agents = [] } = useQuery<AgentAccount[]>({
    queryKey: ['agent-accounts'],
    queryFn: fetchUnifiedAgents,
    retry: false,
  });

  const [selectedAgentId, setSelectedAgentId] = useState<string | undefined>(agentAccountId);

  useEffect(() => {
    if (agentAccountId) {
      setSelectedAgentId(agentAccountId);
      return;
    }
    if (!selectedAgentId && activeInstance?.metadata?.agentAccountId) {
      setSelectedAgentId(activeInstance.metadata.agentAccountId);
      return;
    }
    if (!selectedAgentId && agents[0]?.id) {
      setSelectedAgentId(agents[0].id);
    }
  }, [agentAccountId, activeInstance?.metadata?.agentAccountId, agents, selectedAgentId]);

  const activeAgent = (selectedAgentId
    ? agents.find((a) => a.id === selectedAgentId)
    : undefined) ?? agents[0];

  const [perms, setPerms] = useState<PermissionState>(DEFAULT_PERMISSIONS);
  const [editingThreshold, setEditingThreshold] = useState(false);
  const [thresholdInput, setThresholdInput] = useState(String(DEFAULT_PERMISSIONS.confirmationThreshold));
  const [isSaving, setIsSaving] = useState(false);

  // Per-agent model selection
  const [catalog, setCatalog] = useState<CatalogProvider[]>([]);
  const [userConfigs, setUserConfigs] = useState<UserSavedConfig[]>([]);
  const [preferredProvider, setPreferredProvider] = useState<string | undefined>(undefined);
  const [preferredModel, setPreferredModel] = useState<string | undefined>(undefined);
  const [agentVoice, setAgentVoice] = useState<string | undefined>(undefined);
  const [showModelPicker, setShowModelPicker] = useState(false);
  const [showVoicePicker, setShowVoicePicker] = useState(false);

  const availableVoices = ['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer'];

  useEffect(() => {
    Promise.all([
      apiFetch<CatalogProvider[]>('/ai-providers/catalog'),
      apiFetch<UserSavedConfig[]>('/ai-providers/configs'),
    ]).then(([cat, configs]) => {
      setCatalog(cat);
      setUserConfigs(configs);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (activeAgent) {
      setPreferredProvider(activeAgent.preferredProvider);
      setPreferredModel(activeAgent.preferredModel);
      setAgentVoice(activeAgent.metadata?.voice_id);
    }
  }, [activeAgent?.id, activeAgent?.preferredProvider, activeAgent?.preferredModel, activeAgent?.metadata?.voice_id]);

  const configuredProviderIds = userConfigs.map(c => c.providerId);
  const configuredProviders = catalog.filter(p => configuredProviderIds.includes(p.id));
  const defaultUserConfig = userConfigs.find(c => c.isDefault);

  const selectedProviderObj = catalog.find(p => p.id === preferredProvider);
  const selectedModelObj = selectedProviderObj?.models.find(m => m.id === preferredModel);
  const modelDisplayLabel = selectedModelObj
    ? `${selectedProviderObj?.icon || ''} ${selectedModelObj.label}`
    : defaultUserConfig
      ? t({ en: 'Use Default', zh: '使用默认' }) + ` (${catalog.find(p => p.id === defaultUserConfig.providerId)?.icon || ''} ${defaultUserConfig.selectedModel})`
      : t({ en: 'Platform Default', zh: '平台默认' });

  const expectedPermissionsJson = JSON.stringify(normalizePermissions(perms));

  useEffect(() => {
    const nextPermissions = normalizePermissions(activeAgent?.permissions);
    setPerms(nextPermissions);
    setThresholdInput(String(nextPermissions.confirmationThreshold));
  }, [activeAgent?.id, activeAgent?.permissions]);

  const updatePerm = <K extends keyof PermissionState>(key: K, value: PermissionState[K]) => {
    setPerms((p) => ({ ...p, [key]: value }));
  };

  const toggleCurrency = (currency: string) => {
    setPerms((p) => {
      const cur = p.allowedCurrencies;
      if (cur.includes(currency)) {
        if (cur.length === 1) return p; // keep at least one
        return { ...p, allowedCurrencies: cur.filter((c) => c !== currency) };
      }
      return { ...p, allowedCurrencies: [...cur, currency] };
    });
  };

  const handleSave = async () => {
    if (!activeAgent) return;
    try {
      setIsSaving(true);
      // Persist spending limits and permissions to backend.
      // Persist permissions via agent-accounts API (bypass agentPresence)
      if (activeAgent.agentAccountId) {
        await apiFetch(`/agent-accounts/${activeAgent.agentAccountId}`, {
          method: 'PATCH',
          body: JSON.stringify({
            spendingLimits: {
              singleTxLimit: activeAgent.spendingLimits?.singleTxLimit ?? 100,
              dailyLimit: activeAgent.spendingLimits?.dailyLimit ?? 500,
              monthlyLimit: activeAgent.spendingLimits?.monthlyLimit ?? 2000,
              currency: 'USD',
            },
            permissions: perms,
            preferredModel: preferredModel || undefined,
            preferredProvider: preferredProvider || undefined,
          }),
        });
      }

      const verified = await getUnifiedAgent(activeAgent.id);
      const verifiedPermissions = normalizePermissions(verified.permissions as Partial<PermissionState> | undefined);
      if (JSON.stringify(verifiedPermissions) !== expectedPermissionsJson) {
        throw new Error(t({ en: 'Server response did not match the saved permissions.', zh: '服务器回读结果与保存内容不一致。' }));
      }

      if (activeInstance?.id) {
        try {
          const updatedInstance = await bindAgentAccountToInstance(activeInstance.id, activeAgent.id);
          updateInstance(activeInstance.id, { metadata: updatedInstance.metadata || { agentAccountId: activeAgent.id } });
        } catch {
          // Non-blocking: agent-account binding may fail if backend hasn't created the account yet
        }
      }

      setPerms(verifiedPermissions);
      setThresholdInput(String(verifiedPermissions.confirmationThreshold));
      await queryClient.invalidateQueries({ queryKey: ['agent-accounts'] });
      Alert.alert(
        t({ en: 'Saved ✅', zh: '已保存 ✅' }),
        activeInstance?.id
          ? t({ en: 'Permissions were saved, verified from the server, and bound to the current instance.', zh: '权限已保存，已从服务器回读校验，并已绑定到当前实例。' })
          : t({ en: 'Permissions were saved and verified from the server.', zh: '权限已保存，并已从服务器回读校验。' }),
      );
    } catch (e: any) {
      Alert.alert(t({ en: 'Save Failed', zh: '保存失败' }), e?.message || t({ en: 'Failed to update permissions.', zh: '更新权限失败。' }));
    } finally {
      setIsSaving(false);
    }
  };

  const handleSuspend = () => {
    if (!activeAgent) return;
    Alert.alert(
      t({ en: 'Suspend Agent', zh: '暂停智能体' }),
      t({ en: `Suspend "${activeAgent.name}"? It will be unable to make payments or use tools.`, zh: `确认暂停“${activeAgent.name}”吗？暂停后它将无法付款或使用工具。` }),
      [
        { text: t({ en: 'Cancel', zh: '取消' }), style: 'cancel' },
        {
          text: t({ en: 'Suspend', zh: '暂停' }), style: 'destructive', onPress: async () => {
            try {
              await apiFetch(`/openclaw-connection/instances/${activeAgent.id}/pause`, { method: 'POST' });
              queryClient.invalidateQueries({ queryKey: ['agent-accounts'] });
              Alert.alert(t({ en: 'Agent Suspended', zh: '智能体已暂停' }), t({ en: `${activeAgent.name} is now suspended.`, zh: `${activeAgent.name} 已被暂停。` }));
            } catch { Alert.alert(t({ en: 'Error', zh: '错误' }), t({ en: 'Failed to suspend agent.', zh: '暂停智能体失败。' })); }
          },
        },
      ],
    );
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Agent Selector */}
      {activeAgent ? (
        <View style={styles.agentBadge}>
          <Text style={styles.agentBadgeIcon}>🤖</Text>
          <View style={{ flex: 1 }}>
            <Text style={styles.agentBadgeName}>{activeAgent.name}</Text>
            <Text style={styles.agentBadgeId}>{activeAgent.agentUniqueId}</Text>
          </View>
          <View style={[styles.statusDot, {
            backgroundColor: activeAgent.status === 'active' ? colors.success : colors.error
          }]} />
        </View>
      ) : (
        <View style={styles.noAgentBox}>
          <Text style={styles.noAgentText}>{t({ en: 'No agent selected. Go to Agent Accounts to set one up.', zh: '当前未选择智能体。请前往“智能体账户”先创建或选择一个。' })}</Text>
        </View>
      )}

      {activeInstance?.id ? (
        <View style={styles.instanceBindingCard}>
          <Text style={styles.instanceBindingTitle}>{t({ en: 'Applies to current instance', zh: '应用到当前实例' })}</Text>
          <Text style={styles.instanceBindingText}>
            {t({ en: `${activeInstance.name} will use the selected Agent Account profile for tool and payment permissions.`, zh: `${activeInstance.name} 将使用当前选中的 Agent Account 作为工具与支付权限档案。` })}
          </Text>
        </View>
      ) : null}
      {agents.length > 1 && (
        <View style={styles.accountPickerWrap}>
          <Text style={styles.accountPickerTitle}>{t({ en: 'Choose the account to configure', zh: '选择要配置的账户' })}</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.accountPickerRow}>
            {agents.map((agent) => {
              const selected = agent.id === activeAgent?.id;
              return (
                <TouchableOpacity
                  key={agent.id}
                  style={[styles.accountChip, selected && styles.accountChipActive]}
                  onPress={() => setSelectedAgentId(agent.id)}
                >
                  <Text style={[styles.accountChipText, selected && styles.accountChipTextActive]}>{agent.name}</Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
          {!agentAccountId && (
            <Text style={styles.accountPickerHint}>{t({ en: 'Permissions are saved to the selected Agent Account and verified after saving.', zh: '权限会保存到当前选中的智能体账户，并在保存后回读校验。' })}</Text>
          )}
        </View>
      )}

      {/* ── AI Model Preference ── */}
      <SectionHeader icon="🧠" title={t({ en: 'AI Model Preference', zh: 'AI 模型偏好' })} />
      <View style={styles.section}>
        <View style={styles.permRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.permLabel}>{t({ en: 'Preferred Model', zh: '首选模型' })}</Text>
            <Text style={styles.permSub}>
              {t({ en: 'Override the global model for this agent', zh: '为此智能体指定专属模型（覆盖全局设置）' })}
            </Text>
          </View>
        </View>
        <View style={styles.divider} />
        <TouchableOpacity
          style={[styles.permRow, { paddingVertical: 14 }]}
          onPress={() => setShowModelPicker(true)}
        >
          <Text style={{ fontSize: 14, color: colors.textPrimary, flex: 1 }}>{modelDisplayLabel}</Text>
          <Text style={{ fontSize: 12, color: colors.textMuted }}>▸</Text>
        </TouchableOpacity>
        {preferredModel && (
          <>
            <View style={styles.divider} />
            <TouchableOpacity
              style={[styles.permRow, { paddingVertical: 10 }]}
              onPress={() => { setPreferredProvider(undefined); setPreferredModel(undefined); }}
            >
              <Text style={{ fontSize: 13, color: colors.error }}>
                {t({ en: '✕ Reset to Platform Default', zh: '✕ 恢复为平台默认' })}
              </Text>
            </TouchableOpacity>
          </>
        )}
      </View>

      {/* ── Voice Preference ── */}
      <SectionHeader icon="🎙️" title={t({ en: 'Agent Voice', zh: '智能体音色' })} />
      <View style={styles.section}>
        <View style={styles.permRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.permLabel}>{t({ en: 'Selected Voice', zh: '已选音色' })}</Text>
            <Text style={styles.permSub}>
              {t({ en: 'Configure TTS voice personality', zh: '配置文本转语音的个性发音' })}
            </Text>
          </View>
        </View>
        <View style={styles.divider} />
        <TouchableOpacity
          style={[styles.permRow, { paddingVertical: 14 }]}
          onPress={() => setShowVoicePicker(true)}
        >
          <Text style={{ fontSize: 14, color: colors.textPrimary, flex: 1, textTransform: 'capitalize' }}>
            {agentVoice || t({ en: 'Default Server Voice', zh: '默认服务器音色' })}
          </Text>
          <Text style={{ fontSize: 12, color: colors.textMuted }}>▸</Text>
        </TouchableOpacity>
        {agentVoice && (
          <>
            <View style={styles.divider} />
            <TouchableOpacity
              style={[styles.permRow, { paddingVertical: 10 }]}
              onPress={() => setAgentVoice(undefined)}
            >
              <Text style={{ fontSize: 13, color: colors.error }}>
                {t({ en: '✕ Reset to Default', zh: '✕ 恢复默认' })}
              </Text>
            </TouchableOpacity>
          </>
        )}
      </View>

      {/* Voice picker modal */}
      <Modal visible={showVoicePicker} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.modalTopRow}>
              <Text style={styles.modalTopTitle}>{t({ en: 'Select Agent Voice', zh: '选择语音音色' })}</Text>
              <TouchableOpacity onPress={() => setShowVoicePicker(false)}>
                <Text style={{ fontSize: 18, color: colors.textMuted, padding: 4 }}>✕</Text>
              </TouchableOpacity>
            </View>
            <FlatList
              data={availableVoices}
              keyExtractor={v => v}
              renderItem={({ item: v }) => {
                const isSelected = agentVoice === v;
                return (
                  <TouchableOpacity
                    style={[styles.modelPickRow, isSelected && { backgroundColor: colors.primary + '10' }]}
                    onPress={() => {
                      setAgentVoice(v);
                      setShowVoicePicker(false);
                    }}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.modelPickLabel, isSelected && { color: colors.primary }, { textTransform: 'capitalize' }]}>{v}</Text>
                    </View>
                    {isSelected && <Text style={{ color: colors.primary, marginLeft: 8 }}>✓</Text>}
                  </TouchableOpacity>
                );
              }}
            />
          </View>
        </View>
      </Modal>

      {/* Model picker modal */}
      <Modal visible={showModelPicker} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.modalTopRow}>
              <Text style={styles.modalTopTitle}>{t({ en: 'Select Model for Agent', zh: '为 Agent 选择模型' })}</Text>
              <TouchableOpacity onPress={() => setShowModelPicker(false)}>
                <Text style={{ fontSize: 18, color: colors.textMuted, padding: 4 }}>✕</Text>
              </TouchableOpacity>
            </View>
            <FlatList
              data={configuredProviders.length > 0 ? configuredProviders : catalog}
              keyExtractor={p => p.id}
              ListHeaderComponent={
                configuredProviders.length > 0 ? (
                  <Text style={{ fontSize: 11, color: colors.textMuted, paddingHorizontal: 16, paddingTop: 8 }}>
                    {t({ en: 'Showing your configured providers. Configure more in AI Settings.', zh: '显示已配置的厂商。可在 AI 设置中配置更多。' })}
                  </Text>
                ) : (
                  <Text style={{ fontSize: 11, color: colors.textMuted, paddingHorizontal: 16, paddingTop: 8 }}>
                    {t({ en: 'No providers configured yet. Configure API keys in Settings first.', zh: '尚未配置厂商。请先在设置中配置 API 密钥。' })}
                  </Text>
                )
              }
              renderItem={({ item: prov }) => (
                <View>
                  <Text style={styles.modelGroupHeader}>{prov.icon} {prov.name}{userConfigs.find(c => c.providerId === prov.id)?.isDefault ? ' ⭐' : ''}</Text>
                  {prov.models.map(m => {
                    const isSelected = preferredProvider === prov.id && preferredModel === m.id;
                    const fmtCtx = m.contextWindow >= 1000000 ? `${(m.contextWindow / 1000000).toFixed(m.contextWindow % 1000000 === 0 ? 0 : 1)}M` : `${(m.contextWindow / 1000).toFixed(0)}K`;
                    return (
                      <TouchableOpacity
                        key={m.id}
                        style={[styles.modelPickRow, isSelected && { backgroundColor: colors.primary + '10' }]}
                        onPress={() => {
                          setPreferredProvider(prov.id);
                          setPreferredModel(m.id);
                          setShowModelPicker(false);
                        }}
                      >
                        <View style={{ flex: 1 }}>
                          <Text style={[styles.modelPickLabel, isSelected && { color: colors.primary }]}>{m.label}</Text>
                          {(m.inputPrice || m.outputPrice) ? (
                            <Text style={styles.modelPickCaps}>📥 {m.inputPrice}  📤 {m.outputPrice}  ·  {fmtCtx} ctx{m.multimodal ? '  ·  🖼' : ''}</Text>
                          ) : (
                            <Text style={styles.modelPickCaps}>{fmtCtx} ctx{m.multimodal ? '  ·  🖼 多模态' : ''}{m.freeApi ? `  ·  🆓 ${m.freeNote || 'Free'}` : ''}</Text>
                          )}
                          {m.positioning && <Text style={styles.modelPickCaps}>{m.positioning}</Text>}
                        </View>
                        {isSelected && <Text style={{ color: colors.primary, marginLeft: 8 }}>✓</Text>}
                      </TouchableOpacity>
                    );
                  })}
                </View>
              )}
            />
          </View>
        </View>
      </Modal>

      {/* ── Payment Permissions ── */}
      <SectionHeader icon="💳" title={t({ en: 'Payment Permissions', zh: '支付权限' })} />
      <View style={styles.section}>
        <PermRow
          label={t({ en: 'Allow Autonomous Payment', zh: '允许自主支付' })}
          sub={t({ en: 'Agent can initiate transactions without asking you', zh: '智能体可在无需询问你的情况下发起交易' })}
          value={perms.autonomousPaymentEnabled}
          onChange={(v) => updatePerm('autonomousPaymentEnabled', v)}
        />
        <View style={styles.divider} />
        {/* Confirmation threshold */}
        <View style={styles.permRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.permLabel}>{t({ en: 'Require Approval ≥', zh: '达到此金额需审批 ≥' })}</Text>
            <Text style={styles.permSub}>{t({ en: 'You\'ll be asked to confirm payments above this amount', zh: '超过此金额的支付将要求你确认' })}</Text>
          </View>
          {editingThreshold ? (
            <View style={styles.thresholdEdit}>
              <Text style={styles.currency}>$</Text>
              <TextInput
                style={styles.thresholdInput}
                value={thresholdInput}
                onChangeText={setThresholdInput}
                keyboardType="decimal-pad"
                autoFocus
                onBlur={() => {
                  updatePerm('confirmationThreshold', Number(thresholdInput) || 50);
                  setEditingThreshold(false);
                }}
              />
            </View>
          ) : (
            <TouchableOpacity onPress={() => setEditingThreshold(true)} style={styles.editableValue}>
              <Text style={styles.editableText}>${perms.confirmationThreshold}</Text>
              <Text style={styles.editHint}>  {t({ en: 'Edit', zh: '编辑' })}</Text>
            </TouchableOpacity>
          )}
        </View>
        <View style={styles.divider} />
        {/* Currency */}
        <View style={styles.permRow}>
          <Text style={styles.permLabel}>{t({ en: 'Allowed Currencies', zh: '允许的币种' })}</Text>
          <View style={styles.currencyRow}>
            {CURRENCY_OPTIONS.map((c) => (
              <TouchableOpacity
                key={c}
                style={[styles.currencyChip, perms.allowedCurrencies.includes(c) && styles.currencyChipActive]}
                onPress={() => toggleCurrency(c)}
              >
                <Text style={[styles.currencyChipText, perms.allowedCurrencies.includes(c) && styles.currencyChipTextActive]}>
                  {c}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
        <View style={styles.divider} />
        {/* Spending limits from agent account */}
        {activeAgent?.spendingLimits && (
          <>
            <View style={styles.limitRow}>
              <Text style={styles.limitLabel}>{t({ en: 'Single TX Limit', zh: '单笔限额' })}</Text>
              <Text style={styles.limitValue}>${activeAgent.spendingLimits.singleTxLimit}</Text>
            </View>
            <View style={styles.limitRow}>
              <Text style={styles.limitLabel}>{t({ en: 'Daily Limit', zh: '日限额' })}</Text>
              <Text style={styles.limitValue}>${activeAgent.spendingLimits.dailyLimit}</Text>
            </View>
            <View style={styles.limitRow}>
              <Text style={styles.limitLabel}>{t({ en: 'Monthly Limit', zh: '月限额' })}</Text>
              <Text style={styles.limitValue}>${activeAgent.spendingLimits.monthlyLimit}</Text>
            </View>
          </>
        )}
      </View>

      {/* ── Device Control ── */}
      <SectionHeader icon="💻" title={t({ en: 'Device Control Permissions', zh: '设备控制权限' })} />
      <View style={styles.section}>
        <PermRow
          label={t({ en: '📁 File Read', zh: '📁 文件读取' })}
          sub={perms.fileReadEnabled ? `Scope: ${perms.fileReadScope}` : undefined}
          value={perms.fileReadEnabled}
          onChange={(v) => updatePerm('fileReadEnabled', v)}
        />
        <View style={styles.divider} />
        <PermRow
          label={t({ en: '🖥 Launch Programs', zh: '🖥 启动程序' })}
          value={perms.programLaunchEnabled}
          onChange={(v) => updatePerm('programLaunchEnabled', v)}
        />
        <View style={styles.divider} />
        <PermRow
          label={t({ en: '📸 Screenshot', zh: '📸 截图' })}
          value={perms.screenshotEnabled}
          onChange={(v) => updatePerm('screenshotEnabled', v)}
        />
        <View style={styles.divider} />
        <PermRow
          label={t({ en: '📍 GPS Location', zh: '📍 GPS 定位' })}
          sub={perms.gpsEnabled ? `Precision: ${perms.gpsAccuracy}` : undefined}
          value={perms.gpsEnabled}
          onChange={(v) => updatePerm('gpsEnabled', v)}
        />
      </View>

      {/* ── Network & Tools ── */}
      <SectionHeader icon="🌐" title={t({ en: 'Network & Tool Permissions', zh: '网络与工具权限' })} />
      <View style={styles.section}>
        <PermRow
          label={t({ en: '🔍 Web Search', zh: '🔍 网络搜索' })}
          value={perms.webSearchEnabled}
          onChange={(v) => updatePerm('webSearchEnabled', v)}
        />
        <View style={styles.divider} />
        <PermRow
          label={t({ en: '📧 Email Send', zh: '📧 邮件发送' })}
          sub={!perms.emailEnabled ? t({ en: 'Requires approval to enable', zh: '启用前需要审批' }) : undefined}
          value={perms.emailEnabled}
          onChange={(v) => updatePerm('emailEnabled', v)}
        />
        <View style={styles.divider} />
        <PermRow
          label={t({ en: '🐦 Twitter / X Post', zh: '🐦 Twitter / X 发帖' })}
          sub={perms.twitterEnabled ? t({ en: 'Auto mode', zh: '自动模式' }) : undefined}
          value={perms.twitterEnabled}
          onChange={(v) => updatePerm('twitterEnabled', v)}
        />
        <View style={styles.divider} />
        <PermRow
          label={t({ en: '💬 Telegram Reply', zh: '💬 Telegram 回复' })}
          sub={perms.telegramEnabled ? t({ en: 'Auto mode', zh: '自动模式' }) : undefined}
          value={perms.telegramEnabled}
          onChange={(v) => updatePerm('telegramEnabled', v)}
        />
        <View style={styles.divider} />
        <View style={styles.permRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.permLabel}>{t({ en: '🔧 MCP Tools Authorized', zh: '🔧 已授权 MCP 工具' })}</Text>
            <Text style={styles.permSub}>{t({ en: `${perms.mcpToolCount} tools allowed`, zh: `已允许 ${perms.mcpToolCount} 个工具` })}</Text>
          </View>
          <TouchableOpacity style={styles.manageBtn}>
            <Text style={styles.manageBtnText}>{t({ en: 'Manage →', zh: '管理 →' })}</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* ── Skill Management ── */}
      <SectionHeader icon="🛠" title={t({ en: 'Skill Management', zh: '技能管理' })} />
      <View style={styles.section}>
        <PermRow
          label={t({ en: '🔎 Search Skills', zh: '🔎 搜索技能' })}
          sub={t({ en: 'Agent can search for AI skills and plugins', zh: '智能体可搜索 AI 技能和插件' })}
          value={perms.skillSearchEnabled}
          onChange={(v) => updatePerm('skillSearchEnabled', v)}
        />
        <View style={styles.divider} />
        <PermRow
          label={t({ en: '📥 Install Skills', zh: '📥 安装技能' })}
          sub={t({ en: 'Agent can install skills from marketplace', zh: '智能体可从市场安装技能' })}
          value={perms.skillInstallEnabled}
          onChange={(v) => updatePerm('skillInstallEnabled', v)}
        />
        <View style={styles.divider} />
        <PermRow
          label={t({ en: '▶️ Execute Skills', zh: '▶️ 执行技能' })}
          sub={t({ en: 'Agent can run installed skills', zh: '智能体可运行已安装的技能' })}
          value={perms.skillExecuteEnabled}
          onChange={(v) => updatePerm('skillExecuteEnabled', v)}
        />
        <View style={styles.divider} />
        <PermRow
          label={t({ en: '📤 Publish Skills', zh: '📤 发布技能' })}
          sub={t({ en: 'Agent can publish new skills to marketplace', zh: '智能体可向市场发布新技能' })}
          value={perms.skillPublishEnabled}
          onChange={(v) => updatePerm('skillPublishEnabled', v)}
        />
      </View>

      {/* ── Commerce & Wallet ── */}
      <SectionHeader icon="🛒" title={t({ en: 'Commerce & Wallet', zh: '商城与钱包' })} />
      <View style={styles.section}>
        <PermRow
          label={t({ en: '🏪 Browse Marketplace', zh: '🏪 浏览商城' })}
          sub={t({ en: 'Agent can search products, resources, and services', zh: '智能体可搜索商品、资源和服务' })}
          value={perms.commerceBrowseEnabled}
          onChange={(v) => updatePerm('commerceBrowseEnabled', v)}
        />
        <View style={styles.divider} />
        <PermRow
          label={t({ en: '🛍 Purchase Items', zh: '🛍 购买商品' })}
          sub={t({ en: 'Agent can buy and checkout items', zh: '智能体可购买并结算商品' })}
          value={perms.commercePurchaseEnabled}
          onChange={(v) => updatePerm('commercePurchaseEnabled', v)}
        />
        <View style={styles.divider} />
        <PermRow
          label={t({ en: '📦 Manage Orders', zh: '📦 管理订单' })}
          sub={t({ en: 'Agent can check order status and details', zh: '智能体可查看订单状态和详情' })}
          value={perms.orderManageEnabled}
          onChange={(v) => updatePerm('orderManageEnabled', v)}
        />
        <View style={styles.divider} />
        <PermRow
          label={t({ en: '💰 View Wallet Balance', zh: '💰 查看钱包余额' })}
          sub={t({ en: 'Agent can read wallet balance and asset overview', zh: '智能体可读取钱包余额和资产概览' })}
          value={perms.walletReadEnabled}
          onChange={(v) => updatePerm('walletReadEnabled', v)}
        />
        <View style={styles.divider} />
        <PermRow
          label={t({ en: '⚡ Quick Pay / Transfer', zh: '⚡ 快速支付/转账' })}
          sub={t({ en: 'Agent can send payments and transfers', zh: '智能体可发送付款和转账' })}
          value={perms.quickpayEnabled}
          onChange={(v) => updatePerm('quickpayEnabled', v)}
          destructive
        />
        <View style={styles.divider} />
        <PermRow
          label={t({ en: '🔐 x402 Paywall Access', zh: '🔐 x402 付费墙访问' })}
          sub={t({ en: 'Agent can pay for paywalled content/APIs', zh: '智能体可支付付费内容/API 访问' })}
          value={perms.x402PayEnabled}
          onChange={(v) => updatePerm('x402PayEnabled', v)}
          destructive
        />
      </View>

      {/* ── Agent-to-Agent (A2A) ── */}
      <SectionHeader icon="🤖" title={t({ en: 'Agent-to-Agent (A2A)', zh: '智能体协作 (A2A)' })} />
      <View style={styles.section}>
        <PermRow
          label={t({ en: '🔍 Discover Agents', zh: '🔍 发现智能体' })}
          sub={t({ en: 'Agent can find other agents on the network', zh: '智能体可在网络上发现其他智能体' })}
          value={perms.a2aDiscoverEnabled}
          onChange={(v) => updatePerm('a2aDiscoverEnabled', v)}
        />
        <View style={styles.divider} />
        <PermRow
          label={t({ en: '🤝 Invoke Agents', zh: '🤝 调用智能体' })}
          sub={t({ en: 'Agent can delegate tasks to other agents', zh: '智能体可将任务委托给其他智能体' })}
          value={perms.a2aInvokeEnabled}
          onChange={(v) => updatePerm('a2aInvokeEnabled', v)}
        />
      </View>

      {/* ── Task Marketplace ── */}
      <SectionHeader icon="📋" title={t({ en: 'Task Marketplace', zh: '任务市场' })} />
      <View style={styles.section}>
        <PermRow
          label={t({ en: '🔎 Search Tasks', zh: '🔎 搜索任务' })}
          sub={t({ en: 'Agent can browse tasks and bounties', zh: '智能体可浏览任务和悬赏' })}
          value={perms.taskSearchEnabled}
          onChange={(v) => updatePerm('taskSearchEnabled', v)}
        />
        <View style={styles.divider} />
        <PermRow
          label={t({ en: '📝 Post Tasks', zh: '📝 发布任务' })}
          sub={t({ en: 'Agent can create new tasks and bounties', zh: '智能体可创建新任务和悬赏' })}
          value={perms.taskPostEnabled}
          onChange={(v) => updatePerm('taskPostEnabled', v)}
        />
        <View style={styles.divider} />
        <PermRow
          label={t({ en: '✅ Accept Tasks', zh: '✅ 接受任务' })}
          sub={t({ en: 'Agent can accept tasks from marketplace', zh: '智能体可从市场接受任务' })}
          value={perms.taskAcceptEnabled}
          onChange={(v) => updatePerm('taskAcceptEnabled', v)}
        />
        <View style={styles.divider} />
        <PermRow
          label={t({ en: '📤 Submit Deliverables', zh: '📤 提交交付物' })}
          sub={t({ en: 'Agent can submit completed work', zh: '智能体可提交完成的工作' })}
          value={perms.taskSubmitEnabled}
          onChange={(v) => updatePerm('taskSubmitEnabled', v)}
        />
      </View>

      {/* ── Resources ── */}
      <SectionHeader icon="📦" title={t({ en: 'Resources & Publishing', zh: '资源与发布' })} />
      <View style={styles.section}>
        <PermRow
          label={t({ en: '🔎 Search Resources', zh: '🔎 搜索资源' })}
          sub={t({ en: 'Agent can find APIs, datasets, models', zh: '智能体可搜索 API、数据集、模型' })}
          value={perms.resourceSearchEnabled}
          onChange={(v) => updatePerm('resourceSearchEnabled', v)}
        />
        <View style={styles.divider} />
        <PermRow
          label={t({ en: '📤 Publish Resources', zh: '📤 发布资源' })}
          sub={t({ en: 'Agent can publish resources to marketplace', zh: '智能体可向市场发布资源' })}
          value={perms.resourcePublishEnabled}
          onChange={(v) => updatePerm('resourcePublishEnabled', v)}
        />
      </View>

      {/* Save Button */}
      <TouchableOpacity
        style={[styles.saveBtn, (isSaving || !activeAgent) && styles.saveBtnDisabled]}
        onPress={handleSave}
        disabled={isSaving || !activeAgent}
      >
        <Text style={styles.saveBtnText}>{isSaving ? '⏳ ' : '💾 '}{t({ en: 'Save Permissions', zh: '保存权限设置' })}</Text>
      </TouchableOpacity>

      {/* ── Danger Zone ── */}
      <SectionHeader icon="⚠️" title={t({ en: 'Danger Zone', zh: '危险操作' })} />
      <View style={styles.dangerRow}>
        <TouchableOpacity style={styles.dangerBtn} onPress={handleSuspend}>
          <Text style={styles.dangerBtnText}>⏸ {t({ en: 'Suspend Agent', zh: '暂停智能体' })}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.dangerBtn, { borderColor: colors.error }]}
          onPress={() => Alert.alert(t({ en: 'Terminate Agent', zh: '终止智能体' }), t({ en: 'Permanently terminate this agent? This cannot be undone.', zh: '确认永久终止该智能体吗？此操作不可撤销。' }), [
            { text: t({ en: 'Cancel', zh: '取消' }), style: 'cancel' },
            { text: t({ en: 'Terminate', zh: '终止' }), style: 'destructive', onPress: () => {} },
          ])}
        >
          <Text style={[styles.dangerBtnText, { color: colors.error }]}>🗑 {t({ en: 'Terminate Agent', zh: '终止智能体' })}</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgPrimary },
  content: { padding: 16, paddingBottom: 48, gap: 8 },
  accountPickerWrap: { gap: 10, marginBottom: 4 },
  accountPickerTitle: { color: colors.textMuted, fontSize: 12, fontWeight: '600' },
  accountPickerRow: { gap: 8 },
  accountChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: colors.bgCard,
    borderWidth: 1,
    borderColor: colors.border,
  },
  accountChipActive: { backgroundColor: colors.accent + '22', borderColor: colors.accent },
  accountChipText: { color: colors.textPrimary, fontSize: 12, fontWeight: '600' },
  accountChipTextActive: { color: colors.accent },
  accountPickerHint: { color: colors.textMuted, fontSize: 12, lineHeight: 18 },
  agentBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: colors.bgCard, borderRadius: 14, padding: 14,
    borderWidth: 1, borderColor: colors.border, marginBottom: 4,
  },
  agentBadgeIcon: { fontSize: 28 },
  agentBadgeName: { fontSize: 16, fontWeight: '700', color: colors.textPrimary },
  agentBadgeId: { fontSize: 11, color: colors.textMuted, marginTop: 2 },
  statusDot: { width: 10, height: 10, borderRadius: 5 },
  noAgentBox: {
    backgroundColor: colors.bgCard, borderRadius: 14, padding: 20,
    borderWidth: 1, borderColor: colors.border, alignItems: 'center',
  },
  noAgentText: { color: colors.textMuted, fontSize: 14, textAlign: 'center' },
  instanceBindingCard: {
    backgroundColor: colors.bgCard,
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.accent + '44',
    marginBottom: 4,
  },
  instanceBindingTitle: { color: colors.textPrimary, fontSize: 13, fontWeight: '700', marginBottom: 4 },
  instanceBindingText: { color: colors.textMuted, fontSize: 12, lineHeight: 18 },
  sectionHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 4, paddingTop: 12, paddingBottom: 4,
  },
  sectionIcon: { fontSize: 16 },
  sectionTitle: { fontSize: 12, fontWeight: '700', color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 },
  section: {
    backgroundColor: colors.bgCard, borderRadius: 14,
    borderWidth: 1, borderColor: colors.border, overflow: 'hidden',
  },
  permRow: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14,
    paddingVertical: 12, gap: 12,
  },
  permLabel: { fontSize: 14, fontWeight: '600', color: colors.textPrimary },
  permSub: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  divider: { height: 1, backgroundColor: colors.border, marginLeft: 14 },
  thresholdEdit: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  currency: { fontSize: 16, color: colors.accent, fontWeight: '700' },
  thresholdInput: {
    color: colors.textPrimary, fontSize: 16, fontWeight: '700',
    borderBottomWidth: 1, borderColor: colors.accent, minWidth: 60, textAlign: 'right',
  },
  editableValue: { flexDirection: 'row', alignItems: 'center' },
  editableText: { fontSize: 15, fontWeight: '700', color: colors.accent },
  editHint: { fontSize: 11, color: colors.textMuted },
  currencyRow: { flexDirection: 'row', gap: 6 },
  currencyChip: {
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8,
    backgroundColor: colors.bgSecondary, borderWidth: 1, borderColor: colors.border,
  },
  currencyChipActive: { borderColor: colors.accent, backgroundColor: colors.accent + '22' },
  currencyChipText: { fontSize: 12, color: colors.textMuted, fontWeight: '600' },
  currencyChipTextActive: { color: colors.accent },
  limitRow: {
    flexDirection: 'row', justifyContent: 'space-between',
    paddingHorizontal: 14, paddingVertical: 9,
    borderTopWidth: 1, borderColor: colors.border,
  },
  limitLabel: { fontSize: 13, color: colors.textSecondary },
  limitValue: { fontSize: 13, fontWeight: '700', color: colors.textPrimary },
  manageBtn: { paddingHorizontal: 12, paddingVertical: 6, backgroundColor: colors.bgSecondary, borderRadius: 8 },
  manageBtnText: { fontSize: 13, color: colors.accent, fontWeight: '600' },
  saveBtn: {
    backgroundColor: colors.primary, borderRadius: 14, padding: 15,
    alignItems: 'center', marginTop: 4,
  },
  saveBtnDisabled: { opacity: 0.6 },
  saveBtnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  dangerRow: { flexDirection: 'row', gap: 10, marginTop: 4 },
  dangerBtn: {
    flex: 1, alignItems: 'center', padding: 13,
    backgroundColor: colors.bgCard, borderRadius: 12,
    borderWidth: 1, borderColor: '#f59e0b66',
  },
  dangerBtnText: { color: '#f59e0b', fontWeight: '700', fontSize: 14 },
  // Model picker modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalSheet: {
    backgroundColor: colors.bgPrimary, borderTopLeftRadius: 16, borderTopRightRadius: 16,
    maxHeight: '65%', paddingBottom: 30,
  },
  modalTopRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  modalTopTitle: { fontSize: 16, fontWeight: '700', color: colors.textPrimary },
  modelGroupHeader: {
    fontSize: 13, fontWeight: '700', color: colors.textMuted,
    paddingHorizontal: 16, paddingTop: 14, paddingBottom: 6,
    backgroundColor: colors.bgSecondary,
  },
  modelPickRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border,
  },
  modelPickLabel: { fontSize: 14, fontWeight: '600', color: colors.textPrimary, flex: 1 },
  modelPickCaps: { fontSize: 11, color: colors.textMuted },
});
