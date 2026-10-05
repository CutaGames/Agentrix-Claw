import { useEffect, useMemo, useState } from "react";
import type { AgentCollaborationRelationshipViewV0, AgentCollaborationRequestViewV0, AgentCollaborationTierV0 } from "../../../shared/types/agent-collaboration";
import { OWNER_GOAL_TRANSITIONS_V0, type OwnerGoalStatusV0, type OwnerGoalsListV0 } from "../../../shared/types/owner-goals";
import { SHARE_PAGE_KINDS_V1, type SharePageKindV1, type SharePageOwnerViewV1 } from "../../../shared/types/share-pages";
import { TRUST_LADDER_LEVELS_V0, type TrustLadderLevelV0, type TrustLadderViewV0 } from "../../../shared/types/trust-ladder";
import { agentAccountIdOf } from "../services/actionReceipts";
import {
  AGENT_COLLABORATION_KIND_TEXT,
  AGENT_COLLABORATION_TIER_TEXT,
  L6_DESKTOP_FAILURE_TEXT,
  TRUST_LADDER_LEVEL_TEXT,
  counterpartTier,
  createDesktopAgentCollaborationClient,
  createDesktopOwnerGoalsClient,
  createDesktopSharePagesClient,
  createDesktopTrustLadderClient,
  l6EntryEnabled,
  sharePagePublicLink,
  type DesktopL6Deps,
  type DesktopL6Failure,
} from "../services/l6OwnerEntries";
import { API_BASE, apiFetch, useAuthStore } from "../services/store";

const box = { marginBottom: 16, padding: 12, borderRadius: 10, background: "rgba(255,255,255,0.04)" } as const;
const heading = { fontWeight: 600, marginBottom: 6 } as const;
const hint = { fontSize: 12, opacity: 0.7 } as const;
const row = { display: "flex", gap: 8, alignItems: "center", fontSize: 13, flexWrap: "wrap" } as const;

function liveDeps(): DesktopL6Deps {
  return { fetch: apiFetch, apiBase: API_BASE, token: () => useAuthStore.getState().token };
}

function Failure({ failure }: { failure: DesktopL6Failure | null }) {
  return failure && L6_DESKTOP_FAILURE_TEXT[failure] ? <div role="status" style={hint}>{L6_DESKTOP_FAILURE_TEXT[failure]}</div> : null;
}

type TrustLadderClient = ReturnType<typeof createDesktopTrustLadderClient>;

/** L6-6: how far this Agent may go alone. Renders nothing while the server switch is off or the Agent is not yours. */
export function TrustLadderPanel({ agentAccountId, client }: { agentAccountId: string; client?: TrustLadderClient }) {
  const api = useMemo(() => client ?? createDesktopTrustLadderClient(liveDeps()), [client]);
  const [view, setView] = useState<TrustLadderViewV0 | null>(null);
  const [failure, setFailure] = useState<DesktopL6Failure | null>(null);
  const [busy, setBusy] = useState(false);

  const reload = async () => {
    const result = await api.read(agentAccountId);
    if (result.ok) { setView(result.value); setFailure(null); } else setFailure(result.failure);
  };
  useEffect(() => { void reload(); }, [api, agentAccountId]); // eslint-disable-line react-hooks/exhaustive-deps

  if (failure === "closed") return null;

  const pick = async (level: TrustLadderLevelV0) => {
    if (!view || level === view.level) return;
    setBusy(true);
    const result = await api.setLevel(agentAccountId, level, view.budgetRevision);
    setBusy(false);
    if (result.ok) { setView(result.value); setFailure(null); return; }
    setFailure(result.failure);
    if (result.failure === "stale") {
      const fresh = await api.read(agentAccountId);
      if (fresh.ok) setView(fresh.value);
    }
  };

  return (
    <div data-testid="trust-ladder-panel" style={box}>
      <div style={heading}>How far it may go alone · 放手程度</div>
      {view ? TRUST_LADDER_LEVELS_V0.map((level) => (
        <label key={level} style={{ ...row, opacity: level === "commit" && view.level !== "commit" ? 0.6 : 1 }}>
          <input type="radio" name="trust-ladder-level" checked={view.level === level} disabled={busy} onChange={() => void pick(level)} />
          <span>{TRUST_LADDER_LEVEL_TEXT[level]}</span>
        </label>
      )) : null}
      <Failure failure={failure} />
    </div>
  );
}

type CollaborationClient = ReturnType<typeof createDesktopAgentCollaborationClient>;
const TIER_CHOICES: Array<AgentCollaborationTierV0 | "stranger"> = ["stranger", "client", "collaborator", "family"];

