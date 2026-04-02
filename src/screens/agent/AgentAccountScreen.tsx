import React, { useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, FlatList,
  RefreshControl, ActivityIndicator, Alert, Modal,
  TextInput, ScrollView, Platform, StatusBar,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { colors } from '../../theme/colors';
import { useI18n } from '../../stores/i18nStore';
import {
  fetchUnifiedAgents,
  createUnifiedAgent,
  type UnifiedAgent,
  type CreateUnifiedAgentDto,
} from '../../services/unifiedAgent';
import { apiFetch } from '../../services/api';
import type { AgentStackParamList } from '../../navigation/types';

// ──────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────
type AgentAccount = UnifiedAgent;
type CreateAgentDto = CreateUnifiedAgentDto;

// ──────────────────────────────────────────────
// API helpers
// ──────────────────────────────────────────────

async function fetchAgentAccounts(): Promise<AgentAccount[]> {
  return fetchUnifiedAgents();
}

async function createAgentAccount(dto: CreateAgentDto): Promise<AgentAccount> {
  return createUnifiedAgent(dto);
}

async function openWalletForAgent(agentId: string): Promise<{ walletAddress: string }> {
  // Creates or retrieves the MPC wallet associated with this agent
  const res = await apiFetch<{ walletAddress: string }>('/mpc-wallet/create', {
    method: 'POST',
    body: JSON.stringify({ agentAccountId: agentId, password: `agent_${agentId}_v1` }),
  });
  return res;
}

async function suspendAgent(agentId: string): Promise<void> {
  // Use openclaw-connection to pause the instance
  await apiFetch(`/openclaw-connection/instances/${agentId}/pause`, { method: 'POST' });
}

async function resumeAgent(agentId: string): Promise<void> {
  await apiFetch(`/openclaw-connection/instances/${agentId}/resume`, { method: 'POST' });
}

async function generateAgentApiKey(agentId: string): Promise<{ apiKey: string; prefix: string }> {
  const res = await apiFetch<{ data: { apiKey: string; prefix: string } }>(`/agent-accounts/${agentId}/api-key`, {
    method: 'POST',
  });
  return res.data;
}

// Balance API
interface AgentBalance {
  platformBalance: { amount: string; currency: string };
  onchainBalance?: { amount: string; currency: string; chain: string };
}

async function fetchAgentBalance(agentAccountId: string): Promise<AgentBalance> {
  const res = await apiFetch<AgentBalance>(`/agent-accounts/${agentAccountId}/balance`);
  return res;
}

// On-chain status API
interface OnchainStatus {
  registered: boolean;
  chain?: string;
  contractAddress?: string;
  attestationUid?: string;
  status?: 'pending' | 'confirmed' | 'failed';
}

async function fetchOnchainStatus(agentAccountId: string): Promise<OnchainStatus> {
  const res = await apiFetch<OnchainStatus>(`/agent-accounts/${agentAccountId}/onchain-status`);
  return res;
}

async function registerOnchain(agentAccountId: string): Promise<any> {
  return apiFetch(`/agent-accounts/${agentAccountId}/onchain-register`, { method: 'POST' });
}

// ──────────────────────────────────────────────
// Create Agent Modal
// ──────────────────────────────────────────────

const AGENT_TYPES = ['personal', 'assistant', 'commerce', 'research', 'automation'];

function CreateAgentModal({
  visible,
  onClose,
  onCreate,
  loading,
}: {
  visible: boolean;
  onClose: () => void;
  onCreate: (dto: CreateAgentDto) => void;
  loading: boolean;
}) {
  const { t } = useI18n();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [agentType, setAgentType] = useState('personal');
  const [singleTxLimit, setSingleTxLimit] = useState('100');
  const [dailyLimit, setDailyLimit] = useState('500');
  const [monthlyLimit, setMonthlyLimit] = useState('2000');

  const handleCreate = () => {
    if (!name.trim()) {
      Alert.alert(t({ en: 'Name required', zh: '需要名称' }), t({ en: 'Please give your agent a name.', zh: '请为你的智能体填写名称。' }));
      return;
    }
    onCreate({
      name: name.trim(),
      description: description.trim() || undefined,
      spendingLimits: {
        singleTxLimit: Number(singleTxLimit) || 100,
        dailyLimit: Number(dailyLimit) || 500,
        monthlyLimit: Number(monthlyLimit) || 2000,
        currency: 'USD',
      },
    });
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={modal.root}>
        <View style={modal.header}>
          <TouchableOpacity onPress={onClose}>
            <Text style={modal.cancel}>{t({ en: 'Cancel', zh: '取消' })}</Text>
          </TouchableOpacity>
          <Text style={modal.title}>{t({ en: 'New Agent Account', zh: '新建智能体账户' })}</Text>
          <TouchableOpacity onPress={handleCreate} disabled={loading}>
            {loading ? (
              <ActivityIndicator color={colors.accent} />
            ) : (
              <Text style={modal.createBtn}>{t({ en: 'Create', zh: '创建' })}</Text>
            )}
          </TouchableOpacity>
        </View>

        <ScrollView style={modal.body} keyboardShouldPersistTaps="handled">
          <Text style={modal.label}>{t({ en: 'Agent Name *', zh: '智能体名称 *' })}</Text>
          <TextInput
            style={modal.input}
            placeholder={t({ en: 'e.g. My Research Agent', zh: '例如：我的研究智能体' })}
            placeholderTextColor={colors.textMuted}
            value={name}
            onChangeText={setName}
            autoFocus
          />

          <Text style={modal.label}>{t({ en: 'Description', zh: '描述' })}</Text>
          <TextInput
            style={[modal.input, { minHeight: 70, textAlignVertical: 'top' }]}
            placeholder={t({ en: 'What does this agent do?', zh: '这个智能体负责什么？' })}
            placeholderTextColor={colors.textMuted}
            value={description}
            onChangeText={setDescription}
            multiline
          />

          <Text style={modal.label}>{t({ en: 'Agent Type', zh: '智能体类型' })}</Text>
          <View style={modal.typeRow}>
            {AGENT_TYPES.map((typeKey) => (
              <TouchableOpacity
                key={typeKey}
                style={[modal.typeChip, agentType === typeKey && modal.typeChipActive]}
                onPress={() => setAgentType(typeKey)}
              >
                <Text style={[modal.typeText, agentType === typeKey && modal.typeTextActive]}>
                  {t({ en: typeKey, zh: typeKey === 'personal' ? '个人' : typeKey === 'assistant' ? '助理' : typeKey === 'commerce' ? '商业' : typeKey === 'research' ? '研究' : '自动化' })}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={modal.label}>{t({ en: 'Spending Limits (USD)', zh: '支出限制（USD）' })}</Text>
          <View style={modal.limitsGrid}>
            <View style={modal.limitItem}>
              <Text style={modal.limitLabel}>{t({ en: 'Single TX', zh: '单笔' })}</Text>
              <TextInput
                style={modal.limitInput}
                value={singleTxLimit}
                onChangeText={setSingleTxLimit}
                keyboardType="decimal-pad"
                placeholderTextColor={colors.textMuted}
              />
            </View>
            <View style={modal.limitItem}>
              <Text style={modal.limitLabel}>{t({ en: 'Daily', zh: '每日' })}</Text>
              <TextInput
                style={modal.limitInput}
                value={dailyLimit}
                onChangeText={setDailyLimit}
                keyboardType="decimal-pad"
                placeholderTextColor={colors.textMuted}
              />
            </View>
            <View style={modal.limitItem}>
              <Text style={modal.limitLabel}>{t({ en: 'Monthly', zh: '每月' })}</Text>
              <TextInput
                style={modal.limitInput}
                value={monthlyLimit}
                onChangeText={setMonthlyLimit}
                keyboardType="decimal-pad"
                placeholderTextColor={colors.textMuted}
              />
            </View>
          </View>

          <View style={modal.infoBox}>
            <Text style={modal.infoText}>
              💡 {t({ en: 'Spending limits protect you by capping how much this agent can pay autonomously.', zh: '支出限制可约束该智能体的自主支付额度，保护你的资金安全。' })}
            </Text>
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}

// ──────────────────────────────────────────────
// Main Screen
// ──────────────────────────────────────────────

const STATUS_COLOR: Record<string, string> = {
  active: '#22c55e',
  draft: '#6366f1',
  suspended: '#f59e0b',
  terminated: '#ef4444',
  error: '#ef4444',
  disconnected: '#6b7280',
};

// ──────────────────────────────────────────────
// Balance Badge (inline in agent card)
// ──────────────────────────────────────────────
function BalanceBadge({ agentAccountId, t: _t }: { agentAccountId?: string; t: ReturnType<typeof useI18n>['t'] }) {
  const { data: balance } = useQuery({
    queryKey: ['agent-balance', agentAccountId],
    queryFn: () => fetchAgentBalance(agentAccountId!),
    enabled: !!agentAccountId,
    retry: false,
    staleTime: 30_000,
  });
  if (!balance) return null;
  const amt = parseFloat(balance.platformBalance.amount || '0');
  const chainAmt = balance.onchainBalance ? parseFloat(balance.onchainBalance.amount || '0') : 0;
  return (
    <View style={balBadge.row}>
      <View style={balBadge.chip}>
        <Text style={balBadge.label}>{_t({ en: 'Platform', zh: '平台' })}</Text>
        <Text style={balBadge.value}>${amt.toFixed(2)}</Text>
      </View>
      {chainAmt > 0 && (
        <View style={[balBadge.chip, balBadge.chipChain]}>
          <Text style={[balBadge.label, { color: '#a78bfa' }]}>{_t({ en: 'On-chain', zh: '链上' })}</Text>
          <Text style={[balBadge.value, { color: '#a78bfa' }]}>${chainAmt.toFixed(2)}</Text>
        </View>
      )}
    </View>
  );
}
const balBadge = StyleSheet.create({
  row: { flexDirection: 'row', gap: 6 },
  chip: {
    flex: 1,
    backgroundColor: '#22c55e18',
    borderRadius: 10,
    padding: 8,
    alignItems: 'center',
    gap: 2,
    borderWidth: 1,
    borderColor: '#22c55e33',
  },
  chipChain: {
    backgroundColor: '#a78bfa18',
    borderColor: '#a78bfa33',
  },
  label: { fontSize: 10, color: '#22c55e', fontWeight: '600' },
  value: { fontSize: 14, color: '#22c55e', fontWeight: '800' },
});

// ──────────────────────────────────────────────
// Chain Identity Badge
// ──────────────────────────────────────────────
function ChainIdentityBadge({ agentAccountId, t: _t }: { agentAccountId?: string; t: ReturnType<typeof useI18n>['t'] }) {
  const queryClient = useQueryClient();
  const { data: onchain } = useQuery({
    queryKey: ['onchain-status', agentAccountId],
    queryFn: () => fetchOnchainStatus(agentAccountId!),
    enabled: !!agentAccountId,
    retry: false,
    staleTime: 60_000,
  });
  const [loading, setLoading] = useState(false);

  const handleRegister = async () => {
    if (!agentAccountId) return;
    Alert.alert(
      _t({ en: 'Register On-Chain Identity', zh: '注册链上身份' }),
      _t({ en: 'This will create an on-chain attestation for this agent. Gas fees are subsidized.', zh: '这将为该智能体创建链上身份证明，Gas费由平台补贴。' }),
      [
        { text: _t({ en: 'Cancel', zh: '取消' }), style: 'cancel' },
        {
          text: _t({ en: 'Register', zh: '注册' }),
          onPress: async () => {
            setLoading(true);
            try {
              await registerOnchain(agentAccountId);
              queryClient.invalidateQueries({ queryKey: ['onchain-status', agentAccountId] });
              Alert.alert('✅', _t({ en: 'On-chain registration submitted!', zh: '链上注册已提交！' }));
            } catch (err: any) {
              Alert.alert(_t({ en: 'Error', zh: '错误' }), err?.message || _t({ en: 'Registration failed.', zh: '注册失败。' }));
            } finally {
              setLoading(false);
            }
          },
        },
      ],
    );
  };

  if (!onchain) return null;
  if (onchain.registered) {
    return (
      <View style={chainBadge.confirmed}>
        <Text style={chainBadge.confirmedIcon}>⛓️</Text>
        <View style={{ flex: 1 }}>
          <Text style={chainBadge.confirmedText}>{_t({ en: 'On-Chain Identity', zh: '链上身份' })}</Text>
          <Text style={chainBadge.chainName}>{onchain.chain || 'BSC Testnet'}</Text>
        </View>
        <Text style={chainBadge.confirmedStatus}>{_t({ en: 'Verified', zh: '已认证' })}</Text>
      </View>
    );
  }
  return (
    <TouchableOpacity style={chainBadge.register} onPress={handleRegister} disabled={loading}>
      {loading ? (
        <ActivityIndicator color="#a78bfa" size="small" />
      ) : (
        <>
          <Text style={chainBadge.registerIcon}>⛓️</Text>
          <Text style={chainBadge.registerText}>{_t({ en: 'Register On-Chain Identity', zh: '注册链上身份' })}</Text>
        </>
      )}
    </TouchableOpacity>
  );
}
const chainBadge = StyleSheet.create({
  confirmed: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#a78bfa15',
    borderRadius: 10,
    padding: 10,
    borderWidth: 1,
    borderColor: '#a78bfa33',
  },
  confirmedIcon: { fontSize: 16 },
  confirmedText: { fontSize: 12, color: '#a78bfa', fontWeight: '700' },
  chainName: { fontSize: 10, color: colors.textMuted, marginTop: 1 },
  confirmedStatus: { fontSize: 11, color: '#22c55e', fontWeight: '700' },
  register: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#a78bfa44',
    paddingVertical: 9,
    backgroundColor: '#a78bfa11',
  },
  registerIcon: { fontSize: 14 },
  registerText: { fontSize: 13, color: '#a78bfa', fontWeight: '600' },
});

export function AgentAccountScreen() {
  const { t } = useI18n();
  const navigation = useNavigation<NativeStackNavigationProp<AgentStackParamList>>();
  const queryClient = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [walletLoading, setWalletLoading] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [apiKeyLoading, setApiKeyLoading] = useState<string | null>(null);
  // { [agentId]: { key?: string (full, shown once); prefix?: string } }
  const [apiKeys, setApiKeys] = useState<Record<string, { key?: string; prefix?: string }>>({}); 

  const { data: agents = [], isLoading, refetch } = useQuery({
    queryKey: ['agent-accounts'],
    queryFn: fetchAgentAccounts,
    retry: false,
  });

  const { mutate: create, isPending: isCreating } = useMutation({
    mutationFn: createAgentAccount,
    onSuccess: async (result) => {
      queryClient.invalidateQueries({ queryKey: ['agent-accounts'] });
      setShowCreate(false);
      // Auto-trigger wallet creation immediately after agent is created
      // No need for user to manually click "Open Wallet" — do it automatically
      try {
        const walletResult = await openWalletForAgent(result.id);
        queryClient.invalidateQueries({ queryKey: ['agent-accounts'] });
        Alert.alert(
          t({ en: 'Agent Ready ✅🔐', zh: '智能体已就绪 ✅🔐' }),
          t({ en: `"${result.name}" has been created with an independent MPC wallet.\n\nWallet Address:\n${walletResult.walletAddress}\n\nYour agent now has autonomous payment capability within the spending limits you set.`, zh: `“${result.name}”已创建完成，并已配置独立 MPC 钱包。\n\n钱包地址：\n${walletResult.walletAddress}\n\n你的智能体现在可以在设定的支出限制内自主支付。` }),
        );
      } catch {
        // Wallet creation failed, notify user (non-blocking — agent itself was created)
        Alert.alert(
          t({ en: 'Agent Created ✅', zh: '智能体已创建 ✅' }),
          t({ en: `"${result.name}" is ready.\n\n⚠️ Wallet activation failed — tap "Open Wallet" on the agent card to try again.`, zh: `“${result.name}”已就绪。\n\n⚠️ 钱包激活失败——请点击卡片上的“打开独立钱包”重试。` }),
        );
      }
    },
    onError: (err: any) => {
      Alert.alert(t({ en: 'Error', zh: '错误' }), err?.message || t({ en: 'Failed to create agent account.', zh: '创建智能体账户失败。' }));
    },
  });

  const handleOpenWallet = async (agent: AgentAccount) => {
    if (agent.walletAddress) {
      Alert.alert(
        t({ en: 'Agent Wallet', zh: '智能体钱包' }),
        t({ en: `Address: ${agent.walletAddress}`, zh: `地址：${agent.walletAddress}` }),
        [{ text: t({ en: 'OK', zh: '确定' }) }],
      );
      return;
    }

    Alert.alert(
      t({ en: 'Open Independent Wallet', zh: '打开独立钱包' }),
      t({ en: `Create an MPC wallet for "${agent.name}"?\n\nThis generates a self-custody wallet where only this agent can sign transactions within its spending limits.`, zh: `要为“${agent.name}”创建 MPC 钱包吗？\n\n这会生成一个自托管钱包，只有该智能体能在其支出限制内签署交易。` }),
      [
        { text: t({ en: 'Cancel', zh: '取消' }), style: 'cancel' },
        {
          text: t({ en: 'Create Wallet', zh: '创建钱包' }),
          onPress: async () => {
            setWalletLoading(agent.id);
            try {
              const result = await openWalletForAgent(agent.id);
              queryClient.invalidateQueries({ queryKey: ['agent-accounts'] });
              Alert.alert(
                t({ en: 'Wallet Created 🎉', zh: '钱包已创建 🎉' }),
                t({ en: `Your agent wallet is ready!\n\nAddress: ${result.walletAddress}`, zh: `你的智能体钱包已就绪！\n\n地址：${result.walletAddress}` }),
              );
            } catch (err: any) {
              Alert.alert(t({ en: 'Error', zh: '错误' }), err?.message || t({ en: 'Failed to create wallet.', zh: '创建钱包失败。' }));
            } finally {
              setWalletLoading(null);
            }
          },
        },
      ],
    );
  };

  const handleSuspend = (agent: AgentAccount) => {
    Alert.alert(
      t({ en: 'Suspend Agent', zh: '暂停智能体' }),
      t({ en: `Suspend "${agent.name}"? It will no longer be able to make payments.`, zh: `要暂停“${agent.name}”吗？暂停后它将无法继续支付。` }),
      [
        { text: t({ en: 'Cancel', zh: '取消' }), style: 'cancel' },
        {
          text: t({ en: 'Suspend', zh: '暂停' }),
          style: 'destructive',
          onPress: async () => {
            try {
              await suspendAgent(agent.id);
              queryClient.invalidateQueries({ queryKey: ['agent-accounts'] });
            } catch {
              Alert.alert(t({ en: 'Error', zh: '错误' }), t({ en: 'Failed to suspend agent.', zh: '暂停智能体失败。' }));
            }
          },
        },
      ],
    );
  };

  const handleResume = (agent: AgentAccount) => {
    Alert.alert(
      t({ en: 'Resume Agent', zh: '恢复智能体' }),
      t({ en: `Reactivate "${agent.name}"?`, zh: `要重新激活“${agent.name}”吗？` }),
      [
        { text: t({ en: 'Cancel', zh: '取消' }), style: 'cancel' },
        {
          text: t({ en: 'Resume', zh: '恢复' }),
          onPress: async () => {
            setActionLoading(agent.id);
            try {
              await resumeAgent(agent.id);
              queryClient.invalidateQueries({ queryKey: ['agent-accounts'] });
              Alert.alert(t({ en: 'Agent Reactivated ✅', zh: '智能体已重新激活 ✅' }), t({ en: `${agent.name} is active again.`, zh: `${agent.name} 已重新启用。` }));
            } catch (e: any) {
              Alert.alert(t({ en: 'Error', zh: '错误' }), e?.message || t({ en: 'Failed to resume agent.', zh: '恢复智能体失败。' }));
            } finally {
              setActionLoading(null);
            }
          },
        },
      ],
    );
  };

  const handleGenerateApiKey = (agent: AgentAccount) => {
    Alert.alert(
      t({ en: 'Generate API Key', zh: '生成 API Key' }),
      t({ en: `Generate a new API Key for "${agent.name}"?\n\nThis will invalidate any existing key.`, zh: `为"${agent.name}"生成新 API Key？\n\n这将使旧 Key 失效。` }),
      [
        { text: t({ en: 'Cancel', zh: '取消' }), style: 'cancel' },
        {
          text: t({ en: 'Generate', zh: '生成' }),
          onPress: async () => {
            setApiKeyLoading(agent.id);
            try {
              const result = await generateAgentApiKey(agent.id);
              setApiKeys((prev) => ({ ...prev, [agent.id]: { key: result.apiKey, prefix: result.prefix } }));
            } catch (err: any) {
              Alert.alert(t({ en: 'Error', zh: '错误' }), err?.message || t({ en: 'Failed to generate API Key.', zh: '生成 API Key 失败。' }));
            } finally {
              setApiKeyLoading(null);
            }
          },
        },
      ],
    );
  };

  const renderAgent = ({ item: agent }: { item: AgentAccount }) => {
    const agentApiKey = apiKeys[agent.id];
    return (
    <View style={styles.card}>
      {/* Card header */}
      <View style={styles.cardHeader}>
        <View style={styles.agentIcon}>
          <Text style={styles.agentIconText}>🤖</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.agentName}>{agent.name}</Text>
          <Text style={styles.agentId}>{agent.agentUniqueId}</Text>
        </View>
        <View style={[styles.statusBadge, { backgroundColor: (STATUS_COLOR[agent.status] || '#888') + '22' }]}>
          <Text style={[styles.statusText, { color: STATUS_COLOR[agent.status] || colors.textMuted }]}>
            {t({ en: agent.status, zh: agent.status === 'active' ? '活跃' : agent.status === 'draft' ? '草稿' : agent.status === 'suspended' ? '已暂停' : agent.status === 'terminated' ? '已终止' : agent.status === 'error' ? '错误' : '未连接' })}
          </Text>
        </View>
      </View>

      {/* Description */}
      {agent.description ? (
        <Text style={styles.description}>{agent.description}</Text>
      ) : null}

      {/* Spending limits */}
      {agent.spendingLimits && (
        <View style={styles.limitsRow}>
          <View style={styles.limitChip}>
            <Text style={styles.limitChipLabel}>{t({ en: 'Single TX', zh: '单笔' })}</Text>
            <Text style={styles.limitChipValue}>
              ${agent.spendingLimits.singleTxLimit} {agent.spendingLimits.currency}
            </Text>
          </View>
          <View style={styles.limitChip}>
            <Text style={styles.limitChipLabel}>{t({ en: 'Daily', zh: '每日' })}</Text>
            <Text style={styles.limitChipValue}>
              ${agent.spendingLimits.dailyLimit}
            </Text>
          </View>
          <View style={styles.limitChip}>
            <Text style={styles.limitChipLabel}>{t({ en: 'Monthly', zh: '每月' })}</Text>
            <Text style={styles.limitChipValue}>
              ${agent.spendingLimits.monthlyLimit}
            </Text>
          </View>
        </View>
      )}

      {/* Wallet address display */}
      {(agent as any).walletAddress ? (
        <TouchableOpacity
          style={styles.walletRowActive}
          onPress={() => {
            Clipboard.setStringAsync((agent as any).walletAddress);
            Alert.alert(t({ en: 'Copied', zh: '已复制' }), t({ en: 'Wallet address copied.', zh: '钱包地址已复制。' }));
          }}
        >
          <Text style={styles.walletIcon}>🔐</Text>
          <Text style={styles.walletAddress} numberOfLines={1}>{(agent as any).walletAddress}</Text>
          <Text style={{ fontSize: 11, color: colors.textMuted }}>📋</Text>
        </TouchableOpacity>
      ) : (
        <TouchableOpacity
          style={styles.openWalletBtn}
          onPress={() => handleOpenWallet(agent)}
          disabled={walletLoading === agent.id}
        >
          {walletLoading === agent.id ? (
            <ActivityIndicator color={colors.accent} size="small" />
          ) : (
            <>
              <Text style={styles.openWalletIcon}>🔐</Text>
              <Text style={styles.openWalletText}>{t({ en: 'Open Wallet', zh: '打开独立钱包' })}</Text>
            </>
          )}
        </TouchableOpacity>
      )}

      {/* Balance display */}
      <BalanceBadge agentAccountId={agent.agentAccountId} t={t} />

      {/* Chain Identity */}
      <ChainIdentityBadge agentAccountId={agent.agentAccountId} t={t} />

      {/* Actions row */}
      <View style={styles.actionsRow}>
        {(agent.status === 'active' || agent.status === 'draft') && (
          <TouchableOpacity style={styles.actionBtn} onPress={() => handleSuspend(agent)}>
            <Text style={styles.actionBtnText}>⏸ {t({ en: 'Suspend', zh: '暂停' })}</Text>
          </TouchableOpacity>
        )}
        {agent.status === 'suspended' && (
          <TouchableOpacity
            style={[styles.actionBtn, styles.actionBtnResume]}
            onPress={() => handleResume(agent)}
            disabled={actionLoading === agent.id}
          >
            {actionLoading === agent.id ? (
              <ActivityIndicator color={colors.accent} size="small" />
            ) : (
              <Text style={[styles.actionBtnText, { color: colors.accent }]}>▶ {t({ en: 'Resume', zh: '恢复' })}</Text>
            )}
          </TouchableOpacity>
        )}
        {/* Credit Score */}
        {agent.creditScore != null && (
          <View style={[styles.actionBtn, styles.actionBtnFund]}>
            <Text style={[styles.actionBtnText, { color: '#22c55e' }]}>⭐ {agent.creditScore}</Text>
          </View>
        )}
        <TouchableOpacity
          style={styles.actionBtn}
          onPress={() => navigation.navigate('AgentBalance' as any, { agentAccountId: agent.agentAccountId, agentName: agent.name })}
        >
          <Text style={styles.actionBtnText}>📋 {t({ en: 'Txs', zh: '交易' })}</Text>
        </TouchableOpacity>
      </View>

      {/* API Key section */}
      {agentApiKey?.key ? (
        <View style={styles.apiKeyBox}>
          <View style={styles.apiKeyHeader}>
            <Text style={styles.apiKeyLabel}>🔑 API Key</Text>
            <TouchableOpacity
              onPress={() => {
                Clipboard.setStringAsync(agentApiKey.key!);
                Alert.alert(t({ en: 'Copied', zh: '已复制' }), t({ en: 'API Key copied to clipboard.', zh: 'API Key 已复制到剪贴板。' }));
              }}
            >
              <Text style={styles.apiKeyCopyBtn}>{t({ en: 'Copy', zh: '复制' })}</Text>
            </TouchableOpacity>
          </View>
          <Text style={styles.apiKeyText} numberOfLines={2} selectable>{agentApiKey.key}</Text>
          <Text style={styles.apiKeyWarn}>
            ⚠️ {t({ en: 'Store this key now — it will not be shown again.', zh: '请立即保存此 Key，关闭后无法再次查看。' })}
          </Text>
        </View>
      ) : agentApiKey?.prefix ? (
        <View style={styles.apiKeyExisting}>
          <Text style={styles.apiKeyExistingText}>🔑 {agentApiKey.prefix}***</Text>
          <TouchableOpacity
            style={styles.apiKeyRegenBtn}
            onPress={() => handleGenerateApiKey(agent)}
            disabled={apiKeyLoading === agent.id}
          >
            {apiKeyLoading === agent.id ? (
              <ActivityIndicator color={colors.accent} size="small" />
            ) : (
              <Text style={styles.apiKeyRegenText}>{t({ en: 'Regenerate', zh: '重新生成' })}</Text>
            )}
          </TouchableOpacity>
        </View>
      ) : (
        <TouchableOpacity
          style={styles.apiKeyBtn}
          onPress={() => handleGenerateApiKey(agent)}
          disabled={apiKeyLoading === agent.id}
        >
          {apiKeyLoading === agent.id ? (
            <ActivityIndicator color={colors.accent} size="small" />
          ) : (
            <Text style={styles.apiKeyBtnText}>🔑 {t({ en: 'Generate API Key', zh: '生成 API Key' })}</Text>
          )}
        </TouchableOpacity>
      )}
    </View>
    );
  };

  return (
    <View style={styles.container}>
      {isLoading ? (
        <ActivityIndicator color={colors.accent} style={{ marginTop: 60 }} />
      ) : (
        <FlatList
          data={agents}
          keyExtractor={(a) => a.id}
          renderItem={renderAgent}
          refreshControl={
            <RefreshControl refreshing={isLoading} onRefresh={refetch} tintColor={colors.accent} />
          }
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          ListHeaderComponent={
            <View style={styles.headerCard}>
              <Text style={styles.headerTitle}>{t({ en: 'Agent Accounts', zh: '智能体账户' })}</Text>
              <Text style={styles.headerSub}>
                {t({ en: 'Each agent account is an autonomous identity with its own spending limits and optional self-custody wallet.', zh: '每个智能体账户都是一个独立身份，拥有自己的支出限制，并可选配自托管钱包。' })}
              </Text>
            </View>
          }
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyIcon}>🤖</Text>
              <Text style={styles.emptyTitle}>{t({ en: 'No agent accounts', zh: '暂无智能体账户' })}</Text>
              <Text style={styles.emptySub}>
                {t({ en: 'Create an agent account to let your AI act autonomously on your behalf.', zh: '创建一个智能体账户，让你的 AI 代表你自主执行操作。' })}
              </Text>
            </View>
          }
        />
      )}

      {/* FAB: Create agent */}
      <TouchableOpacity style={styles.fab} onPress={() => setShowCreate(true)}>
        <Text style={styles.fabText}>＋ {t({ en: 'New Agent', zh: '新建智能体' })}</Text>
      </TouchableOpacity>

      {/* Create modal */}
      <CreateAgentModal
        visible={showCreate}
        onClose={() => setShowCreate(false)}
        onCreate={create}
        loading={isCreating}
      />
    </View>
  );
}

