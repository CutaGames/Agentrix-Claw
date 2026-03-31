import React, { useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, FlatList,
  RefreshControl, ActivityIndicator, Alert, Modal,
  TextInput, ScrollView, Platform, StatusBar,
} from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { colors } from '../../theme/colors';
import { useI18n } from '../../stores/i18nStore';
import {
  fetchAgentPresenceAccounts,
  createAgentPresenceAccount,
  setAgentPresenceAccountStatus,
  type MobileAgentAccount as AgentAccount,
  type CreateMobileAgentAccountDto as CreateAgentDto,
} from '../../services/agentPresenceAccount';
import { apiFetch } from '../../services/api';

// ──────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────

// ──────────────────────────────────────────────
// API helpers
// ──────────────────────────────────────────────

async function fetchAgentAccounts(): Promise<AgentAccount[]> {
  return fetchAgentPresenceAccounts();
}

async function createAgentAccount(dto: CreateAgentDto): Promise<AgentAccount> {
  return createAgentPresenceAccount(dto);
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
  await setAgentPresenceAccountStatus(agentId, 'suspended');
}

async function resumeAgent(agentId: string): Promise<void> {
  await setAgentPresenceAccountStatus(agentId, 'active');
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
      agentType,
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

export function AgentAccountScreen() {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [walletLoading, setWalletLoading] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

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

  const renderAgent = ({ item: agent }: { item: AgentAccount }) => (
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

      {/* Wallet */}
      {agent.walletAddress ? (
        <TouchableOpacity style={styles.walletRowActive} onPress={() => handleOpenWallet(agent)}>
          <Text style={styles.walletIcon}>💳</Text>
          <Text style={styles.walletAddress} numberOfLines={1}>
            {agent.walletAddress.slice(0, 14)}...{agent.walletAddress.slice(-8)}
          </Text>
          {/* Balance chip */}
          {agent.balance != null && (
            <View style={styles.balanceChip}>
              <Text style={styles.balanceText}>
                {agent.balance.toFixed(4)} {agent.balanceCurrency ?? 'USDT'}
              </Text>
            </View>
          )}
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
              <Text style={styles.openWalletText}>{t({ en: 'Open Independent Wallet', zh: '打开独立钱包' })}</Text>
            </>
          )}
        </TouchableOpacity>
      )}

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
        {agent.walletAddress && (
          <TouchableOpacity
            style={[styles.actionBtn, styles.actionBtnFund]}
            onPress={() =>
              Alert.alert(t({ en: 'Fund Agent', zh: '给智能体充值' }), t({ en: `Top up agent wallet:\n${agent.walletAddress}\n\nSend USDT (BSC) to this address.`, zh: `请向该智能体钱包充值：\n${agent.walletAddress}\n\n请向此地址发送 USDT（BSC）。` }))
            }
          >
            <Text style={[styles.actionBtnText, { color: '#22c55e' }]}>💰 {t({ en: 'Fund', zh: '充值' })}</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity
          style={styles.actionBtn}
          onPress={() =>
            Alert.alert(t({ en: 'Transactions', zh: '交易记录' }), t({ en: `Transaction history for ${agent.name} will open in the Orders tab.`, zh: `${agent.name} 的交易记录会在订单页中打开。` }))
          }
        >
          <Text style={styles.actionBtnText}>📋 {t({ en: 'Txs', zh: '交易' })}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

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
