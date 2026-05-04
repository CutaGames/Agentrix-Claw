/**
 * P0-W2-5 — PetEmotionOverlay (PRD agentrix-cross-platform-prd-v3 §3.4)
 *
 * Subscribes to `agentrix:pet-state` (forwarded from /presence WS topic
 * `presence:pet.state`) and renders a small emoji badge overlay near the
 * FloatingBall reflecting the 10-state pet emotion machine:
 *   calm / happy / excited / focused / concerned / tired
 *   plus celebrating / curious / sleepy / alert (extended)
 *
 * Decay is handled server-side; this component just reflects current state.
 */
import { useEffect, useState, type CSSProperties } from "react";
import type { PetEmotion, PetState } from "../../../shared/types/agentrix-presence";

const EMOTION_EMOJI: Record<PetEmotion, string> = {
  calm: "😌",
  happy: "😊",
  excited: "🤩",
  focused: "🧐",
  concerned: "😟",
  tired: "😴",
  love: "💖",
  sad: "😢",
  angry: "😠",
  sleepy: "💤",
};

const EMOTION_RING_COLOR: Record<PetEmotion, string> = {
  calm: "#94a3b8",
  happy: "#10b981",
  excited: "#f59e0b",
  focused: "#6366f1",
  concerned: "#ef4444",
  tired: "#64748b",
  love: "#ec4899",
  sad: "#0ea5e9",
  angry: "#dc2626",
  sleepy: "#475569",
};

interface Props {
  /** Position relative to its container (defaults to top-right of FloatingBall) */
  style?: CSSProperties;
  /** Show ring even when calm (default: false — calm is the resting state) */
  alwaysVisible?: boolean;
}

export default function PetEmotionOverlay({ style, alwaysVisible }: Props) {
  const [pet, setPet] = useState<PetState | null>(null);

  useEffect(() => {
    function handler(e: Event) {
      const detail = (e as CustomEvent).detail as PetState | undefined;
      if (detail && typeof detail === "object" && "emotion" in detail) {
        setPet(detail);
      }
    }
    window.addEventListener("agentrix:pet-state", handler);
    return () => window.removeEventListener("agentrix:pet-state", handler);
  }, []);

  if (!pet) return null;
  if (!alwaysVisible && pet.emotion === "calm" && (pet.emotion_intensity ?? 0) === 0) {
    return null;
  }

  const ring = EMOTION_RING_COLOR[pet.emotion] ?? "#94a3b8";
  const emoji = EMOTION_EMOJI[pet.emotion] ?? "😌";
  const intensity = Math.max(0, Math.min(3, pet.emotion_intensity ?? 1));

  return (
    <div
      title={`${pet.emotion} (intensity ${intensity}, lv ${pet.intimacy_level ?? 0})`}
      style={{
        position: "absolute",
        top: -2,
        right: -2,
        width: 22,
        height: 22,
        borderRadius: 11,
        background: "rgba(15,23,42,0.92)",
        border: `2px solid ${ring}`,
        boxShadow: `0 0 ${4 + intensity * 3}px ${ring}`,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: 12,
        pointerEvents: "none",
        zIndex: 10,
        ...style,
      }}
    >
      {emoji}
    </div>
  );
}
