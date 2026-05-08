/**
 * PetProactiveBubble — Phase 6 S2
 *
 * Renders a small speech-bubble above the pet whenever the backend
 * `presence:pet.proactive` event arrives (forwarded by agentPresence as the
 * window event `agentrix:pet-proactive`).
 *
 * Behaviour
 * ---------
 * - Stacks at most 2 active bubbles (newer replaces oldest).
 * - Auto-dismiss after 12 s (calls /ack? no — auto-dismiss = soft, no API).
 * - "知道了" → POST /api/v1/pet/proactive/:id/ack (+ TTS stop)
 * - "不打扰我" → POST /api/v1/pet/proactive/:id/dismiss + 4h global mute.
 * - cta button → dispatches the event named in payload.cta.action and ack.
 * - TTS: speaks `title + body` once when the bubble appears, but only if
 *   the user has not muted TTS in localStorage `agentrix_proactive_tts`.
 */
import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";

interface ProactiveCta {
  label: string;
  action: string;
}
interface ProactivePayload {
  event_id: string;
  kind: string;
  title: string;
  body: string;
  cta?: ProactiveCta | null;
  intimacy_level?: number;
  sent_at?: number;
}

const AUTO_DISMISS_MS = 12_000;
const MAX_VISIBLE = 2;

const TTS_PREF_KEY = "agentrix_proactive_tts";
const ttsEnabled = () => {
  try {
    return localStorage.getItem(TTS_PREF_KEY) !== "off";
  } catch {
    return true;
  }
};

async function callPetProactive(path: string, init?: RequestInit) {
  try {
    const token = localStorage.getItem("agentrix_token") || "";
    const base =
      (import.meta as any).env?.VITE_API_BASE ||
      localStorage.getItem("agentrix_api_base") ||
      "https://api.agentrix.top";
    return await fetch(`${base}/api/v1/pet/proactive${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(init?.headers || {}),
      },
    });
  } catch (err) {
    console.warn("[pet-proactive] fetch failed", err);
    return null;
  }
}

function speak(text: string) {
  if (!ttsEnabled()) return;
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
  try {
    const u = new SpeechSynthesisUtterance(text);
    u.rate = 1.05;
    u.pitch = 1.1;
    u.volume = 0.85;
    u.lang = /[\u4e00-\u9fa5]/.test(text) ? "zh-CN" : "en-US";
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(u);
  } catch (err) {
    console.warn("[pet-proactive] tts failed", err);
  }
}

function stopSpeaking() {
  try {
    window.speechSynthesis?.cancel();
  } catch {
    /* noop */
  }
}

export default function PetProactiveBubble() {
  const [bubbles, setBubbles] = useState<ProactivePayload[]>([]);
  const dismissTimers = useRef<Map<string, number>>(new Map());

  const removeBubble = useCallback((eventId: string) => {
    setBubbles((prev) => prev.filter((b) => b.event_id !== eventId));
    const t = dismissTimers.current.get(eventId);
    if (t !== undefined) {
      window.clearTimeout(t);
      dismissTimers.current.delete(eventId);
    }
  }, []);

  const scheduleAutoDismiss = useCallback(
    (eventId: string) => {
      const handle = window.setTimeout(() => removeBubble(eventId), AUTO_DISMISS_MS);
      dismissTimers.current.set(eventId, handle);
    },
    [removeBubble],
  );

  useEffect(() => {
    const onProactive = (e: Event) => {
      const detail = (e as CustomEvent<ProactivePayload>).detail;
      if (!detail || !detail.event_id) return;
      setBubbles((prev) => {
        const next = [...prev.filter((b) => b.event_id !== detail.event_id), detail];
        return next.slice(-MAX_VISIBLE);
      });
      scheduleAutoDismiss(detail.event_id);
      speak(`${detail.title}. ${detail.body}`);
    };
    window.addEventListener("agentrix:pet-proactive", onProactive as EventListener);
    return () => {
      window.removeEventListener("agentrix:pet-proactive", onProactive as EventListener);
      dismissTimers.current.forEach((t) => window.clearTimeout(t));
      dismissTimers.current.clear();
      stopSpeaking();
    };
  }, [scheduleAutoDismiss]);

  const onAck = useCallback(
    async (b: ProactivePayload) => {
      stopSpeaking();
      removeBubble(b.event_id);
      await callPetProactive(`/${b.event_id}/ack`, { method: "POST" });
      if (b.cta?.action) {
        window.dispatchEvent(new CustomEvent(`agentrix:${b.cta.action}`));
      }
    },
    [removeBubble],
  );

  const onDismiss = useCallback(
    async (b: ProactivePayload) => {
      stopSpeaking();
      removeBubble(b.event_id);
      await callPetProactive(`/${b.event_id}/dismiss`, { method: "POST" });
      // soft mute 4h after explicit dismiss
      await callPetProactive(`/mute`, {
        method: "POST",
        body: JSON.stringify({ hours: 4 }),
      });
    },
    [removeBubble],
  );

  if (bubbles.length === 0) return null;

  const wrapStyle: CSSProperties = {
    position: "fixed",
    left: 8,
    bottom: 224,
    width: 220,
    display: "flex",
    flexDirection: "column-reverse",
    gap: 8,
    pointerEvents: "auto",
    zIndex: 10000,
  };

  return (
    <div style={wrapStyle} aria-live="polite">
      {bubbles.map((b) => (
        <div
          key={b.event_id}
          role="status"
          style={{
            background: "rgba(20,20,28,0.94)",
            color: "#fff",
            borderRadius: 12,
            padding: "10px 12px",
            boxShadow: "0 6px 20px rgba(0,0,0,0.45)",
            backdropFilter: "blur(10px)",
            fontSize: 12,
            lineHeight: 1.4,
            border: "1px solid rgba(255,255,255,0.08)",
            animation: "petBubbleIn 220ms ease-out",
          }}
        >
          <div style={{ fontWeight: 600, marginBottom: 4 }}>{b.title}</div>
          <div style={{ opacity: 0.85, marginBottom: 8 }}>{b.body}</div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {b.cta && (
              <button
                onClick={() => onAck(b)}
                style={pillBtn("#5b9dff", "#fff")}
              >
                {b.cta.label}
              </button>
            )}
            <button onClick={() => onAck(b)} style={pillBtn("rgba(255,255,255,0.08)", "#fff")}>
              知道了
            </button>
            <button onClick={() => onDismiss(b)} style={pillBtn("transparent", "#ff8a8a")}>
              别打扰
            </button>
          </div>
        </div>
      ))}
      <style>{`@keyframes petBubbleIn { from { opacity:0; transform:translateY(6px); } to { opacity:1; transform:translateY(0); } }`}</style>
    </div>
  );
}

function pillBtn(bg: string, color: string): CSSProperties {
  return {
    background: bg,
    color,
    border: "none",
    borderRadius: 999,
    padding: "5px 10px",
    fontSize: 11,
    cursor: "pointer",
    fontWeight: 500,
  };
}
