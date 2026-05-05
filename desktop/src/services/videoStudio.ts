/**
 * Video Studio service — drives the backend video-generation REST surface
 * for the desktop Video Studio panel.
 *
 * Wraps two flows:
 *   1. video_generate (single clip via Fal/HF text-to-video / image-to-video)
 *   2. video_compose  (multi-scene narrated video via VideoComposerService)
 *
 * `video_compose` doesn't have a dedicated REST controller yet, so we drive
 * it through the platform-tools execute endpoint (same path the LLM uses).
 */
import { API_BASE, apiFetch, useAuthStore } from "./store";

export type VideoMode = "text_to_video" | "image_to_video" | "video_to_video";
export type VideoAspect = "16:9" | "9:16" | "1:1";

export interface VideoGenerateInput {
  mode: VideoMode;
  prompt?: string;
  provider?: string;
  model?: string;
  duration?: "5" | "10";
  aspectRatio?: VideoAspect;
  negativePrompt?: string;
  cfgScale?: number;
  generateAudio?: boolean;
  referenceImageUrl?: string;
  endImageUrl?: string;
  referenceVideoUrl?: string;
  sessionId?: string;
}

export interface VideoTaskSummary {
  taskId: string;
  status: string;
  provider: string;
  model?: string | null;
  title?: string | null;
  prompt?: string | null;
  outputUrl?: string | null;
  thumbnailUrl?: string | null;
  error?: string | null;
  createdAt?: string;
  completedAt?: string | null;
}

export interface VideoComposeScene {
  visualPrompt: string;
  narration?: string;
  duration?: number;
  subtitle?: string;
}

export interface VideoComposeInput {
  scenes: VideoComposeScene[];
  title?: string;
  voiceId?: string;
  language?: "zh" | "en";
  bgmUrl?: string;
  aspectRatio?: VideoAspect;
  subtitleFontSize?: number;
  transitionSec?: number;
  burnSubtitles?: boolean;
}

function authHeaders(): Record<string, string> {
  const token = useAuthStore.getState().token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export async function submitVideoTask(input: VideoGenerateInput): Promise<any> {
  const res = await apiFetch(`${API_BASE}/video-generation/submit`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`submitVideoTask failed: ${res.status} ${text}`);
  }
  return res.json();
}

export async function getVideoTask(taskId: string): Promise<any> {
  const res = await apiFetch(
    `${API_BASE}/video-generation/tasks/${encodeURIComponent(taskId)}`,
    { headers: authHeaders() },
  );
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`getVideoTask failed: ${res.status} ${text}`);
  }
  return res.json();
}

export async function listVideoTasks(limit = 30): Promise<VideoTaskSummary[]> {
  const res = await apiFetch(
    `${API_BASE}/video-generation/tasks?limit=${limit}`,
    { headers: authHeaders() },
  );
  if (!res.ok) return [];
  const data = await res.json().catch(() => null);
  return Array.isArray(data?.tasks) ? data.tasks : [];
}

/**
 * Submit a multi-scene compose job through the platform-tools tool surface.
 * Requires an active OpenClaw instance (the LLM tool path is per-instance).
 */
export async function submitComposeJob(
  instanceId: string,
  input: VideoComposeInput,
): Promise<any> {
  if (!instanceId) {
    throw new Error("submitComposeJob requires an active OpenClaw instanceId");
  }
  const res = await apiFetch(
    `${API_BASE}/openclaw/proxy/${encodeURIComponent(instanceId)}/platform-tools/execute`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({ tool: "video_compose", params: input }),
    },
  );
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`submitComposeJob failed: ${res.status} ${text}`);
  }
  return res.json();
}

/** Poll a compose job by jobId. */
export async function getComposeJob(
  instanceId: string,
  jobId: string,
): Promise<any> {
  const res = await apiFetch(
    `${API_BASE}/openclaw/proxy/${encodeURIComponent(instanceId)}/platform-tools/execute`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({ tool: "video_compose", params: { jobId } }),
    },
  );
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`getComposeJob failed: ${res.status} ${text}`);
  }
  return res.json();
}
