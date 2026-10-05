/**
 * SoulPicker — desktop UI to browse 6 clans × N souls and switch the active 灵魂.
 *
 * Phase 1 W2 deliverable:
 *   - 族群标签栏（A-F；锁定族群显示 🔒）
 *   - 卡片网格（每只灵魂：emoji/avatar 占位 + 名字 + tagline + tier）
 *   - 切换：调用 switchSoul(templateId)，loading + 错误 toast
 *   - 监听 agentrix:pet-soul-changed 高亮当前灵魂
 *
 * 视觉占位：Phase 1 用 emoji + 渐变背景，避免阻塞交付；
 * Phase 2 接入 PetCreator 生成的 .glb / Rive，由 SkinPicker 切换。
 *
 * PRD: docs/PRD_PET_PHASED_DEV_PLAN.zh-CN.md DT-2.x
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  type PetClan,
  type PetSoulSummary,
  listSouls,
  switchSoul,
} from "../services/petSoulSdk";
import { getLastPetState } from "../services/petSdk";

const CLAN_TABS: Array<{ id: PetClan; label: string; emoji: string; locked?: boolean }> = [
  { id: "A_office", label: "效率派", emoji: "🦾" },
  { id: "B_life",   label: "生活家", emoji: "🍳" },
  { id: "C_learn",  label: "学习圈", emoji: "📚" },
  { id: "D_play",   label: "娱乐部", emoji: "🎮" },
  { id: "E_web3",   label: "Web3 帮", emoji: "💎" },
  { id: "F_family", label: "家有萌宠", emoji: "🏡" },
];

const SOUL_EMOJI: Record<string, string> = {
  claw: "🦾",
  tinker: "🛠️",
  sentry: "🛡️",
  hawk: "📊",
  owl: "🦉",
  fox: "🦊",
  dragon: "🐉",
};

interface Props {
  onClose?: () => void;
}

export default function SoulPicker({ onClose }: Props) {
  const [clan, setClan] = useState<PetClan>("A_office");
  const [souls, setSouls] = useState<PetSoulSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [switching, setSwitching] = useState<string | null>(null);
  const [activeSoul, setActiveSoul] = useState<string | null>(
    () => getLastPetState()?.soul_template_id ?? null,
  );

  const refresh = useCallback(async (target: PetClan) => {
    setLoading(true);
    setError(null);
    try {
      const list = await listSouls({ clan: target });
      setSouls(list);
    } catch (err: any) {
      setError(err?.message || String(err));
      setSouls([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh(clan);
  }, [clan, refresh]);

  // 同步当前灵魂高亮
  useEffect(() => {
    const onSoul = (e: Event) => {
      const detail = (e as CustomEvent).detail as { soul_template_id?: string } | undefined;
      if (detail?.soul_template_id) setActiveSoul(detail.soul_template_id);
    };
    const onState = (e: Event) => {
      const detail = (e as CustomEvent).detail as { soul_template_id?: string } | undefined;
      if (detail?.soul_template_id) setActiveSoul(detail.soul_template_id);
    };
    window.addEventListener("agentrix:pet-soul-changed", onSoul);
    window.addEventListener("agentrix:pet-state", onState);
    return () => {
      window.removeEventListener("agentrix:pet-soul-changed", onSoul);
      window.removeEventListener("agentrix:pet-state", onState);
    };
  }, []);

  const handleSwitch = useCallback(
    async (templateId: string) => {
      if (switching || activeSoul === templateId) return;
      setSwitching(templateId);
      setError(null);
      try {
        await switchSoul(templateId);
        setActiveSoul(templateId);
      } catch (err: any) {
        setError(err?.message || String(err));
      } finally {
        setSwitching(null);
      }
    },
    [switching, activeSoul],
  );

  const tabs = useMemo(() => CLAN_TABS, []);

  return (
    <div data-testid="pet-soul-picker" className="flex h-full w-full flex-col bg-[#0b0b13] text-white">
      <header className="flex items-center justify-between border-b border-white/10 px-5 py-3">
        <div>
          <h2 className="text-lg font-semibold">选择灵魂</h2>
          <p className="text-xs text-white/60">
            灵魂决定性格与技能；皮肤可随时换装。切换不丢亲密度与记忆。
          </p>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="rounded-md px-3 py-1 text-sm text-white/70 hover:bg-white/10"
          >
            关闭
          </button>
        )}
      </header>

      <nav className="flex flex-wrap gap-2 border-b border-white/10 px-5 py-3">
        {tabs.map((t) => {
          const isActive = t.id === clan;
          return (
            <button
              key={t.id}
              data-testid={`pet-soul-tab-${t.id}`}
              onClick={() => !t.locked && setClan(t.id)}
              disabled={t.locked}
              className={[
                "flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs transition",
                isActive
                  ? "bg-emerald-500/20 text-emerald-300 ring-1 ring-emerald-400/40"
                  : "bg-white/5 text-white/70 hover:bg-white/10",
                t.locked ? "cursor-not-allowed opacity-50" : "",
              ].join(" ")}
              title={t.locked ? "即将开放" : ""}
            >
              <span>{t.emoji}</span>
              <span>{t.label}</span>
              {t.locked && <span>🔒</span>}
            </button>
          );
        })}
      </nav>

      <div className="flex-1 overflow-y-auto px-5 py-4">
        {error && (
          <div data-testid="pet-soul-error" className="mb-3 rounded-md bg-red-500/15 px-3 py-2 text-sm text-red-300">
            {error}
          </div>
        )}
        {loading && souls.length === 0 ? (
          <div className="py-12 text-center text-white/50">加载中…</div>
        ) : souls.length === 0 ? (
          <div className="py-12 text-center text-white/50">该族群暂无灵魂</div>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {souls.map((s) => {
              const isActive = activeSoul === s.id;
              const isBusy = switching === s.id;
              return (
                <article
                  key={s.id}
                  data-testid={`pet-soul-card-${s.id}`}
                  className={[
                    "group flex flex-col gap-2 rounded-xl border p-3 transition",
                    isActive
                      ? "border-emerald-400/60 bg-emerald-500/10"
                      : "border-white/10 bg-white/5 hover:bg-white/10",
                  ].join(" ")}
                >
                  <div className="flex items-center gap-3">
                    <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-emerald-500/30 to-cyan-500/30 text-2xl">
                      {SOUL_EMOJI[s.id] ?? "🐾"}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <h3 className="truncate text-sm font-semibold">{s.display_name}</h3>
                        <span className="shrink-0 rounded bg-white/10 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-white/70">
                          {s.tier}
                        </span>
                      </div>
                      <p className="truncate text-xs text-white/60">{s.archetype}</p>
                    </div>
                  </div>
                  <p className="line-clamp-2 text-xs text-white/70">{s.tagline}</p>
                  <button
                    data-testid={`pet-soul-switch-${s.id}`}
                    onClick={() => handleSwitch(s.id)}
                    disabled={isActive || isBusy}
                    className={[
                      "mt-1 rounded-md px-3 py-1.5 text-xs font-medium transition",
                      isActive
                        ? "cursor-default bg-emerald-500/30 text-emerald-200"
                        : "bg-emerald-500 text-black hover:bg-emerald-400 disabled:opacity-50",
                    ].join(" ")}
                  >
                    {isActive ? "✓ 当前灵魂" : isBusy ? "切换中…" : "选这只"}
                  </button>
                </article>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