// ──────────────────────────────────────────────
// Styles
// ──────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgPrimary },
  list: { padding: 16, gap: 12, paddingBottom: 100 },
  card: {
    backgroundColor: colors.bgCard,
    borderRadius: 16,
    padding: 16,
    gap: 10,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  agentIcon: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: colors.bgSecondary,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  agentIconText: { fontSize: 20 },
  agentName: { fontSize: 15, fontWeight: '700', color: colors.textPrimary },
  agentId: { fontSize: 11, color: colors.textMuted, marginTop: 1 },
  statusBadge: { borderRadius: 10, paddingHorizontal: 10, paddingVertical: 3 },
  statusText: { fontSize: 11, fontWeight: '600', textTransform: 'capitalize' },
  description: { fontSize: 13, color: colors.textSecondary, lineHeight: 18 },
  limitsRow: { flexDirection: 'row', gap: 6 },
  limitChip: {
    flex: 1,
    backgroundColor: colors.bgSecondary,
    borderRadius: 10,
    padding: 8,
    alignItems: 'center',
    gap: 2,
  },
  limitChipLabel: { fontSize: 10, color: colors.textMuted, fontWeight: '600' },
  limitChipValue: { fontSize: 12, color: colors.textPrimary, fontWeight: '700' },
  walletRowActive: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.bgSecondary,
    borderRadius: 10,
    padding: 10,
    borderWidth: 1,
    borderColor: colors.border,
  },
  walletIcon: { fontSize: 16 },
  walletAddress: { fontSize: 12, color: colors.accent, flex: 1, fontFamily: 'monospace' },
  openWalletBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.accent + '60',
    paddingVertical: 10,
    backgroundColor: colors.accent + '11',
  },
  openWalletIcon: { fontSize: 16 },
  openWalletText: { fontSize: 13, color: colors.accent, fontWeight: '600' },
  // Actions row
  actionsRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  actionBtn: {
    flex: 1,
    minWidth: 70,
    alignItems: 'center',
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: colors.bgSecondary,
    borderWidth: 1,
    borderColor: colors.border,
  },
  actionBtnResume: { borderColor: colors.accent + '55', backgroundColor: colors.accent + '11' },
  actionBtnFund: { borderColor: '#22c55e55', backgroundColor: '#22c55e11' },
  actionBtnText: { fontSize: 12, fontWeight: '600', color: colors.textMuted },
  // Balance chip
  balanceChip: {
    backgroundColor: colors.accent + '22',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: colors.accent + '55',
  },
  balanceText: { fontSize: 10, fontWeight: '700', color: colors.accent },
  // FAB
  fab: {
    position: 'absolute',
    bottom: 24,
    right: 20,
    backgroundColor: colors.accent,
    borderRadius: 28,
    paddingHorizontal: 20,
    paddingVertical: 14,
    shadowColor: colors.accent,
    shadowOpacity: 0.4,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
  fabText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  // Empty
  empty: { alignItems: 'center', padding: 40, gap: 10, marginTop: 40 },
  emptyIcon: { fontSize: 48 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: colors.textPrimary },
  emptySub: { fontSize: 13, color: colors.textMuted, textAlign: 'center', lineHeight: 20 },
  // Header
  headerCard: { marginBottom: 8, gap: 4 },
  headerTitle: { fontSize: 18, fontWeight: '800', color: colors.textPrimary },
  headerSub: { fontSize: 13, color: colors.textMuted, lineHeight: 18 },
  // API Key
  apiKeyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.accent + '66',
    paddingVertical: 9,
    backgroundColor: colors.accent + '0f',
  },
  apiKeyBtnText: { fontSize: 13, color: colors.accent, fontWeight: '600' },
  apiKeyBox: {
    backgroundColor: '#1a1a2e',
    borderRadius: 10,
    padding: 12,
    gap: 6,
    borderWidth: 1,
    borderColor: colors.accent + '55',
  },
  apiKeyHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  apiKeyLabel: { fontSize: 12, color: colors.accent, fontWeight: '700' },
  apiKeyCopyBtn: { fontSize: 12, color: colors.accent, fontWeight: '600', textDecorationLine: 'underline' },
  apiKeyText: {
    fontSize: 11,
    color: '#a5f3fc',
    fontFamily: 'monospace',
    letterSpacing: 0.3,
    lineHeight: 17,
  },
  apiKeyWarn: { fontSize: 11, color: '#f59e0b', lineHeight: 16 },
  apiKeyExisting: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.bgSecondary,
    borderRadius: 10,
    padding: 10,
    borderWidth: 1,
    borderColor: colors.border,
  },
  apiKeyExistingText: { flex: 1, fontSize: 12, color: colors.textMuted, fontFamily: 'monospace' },
  apiKeyRegenBtn: {
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 5,
    backgroundColor: colors.bgCard,
    borderWidth: 1,
    borderColor: colors.border,
  },
  apiKeyRegenText: { fontSize: 12, color: colors.textSecondary, fontWeight: '600' },
});

