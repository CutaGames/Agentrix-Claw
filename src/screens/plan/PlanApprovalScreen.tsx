/**
 * PlanApprovalScreen — Mobile (PRD mobile-prd-v3 §4.4 / backend P1-4).
 *
 * Lists pending plans (`awaiting_approval`) returned by `/api/v1/plan/list`,
 * and lets the user approve/reject each via the L1/L2 approval flow.
 *   Plan → /approval/:id/approve → /plan/:id/run.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, FlatList, Pressable, ActivityIndicator, Alert, RefreshControl } from 'react-native';
import { apiFetch } from '../../services/api';
import { colors } from '../../theme/colors';

interface PlanRow {
  id: string;
  title: string;
  summary?: string;
  risk_level: 'L0' | 'L1' | 'L2' | 'L3';
  approval_id?: string;
  steps?: Array<{ id: string; title: string; status?: string }>;
  status: 'awaiting_approval' | 'pending' | 'running' | 'done' | 'failed' | 'rejected';
  created_at?: number;
}

export function PlanApprovalScreen() {
  const [items, setItems] = useState<PlanRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [acting, setActing] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch<{ items: PlanRow[] } | PlanRow[]>('/v1/plan/list?status=awaiting_approval');
      const list = Array.isArray(res) ? res : res?.items ?? [];
      setItems(list);
    } catch {
      setItems([]);
    }
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const decide = useCallback(async (plan: PlanRow, decision: 'approve' | 'reject') => {
    if (!plan.approval_id) {
      Alert.alert('提示', '该计划尚未生成审批单');
      return;
    }
    setActing(plan.id);
    try {
      if (decision === 'approve') {
        await apiFetch(`/v1/approval/${plan.approval_id}/approve`, {
          method: 'POST',
          body: JSON.stringify({ surface: 'mobile', method: 'biometric', trust_level: 'high' }),
        });
        await apiFetch(`/v1/plan/${plan.id}/run`, { method: 'POST' });
      } else {
        await apiFetch(`/v1/approval/${plan.approval_id}/reject`, {
          method: 'POST',
          body: JSON.stringify({ surface: 'mobile', reason: 'user_reject' }),
        });
      }
      await load();
    } catch (e: any) {
      Alert.alert('失败', e?.message || '操作失败，稍后重试');
    }
    setActing(null);
  }, [load]);

  return (
    <View style={styles.container}>
      <Text style={styles.heading}>待审批</Text>
      {loading && items.length === 0 ? (
        <ActivityIndicator color={colors.accent} style={{ marginTop: 32 }} />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(i) => i.id}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />}
          ListEmptyComponent={<Text style={styles.empty}>暂无待审批计划</Text>}
          renderItem={({ item }) => (
            <View style={styles.card}>
              <View style={styles.rowBetween}>
                <Text style={styles.title} numberOfLines={2}>{item.title}</Text>
                <RiskBadge level={item.risk_level} />
              </View>
              {item.summary && <Text style={styles.summary} numberOfLines={3}>{item.summary}</Text>}
              {item.steps && item.steps.length > 0 && (
                <View style={styles.steps}>
                  {item.steps.slice(0, 5).map((s, idx) => (
                    <Text key={s.id ?? idx} style={styles.step}>· {s.title}</Text>
                  ))}
                </View>
              )}
              <View style={styles.actions}>
                <Pressable
                  style={[styles.btn, styles.btnReject]}
                  disabled={acting === item.id}
                  onPress={() => decide(item, 'reject')}
                >
                  <Text style={styles.btnRejectText}>拒绝</Text>
                </Pressable>
                <Pressable
                  style={[styles.btn, styles.btnApprove]}
                  disabled={acting === item.id}
                  onPress={() => decide(item, 'approve')}
                >
                  <Text style={styles.btnApproveText}>{acting === item.id ? '处理中…' : '批准 + 执行'}</Text>
                </Pressable>
              </View>
            </View>
          )}
        />
      )}
    </View>
  );
}

function RiskBadge({ level }: { level: PlanRow['risk_level'] }) {
  const map: Record<PlanRow['risk_level'], { bg: string; fg: string }> = {
    L0: { bg: 'rgba(134,239,172,0.18)', fg: '#86efac' },
    L1: { bg: 'rgba(250,204,21,0.18)', fg: '#fde047' },
    L2: { bg: 'rgba(251,146,60,0.20)', fg: '#fdba74' },
    L3: { bg: 'rgba(248,113,113,0.22)', fg: '#fca5a5' },
  };
  const c = map[level];
  return (
    <View style={[styles.badge, { backgroundColor: c.bg }]}>
      <Text style={[styles.badgeText, { color: c.fg }]}>{level}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, padding: 16 },
  heading: { color: colors.text, fontSize: 20, fontWeight: '700', marginBottom: 12 },
  empty: { color: colors.textSecondary, textAlign: 'center', marginTop: 48 },
  card: {
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 12, padding: 14, marginBottom: 12,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)',
  },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  title: { color: colors.text, fontSize: 15, fontWeight: '600', flex: 1, marginRight: 10 },
  summary: { color: colors.textSecondary, fontSize: 13, marginTop: 6, lineHeight: 18 },
  steps: { marginTop: 10, gap: 2 },
  step: { color: colors.textSecondary, fontSize: 12 },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  badgeText: { fontSize: 11, fontWeight: '700' },
  actions: { flexDirection: 'row', gap: 10, marginTop: 14 },
  btn: { flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: 'center' },
  btnReject: { backgroundColor: 'rgba(248,113,113,0.12)', borderWidth: 1, borderColor: 'rgba(248,113,113,0.35)' },
  btnRejectText: { color: '#fca5a5', fontWeight: '600' },
  btnApprove: { backgroundColor: colors.accent },
  btnApproveText: { color: '#0B1220', fontWeight: '700' },
});
