import { useState, useEffect, useRef, useCallback, type CSSProperties } from "react";
import { QRCodeSVG } from "qrcode.react";
import { fetch as tauriFetch } from "@tauri-apps/plugin-http";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import agentrixLogo from "../assets/agentrix-logo.png";
import { API_BASE, useAuthStore } from "../services/store";
import { open as shellOpen } from "@tauri-apps/plugin-shell";
const PAIR_POLL_INTERVAL = 2000;
const PAIR_TTL = 300_000; // Fallback until backend returns expiresAt
const DEFAULT_PAIR_API_BASE = "https://api.agentrix.top/api";
const LOOPBACK_API_BASE_RE = /^https?:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0)(:\d+)?(\/api)?$/i;

function resolvePairApiBase(base: string): string {
  return LOOPBACK_API_BASE_RE.test(base) ? DEFAULT_PAIR_API_BASE : base;
}

const PAIR_API_BASE = resolvePairApiBase(API_BASE);

// Use Tauri HTTP plugin to bypass CORS in WebView2
async function apiFetch(url: string, init?: RequestInit): Promise<Response> {
  try {
    return await tauriFetch(url, init as any);
  } catch {
    return await fetch(url, init);
  }
}

async function readPairPollResponse(response: Response): Promise<any | null> {
  const headerToken = response.headers.get("X-Agentrix-Pair-Token")
    || response.headers.get("x-agentrix-pair-token");
  const text = await response.text().catch(() => "");
  let payload: any = {};

  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = {};
    }
  }

  if (headerToken && !payload?.token) {
    payload = {
      ...payload,
      resolved: payload?.resolved ?? true,
      token: headerToken,
    };
  }

  return payload;
}

async function pollPairSession(sessionId: string): Promise<any | null> {
  const url = `${PAIR_API_BASE}/auth/desktop-pair/poll?session=${encodeURIComponent(sessionId)}`;

  const attempt = async (runner: () => Promise<Response>) => {
    const response = await runner();
    if (response.status < 200 || response.status >= 300) {
      return null;
    }
    return readPairPollResponse(response);
  };

  try {
    return await attempt(() => fetch(url, { cache: "no-store" }));
  } catch {
    // Fall through to Tauri HTTP plugin.
  }

  try {
    return await attempt(() => tauriFetch(url, {
      method: "GET",
      headers: { "Cache-Control": "no-store" },
    } as any));
  } catch {
    return null;
  }
}

type LoginTab = "qr" | "email" | "oauth";

interface Props {
  onSuccess: () => void;
  onGuest: () => void;
}

