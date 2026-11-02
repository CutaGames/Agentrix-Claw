import { useEffect, useMemo, useState } from "react";
import type { SeedInvitesViewV0 } from "../../../shared/types/seed-invites";
import { API_BASE, apiFetch, useAuthStore } from "../services/store";
import { createDesktopSeedInvitesClient, seedInviteShareLink, type DesktopSeedInvitesFailure } from "../services/seedInvites";

const FAILURE: Record<DesktopSeedInvitesFailure, string> = {
  closed: "",
  invalid_code: "That is not an invite code (10 letters and digits). 邀请码格式不对。",
  not_found: "This code does not exist or was used. 邀请码不存在或已用过。",
  already_member: "You have already joined. 你已经加入了。",
  no_session: "Please sign in first. 请先登录。",
  unreadable: "Invites are unavailable right now. 暂时读不到邀请信息。",
  unavailable: "Network trouble, try again. 网络不稳，请稍后再试。",
};

type Client = ReturnType<typeof createDesktopSeedInvitesClient>;

/** L6-11 "My invites" in desktop settings. Renders nothing while the server switch is off. */
export default function SeedInvitesPanel({ client }: { client?: Client }) {
  const api = useMemo(() => client ?? createDesktopSeedInvitesClient({ fetch: apiFetch, apiBase: API_BASE, token: () => useAuthStore.getState().token }), [client]);
  const [view, setView] = useState<SeedInvitesViewV0 | null>(null);
  const [failure, setFailure] = useState<DesktopSeedInvitesFailure | null>(null);
  const [draft, setDraft] = useState("");
  const [notice, setNotice] = useState("");

  const reload = async () => {
    const result = await api.mine();
    if (result.ok) { setView(result.value); setFailure(null); } else setFailure(result.failure);
  };
  useEffect(() => { void reload(); }, [api]); // eslint-disable-line react-hooks/exhaustive-deps

  if (failure === "closed") return null;

  const redeem = async () => {
    const result = await api.redeem(draft);
    if (result.ok) { setDraft(""); setNotice("Joined. 已加入。"); await reload(); } else setNotice(FAILURE[result.failure]);
  };

  const copy = async (code: string) => {
    try { await navigator.clipboard.writeText(seedInviteShareLink(code)); setNotice("Invite link copied. 邀请链接已复制。"); } catch { setNotice(`Code: ${code}`); }
  };

  return (
    <div data-testid="seed-invites-panel" style={{ marginBottom: 16, padding: 12, borderRadius: 10, background: "rgba(255,255,255,0.04)" }}>
      <div style={{ fontWeight: 600, marginBottom: 6 }}>My invites · 我的邀请</div>
      {failure ? <div style={{ fontSize: 12, opacity: 0.7 }}>{FAILURE[failure]}</div> : null}
      {view?.member ? view.codes.map((invite) => (
        <div key={invite.code} style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13 }}>
          <code>{invite.code}</code>
          {invite.status === "redeemed" ? <span style={{ opacity: 0.6 }}>Used · 已使用</span> : <button onClick={() => void copy(invite.code)}>Copy link · 复制链接</button>}
        </div>
      )) : null}
      {view && !view.member ? (
        <div style={{ display: "flex", gap: 8 }}>
          <input aria-label="Invite code" value={draft} maxLength={32} onChange={(e) => setDraft(e.target.value)} />
          <button disabled={!draft.trim()} onClick={() => void redeem()}>Redeem · 兑换</button>
        </div>
      ) : null}
      {notice ? <div role="status" style={{ fontSize: 12, marginTop: 6 }}>{notice}</div> : null}
    </div>
  );
}
