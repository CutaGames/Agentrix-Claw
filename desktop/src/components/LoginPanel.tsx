/**
 * LoginPanel — 桌面登录（E84 A，owner 09-30 批准；`briefs/login-simplify-v1.md`）。
 *
 * 顺序：用手机扫码（默认）→ 在浏览器里登录 → 用邮箱验证码登录（放最后）。
 * Discord 和手动粘贴登录凭据收进"更多方式"。先逛逛照旧。
 * 浏览器登录的结果只从本机回调口拿，每次一个新的会话编号（REQ-desktop-040，`desktopLogin.ts`）；
 * E84 C 落地以后改成打开浏览器登录页、回调只带一次性 code。
 * E86：浏览器登录里列哪些服务商、邮箱验证码显不显示，按 `GET /api/auth/providers`；扫码一直在。
 */
import { useState, useEffect, useRef, useCallback, type CSSProperties } from "react";
import { QRCodeSVG } from "qrcode.react";
import { tauriFetch } from "../services/gatedHttp";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import agentrixLogo from "../assets/agentrix-logo.png";
import PetAvatar from "./PetAvatar";
import { API_BASE, useAuthStore } from "../services/store";
import { trackEvent } from "../services/analytics";
import { stagingApiOrigin } from "../services/apiTarget";
import { open as shellOpen } from "@tauri-apps/plugin-shell";
import {
  BROWSER_LOGIN_ERROR_TEXT,
  BROWSER_PROVIDER_LABEL,
  desktopLoginOptions,
  loadAuthProviders,
  newPairSessionId,
  openBrowserLogin,
  pairQrValue,
  type BrowserProvider,
  type DesktopLoginOptions,
} from "../services/desktopLogin";
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

type View = "main" | "email";

interface Props {
  onSuccess: () => void;
  onGuest: () => void;
}

const GOOGLE_ICON = (
  <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>
);

