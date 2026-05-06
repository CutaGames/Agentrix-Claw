/**
 * WardrobePanel — V4 衣柜 (Pet Skin Wardrobe).
 *
 * Per docs/desktop-prd-v4.md §3.2:
 *   - 当前装备的皮肤（大图）
 *   - 已拥有皮肤网格（缩略图）
 *   - 「市场」入口 → 嵌入 Web /console/marketplace（iframe）
 *   - 「PetCreator」入口 → 弹出 PetCreatorPanel
 *   - 底部：当前灵魂模板 + 「切换灵魂」按钮 → 弹 SoulPicker
 *
 * Backend:
 *   GET  /api/v1/pet/skins         (existing)
 *   GET  /api/v1/pet/skins/active  (existing)
 *   POST /api/v1/pet/skin/activate (existing, in LivingPetController)
 *
 * Marketplace 后端尚未上线 → V4 P3 之前以 web 外链 / iframe 提示。
 */
import { useCallback, useEffect, useState } from "react";
import {
  type PetSkinSummary,
  activateSkin,
  getActiveSkinId,
  listSkins,
} from "../services/petSoulSdk";
import { getLastPetState } from "../services/petSdk";
import { dispatchUiAction } from "../services/desktopBus";

interface Props {
  onClose: () => void;
}

const MARKETPLACE_URL =
  (typeof window !== "undefined" &&
    (window as any).__AGENTRIX_WEB_URL__) ||
  "https://agentrix.top/console/marketplace";

