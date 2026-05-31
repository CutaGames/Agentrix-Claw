/**
 * PetPlaygroundScreen — Mobile Phase 6 综合面板
 *   Growth · Achievements · Memory Album · Minigames · Breeding
 */
import React from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { colors } from '../../theme/colors';
import {
  type BreedingEgg,
  type BreedingListResp,
  type BreedingStatus,
  MINIGAME_META,
  type MinigameKey,
  type MinigameLeaderboardRow,
  type MinigameScoreItem,
  type MinigameSubmitResult,
  type PetAchievementItem,
  type PetMemoryItem,
  acceptBreeding,
  cancelBreeding,
  createMemory,
  declineBreeding,
  deleteMemory,
  formatCountdown,
  formatRelativeTime,
  hatchBreeding,
  inviteBreeding,
  listAchievements,
  listMemories,
  listMinigameHistory,
  listMinigameLeaderboard,
  listMyBreedingEggs,
  submitMinigameScore,
} from '../../services/petPhase6Sdk';
import { getPetState } from '../../services/mobilePetSdk';
import type { PetState } from '../../../shared/types/agentrix-presence';

type Tab = 'growth' | 'achievements' | 'memories' | 'minigames' | 'breeding';

const TABS: { key: Tab; label: string; emoji: string }[] = [
  { key: 'growth', label: '成长', emoji: '📊' },
  { key: 'achievements', label: '成就', emoji: '🏆' },
  { key: 'memories', label: '相册', emoji: '📔' },
  { key: 'minigames', label: '游戏', emoji: '🎮' },
  { key: 'breeding', label: '繁育', emoji: '💞' },
];

export function PetPlaygroundScreen(): React.ReactElement {
  const [tab, setTab] = React.useState<Tab>('growth');
  return (
    <View style={styles.container}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabBar} style={styles.tabBarScroll}>
        {TABS.map((t) => (
          <Pressable
            key={t.key}
            onPress={() => setTab(t.key)}
            style={[styles.tabBtn, tab === t.key && styles.tabBtnActive]}
          >
            <Text style={[styles.tabBtnText, tab === t.key && styles.tabBtnTextActive]}>
              {t.emoji} {t.label}
            </Text>
          </Pressable>
        ))}
      </ScrollView>
      <ScrollView style={styles.body} contentContainerStyle={{ padding: 12, paddingBottom: 40 }}>
        {tab === 'growth' && <GrowthSection />}
        {tab === 'achievements' && <AchievementsSection />}
        {tab === 'memories' && <MemoriesSection />}
        {tab === 'minigames' && <MinigamesSection />}
        {tab === 'breeding' && <BreedingSection />}
      </ScrollView>
    </View>
  );
}

// ── Growth ───────────────────────────────────────────────────────────

