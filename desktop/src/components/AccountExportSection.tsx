import { useEffect, useMemo, useState } from "react";
import { ACCOUNT_EXPORT_COPY_V2 as COPY, accountExportFailureCopyV2, type AccountExportClientV2 } from "../../../shared/client/account-export";
import type { L9RegulatedGateResultV1 } from "../../../shared/client/l9-regulated";
import { relationshipDncNoticeV1 } from "../../../shared/types/relationship-book";
import { createDesktopAccountExportClient } from "../services/accountExport";
import { readDesktopL9Regulated } from "../services/businessExport";
import { writeDesktopFile } from "../services/desktop";
import { API_BASE, apiFetch, useAuthStore } from "../services/store";
import { useI18n } from "../i18n/I18nProvider";

const box = { margin: "8px 0", padding: 10, borderRadius: 10, background: "rgba(255,255,255,0.04)" } as const;
const hint = { fontSize: 11, opacity: 0.7, lineHeight: 1.5 } as const;

/**
 * L8 2nd batch A8: "Export all my data" — one button, one JSON file the owner picks a place for.
 * Renders nothing while the server switch is off.
 */
export function AccountExportSection({ client, regulatedReader }: { client?: AccountExportClientV2; regulatedReader?: () => Promise<L9RegulatedGateResultV1> }) {
  const { locale } = useI18n();
  const lang = String(locale).startsWith("zh") ? "zh" : "en";
  const api = useMemo(
    () => client ?? createDesktopAccountExportClient({ fetch: apiFetch, apiBase: API_BASE, token: () => useAuthStore.getState().token }),
    [client],
  );
  const [state, setState] = useState<"idle" | "working" | "closed">("idle");
  const [notice, setNotice] = useState("");
  // L9.2 G6b: this file holds the relationship book with phone numbers, so a licensed-trade owner reads the DNC sentence on this
  // page too. Unreadable or not regulated: nothing is drawn and the page is what it was.
  const [regulated, setRegulated] = useState(false);
  useEffect(() => {
    let live = true;
    const read = regulatedReader ?? (() => readDesktopL9Regulated({ fetch: apiFetch, apiBase: API_BASE, token: () => useAuthStore.getState().token }));
    read()
      .then((answer) => {
        if (live) setRegulated(answer === "regulated");
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [regulatedReader]);
  const run = async () => {
    setState("working");
    setNotice("");
    const result = await api.exportAll();
    if (result.ok === false) {
      if (result.failure === "closed") {
        setState("closed");
        return;
      }
      const copy = accountExportFailureCopyV2(result.failure);
      setNotice(copy ? copy[lang] : "");
      setState("idle");
      return;
    }
    try {
      const { save } = await import("@tauri-apps/plugin-dialog");
      const path = await save({ title: COPY.title[lang], defaultPath: result.fileName, filters: [{ name: "JSON", extensions: ["json"] }] });
      if (path) {
        await writeDesktopFile(path, result.text);
        setNotice(COPY.done[lang]);
      }
    } catch {
      setNotice(COPY.failed[lang]);
    }
    setState("idle");
  };

  if (state === "closed") return null;
  return (
    <div style={box} data-testid="account-export">
      <div style={{ fontWeight: 600, fontSize: 13 }}>{COPY.title[lang]}</div>
      <div style={hint}>{COPY.scope[lang]}</div>
      {relationshipDncNoticeV1(lang, regulated) ? <div style={hint} data-testid="account-export-dnc">{relationshipDncNoticeV1(lang, regulated)}</div> : null}
      <button type="button" style={{ marginTop: 6, fontSize: 12 }} disabled={state === "working"} onClick={() => void run()}>
        {state === "working" ? COPY.working[lang] : COPY.action[lang]}
      </button>
      {notice ? <div role="status" style={hint}>{notice}</div> : null}
    </div>
  );
}
