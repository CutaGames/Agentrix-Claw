/**
 * SplashScreen — minimal first-paint placeholder.
 *
 * Shown for ~200 ms before LoginPanel / OnboardingPanel mounts so the user
 * never sees a flash of empty / 80×80 invisible square at first launch.
 *
 * Pure CSS — no network, no fonts, no images. Fast even on cold WebView2.
 *
 * @see .kiro/specs/desktop-go-live/requirements.md US-G1-2
 */
import { useEffect, useState, type CSSProperties } from "react";

interface Props {
  /** Optional duration in ms. Default 200. The component unmounts itself after this. */
  durationMs?: number;
  /** Called when the splash finishes its minimum duration. */
  onDone?: () => void;
}

export default function SplashScreen({ durationMs = 200, onDone }: Props) {
  const [done, setDone] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDone(true);
      onDone?.();
    }, durationMs);
    return () => clearTimeout(timer);
  }, [durationMs, onDone]);

  if (done) return null;

  const containerStyle: CSSProperties = {
    position: "fixed",
    inset: 0,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    background: "linear-gradient(135deg, #0f172a 0%, #1e293b 100%)",
    color: "var(--text-card)",
    fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    zIndex: 9999,
    userSelect: "none",
  };

  return (
    <div style={containerStyle} data-testid="agentrix-splash">
      <style>{`
        @keyframes agentrix-splash-spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @keyframes agentrix-splash-pulse {
          0%, 100% { opacity: 0.6; }
          50% { opacity: 1; }
        }
      `}</style>
      <div
        style={{
          width: 48,
          height: 48,
          borderRadius: "50%",
          border: "3px solid rgba(167, 139, 250, 0.25)",
          borderTopColor: "#a78bfa",
          animation: "agentrix-splash-spin 0.9s linear infinite",
          marginBottom: 16,
        }}
      />
      <div
        style={{
          fontSize: 14,
          fontWeight: 600,
          letterSpacing: "0.04em",
          animation: "agentrix-splash-pulse 1.6s ease-in-out infinite",
        }}
      >
        Agentrix
      </div>
    </div>
  );
}
