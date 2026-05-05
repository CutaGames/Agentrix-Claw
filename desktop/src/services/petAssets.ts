/**
 * Pet asset cache (Desktop · v0.1).
 *
 * Resolves blocker §5 (offline / distribution strategy) from
 * docs/DESKTOP_LIVE2D_BLOCKERS_20260505.zh-CN.md.
 *
 * Today the desktop runs without any `.moc3` assets — the fallback SVG
 * renderer is always usable. This module defines the manifest contract
 * and graceful degradation rules so a future Live2D bundle can be plugged
 * in without code churn.
 *
 * Manifest format (served by backend or bundled at build time):
 *
 * {
 *   "version": "2026-05-05",
 *   "assets": [
 *     { "id": "default-pet", "url": "https://cdn.agentrix.top/pets/default/default.zip",
 *       "sha256": "...", "sizeBytes": 4321000, "license": "free" }
 *   ]
 * }
 *
 * The cache is intentionally small — each asset is a single zip pinned by
 * sha256. Verification + extraction is delegated to the Tauri backend
 * (Rust) once the runtime arrives; this TS layer just owns the manifest.
 */

const STORAGE_KEY = "agentrix_pet_assets_state";

export interface PetAssetDescriptor {
  id: string;
  url: string;
  sha256: string;
  sizeBytes: number;
  license: "free" | "commercial" | "premium";
}

export interface PetAssetManifest {
  version: string;
  assets: PetAssetDescriptor[];
}

export interface PetAssetState {
  /** Last manifest version we are aware of. */
  manifestVersion: string | null;
  /** Asset ids that are downloaded + verified locally. */
  ready: string[];
  /** Asset ids the user has explicitly opted out of. */
  optedOut: string[];
}

export function readAssetState(): PetAssetState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { manifestVersion: null, ready: [], optedOut: [] };
    const parsed = JSON.parse(raw);
    return {
      manifestVersion: parsed.manifestVersion ?? null,
      ready: Array.isArray(parsed.ready) ? parsed.ready : [],
      optedOut: Array.isArray(parsed.optedOut) ? parsed.optedOut : [],
    };
  } catch {
    return { manifestVersion: null, ready: [], optedOut: [] };
  }
}

export function writeAssetState(state: PetAssetState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* storage quota — non-fatal, fallback renderer keeps working */
  }
}

/**
 * Decide which renderer to use right now based on local asset state.
 * Today this always returns 'fallback' because no Live2D assets ship
 * with the build. When a real Live2D bundle is installed (id present in
 * `ready`), this will return 'live2d'.
 */
export function pickPetRendererId(state: PetAssetState = readAssetState()): "live2d" | "fallback" {
  return state.ready.includes("default-pet") ? "live2d" : "fallback";
}

export function markAssetReady(id: string): void {
  const s = readAssetState();
  if (!s.ready.includes(id)) {
    s.ready = [...s.ready, id];
    writeAssetState(s);
  }
}

export function optOutAsset(id: string): void {
  const s = readAssetState();
  if (!s.optedOut.includes(id)) {
    s.optedOut = [...s.optedOut, id];
    s.ready = s.ready.filter((r) => r !== id);
    writeAssetState(s);
  }
}
