import { useEffect, useMemo, useState } from "react";
import {
  BUSINESS_EXPORT_COPY_V1 as COPY,
  businessExportFailureCopyV1,
  type BusinessExportClientV1,
  type BusinessExportFailureV1,
} from "../../../shared/client/account-export-business";
import type { L9CohortGateResultV1 } from "../../../shared/client/l9-cohort";
import type { BusinessExportCheckV1 } from "../../../shared/types/account-export-business";
import { createDesktopBusinessExportClient, readDesktopL9Cohort } from "../services/businessExport";
import { writeDesktopFile } from "../services/desktop";
import { API_BASE, apiFetch, useAuthStore } from "../services/store";
import { useI18n } from "../i18n/I18nProvider";

const box = { margin: "8px 0", padding: 10, borderRadius: 10, background: "rgba(255,255,255,0.04)" } as const;
const hint = { fontSize: 11, opacity: 0.7, lineHeight: 1.5 } as const;

const LABELS = {
  customers: { zh: "客户", en: "Customers" },
  answers: { zh: "问答", en: "Questions and answers" },
  introductions: { zh: "转介账", en: "Introduction ledger" },
  receipts: { zh: "回执", en: "Receipts" },
} as const;

export interface BusinessExportSectionProps {
  client?: BusinessExportClientV1;
  /** L9 P1-0: "am I in the list". Tests inject a fake; the app asks `GET /l9/cohort/me`. */
  cohortReader?: () => Promise<L9CohortGateResultV1>;
  /** Where the file goes. Tests inject a fake; the app asks with the save dialog and writes the file. */
  saveFile?: (fileName: string, text: string, title: string) => Promise<boolean>;
}

async function saveWithDialog(fileName: string, text: string, title: string): Promise<boolean> {
  const { save } = await import("@tauri-apps/plugin-dialog");
  const path = await save({ title, defaultPath: fileName, filters: [{ name: "JSON", extensions: ["json"] }] });
  if (!path) return false;
  await writeDesktopFile(path, text);
  return true;
}

/**
 * L9 P2-7: "Take your business data with you" — one button for the file (customers, questions and answers, introduction
 * ledger, receipts), one to count what is left after a deletion. Shows nothing until the L9 list says "in", and nothing
 * while the server switch is off (404).
 */
export function BusinessExportSection({ client, cohortReader, saveFile = saveWithDialog }: BusinessExportSectionProps) {
  const { locale } = useI18n();
  const lang = String(locale).startsWith("zh") ? "zh" : "en";
  const deps = useMemo(() => ({ fetch: apiFetch, apiBase: API_BASE, token: () => useAuthStore.getState().token }), []);
  const api = useMemo(() => client ?? createDesktopBusinessExportClient(deps), [client, deps]);
  const [cohort, setCohort] = useState<"loading" | L9CohortGateResultV1>("loading");
  const [state, setState] = useState<"idle" | "working" | "checking" | "closed">("idle");
  const [notice, setNotice] = useState("");
  const [check, setCheck] = useState<BusinessExportCheckV1 | null>(null);

  useEffect(() => {
    let live = true;
    const read = cohortReader ?? (() => readDesktopL9Cohort(deps));
    read()
      .then((gate) => {
        if (live) setCohort(gate);
      })
      .catch(() => {
        if (live) setCohort("out");
      });
    return () => {
      live = false;
    };
  }, [cohortReader, deps]);

  const fail = (failure: BusinessExportFailureV1) => {
    if (failure === "closed") {
      setState("closed");
      return;
    }
    const copy = businessExportFailureCopyV1(failure);
    setNotice(copy ? copy[lang] : "");
    setState("idle");
  };

  const run = async () => {
    setState("working");
    setNotice("");
    const result = await api.exportAll();
    if (result.ok === false) {
      fail(result.failure);
      return;
    }
    try {
      if (await saveFile(result.fileName, result.text, COPY.title[lang])) setNotice(COPY.done[lang]);
    } catch {
      setNotice(COPY.failed[lang]);
    }
    setState("idle");
  };

  const runCheck = async () => {
    setState("checking");
    setNotice("");
    const result = await api.check();
    if (result.ok === false) {
      setCheck(null);
      fail(result.failure);
      return;
    }
    setCheck(result.value);
    setState("idle");
  };

  if (cohort !== "in" || state === "closed") return null;
  const busy = state === "working" || state === "checking";
  return (
    <div style={box} data-testid="business-export">
      <div style={{ fontWeight: 600, fontSize: 13 }}>{COPY.title[lang]}</div>
      <div style={hint}>{COPY.scope[lang]}</div>
      <button type="button" style={{ marginTop: 6, fontSize: 12 }} disabled={busy} onClick={() => void run()} data-testid="business-export-take">
        {state === "working" ? COPY.working[lang] : COPY.action[lang]}
      </button>
      {notice ? <div role="status" style={hint}>{notice}</div> : null}

      <div style={{ fontWeight: 600, fontSize: 12, marginTop: 10 }}>{COPY.checkTitle[lang]}</div>
      <div style={hint}>{COPY.checkHelp[lang]}</div>
      <button type="button" style={{ marginTop: 6, fontSize: 12 }} disabled={busy} onClick={() => void runCheck()} data-testid="business-export-check">
        {state === "checking" ? COPY.checking[lang] : COPY.checkAction[lang]}
      </button>
      {check ? (
        <div role="status" style={hint} data-testid="business-export-check-result" data-verified-empty={check.verifiedEmpty ? "1" : "0"}>
          <div>{`${LABELS.customers[lang]}: ${check.counts.customers.active + check.counts.customers.deleted}`}</div>
          <div>{`${LABELS.answers[lang]}: ${check.counts.answers.privateTurns + check.counts.answers.decisions + check.counts.answers.reviewItems}`}</div>
          <div>{`${LABELS.introductions[lang]}: ${check.counts.introductions.introducer + check.counts.introductions.introduced}`}</div>
          <div>{`${LABELS.receipts[lang]}: ${check.counts.receipts}`}</div>
          {check.deletedStillHoldingContact > 0 ? <div>{COPY.checkHolding[lang]}</div> : null}
          <div style={{ fontWeight: 600 }} data-testid="business-export-check-verdict">
            {check.verifiedEmpty ? COPY.checkClean[lang] : check.unavailable.length > 0 ? COPY.checkUnread[lang] : COPY.checkLeft[lang]}
          </div>
        </div>
      ) : null}
    </div>
  );
}