const modal = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bgPrimary },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 16,
    paddingTop: Platform.OS === 'android' ? (StatusBar.currentHeight || 40) + 12 : 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.bgSecondary,
  },
  cancel: { fontSize: 15, color: colors.textMuted },
  title: { fontSize: 16, fontWeight: '700', color: colors.textPrimary },
  createBtn: { fontSize: 15, color: colors.accent, fontWeight: '700' },
  body: { flex: 1, padding: 16 },
  label: {
    fontSize: 11,
    color: colors.textMuted,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: 16,
    marginBottom: 6,
  },
  input: {
    backgroundColor: colors.bgCard,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 12,
    fontSize: 14,
    color: colors.textPrimary,
  },
  typeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  typeChip: {
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 7,
    backgroundColor: colors.bgCard,
    borderWidth: 1,
    borderColor: colors.border,
  },
  typeChipActive: {
    backgroundColor: colors.accent + '22',
    borderColor: colors.accent,
  },
  typeText: { fontSize: 13, color: colors.textMuted },
  typeTextActive: { color: colors.accent, fontWeight: '600' },
  limitsGrid: { flexDirection: 'row', gap: 8 },
  limitItem: { flex: 1, gap: 4 },
  limitLabel: { fontSize: 11, color: colors.textMuted, fontWeight: '600' },
  limitInput: {
    backgroundColor: colors.bgCard,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 10,
    fontSize: 14,
    color: colors.textPrimary,
    textAlign: 'center',
  },
  infoBox: {
    marginTop: 20,
    backgroundColor: colors.bgCard,
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  infoText: { fontSize: 13, color: colors.textMuted, lineHeight: 18 },
});
