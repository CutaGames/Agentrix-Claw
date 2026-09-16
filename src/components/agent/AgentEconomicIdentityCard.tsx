/**
 * AgentEconomicIdentityCard — Agent 经济身份卡（agent-wallet-identity-tangibility 需求 6/7/8）。
 *
 * 把"你拥有的 agent 到底有什么"具象化：钱包地址（复制/查浏览器）、余额、备份状态、
 * 链上身份（4 态：enabled/pending/not_enabled/failed，诚实）、信用、累计赚取、可交易(路线图)。
 * 保留移动端社交优势：一键分享 agent 身份/战绩。状态严格来自后端 DTO（不虚构）。
 */
import React, { useCallback, useState } from 'react';
import {
  View, Text, StyleSheet, ActivityIndicator, TouchableOpacity, Linking, Share, Alert,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { useQuery } from '@tanstack/react-query';
import { useColors, useThemedStyles, type Palette } from '../../theme/useTheme';
import { useI18n } from '../../stores/i18nStore';
import {
  fetchEconomicIdentityCard,
  fetchAgentLedger,
  type EconomicIdentityCard,
  type AgentLedgerItem,
  type CardStatus,
} from '../../services/agentOpsApi';
import { DepositSheet } from '../wallet/DepositSheet';

const SHARE_DEEP_LINK = 'https://polymarket.agentrix.top';

function ledgerLabel(type: string, t: (d: { en: string; zh: string }) => string): string {
  switch (type) {
    case 'x402_pay': return t({ en: 'X402 payment', zh: 'X402 微支付' });
    case 'a2a_commission': return t({ en: 'A2A commission', zh: 'A2A 分佣' });
    case 'identity_register': return t({ en: 'Identity register', zh: '身份注册' });
    case 'earn': return t({ en: 'Earning', zh: '赚取' });
    case 'spend': return t({ en: 'Spend', zh: '支出' });
    default: return type;
  }
}

export function AgentEconomicIdentityCard({ agentId }: { agentId: string }) {
  const c = useColors();
  const styles = useThemedStyles(makeStyles);
  const { t } = useI18n();

  const q = useQuery({
    queryKey: ['agent-economic-identity', agentId],
    queryFn: () => fetchEconomicIdentityCard(agentId),
    enabled: !!agentId,
    retry: 1,
  });

  const card = q.data;
  const [depositOpen, setDepositOpen] = useState(false);

  const ledgerQ = useQuery({
    queryKey: ['agent-ledger', agentId],
    queryFn: () => fetchAgentLedger(agentId),
    enabled: !!agentId,
    retry: 1,
  });

  const copyAddress = useCallback(async (addr?: string) => {
    if (!addr) return;
    await Clipboard.setStringAsync(addr);
    Alert.alert(t({ en: 'Copied', zh: '已复制' }), t({ en: 'Address copied', zh: '地址已复制' }));
  }, [t]);

  const openUrl = useCallback((url?: string) => {
    if (url) Linking.openURL(url).catch(() => undefined);
  }, []);

  const shareIdentity = useCallback(async (cd: EconomicIdentityCard) => {
    const lines = [
      t({ en: 'My AI agent has its own wallet & identity 🤖', zh: '我的 AI agent 有独立钱包和链上身份 🤖' }),
      cd.wallet.address ? `👛 ${cd.wallet.address.slice(0, 8)}…${cd.wallet.address.slice(-6)}` : '',
      cd.credit.status === 'enabled' ? `🎯 ${cd.credit.level} (${cd.credit.creditScore})` : '',
      cd.earnings.totalTx > 0 ? `📈 ${cd.earnings.totalTx} txs` : '',
      SHARE_DEEP_LINK,
    ].filter(Boolean);
    try {
      await Share.share({ message: lines.join('\n') });
    } catch {
      // user cancelled
    }
  }, [t]);

  if (q.isLoading) {
    return <View style={styles.card}><ActivityIndicator color={c.accent} /></View>;
  }
  if (q.isError || !card) {
    return (
      <View style={styles.card}>
        <Text style={styles.muted}>{t({ en: 'Failed to load identity card.', zh: '加载身份卡失败。' })}</Text>
      </View>
    );
  }

  const shortAddr = card.wallet.address
    ? `${card.wallet.address.slice(0, 8)}…${card.wallet.address.slice(-6)}`
    : t({ en: 'No wallet', zh: '无钱包' });

  return (
    <View style={styles.wrap} testID="agent-economic-identity-card">
      {/* Header: owner + agent id + share */}
      <View style={styles.headerRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.agentId}>{card.agentUniqueId}</Text>
          <Text style={styles.owner}>{t({ en: 'Owned by you', zh: '归属：你' })}</Text>
        </View>
        <TouchableOpacity style={styles.shareBtn} onPress={() => shareIdentity(card)} testID="aeic-share">
          <Text style={styles.shareBtnText}>{t({ en: 'Share', zh: '分享' })}</Text>
        </TouchableOpacity>
      </View>

      {/* Wallet */}
      <View style={styles.card}>
        <View style={styles.cardHead}>
          <Text style={styles.cardTitle}>👛 {t({ en: 'Wallet', zh: '钱包' })}</Text>
          <Badge status={card.wallet.status} c={c} styles={styles} t={t} />
        </View>
        <TouchableOpacity onPress={() => copyAddress(card.wallet.address)} testID="aeic-copy-addr">
          <Text style={styles.addr}>{shortAddr}  <Text style={styles.copyHint}>{card.wallet.address ? t({ en: '(tap to copy)', zh: '(点击复制)' }) : ''}</Text></Text>
        </TouchableOpacity>
        <View style={styles.row}>
          <Text style={styles.label}>{t({ en: 'Balance', zh: '余额' })}</Text>
          <Text style={styles.value}>{card.wallet.balances.platform} {card.wallet.balances.currency}</Text>
        </View>
        {card.wallet.explorerUrl ? (
          <TouchableOpacity onPress={() => openUrl(card.wallet.explorerUrl)}>
            <Text style={styles.link}>{t({ en: 'View on explorer ↗', zh: '在区块浏览器查看 ↗' })}</Text>
          </TouchableOpacity>
        ) : null}
        {card.wallet.type === 'mpc' ? (
          <TouchableOpacity style={styles.depositBtn} onPress={() => setDepositOpen(true)} testID="aeic-deposit">
            <Text style={styles.depositBtnText}>＋ {t({ en: 'Deposit', zh: '充值' })}</Text>
          </TouchableOpacity>
        ) : null}
      </View>

      {/* Backup */}
      <View style={styles.card}>
        <View style={styles.cardHead}>
          <Text style={styles.cardTitle}>🔐 {t({ en: 'Backup', zh: '备份' })}</Text>
          <Badge status={card.backup.status} c={c} styles={styles} t={t} />
        </View>
        {card.backup.status !== 'enabled' ? (
          <Text style={styles.action}>{t({ en: 'Not backed up — save your recovery code to avoid losing the wallet.', zh: '未备份——请保存恢复码，避免丢失钱包。' })}</Text>
        ) : (
          <Text style={styles.muted}>{t({ en: 'Recovery code confirmed.', zh: '恢复码已确认。' })}</Text>
        )}
      </View>

      {/* On-chain identity */}
      <View style={styles.card}>
        <View style={styles.cardHead}>
          <Text style={styles.cardTitle}>⛓️ {t({ en: 'On-chain identity', zh: '链上身份' })}</Text>
          <Badge status={card.onchain.status} c={c} styles={styles} t={t} />
        </View>
        {card.onchain.chain ? (
          <View style={styles.row}>
            <Text style={styles.label}>{t({ en: 'Chain', zh: '链' })}</Text>
            <Text style={styles.value}>{card.onchain.chain}</Text>
          </View>
        ) : null}
        {card.onchain.status === 'pending' ? (
          <Text style={styles.action}>{t({ en: 'Registration pending confirmation…', zh: '注册待链上确认…' })}</Text>
        ) : null}
        {card.onchain.explorerUrl ? (
          <TouchableOpacity onPress={() => openUrl(card.onchain.explorerUrl)}>
            <Text style={styles.link}>{t({ en: 'View tx ↗', zh: '查看交易 ↗' })}</Text>
          </TouchableOpacity>
        ) : null}
      </View>

      {/* Credit + Earnings */}
      <View style={styles.card}>
        <View style={styles.cardHead}>
          <Text style={styles.cardTitle}>🎯 {t({ en: 'Credit & earnings', zh: '信用与赚取' })}</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.label}>{t({ en: 'Credit', zh: '信用' })}</Text>
          <Text style={styles.value}>{card.credit.level} ({card.credit.creditScore})</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.label}>{t({ en: 'Transactions', zh: '交易次数' })}</Text>
          <Text style={styles.value}>{card.earnings.totalTx}</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.label}>{t({ en: 'Volume', zh: '累计金额' })}</Text>
          <Text style={styles.value}>{card.earnings.totalAmount} {card.earnings.currency}</Text>
        </View>
        {card.earnings.totalTx === 0 ? (
          <Text style={styles.muted}>{t({ en: 'No activity yet — let your agent take its first task / order.', zh: '还没有流水——派 agent 接第一个任务/下第一单。' })}</Text>
        ) : null}
      </View>

      {/* Tradable (roadmap) */}
      <View style={[styles.card, styles.roadmapCard]}>
        <Text style={styles.cardTitle}>🔄 {t({ en: 'Transfer / trade', zh: '转让 / 交易' })}</Text>
        <Text style={styles.muted}>{card.tradable.note} · {t({ en: 'Roadmap', zh: '路线图' })}</Text>
      </View>

      {/* 链上活动 / 流水（need 5.1）：X402 付费 / A2A 分佣 / 身份注册 / 支出，可跳浏览器 */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>🧾 {t({ en: 'Activity', zh: '链上活动 / 流水' })}</Text>
        {ledgerQ.data && ledgerQ.data.items.length > 0 ? (
          ledgerQ.data.items.slice(0, 8).map((it: AgentLedgerItem) => (
            <TouchableOpacity
              key={it.id}
              style={styles.ledgerRow}
              disabled={!it.explorerUrl}
              onPress={() => openUrl(it.explorerUrl)}
            >
              <View style={{ flex: 1 }}>
                <Text style={styles.ledgerType}>{ledgerLabel(it.type, t)}</Text>
                {it.counterparty ? (
                  <Text style={styles.ledgerSub}>{it.counterparty.slice(0, 8)}…{it.counterparty.slice(-4)}</Text>
                ) : null}
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={[styles.ledgerAmt, { color: Number(it.amount) >= 0 ? c.success : c.textPrimary }]}>
                  {Number(it.amount) >= 0 ? '+' : ''}{it.amount} {it.currency}
                </Text>
                {it.txHash ? <Text style={styles.ledgerTx}>{it.explorerUrl ? '↗ ' : ''}{it.txHash.slice(0, 10)}…</Text> : null}
              </View>
            </TouchableOpacity>
          ))
        ) : (
          <Text style={styles.muted}>{t({ en: 'No on-chain activity yet.', zh: '还没有链上活动。' })}</Text>
        )}
      </View>

      {/* Compliance */}
      <View style={styles.compliance}>
        {card.compliance.disclosures.map((d, i) => (
          <Text key={i} style={styles.disclosure}>· {d}</Text>
        ))}
      </View>

      <DepositSheet
        visible={depositOpen}
        onClose={() => setDepositOpen(false)}
        walletAddress={card.wallet.address}
        chainId={card.onchain.chain && card.onchain.chain.toLowerCase().includes('bsc') ? 97 : 1439}
      />
    </View>
  );
}

