/**
 * PetHeadToast — drifting "+N AXP ✨" bubble rendered near the pet's head.
 *
 * Sprint DA. Mounted alongside <PetFloatingBall />. Also works when the
 * abstract-ball fallback is active (just floats above the ball).
 *
 * Visual: cyan gradient pill, drifts up + fades out over 2.4s. Multiple
 * queued earns stack vertically so rapid rewards don't overlap.
 */
import { useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { useAxpToastStore, type AxpToast } from "../services/axpToast";

const DURATION_MS = 2400;
const FADE_IN_MS = 260;
const FADE_OUT_MS = 380;

export default function PetHeadToast() {
  const queue = useAxpToastStore((s) => s.queue);
  const dismiss = useAxpToastStore((s) => s.dismiss);

  if (queue.length === 0) return null;

  return (
    <div style={hostStyle}>
      {queue.map((toast, idx) => (
        <Pill key={toast.id} toast={toast} offsetPx={idx * 40} onDone={dismiss} />
      ))}
    </div>
  );
}

function Pill({
  toast,
  offsetPx,
  onDone,
}: {
  toast: AxpToast;
  offsetPx: number;
  onDone: (id: string) => void;
}) {
  const [phase, setPhase] = useState<"in" | "hold" | "out">("in");
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    timerRef.current = setTimeout(() => setPhase("hold"), FADE_IN_MS);
    const t2 = setTimeout(
      () => setPhase("out"),
      DURATION_MS - FADE_OUT_MS,
    );
    const t3 = setTimeout(() => onDone(toast.id), DURATION_MS);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      clearTimeout(t2);
      clearTimeout(t3);
    };
  }, [toast.id, onDone]);

  const isEarn = toast.direction === "earn";
  const sign = isEarn ? "+" : "−";
  const opacity = phase === "in" || phase === "hold" ? 1 : 0;
  const translateY = phase === "in" ? 0 : phase === "hold" ? -14 : -32;

  return (
    <div
      onClick={() => onDone(toast.id)}
      style={{
        ...pillStyle,
        ...(isEarn ? pillEarn : pillSpend),
        top: -34 - offsetPx,
        opacity,
        transform: `translate(-50%, ${translateY}px)`,
        transition: "opacity 260ms ease, transform 260ms ease",
      }}
      role="alert"
      aria-label={`${sign}${toast.amount} AXP`}
    >
      {toast.emoji ? <span style={emojiStyle}>{toast.emoji}</span> : null}
      <span style={isEarn ? amountEarnStyle : amountSpendStyle}>
        {sign}
        {toast.amount.toLocaleString()} AXP
      </span>
      <span style={reasonStyle}>{toast.reason.zh || toast.reason.en}</span>
      <span style={sparkleStyle}>✨</span>
    </div>
  );
}

const hostStyle: CSSProperties = {
  position: "absolute",
  left: "50%",
  top: 0,
  pointerEvents: "none",
  zIndex: 10000,
};

const pillStyle: CSSProperties = {
  position: "absolute",
  left: 0,
  whiteSpace: "nowrap",
  display: "flex",
  alignItems: "center",
  gap: 6,
  padding: "6px 12px",
  borderRadius: 999,
  borderWidth: 1,
  borderStyle: "solid",
  fontSize: 12,
  pointerEvents: "auto",
  cursor: "pointer",
  backdropFilter: "blur(8px)",
};

const pillEarn: CSSProperties = {
  backgroundColor: "rgba(34,211,238,0.18)",
  borderColor: "rgba(34,211,238,0.6)",
  boxShadow: "0 4px 14px rgba(34,211,238,0.38)",
};

const pillSpend: CSSProperties = {
  backgroundColor: "rgba(251,191,36,0.18)",
  borderColor: "rgba(251,191,36,0.6)",
  boxShadow: "0 4px 14px rgba(251,191,36,0.32)",
};

const emojiStyle: CSSProperties = { fontSize: 14 };
const amountEarnStyle: CSSProperties = { fontWeight: 800, color: "#22d3ee" };
const amountSpendStyle: CSSProperties = { fontWeight: 800, color: "#fbbf24" };
const reasonStyle: CSSProperties = { color: "#e5e7eb", opacity: 0.9, maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis" };
const sparkleStyle: CSSProperties = { fontSize: 12 };