function GrowthSection(): React.ReactElement {
  const [state, setState] = React.useState<PetState | null>(null);
  const [achievements, setAchievements] = React.useState<PetAchievementItem[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const refresh = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [s, a] = await Promise.all([getPetState(), listAchievements()]);
      setState(s);
      setAchievements(a.items ?? []);
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  }, []);
  React.useEffect(() => {
    void refresh();
  }, [refresh]);

  const xp = state?.intimacy_xp ?? 0;
  const level = state?.intimacy_level ?? 0;
  const LEVEL_XP = [0, 50, 150, 350, 700, 1200];
  const next = LEVEL_XP[level + 1] ?? null;
  const xpInLevel = xp - (LEVEL_XP[level] ?? 0);
  const xpToNext = next != null ? next - (LEVEL_XP[level] ?? 0) : 1;
  const xpPct = next != null ? Math.min(100, Math.round((xpInLevel / xpToNext) * 100)) : 100;
  const unlockedCount = achievements.filter((a) => a.unlocked).length;
  const recent = achievements
    .filter((a) => a.unlocked && a.unlocked_at)
    .sort((a, b) => (b.unlocked_at ?? 0) - (a.unlocked_at ?? 0))
    .slice(0, 4);

  return (
    <View>
      <SectionHeader title="📊 成长面板" subtitle="亲密度 · 情绪 · 成就" onRefresh={refresh} loading={loading} />
      {error && <ErrorText msg={error} />}
      <View style={styles.card}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <View style={styles.avatar}>
            <Text style={{ fontSize: 32 }}>🐾</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.label}>当前情绪</Text>
            <Text style={styles.bigValue}>
              {state?.emotion ?? 'calm'}{' '}
              <Text style={styles.label}>强度 {state?.emotion_intensity ?? 0}</Text>
            </Text>
            <Text style={styles.muted}>
              灵魂 {state?.soul_template_id ?? '—'} · 主代理 {state?.primary_agent_id ?? '—'}
            </Text>
          </View>
        </View>
      </View>
      <View style={styles.card}>
        <Text style={styles.label}>亲密度</Text>
        <Text style={styles.bigValue}>
          Lv {level}{' '}
          <Text style={styles.label}>
            {xp} XP {next != null ? `/ 下一级 ${next}` : '（已满级）'}
          </Text>
        </Text>
        <View style={styles.progressBg}>
          <View style={[styles.progressFill, { width: `${xpPct}%` }]} />
        </View>
      </View>
      <View style={styles.card}>
        <Text style={styles.label}>最近解锁</Text>
        <Text style={styles.bigValue}>
          🏆 {unlockedCount} / {achievements.length}
        </Text>
        {recent.length === 0 ? (
          <Text style={styles.muted}>还没有解锁成就 — 多陪陪它吧</Text>
        ) : (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
            {recent.map((a) => (
              <View key={a.key} style={styles.achievementChip}>
                <Text style={{ fontSize: 18 }}>{a.icon || '🏅'}</Text>
                <Text style={styles.chipText} numberOfLines={1}>
                  {a.label_zh}
                </Text>
              </View>
            ))}
          </View>
        )}
      </View>
    </View>
  );
}

// ── Achievements ─────────────────────────────────────────────────────

function AchievementsSection(): React.ReactElement {
  const [items, setItems] = React.useState<PetAchievementItem[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [filter, setFilter] = React.useState<'all' | 'unlocked' | 'locked'>('all');
  const refresh = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await listAchievements();
      setItems(r.items ?? []);
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  }, []);
  React.useEffect(() => {
    void refresh();
  }, [refresh]);
  const filtered = items.filter((it) =>
    filter === 'unlocked' ? it.unlocked : filter === 'locked' ? !it.unlocked : true,
  );
  return (
    <View>
      <SectionHeader
        title="🏆 宠物成就"
        subtitle={`${items.filter((it) => it.unlocked).length} / ${items.length}`}
        onRefresh={refresh}
        loading={loading}
      />
      <View style={styles.pillRow}>
        {(['all', 'unlocked', 'locked'] as const).map((k) => (
          <Pressable
            key={k}
            onPress={() => setFilter(k)}
            style={[styles.pill, filter === k && styles.pillActive]}
          >
            <Text style={[styles.pillText, filter === k && styles.pillTextActive]}>
              {k === 'all' ? '全部' : k === 'unlocked' ? '已解锁' : '未解锁'}
            </Text>
          </Pressable>
        ))}
      </View>
      {error && <ErrorText msg={error} />}
      {filtered.map((it) => (
        <View key={it.key} style={[styles.card, !it.unlocked && { opacity: 0.55 }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Text style={{ fontSize: 28 }}>{it.icon || '🏅'}</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.title}>{it.label_zh}</Text>
              <Text style={styles.muted}>{it.label_en}</Text>
            </View>
          </View>
          <Text style={styles.desc} numberOfLines={3}>
            {it.desc_zh}
          </Text>
          <Text style={styles.tinyMuted}>
            {it.unlocked && it.unlocked_at
              ? `解锁于 ${formatRelativeTime(it.unlocked_at)}`
              : it.threshold != null
              ? `条件：达到 ${it.threshold}`
              : '未解锁'}
          </Text>
        </View>
      ))}
    </View>
  );
}

// ── Memories ─────────────────────────────────────────────────────────

const CATEGORIES = ['all', 'milestone', 'chat', 'task', 'creation', 'other'] as const;
const CAT_LABELS: Record<(typeof CATEGORIES)[number], string> = {
  all: '全部',
  milestone: '里程碑',
  chat: '对话',
  task: '任务',
  creation: '创作',
  other: '其他',
};

