/**
 * Pet asset cache (Desktop · v0.1).
 *
 * Resolves blocker §5 (offline / distribution strategy) and partially
 * unblocks §2 (renderer runtime gating) from
 * docs/DESKTOP_LIVE2D_BLOCKERS_20260505.zh-CN.md.
 *
 * Today the desktop runs without any rendering bundle — the fallback SVG
 * renderer (`PetCanvas`) is always usable. This module defines the
 * manifest contract and graceful degradation rules so a Rive (`.riv`) /
 * VRM (`.vrm`) / Live2D (`.moc3`) bundle can be plugged in without code
 * churn.
 *
 * Manifest format v2 (route B — Rive + VRM, supersedes the v1 Live2D-only
 * shape but keeps the v1 fields for backward compatibility):
 *
 * {
 *   "schema": 2,
 *   "version": "2026-05-05",
 *   "preferredRenderer": "rive",        // optional, SDK still verifies
 *   "assets": [
 *     { "id": "default-rive", "renderer": "rive",
 *       "url": "https://cdn.agentrix.top/pets/default.riv",
 *       "sha256": "...", "sizeBytes": 312000, "license": "free" },
 *     { "id": "default-vrm",  "renderer": "vrm",
 *       "url": "https://cdn.agentrix.top/pets/default.vrm",
 *       "sha256": "...", "sizeBytes": 8200000, "license": "free" }
 *   ]
 * }
 *
 * The cache is intentionally small — each asset is a single bundle pinned
 * by sha256. Verification + extraction is delegated to the Tauri backend
 * (Rust) once a real downloader lands; this TS layer owns the manifest +
 * URL hints that `petSdk.ts` reads on boot to decide which renderer to
 * promote.
 *
 * Distribution policy:
 *   - Default: no manifest URL → fallback SVG renderer always wins
 *   - Opt-in: user pastes a manifest URL into Settings → Pet Assets
 *   - Manifest is fetched once on boot, cached locally, and re-validated
 *     every hour. Failed re-validation keeps last-known-good cache.
 *   - Manifest only declares URLs; actual asset bytes are downloaded by
 *     the renderer on first use (or never, if user stays offline).
 */
import { refreshPetRenderers, type PetRendererId } from "./petSdk";

const STORAGE_KEY = "agentrix_pet_assets_state";
const MANIFEST_URL_KEY = "agentrix_pet_manifest_url";
const MANIFEST_CACHE_KEY = "agentrix_pet_manifest_cache";
const MANIFEST_CACHED_AT_KEY = "agentrix_pet_manifest_cached_at";
const RIVE_ASSET_KEY = "agentrix_pet_rive_url";
const VRM_ASSET_KEY = "agentrix_pet_vrm_url";
const REVALIDATE_INTERVAL_MS = 60 * 60 * 1000; // 1h

export interface PetAssetDescriptor {
  id: string;
  url: string;
  sha256: string;
  sizeBytes: number;
  license: "free" | "commercial" | "premium";
  /** Renderer family this asset feeds. Defaults to "live2d" for v1 manifests. */
  renderer?: PetRendererId;
}

export interface PetAssetManifest {
  version: string;
  assets: PetAssetDescriptor[];
  /** Manifest schema version. v1 = Live2D-only, v2 = route B (Rive/VRM/Live2D). */
  schema?: 1 | 2;
  /** Server hint of which renderer to promote (SDK still verifies). */
  preferredRenderer?: PetRendererId;
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
 *
 * Order of preference (route B):
 *   1. live2d (only if commercial license + assets land later)
 *   2. vrm    (when a `.vrm` bundle id is in `ready`)
 *   3. rive   (when a `.riv` bundle id is in `ready`)
 *   4. fallback (always available — animated SVG via PetCanvas)
 */
export function pickPetRendererId(state: PetAssetState = readAssetState()): PetRendererId {
  if (state.ready.includes("default-live2d")) return "live2d";
  if (state.ready.includes("default-vrm") || state.ready.some((id) => id.endsWith("-vrm"))) return "vrm";
  if (state.ready.includes("default-rive") || state.ready.some((id) => id.endsWith("-rive"))) return "rive";
  // Legacy v1 manifest sentinel.
  if (state.ready.includes("default-pet")) return "live2d";
  return "fallback";
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

// ── Manifest pipeline (route B) ──────────────────────────────────────

function isValidUrl(s: string): boolean {
  if (!s || typeof s !== "string") return false;
  try {
    const u = new URL(s);
    return u.protocol === "https:" || u.protocol === "http:";
  } catch {
    return false;
  }
}

function isValidManifest(m: unknown): m is PetAssetManifest {
  if (!m || typeof m !== "object") return false;
  const x = m as Record<string, unknown>;
  if (typeof x.version !== "string") return false;
  if (!Array.isArray(x.assets)) return false;
  return x.assets.every((a) => {
    if (!a || typeof a !== "object") return false;
    const e = a as Record<string, unknown>;
    if (typeof e.id !== "string" || e.id.length === 0) return false;
    if (typeof e.url !== "string" || !isValidUrl(e.url)) return false;
    if (typeof e.sha256 !== "string" || !/^[a-f0-9]{64}$/i.test(e.sha256)) return false;
    if (typeof e.sizeBytes !== "number" || e.sizeBytes <= 0) return false;
    if (e.renderer !== undefined && !["fallback", "rive", "vrm", "live2d"].includes(e.renderer as string)) {
      return false;
    }
    return true;
  });
}

function emitRendererAssetChanged(
  eventName: "agentrix:pet-rive-changed" | "agentrix:pet-vrm-changed",
  url: string | null,
): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(eventName, { detail: { url } }));
}

