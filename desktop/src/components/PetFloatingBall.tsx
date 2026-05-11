/**
 * PetFloatingBall — Sprint D0 default desktop floating entry.
 *
 * Replaces the abstract purple <FloatingBall /> with an actual pet
 * renderer (VRM → Rive → SVG fallback). The pet EXPRESSES the same
 * states the old ball used to color-code:
 *
 *   - idle      → calm emotion, faded after 30s
 *   - recording → excited emotion + pulsing microphone ring
 *   - thinking  → focused emotion + shimmer
 *   - speaking  → happy emotion + speech wave
 *
 * All voice / clipboard / approval / drag / Pro-Mode interactions are
 * delegated to the existing <FloatingBall> via a thin wrapper — we
 * render the pet ON TOP of the ball's interaction surface, hiding the
 * ball's own visual. This keeps the (working, complex) interaction
 * code untouched while flipping the visual.
 *
 * Opt-out: users can disable this via Settings → Living Agent → "Use
 * abstract ball" (reads `agentrix_floating_mode` localStorage key).
 *
 * Per docs/DESKTOP_AUDIT_AND_REFACTOR_PLAN_2026-05 §D0.
 */
import { useEffect, useState } from "react";
import type { CSSProperties } from "react";
import PetRenderer from "./PetRenderer";
import FloatingBall from "./FloatingBall";
import PetHeadToast from "./PetHeadToast";
import CheckinModal from "./CheckinModal";
import SocialPanel from "./SocialPanel";
import CreatorStudioHub from "./CreatorStudioHub";
import { setLocalEmotion } from "../services/petSdk";

type BallState = "idle" | "recording" | "thinking" | "speaking";

interface Props {
  onTap: () => void;
  onOpenPro?: () => void;
  state?: BallState;
  /** When true, the pet visual is suppressed and the classic ball is shown. */
  forceAbstractBall?: boolean;
}

// Map the old ball state into the pet emotion machine. These emotions
// already exist in EMOTION_MOTION_MAP (petSdk.ts); we just borrow them.
const STATE_EMOTION: Record<BallState, { emotion: Parameters<typeof setLocalEmotion>[0]; intensity: 0 | 1 | 2 | 3 }> = {
  idle:      { emotion: "calm",    intensity: 0 },
  recording: { emotion: "excited", intensity: 2 },
  thinking:  { emotion: "focused", intensity: 2 },
  speaking:  { emotion: "happy",   intensity: 2 },
};

// Ring colors for each state — drawn as a soft halo behind the pet.
const STATE_HALO: Record<BallState, string> = {
  idle:      "rgba(108, 92, 231, 0.35)",
  recording: "rgba(16, 185, 129, 0.55)",
  thinking:  "rgba(245, 158, 11, 0.55)",
  speaking:  "rgba(59, 130, 246, 0.55)",
};

const BALL_SIZE = 80;