export default function LoginPanel({ onSuccess, onGuest }: Props) {
  const acceptToken = useAuthStore((state) => state.acceptToken);
  const [tab, setTab] = useState<LoginTab>("qr");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [expired, setExpired] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Email login state
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [codeSent, setCodeSent] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [emailLoading, setEmailLoading] = useState(false);
  const [emailError, setEmailError] = useState("");

  const completeTokenLogin = useCallback(async (token: string) => {
    const nextToken = token.trim();
    if (!nextToken) return;

    if (pollRef.current) clearInterval(pollRef.current);
    if (timerRef.current) clearTimeout(timerRef.current);

    await acceptToken(nextToken);
    onSuccess();
  }, [acceptToken, onSuccess]);

  // Countdown timer for resend
  useEffect(() => {
    if (countdown <= 0) return;
    const t = setTimeout(() => setCountdown(countdown - 1), 1000);
    return () => clearTimeout(t);
  }, [countdown]);

  // Listen for auth token from local OAuth callback server (loopback auth)
  useEffect(() => {
    let unlisten: (() => void) | null = null;
    listen<string>("auth-token-received", (event) => {
      const token = event.payload;
      if (token) {
        console.log("[LoginPanel] Received token via local auth callback");
        void completeTokenLogin(token);
      }
    }).then(fn => { unlisten = fn; });
    return () => { if (unlisten) unlisten(); };
  }, [completeTokenLogin]);

  // Manual token paste state
  const [manualToken, setManualToken] = useState("");
  const handleManualToken = useCallback(() => {
    const t = manualToken.trim();
    if (!t) return;
    void completeTokenLogin(t);
  }, [completeTokenLogin, manualToken]);

  const handleSendCode = useCallback(async () => {
    const trimmed = email.trim();
    if (!trimmed) return;
    setEmailLoading(true);
    setEmailError("");
    try {
      const res = await apiFetch(`${API_BASE}/auth/email/send-code`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: trimmed }),
      });
      if (res.status >= 200 && res.status < 300) {
        setCodeSent(true);
        setCountdown(60);
      } else {
        const text = await res.text().catch(() => "");
        setEmailError(text || "Failed to send code");
      }
    } catch (e: any) {
      setEmailError(e?.message || "Network error");
    } finally {
      setEmailLoading(false);
    }
  }, [email]);

  const handleVerifyCode = useCallback(async () => {
    const trimmedEmail = email.trim();
    const trimmedCode = code.trim();
    if (!trimmedEmail || !trimmedCode) return;
    setEmailLoading(true);
    setEmailError("");
    try {
      const res = await apiFetch(`${API_BASE}/auth/email/verify-code`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: trimmedEmail, code: trimmedCode }),
      });
      if (res.status >= 200 && res.status < 300) {
        const data = await res.json().catch(() => null);
        if (data?.token) {
          await completeTokenLogin(data.token);
        }
      } else {
        const text = await res.text().catch(() => "");
        setEmailError(text || "Invalid code");
      }
    } catch (e: any) {
      setEmailError(e?.message || "Network error");
    } finally {
      setEmailLoading(false);
    }
  }, [email, code]);

  // OAuth: open system browser to provider, use local loopback callback server
  const handleOAuth = useCallback(async (provider: "google" | "discord") => {
    let sid = sessionId;
    if (!sid || expired) {
      try {
        const created = await startPairSession();
        sid = created.sessionId;
      } catch (error) {
        // Session creation failed (likely proxy/network issue) — use a local-only ID
        sid = `desktop-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        console.warn('[LoginPanel] Session create failed, using local ID for OAuth:', sid);
      }
    }
    if (!sid) return;

    // Start local auth callback server (loopback redirect, bypasses proxy)
    let callbackPort: number | null = null;
    try {
      callbackPort = await invoke<number>("desktop_bridge_start_auth_callback_server");
      console.log('[LoginPanel] Local auth callback server on port', callbackPort);
    } catch (e) {
      console.warn('[LoginPanel] Could not start local auth server:', e);
    }

    let url = `${PAIR_API_BASE}/auth/${provider}?desktop_session=${encodeURIComponent(sid)}`;
    if (callbackPort) {
      url += `&callback_port=${callbackPort}`;
    }

    try {
      await shellOpen(url);
    } catch {
      window.open(url, "_blank");
    }
    // Switch to QR tab so user can see the polling is active
    setTab("qr");
  }, [sessionId, expired]);

  // Generate a pairing session ID, register with backend, and start polling
  const startPairSession = async () => {
    const id = `desktop-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    setSessionId(id);
    setExpired(false);

    // Clear previous timers
    if (pollRef.current) clearInterval(pollRef.current);
    if (timerRef.current) clearTimeout(timerRef.current);

    // Register session with backend (must use apiFetch for CORS bypass in Tauri)
    let expiresAt = Date.now() + PAIR_TTL;
    try {
      const createRes = await apiFetch(`${PAIR_API_BASE}/auth/desktop-pair/create`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: id }),
      });
      const createStatus = createRes.status;
      if (createStatus < 200 || createStatus >= 300) {
        throw new Error(`Desktop pair create failed: ${createStatus}`);
      }
      const raw = await createRes.text().catch(() => "");
      if (raw) {
        try {
          const payload = JSON.parse(raw);
          if (typeof payload?.expiresAt === "number") {
            expiresAt = payload.expiresAt;
          }
        } catch {}
      }
      console.log('[LoginPanel] Session created:', id);
    } catch (e) {
      console.warn('Desktop pair create error:', e);
      setExpired(true);
      throw e;
    }

    // Poll for token (note: tauriFetch .ok may not work, use .status)
    pollRef.current = setInterval(async () => {
      try {
        const data = await pollPairSession(id);
        if (!data) return;
        console.log('[LoginPanel] Poll response:', JSON.stringify(data));
        if (data.token) {
          console.log("[LoginPanel] Poll got token, transitioning...");
          await completeTokenLogin(data.token);
        }
      } catch {
        // API not ready yet — silently continue polling
      }
    }, PAIR_POLL_INTERVAL);

    // Expire after TTL
    timerRef.current = setTimeout(() => {
      if (pollRef.current) clearInterval(pollRef.current);
      setExpired(true);
    }, Math.max(1000, expiresAt - Date.now()));

    return { sessionId: id, expiresAt };
  };

  useEffect(() => {
    startPairSession();
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [completeTokenLogin]);

  // QR code value: deep link for mobile app to scan
  const qrValue = sessionId
    ? `https://agentrix.top/pair?session=${sessionId}&platform=desktop&api=${encodeURIComponent(PAIR_API_BASE)}`
    : "";

  return (
    <div style={container}>
      <div style={card}>
        {/* Logo + Title */}
        <div style={{ textAlign: "center", marginBottom: 20 }}>
          <div style={logoWrap}>
            <img src={agentrixLogo} alt="Agentrix" width={56} height={56} style={{ display: "block" }} />
          </div>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: "var(--text)", margin: 0 }}>
            Agentrix Desktop
          </h1>
          <p style={{ fontSize: 13, color: "var(--text-dim)", marginTop: 4 }}>
            Your AI Agent, always ready
          </p>
        </div>

        {/* Tab switcher */}
        <div style={tabBar}>
          <button
            onClick={() => { setTab("qr"); if (expired) startPairSession(); }}
            style={{ ...tabBtn, ...(tab === "qr" ? tabBtnActive : {}) }}
          >
            📱 扫码
          </button>
          <button
            onClick={() => setTab("email")}
            style={{ ...tabBtn, ...(tab === "email" ? tabBtnActive : {}) }}
          >
            📧 邮箱
          </button>
          <button
            onClick={() => setTab("oauth")}
            style={{ ...tabBtn, ...(tab === "oauth" ? tabBtnActive : {}) }}
          >
            🔗 第三方
          </button>
        </div>

        {/* QR Tab */}
        {tab === "qr" && (
          <div style={{ textAlign: "center", marginBottom: 16 }}>
            <div style={qrContainer}>
              {expired ? (
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 13, color: "var(--text-dim)" }}>二维码已过期</span>
                  <button onClick={startPairSession} style={refreshBtn}>
                    刷新二维码
                  </button>
                </div>
              ) : qrValue ? (
                <QRCodeSVG
                  value={qrValue}
                  size={160}
                  bgColor="#ffffff"
                  fgColor="#1a1a2e"
                  level="M"
                  imageSettings={{
                    src: agentrixLogo,
                    width: 32,
                    height: 32,
                    excavate: true,
                  }}
                />
              ) : null}
            </div>
            <p style={{ fontSize: 11, color: "var(--text-dim)", marginTop: 8 }}>
              打开 App → 扫一扫 → 确认登录
            </p>
          </div>
        )}

        {/* Email Tab */}
        {tab === "email" && (
          <div style={{ marginBottom: 16 }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="your@email.com"
                style={inputStyle}
                onKeyDown={(e) => e.key === "Enter" && !codeSent && handleSendCode()}
                autoFocus
              />
              {codeSent ? (
                <>
                  <div style={{ display: "flex", gap: 8 }}>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={code}
                      onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                      placeholder="6-digit code"
                      maxLength={6}
                      style={{ ...inputStyle, flex: 1 }}
                      onKeyDown={(e) => e.key === "Enter" && code.length >= 4 && handleVerifyCode()}
                      autoFocus
                    />
                    <button
                      onClick={handleSendCode}
                      disabled={countdown > 0 || emailLoading}
                      style={{
                        ...refreshBtn,
                        fontSize: 12,
                        padding: "8px 12px",
                        opacity: countdown > 0 ? 0.5 : 1,
                      }}
                    >
                      {countdown > 0 ? `${countdown}s` : "Resend"}
                    </button>
                  </div>
                  <button
                    onClick={handleVerifyCode}
                    disabled={code.length < 4 || emailLoading}
                    style={{
                      ...primaryBtn,
                      marginTop: 0,
                      opacity: code.length < 4 || emailLoading ? 0.5 : 1,
                    }}
                  >
                    {emailLoading ? "Verifying..." : "Log In"}
                  </button>
                </>
              ) : (
                <button
                  onClick={handleSendCode}
                  disabled={!email.trim() || emailLoading}
                  style={{
                    ...primaryBtn,
                    marginTop: 0,
                    opacity: !email.trim() || emailLoading ? 0.5 : 1,
                  }}
                >
                  {emailLoading ? "Sending..." : "Send Verification Code"}
                </button>
              )}
              {emailError && (
                <div style={{ fontSize: 12, color: "#f87171" }}>{emailError}</div>
              )}
            </div>
          </div>
        )}

        {/* OAuth Tab */}
        {tab === "oauth" && (
          <div style={{ marginBottom: 16 }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <button onClick={() => handleOAuth("google")} style={oauthBtn}>
                <svg width="18" height="18" viewBox="0 0 24 24"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>
                <span>Continue with Google</span>
              </button>
              <button onClick={() => handleOAuth("discord")} style={{ ...oauthBtn, borderColor: "#5865F2" }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="#5865F2"><path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/></svg>
                <span>Continue with Discord</span>
              </button>
              <p style={{ fontSize: 11, color: "var(--text-dim)", textAlign: "center", margin: "4px 0 0" }}>
                Will open in your browser for secure authentication
              </p>
            </div>
          </div>
        )}

        {/* Download prompt */}
        <div style={{ textAlign: "center", paddingTop: 12, borderTop: "1px solid var(--border)" }}>
          {/* Manual token paste (fallback for network issues) */}
          <details style={{ marginBottom: 10, textAlign: "left" }}>
            <summary style={{ fontSize: 11, color: "var(--text-dim)", cursor: "pointer", userSelect: "none" }}>
              🔑 手动粘贴 Token
            </summary>
            <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
              <input
                type="text"
                value={manualToken}
                onChange={(e) => setManualToken(e.target.value)}
                placeholder="Paste token here"
                style={{ ...inputStyle, flex: 1, fontSize: 11, padding: "6px 8px" }}
              />
              <button
                onClick={handleManualToken}
                disabled={!manualToken.trim()}
                style={{ ...refreshBtn, fontSize: 11, padding: "6px 10px", opacity: manualToken.trim() ? 1 : 0.5 }}
              >
                登录
              </button>
            </div>
          </details>

          <p style={{ fontSize: 12, color: "var(--text-dim)", margin: "0 0 8px", lineHeight: 1.6 }}>
            还没有 App？
          </p>
          <div style={{ display: "flex", gap: 12, justifyContent: "center", marginBottom: 16 }}>
            <a
              href="https://api.agentrix.top/downloads/clawlink-agent.apk"
              target="_blank"
              rel="noopener noreferrer"
              style={downloadBtn}
            >
              Android 下载
            </a>
            <a
              href="https://testflight.apple.com/"
              target="_blank"
              rel="noopener noreferrer"
              style={downloadBtn}
            >
              iOS TestFlight
            </a>
          </div>

          {/* Skip as Guest */}
          <button onClick={onGuest} style={guestBtn}>
            Skip as Guest →
          </button>
        </div>
      </div>
    </div>
  );
}

const container: CSSProperties = {
  width: "100%",
  height: "100%",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  background: "var(--bg-dark)",
};

const card: CSSProperties = {
  width: 380,
  padding: "28px 24px",
  background: "var(--bg-panel)",
  borderRadius: "var(--radius)",
  border: "1px solid var(--border)",
  boxShadow: "var(--shadow)",
};

const logoWrap: CSSProperties = {
  width: 56,
  height: 56,
  borderRadius: "50%",
  display: "inline-block",
  marginBottom: 10,
  boxShadow: "0 4px 20px rgba(108, 92, 231, 0.4)",
  overflow: "hidden",
};

const qrContainer: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 12,
  background: "#ffffff",
  borderRadius: 12,
  minWidth: 184,
  minHeight: 184,
};