function MemoriesSection(): React.ReactElement {
  const [items, setItems] = React.useState<PetMemoryItem[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [category, setCategory] = React.useState<(typeof CATEGORIES)[number]>('all');
  const [showForm, setShowForm] = React.useState(false);
  const [creating, setCreating] = React.useState(false);
  const [title, setTitle] = React.useState('');
  const [body, setBody] = React.useState('');
  const refresh = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await listMemories({ limit: 60, category: category === 'all' ? undefined : category });
      setItems(r.items ?? []);
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  }, [category]);
  React.useEffect(() => {
    void refresh();
  }, [refresh]);

  const submit = async () => {
    if (!title.trim()) {
      setError('请填写标题');
      return;
    }
    setCreating(true);
    setError(null);
    try {
      await createMemory({
        title: title.trim(),
        body: body.trim() || undefined,
        category: 'milestone',
      });
      setTitle('');
      setBody('');
      setShowForm(false);
      await refresh();
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setCreating(false);
    }
  };
  const handleDelete = (id: string) => {
    Alert.alert('删除', '确定要删除这条记忆吗？', [
      { text: '取消', style: 'cancel' },
      {
        text: '删除',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteMemory(id);
            setItems((cur) => cur.filter((i) => i.id !== id));
          } catch (e: any) {
            setError(e?.message || String(e));
          }
        },
      },
    ]);
  };

  return (
    <View>
      <SectionHeader
        title="📔 时光相册"
        subtitle={`共 ${items.length} 条`}
        onRefresh={refresh}
        loading={loading}
      />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
        {CATEGORIES.map((c) => (
          <Pressable
            key={c}
            onPress={() => setCategory(c)}
            style={[styles.pill, category === c && styles.pillActive]}
          >
            <Text style={[styles.pillText, category === c && styles.pillTextActive]}>
              {CAT_LABELS[c]}
            </Text>
          </Pressable>
        ))}
      </ScrollView>
      <Pressable
        onPress={() => setShowForm((v) => !v)}
        style={[styles.btn, { backgroundColor: '#a78bfa', marginTop: 8 }]}
      >
        <Text style={styles.btnText}>{showForm ? '✕ 取消' : '＋ 新增记忆'}</Text>
      </Pressable>
      {showForm && (
        <View style={styles.card}>
          <TextInput
            value={title}
            onChangeText={setTitle}
            placeholder="标题（必填，例：第一次提交代码）"
            placeholderTextColor={colors.textMuted}
            style={styles.input}
          />
          <TextInput
            value={body}
            onChangeText={setBody}
            placeholder="详细内容（可选）"
            placeholderTextColor={colors.textMuted}
            multiline
            numberOfLines={3}
            style={[styles.input, { height: 80 }]}
          />
          <Pressable
            onPress={submit}
            disabled={creating || !title.trim()}
            style={[
              styles.btn,
              { backgroundColor: '#34d399', opacity: creating || !title.trim() ? 0.5 : 1 },
            ]}
          >
            <Text style={styles.btnText}>{creating ? '保存中…' : '保存'}</Text>
          </Pressable>
        </View>
      )}
      {error && <ErrorText msg={error} />}
      {items.length === 0 && !loading ? (
        <Text style={[styles.muted, { textAlign: 'center', padding: 24 }]}>还没有记忆</Text>
      ) : (
        items.map((m) => (
          <View key={m.id} style={styles.card}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <View style={{ flex: 1 }}>
                <Text style={styles.title}>{m.title}</Text>
                <Text style={styles.tinyMuted}>
                  {m.category && (
                    <Text>
                      {CAT_LABELS[(m.category as keyof typeof CAT_LABELS) ?? 'other'] ?? m.category} ·{' '}
                    </Text>
                  )}
                  {formatRelativeTime(m.created_at)}
                </Text>
              </View>
              <Pressable onPress={() => handleDelete(m.id)}>
                <Text style={{ color: '#f87171', fontSize: 18 }}>✕</Text>
              </Pressable>
            </View>
            {m.body && (
              <Text style={styles.desc} numberOfLines={3}>
                {m.body}
              </Text>
            )}
          </View>
        ))
      )}
    </View>
  );
}

// ── Minigames ────────────────────────────────────────────────────────

