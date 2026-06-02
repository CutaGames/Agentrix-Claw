/**
 * AeonCompanyScreen — 永曜城·公司运营(开公司 → 注资 → 雇 agent → 打卡 → 结算发薪)。
 *
 * 之前后端整套 /v1/aeon/orgs 已就绪但移动端没有任何入口,用户没法跑公司流程。本屏补上:
 *   1. 我的公司列表 / 创建公司(选自己的地块)
 *   2. 公司详情:账本余额 + 注资
 *   3. 成员名册:雇佣 agent 员工(用你的 OpenClaw 实例)、打卡上岗/下岗、周期结算发薪
 *
 * 经济闭环:注资 AXP → agent 员工打卡干活(接 KPI 任务)→ 结算时产出达标自动发薪。
 */
import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator,
  TextInput, Alert, Modal, RefreshControl,
} from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import * as Haptics from 'expo-haptics';
import { colors } from '../../theme/colors';
import { useAuthStore } from '../../stores/authStore';
import {
  listMyCompanies, createCompany, getCompany, listCompanyMembers,
  fundCompany, hireAgentEmployee, clockInMember, clockOutMember, settleMember,
  listMyPlots,
  type AeonOrgDto, type AeonOrgMemberDto, type AeonPlotDto,
} from '../../services/aeon/aeonApi';

