/**
 * PetAchievementWall — Phase 6 S4 成就墙
 *
 * 列出 25 个默认成就（含未解锁占位），监听
 *   agentrix:pet-achievement-unlocked  → 触发刷新 + 顶部弹窗
 */
import { useCallback, useEffect, useState } from "react";
import {
  type PetAchievementItem,
  formatRelativeTime,
  listAchievements,
} from "../services/petPhase6Sdk";

interface Props {
  onClose: () => void;
}

interface Toast {
  key: string;
  label_zh: string;
  icon: string;
}

export default function PetAchievementWall({ onClose }: Props) {
  const [items, setItems] = useState<PetAchievementItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "unlocked" | "locked">("all");
  const [toast, setToast] = useState<Toast | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await listAchievements();
      setItems(r.items);
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const onUnlocked = (e: Event) => {
      const d = (e as CustomEvent).detail as
        | { key?: string; label_zh?: string; icon?: string }
        | undefined;
      if (d?.key) {
        setToast({ key: d.key, label_zh: d.label_zh ?? d.key, icon: d.icon ?? "🏆" });
        setTimeout(() => setToast(null), 4000);
      }
      void refresh();
    };
    window.addEventListener("agentrix:pet-achievement-unlocked", onUnlocked);
    return () =>
      window.removeEventListener("agentrix:pet-achievement-unlocked", onUnlocked);
  }, [refresh]);

  const filtered = items.filter((it) => {
    if (filter === "unlocked") return it.unlocked;
    if (filter === "locked") return !it.unlocked;
    return true;
  });
  const unlockedCount = items.filter((it) => it.unlocked).length;

  return (
    <div
      data-testid="pet-achievements"
      className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/70"
      onClick={onClose}
    >
      <div
        className="relative flex h-[85vh] w-[min(960px,94vw)] flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#0b0b13] text-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between border-b border-white/10 px-5 py-3">
          <div>
            <h2 className="text-lg font-semibold">🏆 宠物成就 · Achievements</h2>
            <p className="text-xs text-white/60">
              已解锁 {unlockedCount} / {items.length} —— 与宠物的每个里程碑都会留在这里
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-md px-3 py-1 text-sm text-white/70 hover:bg-white/10"
          >
            关闭
          </button>
        </header>

        <div className="flex items-center gap-2 border-b border-white/10 px-5 py-2 text-xs">
          {(["all", "unlocked", "locked"] as const).map((k) => (
            <button
              key={k}
              onClick={() => setFilter(k)}
              className={`rounded-md px-3 py-1 ${
                filter === k
                  ? "bg-emerald-600/80 text-white"
                  : "bg-white/5 text-white/70 hover:bg-white/10"
              }`}
            >
              {k === "all" ? "全部" : k === "unlocked" ? "已解锁" : "未解锁"}
            </button>
          ))}
          <div className="ml-auto">
            <button
              onClick={refresh}
              disabled={loading}
              className="text-white/50 hover:text-white"
            >
              {loading ? "刷新中…" : "↻ 刷新"}
            </button>
          </div>
        </div>

        {error && (
          <div className="mx-5 mt-3 rounded-md bg-red-500/15 px-3 py-2 text-sm text-red-300">
            {error}
          </div>
        )}

        <section className="flex-1 overflow-y-auto px-5 py-4">
          {filtered.length === 0 && !loading ? (
            <div className="py-12 text-center text-sm text-white/50">还没有成就</div>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {filtered.map((it) => (
                <article
                  key={it.key}
                  data-testid={`achievement-${it.key}`}
                  className={`flex flex-col gap-2 rounded-xl border p-3 transition ${
                    it.unlocked
                      ? "border-amber-400/40 bg-amber-500/10"
                      : "border-white/10 bg-white/5 opacity-60"
                  }`}
                >
                  <div className="flex items-start gap-2">
                    <span className="text-3xl leading-none">{it.icon || "🏅"}</span>
                    <div className="flex-1 min-w-0">
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
                      : "未解锁"}
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>

        {toast && (
          <div className="pointer-events-none absolute left-1/2 top-4 z-10 -translate-x-1/2">
            <div className="flex items-center gap-2 rounded-full bg-amber-500/90 px-4 py-2 text-sm font-semibold text-black shadow-lg">
              <span className="text-xl">{toast.icon}</span>
              <span>已解锁：{toast.label_zh}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
