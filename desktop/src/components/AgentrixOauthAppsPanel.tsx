import { useEffect, useMemo, useState } from "react";
import { agentrixOauthClientLabelV1, agentrixOauthLastUsedTextV1, agentrixOauthScopeLinesV1, type AgentrixOauthConnectedAppV1 } from "../../../shared/types/agentrix-oauth";
import { agentrixOauthEnabled, createDesktopOauthAppsClient, desktopOauthAppsFailureText, type DesktopOauthAppsFailure } from "../services/agentrixOauthApps";
import { API_BASE, apiFetch, useAuthStore } from "../services/store";
import { useI18n } from "../i18n/I18nProvider";
import { pickFor } from "../i18n/pick";

const box = { marginBottom: 16, padding: 12, borderRadius: 10, background: "rgba(255,255,255,0.04)" } as const;
const heading = { fontWeight: 600, marginBottom: 6 } as const;
const hint = { fontSize: 12, opacity: 0.7 } as const;
const row = { display: "flex", gap: 8, alignItems: "center", fontSize: 13, flexWrap: "wrap" } as const;

type OauthAppsClient = ReturnType<typeof createDesktopOauthAppsClient>;

/** L8 3A E1: the apps you signed in to with Agentrix, what each may read, and disconnect. Renders nothing while the server switch is off. */
export function AgentrixOauthAppsPanel({ client }: { client?: OauthAppsClient }) {
  const { locale } = useI18n();
  const p = pickFor(locale);
  const say = (line: { zh: string; en: string }) => (locale === "zh" ? line.zh : line.en);
  const api = useMemo(() => client ?? createDesktopOauthAppsClient({ fetch: apiFetch, apiBase: API_BASE, token: () => useAuthStore.getState().token }), [client]);
  const [apps, setApps] = useState<AgentrixOauthConnectedAppV1[] | null>(null);
  const [failure, setFailure] = useState<DesktopOauthAppsFailure | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [notice, setNotice] = useState("");

  const reload = async () => {
    const result = await api.list();
    if (result.ok) { setApps(result.value); setFailure(null); } else setFailure(result.failure);
  };
  useEffect(() => { void reload(); }, [api]); // eslint-disable-line react-hooks/exhaustive-deps
  if (failure === "closed") return null;

  const revoke = async (app: AgentrixOauthConnectedAppV1) => {
    const result = await api.revoke(app.passId);
    setConfirming(null);
    setNotice(result.ok ? p("已断开，马上生效。", "Disconnected. It takes effect now.") : "");
    if (!result.ok) setFailure(result.failure);
    await reload();
  };

  return (
    <div data-testid="agentrix-oauth-apps-panel" style={box}>
      <div style={heading}>{p("用 Agentrix 登录的应用", "Apps you signed in to with Agentrix")}</div>
      <div style={hint}>{p("每个应用只能读你留给它的那几项。断开马上生效。", "Each app can read only what you left for it. Disconnecting is immediate.")}</div>
      {apps && apps.length === 0 ? <div style={hint}>{p("还没有应用。", "No apps yet.")}</div> : null}
      {apps?.map((app) => (
        <div key={app.passId} style={{ marginTop: 8 }} data-testid="agentrix-oauth-app-item">
          <div style={row}>
            <strong>{agentrixOauthClientLabelV1(app.clientId, app.clientName)}</strong>
            <span style={hint}>{agentrixOauthLastUsedTextV1(app.lastUsedAt, locale === "zh" ? "zh" : "en")}</span>
          </div>
          <div style={row}>
            <button type="button" aria-expanded={open === app.passId} onClick={() => setOpen(open === app.passId ? null : app.passId)}>
              {open === app.passId ? p("收起", "Hide") : p("看它能读什么", "See what it may read")}
            </button>
            {confirming !== app.passId ? <button type="button" onClick={() => setConfirming(app.passId)}>{p("断开", "Disconnect")}</button> : null}
            {confirming === app.passId ? (
              <>
                <span style={hint}>{p("断开后它马上读不到了。", "It loses access at once.")}</span>
                <button type="button" onClick={() => void revoke(app)}>{p("确认断开", "Confirm disconnect")}</button>
                <button type="button" onClick={() => setConfirming(null)}>{p("取消", "Cancel")}</button>
              </>
            ) : null}
          </div>
          {open === app.passId ? (
            <ul style={{ margin: "4px 0 0 16px", fontSize: 12 }}>
              {agentrixOauthScopeLinesV1(app.scopes).map((line) => <li key={line.en}>{say(line)}</li>)}
            </ul>
          ) : null}
        </div>
      ))}
      {notice ? <div role="status" style={hint}>{notice}</div> : null}
      {failure && desktopOauthAppsFailureText(failure, locale) ? <div role="status" style={hint}>{desktopOauthAppsFailureText(failure, locale)}</div> : null}
    </div>
  );
}

/** Settings entry, behind its own build switch. */
export default function AgentrixOauthAppsSection() {
  return agentrixOauthEnabled() ? <AgentrixOauthAppsPanel /> : null;
}
