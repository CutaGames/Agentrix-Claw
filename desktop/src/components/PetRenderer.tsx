/**
 * PetRenderer — picks the best available Living Pet renderer.
 *
 * Order: VRM → Rive → fallback SVG (PetCanvas).
 * The heavy renderers are code-split so the runtime bundle only lands when
 * a user has actually configured a matching asset.
 *
 * Configure a VRM via Settings → Living Pet → Import VRM (writes the
 * picked file path/URL into `localStorage.agentrix_pet_vrm_url`). Rive
 * manifests write `localStorage.agentrix_pet_rive_url`. Both changes are
 * bridged through the shared renderer refresh events.
 */
import { lazy, Suspense, useEffect, useState, type CSSProperties } from "react";
import { getActivePetRenderer, refreshPetRenderers, type PetRendererId } from "../services/petSdk";
import PetCanvas from "./PetCanvas";

const PetRive = lazy(() => import("./PetRive"));
const PetVRM = lazy(() => import("./PetVRM"));

interface Props {
  size?: number;
  style?: CSSProperties;
  showLevelBadge?: boolean;
}

interface RendererSnapshot {
  activeRendererId: PetRendererId;
  riveUrl: string | null;
  vrmUrl: string | null;
}

function readRendererUrl(key: string): string | null {
  try {
    const v = localStorage.getItem(key);
    return v && v.trim().length > 0 ? v.trim() : null;
  } catch {
    return null;
  }
}

function readRendererSnapshot(): RendererSnapshot {
  return {
    activeRendererId: getActivePetRenderer()?.id ?? "fallback",
    riveUrl: readRendererUrl("agentrix_pet_rive_url"),
    vrmUrl: readRendererUrl("agentrix_pet_vrm_url"),
  };
}

function pickRenderer(snapshot: RendererSnapshot): PetRendererId {
  if (snapshot.activeRendererId === "vrm" && snapshot.vrmUrl) return "vrm";
  if (snapshot.activeRendererId === "rive" && snapshot.riveUrl) return "rive";
  if (snapshot.vrmUrl) return "vrm";
  if (snapshot.riveUrl) return "rive";
  return "fallback";
}

export default function PetRenderer({ size, style, showLevelBadge }: Props) {
  const [snapshot, setSnapshot] = useState<RendererSnapshot>(() => readRendererSnapshot());

  useEffect(() => {
    let disposed = false;

    async function syncRenderer() {
      await refreshPetRenderers();
      if (!disposed) {
        setSnapshot(readRendererSnapshot());
      }
    }

    void syncRenderer();

    function refresh() {
      void syncRenderer();
    }
    window.addEventListener("agentrix:pet-vrm-changed", refresh);
    window.addEventListener("agentrix:pet-rive-changed", refresh);
    window.addEventListener("agentrix:pet-renderer-changed", refresh);
    window.addEventListener("storage", refresh);
    return () => {
      disposed = true;
      window.removeEventListener("agentrix:pet-vrm-changed", refresh);
      window.removeEventListener("agentrix:pet-rive-changed", refresh);
      window.removeEventListener("agentrix:pet-renderer-changed", refresh);
      window.removeEventListener("storage", refresh);
    };
  }, []);

  const activeRendererId = pickRenderer(snapshot);

  if (activeRendererId === "vrm" && snapshot.vrmUrl) {
    return (
      <Suspense fallback={<PetCanvas size={size} style={style} showLevelBadge={showLevelBadge} />}>
        <PetVRM url={snapshot.vrmUrl} size={size} style={style} showLevelBadge={showLevelBadge} />
      </Suspense>
    );
  }

  if (activeRendererId === "rive" && snapshot.riveUrl) {
    return (
      <Suspense fallback={<PetCanvas size={size} style={style} showLevelBadge={showLevelBadge} />}>
        <PetRive url={snapshot.riveUrl} size={size} style={style} showLevelBadge={showLevelBadge} />
      </Suspense>
    );
  }
  return <PetCanvas size={size} style={style} showLevelBadge={showLevelBadge} />;
}
