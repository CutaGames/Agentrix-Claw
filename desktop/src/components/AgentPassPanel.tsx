import { useEffect, useMemo, useState } from "react";
import { agentPassPreviewV1, type AgentPassV1 } from "../../../shared/types/agent-pass";
import { agentPassEnabled, createDesktopAgentPassClient, desktopPassFailureText, type DesktopPassFailure } from "../services/agentPass";
import { API_BASE, apiFetch, useAuthStore } from "../services/store";
import { useI18n } from "../i18n/I18nProvider";
import { pickFor } from "../i18n/pick";

const box = { marginBottom: 16, padding: 12, borderRadius: 10, background: "rgba(255,255,255,0.04)" } as const;
const heading = { fontWeight: 600, marginBottom: 6 } as const;
const hint = { fontSize: 12, opacity: 0.7 } as const;
const row = { display: "flex", gap: 8, alignItems: "center", fontSize: 13, flexWrap: "wrap" } as const;

type PassClient = ReturnType<typeof createDesktopAgentPassClient>;

/** L8 1b A5: the Passes you have given out, what each allows, and revoke. Renders nothing while the server switch is off. */
export function AgentPassPanel({ client }: { client?: PassClient }) {
  const { locale } = useI18n();
  const p = pickFor(locale);
  /** The Pass preview carries both languages; show the app's one. */
  const say = (line: { zh: string; en: string }) => (locale === "zh" ? line.zh : line.en);
  const api = useMemo(() => client ?? createDesktopAgentPassClient({ fetch: apiFetch, apiBase: API_BASE, token: () => useAuthStore.getState().token }), [client]);
  const [passes, setPasses] = useState<AgentPassV1[] | null>(null);
  const [failure, setFailure] = useState<DesktopPassFailure | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [notice, setNotice] = useState("");

  const reload = async () => {
    const result = await api.list();
    if (result.ok) { setPasses(result.value); setFailure(null); } else setFailure(result.failure);
  };
  useEffect(() => { void reload(); }, [api]); // eslint-disable-line react-hooks/exhaustive-deps

  if (failure === "closed") return null;

  const revoke = async (pass: AgentPassV1) => {
    const result = await api.revoke(pass.id);
    setConfirming(null);
    setNotice(result.ok ? p("已撤销，马上生效。", "Revoked. It takes effect now.") : "");
    if (!result.ok) setFailure(result.failure);
    await reload();
  };

  return (
    <div data-testid="agent-pass-panel" style={box}>
      <div style={heading}>{p("你发出去的通行证", "Passes you have given out")}</div>
      <div style={hint}>{p("每张通行证写明：谁、能读什么、为了什么、多久、几次。撤销马上生效。", "Each Pass says who, what, why, how long and how often. Revoking is immediate.")}</div>
      {passes && passes.length === 0 ? <div style={hint}>{p("还没有通行证。", "No Passes yet.")}</div> : null}
      {passes?.map((pass) => {
        const preview = agentPassPreviewV1(pass);
        return (
          <div key={pass.id} style={{ marginTop: 8 }} data-testid="agent-pass-item">
            <div style={row}>
              <strong>{say(preview.who)}</strong>
              <span style={hint}>{`${say(preview.statusCopy)} · ${say(preview.uses)}`}</span>
            </div>
            <div style={row}>
              <button type="button" aria-expanded={open === pass.id} onClick={() => setOpen(open === pass.id ? null : pass.id)}>
                {open === pass.id ? p("收起", "Hide") : p("看它能做什么", "See what it allows")}
              </button>
              {preview.revocable && confirming !== pass.id ? <button type="button" onClick={() => setConfirming(pass.id)}>{p("撤销", "Revoke")}</button> : null}
              {confirming === pass.id ? (
                <>
                  <span style={hint}>{p("撤销后对方马上读不到了。", "They lose access at once.")}</span>
                  <button type="button" onClick={() => void revoke(pass)}>{p("确认撤销", "Confirm revoke")}</button>
                  <button type="button" onClick={() => setConfirming(null)}>{p("取消", "Cancel")}</button>
                </>
              ) : null}
            </div>
            {open === pass.id ? (
              <ul style={{ margin: "4px 0 0 16px", fontSize: 12 }}>
                {preview.can.map((line) => <li key={line.en}>{say(line)}</li>)}
                <li>{`${say(preview.duration)}${preview.expiresAt ? ` (${new Date(preview.expiresAt).toLocaleString()})` : ""}`}</li>
              </ul>
            ) : null}
          </div>
        );
      })}
      {notice ? <div role="status" style={hint}>{notice}</div> : null}
      {failure && desktopPassFailureText(failure, locale) ? <div role="status" style={hint}>{desktopPassFailureText(failure, locale)}</div> : null}
    </div>
  );
}

/** Settings entry, behind its own build switch. */
export default function AgentPassSection() {
  return agentPassEnabled() ? <AgentPassPanel /> : null;
}
