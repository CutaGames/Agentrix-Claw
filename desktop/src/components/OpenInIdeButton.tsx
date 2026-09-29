// Sprint Pro Mode Coding Views (2026-05-24) — F1.
//
// Pro Mode-only button that opens a workspace file in Cursor / VS Code via
// the existing `ideBridge` Tauri command. Hidden in Simple / Standard.
//
// See:
//   - `.kiro/specs/pro-mode-coding-views-2026-05/requirements.md` Req 2
//   - `desktop/src/services/ideBridge.ts`
//   - `docs/agentrix-positioning-2026-05.zh-CN.md` §3.4 (C_Path coding parity)

import { useCallback, useEffect, useRef, useState } from "react";
import { openInIde, type SupportedIdeTarget } from "../services/ideBridge";
import { useIsProMode } from "../services/userMode";

const LS_KEY = "agentrix_ide_target";

function readPersistedTarget(): SupportedIdeTarget {
  try {
    const raw = (typeof localStorage !== "undefined" && localStorage.getItem(LS_KEY)) || "";
    return raw === "vscode" ? "vscode" : "cursor";
  } catch {
    return "cursor";
  }
}

function persistTarget(target: SupportedIdeTarget) {
  try {
    if (typeof localStorage !== "undefined") localStorage.setItem(LS_KEY, target);
  } catch { /* ignore quota errors */ }
}

interface Props {
  path: string;
  line?: number;
  column?: number;
  /** Optional className override for outer wrapper. */
  className?: string;
  /** Compact mode: render only the icon (no label). */
  compact?: boolean;
}

/**
 * Renders a small "Open in IDE" button with a chevron menu that lets the
 * user pick Cursor or VS Code (persisted to localStorage).
 *
 * Returns `null` when the user is not in Pro Mode — this is the central
 * gate that enforces "Pro Mode coding views are Pro-only" per positioning
 * §3.3 / §3.4.
 */
export default function OpenInIdeButton({ path, line, column, className, compact }: Props) {
  const isPro = useIsProMode();
  const [target, setTarget] = useState<SupportedIdeTarget>(readPersistedTarget);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  // Click-outside dismiss for the chevron menu.
  useEffect(() => {
    if (!menuOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (!menuRef.current) return;
      if (!menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [menuOpen]);

  // Auto-clear error tooltip after 3s.
  useEffect(() => {
    if (!error) return;
    const t = setTimeout(() => setError(null), 3000);
    return () => clearTimeout(t);
  }, [error]);

  const handleOpen = useCallback(async () => {
    if (pending) return;
    setPending(true);
    setError(null);
    try {
      await openInIde({ path, line, column, editor: target });
    } catch (err: any) {
      const msg = typeof err?.message === "string" ? err.message : String(err);
      // Surface a user-friendly tooltip; keep raw message internal.
      if (/not\s*found|没找到|未安装|cursor|code/i.test(msg)) {
        setError("未找到 Cursor / VS Code 安装");
      } else {
        setError("打开失败,请检查 IDE 是否运行");
      }
    } finally {
      setPending(false);
    }
  }, [pending, path, line, column, target]);

  const handleSelectTarget = useCallback((next: SupportedIdeTarget) => {
    setTarget(next);
    persistTarget(next);
    setMenuOpen(false);
  }, []);

  if (!isPro) return null;

  const label = compact ? "" : (target === "vscode" ? "在 VS Code 打开" : "在 Cursor 打开");
  const icon = target === "vscode" ? "🔵" : "✒️";

  return (
    <span
      className={className}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        position: "relative",
        fontSize: 12,
      }}
    >
      <button
        type="button"
        onClick={handleOpen}
        disabled={pending}
        aria-label={`Open ${path} in ${target === "vscode" ? "VS Code" : "Cursor"}`}
        title={error || `${target === "vscode" ? "VS Code" : "Cursor"}: ${path}${line ? `:${line}` : ""}`}
        style={{
          background: "var(--surface-2, rgba(120, 120, 140, 0.12))",
          color: "var(--text-1, inherit)",
          border: "1px solid var(--border-subtle, rgba(120, 120, 140, 0.3))",
          borderRadius: 4,
          padding: compact ? "2px 4px" : "2px 8px",
          cursor: pending ? "wait" : "pointer",
          opacity: pending ? 0.6 : 1,
        }}
      >
        <span aria-hidden="true">{icon}</span>
        {label && <span style={{ marginLeft: 4 }}>{label}</span>}
      </button>
      <div ref={menuRef} style={{ position: "relative" }}>
        <button
          type="button"
          onClick={() => setMenuOpen((v) => !v)}
          aria-label="Choose IDE target"
          aria-expanded={menuOpen}
          style={{
            background: "transparent",
            color: "var(--text-2, inherit)",
            border: "1px solid var(--border-subtle, rgba(120, 120, 140, 0.3))",
            borderRadius: 4,
            padding: "2px 4px",
            cursor: "pointer",
            fontSize: 10,
          }}
        >
          ▾
        </button>
        {menuOpen && (
          <ul
            role="menu"
            style={{
              position: "absolute",
              top: "calc(100% + 2px)",
              right: 0,
              background: "var(--surface-1, #fff)",
              color: "var(--text-1, inherit)",
              border: "1px solid var(--border-subtle, rgba(120, 120, 140, 0.3))",
              borderRadius: 6,
              listStyle: "none",
              margin: 0,
              padding: 4,
              minWidth: 120,
              zIndex: 30,
              boxShadow: "0 4px 12px rgba(0,0,0,0.12)",
            }}
          >
            <li role="menuitem">
              <button
                type="button"
                onClick={() => handleSelectTarget("cursor")}
                style={{
                  width: "100%",
                  textAlign: "left",
                  background: target === "cursor" ? "var(--surface-2, rgba(120,120,140,0.12))" : "transparent",
                  color: "inherit",
                  border: "none",
                  borderRadius: 4,
                  padding: "4px 8px",
                  cursor: "pointer",
                  fontSize: 12,
                }}
              >
                ✒️ Cursor {target === "cursor" ? "✓" : ""}
              </button>
            </li>
            <li role="menuitem">
              <button
                type="button"
                onClick={() => handleSelectTarget("vscode")}
                style={{
                  width: "100%",
                  textAlign: "left",
                  background: target === "vscode" ? "var(--surface-2, rgba(120,120,140,0.12))" : "transparent",
                  color: "inherit",
                  border: "none",
                  borderRadius: 4,
                  padding: "4px 8px",
                  cursor: "pointer",
                  fontSize: 12,
                }}
              >
                🔵 VS Code {target === "vscode" ? "✓" : ""}
              </button>
            </li>
          </ul>
        )}
      </div>
      {error && (
        <span
          role="alert"
          style={{
            color: "var(--danger, #c33)",
            fontSize: 11,
            marginLeft: 4,
          }}
        >
          {error}
        </span>
      )}
    </span>
  );
}
