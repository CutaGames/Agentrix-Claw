import { Component, type ReactNode, type ErrorInfo } from "react";
import { API_BASE } from "../services/store";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
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
      return (
        <div style={containerStyle}>
          <div style={cardStyle}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>💥</div>
            <h2 style={{ margin: "0 0 8px", fontSize: 16, color: "var(--text, #e0e0e0)" }}>
              Something went wrong
            </h2>
            <p style={{ color: "var(--text-dim, #8a8a8a)", fontSize: 13, margin: "0 0 16px" }}>
              {this.state.error?.message || "An unexpected error occurred"}
            </p>
            <details style={{ marginBottom: 16, fontSize: 11, color: "var(--text-dim)", maxHeight: 200, overflow: "auto" }}>
              <summary style={{ cursor: "pointer", marginBottom: 8 }}>Stack trace</summary>
              <pre style={{ whiteSpace: "pre-wrap", wordBreak: "break-all" }}>
                {this.state.error?.stack}
                {"\n\nComponent Stack:\n"}
                {this.state.errorInfo?.componentStack}
              </pre>
            </details>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={this.handleReset} style={btnStyle}>
                Try Again
              </button>
              <button onClick={() => window.location.reload()} style={{ ...btnStyle, background: "transparent", border: "1px solid var(--border)" }}>
                Reload App
              </button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

async function reportCrash(error: Error, errorInfo: ErrorInfo) {
  const payload = {
    type: "frontend_crash",
    message: error.message,
    stack: error.stack,
    componentStack: errorInfo.componentStack,
    timestamp: new Date().toISOString(),
    url: window.location.href,
    userAgent: navigator.userAgent,
  };

  // Log locally
  console.error("[CrashReport]", payload);

  // Write to local crash log via Tauri
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    const logLine = JSON.stringify(payload);
    await invoke("desktop_bridge_log_debug_event", { message: `CRASH: ${logLine}` });
  } catch {
    // Not in Tauri
  }

  // Send to backend crash reporting endpoint (fire-and-forget)
  try {
    const token = localStorage.getItem("agentrix_auth_token");
    await fetch(`${API_BASE}/telemetry/crash`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(payload),
    });
  } catch {
    // Silently fail — crash reporting should never block the user
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
};