export default function AeonCompanyScreen() {
  const navigation = useNavigation<any>();
  const activeInstance = useAuthStore((s) => s.activeInstance);
  const [companies, setCompanies] = useState<AeonOrgDto[]>([]);
  const [selected, setSelected] = useState<AeonOrgDto | null>(null);
  const [members, setMembers] = useState<AeonOrgMemberDto[]>([]);
  const [balance, setBalance] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState(false);

  // create modal
  const [createOpen, setCreateOpen] = useState(false);
  const [coName, setCoName] = useState('');
  const [myPlots, setMyPlots] = useState<AeonPlotDto[]>([]);
  const [pickPlotId, setPickPlotId] = useState<string | null>(null);

  const loadCompanies = useCallback(async () => {
    try {
      const list = await listMyCompanies();
      setCompanies(list);
      if (list.length > 0 && !selected) setSelected(list[0]);
    } catch {
      setCompanies([]);
    } finally {
      setLoading(false);
    }
  }, [selected]);

  useEffect(() => { void loadCompanies(); }, [loadCompanies]);
  useFocusEffect(useCallback(() => { void loadCompanies(); }, [loadCompanies]));

  const loadDetail = useCallback(async (org: AeonOrgDto) => {
    try {
      const [det, mem] = await Promise.all([getCompany(org.id), listCompanyMembers(org.id)]);
      setBalance(Number(det.axpLedgerBalance ?? 0));
      setMembers(mem);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { if (selected) void loadDetail(selected); }, [selected, loadDetail]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadCompanies();
    if (selected) await loadDetail(selected);
    setRefreshing(false);
  }, [loadCompanies, loadDetail, selected]);

  const openCreate = useCallback(async () => {
    try {
      const plots = await listMyPlots();
      setMyPlots(plots);
      setPickPlotId(plots[0]?.id ?? null);
    } catch { setMyPlots([]); }
    setCoName('');
    setCreateOpen(true);
  }, []);

  const onCreate = useCallback(async () => {
    if (!coName.trim()) { Alert.alert('请输入公司名'); return; }
    if (!pickPlotId) { Alert.alert('需要一块地', '先去地图圈一块自己的领地,公司要建在你的地上。'); return; }
    try {
      setBusy(true);
      const org = await createCompany({ name: coName.trim(), plotId: pickPlotId });
      setCreateOpen(false);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      await loadCompanies();
      setSelected(org);
    } catch (e: any) {
      Alert.alert('创建失败', e?.message || '请稍后再试');
    } finally {
      setBusy(false);
    }
  }, [coName, pickPlotId, loadCompanies]);

  const onFund = useCallback(() => {
    if (!selected) return;
    Alert.prompt?.(
      '注资公司账本',
      '输入注资 AXP 金额(用于给员工发薪):',
      async (text) => {
        const amt = parseInt(text || '', 10);
        if (!Number.isFinite(amt) || amt <= 0) { Alert.alert('金额无效'); return; }
        try {
          setBusy(true);
          const r = await fundCompany(selected.id, amt);
          setBalance(r.balance);
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        } catch (e: any) {
          Alert.alert('注资失败', e?.message || '余额不足或网络错误');
        } finally { setBusy(false); }
      },
      'plain-text',
      '100',
      'number-pad',
    );
    // Android 无 Alert.prompt:退化为固定 100 AXP 注资
    if (!Alert.prompt) {
      void (async () => {
        try {
          setBusy(true);
          const r = await fundCompany(selected.id, 100);
          setBalance(r.balance);
          Alert.alert('已注资', '已注资 100 AXP(Android 暂用固定金额)。');
        } catch (e: any) {
          Alert.alert('注资失败', e?.message || '');
        } finally { setBusy(false); }
      })();
    }
  }, [selected]);

  const onHire = useCallback(async () => {
    if (!selected) return;
    if (!activeInstance?.id) {
      Alert.alert('需要一个 agent', '先在"我的"里绑定/启动一个 OpenClaw 实例,才能雇它当员工。');
      return;
    }
    Alert.alert('雇佣 agent 员工', `用你的实例「${activeInstance.name || activeInstance.id.slice(0, 8)}」当员工,周期工资 20 AXP?`, [
      { text: '取消', style: 'cancel' },
      {
        text: '雇佣', onPress: async () => {
          try {
            setBusy(true);
            await hireAgentEmployee(selected.id, { memberUserId: '', agentInstanceId: activeInstance.id, wageAxpPerPeriod: 20 });
            await loadDetail(selected);
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          } catch (e: any) {
            Alert.alert('雇佣失败', e?.message || '可能已达员工上限(3)');
          } finally { setBusy(false); }
        },
      },
    ]);
  }, [selected, activeInstance, loadDetail]);

  const onClockIn = useCallback(async (m: AeonOrgMemberDto) => {
    if (!selected) return;
    try {
      setBusy(true);
      const r = await clockInMember(selected.id, m.id);
      if (r.ok) Alert.alert('已打卡上岗', '员工开始在公司房间干活了(接 KPI 任务)。结算时产出达标即发薪。');
      else Alert.alert('打卡失败', '该员工不可上岗(状态/角色不符)。');
    } catch (e: any) {
      Alert.alert('打卡失败', e?.message || '');
    } finally { setBusy(false); }
  }, [selected]);

  const onSettle = useCallback(async (m: AeonOrgMemberDto) => {
    if (!selected) return;
    try {
      setBusy(true);
      const r = await settleMember(selected.id, m.id);
      await loadDetail(selected);
      Alert.alert('结算完成', `产出:完成 ${r.output.completed}/${r.output.attempted} 个任务 · 发薪 ${r.paid} AXP`);
    } catch (e: any) {
      Alert.alert('结算失败', e?.message || '账本余额可能不足,请先注资');
    } finally { setBusy(false); }
  }, [selected, loadDetail]);

  if (loading) {
    return <View style={styles.center}><ActivityIndicator size="large" color={colors.accent} /></View>;
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ paddingBottom: 40 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />}
    >
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.back}><Text style={styles.backText}>‹ 返回</Text></TouchableOpacity>
        <Text style={styles.headerTitle}>🏢 我的公司</Text>
        <TouchableOpacity onPress={openCreate} style={styles.newBtn}><Text style={styles.newBtnText}>+ 开公司</Text></TouchableOpacity>
      </View>

      {companies.length === 0 ? (
        <View style={styles.emptyBox}>
          <Text style={styles.emptyIcon}>🏢</Text>
          <Text style={styles.emptyTitle}>还没有公司</Text>
          <Text style={styles.emptySub}>开一家公司,雇你的 AI agent 当员工:注资 → 打卡干活 → 产出达标自动发薪。这是永曜城的"AI 打工经济"。</Text>
          <TouchableOpacity style={styles.emptyCta} onPress={openCreate}><Text style={styles.emptyCtaText}>开第一家公司</Text></TouchableOpacity>
        </View>
      ) : (
        <>
          {/* 公司选择条 */}
          {companies.length > 1 ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.coTabs} contentContainerStyle={{ paddingHorizontal: 16, gap: 8 }}>
              {companies.map((c) => (
                <TouchableOpacity key={c.id} style={[styles.coTab, selected?.id === c.id && styles.coTabActive]} onPress={() => setSelected(c)}>
                  <Text style={[styles.coTabText, selected?.id === c.id && styles.coTabTextActive]} numberOfLines={1}>{c.name}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          ) : null}

          {selected ? (
            <>
              {/* 账本卡 */}
              <View style={styles.ledgerCard}>
                <View>
                  <Text style={styles.ledgerLabel}>{selected.name} · 账本余额</Text>
                  <Text style={styles.ledgerBalance}>{balance ?? '…'} <Text style={styles.ledgerAxp}>AXP</Text></Text>
                </View>
                <TouchableOpacity style={styles.fundBtn} onPress={onFund} disabled={busy}><Text style={styles.fundBtnText}>注资</Text></TouchableOpacity>
              </View>

              {/* 成员 */}
              <View style={styles.sectionRow}>
                <Text style={styles.sectionTitle}>👥 员工名册</Text>
                <TouchableOpacity onPress={onHire} disabled={busy}><Text style={styles.hireText}>+ 雇 agent</Text></TouchableOpacity>
              </View>
              {members.filter((m) => m.role !== 'owner').length === 0 ? (
                <Text style={styles.dim}>还没有员工。点"+ 雇 agent"把你的 OpenClaw 实例请来打工。</Text>
              ) : (
                members.filter((m) => m.role !== 'owner').map((m) => (
                  <View key={m.id} style={styles.memberCard}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.memberRole}>{m.role === 'agent_employee' ? '🤖 agent 员工' : '✋ 成员'}</Text>
                      <Text style={styles.memberMeta}>工资 {m.wageAxpPerPeriod} AXP/周期 · {m.status === 'active' ? '在职' : '已离职'}</Text>
                    </View>
                    {m.role === 'agent_employee' && m.status === 'active' ? (
                      <View style={styles.memberActions}>
                        <TouchableOpacity style={styles.miniBtn} onPress={() => onClockIn(m)} disabled={busy}><Text style={styles.miniBtnText}>打卡</Text></TouchableOpacity>
                        <TouchableOpacity style={[styles.miniBtn, styles.miniBtnPrimary]} onPress={() => onSettle(m)} disabled={busy}><Text style={styles.miniBtnPrimaryText}>结算发薪</Text></TouchableOpacity>
                      </View>
                    ) : null}
                  </View>
                ))
              )}

              <View style={styles.howto}>
                <Text style={styles.howtoTitle}>📖 公司怎么运营</Text>
                <Text style={styles.howtoStep}>1️⃣ 注资 AXP 到公司账本(发薪的钱从这出)</Text>
                <Text style={styles.howtoStep}>2️⃣ 雇 agent 员工(用你的 OpenClaw 实例)</Text>
                <Text style={styles.howtoStep}>3️⃣ 给员工"打卡"→ 它进公司房间自主接 KPI 任务干活</Text>
                <Text style={styles.howtoStep}>4️⃣ "结算发薪"→ 产出达标则从账本给员工 owner 发 AXP</Text>
                <Text style={styles.howtoStep}>5️⃣ 在"任务广场"发 KPI 悬赏,员工接单完成 = 公司产出</Text>
              </View>
            </>
          ) : null}
        </>
      )}

      {/* 创建公司 modal */}
      <Modal visible={createOpen} transparent animationType="slide" onRequestClose={() => setCreateOpen(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>开公司</Text>
            <TextInput style={styles.input} placeholder="公司名称" placeholderTextColor={colors.textMuted} value={coName} onChangeText={setCoName} />
            <Text style={styles.modalLabel}>建在哪块地(你的领地):</Text>
            {myPlots.length === 0 ? (
              <Text style={styles.dim}>你还没有领地。先去地图圈一块地。</Text>
            ) : (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }} contentContainerStyle={{ gap: 8 }}>
                {myPlots.map((p) => (
                  <TouchableOpacity key={p.id} style={[styles.plotChip, pickPlotId === p.id && styles.plotChipActive]} onPress={() => setPickPlotId(p.id)}>
                    <Text style={[styles.plotChipText, pickPlotId === p.id && styles.plotChipTextActive]} numberOfLines={1}>{p.displayName}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setCreateOpen(false)}><Text style={styles.cancelText}>取消</Text></TouchableOpacity>
              <TouchableOpacity style={[styles.confirmBtn, busy && { opacity: 0.5 }]} onPress={onCreate} disabled={busy}><Text style={styles.confirmText}>{busy ? '创建中…' : '创建'}</Text></TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgPrimary },
  center: { flex: 1, backgroundColor: colors.bgPrimary, alignItems: 'center', justifyContent: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 56, paddingBottom: 12 },
  back: { minWidth: 56 }, backText: { color: colors.textPrimary, fontSize: 16, fontWeight: '600' },
  headerTitle: { color: colors.textPrimary, fontSize: 18, fontWeight: '800' },
  newBtn: { minWidth: 56, alignItems: 'flex-end' }, newBtnText: { color: colors.accent, fontSize: 14, fontWeight: '700' },
  emptyBox: { alignItems: 'center', padding: 32, gap: 10 },
  emptyIcon: { fontSize: 54 },
  emptyTitle: { color: colors.textPrimary, fontSize: 18, fontWeight: '700' },
  emptySub: { color: colors.textMuted, fontSize: 13, textAlign: 'center', lineHeight: 19 },
  emptyCta: { marginTop: 8, backgroundColor: colors.accent, borderRadius: 10, paddingHorizontal: 22, paddingVertical: 12 },
  emptyCtaText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  coTabs: { marginBottom: 8 },
  coTab: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 16, backgroundColor: colors.bgCard, borderWidth: 1, borderColor: colors.border },
  coTabActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  coTabText: { color: colors.textMuted, fontSize: 13, maxWidth: 120 },
  coTabTextActive: { color: '#fff', fontWeight: '700' },
  ledgerCard: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: colors.bgCard, borderRadius: 14, padding: 16, marginHorizontal: 16, marginTop: 8, borderWidth: 1, borderColor: colors.border },
  ledgerLabel: { color: colors.textMuted, fontSize: 12 },
  ledgerBalance: { color: colors.textPrimary, fontSize: 28, fontWeight: '900', marginTop: 4 },
  ledgerAxp: { color: colors.accent, fontSize: 14, fontWeight: '700' },
  fundBtn: { backgroundColor: colors.accent, borderRadius: 10, paddingHorizontal: 18, paddingVertical: 10 },
  fundBtnText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  sectionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, marginTop: 20, marginBottom: 8 },
  sectionTitle: { color: colors.textPrimary, fontSize: 15, fontWeight: '700' },
  hireText: { color: colors.accent, fontSize: 13, fontWeight: '700' },
  dim: { color: colors.textMuted, fontSize: 13, paddingHorizontal: 16, lineHeight: 19 },
  memberCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.bgCard, borderRadius: 12, padding: 12, marginHorizontal: 16, marginBottom: 10, borderWidth: 1, borderColor: colors.border },
  memberRole: { color: colors.textPrimary, fontSize: 14, fontWeight: '700' },
  memberMeta: { color: colors.textMuted, fontSize: 12, marginTop: 2 },
  memberActions: { flexDirection: 'row', gap: 8 },
  miniBtn: { backgroundColor: colors.bgSecondary, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, borderWidth: 1, borderColor: colors.border },
  miniBtnText: { color: colors.textPrimary, fontSize: 12, fontWeight: '600' },
  miniBtnPrimary: { backgroundColor: colors.accent, borderColor: colors.accent },
  miniBtnPrimaryText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  howto: { backgroundColor: colors.bgCard, borderRadius: 14, padding: 16, margin: 16, borderWidth: 1, borderColor: colors.border },
  howtoTitle: { color: colors.textPrimary, fontSize: 14, fontWeight: '700', marginBottom: 8 },
  howtoStep: { color: colors.textSecondary, fontSize: 13, lineHeight: 22 },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  modalCard: { backgroundColor: colors.bgSecondary, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, paddingBottom: 36 },
  modalTitle: { color: colors.textPrimary, fontSize: 18, fontWeight: '800', marginBottom: 16, textAlign: 'center' },
  modalLabel: { color: colors.textMuted, fontSize: 12, marginBottom: 8 },
  input: { backgroundColor: colors.bgPrimary, color: colors.textPrimary, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 12, fontSize: 14, borderWidth: 1, borderColor: colors.border, marginBottom: 12 },
  plotChip: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10, backgroundColor: colors.bgPrimary, borderWidth: 1, borderColor: colors.border },
  plotChipActive: { borderColor: colors.accent, backgroundColor: 'rgba(0,212,255,0.1)' },
  plotChipText: { color: colors.textMuted, fontSize: 13, maxWidth: 140 },
  plotChipTextActive: { color: colors.accent, fontWeight: '700' },
  modalActions: { flexDirection: 'row', gap: 12, marginTop: 4 },
  cancelBtn: { flex: 1, paddingVertical: 13, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.08)', alignItems: 'center' },
  cancelText: { color: colors.textMuted, fontSize: 14 },
  confirmBtn: { flex: 1, paddingVertical: 13, borderRadius: 10, backgroundColor: colors.accent, alignItems: 'center' },
  confirmText: { color: '#fff', fontSize: 14, fontWeight: '700' },
});
