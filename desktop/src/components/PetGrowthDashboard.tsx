/**
 * PetGrowthDashboard — Phase 6 S3 主仪表板
 *
 * 整合：亲密度等级 / 经验进度条 / 能量条 (S3) / 最近成就 / 当前情绪
 * 监听：agentrix:pet-state、agentrix:pet-energy、agentrix:pet-achievement-unlocked
 */
import { useCallback, useEffect, useState } from "react";
import { INTIMACY_LEVELS, intimacyLevelFor } from "../services/petSdk";
import {
  type LivingPetState,
  type PetAchievementItem,
  formatRelativeTime,
  getLivingPetState,
  listAchievements,
} from "../services/petPhase6Sdk";

interface Props {
  onClose: () => void;
}

interface EnergyState {
  energy: number;
  energy_max: number;
  updated_at: number;
}

export default function PetGrowthDashboard({ onClose }: Props) {
  const [state, setState] = useState<LivingPetState | null>(null);
  const [energy, setEnergy] = useState<EnergyState | null>(null);
  const [achievements, setAchievements] = useState<PetAchievementItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [s, a] = await Promise.all([getLivingPetState(), listAchievements()]);
      setState(s);
      setAchievements(a.items);
      if (s.energy != null && s.energy_max != null) {
        setEnergy({
          energy: s.energy,
          energy_max: s.energy_max,
          updated_at: Date.now(),
        });
      }
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const onState = (e: Event) => {
      const d = (e as CustomEvent).detail as Partial<LivingPetState> | undefined;
      if (d) setState((cur) => (cur ? { ...cur, ...d } : (d as LivingPetState)));
    };
    const onEnergy = (e: Event) => {
      const d = (e as CustomEvent).detail as
        | { energy?: number; energy_max?: number }
        | undefined;
      if (d?.energy != null && d?.energy_max != null) {
        setEnergy({
          energy: d.energy,
          energy_max: d.energy_max,
          updated_at: Date.now(),
        });
      }
    };
    const onAch = () => void refresh();
    window.addEventListener("agentrix:pet-state", onState);
    window.addEventListener("agentrix:pet-energy", onEnergy);
    window.addEventListener("agentrix:pet-achievement-unlocked", onAch);
    return () => {
      window.removeEventListener("agentrix:pet-state", onState);
      window.removeEventListener("agentrix:pet-energy", onEnergy);
      window.removeEventListener("agentrix:pet-achievement-unlocked", onAch);
    };
  }, [refresh]);

  const xp = state?.intimacy_xp ?? 0;
  const lv = intimacyLevelFor(xp);
  const nextLv = INTIMACY_LEVELS.find((l) => l.level === lv.level + 1) ?? null;
  const xpInLevel = xp - lv.xpRequired;
  const xpToNext = nextLv ? nextLv.xpRequired - lv.xpRequired : 1;
  const xpPct = nextLv ? Math.min(100, Math.round((xpInLevel / xpToNext) * 100)) : 100;

  const energyPct =
    energy && energy.energy_max > 0
      ? Math.max(0, Math.min(100, Math.round((energy.energy / energy.energy_max) * 100)))
      : 100;

  const recentUnlocked = achievements
    .filter((a) => a.unlocked && a.unlocked_at)
    .sort((a, b) => (b.unlocked_at ?? 0) - (a.unlocked_at ?? 0))
    .slice(0, 6);
  const unlockedCount = achievements.filter((a) => a.unlocked).length;

  return (
    <div
      data-testid="pet-growth-dashboard"
      className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/70"
      onClick={onClose}
    >
      <div
        className="relative flex h-[85vh] w-[min(960px,94vw)] flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#0b0b13] text-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between border-b border-white/10 px-5 py-3">
          <div>
            <h2 className="text-lg font-semibold">📊 成长面板 · Growth</h2>
            <p className="text-xs text-white/60">
              亲密度 / 能量 / 成就一览 —— 跨设备实时同步
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={refresh}
              disabled={loading}
              className="text-xs text-white/50 hover:text-white"
            >
              {loading ? "刷新中…" : "↻ 刷新"}
            </button>
            <button
              onClick={onClose}
              className="rounded-md px-3 py-1 text-sm text-white/70 hover:bg-white/10"
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

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {/* Top: emotion + soul */}
          <section className="mb-4 flex flex-wrap gap-3 rounded-xl border border-white/10 bg-white/5 p-4">
            <div className="flex h-20 w-20 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-600/30 to-emerald-600/30 text-4xl ring-1 ring-white/10">
              🐾
            </div>
            <div className="flex-1">
              <div className="text-xs text-white/50">当前情绪</div>
              <div className="mt-1 text-xl font-semibold capitalize">
                {state?.emotion ?? "calm"}{" "}
                <span className="ml-1 text-xs text-white/50">
                  强度 {state?.emotion_intensity ?? 0}
                </span>
              </div>
              <div className="mt-2 text-xs text-white/60">
                灵魂模板：
                <span className="text-emerald-300">{state?.soul_template_id ?? "—"}</span>
                <span className="mx-2 text-white/20">·</span>
                主代理：
                <span className="text-blue-300">{state?.primary_agent_id ?? "—"}</span>
              </div>
            </div>
          </section>

          {/* Intimacy */}
          <section className="mb-4 rounded-xl border border-white/10 bg-white/5 p-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs uppercase tracking-wide text-white/50">亲密度</div>
                <div className="mt-1 text-2xl font-bold">
                  Lv {lv.level}
                  <span className="ml-2 text-sm font-normal text-white/60">
                    {xp} XP {nextLv ? `/ 下一级 ${nextLv.xpRequired}` : "（已满级）"}
                  </span>
                </div>
              </div>
              <div className="text-right text-xs text-white/60">
                <div>解锁项</div>
                <div className="text-emerald-300">{lv.unlocks.join(" · ")}</div>
              </div>
            </div>
            <div className="mt-3 h-3 w-full overflow-hidden rounded-full bg-black/30">
              <div
                className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-cyan-400 transition-all"
                style={{ width: `${xpPct}%` }}
              />
            </div>
            <div className="mt-1 text-[11px] text-white/40">{xpPct}% 进度</div>
          </section>

          {/* Energy */}
          <section className="mb-4 rounded-xl border border-white/10 bg-white/5 p-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs uppercase tracking-wide text-white/50">能量</div>
                <div className="mt-1 text-2xl font-bold">
                  {energy ? `${energy.energy} / ${energy.energy_max}` : "— / —"}
                </div>
              </div>
              <div className="text-right text-xs text-white/60">
                {energy
                  ? `${formatRelativeTime(energy.updated_at)} 更新`
                  : "尚未同步能量数据"}
              </div>
            </div>
            <div className="mt-3 h-3 w-full overflow-hidden rounded-full bg-black/30">
              <div
                className={`h-full rounded-full transition-all ${
                  energyPct < 20
                    ? "bg-red-500"
                    : energyPct < 50
                    ? "bg-amber-400"
                    : "bg-gradient-to-r from-amber-400 to-red-400"
                }`}
                style={{ width: `${energyPct}%` }}
              />
            </div>
            <div className="mt-1 text-[11px] text-white/40">
              低于 20% 时宠物会进入疲倦状态 · 玩迷你游戏 / 完成任务可恢复
            </div>
          </section>

          {/* Achievements snapshot */}
          <section className="rounded-xl border border-white/10 bg-white/5 p-4">
            <div className="mb-3 flex items-center justify-between">
              <div>
                <div className="text-xs uppercase tracking-wide text-white/50">最近解锁</div>
                <div className="mt-1 text-lg font-semibold">
                  🏆 {unlockedCount} / {achievements.length} 个成就
                </div>
              </div>
            </div>
            {recentUnlocked.length === 0 ? (
              <div className="py-4 text-center text-xs text-white/50">
                还没有解锁成就 — 多陪陪它吧
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {recentUnlocked.map((a) => (
                  <div
                    key={a.key}
                    className="flex items-center gap-2 rounded-lg border border-amber-400/30 bg-amber-500/10 p-2"
                  >
                    <span className="text-2xl">{a.icon || "🏅"}</span>
                    <div className="min-w-0">
                      <div className="truncate text-xs font-semibold">{a.label_zh}</div>
                      <div className="text-[10px] text-white/40">
                        {a.unlocked_at ? formatRelativeTime(a.unlocked_at) : ""}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