function Badge({
  status, c, styles, t,
}: {
  status: CardStatus | 'enabled' | 'not_enabled';
  c: Palette;
  styles: ReturnType<typeof makeStyles>;
  t: (d: { en: string; zh: string }) => string;
}) {
  const map: Record<string, { color: string; label: string }> = {
    enabled: { color: c.success, label: t({ en: 'Enabled', zh: '已启用' }) },
    pending: { color: c.warning ?? '#d97706', label: t({ en: 'Pending', zh: '待确认' }) },
    not_enabled: { color: c.textMuted, label: t({ en: 'Not enabled', zh: '未启用' }) },
    failed: { color: c.error, label: t({ en: 'Failed', zh: '失败' }) },
  };
  const { color, label } = map[status] ?? map.not_enabled;
  return (
    <View style={[styles.badge, { backgroundColor: color + '22', borderColor: color + '66' }]}>
      <Text style={[styles.badgeText, { color }]}>{label}</Text>
    </View>
  );
}

function makeStyles(c: Palette) {
  return StyleSheet.create({
    wrap: { gap: 12 },
    headerRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    agentId: { fontSize: 15, fontWeight: '800', color: c.textPrimary },
    owner: { fontSize: 12, color: c.textMuted, marginTop: 2 },
    shareBtn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, backgroundColor: c.accent + '22', borderWidth: 1, borderColor: c.accent + '66' },
    shareBtnText: { fontSize: 12, fontWeight: '800', color: c.accent },
    card: { backgroundColor: c.bgCard, borderRadius: 14, padding: 14, gap: 8, borderWidth: 1, borderColor: c.border },
    roadmapCard: { opacity: 0.7 },
    cardHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    cardTitle: { fontSize: 15, fontWeight: '700', color: c.textPrimary },
    addr: { fontSize: 14, color: c.textPrimary, fontWeight: '700', fontFamily: 'monospace' },
    copyHint: { fontSize: 11, color: c.textMuted, fontWeight: '400' },
    row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12, paddingVertical: 2 },
    label: { fontSize: 13, color: c.textMuted },
    value: { fontSize: 13, color: c.textPrimary, fontWeight: '600' },
    link: { fontSize: 13, color: c.accent, fontWeight: '700', marginTop: 2 },
    depositBtn: { marginTop: 4, alignSelf: 'flex-start', paddingHorizontal: 16, paddingVertical: 9, borderRadius: 999, backgroundColor: c.accent, },
    depositBtnText: { fontSize: 13, fontWeight: '800', color: '#000' },
    action: { fontSize: 13, color: c.warning ?? '#d97706', lineHeight: 18 },
    muted: { fontSize: 12, color: c.textMuted, lineHeight: 18 },
    badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, borderWidth: 1 },
    badgeText: { fontSize: 11, fontWeight: '800' },
    compliance: { gap: 4, paddingHorizontal: 4, paddingTop: 4 },
    disclosure: { fontSize: 11, color: c.textMuted, lineHeight: 16 },
    ledgerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, paddingVertical: 6, borderTopWidth: 1, borderTopColor: c.border },
    ledgerType: { fontSize: 13, color: c.textPrimary, fontWeight: '600' },
    ledgerSub: { fontSize: 11, color: c.textMuted, fontFamily: 'monospace' },
    ledgerAmt: { fontSize: 13, fontWeight: '700' },
    ledgerTx: { fontSize: 10, color: c.accent, fontFamily: 'monospace' },
  });
}
