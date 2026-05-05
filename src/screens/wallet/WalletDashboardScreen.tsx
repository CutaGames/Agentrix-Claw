/**
 * WalletDashboardScreen — Mobile (PRD mobile-prd-v3 §4.1.4).
 *
 * Combines: Balances (fiat + USDC + BSC testnet) / Auto-Earn summary / quick links.
 * Pulls from `/api/v1/wallet/projection` (single aggregate API).
 */
import React, { useEffect, useState, useCallback } from 'react';
import { ScrollView, View, Text, StyleSheet, Pressable, ActivityIndicator, RefreshControl } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { apiFetch } from '../../services/api';
import { getBscBalance, BSC_TESTNET } from '../../services/bscPayment';
import { colors } from '../../theme/colors';

interface WalletProjection {
  totals: { fiat_cents: number; crypto_usd_cents: number; pending_cents: number };
  balances: Array<{ id: string; label: string; currency: string; amount_cents: number }>;
  auto_earn: { mrr_cents: number; last_24h_cents: number; active_executors: number };
  recent_txs: Array<{ id: string; description: string; amount_cents: number; ts: number; type: 'in' | 'out' }>;
}

interface BscBalance { token: 'USDT' | 'USDC'; amount: string; decimals: number }

export function WalletDashboardScreen() {
  const navigation = useNavigation<any>();
  const [data, setData] = useState<WalletProjection | null>(null);
  const [bsc, setBsc] = useState<BscBalance[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const wp = await apiFetch<WalletProjection>('/v1/wallet/projection');
      setData(wp);
    } catch {
      setData(null);
    }
    try {
      // Demo address — production reads from useAuthStore
      const addr = '0x0000000000000000000000000000000000000000';
      const usdt = await getBscBalance(addr, 'USDT');
      const usdc = await getBscBalance(addr, 'USDC');
      const list: BscBalance[] = [];
      if (usdt) list.push({ token: 'USDT', ...usdt });
      if (usdc) list.push({ token: 'USDC', ...usdc });
      setBsc(list);
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ paddingBottom: 40 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />}
    >
      {/* Balance hero */}
      <View style={styles.heroCard}>
        <Text style={styles.heroLabel}>总资产</Text>
        {loading && !data ? (
          <ActivityIndicator color={colors.accent} style={{ marginTop: 8 }} />
        ) : (
          <Text style={styles.heroValue}>
            ${(((data?.totals.fiat_cents ?? 0) + (data?.totals.crypto_usd_cents ?? 0)) / 100).toFixed(2)}
          </Text>
        )}
        {(data?.totals.pending_cents ?? 0) > 0 && (
          <Text style={styles.heroPending}>待结算 ${(data!.totals.pending_cents / 100).toFixed(2)}</Text>
        )}
      </View>

      {/* Auto-Earn */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Auto-Earn</Text>
        <View style={styles.row}>
          <Stat label="MRR" value={`$${((data?.auto_earn.mrr_cents ?? 0) / 100).toFixed(2)}`} accent="#86efac" />
          <Stat label="近 24h" value={`$${((data?.auto_earn.last_24h_cents ?? 0) / 100).toFixed(2)}`} />
          <Stat label="执行器" value={String(data?.auto_earn.active_executors ?? 0)} />
        </View>
        <Pressable style={styles.linkBtn} onPress={() => navigation.navigate('AutoEarn' as never)}>
          <Text style={styles.linkBtnText}>查看 →</Text>
        </Pressable>
      </View>

      {/* Crypto · BSC Testnet */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>BSC Testnet · USDT / USDC</Text>
        {bsc.length === 0 ? (
          <Text style={styles.dim}>未连接钱包或余额为 0</Text>
        ) : (
          bsc.map((b) => (
            <View key={b.token} style={styles.txRow}>
              <Text style={styles.txDesc}>{b.token}</Text>
              <Text style={styles.txAmount}>{(Number(b.amount) / 10 ** b.decimals).toFixed(4)}</Text>
            </View>
          ))
        )}
        <Text style={styles.dim}>Chain ID {BSC_TESTNET.chainId} · {BSC_TESTNET.name}</Text>
        <Pressable style={styles.linkBtn} onPress={() => navigation.navigate('PayMpcDemo' as never)}>
          <Text style={styles.linkBtnText}>测试支付 →</Text>
        </Pressable>
      </View>

      {/* Recent txs */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>近期交易</Text>
        {(data?.recent_txs ?? []).length === 0 ? (
          <Text style={styles.dim}>暂无交易</Text>
        ) : (
          data!.recent_txs.map((tx) => (
            <View key={tx.id} style={styles.txRow}>
              <Text style={styles.txDesc} numberOfLines={1}>{tx.description}</Text>
              <Text style={[styles.txAmount, { color: tx.type === 'in' ? '#86efac' : '#fca5a5' }]}>
                {tx.type === 'in' ? '+' : '-'}${(tx.amount_cents / 100).toFixed(2)}
              </Text>
            </View>
          ))
        )}
      </View>
    </ScrollView>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={[styles.statValue, accent && { color: accent }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  heroCard: { margin: 16, padding: 20, borderRadius: 16, backgroundColor: 'rgba(0,212,255,0.10)', borderWidth: 1, borderColor: 'rgba(0,212,255,0.25)' },
  heroLabel: { color: colors.textSecondary, fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.6 },
  heroValue: { color: colors.text, fontSize: 32, fontWeight: '700', marginTop: 4 },
  heroPending: { color: '#fbbf24', fontSize: 12, marginTop: 4 },
  card: { marginHorizontal: 16, marginTop: 12, padding: 16, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.04)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)' },
  cardTitle: { color: colors.text, fontSize: 14, fontWeight: '700', marginBottom: 12 },
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  stat: { flex: 1 },
  statLabel: { color: colors.textSecondary, fontSize: 11 },
  statValue: { color: colors.text, fontSize: 16, fontWeight: '600', marginTop: 2 },
  txRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(255,255,255,0.06)' },
  txDesc: { color: colors.text, fontSize: 13, flex: 1, marginRight: 12 },
  txAmount: { color: colors.text, fontSize: 13, fontWeight: '600' },
  dim: { color: colors.textSecondary, fontSize: 12, marginVertical: 6 },
  linkBtn: { marginTop: 12, alignSelf: 'flex-start' },
  linkBtnText: { color: colors.accent, fontSize: 13, fontWeight: '600' },
});
