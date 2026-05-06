import { useEffect, useRef, useState, type CSSProperties } from "react";
import type { PetEmotion, PetState } from "../../../shared/types/agentrix-presence";
import { triggerPetInteraction } from "../services/petSdk";
import {
  fireRiveEmotionTrigger,
  measureRiveTransitionBudget,
  RIVE_EMOTION_TRANSITION_BUDGET_MS,
  RIVE_STATE_MACHINE_NAME,
  type RiveTriggerInputLike,
} from "../services/riveEmotionMap";

const EMOTION_AURA: Record<PetEmotion, string> = {
  calm: "#a78bfa",
  happy: "#34d399",
  excited: "#fbbf24",
  focused: "#818cf8",
  concerned: "#f87171",
  tired: "#94a3b8",
  love: "#f472b6",
  sad: "#60a5fa",
  angry: "#ef4444",
  sleepy: "#64748b",
};

interface Props {
  url: string;
  size?: number;
  style?: CSSProperties;
  showLevelBadge?: boolean;
}

interface PendingEmotion {
  emotion: string | undefined | null;
  receivedAtMs: number;
}

interface RiveInputLike {
  name: string;
  fire?: () => void;
}

interface RiveInstanceLike {
  cleanup?: () => void;
  resizeDrawingSurfaceToCanvas?: () => void;
  stateMachineInputs?: (stateMachineName: string) => RiveInputLike[];
}

function nowMs(): number {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}

function formatLoadError(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  return String(error);
}

function isTriggerInput(input: RiveInputLike): input is RiveTriggerInputLike {
  return typeof input.name === "string" && typeof input.fire === "function";
}

export default function PetRive({ url, size = 96, style, showLevelBadge = true }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const riveRef = useRef<RiveInstanceLike | null>(null);
  const inputsRef = useRef<RiveTriggerInputLike[]>([]);
  const petRef = useRef<PetState | null>(null);
  const pendingEmotionRef = useRef<PendingEmotion | null>(null);
  const [pet, setPet] = useState<PetState | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  function applyEmotion(emotion: string | undefined | null, receivedAtMs: number) {
    const inputs = inputsRef.current;
    if (inputs.length === 0) {
      pendingEmotionRef.current = { emotion, receivedAtMs };
      return;
    }

    const result = fireRiveEmotionTrigger(inputs, emotion);
    if (!result.fired) {
      setLoadError(`Missing Rive trigger: ${result.triggerName}`);
      return;
    }

    pendingEmotionRef.current = null;
    const transitionMs = measureRiveTransitionBudget(receivedAtMs);
    window.dispatchEvent(
      new CustomEvent("agentrix:pet-rive-transition", {
        detail: {
          emotion: result.resolvedEmotion,
          trigger: result.triggerName,
          transitionMs,
          withinBudget: transitionMs <= RIVE_EMOTION_TRANSITION_BUDGET_MS,
        },
      }),
    );
    setLoadError(null);
  }

  useEffect(() => {
    function onState(event: Event) {
      const detail = (event as CustomEvent).detail as PetState | undefined;
      if (!detail || typeof detail !== "object" || !("emotion" in detail)) return;
      petRef.current = detail;
      setPet(detail);
      applyEmotion(detail.emotion, nowMs());
    }

    window.addEventListener("agentrix:pet-state", onState);
    return () => {
      window.removeEventListener("agentrix:pet-state", onState);
    };
  }, []);

  useEffect(() => {
    let disposed = false;
    const canvas = canvasRef.current;
    if (!canvas) return;

    inputsRef.current = [];
    pendingEmotionRef.current = {
      emotion: petRef.current?.emotion ?? "calm",
      receivedAtMs: nowMs(),
    };
    setLoadError(null);

    async function loadRive() {
      try {
        const mod = await import("@rive-app/canvas");
        if (disposed || !canvasRef.current) return;

        const fit = (mod.Fit as Record<string, unknown> | undefined)?.Contain
          ?? (mod.Fit as Record<string, unknown> | undefined)?.contain;
        const alignment = (mod.Alignment as Record<string, unknown> | undefined)?.Center
          ?? (mod.Alignment as Record<string, unknown> | undefined)?.center;
        const LayoutCtor = mod.Layout as (new (options: Record<string, unknown>) => unknown) | undefined;
        const layout = LayoutCtor ? new LayoutCtor({ fit, alignment }) : undefined;
        const RiveCtor = mod.Rive as unknown as new (options: Record<string, unknown>) => RiveInstanceLike;

        const instance = new RiveCtor({
          src: url,
          canvas: canvasRef.current,
          autoplay: true,
          stateMachines: RIVE_STATE_MACHINE_NAME,
          ...(layout ? { layout } : {}),
          onLoad: () => {
            if (disposed) return;
            instance.resizeDrawingSurfaceToCanvas?.();
            inputsRef.current = (instance.stateMachineInputs?.(RIVE_STATE_MACHINE_NAME) ?? []).filter(isTriggerInput);
            const pending = pendingEmotionRef.current;
            applyEmotion(pending?.emotion ?? petRef.current?.emotion ?? "calm", pending?.receivedAtMs ?? nowMs());
          },
        });

        riveRef.current = instance;
      } catch (error) {
        if (!disposed) {
          setLoadError(formatLoadError(error));
        }
      }
    }

    void loadRive();

    function onResize() {
      riveRef.current?.resizeDrawingSurfaceToCanvas?.();
    }

    window.addEventListener("resize", onResize);
    return () => {
      disposed = true;
      window.removeEventListener("resize", onResize);
      inputsRef.current = [];
      pendingEmotionRef.current = null;
      riveRef.current?.cleanup?.();
      riveRef.current = null;
    };
  }, [url, size]);

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

  const emotion: PetEmotion = (pet?.emotion ?? "calm") as PetEmotion;
  const aura = EMOTION_AURA[emotion];
  const lv = pet?.intimacy_level ?? 0;

  return (
    <div
      data-testid="pet-rive"
      style={{
        position: "relative",
        width: size,
        height: size,
        borderRadius: "50%",
        overflow: "hidden",
        background: `radial-gradient(circle at 50% 45%, ${aura}33, transparent 70%)`,
        ...style,
      }}
      onDoubleClick={handleDoubleClick}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      title="Living Pet"
    >
      <canvas
        ref={canvasRef}
        width={size}
        height={size}
        style={{ width: size, height: size, display: "block" }}
      />
      {showLevelBadge && lv > 0 && (
        <div
          style={{
            position: "absolute",
            right: -2,
            bottom: -2,
            background: "rgba(15,23,42,0.85)",
            color: "#fff",
            fontSize: 10,
            lineHeight: 1,
            padding: "2px 5px",
            borderRadius: 8,
            border: "1px solid rgba(255,255,255,0.15)",
          }}
        >
          Lv{lv}
        </div>
      )}
      {loadError && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 9,
            color: "#fca5a5",
            textAlign: "center",
            padding: 4,
            background: "rgba(15,23,42,0.6)",
          }}
        >
          Rive
          <br />
          load
          <br />
          failed
        </div>
      )}
    </div>
  );
}