const refreshBtn: CSSProperties = {
  padding: "6px 16px",
  background: "var(--accent)",
  color: "white",
  border: "none",
  borderRadius: 8,
  fontSize: 13,
  cursor: "pointer",
};

const downloadBtn: CSSProperties = {
  padding: "6px 14px",
  background: "transparent",
  color: "var(--accent-light)",
  border: "1px solid var(--accent-light)",
  borderRadius: 8,
  fontSize: 12,
  textDecoration: "none",
  cursor: "pointer",
  transition: "background 0.2s",
};

const guestBtn: CSSProperties = {
  background: "none",
  border: "none",
  color: "var(--text-dim)",
  fontSize: 12,
  cursor: "pointer",
  padding: "4px 0",
  opacity: 0.7,
  transition: "opacity 0.2s",
};

const tabBar: CSSProperties = {
  display: "flex",
  gap: 0,
  marginBottom: 16,
  borderRadius: 8,
  overflow: "hidden",
  border: "1px solid var(--border)",
};

const tabBtn: CSSProperties = {
  flex: 1,
  padding: "10px 0",
  background: "transparent",
  color: "var(--text-dim)",
  border: "none",
  fontSize: 13,
  fontWeight: 500,
  cursor: "pointer",
  transition: "background 0.2s, color 0.2s",
};

const tabBtnActive: CSSProperties = {
  background: "var(--accent)",
  color: "white",
};

const inputStyle: CSSProperties = {
  width: "100%",
  padding: "10px 14px",
  background: "var(--bg-input)",
  color: "var(--text)",
  border: "1px solid var(--border)",
  borderRadius: 8,
  fontSize: 14,
  outline: "none",
  boxSizing: "border-box",
};

const primaryBtn: CSSProperties = {
  width: "100%",
  padding: "10px",
  background: "var(--accent)",
  color: "white",
  border: "none",
  borderRadius: 8,
  fontSize: 14,
  fontWeight: 600,
  cursor: "pointer",
  marginTop: 4,
};

const oauthBtn: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 10,
  width: "100%",
  padding: "11px",
  background: "var(--bg-input)",
  color: "var(--text)",
  border: "1px solid var(--border)",
  borderRadius: 8,
  fontSize: 14,
  fontWeight: 500,
  cursor: "pointer",
  transition: "background 0.2s, border-color 0.2s",
};