/** L6-1: requests other people's Agents sent. Plain text only; the owner can only give the sender a tier. */
export function AgentRequestsPanel({ client }: { client?: CollaborationClient }) {
  const api = useMemo(() => client ?? createDesktopAgentCollaborationClient(liveDeps()), [client]);
  const [requests, setRequests] = useState<AgentCollaborationRequestViewV0[] | null>(null);
  const [relationships, setRelationships] = useState<AgentCollaborationRelationshipViewV0[]>([]);
  const [failure, setFailure] = useState<DesktopL6Failure | null>(null);

  const reload = async () => {
    const [list, tiers] = await Promise.all([api.requests(), api.relationships()]);
    if (list.ok) { setRequests(list.value); setFailure(null); } else setFailure(list.failure);
    if (tiers.ok) setRelationships(tiers.value);
  };
  useEffect(() => { void reload(); }, [api]); // eslint-disable-line react-hooks/exhaustive-deps

  if (failure === "closed") return null;

  const setTier = async (request: AgentCollaborationRequestViewV0, choice: AgentCollaborationTierV0 | "stranger") => {
    const result = await api.setTier(request.identity, choice === "stranger" ? null : choice);
    if (!result.ok) { setFailure(result.failure); return; }
    const tiers = await api.relationships();
    if (tiers.ok) setRelationships(tiers.value);
  };

  return (
    <div data-testid="agent-requests-panel" style={box}>
      <div style={heading}>Requests from other Agents · 别人的 Agent 发来的请求</div>
      {requests && requests.length === 0 ? <div style={hint}>No requests waiting. 没有待处理的请求。</div> : null}
      {requests?.map((request) => (
        <div key={request.receiptId} style={{ marginBottom: 8 }}>
          <div style={row}>
            <strong>{AGENT_COLLABORATION_KIND_TEXT[request.kind]}</strong>
            <span>{request.counterpartName}</span>
            <span style={hint}>{`${request.identity.value} · unverified 未核实 · ${request.receivedAt.slice(0, 16).replace("T", " ")}`}</span>
          </div>
          <div style={{ whiteSpace: "pre-wrap", fontSize: 13, userSelect: "text" }}>{request.message}</div>
          <label style={row}>
            <span style={hint}>Treat them as · 把对方当作</span>
            <select value={counterpartTier(relationships, request.identity)} onChange={(e) => void setTier(request, e.target.value as AgentCollaborationTierV0 | "stranger")}>
              {TIER_CHOICES.map((tier) => <option key={tier} value={tier}>{AGENT_COLLABORATION_TIER_TEXT[tier]}</option>)}
            </select>
          </label>
        </div>
      ))}
      <Failure failure={failure} />
    </div>
  );
}

type SharePagesClient = ReturnType<typeof createDesktopSharePagesClient>;
const KIND_TEXT: Record<SharePageKindV1, string> = { quote: "Quote · 报价单", plan: "Plan · 方案", notes: "Meeting notes · 会议纪要", twin_answer: "Twin answer · 分身回答" };

/** L6-2: turn a quote, plan, notes or twin answer into a link; copy it or revoke it. The page itself is on the web. */
export function SharePagesPanel({ client }: { client?: SharePagesClient }) {
  const api = useMemo(() => client ?? createDesktopSharePagesClient(liveDeps()), [client]);
  const [pages, setPages] = useState<SharePageOwnerViewV1[] | null>(null);
  const [failure, setFailure] = useState<DesktopL6Failure | null>(null);
  const [kind, setKind] = useState<SharePageKindV1>("quote");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [notice, setNotice] = useState("");

  const reload = async () => {
    const result = await api.mine();
    if (result.ok) { setPages(result.value); setFailure(null); } else setFailure(result.failure);
  };
  useEffect(() => { void reload(); }, [api]); // eslint-disable-line react-hooks/exhaustive-deps

  if (failure === "closed") return null;

  const copy = async (page: SharePageOwnerViewV1) => {
    const link = sharePagePublicLink(page.token);
    try { await navigator.clipboard.writeText(link); setNotice("Link copied. 链接已复制。"); } catch { setNotice(link); }
  };
  const create = async () => {
    const result = await api.create({ kind, title: title.trim(), body: body.trim() });
    if (!result.ok) { setFailure(result.failure); return; }
    setTitle(""); setBody("");
    await copy(result.value);
    await reload();
  };
  const revoke = async (page: SharePageOwnerViewV1) => {
    const result = await api.revoke(page.shareId);
    if (!result.ok) setFailure(result.failure);
    await reload();
  };

  return (
    <div data-testid="share-pages-panel" style={box}>
      <div style={heading}>Share pages · 共享页</div>
      {pages?.map((page) => (
        <div key={page.shareId} style={row}>
          <span>{`${KIND_TEXT[page.kind]} · ${page.title}`}</span>
          <span style={hint}>{page.status === "active" ? `${page.replyCount} replies · 回复` : "Revoked · 已撤回"}</span>
          {page.status === "active" ? <button onClick={() => void copy(page)}>Copy link · 复制链接</button> : null}
          {page.status === "active" ? <button onClick={() => void revoke(page)}>Revoke · 撤回</button> : null}
        </div>
      ))}
      <div style={{ ...row, marginTop: 8 }}>
        <select aria-label="Kind" value={kind} onChange={(e) => setKind(e.target.value as SharePageKindV1)}>
          {SHARE_PAGE_KINDS_V1.map((k) => <option key={k} value={k}>{KIND_TEXT[k]}</option>)}
        </select>
        <input aria-label="Title" placeholder="Title · 标题" value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} />
      </div>
      <textarea aria-label="Body" placeholder="What the page says · 正文" value={body} rows={3} style={{ width: "100%", marginTop: 6 }} onChange={(e) => setBody(e.target.value)} />
      <button disabled={!title.trim() || !body.trim()} onClick={() => void create()}>Make a link · 生成链接</button>
      {notice ? <div role="status" style={hint}>{notice}</div> : null}
      <Failure failure={failure} />
    </div>
  );
}

