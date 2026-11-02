/**
 * hardwareProfile — wrap Rust desktop_bridge_detect_hardware into a
 * cached client. 7-day TTL.
 *
 * D-MESH Phase 2.A.
 */
import { pickFor } from "../i18n/pick";

export type HardwareTier = "unsupported" | "light" | "standard" | "enthusiast";

export interface HardwareProfile {
  gpu_name: string | null;
  gpu_vram_mb: number | null;
  cpu_cores: number;
  ram_total_mb: number;
  disk_free_mb: number | null;
  os: string;
  recommended_tier: HardwareTier;
  can_run_local_llm: boolean;
  can_run_pet_gen: boolean;
  can_run_video_gen: boolean;
}

const CACHE_KEY = "agentrix_hardware_profile_v1";
const CACHE_TTL_MS = 7 * 24 * 3600 * 1000; // 7 days

interface CachedEntry {
  profile: HardwareProfile;
  detectedAt: number;
}

export async function detectHardwareProfile(force = false): Promise<HardwareProfile | null> {
  if (!force) {
    try {
      const raw = localStorage.getItem(CACHE_KEY);
      if (raw) {
        const cached: CachedEntry = JSON.parse(raw);
        if (Date.now() - cached.detectedAt < CACHE_TTL_MS) {
          return cached.profile;
        }
      }
    } catch {}
  }

  try {
    const { invoke } = await import("@tauri-apps/api/core");
    const profile = await invoke<HardwareProfile>("desktop_bridge_detect_hardware");
    try {
      localStorage.setItem(
        CACHE_KEY,
        JSON.stringify({ profile, detectedAt: Date.now() } satisfies CachedEntry),
      );
    } catch {}
    return profile;
  } catch (err) {
    console.warn("[hardwareProfile] detect failed:", err);
    return null;
  }
}

/** `locale` is the app language; Chinese when none is given. */
export function tierLabel(tier: HardwareTier, locale: string = "zh"): string {
  const pick = pickFor(locale);
  switch (tier) {
    case "unsupported": return pick("不支持", "Not supported");
    case "light":       return pick("Light 档", "Light tier");
    case "standard":    return pick("Standard 档", "Standard tier");
    case "enthusiast":  return pick("Enthusiast 档", "Enthusiast tier");
  }
}

export function tierEmoji(tier: HardwareTier): string {
  switch (tier) {
    case "unsupported": return "💻";
    case "light":       return "🌱";
    case "standard":    return "⚡";
    case "enthusiast":  return "🔥";
  }
}

export function tierDescription(tier: HardwareTier, locale: string = "zh"): string {
  const pick = pickFor(locale);
  switch (tier) {
    case "unsupported":
      return pick(
        "你的硬件不适合本地模型。所有生成继续走云端，平台替你付费，完全不影响使用。",
        "Your hardware isn't suited to local models. All generation keeps running in the cloud, paid for by the platform, with no effect on how you use it.",
      );
    case "light":
      return pick(
        "可运行 小型 LLM（3B 参数）和语音识别。不推荐本地 3D / 视频。",
        "Can run a small LLM (3B parameters) and speech recognition. Local 3D / video isn't recommended.",
      );
    case "standard":
      return pick(
        "可以本地跑 图像生成（SD 1.5）和基础 3D 模型（TripoSR）。速度约是云端的 2-3 倍。",
        "Can run image generation (SD 1.5) and a basic 3D model (TripoSR) locally, about 2-3 times faster than the cloud.",
      );
    case "enthusiast":
      return pick(
        "全能本地节点：SDXL + Zero123 + 高质量 3D + 视频片段。速度约是云端的 3-5 倍。",
        "A full local node: SDXL + Zero123 + high-quality 3D + video clips, about 3-5 times faster than the cloud.",
      );
  }
}

/** English wording of the capability packs, by pack id (the pack list itself carries the Chinese). */
const PACK_EN: Record<string, { label: string; description: string }> = {
  local_llm_small: { label: "Local LLM (Llama 3.2 3B)", description: "On-device text generation · the main LLM for Free-tier users" },
  local_speech: { label: "Local speech (Whisper + Piper TTS)", description: "On-device speech recognition and synthesis; nothing leaves the machine" },
  local_image: { label: "Local image (SD 1.5 / FLUX)", description: "Text to image, about 3-5 seconds per picture" },
  local_3d: { label: "Local 3D (TripoSR + Zero123)", description: "Image / text to a 3D pet, about 20 seconds" },
  local_video: { label: "Local video (SVD clips ≤ 4s)", description: "Needs 12GB+ of video memory · slow but private" },
};

export function capabilityPackText(pack: CapabilityPack, locale: string = "zh"): { label: string; description: string } {
  const en = PACK_EN[pack.id];
  return locale === "zh" || !en ? { label: pack.label, description: pack.description } : en;
}

export interface CapabilityPack {
  id: string;
  label: string;
  size_mb: number;
  requires_tier: HardwareTier[];
  description: string;
}

export const CAPABILITY_PACKS: CapabilityPack[] = [
  {
    id: "local_llm_small",
    label: "本地 LLM (Llama 3.2 3B)",
    size_mb: 1500,
    requires_tier: ["light", "standard", "enthusiast"],
    description: "端侧文本生成 · Free 档用户的主力 LLM",
  },
  {
    id: "local_speech",
    label: "本地语音 (Whisper + Piper TTS)",
    size_mb: 300,
    requires_tier: ["light", "standard", "enthusiast"],
    description: "端侧语音识别 + 合成，不离开机器",
  },
  {
    id: "local_image",
    label: "本地图像 (SD 1.5 / FLUX)",
    size_mb: 2500,
    requires_tier: ["standard", "enthusiast"],
    description: "文本 → 图像，约 3-5 秒出图",
  },
  {
    id: "local_3d",
    label: "本地 3D (TripoSR + Zero123)",
    size_mb: 3200,
    requires_tier: ["standard", "enthusiast"],
    description: "图片/文字 → 3D 萌宠，约 20 秒",
  },
  {
    id: "local_video",
    label: "本地视频 (SVD 片段 ≤ 4s)",
    size_mb: 10240,
    requires_tier: ["enthusiast"],
    description: "需要 12GB+ 显存 · 慢但私密",
  },
];

/**
 * Are we allowed to even show the "enable local compute" entry to this user?
 * Returns false for unsupported hardware so they never see a tempting
 * button that will just disappoint them.
 */
export function shouldShowLocalComputeOption(profile: HardwareProfile | null): boolean {
  if (!profile) return false;
  return profile.recommended_tier !== "unsupported";
}