function MinigamesSection(): React.ReactElement {
  const [view, setView] = React.useState<'play' | 'history' | 'leaderboard'>('play');
  const [history, setHistory] = React.useState<MinigameScoreItem[]>([]);
  const [leaderboard, setLeaderboard] = React.useState<MinigameLeaderboardRow[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [submitting, setSubmitting] = React.useState<MinigameKey | null>(null);
  const [last, setLast] = React.useState<MinigameSubmitResult | null>(null);
  const refreshHist = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await listMinigameHistory(30);
      setHistory(r.items ?? []);
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  }, []);
  const refreshLb = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await listMinigameLeaderboard();
      setLeaderboard(r.items ?? []);
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  }, []);
  React.useEffect(() => {
    if (view === 'history') void refreshHist();
    if (view === 'leaderboard') void refreshLb();
  }, [view, refreshHist, refreshLb]);

  const playQuick = async (k: MinigameKey) => {
    setSubmitting(k);
    setError(null);
    setLast(null);
    try {
      const meta = MINIGAME_META[k];
      const score =
        Math.floor(Math.random() * meta.scoreCap * 0.8) + Math.floor(meta.scoreCap * 0.1);
      const r = await submitMinigameScore(k, score, { client: 'mobile-quick' });
      setLast(r);
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setSubmitting(null);
    }
  };

  return (
    <View>
      <SectionHeader title="🎮 迷你游戏" subtitle="玩游戏 → 加亲密度" />
      <View style={styles.pillRow}>
        {(['play', 'history', 'leaderboard'] as const).map((v) => (
          <Pressable key={v} onPress={() => setView(v)} style={[styles.pill, view === v && styles.pillActive]}>
            <Text style={[styles.pillText, view === v && styles.pillTextActive]}>
              {v === 'play' ? '快速游戏' : v === 'history' ? '历史' : '排行榜'}
            </Text>
          </Pressable>
        ))}
      </View>
      {error && <ErrorText msg={error} />}
      {last && (
        <View style={[styles.card, { backgroundColor: 'rgba(52,211,153,0.15)' }]}>
          <Text style={{ color: '#a7f3d0', fontSize: 13 }}>
            ✅ 得分 {last.score_clamped} · 亲密度 +{last.intimacy_xp_awarded}
            {last.level_up && ' · 🎉 等级提升'}
          </Text>
        </View>
      )}
      {view === 'play' && (
        <>
          {(Object.keys(MINIGAME_META) as MinigameKey[]).map((k) => {
            const m = MINIGAME_META[k];
            return (
              <View key={k} style={styles.card}>
                <Text style={{ fontSize: 30 }}>{m.emoji}</Text>
                <Text style={styles.title}>{m.label_zh}</Text>
                <Text style={styles.muted}>{m.tagline_zh}</Text>
                <Text style={styles.tinyMuted}>
                  封顶 {m.scoreCap} 分 · XP×{m.xpRate}
                </Text>
                <Pressable
                  onPress={() => void playQuick(k)}
                  disabled={submitting === k}
                  style={[
                    styles.btn,
                    { backgroundColor: '#34d399', opacity: submitting === k ? 0.6 : 1 },
                  ]}
                >
                  <Text style={styles.btnText}>{submitting === k ? '提交中…' : '🎲 快速一局'}</Text>
                </Pressable>
              </View>
            );
          })}
          <Text style={[styles.tinyMuted, { textAlign: 'center', marginTop: 8 }]}>
            移动版"快速一局"会随机一个分数（cap 范围内），后端 clamp + 反作弊。
          </Text>
        </>
      )}
      {view === 'history' && history.length === 0 && !loading && (
        <Text style={[styles.muted, { textAlign: 'center', padding: 24 }]}>还没有游戏记录</Text>
      )}
      {view === 'history' &&
        history.map((it) => {
          const m = MINIGAME_META[it.game_key];
          return (
            <View key={it.id} style={styles.scoreRow}>
              <Text style={{ fontSize: 22 }}>{m?.emoji ?? '🎮'}</Text>
              <View style={{ flex: 1, marginHorizontal: 8 }}>
                <Text style={styles.title}>{m?.label_zh ?? it.game_key}</Text>
                <Text style={styles.tinyMuted}>{formatRelativeTime(it.created_at)}</Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={styles.scoreNum}>{it.score}</Text>
                <Text style={styles.tinyMuted}>+{it.intimacy_xp_awarded} XP</Text>
              </View>
            </View>
          );
        })}
      {view === 'leaderboard' && leaderboard.length === 0 && !loading && (
        <Text style={[styles.muted, { textAlign: 'center', padding: 24 }]}>榜单为空</Text>
      )}
      {view === 'leaderboard' &&
        leaderboard.map((it) => {
          const m = MINIGAME_META[it.game_key];
          return (
            <View key={it.id} style={styles.scoreRow}>
              <Text style={{ fontSize: 22 }}>{m?.emoji ?? '🎮'}</Text>
              <View style={{ flex: 1, marginHorizontal: 8 }}>
                <Text style={styles.title}>{m?.label_zh ?? it.game_key}</Text>
                <Text style={styles.tinyMuted}>{formatRelativeTime(it.created_at)}</Text>
              </View>
              <Text style={styles.scoreNum}>{it.score}</Text>
            </View>
          );
        })}
    </View>
  );
}

