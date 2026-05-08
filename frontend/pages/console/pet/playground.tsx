/**
 * Pet Phase 6 — 综合面板（成长 / 成就 / 时光相册 / 迷你游戏 / 社交繁育）
 * 5 个 Tab 切换；走 apiClient → 后端 /v1/pet/*。
 */
import React from 'react';
import { ConsoleLayout } from '../../../components/console/ConsoleLayout';
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
  formatCountdown,
  formatRelativeTime,
  petPhase6Api,
} from '../../../lib/api/pet-phase6.api';
import { v1Api, type PetState } from '../../../lib/api/v1.api';

type Tab = 'growth' | 'achievements' | 'memories' | 'minigames' | 'breeding';

const TABS: { key: Tab; label: string; emoji: string }[] = [
  { key: 'growth', label: '成长面板', emoji: '📊' },
  { key: 'achievements', label: '成就', emoji: '🏆' },
  { key: 'memories', label: '时光相册', emoji: '📔' },
  { key: 'minigames', label: '迷你游戏', emoji: '🎮' },
  { key: 'breeding', label: '社交繁育', emoji: '💞' },
];

export default function PetPlaygroundPage(): React.ReactElement {
  const [tab, setTab] = React.useState<Tab>('growth');
  return (
    <ConsoleLayout title="🐾 宠物中心 · Phase 6">
      <div className="mb-4 flex flex-wrap gap-2">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`rounded-md px-4 py-2 text-sm font-medium transition ${
              tab === t.key
                ? 'bg-emerald-600 text-white'
                : 'bg-white/5 text-white/70 hover:bg-white/10'
            }`}
          >
            {t.emoji} {t.label}
          </button>
        ))}
      </div>
      <div className="rounded-xl border border-white/10 bg-[#0b0b13] p-4 text-white">
        {tab === 'growth' && <GrowthTab />}
        {tab === 'achievements' && <AchievementsTab />}
        {tab === 'memories' && <MemoriesTab />}
        {tab === 'minigames' && <MinigamesTab />}
        {tab === 'breeding' && <BreedingTab />}
      </div>
    </ConsoleLayout>
  );
}

// ── Growth ───────────────────────────────────────────────────────────

