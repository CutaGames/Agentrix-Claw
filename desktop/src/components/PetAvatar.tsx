/**
 * PetAvatar — lightweight static pet badge.
 *
 * Used in places where the heavyweight `PetRenderer` (three.js / Rive) would
 * be overkill: login screen logo, settings header, message bubbles, tray
 * tooltip cards, etc.
 *
 * Resolution order:
 *   1. Active VRM URL contains a known starter token → use that pet's emoji.
 *   2. Custom user-generated VRM exists → emoji 🐾 + first letter of name.
 *   3. Nothing stored → default 🐱 (the Neko starter, which is also the
 *      OnboardingPanel default).
 *
 * Re-renders automatically on `agentrix:pet-vrm-changed`.
 */
import { useEffect, useState, type CSSProperties } from "react";
import { ACTIVE_PET_VRM_KEY, ACTIVE_PET_NAME_KEY } from "../services/petCreator";

export interface PetAvatarSnapshot {
  emoji: string;
  name: string;
  url: string | null;
}

const STARTER_EMOJI: Array<[string, string, string]> = [
  // [url-token, emoji, default-name]
  ["starter-neko", "🐱", "Neko"],
  ["starter-shiba", "🐶", "Shiba"],
  ["starter-robo", "🤖", "Robo"],
];

export function readPetAvatarSnapshot(): PetAvatarSnapshot {
  let url: string | null = null;
  let name = "";
  try {
    url = localStorage.getItem(ACTIVE_PET_VRM_KEY);
    name = localStorage.getItem(ACTIVE_PET_NAME_KEY) || "";
  } catch {
    // localStorage unavailable (SSR / sandbox) — fall through to default.
  }

  if (url) {
    for (const [token, emoji, defaultName] of STARTER_EMOJI) {
      if (url.includes(token)) {
        return { emoji, name: name || defaultName, url };
      }
    }
    // Custom VRM (user generated) — use generic paw + first char of name.
    return { emoji: "🐾", name: name || "My Pet", url };
  }

  return { emoji: "🐱", name: name || "Neko", url: null };
}

interface Props {
  size?: number;
  style?: CSSProperties;
  /** When true, renders only the emoji glyph (no background gradient). */
  bare?: boolean;
}

export default function PetAvatar({ size = 56, style, bare = false }: Props) {
  const [snapshot, setSnapshot] = useState<PetAvatarSnapshot>(() => readPetAvatarSnapshot());

  useEffect(() => {
    const refresh = () => setSnapshot(readPetAvatarSnapshot());
    window.addEventListener("agentrix:pet-vrm-changed", refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener("agentrix:pet-vrm-changed", refresh);
      window.removeEventListener("storage", refresh);
    };
  }, []);

  if (bare) {
    return (
      <span
        aria-label={snapshot.name}
        title={snapshot.name}
        style={{ fontSize: size * 0.78, lineHeight: 1, ...style }}
      >
        {snapshot.emoji}
      </span>
    );
  }

  return (
    <div
      aria-label={snapshot.name}
      title={snapshot.name}
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        background:
          "radial-gradient(circle at 35% 30%, rgba(99,102,241,0.85), rgba(168,85,247,0.55) 60%, rgba(15,23,42,0.85) 100%)",
        boxShadow: "0 4px 18px rgba(99,102,241,0.35), inset 0 0 0 1px rgba(255,255,255,0.18)",
        fontSize: size * 0.55,
        lineHeight: 1,
        userSelect: "none",
        ...style,
      }}
    >
      {snapshot.emoji}
    </div>
  );
}
