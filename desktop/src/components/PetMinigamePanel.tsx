/**
 * PetMinigamePanel — Phase 6 S5 迷你游戏中心
 *
 * 3 款游戏：
 *   1. scratch     — 30 秒内点击宠物，每点 +1 分（cap 200）
 *   2. feed        — 投喂出现的食物图标，命中 +5 分（cap 150）
 *   3. code_buddy  — 答对代码题，每题 +25 分（cap 300）
 *
 * 全部走 POST /v1/pet/minigames/submit，奖励由后端裁定（防作弊）。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  MINIGAME_META,
  type MinigameKey,
  type MinigameLeaderboardRow,
  type MinigameScoreItem,
  type MinigameSubmitResult,
  formatRelativeTime,
  listMinigameHistory,
  listMinigameLeaderboard,
  submitMinigameScore,
} from "../services/petPhase6Sdk";

interface Props {
  onClose: () => void;
}

type View = "menu" | "play" | "history" | "leaderboard";

export default function PetMinigamePanel({ onClose }: Props) {
  const [view, setView] = useState<View>("menu");
  const [currentGame, setCurrentGame] = useState<MinigameKey | null>(null);
  const [history, setHistory] = useState<MinigameScoreItem[]>([]);
  const [leaderboard, setLeaderboard] = useState<MinigameLeaderboardRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<MinigameSubmitResult | null>(null);

  const refreshHistory = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await listMinigameHistory(30);
      setHistory(r.items);
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  const refreshLeaderboard = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await listMinigameLeaderboard();
      setLeaderboard(r.items);
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (view === "history") void refreshHistory();
    if (view === "leaderboard") void refreshLeaderboard();
  }, [view, refreshHistory, refreshLeaderboard]);

  const submit = useCallback(
    async (gameKey: MinigameKey, rawScore: number) => {
      setLoading(true);
      setError(null);
      setLastResult(null);
      try {
        const r = await submitMinigameScore(gameKey, rawScore);
        setLastResult(r);
      } catch (e: any) {
        setError(e?.message || String(e));
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  return (
    <div
      data-testid="pet-minigame"
      className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/70"
      onClick={onClose}
    >
      <div
        className="relative flex h-[85vh] w-[min(960px,94vw)] flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#0b0b13] text-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between border-b border-white/10 px-5 py-3">
          <div>
            <h2 className="text-lg font-semibold">🎮 迷你游戏 · Minigames</h2>
            <p className="text-xs text-white/60">
              玩游戏 → 加亲密度 + 解锁成就（每天每款限 20 次）
            </p>
          </div>
          <div className="flex items-center gap-2 text-xs">
            {(["menu", "history", "leaderboard"] as const).map((v) => (
              <button
                key={v}
                onClick={() => {
                  setView(v);
                  setCurrentGame(null);
                  setLastResult(null);
                }}
                className={`rounded-md px-3 py-1 ${
                  view === v
                    ? "bg-emerald-600/80"
                    : "bg-white/5 text-white/70 hover:bg-white/10"
                }`}
              >
                {v === "menu" ? "选择游戏" : v === "history" ? "历史" : "排行榜"}
              </button>
            ))}
            <button
              onClick={onClose}
              className="rounded-md px-3 py-1 text-white/70 hover:bg-white/10"
            >
              关闭
            </button>
          </div>
        </header>

        {error && (
          <div className="mx-5 mt-3 rounded-md bg-red-500/15 px-3 py-2 text-sm text-red-300">
            {error}
          </div>
        )}

        {lastResult && (
          <div
            data-testid="minigame-result"
            className="mx-5 mt-3 rounded-md bg-emerald-500/15 px-3 py-2 text-sm text-emerald-200"
          >
            ✅ 得分 {lastResult.score_clamped} · 亲密度 +{lastResult.intimacy_xp_awarded}
            {lastResult.level_up && " · 🎉 等级提升"}
            {lastResult.newly_unlocked_achievements?.length > 0 && (
              <span>
                {" "}
                · 解锁成就{" "}
                {lastResult.newly_unlocked_achievements
                  .map((a) => `${a.icon} ${a.label_zh}`)
                  .join("、")}
              </span>
            )}
          </div>
        )}

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {view === "menu" && !currentGame && (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              {(Object.keys(MINIGAME_META) as MinigameKey[]).map((k) => {
                const m = MINIGAME_META[k];
                return (
                  <button
                    key={k}
                    onClick={() => setCurrentGame(k)}
                    data-testid={`minigame-pick-${k}`}
                    className="flex flex-col items-start gap-2 rounded-xl border border-white/10 bg-gradient-to-br from-indigo-600/10 to-emerald-600/10 p-4 text-left transition hover:from-indigo-500/20 hover:to-emerald-500/20"
                  >
                    <div className="text-4xl">{m.emoji}</div>
                    <div className="text-base font-semibold">{m.label_zh}</div>
                    <div className="text-xs text-white/60">{m.tagline_zh}</div>
                    <div className="mt-1 text-[10px] text-white/40">
                      封顶 {m.scoreCap} 分 · XP×{m.xpRate}
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          {view === "menu" && currentGame === "scratch" && (
            <ScratchGame
              onFinish={(s) => void submit("scratch", s)}
              onBack={() => setCurrentGame(null)}
            />
          )}
          {view === "menu" && currentGame === "feed" && (
            <FeedGame
              onFinish={(s) => void submit("feed", s)}
              onBack={() => setCurrentGame(null)}
            />
          )}
          {view === "menu" && currentGame === "code_buddy" && (
            <CodeBuddyGame
              onFinish={(s) => void submit("code_buddy", s)}
              onBack={() => setCurrentGame(null)}
            />
          )}

          {view === "history" && (
            <HistoryView items={history} loading={loading} />
          )}
          {view === "leaderboard" && (
            <LeaderboardView items={leaderboard} loading={loading} />
          )}
        </div>
      </div>
    </div>
  );
}

// ── Scratch game (clicker) ───────────────────────────────────────────

function ScratchGame({
  onFinish,
  onBack,
}: {
  onFinish: (score: number) => void;
  onBack: () => void;
}) {
  const [score, setScore] = useState(0);
  const [running, setRunning] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(30);
  const finishedRef = useRef(false);

  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => {
      setSecondsLeft((s) => {
        if (s <= 1) {
          clearInterval(t);
          if (!finishedRef.current) {
            finishedRef.current = true;
            setRunning(false);
          }
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(t);
  }, [running]);

  const start = () => {
    setScore(0);
    setSecondsLeft(30);
    finishedRef.current = false;
    setRunning(true);
  };

  return (
    <div className="flex flex-col items-center gap-4 py-6">
      <div className="text-2xl">🐾 挠挠它！30 秒内疯狂点击</div>
      <div className="text-sm text-white/60">
        {running ? `剩余 ${secondsLeft}s` : finishedRef.current ? "时间到！" : "准备好了吗？"}
      </div>
      <div className="text-5xl font-bold tabular-nums">{score}</div>
      <button
        disabled={!running}
        onClick={() => setScore((s) => s + 1)}
        className="flex h-44 w-44 items-center justify-center rounded-full bg-gradient-to-br from-pink-500 to-orange-400 text-7xl shadow-2xl transition active:scale-95 disabled:opacity-40"
        data-testid="scratch-tap-btn"
      >
        🐾
      </button>
      <div className="flex gap-3">
        {!running && !finishedRef.current && (
          <button
            onClick={start}
            className="rounded-md bg-emerald-600 px-5 py-2 font-medium hover:bg-emerald-500"
            data-testid="scratch-start"
          >
            开始
          </button>
        )}
        {finishedRef.current && (
          <button
            onClick={() => onFinish(score)}
            className="rounded-md bg-emerald-600 px-5 py-2 font-medium hover:bg-emerald-500"
            data-testid="scratch-submit"
          >
            提交得分 {score}
          </button>
        )}
        <button
          onClick={onBack}
          className="rounded-md bg-white/10 px-5 py-2 font-medium hover:bg-white/20"
        >
          返回
        </button>
      </div>
    </div>
  );
}

// ── Feed game (whack-a-mole style) ────────────────────────────────────

const FOOD_EMOJIS = ["🍖", "🍗", "🥩", "🐟", "🍞", "🥕"];

function FeedGame({
  onFinish,
  onBack,
}: {
  onFinish: (score: number) => void;
  onBack: () => void;
}) {
  const [score, setScore] = useState(0);
  const [active, setActive] = useState<number | null>(null);
  const [emoji, setEmoji] = useState<string>(FOOD_EMOJIS[0]);
  const [running, setRunning] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(30);
  const finishedRef = useRef(false);

  useEffect(() => {
    if (!running) return;
    const tick = setInterval(() => {
      setActive(Math.floor(Math.random() * 9));
      setEmoji(FOOD_EMOJIS[Math.floor(Math.random() * FOOD_EMOJIS.length)]);
    }, 700);
    const timer = setInterval(() => {
      setSecondsLeft((s) => {
        if (s <= 1) {
          clearInterval(tick);
          clearInterval(timer);
          finishedRef.current = true;
          setRunning(false);
          setActive(null);
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => {
      clearInterval(tick);
      clearInterval(timer);
    };
  }, [running]);

  const start = () => {
    setScore(0);
    setSecondsLeft(30);
    finishedRef.current = false;
    setRunning(true);
  };

  return (
    <div className="flex flex-col items-center gap-4 py-4">
      <div className="text-2xl">🍖 喂喂它！点中出现的食物 +5 分</div>
      <div className="text-sm text-white/60">
        {running ? `剩余 ${secondsLeft}s · ${score} 分` : "准备好了吗？"}
      </div>
      <div className="grid grid-cols-3 gap-2">
        {Array.from({ length: 9 }).map((_, i) => (
          <button
            key={i}
            onClick={() => {
              if (running && active === i) {
                setScore((s) => s + 5);
                setActive(null);
              }
            }}
            className={`flex h-24 w-24 items-center justify-center rounded-xl text-4xl transition ${
              active === i
                ? "bg-amber-400/30 ring-2 ring-amber-300"
                : "bg-white/5 hover:bg-white/10"
            }`}
          >
            {active === i ? emoji : ""}
          </button>
        ))}
      </div>
      <div className="flex gap-3">
        {!running && !finishedRef.current && (
          <button
            onClick={start}
            className="rounded-md bg-emerald-600 px-5 py-2 font-medium hover:bg-emerald-500"
          >
            开始
          </button>
        )}
        {finishedRef.current && (
          <button
            onClick={() => onFinish(score)}
            className="rounded-md bg-emerald-600 px-5 py-2 font-medium hover:bg-emerald-500"
          >
            提交得分 {score}
          </button>
        )}
        <button
          onClick={onBack}
          className="rounded-md bg-white/10 px-5 py-2 font-medium hover:bg-white/20"
        >
          返回
        </button>
      </div>
    </div>
  );
}

// ── CodeBuddy game (quiz) ────────────────────────────────────────────

const CODE_QUIZ: { q: string; a: string; choices: string[] }[] = [
  { q: "let / const 哪个不能重新赋值？", a: "const", choices: ["let", "const", "var", "都可以"] },
  { q: "TypeScript `Pick<T, K>` 作用？", a: "选取 T 的部分键", choices: ["排除 K", "选取 T 的部分键", "合并", "继承"] },
  { q: "React useEffect 第二个参数空数组等价于？", a: "componentDidMount", choices: ["每次渲染", "componentDidMount", "componentWillUnmount", "useState"] },
  { q: "Promise.all 失败行为？", a: "整体 reject", choices: ["全部 resolve", "整体 reject", "忽略错误", "重试"] },
  { q: "Node `process.nextTick` 与 `setImmediate` 谁先执行？", a: "nextTick", choices: ["setImmediate", "nextTick", "同时", "随机"] },
  { q: "TCP 三次握手第二步发送？", a: "SYN+ACK", choices: ["SYN", "ACK", "SYN+ACK", "FIN"] },
  { q: "Git 撤销最后一次未推送 commit 不丢改动？", a: "git reset --soft HEAD~1", choices: ["git reset --hard HEAD~1", "git reset --soft HEAD~1", "git revert HEAD", "git checkout -- ."] },
  { q: "PostgreSQL 中 JSONB 与 JSON 区别？", a: "JSONB 二进制 + 索引", choices: ["完全相同", "JSON 更快", "JSONB 二进制 + 索引", "JSONB 不可索引"] },
  { q: "Tauri 2.0 调用 Rust 命令使用？", a: "invoke()", choices: ["fetch()", "invoke()", "exec()", "spawn()"] },
  { q: "OWASP Top 10 中 #1 通常是？", a: "Broken Access Control", choices: ["XSS", "SQL Injection", "Broken Access Control", "CSRF"] },
];

function CodeBuddyGame({
  onFinish,
  onBack,
}: {
  onFinish: (score: number) => void;
  onBack: () => void;
}) {
  const order = useMemo(() => [...CODE_QUIZ].sort(() => Math.random() - 0.5).slice(0, 6), []);
  const [idx, setIdx] = useState(0);
  const [score, setScore] = useState(0);
  const [done, setDone] = useState(false);
  const cur = order[idx];

  const pick = (choice: string) => {
    if (cur && choice === cur.a) setScore((s) => s + 50);
    if (idx + 1 < order.length) setIdx(idx + 1);
    else setDone(true);
  };

  return (
    <div className="flex flex-col items-center gap-4 py-4">
      <div className="text-2xl">💻 代码伙伴 · 答对 +50 分</div>
      <div className="text-sm text-white/60">
        {done ? `完成！得分 ${score}` : `第 ${idx + 1} / ${order.length} 题`}
      </div>
      {!done && cur && (
        <div className="w-full max-w-lg">
          <div className="rounded-xl border border-white/10 bg-white/5 p-4 text-center text-base font-medium">
            {cur.q}
          </div>
          <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
            {cur.choices.map((c) => (
              <button
                key={c}
                onClick={() => pick(c)}
                className="rounded-md bg-indigo-600/40 px-4 py-2 text-sm hover:bg-indigo-500/60"
              >
                {c}
              </button>
            ))}
          </div>
        </div>
      )}
      <div className="flex gap-3">
        {done && (
          <button
            onClick={() => onFinish(score)}
            className="rounded-md bg-emerald-600 px-5 py-2 font-medium hover:bg-emerald-500"
          >
            提交得分 {score}
          </button>
        )}
        <button
          onClick={onBack}
          className="rounded-md bg-white/10 px-5 py-2 font-medium hover:bg-white/20"
        >
          返回
        </button>
      </div>
    </div>
  );
}

// ── History / Leaderboard ─────────────────────────────────────────────

function HistoryView({ items, loading }: { items: MinigameScoreItem[]; loading: boolean }) {
  if (loading && items.length === 0)
    return <div className="py-12 text-center text-sm text-white/50">加载中…</div>;
  if (items.length === 0)
    return <div className="py-12 text-center text-sm text-white/50">还没有游戏记录</div>;
  return (
    <div className="space-y-2">
      {items.map((it) => {
        const m = MINIGAME_META[it.game_key];
        return (
          <div
            key={it.id}
            className="flex items-center gap-3 rounded-md bg-white/5 px-3 py-2"
          >
            <div className="text-2xl">{m?.emoji ?? "🎮"}</div>
            <div className="flex-1">
              <div className="text-sm font-medium">{m?.label_zh ?? it.game_key}</div>
              <div className="text-[11px] text-white/50">
                {formatRelativeTime(it.created_at)}
              </div>
            </div>
            <div className="text-right">
              <div className="text-lg font-bold text-emerald-300">{it.score}</div>
              <div className="text-[10px] text-white/50">
                +{it.intimacy_xp_awarded} XP
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function LeaderboardView({
  items,
  loading,
}: {
  items: MinigameLeaderboardRow[];
  loading: boolean;
}) {
  if (loading && items.length === 0)
    return <div className="py-12 text-center text-sm text-white/50">加载中…</div>;
  if (items.length === 0)
    return <div className="py-12 text-center text-sm text-white/50">榜单为空</div>;
  return (
    <div className="space-y-2">
      {items.map((it, i) => {
        const m = MINIGAME_META[it.game_key];
        return (
          <div
            key={it.id}
            className="flex items-center gap-3 rounded-md bg-white/5 px-3 py-2"
          >
            <div className="w-8 text-center text-base font-bold text-amber-300">
              {i + 1}
            </div>
            <div className="text-2xl">{m?.emoji ?? "🎮"}</div>
            <div className="flex-1">
              <div className="text-sm font-medium">{m?.label_zh ?? it.game_key}</div>
              <div className="text-[11px] text-white/50">
                {formatRelativeTime(it.created_at)}
              </div>
            </div>
            <div className="text-lg font-bold text-emerald-300">{it.score}</div>
          </div>
        );
      })}
    </div>
  );
}
