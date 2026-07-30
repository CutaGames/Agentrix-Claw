/**
 * Multi-Agent v2.1 — Pet "经济身份" Tab (mobile).
 *
 * Visualizes AgentAccount + marketplace earnings + Arena ELO for one of
 * the user's LivingPets. Per PM decision (§6 OPEN ISSUE 6 = "全部展示"),
 * mobile shows the full view including spending limits + credit score.
 *
 * Navigation: pushed from PetCompanionScreen via "经济身份 →" button when
 * v2.1 flag is on.
 *
 * Spec: MULTI_AGENT_V2_1_PRODUCT_DECISIONS §4.
 */

import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  RefreshControl,
  Pressable,
} from 'react-native';
import { colors } from '../../theme/colors';
import {
  fetchPetAccount,
  type PetAccountView,
} from '../../services/petAccount.api';
import { themedStyles } from '../../theme/useTheme';

interface Props {
  livingPetId: string;
  onBack?: () => void;
}

export default function PetAccountScreen({ livingPetId, onBack }: Props) {
  const [view, setView] = useState<PetAccountView | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setError(null);
    try {
      const v = await fetchPetAccount(livingPetId);
      setView(v);
    } catch (e: any) {
      setError(e?.message || '加载失败');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [livingPetId]);

  if (loading && !view) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  if (error && !view) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>⚠️ {error}</Text>
        <Pressable
          onPress={() => {
            setLoading(true);
            load();
          }}
        >
          <Text style={styles.retry}>重试</Text>
        </Pressable>
      </View>
    );
  }

  if (!view) return null;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => {
            setRefreshing(true);
            load();
          }}
          tintColor={colors.accent}
        />
      }
    >
      {onBack ? (
        <Pressable onPress={onBack} style={styles.backBtn}>
          <Text style={styles.backText}>{'← 返回'}</Text>
        </Pressable>
      ) : null}

      <Text style={styles.title}>🦊 {view.petName}</Text>
      <Text style={styles.subtitle}>经济身份</Text>

      {/* Agent block */}
      {view.agent ? (
        <Section title="Agent 身份">
          <Row k="Agent ID" v={view.agent.agentUniqueId} />
          <Row
            k="信用评分"
            v={`${view.agent.creditScore.toFixed(0)} / 1000  (${stars(view.agent.creditScore)})`}
          />
          <Row k="风险等级" v={view.agent.riskLevel} />
          <Row k="状态" v={statusZh(view.agent.status)} />
          <Row k="偏好模型" v={view.agent.preferredModel || '系统默认'} />
          <Row k="偏好厂商" v={view.agent.preferredProvider || '系统默认'} />
        </Section>
      ) : (
        <Section title="Agent 身份">
          <Text style={styles.dim}>这只 Pet 还未绑定 AgentAccount。</Text>
          <Text style={styles.dim}>到桌面端点 “🦊 把我的宠物加入团队” 来激活。</Text>
        </Section>
      )}

      {/* Spending */}
      {view.agent?.spendingLimits ? (
        <Section title="支出">
          <Row
            k="今日已用"
            v={`$${view.agent.usedTodayAmount.toFixed(2)} / $${view.agent.spendingLimits.dailyLimit}`}
          />
          <Row
            k="本月已用"
            v={`$${view.agent.usedMonthAmount.toFixed(2)} / $${view.agent.spendingLimits.monthlyLimit}`}
          />
          <Row
            k="单笔上限"
            v={`$${view.agent.spendingLimits.singleTxLimit} ${view.agent.spendingLimits.currency}`}
          />
        </Section>
      ) : null}

      {/* Marketplace earnings */}
      <Section title="Marketplace 雇佣">
        <Row k="是否上架" v={view.marketplace.listed ? '✅ 已上架' : '— 未上架'} />
        {view.marketplace.publishedHireCostUsd != null ? (
          <Row
            k="发布雇佣费"
            v={`$${view.marketplace.publishedHireCostUsd.toFixed(2)}`}
          />
        ) : null}
        <Row
          k="历史雇佣"
          v={`${view.marketplace.lifetimeHireCount} 次`}
        />
        <Row
          k="累计收入"
          v={`$${view.marketplace.lifetimeEarnedUsd.toFixed(2)}`}
        />
        {view.marketplace.lifetimeHireCount > 0 ? (
          <Text style={styles.dim}>
            🏆 你的 Pet 帮 {view.marketplace.lifetimeHireCount} 个人完成了任务
          </Text>
        ) : null}
      </Section>

      {/* Arena ELO */}
      {view.arena ? (
        <Section title="Arena ELO">
          <Row k="当前 ELO" v={String(view.arena.currentElo)} />
          <Row k="W / L" v={`${view.arena.wins} / ${view.arena.losses}`} />
          {view.arena.rankInUserPool != null ? (
            <Row k="个人池排名" v={`#${view.arena.rankInUserPool}`} />
          ) : null}
          {view.arena.rankGlobal != null ? (
            <Row k="全球排名" v={`#${view.arena.rankGlobal}`} />
          ) : null}
          <Row k="生产力分" v={String(view.arena.productivityScore)} />
        </Section>
      ) : (
        <Section title="Arena ELO">
          <Text style={styles.dim}>暂无对战记录。在桌面端 AgentTeamPanel 触发首次 Arena 比赛后,这里会更新。</Text>
        </Section>
      )}
    </ScrollView>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowKey}>{k}</Text>
      <Text style={styles.rowVal}>{v}</Text>
    </View>
  );
}

function stars(score: number): string {
  if (score >= 800) return '★★★★★';
  if (score >= 600) return '★★★★☆';
  if (score >= 400) return '★★★☆☆';
  if (score >= 200) return '★★☆☆☆';
  return '★☆☆☆☆';
}

function statusZh(s: string): string {
  switch (s) {
    case 'active':
      return '活跃';
    case 'draft':
      return '草稿';
    case 'suspended':
      return '暂停';
    case 'revoked':
      return '已撤销';
    default:
      return s;
  }
}

const styles = themedStyles(() => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: 16, paddingBottom: 40 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  backBtn: { paddingVertical: 8, alignSelf: 'flex-start' },
  backText: { color: colors.accent, fontSize: 14 },
  title: { color: colors.text, fontSize: 22, fontWeight: '700', marginBottom: 4 },
  subtitle: { color: colors.textSecondary, fontSize: 13, marginBottom: 16 },
  section: {
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 10,
    padding: 14,
    marginBottom: 12,
  },
  sectionTitle: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 10,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 5,
  },
  rowKey: { color: colors.textSecondary, fontSize: 13 },
  rowVal: { color: colors.text, fontSize: 13, fontWeight: '500' },
  dim: { color: colors.textSecondary, fontSize: 12, marginTop: 4 },
  errorText: { color: '#fca5a5', fontSize: 14, marginBottom: 8 },
  retry: { color: colors.accent, fontSize: 14, padding: 8 },
}));
