/**
 * PetBreedingPanel — Phase 6 S5 社交繁育中心
 *
 * 邀请好友配对宠物 → 5 天孵化 → 双方各得一只血统宠物。
 *
 * 监听：
 *   agentrix:pet-breeding-invited / hatching / hatched
 */
import { useCallback, useEffect, useState } from "react";
import {
  type BreedingEgg,
  type BreedingListResp,
  type BreedingStatus,
  acceptBreeding,
  cancelBreeding,
  declineBreeding,
  formatCountdown,
  formatRelativeTime,
  hatchBreeding,
  inviteBreeding,
  listMyBreedingEggs,
} from "../services/petPhase6Sdk";
import { listSkins, type PetSkinSummary } from "../services/petSoulSdk";

interface Props {
  onClose: () => void;
}

const STATUS_LABEL: Record<BreedingStatus, { zh: string; cls: string }> = {
  invited: { zh: "等待对方接受", cls: "bg-amber-500/20 text-amber-300" },
  accepted: { zh: "已接受", cls: "bg-blue-500/20 text-blue-300" },
  hatching: { zh: "孵化中", cls: "bg-indigo-500/20 text-indigo-300" },
  hatched: { zh: "已孵化", cls: "bg-emerald-500/20 text-emerald-300" },
  declined: { zh: "已拒绝", cls: "bg-red-500/20 text-red-300" },
  cancelled: { zh: "已取消", cls: "bg-white/10 text-white/50" },
};

export default function PetBreedingPanel({ onClose }: Props) {
  const [data, setData] = useState<BreedingListResp>({ initiated: [], received: [] });
  const [skins, setSkins] = useState<PetSkinSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());

  // invite form
  const [showForm, setShowForm] = useState(false);
  const [partnerUserId, setPartnerUserId] = useState("");
  const [initiatorSkinId, setInitiatorSkinId] = useState("");
  const [partnerSkinId, setPartnerSkinId] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [d, s] = await Promise.all([listMyBreedingEggs(), listSkins()]);
      setData(d);
      setSkins(s);
      if (s[0] && !initiatorSkinId) setInitiatorSkinId(s[0].id);
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  }, [initiatorSkinId]);

  useEffect(() => {
    void refresh();
    const t = setInterval(() => setNow(Date.now()), 60_000);
    const onEvt = () => void refresh();
    window.addEventListener("agentrix:pet-breeding-invited", onEvt);
    window.addEventListener("agentrix:pet-breeding-hatching", onEvt);
    window.addEventListener("agentrix:pet-breeding-hatched", onEvt);
    return () => {
      clearInterval(t);
      window.removeEventListener("agentrix:pet-breeding-invited", onEvt);
      window.removeEventListener("agentrix:pet-breeding-hatching", onEvt);
      window.removeEventListener("agentrix:pet-breeding-hatched", onEvt);
    };
  }, [refresh]);

  const sendInvite = useCallback(async () => {
    if (!partnerUserId.trim() || !initiatorSkinId || !partnerSkinId.trim()) {
      setError("请填写完整：对方用户ID / 我方皮肤 / 对方皮肤ID");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await inviteBreeding({
        partnerUserId: partnerUserId.trim(),
        initiatorPetSkinId: initiatorSkinId,
        partnerPetSkinId: partnerSkinId.trim(),
      });
      setPartnerUserId("");
      setPartnerSkinId("");
      setShowForm(false);
      await refresh();
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setSubmitting(false);
    }
  }, [partnerUserId, initiatorSkinId, partnerSkinId, refresh]);

  const handleAction = useCallback(
    async (action: "accept" | "decline" | "cancel" | "hatch", id: string) => {
      setError(null);
      try {
        if (action === "accept") await acceptBreeding(id);
        if (action === "decline") await declineBreeding(id);
        if (action === "cancel") await cancelBreeding(id);
        if (action === "hatch") await hatchBreeding(id);
        await refresh();
      } catch (e: any) {
        setError(e?.message || String(e));
      }
    },
    [refresh],
  );

  return (
    <div
      data-testid="pet-breeding"
      className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/70"
      onClick={onClose}
    >
      <div
        className="relative flex h-[85vh] w-[min(960px,94vw)] flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#0b0b13] text-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between border-b border-white/10 px-5 py-3">
          <div>
            <h2 className="text-lg font-semibold">💞 社交繁育 · Breeding</h2>
            <p className="text-xs text-white/60">
              邀请好友配对宠物 · 5 天孵化 · 双方各得一只血统宠物（来自 RemixBreeding）
            </p>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <button
              onClick={() => setShowForm((v) => !v)}
              className="rounded-md bg-purple-600/80 px-3 py-1 font-medium hover:bg-purple-500"
              data-testid="breeding-invite-toggle"
            >
              {showForm ? "✕ 取消" : "💌 发起邀请"}
            </button>
            <button
              onClick={refresh}
              disabled={loading}
              className="text-white/50 hover:text-white"
            >
              {loading ? "…" : "↻"}
            </button>
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

        {showForm && (
          <div className="border-b border-white/10 bg-black/30 px-5 py-3">
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              <input
                value={partnerUserId}
                onChange={(e) => setPartnerUserId(e.target.value)}
                placeholder="对方用户 ID"
                className="rounded-md bg-white/10 px-3 py-2 text-sm placeholder-white/40"
                data-testid="breeding-partner-user"
              />
              <select
                value={initiatorSkinId}
                onChange={(e) => setInitiatorSkinId(e.target.value)}
                className="rounded-md bg-white/10 px-3 py-2 text-sm"
                data-testid="breeding-my-skin"
              >
                <option value="" className="bg-[#0b0b13]">
                  请选择我方皮肤…
                </option>
                {skins.map((s) => (
                  <option key={s.id} value={s.id} className="bg-[#0b0b13]">
                    {s.display_name}
                  </option>
                ))}
              </select>
              <input
                value={partnerSkinId}
                onChange={(e) => setPartnerSkinId(e.target.value)}
                placeholder="对方皮肤 ID"
                className="rounded-md bg-white/10 px-3 py-2 text-sm placeholder-white/40"
                data-testid="breeding-partner-skin"
              />
            </div>
            <div className="mt-2 flex justify-end">
              <button
                onClick={sendInvite}
                disabled={submitting}
                className="rounded-md bg-emerald-600/80 px-4 py-1.5 text-sm font-medium hover:bg-emerald-500 disabled:opacity-50"
                data-testid="breeding-invite-submit"
              >
                {submitting ? "发送中…" : "💌 发送邀请"}
              </button>
            </div>
          </div>
        )}

        <div className="flex-1 overflow-y-auto px-5 py-4">
          <Section
            title="📨 我收到的邀请"
            empty="没有收到的邀请"
            eggs={data.received}
            now={now}
            isReceived
            onAction={handleAction}
          />
          <Section
            title="📤 我发起的"
            empty="还没有发起繁育邀请"
            eggs={data.initiated}
            now={now}
            isReceived={false}
            onAction={handleAction}
          />
        </div>
      </div>
    </div>
  );
}