export default function LoginPanel({ onSuccess, onGuest }: Props) {
  const acceptToken = useAuthStore((state) => state.acceptToken);
  const [view, setView] = useState<View>("main");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [expired, setExpired] = useState(false);
  const [browserOpen, setBrowserOpen] = useState(false);
  // E86: null while GET /auth/providers is being read; the QR code does not wait for it.
  const [options, setOptions] = useState<DesktopLoginOptions | null>(null);
  const [browserMessage, setBrowserMessage] = useState("");
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** The pairing session being polled; null once it expired or login finished. */
  const liveSessionRef = useRef<string | null>(null);

  // Email login state
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [codeSent, setCodeSent] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [emailLoading, setEmailLoading] = useState(false);
  const [emailError, setEmailError] = useState("");

  const completeTokenLogin = useCallback(async (token: string, method: string = "qr") => {
    const nextToken = token.trim();
    if (!nextToken) return;

    if (pollRef.current) clearInterval(pollRef.current);
    if (timerRef.current) clearTimeout(timerRef.current);
    pollRef.current = null;
    liveSessionRef.current = null;

    await acceptToken(nextToken);
    trackEvent("desktop_login", { method });
    onSuccess();
  }, [acceptToken, onSuccess]);

  // Countdown timer for resend
  useEffect(() => {
    if (countdown <= 0) return;
    const t = setTimeout(() => setCountdown(countdown - 1), 1000);
    return () => clearTimeout(t);
  }, [countdown]);

  // Browser login: the result comes back through the local callback server (Rust emits it).
  useEffect(() => {
    let unlisten: (() => void) | null = null;
    listen<string>("auth-token-received", (event) => {
      const token = event.payload;
      if (token) {
        void completeTokenLogin(token, "callback");
      }
    }).then(fn => { unlisten = fn; });
    return () => { if (unlisten) unlisten(); };
  }, [completeTokenLogin]);

  // Manual token paste state
  const [manualToken, setManualToken] = useState("");
  const handleManualToken = useCallback(() => {
    const t = manualToken.trim();
    if (!t) return;
    void completeTokenLogin(t, "manual");
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
        setEmailError("验证码没有发出去，稍后再试");
      }
    } catch {
      setEmailError("连不上服务器，稍后再试");
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
          await completeTokenLogin(data.token, "email");
        }
      } else {
        setEmailError("验证码不对或已过期");
      }
    } catch {
      setEmailError("连不上服务器，稍后再试");
    } finally {
      setEmailLoading(false);
    }
  }, [email, code]);

  // Browser login (REQ-desktop-040): only through the local callback server, never the QR session.
  const handleBrowserLogin = useCallback(async (provider: BrowserProvider) => {
    setBrowserMessage("");
    const result = await openBrowserLogin({
      provider,
      apiBase: PAIR_API_BASE,
      startCallbackServer: () => invoke<number>("desktop_bridge_start_auth_callback_server"),
      open: async (url) => {
        try {
          await shellOpen(url);
        } catch {
          if (!window.open(url, "_blank")) throw new Error("open_failed");
        }
      },
    });
    setBrowserMessage(result.ok ? "已经在浏览器里打开了。登录完回到这里，会自动进入。" : BROWSER_LOGIN_ERROR_TEXT[result.reason]);
  }, []);

  const pollOnce = useCallback(async (id: string) => {
    try {
      const data = await pollPairSession(id);
      if (data?.token) await completeTokenLogin(data.token, "qr");
    } catch {
      // API not ready yet — silently continue polling
    }
  }, [completeTokenLogin]);

  /**
   * Poll every 2 s while the window is visible (E64: nothing runs for a hidden window).
   * A hidden window starts polling when it becomes visible again (see the effect below).
   */
  const startPolling = useCallback((id: string) => {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = null;
    if (typeof document !== "undefined" && document.hidden) return;
    pollRef.current = setInterval(() => void pollOnce(id), PAIR_POLL_INTERVAL);
  }, [pollOnce]);

  useEffect(() => {
    const onVisibility = () => {
      if (document.hidden) {
        if (pollRef.current) clearInterval(pollRef.current);
        pollRef.current = null;
        return;
      }
      const id = liveSessionRef.current;
      if (id && !pollRef.current) {
        // Back in view: check at once (the owner may have scanned meanwhile), then keep polling.
        void pollOnce(id);
        startPolling(id);
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [pollOnce, startPolling]);

  useEffect(() => {
    let alive = true;
    void loadAuthProviders({ apiBase: PAIR_API_BASE, fetchImpl: apiFetch }).then((response) => {
      if (alive) setOptions(desktopLoginOptions(response));
    });
    return () => {
      alive = false;
    };
  }, []);

  // Generate a pairing session ID, register with backend, and start polling
  const startPairSession = async () => {
    const id = newPairSessionId();
    setSessionId(id);
    setExpired(false);

    // Clear previous timers
    if (pollRef.current) clearInterval(pollRef.current);
    if (timerRef.current) clearTimeout(timerRef.current);
    pollRef.current = null;
    liveSessionRef.current = null;

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
    } catch (e) {
      console.warn('Desktop pair create error:', e);
      setExpired(true);
      throw e;
    }

    // Poll for token (note: tauriFetch .ok may not work, use .status)
    liveSessionRef.current = id;
    startPolling(id);

    // Expire after TTL
    timerRef.current = setTimeout(() => {
      if (pollRef.current) clearInterval(pollRef.current);
      pollRef.current = null;
      liveSessionRef.current = null;
      setExpired(true);
    }, Math.max(1000, expiresAt - Date.now()));

    return { sessionId: id, expiresAt };
  };

  useEffect(() => {
    startPairSession().catch(() => undefined);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [completeTokenLogin]);

  const refreshQr = () => {
    startPairSession().catch(() => undefined);
  };

  // QR code value: deep link for mobile app to scan
  const qrValue = sessionId
    ? pairQrValue({ siteOrigin: stagingApiOrigin() ?? "https://agentrix.top", sessionId, apiBase: PAIR_API_BASE })
    : "";

  return (
    <div style={container}>
      <div style={card}>
        <div style={{ textAlign: "center", marginBottom: 18 }}>
          <div style={logoWrap}>
            {/* P4: default avatar = pet (falls back to 🐱 Neko if no pet picked yet). */}
            <PetAvatar size={56} />
          </div>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: "var(--text)", margin: 0 }}>登录 Agentrix</h1>
          <p style={{ fontSize: 13, color: "var(--text-dim)", marginTop: 4 }}>用手机扫一下就好</p>
        </div>

        {view === "main" ? (
          <>
            <section aria-labelledby="login-qr-title" style={{ textAlign: "center" }} data-testid="login-qr-section">
              <h2 id="login-qr-title" style={sectionTitle}>用手机扫码</h2>
              <div style={qrContainer} data-testid="login-qr">
                {expired ? (
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 13, color: "#475569" }}>二维码已过期</span>
                    <button type="button" onClick={refreshQr} style={refreshBtn}>
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
                    title="用 Agentrix App 扫这个二维码登录"
                    imageSettings={{
                      src: agentrixLogo,
                      width: 32,
                      height: 32,
                      excavate: true,
                    }}
                  />
                ) : null}
              </div>
              <p style={hintCenter}>打开 Agentrix App → 扫一扫 → 确认登录</p>
            </section>

            {options && (options.browserPrimary.length > 0 || options.emailCode) && (
              <div style={divider} aria-hidden="true">或者</div>
            )}

            {options && options.browserPrimary.length > 0 && (
              <button
                type="button"
                style={secondaryBtn}
                aria-expanded={browserOpen}
                aria-controls="login-browser"
                onClick={() => setBrowserOpen((open) => !open)}
                data-testid="login-browser-toggle"
              >
                在浏览器里登录
              </button>
            )}
            {browserOpen && options && options.browserPrimary.length > 0 && (
              <div id="login-browser" style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 8 }}>
                {options.browserPrimary.map((provider) => (
                  <button
                    key={provider}
                    type="button"
                    onClick={() => void handleBrowserLogin(provider)}
                    style={oauthBtn}
                    data-testid={`login-browser-${provider}`}
                  >
                    {provider === "google" ? GOOGLE_ICON : null}
                    <span>{BROWSER_PROVIDER_LABEL[provider]}</span>
                  </button>
                ))}
                <p style={hintCenter}>会在系统浏览器里打开，登录完回到这里。</p>
              </div>
            )}
            {browserMessage && (
              <div role="status" style={hintCenter} data-testid="login-browser-message">
                {browserMessage}
              </div>
            )}

            {options?.emailCode && (
              <button type="button" style={linkBtn} onClick={() => setView("email")} data-testid="login-email-link">
                用邮箱验证码登录
              </button>
            )}

            <details style={moreBox} data-testid="login-more">
              <summary style={moreSummary}>更多方式</summary>
              <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 8 }}>
                {(options?.browserMore ?? []).map((provider) => (
                  <button
                    key={provider}
                    type="button"
                    onClick={() => void handleBrowserLogin(provider)}
                    style={oauthBtn}
                    data-testid={`login-more-${provider}`}
                  >
                    <span>{BROWSER_PROVIDER_LABEL[provider]}（在浏览器里）</span>
                  </button>
                ))}
                <label htmlFor="login-manual-token" style={hint}>手动粘贴登录凭据（网络有问题时用）</label>
                <div style={{ display: "flex", gap: 6 }}>
                  <input
                    id="login-manual-token"
                    type="text"
                    value={manualToken}
                    onChange={(e) => setManualToken(e.target.value)}
                    placeholder="粘贴到这里"
                    style={{ ...inputStyle, flex: 1, fontSize: 11, padding: "6px 8px" }}
                  />
                  <button
                    type="button"
                    onClick={handleManualToken}
                    disabled={!manualToken.trim()}
                    style={{ ...refreshBtn, fontSize: 11, padding: "6px 10px", opacity: manualToken.trim() ? 1 : 0.5 }}
                  >
                    登录
                  </button>
                </div>
              </div>
            </details>
          </>
        ) : (
          <section aria-labelledby="login-email-title" style={{ marginBottom: 12 }} data-testid="login-email-section">
            <h2 id="login-email-title" style={sectionTitle}>用邮箱验证码登录</h2>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <label htmlFor="login-email" style={hint}>邮箱</label>
              <input
                id="login-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                style={inputStyle}
                onKeyDown={(e) => e.key === "Enter" && !codeSent && handleSendCode()}
                autoFocus
              />
              {codeSent ? (
                <>
                  <label htmlFor="login-code" style={hint}>验证码</label>
                  <div style={{ display: "flex", gap: 8 }}>
                    <input
                      id="login-code"
                      type="text"
                      inputMode="numeric"
                      value={code}
                      onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                      placeholder="6 位数字"
                      maxLength={6}
                      style={{ ...inputStyle, flex: 1 }}
                      onKeyDown={(e) => e.key === "Enter" && code.length >= 4 && handleVerifyCode()}
                      autoFocus
                    />
                    <button
                      type="button"
                      onClick={handleSendCode}
                      disabled={countdown > 0 || emailLoading}
                      style={{ ...refreshBtn, fontSize: 12, padding: "8px 12px", opacity: countdown > 0 ? 0.5 : 1 }}
                    >
                      {countdown > 0 ? `${countdown} 秒` : "重新发送"}
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={handleVerifyCode}
                    disabled={code.length < 4 || emailLoading}
                    style={{ ...primaryBtn, marginTop: 0, opacity: code.length < 4 || emailLoading ? 0.5 : 1 }}
                  >
                    {emailLoading ? "正在登录…" : "登录"}
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={handleSendCode}
                  disabled={!email.trim() || emailLoading}
                  style={{ ...primaryBtn, marginTop: 0, opacity: !email.trim() || emailLoading ? 0.5 : 1 }}
                >
                  {emailLoading ? "正在发送…" : "发送验证码"}
                </button>
              )}
              {emailError && (
                <div role="alert" style={{ fontSize: 12, color: "var(--danger)" }}>{emailError}</div>
              )}
            </div>
            <button
              type="button"
              style={linkBtn}
              onClick={() => {
                setView("main");
                if (expired) refreshQr();
              }}
              data-testid="login-back-to-qr"
            >
              ← 回到扫码登录
            </button>
          </section>
        )}

        <div style={{ textAlign: "center", paddingTop: 12, marginTop: 12, borderTop: "1px solid var(--border)" }}>
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

          <button type="button" onClick={onGuest} style={guestBtn}>
            先逛逛 →
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
  boxShadow: "var(--shadow)",
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
  color: "var(--text-on-accent)",
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
  color: "var(--text-on-accent)",
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

const sectionTitle: CSSProperties = { fontSize: 13, fontWeight: 600, color: "var(--text)", margin: "0 0 10px" };

const hint: CSSProperties = { fontSize: 11, color: "var(--text-dim)", lineHeight: 1.5 };

const hintCenter: CSSProperties = { ...hint, textAlign: "center", marginTop: 8 };

const divider: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontSize: 11,
  color: "var(--text-dim)",
  margin: "14px 0 10px",
};

const secondaryBtn: CSSProperties = {
  width: "100%",
  padding: "10px",
  background: "var(--bg-input)",
  color: "var(--text)",
  border: "1px solid var(--border)",
  borderRadius: 8,
  fontSize: 14,
  fontWeight: 600,
  cursor: "pointer",
};

const linkBtn: CSSProperties = {
  display: "block",
  width: "100%",
  marginTop: 12,
  background: "none",
  border: "none",
  color: "var(--accent-light)",
  fontSize: 13,
  cursor: "pointer",
  padding: "4px 0",
  textAlign: "center",
};

const moreBox: CSSProperties = { marginTop: 8, textAlign: "left" };

const moreSummary: CSSProperties = { fontSize: 11, color: "var(--text-dim)", cursor: "pointer", userSelect: "none", textAlign: "center" };
