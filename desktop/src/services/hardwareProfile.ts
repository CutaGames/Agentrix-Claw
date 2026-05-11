/**
 * hardwareProfile — wrap Rust desktop_bridge_detect_hardware into a
 * cached client. 7-day TTL.
 *
 * D-MESH Phase 2.A.
 */
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

export function tierLabel(tier: HardwareTier): string {
  switch (tier) {
    case "unsupported": return "不支持";
    case "light":       return "Light 档";
    case "standard":    return "Standard 档";
    case "enthusiast":  return "Enthusiast 档";
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

export function tierDescription(tier: HardwareTier): string {
  switch (tier) {
    case "unsupported":
      return "你的硬件不适合本地模型。所有生成继续走云端，平台替你付费，完全不影响使用。";
    case "light":
      return "可运行 小型 LLM（3B 参数）和语音识别。不推荐本地 3D / 视频。";
    case "standard":
      return "可以本地跑 图像生成（SD 1.5）和基础 3D 模型（TripoSR）。速度约是云端的 2-3 倍。";
    case "enthusiast":
      return "全能本地节点：SDXL + Zero123 + 高质量 3D + 视频片段。速度约是云端的 3-5 倍 · 月均可赚 $2-5 AXP。";
  }
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