function Section({
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
  onAction: (a: "accept" | "decline" | "cancel" | "hatch", id: string) => void;
}) {
  return (
    <div className="mb-6">
      <h3 className="mb-2 text-sm font-semibold text-white/80">{title}</h3>
      {eggs.length === 0 ? (
        <div className="rounded-md bg-white/5 px-3 py-4 text-center text-xs text-white/50">
          {empty}
        </div>
      ) : (
        <div className="space-y-2">
          {eggs.map((e) => {
            const status = STATUS_LABEL[e.status];
            const canHatch = e.status === "hatching" && e.hatch_at != null && now >= e.hatch_at;
            const childForMe = isReceived
              ? e.child_skin_id_partner
              : e.child_skin_id_initiator;
            return (
              <article
                key={e.id}
                data-testid={`breeding-egg-${e.id}`}
                className="rounded-xl border border-white/10 bg-white/5 p-3"
              >
                <div className="flex items-center gap-3">
                  <div className="text-3xl">🥚</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${status.cls}`}
                      >
                        {status.zh}
                      </span>
                      <span className="text-[11px] text-white/40">
                        {formatRelativeTime(e.created_at)}
                      </span>
                    </div>
                    <div className="mt-1 truncate text-xs text-white/60">
                      我：<span className="text-emerald-300">
                        {(isReceived ? e.partner_pet_skin_id : e.initiator_pet_skin_id).slice(0, 10)}…
                      </span>
                      <span className="mx-2 text-white/20">×</span>
                      对方：<span className="text-purple-300">
                        {(isReceived ? e.initiator_pet_skin_id : e.partner_pet_skin_id).slice(0, 10)}…
                      </span>
                    </div>
                    {e.status === "hatching" && e.hatch_at && (
                      <div className="mt-1 text-xs text-amber-300">
                        ⏳ {formatCountdown(e.hatch_at)}
                      </div>
                    )}
                    {e.status === "hatched" && childForMe && (
                      <div className="mt-1 text-xs text-emerald-300">
                        🎉 你的小宝贝：<code className="text-emerald-200">{childForMe.slice(0, 16)}…</code>
                      </div>
                    )}
                  </div>
                  <div className="flex flex-col gap-1">
                    {isReceived && e.status === "invited" && (
                      <>
                        <button
                          onClick={() => onAction("accept", e.id)}
                          className="rounded-md bg-emerald-600/80 px-3 py-1 text-xs hover:bg-emerald-500"
                          data-testid={`breeding-accept-${e.id}`}
                        >
                          接受
                        </button>
                        <button
                          onClick={() => onAction("decline", e.id)}
                          className="rounded-md bg-red-600/80 px-3 py-1 text-xs hover:bg-red-500"
                        >
                          拒绝
                        </button>
                      </>
                    )}
                    {!isReceived && e.status === "invited" && (
                      <button
                        onClick={() => onAction("cancel", e.id)}
                        className="rounded-md bg-white/10 px-3 py-1 text-xs hover:bg-white/20"
                      >
                        取消
                      </button>
                    )}
                    {canHatch && (
                      <button
                        onClick={() => onAction("hatch", e.id)}
                        className="rounded-md bg-amber-500/80 px-3 py-1 text-xs font-medium hover:bg-amber-400"
                        data-testid={`breeding-hatch-${e.id}`}
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