function setRendererHint(
  storageKey: string,
  nextUrl: string | null,
  eventName: "agentrix:pet-rive-changed" | "agentrix:pet-vrm-changed",
): void {
  let previousUrl: string | null = null;
  try {
    previousUrl = localStorage.getItem(storageKey);
    if (nextUrl) localStorage.setItem(storageKey, nextUrl);
    else localStorage.removeItem(storageKey);
  } catch {
    // Storage is best-effort; event listeners still get the change signal.
  }
  if (previousUrl !== nextUrl) {
    emitRendererAssetChanged(eventName, nextUrl);
  }
}

function clearRendererUrlHints(): void {
  setRendererHint(RIVE_ASSET_KEY, null, "agentrix:pet-rive-changed");
  setRendererHint(VRM_ASSET_KEY, null, "agentrix:pet-vrm-changed");
  void refreshPetRenderers();
}

export function setManifestUrl(url: string | null): void {
  try {
    if (url && isValidUrl(url)) localStorage.setItem(MANIFEST_URL_KEY, url);
    else localStorage.removeItem(MANIFEST_URL_KEY);
  } catch {
    /* non-fatal */
  }
}

export function getManifestUrl(): string | null {
  try {
    return localStorage.getItem(MANIFEST_URL_KEY);
  } catch {
    return null;
  }
}

export function getCachedManifest(): PetAssetManifest | null {
  try {
    const raw = localStorage.getItem(MANIFEST_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    return isValidManifest(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function writeRendererUrlHints(m: PetAssetManifest): void {
  const rive = m.assets.find((a) => a.renderer === "rive")?.url ?? null;
  const vrm = m.assets.find((a) => a.renderer === "vrm")?.url ?? null;
  setRendererHint(RIVE_ASSET_KEY, rive, "agentrix:pet-rive-changed");
  setRendererHint(VRM_ASSET_KEY, vrm, "agentrix:pet-vrm-changed");
  void refreshPetRenderers();
}

/**
 * Fetch + validate the manifest from the configured URL. Falls back to
 * the cached copy on network or schema failure. Returns the active
 * manifest (fresh or cached), or null if neither path produced one.
 */
export async function refreshPetAssetManifest(): Promise<PetAssetManifest | null> {
  const url = getManifestUrl();
  if (!url) {
    // No manifest configured — clear renderer URL hints so SDK degrades
    // to the always-available fallback renderer.
    clearRendererUrlHints();
    return null;
  }
  try {
    const res = await fetch(url, { method: "GET", cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = (await res.json()) as unknown;
    if (!isValidManifest(json)) throw new Error("invalid manifest schema");
    try {
      localStorage.setItem(MANIFEST_CACHE_KEY, JSON.stringify(json));
      localStorage.setItem(MANIFEST_CACHED_AT_KEY, String(Date.now()));
    } catch {
      /* non-fatal */
    }
    writeRendererUrlHints(json);
    return json;
  } catch (err) {
    const cached = getCachedManifest();
    if (cached) {
      writeRendererUrlHints(cached);
      console.warn("[petAssets] refresh failed, using cached manifest:", err);
      return cached;
    }
    console.warn("[petAssets] refresh failed and no cache available:", err);
    return null;
  }
}

let _bootDone = false;
let _interval: ReturnType<typeof setInterval> | null = null;

/**
 * Boot the asset pipeline. Idempotent. Hydrates renderer URL hints
 * synchronously from cache (so `petSdk` registration sees them on first
 * call), then async-refreshes from the configured manifest URL and
 * re-validates hourly.
 */
export function bootPetAssets(): void {
  if (_bootDone) return;
  _bootDone = true;
  const cached = getCachedManifest();
  if (cached) writeRendererUrlHints(cached);
  void refreshPetAssetManifest();
  // Sprint G-2 / US-G2-5: verify the bundled fallback PNGs are reachable
  // from the WebView. If any 404, broadcast `agentrix:asset-fallback` so
  // PetCanvas can decide to render its SVG fallback up-front instead of
  // waiting for an <img> error.
  void verifyDefaultPngs();
  if (_interval) clearInterval(_interval);
  _interval = setInterval(() => {
    void refreshPetAssetManifest();
  }, REVALIDATE_INTERVAL_MS);
}

/**
 * Probe the default kitsune PNG bundle. Logs and dispatches but never throws.
 */
export async function verifyDefaultPngs(): Promise<void> {
  const urls = [
    "/pets/kitsune-default.png",
    "/pets/kitsune-pro.png",
    "/pets/kitsune-economy.png",
  ];
  const failures: string[] = [];
  for (const url of urls) {
    try {
      const res = await fetch(url, { method: "HEAD", cache: "no-store" });
      if (!res.ok) failures.push(`${url} → ${res.status}`);
    } catch (e) {
      failures.push(`${url} → ${(e as Error).message || "fetch failed"}`);
    }
  }
  if (failures.length > 0) {
    console.warn("[petAssets] missing default pet PNGs:", failures);
    window.dispatchEvent(
      new CustomEvent("agentrix:asset-fallback", { detail: { failures } }),
    );
  }
}

export function destroyPetAssets(): void {
  if (_interval) {
    clearInterval(_interval);
    _interval = null;
  }
  _bootDone = false;
}

