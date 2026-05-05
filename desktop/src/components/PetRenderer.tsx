/**
 * PetRenderer — picks the best available Living Pet renderer.
 *
 * Order: VRM (if a `.vrm` URL is configured) → fallback SVG (PetCanvas).
 * The VRM renderer is code-split so the three.js + three-vrm bundle
 * (~700 KB) only loads when a user has actually configured a model.
 *
 * Configure a VRM via Settings → Living Pet → Import VRM (writes the
 * picked file path/URL into `localStorage.agentrix_pet_vrm_url`). Listen
 * for `agentrix:pet-vrm-changed` to refresh.
 */
import { lazy, Suspense, useEffect, useState, type CSSProperties } from "react";
import PetCanvas from "./PetCanvas";

const PetVRM = lazy(() => import("./PetVRM"));

interface Props {
  size?: number;
  style?: CSSProperties;
  showLevelBadge?: boolean;
}

function readVrmUrl(): string | null {
  try {
    const v = localStorage.getItem("agentrix_pet_vrm_url");
    return v && v.trim().length > 0 ? v.trim() : null;
  } catch {
    return null;
  }
}

export default function PetRenderer({ size, style, showLevelBadge }: Props) {
  const [vrmUrl, setVrmUrl] = useState<string | null>(() => readVrmUrl());

  useEffect(() => {
    function refresh() {
      setVrmUrl(readVrmUrl());
    }
    window.addEventListener("agentrix:pet-vrm-changed", refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener("agentrix:pet-vrm-changed", refresh);
      window.removeEventListener("storage", refresh);
    };
  }, []);

  if (vrmUrl) {
    return (
      <Suspense fallback={<PetCanvas size={size} style={style} showLevelBadge={showLevelBadge} />}>
        <PetVRM url={vrmUrl} size={size} style={style} showLevelBadge={showLevelBadge} />
      </Suspense>
    );
  }
  return <PetCanvas size={size} style={style} showLevelBadge={showLevelBadge} />;
}
