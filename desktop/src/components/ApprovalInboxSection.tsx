/**
 * ApprovalInboxSection — 桌面 D2 切片 6b："事项 → 待审批"。
 *
 * 一张列表里放这台电脑上所有等待决定的审批（后端状态 + 本机等待中的卡）。按钮按审批卡合同 v1：
 * - 本机发起、本机正在等的卡：批准、拒绝都在这里，本机确认为准；
 * - 其他卡：任何级别都能拒绝（过期也能）；L2 / L3 批准要这台电脑的设备签名，绑定电脑之前不给按钮。
 * 决定走 `decideDesktopApproval`，和聊天里的审批卡是同一条路。
 */
import { useCallback, useEffect, useState, type CSSProperties } from "react";
import {
  approvalInboxActions,
  getApprovalInboxSnapshot,
  subscribeApprovalInbox,
  type ApprovalInboxEntry,
} from "../services/approvalInbox";
import { decideDesktopApproval } from "../services/desktopApproval";
import { useAuthStore } from "../services/store";
import { useI18n } from "../i18n/I18nProvider";
import { fill } from "../i18n/strings";

export default function ApprovalInboxSection() {
  const { t } = useI18n();
  const token = useAuthStore((state) => state.token);
  const [entries, setEntries] = useState<ApprovalInboxEntry[]>(() => getApprovalInboxSnapshot());
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState("");

  const reload = useCallback(() => setEntries(getApprovalInboxSnapshot()), []);

  useEffect(() => {
    const off = subscribeApprovalInbox(reload);
    reload();
    return off;
  }, [reload]);

  const decide = async (entry: ApprovalInboxEntry, decision: "approved" | "rejected") => {
    setBusy(entry.approval.approvalId);
    setMessage("");
    try {
      const result = await decideDesktopApproval({ token, approval: entry.approval, decision });
      const verb = decision === "approved" ? t("approvals.approved") : t("approvals.rejected");
      if (result.synced) setMessage(verb);
      else {
        const syncKey = `approvals.sync.${result.reason || ""}`;
        const syncText = t(syncKey) === syncKey ? fill(t("approvals.sync.other"), { reason: result.reason || t("common.unknown") }) : t(syncKey);
        setMessage(`${verb}${t("common.sep")}${syncText}`);
      }
    } finally {
      setBusy(null);
      reload();
    }
  };

  return (
    <section style={box} aria-labelledby="approval-inbox-title" data-testid="approval-inbox">
      <h2 id="approval-inbox-title" style={title}>{t("approvals.title")}</h2>
      {entries.length === 0 && <div style={hint}>{t("approvals.empty")}</div>}
      {entries.length > 0 && (
        <ul style={list}>
          {entries.map((entry) => {
            const { approval } = entry;
            const actions = approvalInboxActions(approval);
            const blocked = actions.approveBlockedBy && actions.approveBlockedBy !== "decided" ? t(`approvals.blocked.${actions.approveBlockedBy}`) : "";
            return (
              <li key={approval.approvalId} style={item} data-testid={`approval-${approval.approvalId}`}>
                <div style={row}>
                  <span style={{ fontSize: 13 }}>{approval.title}</span>
                  <span style={badge}>{approval.riskLevel}{actions.status === "expired" ? ` · ${t("approvals.expiredTag")}` : ""}</span>
                </div>
                {approval.description && approval.description !== approval.title && <div style={hint}>{approval.description}</div>}
                {actions.localConfirmation && <div style={hint}>{t("approvals.localConfirmation")}</div>}
                {blocked && <div style={hint}>{blocked}</div>}
                <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
                  {actions.canApprove && (
                    <button type="button" style={approveButton} disabled={busy !== null} onClick={() => void decide(entry, "approved")}>
                      {t("approvals.approve")}
                    </button>
                  )}
                  {actions.canReject && (
                    <button type="button" style={button} disabled={busy !== null} onClick={() => void decide(entry, "rejected")}>
                      {t("approvals.reject")}
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {message && (
        <div role="status" style={hint} data-testid="approval-inbox-message">
          {message}
        </div>
      )}
    </section>
  );
}

const box: CSSProperties = {
  padding: 12,
  borderRadius: 8,
  border: "1px solid var(--border)",
  marginBottom: 12,
};

const title: CSSProperties = { fontSize: 13, fontWeight: 600, margin: 0 };

const hint: CSSProperties = {
  fontSize: 11,
  color: "var(--text-dim)",
  marginTop: 4,
  lineHeight: 1.5,
};

const list: CSSProperties = { listStyle: "none", margin: "8px 0 0", padding: 0 };
const item: CSSProperties = { padding: "8px 0", borderTop: "1px solid var(--border)" };
const row: CSSProperties = { display: "flex", justifyContent: "space-between", gap: 8, alignItems: "baseline" };
const badge: CSSProperties = { ...hint, marginTop: 0 };

const button: CSSProperties = {
  padding: "4px 12px",
  borderRadius: 6,
  border: "1px solid var(--border)",
  background: "var(--bg-elevated)",
  color: "var(--text)",
  fontSize: 12,
  cursor: "pointer",
};

const approveButton: CSSProperties = {
  ...button,
  border: "1px solid var(--accent)",
  color: "var(--accent)",
};