// ── Breeding ─────────────────────────────────────────────────────────

const STATUS_LABEL: Record<BreedingStatus, { zh: string; color: string }> = {
  invited: { zh: '等待对方接受', color: '#fbbf24' },
  accepted: { zh: '已接受', color: '#60a5fa' },
  hatching: { zh: '孵化中', color: '#a78bfa' },
  hatched: { zh: '已孵化', color: '#34d399' },
  declined: { zh: '已拒绝', color: '#f87171' },
  cancelled: { zh: '已取消', color: '#9ca3af' },
};

function BreedingSection(): React.ReactElement {
  const [data, setData] = React.useState<BreedingListResp>({ initiated: [], received: [] });
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [showForm, setShowForm] = React.useState(false);
  const [partnerUserId, setPartnerUserId] = React.useState('');
  const [initiatorPetSkinId, setInitiatorPetSkinId] = React.useState('');
  const [partnerPetSkinId, setPartnerPetSkinId] = React.useState('');
  const [submitting, setSubmitting] = React.useState(false);
  const [now, setNow] = React.useState(Date.now());

  const refresh = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await listMyBreedingEggs();
      setData(r);
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  }, []);
  React.useEffect(() => {
    void refresh();
    const t = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(t);
  }, [refresh]);

  const sendInvite = async () => {
    if (!partnerUserId.trim() || !initiatorPetSkinId.trim() || !partnerPetSkinId.trim()) {
      setError('请填写完整：对方用户ID / 我方皮肤ID / 对方皮肤ID');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await inviteBreeding({
        partnerUserId: partnerUserId.trim(),
        initiatorPetSkinId: initiatorPetSkinId.trim(),
        partnerPetSkinId: partnerPetSkinId.trim(),
      });
      setPartnerUserId('');
      setInitiatorPetSkinId('');
      setPartnerPetSkinId('');
      setShowForm(false);
      await refresh();
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setSubmitting(false);
    }
  };
  const action = async (a: 'accept' | 'decline' | 'cancel' | 'hatch', id: string) => {
    setError(null);
    try {
      if (a === 'accept') await acceptBreeding(id);
      if (a === 'decline') await declineBreeding(id);
      if (a === 'cancel') await cancelBreeding(id);
      if (a === 'hatch') await hatchBreeding(id);
      await refresh();
    } catch (e: any) {
      setError(e?.message || String(e));
    }
  };

  const renderEgg = (e: BreedingEgg, isReceived: boolean) => {
    const status = STATUS_LABEL[e.status];
    const canHatch = e.status === 'hatching' && e.hatch_at != null && now >= e.hatch_at;
    const childForMe = isReceived ? e.child_skin_id_partner : e.child_skin_id_initiator;
    return (
      <View key={e.id} style={styles.card}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Text style={{ fontSize: 28 }}>🥚</Text>
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <View
                style={[styles.statusPill, { backgroundColor: status.color + '33', borderColor: status.color + '88' }]}
              >
                <Text style={[styles.statusPillText, { color: status.color }]}>{status.zh}</Text>
              </View>
              <Text style={styles.tinyMuted}>{formatRelativeTime(e.created_at)}</Text>
            </View>
            <Text style={styles.muted} numberOfLines={1}>
              我：{(isReceived ? e.partner_pet_skin_id : e.initiator_pet_skin_id).slice(0, 10)}… ×{' '}
              对方：{(isReceived ? e.initiator_pet_skin_id : e.partner_pet_skin_id).slice(0, 10)}…
            </Text>
            {e.status === 'hatching' && e.hatch_at && (
              <Text style={{ color: '#fbbf24', fontSize: 12, marginTop: 4 }}>
                ⏳ {formatCountdown(e.hatch_at)}
              </Text>
            )}
            {e.status === 'hatched' && childForMe && (
              <Text style={{ color: '#34d399', fontSize: 12, marginTop: 4 }} numberOfLines={1}>
                🎉 你的小宝贝：{childForMe.slice(0, 16)}…
              </Text>
            )}
          </View>
        </View>
        <View style={{ flexDirection: 'row', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
          {isReceived && e.status === 'invited' && (
            <>
              <Pressable
                onPress={() => action('accept', e.id)}
                style={[styles.smallBtn, { backgroundColor: '#34d399' }]}
              >
                <Text style={styles.smallBtnText}>接受</Text>
              </Pressable>
              <Pressable
                onPress={() => action('decline', e.id)}
                style={[styles.smallBtn, { backgroundColor: '#f87171' }]}
              >
                <Text style={styles.smallBtnText}>拒绝</Text>
              </Pressable>
            </>
          )}
          {!isReceived && e.status === 'invited' && (
            <Pressable
              onPress={() => action('cancel', e.id)}
              style={[styles.smallBtn, { backgroundColor: '#9ca3af' }]}
            >
              <Text style={styles.smallBtnText}>取消</Text>
            </Pressable>
          )}
          {canHatch && (
            <Pressable
              onPress={() => action('hatch', e.id)}
              style={[styles.smallBtn, { backgroundColor: '#fbbf24' }]}
            >
              <Text style={[styles.smallBtnText, { color: '#000' }]}>🐣 孵化</Text>
            </Pressable>
          )}
        </View>
      </View>
    );
  };

  return (
    <View>
      <SectionHeader
        title="💞 社交繁育"
        subtitle="邀请好友配对 · 5 天孵化"
        onRefresh={refresh}
        loading={loading}
      />
      <Pressable
        onPress={() => setShowForm((v) => !v)}
        style={[styles.btn, { backgroundColor: '#a78bfa' }]}
      >
        <Text style={styles.btnText}>{showForm ? '✕ 取消' : '💌 发起邀请'}</Text>
      </Pressable>
      {showForm && (
        <View style={styles.card}>
          <TextInput
            value={partnerUserId}
            onChangeText={setPartnerUserId}
            placeholder="对方用户 ID"
            placeholderTextColor={colors.textMuted}
            style={styles.input}
          />
          <TextInput
            value={initiatorPetSkinId}
            onChangeText={setInitiatorPetSkinId}
            placeholder="我方皮肤 ID"
            placeholderTextColor={colors.textMuted}
            style={styles.input}
          />
          <TextInput
            value={partnerPetSkinId}
            onChangeText={setPartnerPetSkinId}
            placeholder="对方皮肤 ID"
            placeholderTextColor={colors.textMuted}
            style={styles.input}
          />
          <Pressable
            onPress={sendInvite}
            disabled={submitting}
            style={[styles.btn, { backgroundColor: '#34d399', opacity: submitting ? 0.6 : 1 }]}
          >
            <Text style={styles.btnText}>{submitting ? '发送中…' : '💌 发送邀请'}</Text>
          </Pressable>
        </View>
      )}
      {error && <ErrorText msg={error} />}
      <Text style={[styles.title, { marginTop: 12, marginBottom: 6 }]}>📨 我收到的邀请</Text>
      {data.received.length === 0 ? (
        <Text style={[styles.muted, { textAlign: 'center', padding: 16 }]}>没有收到的邀请</Text>
      ) : (
        data.received.map((e) => renderEgg(e, true))
      )}
      <Text style={[styles.title, { marginTop: 12, marginBottom: 6 }]}>📤 我发起的</Text>
      {data.initiated.length === 0 ? (
        <Text style={[styles.muted, { textAlign: 'center', padding: 16 }]}>还没有发起繁育邀请</Text>
      ) : (
        data.initiated.map((e) => renderEgg(e, false))
      )}
    </View>
  );
}

// ── Shared bits ──────────────────────────────────────────────────────

function SectionHeader({
  title,
  subtitle,
  onRefresh,
  loading,
}: {
  title: string;
  subtitle: string;
  onRefresh?: () => void;
  loading?: boolean;
}): React.ReactElement {
  return (
    <View style={styles.sectionHeader}>
      <View style={{ flex: 1 }}>
        <Text style={styles.sectionTitle}>{title}</Text>
        <Text style={styles.muted}>{subtitle}</Text>
      </View>
      {onRefresh && (
        <Pressable onPress={onRefresh} disabled={loading}>
          {loading ? <ActivityIndicator size="small" color={colors.accent} /> : <Text style={styles.muted}>↻ 刷新</Text>}
        </Pressable>
      )}
    </View>
  );
}

function ErrorText({ msg }: { msg: string }): React.ReactElement {
  return (
    <View
      style={{
        backgroundColor: 'rgba(248,113,113,0.15)',
        borderRadius: 8,
        padding: 10,
        marginVertical: 6,
      }}
    >
      <Text style={{ color: '#fca5a5', fontSize: 12 }}>{msg}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  tabBarScroll: { flexGrow: 0, flexShrink: 0, maxHeight: 56 },
  tabBar: { gap: 6, paddingHorizontal: 12, paddingVertical: 8, alignItems: 'center' },
  tabBtn: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.06)',
    alignSelf: 'flex-start',
  },
  tabBtnActive: { backgroundColor: colors.primary },
  tabBtnText: { color: colors.textSecondary, fontSize: 13, fontWeight: '600' },
  tabBtnTextActive: { color: colors.text },
  body: { flex: 1 },
  card: {
    borderRadius: 12,
    padding: 12,
    marginVertical: 6,
    backgroundColor: colors.cardBackground,
    borderWidth: 1,
    borderColor: colors.border,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingBottom: 8,
    marginBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  sectionTitle: { color: colors.text, fontSize: 16, fontWeight: '700' },
  title: { color: colors.text, fontSize: 14, fontWeight: '600' },
  label: { color: colors.textSecondary, fontSize: 11 },
  muted: { color: colors.textSecondary, fontSize: 12 },
  tinyMuted: { color: colors.textMuted, fontSize: 11, marginTop: 4 },
  desc: { color: colors.textSecondary, fontSize: 12, marginTop: 6 },
  bigValue: { color: colors.text, fontSize: 18, fontWeight: '700', marginTop: 2 },
  avatar: {
    width: 60,
    height: 60,
    borderRadius: 14,
    backgroundColor: 'rgba(167,139,250,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  progressBg: {
    height: 8,
    backgroundColor: 'rgba(0,0,0,0.3)',
    borderRadius: 4,
    overflow: 'hidden',
    marginTop: 8,
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#34d399',
  },
  achievementChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: 'rgba(251,191,36,0.15)',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(251,191,36,0.4)',
    maxWidth: 140,
  },
  chipText: { color: colors.text, fontSize: 11 },
  pillRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginVertical: 8 },
  pill: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  pillActive: { backgroundColor: '#34d399' },
  pillText: { color: colors.textSecondary, fontSize: 12 },
  pillTextActive: { color: '#000', fontWeight: '600' },
  btn: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 10,
    alignItems: 'center',
    marginVertical: 4,
  },
  btnText: { color: '#fff', fontWeight: '600', fontSize: 14 },
  smallBtn: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
  },
  smallBtnText: { color: '#fff', fontSize: 12, fontWeight: '600' },
  input: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    color: colors.text,
    padding: 10,
    borderRadius: 8,
    marginBottom: 8,
    fontSize: 13,
  },
  scoreRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.04)',
    padding: 10,
    borderRadius: 8,
    marginVertical: 3,
  },
  scoreNum: { color: '#34d399', fontSize: 18, fontWeight: '700' },
  statusPill: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
    borderWidth: 1,
  },
  statusPillText: { fontSize: 10, fontWeight: '600' },
});
