import { useEffect, useMemo, useState } from "react";
import {
  MEMORY_PROPOSALS_SECTION_COPY_V1 as COPY,
  MEMORY_PROPOSAL_CATEGORY_COPY_V1,
  MEMORY_PROPOSAL_SOURCE_COPY_V1,
  type MemoryProposalsClientV1,
} from "../../../shared/client/memory-proposals";
import type { MemoryProposalDecisionV1, MemoryProposalV1 } from "../../../shared/types/memory-proposal";
import { memoryProposalReadableText } from "../../../shared/types/memory-proposal-text";
import { createDesktopMemoryProposalsClient } from "../services/memoryProposals";
import { API_BASE, apiFetch, useAuthStore } from "../services/store";
import { useI18n } from "../i18n/I18nProvider";

const box = { margin: "8px 16px", padding: 10, borderRadius: 10, background: "rgba(255,255,255,0.04)", maxHeight: 220, overflowY: "auto" } as const;
const hint = { fontSize: 11, opacity: 0.7, lineHeight: 1.5 } as const;
const actions = { display: "flex", gap: 10, fontSize: 12, marginTop: 4 } as const;

/** L8 1b A2: memory the Agent wants to keep, waiting for the owner. Renders nothing while the server switch is off. */
export function MemoryInboxSection({ client }: { client?: MemoryProposalsClientV1 }) {
  const { locale } = useI18n();
  const lang = String(locale).startsWith("zh") ? "zh" : "en";
  const api = useMemo(
    () => client ?? createDesktopMemoryProposalsClient({ fetch: apiFetch, apiBase: API_BASE, token: () => useAuthStore.getState().token }),
    [client],
  );
  const [proposals, setProposals] = useState<MemoryProposalV1[] | null>(null);
  const [closed, setClosed] = useState(false);
  const [problem, setProblem] = useState(false);
  const [notice, setNotice] = useState("");

  const reload = async () => {
    const result = await api.list();
    if (result.ok) {
      setProposals(result.value);
      setProblem(false);
    } else if (result.failure === "closed") {
      setClosed(true);
    } else {
      setProblem(true);
    }
  };
  useEffect(() => { void reload(); }, [api]); // eslint-disable-line react-hooks/exhaustive-deps

  if (closed) return null;

  const decide = async (ids: string[], decision: MemoryProposalDecisionV1) => {
    if (ids.length === 0) return;
    const result = await api.decide(ids, decision);
    const failed = !result.ok || result.value.some((entry) => entry.result === "failed");
    setNotice(failed ? COPY.failed[lang] : COPY.done[lang]);
    await reload();
  };

  return (
    <div style={box} data-testid="memory-inbox">
      <div style={{ fontWeight: 600, fontSize: 13 }}>{COPY.title[lang]}</div>
      <div style={hint}>{COPY.scope[lang]}</div>
      {problem ? <div role="status" style={hint}>{COPY.unreadable[lang]}</div> : null}
      {proposals && proposals.length === 0 ? <div style={hint}>{COPY.empty[lang]}</div> : null}
      {proposals && proposals.length > 0 ? (
        <button type="button" style={{ marginTop: 4, fontSize: 12 }} onClick={() => void decide(proposals.map((p) => p.id), "accept")}>
          {COPY.acceptAll[lang]} ({proposals.length})
        </button>
      ) : null}
      {(proposals ?? []).map((proposal) => (
        <div key={proposal.id} style={{ marginTop: 8, fontSize: 12 }}>
          <div style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{memoryProposalReadableText(proposal.text ?? "")}</div>
          <div style={hint}>
            {MEMORY_PROPOSAL_SOURCE_COPY_V1[proposal.source.kind][lang]} · {MEMORY_PROPOSAL_CATEGORY_COPY_V1[proposal.category][lang]}
          </div>
          <div style={actions}>
            <button type="button" onClick={() => void decide([proposal.id], "accept")}>{COPY.accept[lang]}</button>
            <button type="button" onClick={() => void decide([proposal.id], "reject")}>{COPY.reject[lang]}</button>
          </div>
        </div>
      ))}
      {notice ? <div role="status" style={hint}>{notice}</div> : null}
    </div>
  );
}
