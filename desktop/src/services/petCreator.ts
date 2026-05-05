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

export type PetMode = "text" | "image";
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
  const res = await apiFetch(`${API_BASE}/pet-generation/submit`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify(input),
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