type OwnerGoalsClient = ReturnType<typeof createDesktopOwnerGoalsClient>;
const STATUS_ACTION: Record<OwnerGoalStatusV0, string> = { active: "Reopen · 重新开始", done: "Done · 完成", archived: "Archive · 归档" };

/** L6-3 "In progress": goals with a check-in time and the cards that are due. Nothing is pushed or sent. */
export function OwnerGoalsPanel({ client }: { client?: OwnerGoalsClient }) {
  const api = useMemo(() => client ?? createDesktopOwnerGoalsClient(liveDeps()), [client]);
  const [list, setList] = useState<OwnerGoalsListV0 | null>(null);
  const [failure, setFailure] = useState<DesktopL6Failure | null>(null);
  const [title, setTitle] = useState("");
  const [checkIn, setCheckIn] = useState("");

  const reload = async () => {
    const result = await api.list();
    if (result.ok) { setList(result.value); setFailure(null); } else setFailure(result.failure);
  };
  useEffect(() => { void reload(); }, [api]); // eslint-disable-line react-hooks/exhaustive-deps

  if (failure === "closed") return null;

  const add = async () => {
    const at = checkIn ? new Date(checkIn) : null;
    const result = await api.create({ title: title.trim(), checkInAt: at && !Number.isNaN(at.getTime()) ? at.toISOString() : null });
    if (!result.ok) { setFailure(result.failure); return; }
    setTitle(""); setCheckIn("");
    await reload();
  };
  const move = async (goalId: string, status: OwnerGoalStatusV0) => {
    const result = await api.update(goalId, { status });
    if (!result.ok) setFailure(result.failure);
    await reload();
  };

  return (
    <div data-testid="owner-goals-panel" style={box}>
      <div style={heading}>In progress · 进行中</div>
      {list?.cards.map((card) => (
        <div key={card.cardId} style={{ ...row, fontWeight: 600 }}>
          <span>{`Check in · 到点复盘：${card.title}`}</span>
          <button onClick={() => void move(card.goalId, "done")}>{STATUS_ACTION.done}</button>
        </div>
      ))}
      {list?.goals.map((goal) => (
        <div key={goal.goalId} style={row}>
          <span style={{ textDecoration: goal.status === "done" ? "line-through" : undefined }}>{goal.title}</span>
          {goal.checkInAt ? <span style={hint}>{new Date(goal.checkInAt).toLocaleString()}</span> : null}
          {OWNER_GOAL_TRANSITIONS_V0[goal.status].map((next) => (
            <button key={next} onClick={() => void move(goal.goalId, next)}>{STATUS_ACTION[next]}</button>
          ))}
        </div>
      ))}
      {list && list.goals.length === 0 ? <div style={hint}>Nothing in progress yet. 还没有进行中的目标。</div> : null}
      <div style={{ ...row, marginTop: 8 }}>
        <input aria-label="Goal" placeholder="Goal · 目标" value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} />
        <input aria-label="Check in at" type="datetime-local" value={checkIn} onChange={(e) => setCheckIn(e.target.value)} />
        <button disabled={!title.trim()} onClick={() => void add()}>Add · 添加</button>
      </div>
      <Failure failure={failure} />
    </div>
  );
}

/** The four entries in settings, each behind its own build switch; the trust ladder follows the active Agent. */
export default function L6OwnerEntriesSection() {
  const instances = useAuthStore((state) => state.instances);
  const activeInstanceId = useAuthStore((state) => state.activeInstanceId);
  const active = instances.find((i) => i.id === activeInstanceId) ?? instances.find((i) => (i as { isPrimary?: boolean }).isPrimary) ?? instances[0];
  const agentAccountId = active ? agentAccountIdOf(active as never) : null;
  return (
    <>
      {l6EntryEnabled("trustLadder") && agentAccountId ? <TrustLadderPanel agentAccountId={agentAccountId} /> : null}
      {l6EntryEnabled("agentCollaboration") ? <AgentRequestsPanel /> : null}
      {l6EntryEnabled("sharePages") ? <SharePagesPanel /> : null}
      {l6EntryEnabled("ownerGoals") ? <OwnerGoalsPanel /> : null}
    </>
  );
}