export default function PetFloatingBall({ onTap, onOpenPro, state = "idle", forceAbstractBall = false }: Props) {
  // Respect the user's opt-out preference at render time.
  const [abstractOverride, setAbstractOverride] = useState<boolean>(() => {
    try {
      return localStorage.getItem("agentrix_floating_mode") === "abstract";
    } catch {
      return false;
    }
  });
  const [checkinOpen, setCheckinOpen] = useState(false);
  const [socialOpen, setSocialOpen] = useState(false);
  const [socialTab, setSocialTab] = useState<"coraising" | "greeting" | "mimic">("mimic");
  const [studioOpen, setStudioOpen] = useState(false);

  // Listen for global "open check-in" / "open social" / "open studio" events (from right-click menu)
  useEffect(() => {
    const openCheckin = () => setCheckinOpen(true);
    const openSocial = (e: Event) => {
      const detail = (e as CustomEvent).detail as { tab?: "coraising" | "greeting" | "mimic" } | undefined;
      if (detail?.tab) setSocialTab(detail.tab);
      setSocialOpen(true);
    };
    const openStudio = () => setStudioOpen(true);
    window.addEventListener("agentrix:open-checkin", openCheckin);
    window.addEventListener("agentrix:open-social", openSocial);
    window.addEventListener("agentrix:open-creator-studio", openStudio);
    return () => {
      window.removeEventListener("agentrix:open-checkin", openCheckin);
      window.removeEventListener("agentrix:open-social", openSocial);
      window.removeEventListener("agentrix:open-creator-studio", openStudio);
    };
  }, []);

  useEffect(() => {
    const onChange = () => {
      try {
        setAbstractOverride(localStorage.getItem("agentrix_floating_mode") === "abstract");
      } catch {}
    };
    window.addEventListener("agentrix:floating-mode-changed", onChange);
    return () => window.removeEventListener("agentrix:floating-mode-changed", onChange);
  }, []);

  // Drive the pet's emotion from the ball state so the visual reflects
  // what the ball is doing (recording, thinking, speaking).
  useEffect(() => {
    const mapping = STATE_EMOTION[state];
    if (mapping) {
      setLocalEmotion(mapping.emotion, mapping.intensity);
    }
  }, [state]);

  // User opted out → show the classic abstract ball untouched.
  if (forceAbstractBall || abstractOverride) {
    return (
      <>
        <FloatingBall onTap={onTap} onOpenPro={onOpenPro} state={state} />
        <PetHeadToast />
        <CheckinModal visible={checkinOpen} onClose={() => setCheckinOpen(false)} />
        <SocialPanel visible={socialOpen} initialTab={socialTab} onClose={() => setSocialOpen(false)} />
        <CreatorStudioHub visible={studioOpen} onClose={() => setStudioOpen(false)} />
      </>
    );
  }

  const halo = STATE_HALO[state];

  return (
    <div style={hostStyle}>
      {/* The pet renderer sits on top; PetRenderer itself handles all
          asset loading + graceful fallback. */}
      <div style={petLayerStyle}>
        <PetRenderer size={BALL_SIZE - 8} style={petStyle} />
      </div>

      {/* Halo ring signals state (recording green / thinking amber / speaking blue). */}
      <div
        style={{
          ...haloStyle,
          boxShadow: `0 0 26px 8px ${halo}`,
          opacity: state === "idle" ? 0.5 : 1,
          transition: "opacity 220ms ease, box-shadow 220ms ease",
        }}
      />

      {/* The underlying FloatingBall provides all drag / click / long-press /
          right-click-menu / voice-pipeline behavior. We render it behind the
          pet with opacity 0 so interactions pass through to it. */}
      <div style={interactionLayerStyle}>
        <FloatingBall onTap={onTap} onOpenPro={onOpenPro} state={state} />
      </div>

      {/* AXP drift-in toast, positioned above the pet's head. */}
      <PetHeadToast />

      {/* Daily check-in modal, opened via right-click menu entry. */}
      <CheckinModal visible={checkinOpen} onClose={() => setCheckinOpen(false)} />

      {/* Social panel: co-raising / greeting / photo mimic. */}
      <SocialPanel visible={socialOpen} initialTab={socialTab} onClose={() => setSocialOpen(false)} />

      {/* Creator Studio: unified pet / video / wardrobe / mimic workbench. */}
      <CreatorStudioHub visible={studioOpen} onClose={() => setStudioOpen(false)} />
    </div>
  );
}

const hostStyle: CSSProperties = {
  position: "relative",
  width: BALL_SIZE,
  height: BALL_SIZE,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
};

const petLayerStyle: CSSProperties = {
  position: "absolute",
  inset: 0,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  zIndex: 2,
  // Block pointer events so drag/click flow through to the interaction
  // layer beneath — the pet is pure visual.
  pointerEvents: "none",
};

const petStyle: CSSProperties = {
  width: BALL_SIZE - 8,
  height: BALL_SIZE - 8,
  borderRadius: (BALL_SIZE - 8) / 2,
  overflow: "hidden",
  // Drop shadow softens the pet against varied desktop backgrounds.
  filter: "drop-shadow(0 4px 12px rgba(0,0,0,0.35))",
};

const haloStyle: CSSProperties = {
  position: "absolute",
  inset: 2,
  borderRadius: "50%",
  pointerEvents: "none",
  zIndex: 1,
};

const interactionLayerStyle: CSSProperties = {
  position: "absolute",
  inset: 0,
  zIndex: 3,
  // The FloatingBall draws a colored circle; we make it invisible but
  // still clickable/draggable.
  opacity: 0,
};
