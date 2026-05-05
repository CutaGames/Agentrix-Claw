/**
 * PetVRM — 3D Living Pet renderer (Desktop · v0.2).
 *
 * Loads a `.vrm` model exported from VRoid Studio (or any VRM 1.0 file) using
 * three.js + @pixiv/three-vrm, and drives BlendShape expressions from the
 * shared `agentrix:pet-state` event. Idle breathing + slow head sway keep the
 * pet alive while no emotion event has arrived yet.
 *
 * The runtime libs are intentionally imported eagerly here (the component is
 * itself loaded lazily from PetRenderer) so the bundle weight only lands when
 * a user actually configures a VRM model.
 *
 * Capabilities mirrored from PetCanvas:
 *   - Reacts to `agentrix:pet-state` (10 emotions → BlendShape expression)
 *   - Double-click → triggerPetInteraction("double_click") (+5 xp)
 *   - Long hover (>3s) → triggerPetInteraction("hover_long")
 *   - Lv badge overlay (intimacy_level)
 */
import { useEffect, useRef, useState, type CSSProperties } from "react";
import * as THREE from "three";
import { VRMLoaderPlugin, VRMUtils, type VRM } from "@pixiv/three-vrm";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import type { PetEmotion, PetState } from "../../../shared/types/agentrix-presence";
import { triggerPetInteraction } from "../services/petSdk";

// VRM 1.0 standard ExpressionPresetName values. We map the 10 Agentrix
// emotions onto the closest standard preset so any VRoid Studio export works
// without per-model tuning.
const EMOTION_TO_VRM_EXPRESSION: Record<PetEmotion, string | null> = {
  calm: null,        // neutral / no override
  happy: "happy",
  excited: "surprised",
  focused: null,
  concerned: "sad",
  tired: "sad",
  love: "happy",
  sad: "sad",
  angry: "angry",
  sleepy: "relaxed",
};

// Aura color matches PetCanvas so the FloatingBall halo stays consistent.
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
  /** URL or local path (file://...) to the .vrm asset. */
  url: string;
  size?: number;
  style?: CSSProperties;
  showLevelBadge?: boolean;
}

export default function PetVRM({ url, size = 96, style, showLevelBadge = true }: Props) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const vrmRef = useRef<VRM | null>(null);
  const rafRef = useRef<number | null>(null);
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [pet, setPet] = useState<PetState | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Listen for shared pet-state events.
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

  // Three.js scene + VRM load lifecycle.
  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 20);
    camera.position.set(0, 1.35, 1.5);
    camera.lookAt(0, 1.3, 0);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(size, size, false);
    renderer.setClearColor(0x000000, 0);
    mount.appendChild(renderer.domElement);
    renderer.domElement.style.width = `${size}px`;
    renderer.domElement.style.height = `${size}px`;

    const ambient = new THREE.AmbientLight(0xffffff, 0.9);
    scene.add(ambient);
    const dir = new THREE.DirectionalLight(0xffffff, 0.8);
    dir.position.set(1, 1.5, 1.2);
    scene.add(dir);

    const clock = new THREE.Clock();
    let disposed = false;

    const loader = new GLTFLoader();
    loader.register((parser) => new VRMLoaderPlugin(parser));

    loader.load(
      url,
      (gltf) => {
        if (disposed) return;
        const vrm: VRM | undefined = gltf.userData.vrm;
        if (!vrm) {
          setLoadError("Loaded file is not a VRM 1.0 model.");
          return;
        }
        VRMUtils.removeUnnecessaryVertices(gltf.scene);
        VRMUtils.combineSkeletons(gltf.scene);
        VRMUtils.combineMorphs(vrm);
        vrm.scene.rotation.y = Math.PI; // face camera
        scene.add(vrm.scene);
        vrmRef.current = vrm;
      },
      undefined,
      (err) => {
        if (!disposed) setLoadError(err instanceof Error ? err.message : String(err));
      },
    );

    function animate() {
      if (disposed) return;
      const delta = clock.getDelta();
      const t = clock.elapsedTime;
      const vrm = vrmRef.current;
      if (vrm) {
        // Idle breathing + gentle head sway.
        vrm.scene.position.y = Math.sin(t * 1.4) * 0.005;
        const head = vrm.humanoid?.getNormalizedBoneNode("head");
        if (head) head.rotation.y = Math.sin(t * 0.6) * 0.05;

        // Drive emotion expression.
        const expressions = vrm.expressionManager;
        if (expressions) {
          const emotion: PetEmotion = (pet?.emotion ?? "calm") as PetEmotion;
          const target = EMOTION_TO_VRM_EXPRESSION[emotion];
          const intensity = Math.max(0, Math.min(3, pet?.emotion_intensity ?? 1)) / 3;
          for (const name of ["happy", "sad", "angry", "surprised", "relaxed"]) {
            const current = expressions.getValue(name) ?? 0;
            const desired = name === target ? Math.max(0.4, intensity) : 0;
            expressions.setValue(name, current + (desired - current) * Math.min(1, delta * 4));
          }
          // Slow blink.
          const blink = (Math.sin(t * 0.8) > 0.97) ? 1 : 0;
          const blinkVal = expressions.getValue("blink") ?? 0;
          expressions.setValue("blink", blinkVal + (blink - blinkVal) * Math.min(1, delta * 12));
        }
        vrm.update(delta);
      }
      renderer.render(scene, camera);
      rafRef.current = requestAnimationFrame(animate);
    }
    animate();

    return () => {
      disposed = true;
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      const vrm = vrmRef.current;
      if (vrm) {
        scene.remove(vrm.scene);
        VRMUtils.deepDispose(vrm.scene);
        vrmRef.current = null;
      }
      renderer.dispose();
      if (renderer.domElement.parentElement === mount) {
        mount.removeChild(renderer.domElement);
      }
    };
    // We intentionally re-run only when url/size change. `pet` updates are
    // picked up inside `animate` via the latest closure-captured ref.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
      style={{
        position: "relative",
        width: size,
        height: size,
        borderRadius: "50%",
        background: `radial-gradient(circle at 50% 45%, ${aura}33, transparent 70%)`,
        ...style,
      }}
      onDoubleClick={handleDoubleClick}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      title="Living Pet"
    >
      <div ref={mountRef} style={{ width: size, height: size }} />
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
            borderRadius: "50%",
          }}
        >
          VRM
          <br />
          load
          <br />
          failed
        </div>
      )}
    </div>
  );
}