export default function WardrobePanel({ onClose }: Props) {
  const [skins, setSkins] = useState<PetSkinSummary[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [switching, setSwitching] = useState<string | null>(null);
  const [showMarketplace, setShowMarketplace] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [list, active] = await Promise.all([listSkins(), getActiveSkinId()]);
      setSkins(list);
      setActiveId(active);
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    const onSkinChanged = (e: Event) => {
      const detail = (e as CustomEvent).detail as { active_skin_id?: string } | undefined;
      if (detail?.active_skin_id !== undefined) setActiveId(detail.active_skin_id ?? null);
      else void refresh();
    };
    window.addEventListener("agentrix:pet-skin-changed", onSkinChanged);
    return () => window.removeEventListener("agentrix:pet-skin-changed", onSkinChanged);
  }, [refresh]);

  const handleActivate = useCallback(
    async (skinId: string) => {
      if (switching || skinId === activeId) return;
      setSwitching(skinId);
      setError(null);
      try {
        await activateSkin(skinId);
        setActiveId(skinId);
      } catch (e: any) {
        setError(e?.message || String(e));
      } finally {
        setSwitching(null);
      }
    },
    [switching, activeId],
  );

  const activeSkin = skins.find((s) => s.id === activeId) || null;
  const lastState = getLastPetState();
  const soulName = lastState?.soul_template_id ?? "—";

  return (
    <div
      data-testid="pet-wardrobe"
      className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/70"
      onClick={onClose}
    >
      <div
        className="relative flex h-[85vh] w-[min(960px,94vw)] flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#0b0b13] text-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between border-b border-white/10 px-5 py-3">
          <div>
            <h2 className="text-lg font-semibold">👗 衣柜 · Wardrobe</h2>
            <p className="text-xs text-white/60">
              换装不丢灵魂、亲密度、记忆。来自 PetCreator / 市场 / 平台共享。
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-md px-3 py-1 text-sm text-white/70 hover:bg-white/10"
          >
            关闭
          </button>
        </header>

        {showMarketplace ? (
          <div className="flex flex-1 flex-col">
            <div className="flex items-center justify-between border-b border-white/10 px-5 py-2">
              <span className="text-sm text-white/70">🛍 Skin Marketplace</span>
              <button
                className="text-xs text-emerald-400 hover:underline"
                onClick={() => setShowMarketplace(false)}
              >
                ← 返回衣柜
              </button>
            </div>
            <iframe
              src={MARKETPLACE_URL}
              title="Agentrix Skin Marketplace"
              className="flex-1 bg-white"
              sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
            />
          </div>
        ) : (
          <>
            {/* Top: active skin big preview + actions */}
            <section className="flex gap-5 border-b border-white/10 px-5 py-4">
              <div className="flex h-40 w-40 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-gradient-to-br from-indigo-600/20 to-emerald-600/20 ring-1 ring-white/10">
                {activeSkin?.thumbnail_url ? (
                  <img
                    src={activeSkin.thumbnail_url}
                    alt={activeSkin.display_name}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <span className="text-5xl">🐾</span>
                )}
              </div>
              <div className="flex flex-1 flex-col justify-between">
                <div>
                  <div className="text-xs uppercase tracking-wide text-white/50">当前装备</div>
                  <div className="mt-1 text-xl font-semibold">
                    {activeSkin?.display_name ?? "默认形象"}
                  </div>
                  <div className="mt-1 text-xs text-white/60">
                    格式 {activeSkin?.format ?? "—"} · 来源 {activeSkin?.source ?? "platform"}
                  </div>
                  <div className="mt-2 text-xs text-white/60">
                    当前灵魂模板：<span className="text-emerald-300">{soulName}</span>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => void dispatchUiAction("open-pet-creator")}
                    className="rounded-md bg-purple-600/80 px-3 py-1.5 text-sm font-medium hover:bg-purple-500"
                    data-testid="wardrobe-open-creator"
                  >
                    🐾 创建新皮肤
                  </button>
                  <button
                    onClick={() => void dispatchUiAction("open-soul-picker")}
                    className="rounded-md bg-emerald-600/80 px-3 py-1.5 text-sm font-medium hover:bg-emerald-500"
                    data-testid="wardrobe-open-soul"
                  >
                    ✨ 切换灵魂
                  </button>
                  <button
                    onClick={() => setShowMarketplace(true)}
                    className="rounded-md bg-white/10 px-3 py-1.5 text-sm font-medium hover:bg-white/20"
                    data-testid="wardrobe-open-market"
                  >
                    🛍 浏览市场
                  </button>
                </div>
              </div>
            </section>

            {/* Grid: owned skins */}
            <section className="flex-1 overflow-y-auto px-5 py-4">
              <div className="mb-3 flex items-center justify-between">
                <div className="text-sm font-medium text-white/80">
                  已拥有 {skins.length} 只皮肤
                </div>
                <button
                  onClick={refresh}
                  className="text-xs text-white/50 hover:text-white"
                  disabled={loading}
                >
                  {loading ? "刷新中…" : "↻ 刷新"}
                </button>
              </div>
              {error && (
                <div
                  data-testid="wardrobe-error"
                  className="mb-3 rounded-md bg-red-500/15 px-3 py-2 text-sm text-red-300"
                >
                  {error}
                </div>
              )}
              {skins.length === 0 && !loading ? (
                <div className="py-12 text-center text-sm text-white/50">
                  还没有皮肤。试试 PetCreator 生成一只，或去市场逛逛。
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                  {skins.map((s) => {
                    const isActive = s.id === activeId;
                    const isBusy = switching === s.id;
                    return (
                      <article
                        key={s.id}
                        data-testid={`wardrobe-skin-${s.id}`}
                        className={[
                          "flex flex-col gap-2 rounded-xl border p-2 transition",
                          isActive
                            ? "border-emerald-400/60 bg-emerald-500/10"
                            : "border-white/10 bg-white/5 hover:bg-white/10",
                        ].join(" ")}
                      >
                        <div className="flex h-32 w-full items-center justify-center overflow-hidden rounded-md bg-black/30">
                          {s.thumbnail_url ? (
                            <img
                              src={s.thumbnail_url}
                              alt={s.display_name}
                              className="h-full w-full object-cover"
                            />
                          ) : (
                            <span className="text-3xl">🐾</span>
                          )}
                        </div>
                        <div className="truncate text-sm font-medium" title={s.display_name}>
                          {s.display_name}
                        </div>
                        <div className="flex items-center justify-between text-[10px] uppercase tracking-wide text-white/50">
                          <span>{s.format}</span>
                          <span>{s.source}</span>
                        </div>
                        <button
                          data-testid={`wardrobe-activate-${s.id}`}
                          disabled={isActive || isBusy}
                          onClick={() => void handleActivate(s.id)}
                          className={[
                            "rounded-md px-2 py-1 text-xs font-medium transition",
                            isActive
                              ? "bg-emerald-500/20 text-emerald-300"
                              : isBusy
                                ? "bg-white/10 text-white/50"
                                : "bg-white/10 text-white hover:bg-white/20",
                          ].join(" ")}
                        >
                          {isActive ? "已装备" : isBusy ? "切换中…" : "装备"}
                        </button>
                      </article>
                    );
                  })}
                </div>
              )}
            </section>
          </>
        )}
      </div>
    </div>
  );
}
