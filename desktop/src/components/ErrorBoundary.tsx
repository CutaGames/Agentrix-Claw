import { Component, type ReactNode, type ErrorInfo } from "react";
import { reportCrash as queueCrash } from "../services/crashReport";
import { DEFAULT_LOCALE, LOCALES, translate, type Locale } from "../i18n/strings";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

/**
 * The boundary sits outside `I18nProvider` in `main.tsx`, so it reads the
 * app language the same way the provider does (stored choice, then the
 * system language). T7 r1: the crash page was English on a Chinese desktop.
 */
function boundaryLocale(): Locale {
  try {
    const stored = window.localStorage.getItem("agentrix-locale");
    if (stored && (LOCALES as readonly string[]).includes(stored)) return stored as Locale;
  } catch {
    // localStorage can be unavailable in some Tauri sandbox modes.
  }
  const nav = (typeof navigator !== "undefined" ? navigator.language || "" : "").slice(0, 2).toLowerCase();
  return (LOCALES as readonly string[]).includes(nav) ? (nav as Locale) : DEFAULT_LOCALE;
}

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null, errorInfo: null };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    this.setState({ errorInfo });
    // Report to crash reporting service
    reportCrash(error, errorInfo);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
  };

  render() {
    if (this.state.hasError) {
      const locale = boundaryLocale();
      const t = (key: string) => translate(locale, key);
      return (
        <div style={containerStyle} role="alert">
          <div style={cardStyle}>
            <h2 style={{ margin: "0 0 8px", fontSize: 16, color: "var(--text, #e0e0e0)" }}>
              {t("errorBoundary.title")}
            </h2>
            <p style={{ color: "var(--text-dim, #8a8a8a)", fontSize: 13, margin: "0 0 16px", lineHeight: 1.5 }}>
              {t("errorBoundary.body")}
            </p>
            <div style={{ display: "flex", gap: 8, justifyContent: "center", marginBottom: 16 }}>
              <button onClick={() => window.location.reload()} style={btnStyle}>
                {t("errorBoundary.reload")}
              </button>
              <button onClick={this.handleReset} style={secondaryBtnStyle}>
                {t("errorBoundary.retry")}
              </button>
            </div>
            {/* The raw message and stacks stay available, folded, for support. */}
            <details style={{ fontSize: 11, color: "var(--text-dim, #8a8a8a)", maxHeight: 200, overflow: "auto", textAlign: "left" }}>
              <summary style={{ cursor: "pointer", marginBottom: 8 }}>{t("errorBoundary.detail")}</summary>
              <pre style={{ whiteSpace: "pre-wrap", wordBreak: "break-all" }}>
                {this.state.error?.message}
                {"\n\n"}
                {this.state.error?.stack}
                {"\n\nComponent Stack:\n"}
                {this.state.errorInfo?.componentStack}
              </pre>
            </details>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

async function reportCrash(error: Error, errorInfo: ErrorInfo) {
  // Forward into the centralized queue (Sprint G-2 / US-G2-3) — sanitized,
  // dedup'd, batched on the server side.
  queueCrash("react_error", error, {
    location: (errorInfo.componentStack || "").split("\n", 2)[0]?.slice(0, 200) || null,
  });

  // Also write to the local Tauri debug log for forensic offline analysis.
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    const payload = {
      type: "frontend_crash",
      message: error.message,
      stack: error.stack,
      componentStack: errorInfo.componentStack,
      timestamp: new Date().toISOString(),
      url: window.location.href,
      userAgent: navigator.userAgent,
    };
    await invoke("desktop_bridge_log_debug_event", { message: `CRASH: ${JSON.stringify(payload)}` });
  } catch {
    // Not in Tauri / log channel unavailable — fine.
  }
}

const containerStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  width: "100%",
  height: "100%",
  background: "var(--bg-panel, #141926)",
  padding: 24,
};

const cardStyle: React.CSSProperties = {
  textAlign: "center",
  maxWidth: 400,
  padding: 32,
  borderRadius: 12,
  background: "var(--bg-dark, #0a0e17)",
  border: "1px solid var(--border)",
};

const btnStyle: React.CSSProperties = {
  padding: "8px 16px",
  borderRadius: 6,
  border: "none",
  background: "var(--accent, #6C5CE7)",
  color: "#fff",
  cursor: "pointer",
  fontSize: 13,
  fontWeight: 600,
  minHeight: 36,
};

// T7 r1: the second button used white text on a transparent background, so
// on the light card it was nearly invisible. It now takes the text colour.
const secondaryBtnStyle: React.CSSProperties = {
  ...btnStyle,
  background: "transparent",
  border: "1px solid var(--border, rgba(127,127,127,0.4))",
  color: "var(--text, #e0e0e0)",
};
