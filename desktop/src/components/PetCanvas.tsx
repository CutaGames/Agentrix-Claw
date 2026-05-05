/**
 * PetCanvas — fallback Living Pet renderer (Desktop · v0.1).
 *
 * Renders an animated SVG pet that reacts to `agentrix:pet-state`. Used
 * until a real Live2D Cubism runtime + `.moc3` assets are licensed.
 *
 * Capabilities preserved here so the upgrade is drop-in:
 *   - 10 emotion → color + animation mapping (mirrors EMOTION_MOTION_MAP)
 *   - Double-click → triggerPetInteraction('double_click') (+5 xp on server)
 *   - Long hover (>3s) → triggerPetInteraction('hover_long')
 *   - Intimacy badge (Lv N) overlay
 */
import { useEffect, useRef, useState, type CSSProperties } from "react";
import type { PetEmotion, PetState } from "../../../shared/types/agentrix-presence";
import { triggerPetInteraction } from "../services/petSdk";

const EMOTION_PALETTE: Record<PetEmotion, { body: string; cheek: string; eye: string }> = {
  calm:      { body: "#a78bfa", cheek: "#fda4af", eye: "#1e293b" },
  happy:     { body: "#34d399", cheek: "#fda4af", eye: "#0f172a" },
  excited:   { body: "#fbbf24", cheek: "#fb7185", eye: "#1f2937" },
  focused:   { body: "#818cf8", cheek: "#a5b4fc", eye: "#0f172a" },
  concerned: { body: "#f87171", cheek: "#fecaca", eye: "#1f2937" },
  tired:     { body: "#94a3b8", cheek: "#cbd5e1", eye: "#334155" },
  love:      { body: "#f472b6", cheek: "#fda4af", eye: "#1f2937" },
  sad:       { body: "#60a5fa", cheek: "#bae6fd", eye: "#1e293b" },
  angry:     { body: "#ef4444", cheek: "#fca5a5", eye: "#0f172a" },
  sleepy:    { body: "#64748b", cheek: "#94a3b8", eye: "#1e293b" },
};

const EMOTION_ANIM: Record<PetEmotion, string> = {
  calm: "agentrix-pet-breathe 4s ease-in-out infinite",
  happy: "agentrix-pet-bounce 1.2s ease-in-out infinite",
  excited: "agentrix-pet-shake 0.4s ease-in-out infinite",
  focused: "agentrix-pet-breathe 6s ease-in-out infinite",
  concerned: "agentrix-pet-wobble 1s ease-in-out infinite",
  tired: "agentrix-pet-breathe 8s ease-in-out infinite",
  love: "agentrix-pet-bounce 1.6s ease-in-out infinite",
  sad: "agentrix-pet-droop 3s ease-in-out infinite",
  angry: "agentrix-pet-shake 0.25s ease-in-out infinite",
  sleepy: "agentrix-pet-breathe 9s ease-in-out infinite",
};

interface Props {
  size?: number;
  style?: CSSProperties;
  /** Show the Lv badge overlay (default: true). */
  showLevelBadge?: boolean;
}

