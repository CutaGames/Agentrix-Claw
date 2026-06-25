/**
 * PetCanvas — Living Pet renderer (Desktop · v0.2 with real 3D kitsune).
 *
 * Renders the user's currently equipped pet skin (default: Kitsune Q-version).
 * Switches between 3 form variants based on app mode:
 *   - living-agent: 萌态 (round chibi, default for floating ball)
 *   - pro-mode:     专家态 (sleek, data streams)
 *   - economy-panel: 商人态 (with golden hat, holding gem)
 *
 * Emotion drives:
 *   - Aura color halo (calm=violet, happy=green, ...)
 *   - Animation (breathe, bounce, shake, ...)
 *   - Filter saturation/brightness
 *
 * 2026-05-15 upgrade:
 *   - SVG fallback → real kitsune PNG (豆包 + Hunyuan3D 生成)
 *   - Listens to `agentrix:app-mode-changed` to swap variant
 */
import { useEffect, useRef, useState, type CSSProperties } from "react";
import type { PetEmotion, PetState } from "../../../shared/types/agentrix-presence";
import type { DesktopAppMode } from "../../../shared/types/pet-skin-variant";
import { triggerPetInteraction, getAppMode } from "../services/petSdk";

// Aura color per emotion (drives the glow halo behind the pet image)
const EMOTION_AURA: Record<PetEmotion, string> = {
  calm:      "#a78bfa", // violet
  happy:     "#34d399", // green
  excited:   "#fbbf24", // gold
  focused:   "#818cf8", // indigo
  concerned: "#f87171", // red
  tired:     "#94a3b8", // gray
  love:      "#f472b6", // pink
  sad:       "#60a5fa", // blue
  angry:     "#ef4444", // bright red
  sleepy:    "#64748b", // slate
};

// Animation per emotion
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

// Filter per emotion (visual mood overlay on the kitsune image)
const EMOTION_FILTER: Record<PetEmotion, string> = {
  calm:      "saturate(1.0) brightness(1.0)",
  happy:     "saturate(1.2) brightness(1.05)",
  excited:   "saturate(1.4) brightness(1.1)",
  focused:   "saturate(0.95) brightness(0.98)",
  concerned: "saturate(0.7) brightness(0.95) hue-rotate(-15deg)",
  tired:     "saturate(0.5) brightness(0.85)",
  love:      "saturate(1.3) brightness(1.05) hue-rotate(15deg)",
  sad:       "saturate(0.6) brightness(0.9)",
  angry:     "saturate(1.5) brightness(1.0) hue-rotate(-25deg)",
  sleepy:    "saturate(0.4) brightness(0.8)",
};

// Default kitsune images for the 3 form variants. Path is served from the
// Tauri public dir (/pets/*) so it works in dev (vite) and production builds.
const KITSUNE_IMAGES: Record<DesktopAppMode, string> = {
  "living-agent":   "/pets/kitsune-default.png",
  "pro-mode":       "/pets/kitsune-pro.png",
  "economy-panel":  "/pets/kitsune-economy.png",
};

interface Props {
  size?: number;
  style?: CSSProperties;
  /** Show the Lv badge overlay (default: true). */
  showLevelBadge?: boolean;
  /** Override skin URL (e.g. for marketplace preview). If unset, uses appMode-driven default. */
  skinUrl?: string;
  /** Disable the drop-shadow aura halo. Used in pet-companion floating window
   *  to make the pet feel like a real creature rather than a UI card. */
  noHalo?: boolean;
}

export default function PetCanvas({ size = 96, style, showLevelBadge = true, skinUrl, noHalo = false }: Props) {
  const [pet, setPet] = useState<PetState | null>(null);
  const [appMode, setAppModeState] = useState<DesktopAppMode>(() => {
    try { return getAppMode(); } catch { return "living-agent"; }
  });
  const [imgError, setImgError] = useState(false);
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    function onState(e: Event) {
      const detail = (e as CustomEvent).detail as PetState | undefined;
      if (detail && typeof detail === "object" && "emotion" in detail) {
        setPet(detail);
      }
    }
    function onModeChanged(e: Event) {
      const detail = (e as CustomEvent).detail as { mode?: DesktopAppMode } | undefined;
      if (detail?.mode) setAppModeState(detail.mode);
    }
    window.addEventListener("agentrix:pet-state", onState);
    window.addEventListener("agentrix:app-mode-changed", onModeChanged);
    return () => {
      window.removeEventListener("agentrix:pet-state", onState);
      window.removeEventListener("agentrix:app-mode-changed", onModeChanged);
    };
  }, []);

  const emotion = pet?.emotion ?? "calm";
  const intensity = Math.max(0, Math.min(3, pet?.emotion_intensity ?? 0));
  const aura = EMOTION_AURA[emotion];
  const anim = EMOTION_ANIM[emotion];
  const filter = EMOTION_FILTER[emotion];
  const lv = pet?.intimacy_level ?? 0;

  const imageUrl = skinUrl || KITSUNE_IMAGES[appMode] || KITSUNE_IMAGES["living-agent"];

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
        // Aura halo behind the pet — disabled when rendered in the floating
        // pet-companion window so the pet feels like a real creature, not a
        // glowing UI card.
        filter: noHalo
          ? "none"
          : `drop-shadow(0 0 ${6 + intensity * 5}px ${aura}88) drop-shadow(0 0 ${2 + intensity * 2}px ${aura}aa)`,
        ...style,
      }}
      onDoubleClick={handleDoubleClick}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      title={`${emotion} · ${appMode} · Lv ${lv}`}
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

      {!imgError ? (
        <img
          src={imageUrl}
          alt="kitsune"
          width={size}
          height={size}
          draggable={false}
          onError={() => setImgError(true)}
          style={{
            width: size,
            height: size,
            objectFit: "contain",
            animation: anim,
            transformOrigin: "50% 60%",
            filter,
            transition: "filter 0.4s ease",
            pointerEvents: "none",
          }}
        />
      ) : (
        // Fallback SVG if image fails to load
        <svg viewBox="0 0 100 100" width={size} height={size} style={{ animation: anim, transformOrigin: "50% 60%" }}>
          <ellipse cx="50" cy="56" rx="34" ry="32" fill={aura} />
          <circle cx="38" cy="48" r="4" fill="#1e293b" />
          <circle cx="62" cy="48" r="4" fill="#1e293b" />
          <path d="M 42 68 Q 50 76 58 68" stroke="#1e293b" strokeWidth="2.4" fill="none" strokeLinecap="round" />
        </svg>
      )}

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
            background: "var(--bg-elevated)",
            border: `1px solid ${aura}`,
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