function GrowthTab(): React.ReactElement {
  const [state, setState] = React.useState<PetState | null>(null);
  const [achievements, setAchievements] = React.useState<PetAchievementItem[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const refresh = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [s, a] = await Promise.all([v1Api.pet.getState(), petPhase6Api.listAchievements()]);
      if (s) setState(s);
      setAchievements(a?.items ?? []);
    } catch (e: unknown) {
      setError((e as Error)?.message || String(e));
    } finally {
      setLoading(false);
    }
  }, []);
  React.useEffect(() => {
    void refresh();
  }, [refresh]);

  const xp = state?.intimacy_xp ?? 0;
  const level = state?.intimacy_level ?? 0;
  // Approx threshold table（与桌面端一致）
  const LEVEL_XP = [0, 50, 150, 350, 700, 1200];
  const nextThreshold = LEVEL_XP[level + 1] ?? null;
  const xpInLevel = xp - (LEVEL_XP[level] ?? 0);
  const xpToNext = nextThreshold != null ? nextThreshold - (LEVEL_XP[level] ?? 0) : 1;
  const xpPct = nextThreshold != null ? Math.min(100, Math.round((xpInLevel / xpToNext) * 100)) : 100;
  const unlockedCount = achievements.filter((a) => a.unlocked).length;
  const recent = achievements
    .filter((a) => a.unlocked && a.unlocked_at)
    .sort((a, b) => (b.unlocked_at ?? 0) - (a.unlocked_at ?? 0))
    .slice(0, 6);

  return (
    <div className="space-y-4">
      <Header
        title="成长面板"
        subtitle="亲密度 / 情绪 / 成就一览"
        rightExtra={
          <button onClick={refresh} disabled={loading} className="text-xs text-white/50 hover:text-white">
            {loading ? '刷新中…' : '↻ 刷新'}
          </button>
        }
      />
      {error && <ErrorBanner msg={error} />}
      <section className="flex flex-wrap gap-3 rounded-xl border border-white/10 bg-white/5 p-4">
        <div className="flex h-20 w-20 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-600/30 to-emerald-600/30 text-4xl ring-1 ring-white/10">
          🐾
        </div>
        <div className="flex-1">
          <div className="text-xs text-white/50">当前情绪</div>
          <div className="mt-1 text-xl font-semibold capitalize">
            {state?.emotion ?? 'calm'}{' '}
            <span className="ml-1 text-xs text-white/50">强度 {state?.emotion_intensity ?? 0}</span>
          </div>
          <div className="mt-2 text-xs text-white/60">
            灵魂：<span className="text-emerald-300">{state?.soul_template_id ?? '—'}</span>
            <span className="mx-2 text-white/20">·</span>
            主代理：<span className="text-blue-300">{state?.primary_agent_id ?? '—'}</span>
          </div>
        </div>
      </section>
      <section className="rounded-xl border border-white/10 bg-white/5 p-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-xs uppercase tracking-wide text-white/50">亲密度</div>
            <div className="mt-1 text-2xl font-bold">
              Lv {level}{' '}
              <span className="ml-2 text-sm font-normal text-white/60">
                {xp} XP {nextThreshold != null ? `/ 下一级 ${nextThreshold}` : '（已满级）'}
              </span>
            </div>
          </div>
        </div>
        <div className="mt-3 h-3 w-full overflow-hidden rounded-full bg-black/30">
          <div
            className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-cyan-400 transition-all"
            style={{ width: `${xpPct}%` }}
          />
        </div>
      </section>
      <section className="rounded-xl border border-white/10 bg-white/5 p-4">
        <div className="mb-2 text-xs uppercase tracking-wide text-white/50">最近解锁</div>
        <div className="text-lg font-semibold">
          🏆 {unlockedCount} / {achievements.length} 个成就
        </div>
        {recent.length === 0 ? (
          <div className="mt-3 py-4 text-center text-xs text-white/50">还没有解锁成就 — 多陪陪它吧</div>
        ) : (
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
            {recent.map((a) => (
              <div
                key={a.key}
                className="flex items-center gap-2 rounded-lg border border-amber-400/30 bg-amber-500/10 p-2"
              >
                <span className="text-2xl">{a.icon || '🏅'}</span>
                <div className="min-w-0">
                  <div className="truncate text-xs font-semibold">{a.label_zh}</div>
                  <div className="text-[10px] text-white/40">
                    {a.unlocked_at ? formatRelativeTime(a.unlocked_at) : ''}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

// ── Achievements ─────────────────────────────────────────────────────

function AchievementsTab(): React.ReactElement {
  const [items, setItems] = React.useState<PetAchievementItem[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [filter, setFilter] = React.useState<'all' | 'unlocked' | 'locked'>('all');

  const refresh = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await petPhase6Api.listAchievements();
      setItems(r?.items ?? []);
    } catch (e: unknown) {
      setError((e as Error)?.message || String(e));
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
    <div className="space-y-3">
      <Header
        title="宠物成就"
        subtitle={`已解锁 ${items.filter((it) => it.unlocked).length} / ${items.length}`}
      />
      <div className="flex items-center gap-2 text-xs">
        {(['all', 'unlocked', 'locked'] as const).map((k) => (
          <button
            key={k}
            onClick={() => setFilter(k)}
            className={`rounded-md px-3 py-1 ${
              filter === k ? 'bg-emerald-600/80' : 'bg-white/5 text-white/70 hover:bg-white/10'
            }`}
          >
            {k === 'all' ? '全部' : k === 'unlocked' ? '已解锁' : '未解锁'}
          </button>
        ))}
        <button onClick={refresh} disabled={loading} className="ml-auto text-white/50 hover:text-white">
          {loading ? '刷新中…' : '↻ 刷新'}
        </button>
      </div>
      {error && <ErrorBanner msg={error} />}
      {filtered.length === 0 && !loading ? (
        <div className="py-12 text-center text-sm text-white/50">没有成就</div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {filtered.map((it) => (
            <article
              key={it.key}
              className={`flex flex-col gap-2 rounded-xl border p-3 ${
                it.unlocked
                  ? 'border-amber-400/40 bg-amber-500/10'
                  : 'border-white/10 bg-white/5 opacity-60'
              }`}
            >
              <div className="flex items-start gap-2">
                <span className="text-3xl leading-none">{it.icon || '🏅'}</span>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold">{it.label_zh}</div>
                  <div className="text-[11px] text-white/50">{it.label_en}</div>
                </div>
              </div>
              <p className="text-xs text-white/70 line-clamp-3">{it.desc_zh}</p>
              <div className="text-[10px] text-white/40">
                {it.unlocked && it.unlocked_at
                  ? `解锁于 ${formatRelativeTime(it.unlocked_at)}`
                  : it.threshold != null
                  ? `条件：达到 ${it.threshold}`
                  : '未解锁'}
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
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

function MemoriesTab(): React.ReactElement {
  const [items, setItems] = React.useState<PetMemoryItem[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [category, setCategory] = React.useState<(typeof CATEGORIES)[number]>('all');
  const [showForm, setShowForm] = React.useState(false);
  const [creating, setCreating] = React.useState(false);
  const [title, setTitle] = React.useState('');
  const [body, setBody] = React.useState('');
  const [thumb, setThumb] = React.useState('');
  const [formCat, setFormCat] = React.useState('milestone');

  const refresh = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await petPhase6Api.listMemories({
        limit: 100,
        category: category === 'all' ? undefined : category,
      });
      setItems(r?.items ?? []);
    } catch (e: unknown) {
      setError((e as Error)?.message || String(e));
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
      await petPhase6Api.createMemory({
        title: title.trim(),
        body: body.trim() || undefined,
        thumbnailUrl: thumb.trim() || null,
        category: formCat,
      });
      setTitle('');
      setBody('');
      setThumb('');
      setShowForm(false);
      await refresh();
    } catch (e: unknown) {
      setError((e as Error)?.message || String(e));
    } finally {
      setCreating(false);
    }
  };
  const handleDelete = async (id: string) => {
    if (!window.confirm('删除这条记忆？')) return;
    try {
      await petPhase6Api.deleteMemory(id);
      setItems((cur) => cur.filter((i) => i.id !== id));
    } catch (e: unknown) {
      setError((e as Error)?.message || String(e));
    }
  };
  return (
    <div className="space-y-3">
      <Header title="时光相册" subtitle={`共 ${items.length} 条记忆`} />
      <div className="flex flex-wrap items-center gap-2 text-xs">
        {CATEGORIES.map((c) => (
          <button
            key={c}
            onClick={() => setCategory(c)}
            className={`rounded-md px-3 py-1 ${
              category === c ? 'bg-emerald-600/80' : 'bg-white/5 text-white/70 hover:bg-white/10'
            }`}
          >
            {CAT_LABELS[c]}
          </button>
        ))}
        <div className="ml-auto flex gap-2">
          <button
            onClick={() => setShowForm((v) => !v)}
            className="rounded-md bg-purple-600/80 px-3 py-1 font-medium hover:bg-purple-500"
          >
            {showForm ? '✕ 取消' : '＋ 新增记忆'}
          </button>
          <button onClick={refresh} disabled={loading} className="text-white/50 hover:text-white">
            {loading ? '…' : '↻'}
          </button>
        </div>
      </div>
      {showForm && (
        <div className="rounded-md border border-white/10 bg-black/30 p-3">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="标题（必填，例：第一次提交代码）"
              className="rounded-md bg-white/10 px-3 py-2 text-sm placeholder-white/40"
            />
            <select
              value={formCat}
              onChange={(e) => setFormCat(e.target.value)}
              className="rounded-md bg-white/10 px-3 py-2 text-sm"
            >
              {CATEGORIES.filter((c) => c !== 'all').map((c) => (
                <option key={c} value={c} className="bg-[#0b0b13]">
                  {CAT_LABELS[c]}
                </option>
              ))}
            </select>
            <input
              value={thumb}
              onChange={(e) => setThumb(e.target.value)}
              placeholder="缩略图 URL（可选）"
              className="rounded-md bg-white/10 px-3 py-2 text-sm placeholder-white/40 sm:col-span-2"
            />
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="详细内容（可选）"
              rows={3}
              className="rounded-md bg-white/10 px-3 py-2 text-sm placeholder-white/40 sm:col-span-2"
            />
          </div>
          <div className="mt-2 flex justify-end">
            <button
              onClick={submit}
              disabled={creating || !title.trim()}
              className="rounded-md bg-emerald-600/80 px-4 py-1.5 text-sm font-medium hover:bg-emerald-500 disabled:opacity-50"
            >
              {creating ? '保存中…' : '保存'}
            </button>
          </div>
        </div>
      )}
      {error && <ErrorBanner msg={error} />}
      {items.length === 0 && !loading ? (
        <div className="py-12 text-center text-sm text-white/50">还没有记忆，点 ＋ 创建第一条吧</div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((m) => (
            <article
              key={m.id}
              className="group flex flex-col gap-2 rounded-xl border border-white/10 bg-white/5 p-3 hover:bg-white/10"
            >
              {m.thumbnail_url && (
                <div className="h-28 w-full overflow-hidden rounded-md bg-black/30">
                  <img src={m.thumbnail_url} alt={m.title} className="h-full w-full object-cover" />
                </div>
              )}
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold">{m.title}</div>
                  <div className="mt-0.5 text-[10px] text-white/40">
                    {m.category && (
                      <span className="mr-1 rounded bg-white/10 px-1.5 py-0.5">
                        {CAT_LABELS[(m.category as keyof typeof CAT_LABELS) ?? 'other'] ?? m.category}
                      </span>
                    )}
                    {formatRelativeTime(m.created_at)}
                  </div>
                </div>
                <button
                  onClick={() => void handleDelete(m.id)}
                  className="opacity-0 group-hover:opacity-100 text-xs text-red-300 hover:text-red-200"
                  title="删除"
                >
                  ✕
                </button>
              </div>
              {m.body && <p className="text-xs text-white/70 line-clamp-3">{m.body}</p>}
            </article>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Minigames (web 简化版：随机得分 + 历史 + 排行榜) ──────────────────

function MinigamesTab(): React.ReactElement {
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
      const r = await petPhase6Api.listMinigameHistory(30);
      setHistory(r?.items ?? []);
    } catch (e: unknown) {
      setError((e as Error)?.message || String(e));
    } finally {
      setLoading(false);
    }
  }, []);
  const refreshLb = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await petPhase6Api.listMinigameLeaderboard();
      setLeaderboard(r?.items ?? []);
    } catch (e: unknown) {
      setError((e as Error)?.message || String(e));
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
      const score = Math.floor(Math.random() * meta.scoreCap * 0.8) + Math.floor(meta.scoreCap * 0.1);
      const r = await petPhase6Api.submitMinigameScore(k, score, { client: 'web-quick' });
      if (r) setLast(r);
    } catch (e: unknown) {
      setError((e as Error)?.message || String(e));
    } finally {
      setSubmitting(null);
    }
  };

  return (
    <div className="space-y-3">
      <Header title="迷你游戏" subtitle="玩游戏 → 加亲密度 + 解锁成就" />
      <div className="flex flex-wrap items-center gap-2 text-xs">
        {(['play', 'history', 'leaderboard'] as const).map((v) => (
          <button
            key={v}
            onClick={() => setView(v)}
            className={`rounded-md px-3 py-1 ${
              view === v ? 'bg-emerald-600/80' : 'bg-white/5 text-white/70 hover:bg-white/10'
            }`}
          >
            {v === 'play' ? '快速游戏' : v === 'history' ? '历史' : '排行榜'}
          </button>
        ))}
      </div>
      {error && <ErrorBanner msg={error} />}
      {last && (
        <div className="rounded-md bg-emerald-500/15 px-3 py-2 text-sm text-emerald-200">
          ✅ 得分 {last.score_clamped} · 亲密度 +{last.intimacy_xp_awarded}
          {last.level_up && ' · 🎉 等级提升'}
          {last.newly_unlocked_achievements?.length > 0 && (
            <span>
              {' · 解锁成就 '}
              {last.newly_unlocked_achievements.map((a) => `${a.icon} ${a.label_zh}`).join('、')}
            </span>
          )}
        </div>
      )}
      {view === 'play' && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {(Object.keys(MINIGAME_META) as MinigameKey[]).map((k) => {
            const m = MINIGAME_META[k];
            return (
              <div
                key={k}
                className="flex flex-col items-start gap-2 rounded-xl border border-white/10 bg-gradient-to-br from-indigo-600/10 to-emerald-600/10 p-4"
              >
                <div className="text-4xl">{m.emoji}</div>
                <div className="text-base font-semibold">{m.label_zh}</div>
                <div className="text-xs text-white/60">{m.tagline_zh}</div>
                <div className="mt-1 text-[10px] text-white/40">
                  封顶 {m.scoreCap} 分 · XP×{m.xpRate}
                </div>
                <button
                  onClick={() => void playQuick(k)}
                  disabled={submitting === k}
                  className="mt-2 rounded-md bg-emerald-600/80 px-3 py-1.5 text-sm font-medium hover:bg-emerald-500 disabled:opacity-50"
                >
                  {submitting === k ? '提交中…' : '🎲 快速一局'}
                </button>
              </div>
            );
          })}
          <div className="text-[11px] text-white/50 sm:col-span-3">
            Web 版"快速一局"会随机一个分数（在 cap 范围内），后端会 clamp + 反作弊。完整可玩版在桌面端 / 移动端。
          </div>
        </div>
      )}
      {view === 'history' && (
        <ScoreList loading={loading} empty="还没有游戏记录" rows={historyRows(history)} />
      )}
      {view === 'leaderboard' && (
        <ScoreList loading={loading} empty="榜单为空" rows={leaderboardRows(leaderboard)} />
      )}
    </div>
  );
}

function historyRows(items: MinigameScoreItem[]) {
  return items.map((it) => ({
    id: it.id,
    left: MINIGAME_META[it.game_key]?.emoji ?? '🎮',
    title: MINIGAME_META[it.game_key]?.label_zh ?? it.game_key,
    sub: formatRelativeTime(it.created_at),
    right: it.score,
    sub2: `+${it.intimacy_xp_awarded} XP`,
  }));
}

function leaderboardRows(items: MinigameLeaderboardRow[]) {
  return items.map((it) => ({
    id: it.id,
    left: MINIGAME_META[it.game_key]?.emoji ?? '🎮',
    title: MINIGAME_META[it.game_key]?.label_zh ?? it.game_key,
    sub: formatRelativeTime(it.created_at),
    right: it.score,
    sub2: '',
  }));
}

function ScoreList({
  loading,
  empty,
  rows,
}: {
  loading: boolean;
  empty: string;
  rows: { id: string; left: string; title: string; sub: string; right: number; sub2: string }[];
}): React.ReactElement {
  if (loading && rows.length === 0)
    return <div className="py-12 text-center text-sm text-white/50">加载中…</div>;
  if (rows.length === 0)
    return <div className="py-12 text-center text-sm text-white/50">{empty}</div>;
  return (
    <div className="space-y-2">
      {rows.map((it) => (
        <div key={it.id} className="flex items-center gap-3 rounded-md bg-white/5 px-3 py-2">
          <div className="w-10 text-center text-2xl">{it.left}</div>
          <div className="flex-1">
            <div className="text-sm font-medium">{it.title}</div>
            <div className="text-[11px] text-white/50">{it.sub}</div>
          </div>
          <div className="text-right">
            <div className="text-lg font-bold text-emerald-300">{it.right}</div>
            {it.sub2 && <div className="text-[10px] text-white/50">{it.sub2}</div>}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Breeding ─────────────────────────────────────────────────────────

const STATUS_LABEL: Record<BreedingStatus, { zh: string; cls: string }> = {
  invited: { zh: '等待对方接受', cls: 'bg-amber-500/20 text-amber-300' },
  accepted: { zh: '已接受', cls: 'bg-blue-500/20 text-blue-300' },
  hatching: { zh: '孵化中', cls: 'bg-indigo-500/20 text-indigo-300' },
  hatched: { zh: '已孵化', cls: 'bg-emerald-500/20 text-emerald-300' },
  declined: { zh: '已拒绝', cls: 'bg-red-500/20 text-red-300' },
  cancelled: { zh: '已取消', cls: 'bg-white/10 text-white/50' },
};

function BreedingTab(): React.ReactElement {
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
      const r = await petPhase6Api.listMyBreedingEggs();
      if (r) setData(r);
    } catch (e: unknown) {
      setError((e as Error)?.message || String(e));
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
      await petPhase6Api.inviteBreeding({
        partnerUserId: partnerUserId.trim(),
        initiatorPetSkinId: initiatorPetSkinId.trim(),
        partnerPetSkinId: partnerPetSkinId.trim(),
      });
      setPartnerUserId('');
      setInitiatorPetSkinId('');
      setPartnerPetSkinId('');
      setShowForm(false);
      await refresh();
    } catch (e: unknown) {
      setError((e as Error)?.message || String(e));
    } finally {
      setSubmitting(false);
    }
  };
  const action = async (a: 'accept' | 'decline' | 'cancel' | 'hatch', id: string) => {
    setError(null);
    try {
      if (a === 'accept') await petPhase6Api.acceptBreeding(id);
      if (a === 'decline') await petPhase6Api.declineBreeding(id);
      if (a === 'cancel') await petPhase6Api.cancelBreeding(id);
      if (a === 'hatch') await petPhase6Api.hatchBreeding(id);
      await refresh();
    } catch (e: unknown) {
      setError((e as Error)?.message || String(e));
    }
  };

  return (
    <div className="space-y-3">
      <Header
        title="社交繁育"
        subtitle="邀请好友配对宠物 · 5 天孵化 · 双方各得一只血统宠物"
        rightExtra={
          <div className="flex gap-2">
            <button
              onClick={() => setShowForm((v) => !v)}
              className="rounded-md bg-purple-600/80 px-3 py-1 text-xs font-medium hover:bg-purple-500"
            >
              {showForm ? '✕ 取消' : '💌 发起邀请'}
            </button>
            <button onClick={refresh} disabled={loading} className="text-xs text-white/50 hover:text-white">
              {loading ? '…' : '↻ 刷新'}
            </button>
          </div>
        }
      />
      {showForm && (
        <div className="rounded-md border border-white/10 bg-black/30 p-3">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <input
              value={partnerUserId}
              onChange={(e) => setPartnerUserId(e.target.value)}
              placeholder="对方用户 ID"
              className="rounded-md bg-white/10 px-3 py-2 text-sm placeholder-white/40"
            />
            <input
              value={initiatorPetSkinId}
              onChange={(e) => setInitiatorPetSkinId(e.target.value)}
              placeholder="我方皮肤 ID"
              className="rounded-md bg-white/10 px-3 py-2 text-sm placeholder-white/40"
            />
            <input
              value={partnerPetSkinId}
              onChange={(e) => setPartnerPetSkinId(e.target.value)}
              placeholder="对方皮肤 ID"
              className="rounded-md bg-white/10 px-3 py-2 text-sm placeholder-white/40"
            />
          </div>
          <div className="mt-2 flex justify-end">
            <button
              onClick={sendInvite}
              disabled={submitting}
              className="rounded-md bg-emerald-600/80 px-4 py-1.5 text-sm font-medium hover:bg-emerald-500 disabled:opacity-50"
            >
              {submitting ? '发送中…' : '💌 发送邀请'}
            </button>
          </div>
        </div>
      )}
      {error && <ErrorBanner msg={error} />}
      <BreedSection
        title="📨 我收到的邀请"
        empty="没有收到的邀请"
        eggs={data.received}
        now={now}
        isReceived
        onAction={action}
      />
      <BreedSection
        title="📤 我发起的"
        empty="还没有发起繁育邀请"
        eggs={data.initiated}
        now={now}
        isReceived={false}
        onAction={action}
      />
    </div>
  );
}

function BreedSection({
  title,
  empty,
  eggs,
  now,
  isReceived,
  onAction,
}: {
  title: string;
  empty: string;
  eggs: BreedingEgg[];
  now: number;
  isReceived: boolean;
  onAction: (a: 'accept' | 'decline' | 'cancel' | 'hatch', id: string) => void;
}): React.ReactElement {
  return (
    <div>
      <h3 className="mb-2 text-sm font-semibold text-white/80">{title}</h3>
      {eggs.length === 0 ? (
        <div className="rounded-md bg-white/5 px-3 py-4 text-center text-xs text-white/50">{empty}</div>
      ) : (
        <div className="space-y-2">
          {eggs.map((e) => {
            const status = STATUS_LABEL[e.status];
            const canHatch = e.status === 'hatching' && e.hatch_at != null && now >= e.hatch_at;
            const childForMe = isReceived ? e.child_skin_id_partner : e.child_skin_id_initiator;
            return (
              <article key={e.id} className="rounded-xl border border-white/10 bg-white/5 p-3">
                <div className="flex items-center gap-3">
                  <div className="text-3xl">🥚</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${status.cls}`}>
                        {status.zh}
                      </span>
                      <span className="text-[11px] text-white/40">{formatRelativeTime(e.created_at)}</span>
                    </div>
                    <div className="mt-1 truncate text-xs text-white/60">
                      我：
                      <span className="text-emerald-300">
                        {(isReceived ? e.partner_pet_skin_id : e.initiator_pet_skin_id).slice(0, 10)}…
                      </span>
                      <span className="mx-2 text-white/20">×</span>
                      对方：
                      <span className="text-purple-300">
                        {(isReceived ? e.initiator_pet_skin_id : e.partner_pet_skin_id).slice(0, 10)}…
                      </span>
                    </div>
                    {e.status === 'hatching' && e.hatch_at && (
                      <div className="mt-1 text-xs text-amber-300">⏳ {formatCountdown(e.hatch_at)}</div>
                    )}
                    {e.status === 'hatched' && childForMe && (
                      <div className="mt-1 text-xs text-emerald-300">
                        🎉 你的小宝贝：<code className="text-emerald-200">{childForMe.slice(0, 16)}…</code>
                      </div>
                    )}
                  </div>
                  <div className="flex flex-col gap-1">
                    {isReceived && e.status === 'invited' && (
                      <>
                        <button
                          onClick={() => onAction('accept', e.id)}
                          className="rounded-md bg-emerald-600/80 px-3 py-1 text-xs hover:bg-emerald-500"
                        >
                          接受
                        </button>
                        <button
                          onClick={() => onAction('decline', e.id)}
                          className="rounded-md bg-red-600/80 px-3 py-1 text-xs hover:bg-red-500"
                        >
                          拒绝
                        </button>
                      </>
                    )}
                    {!isReceived && e.status === 'invited' && (
                      <button
                        onClick={() => onAction('cancel', e.id)}
                        className="rounded-md bg-white/10 px-3 py-1 text-xs hover:bg-white/20"
                      >
                        取消
                      </button>
                    )}
                    {canHatch && (
                      <button
                        onClick={() => onAction('hatch', e.id)}
                        className="rounded-md bg-amber-500/80 px-3 py-1 text-xs font-medium hover:bg-amber-400"
                      >
                        🐣 孵化
                      </button>
                    )}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Shared bits ──────────────────────────────────────────────────────

function Header({
  title,
  subtitle,
  rightExtra,
}: {
  title: string;
  subtitle: string;
  rightExtra?: React.ReactNode;
}): React.ReactElement {
  return (
    <div className="flex items-center justify-between border-b border-white/10 pb-2">
      <div>
        <h2 className="text-base font-semibold">{title}</h2>
        <p className="text-xs text-white/60">{subtitle}</p>
      </div>
      {rightExtra}
    </div>
  );
}

function ErrorBanner({ msg }: { msg: string }): React.ReactElement {
  return <div className="rounded-md bg-red-500/15 px-3 py-2 text-sm text-red-300">{msg}</div>;
}