export default function PetCanvas({ size = 96, style, showLevelBadge = true }: Props) {
  const [pet, setPet] = useState<PetState | null>(null);
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    function onState(e: Event) {
      const detail = (e as CustomEvent).detail as PetState | undefined;
      if (detail && typeof detail === "object" && "emotion" in detail) {
        setPet(detail);
      }
    }
    window.addEventListener("agentrix:pet-state", onState);
    return () => window.removeEventListener("agentrix:pet-state", onState);
  }, []);

  const emotion = pet?.emotion ?? "calm";
  const intensity = Math.max(0, Math.min(3, pet?.emotion_intensity ?? 0));
  const palette = EMOTION_PALETTE[emotion];
  const anim = EMOTION_ANIM[emotion];
  const lv = pet?.intimacy_level ?? 0;
  const eyeOpen = emotion !== "sleepy" && emotion !== "tired";

  function handleDoubleClick() {
    void triggerPetInteraction("double_click");
  }
  function handleMouseEnter() {
    hoverTimer.current = setTimeout(() => {
      void triggerPetInteraction("hover_long");
    }, 3000);
  }
  function handleMouseLeave() {
    if (hoverTimer.current) {
      clearTimeout(hoverTimer.current);
      hoverTimer.current = null;
    }
  }

  return (
    <div
      style={{
        position: "relative",
        width: size,
        height: size,
        cursor: "pointer",
        userSelect: "none",
        filter: `drop-shadow(0 0 ${4 + intensity * 4}px ${palette.body}66)`,
        ...style,
      }}
      onDoubleClick={handleDoubleClick}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      title={`${emotion} · intensity ${intensity} · Lv ${lv}`}
    >
      <style>{`
        @keyframes agentrix-pet-breathe {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.04); }
        }
        @keyframes agentrix-pet-bounce {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-6%); }
        }
        @keyframes agentrix-pet-shake {
          0%, 100% { transform: translateX(0) rotate(0); }
          25% { transform: translateX(-4%) rotate(-3deg); }
          75% { transform: translateX(4%) rotate(3deg); }
        }
        @keyframes agentrix-pet-wobble {
          0%, 100% { transform: rotate(-2deg); }
          50% { transform: rotate(2deg); }
        }
        @keyframes agentrix-pet-droop {
          0%, 100% { transform: translateY(0) scale(1); }
          50% { transform: translateY(4%) scale(0.98); }
        }
      `}</style>

      <svg
        viewBox="0 0 100 100"
        width={size}
        height={size}
        style={{ animation: anim, transformOrigin: "50% 60%" }}
      >
        {/* body */}
        <ellipse cx="50" cy="56" rx="34" ry="32" fill={palette.body} />
        {/* belly highlight */}
        <ellipse cx="50" cy="68" rx="20" ry="14" fill="#fff" opacity="0.18" />
        {/* cheeks */}
        <circle cx="30" cy="60" r="5" fill={palette.cheek} opacity="0.8" />
        <circle cx="70" cy="60" r="5" fill={palette.cheek} opacity="0.8" />
        {/* eyes */}
        {eyeOpen ? (
          <>
            <circle cx="38" cy="48" r="4" fill={palette.eye} />
            <circle cx="62" cy="48" r="4" fill={palette.eye} />
            <circle cx="39" cy="47" r="1.4" fill="#fff" />
            <circle cx="63" cy="47" r="1.4" fill="#fff" />
          </>
        ) : (
          <>
            <path d={`M 33 48 Q 38 52 43 48`} stroke={palette.eye} strokeWidth="2.5" fill="none" strokeLinecap="round" />
            <path d={`M 57 48 Q 62 52 67 48`} stroke={palette.eye} strokeWidth="2.5" fill="none" strokeLinecap="round" />
          </>
        )}
        {/* mouth */}
        {emotion === "sad" || emotion === "concerned" ? (
          <path d="M 42 70 Q 50 64 58 70" stroke={palette.eye} strokeWidth="2.4" fill="none" strokeLinecap="round" />
        ) : emotion === "angry" ? (
          <path d="M 40 72 L 60 72" stroke={palette.eye} strokeWidth="2.4" strokeLinecap="round" />
        ) : (
          <path d="M 42 68 Q 50 76 58 68" stroke={palette.eye} strokeWidth="2.4" fill="none" strokeLinecap="round" />
        )}
        {/* love sparkle */}
        {emotion === "love" && (
          <text x="72" y="32" fontSize="14" textAnchor="middle">💖</text>
        )}
        {/* sleepy z */}
        {emotion === "sleepy" && (
          <text x="74" y="30" fontSize="14" textAnchor="middle" fill={palette.eye}>z</text>
        )}
      </svg>

      {showLevelBadge && lv > 0 && (
        <div
          style={{
            position: "absolute",
            bottom: -2,
            right: -2,
            minWidth: 22,
            height: 18,
            padding: "0 5px",
            borderRadius: 9,
            background: "rgba(15,23,42,0.92)",
            border: `1px solid ${palette.body}`,
            color: "#fff",
            fontSize: 10,
            fontWeight: 700,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            pointerEvents: "none",
          }}
        >
          Lv{lv}
        </div>
      )}
    </div>
  );
}
