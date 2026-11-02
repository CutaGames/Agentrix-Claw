/**
 * Pet Creator service — talks to the backend pet-generation REST surface
 * used by the desktop Pet Creator panel.
 *
 * The same `pet_generate` tool is also reachable through the chat tool
 * pipeline (skill executor + claude integration + openclaw proxy). This
 * REST surface is just a more convenient way to drive it from a UI panel
 * without taking a chat turn.
 */
import { API_BASE, apiFetch, useAuthStore } from "./store";

export type PetMode = "text" | "image" | "scan" | "breed";
export type PetProvider = "meshy" | "hunyuan3d";
export type PetStyle =
  | "anime"
  | "realistic"
  | "chibi"
  | "sculpture"
  | "pbr"
  | "cartoon";

export interface PetTaskSummary {
  taskId: string;
  status: string;
  provider: string;
  mode: string;
  style?: string | null;
  title?: string | null;
  prompt?: string | null;
  outputUrl?: string | null;
  vrmUrl?: string | null;
  thumbnailUrl?: string | null;
  referenceImageUrl?: string | null;
  error?: string | null;
  createdAt?: string;
  completedAt?: string | null;
}

export interface PetSubmitInput {
  mode: PetMode;
  prompt?: string;
  provider?: PetProvider;
  model?: string;
  style?: PetStyle;
  referenceImageUrl?: string;
  /** Phase 5: 3-6 view URLs used by mode='scan'. */
  scanImageUrls?: string[];
  /** V4 P3: two parent skin URLs used by mode='breed' (front-end synthesises a prompt). */
  parentSkinUrls?: [string, string];
  negativePrompt?: string;
  enableAnimation?: boolean;
  targetPolycount?: number;
  sessionId?: string;
  deviceId?: string;
}

function authHeaders(): Record<string, string> {
  const token = useAuthStore.getState().token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/** Submit a new pet generation task. Returns the tool result (with taskId). */
export async function submitPetTask(input: PetSubmitInput): Promise<any> {
  // Sprint DB #5: Use native /pet/skins/breed endpoint for breed mode.
  // Falls back to prompt-synthesis if the breed endpoint returns 404.
  let body: PetSubmitInput = input;
  if (input.mode === "breed" && input.parentSkinUrls && input.parentSkinUrls.length === 2) {
    const [a, b] = input.parentSkinUrls;
    try {
      const breedRes = await apiFetch(`${API_BASE}/v1/pet/skins/breed`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({
          parentSkinIdA: a,
          parentSkinIdB: b,
          prompt: input.prompt?.trim() || undefined,
          biasTowardA: 0.5,
        }),
      });
      if (breedRes.ok) {
        return breedRes.json();
      }
      // If 404 or not implemented, fall through to legacy synthesis
      if (breedRes.status !== 404) {
        const text = await breedRes.text().catch(() => "");
        throw new Error(`breed failed: ${breedRes.status} ${text}`);
      }
    } catch (err: any) {
      if (!err?.message?.includes("404")) throw err;
    }

    // Legacy fallback: synthesise an image-mode request
    body = {
      ...input,
      mode: "image",
      referenceImageUrl: a,
      prompt: [
        input.prompt?.trim() || "",
        `Breed/fuse the visual traits of two parent pets. Parent A reference: ${a}. Parent B reference: ${b}. Inherit signature features from both into a single cohesive 3D pet.`,
      ].filter(Boolean).join("\n\n"),
    };
    delete (body as any).parentSkinUrls;
  }
  const res = await apiFetch(`${API_BASE}/pet-generation/submit`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`submitPetTask failed: ${res.status} ${text}`);
  }
  return res.json();
}

/** Poll a single task. */
export async function getPetTask(taskId: string): Promise<any> {
  const res = await apiFetch(
    `${API_BASE}/pet-generation/tasks/${encodeURIComponent(taskId)}`,
    { headers: authHeaders() },
  );
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`getPetTask failed: ${res.status} ${text}`);
  }
  return res.json();
}

/** List recent tasks for the current user. */
export async function listPetTasks(limit = 30): Promise<PetTaskSummary[]> {
  const res = await apiFetch(
    `${API_BASE}/pet-generation/tasks?limit=${limit}`,
    { headers: authHeaders() },
  );
  if (!res.ok) return [];
  const data = await res.json().catch(() => null);
  return Array.isArray(data?.tasks) ? data.tasks : [];
}

/** Save the generated pet as the user's active pet (consumed by FloatingBall / PetVRM). */
export const ACTIVE_PET_VRM_KEY = "agentrix_pet_vrm_url";
export const ACTIVE_PET_NAME_KEY = "agentrix_pet_display_name";

export function setActivePet(url: string, displayName?: string): void {
  try {
    localStorage.setItem(ACTIVE_PET_VRM_KEY, url);
    if (displayName) {
      localStorage.setItem(ACTIVE_PET_NAME_KEY, displayName);
    }
    window.dispatchEvent(
      new CustomEvent("agentrix:pet-vrm-changed", {
        detail: { url, displayName },
      }),
    );
  } catch {
    // localStorage can fail in private mode; the in-memory event still fires.
    window.dispatchEvent(
      new CustomEvent("agentrix:pet-vrm-changed", {
        detail: { url, displayName },
      }),
    );
  }
}

export function getActivePetUrl(): string | null {
  try {
    return localStorage.getItem(ACTIVE_PET_VRM_KEY);
  } catch {
    return null;
  }
}

/**
 * Wrap a third-party model URL with the backend asset proxy so the desktop
 * shell (Tauri WebView2) can load it via three.js without CORS errors.
 *
 * Provider CDNs (Tencent Hunyuan3D, Meshy, HuggingFace, S3) do not serve
 * `Access-Control-Allow-Origin: *`, so a direct GLTFLoader fetch fails
 * with "VRM load failed". Routing through `${API_BASE}/pet-generation/asset?u=...`
 * gives us a same-origin response with permissive CORS headers.
 *
 * No-op for:
 *   - empty / falsy URLs (returns "")
 *   - already-proxied URLs (idempotent)
 *   - same-origin URLs (no need to proxy)
 *   - blob: / data: / file: schemes (already loadable)
 */
const PROXY_PATH = "/pet-generation/asset?u=";

export function proxyModelUrl(url: string | null | undefined): string {
  if (!url) return "";
  // blob://, data:, file:// — leave as-is
  if (/^(blob:|data:|file:)/i.test(url)) return url;
  // already proxied
  if (url.includes(PROXY_PATH)) return url;
  // same origin? leave as-is
  try {
    const u = new URL(url, typeof window !== "undefined" ? window.location.href : "http://localhost");
    if (typeof window !== "undefined" && u.origin === window.location.origin) {
      return url;
    }
  } catch {
    return url;
  }
  return `${API_BASE}${PROXY_PATH}${encodeURIComponent(url)}`;
}
