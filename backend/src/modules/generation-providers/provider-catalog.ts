/**
 * GenerationProviderCatalog
 *
 * Unified registry of video & 3D generation providers exposed to end users.
 * Some providers are already wired to the backend (`status: 'live'`); others
 * are listed as `coming_soon` so the UI can show the full menu and users can
 * vote / preview pricing before we sign commercial contracts.
 *
 * Source of truth for `provider-research-2026-05.md` data → consumed by:
 *   - GET /generation-providers/video
 *   - GET /generation-providers/3d
 *   - Desktop / Web Studio "Provider Picker" dropdown
 *
 * Adding a new provider:
 *   1. Append an entry below.
 *   2. If implementing it: also update VideoGenerationService /
 *      PetGenerationService routing AND set `status: 'live'`.
 *   3. Pricing must reflect public list price; currency = USD unless noted.
 */

export type ProviderTier = 'free' | 'budget' | 'standard' | 'premium';
export type ProviderStatus = 'live' | 'coming_soon' | 'beta';
export type ProviderModality = 'video' | '3d';

export interface GenerationProvider {
  /** Stable internal id used by routing / billing. */
  id: string;
  /** Display name. */
  name: string;
  /** Vendor company. */
  vendor: string;
  modality: ProviderModality;
  status: ProviderStatus;
  tier: ProviderTier;
  /** Free | $X/sec | $X/model | $X/month */
  pricingLabel: string;
  /** Numeric price for routing decisions (USD). 0 = free / self-hosted. */
  unitPriceUsd: number;
  /** Unit being priced: 'second' | 'model' | 'month' | 'credit'. */
  unit: 'second' | 'model' | 'month' | 'credit' | 'free';
  /** Human-readable strength / specialty. */
  strength: string;
  /** Output capability summary. */
  capability: string;
  /** Input modes supported. */
  inputs: Array<'text' | 'image' | 'video' | 'multimodal'>;
  /** Free tier description (or null). */
  freeTier?: string | null;
  /** True if reachable from China without VPN. */
  chinaAvailable: boolean;
  /** Average queue/processing time hint, e.g. "30-60s" or "2-5min". */
  latencyHint?: string;
  /** Optional logo / icon path served from frontend public assets. */
  iconKey?: string;
  /** Tag list for filtering. */
  tags?: string[];
}

// ---------------------------------------------------------------------------
// Video providers
// ---------------------------------------------------------------------------

export const VIDEO_PROVIDERS: GenerationProvider[] = [
  // Live ✅
  {
    id: 'hunyuan',
    name: '腾讯混元生视频',
    vendor: 'Tencent',
    modality: 'video',
    status: 'live',
    tier: 'standard',
    pricingLabel: '按次计费 (Tencent vclm)',
    unitPriceUsd: 0.05,
    unit: 'second',
    strength: '中文优化、人物动作流畅',
    capability: '5s @ 720p, text + image-to-video',
    inputs: ['text', 'image'],
    freeTier: '试用额度（控制台领取）',
    chinaAvailable: true,
    latencyHint: '1-3 min',
    iconKey: 'tencent',
    tags: ['china', 'official-api'],
  },

  // Coming soon — Phase 1 高优
  {
    id: 'kling-v2-6-pro',
    name: 'Kling 2.6 Pro',
    vendor: 'Kuaishou',
    modality: 'video',
    status: 'coming_soon',
    tier: 'standard',
    pricingLabel: '~$0.07/秒',
    unitPriceUsd: 0.07,
    unit: 'second',
    strength: '动作流畅、国风、双向参考帧',
    capability: '14s @ 1080p, text + image',
    inputs: ['text', 'image'],
    freeTier: '试用',
    chinaAvailable: true,
    latencyHint: '2-5 min',
    iconKey: 'kling',
    tags: ['china', 'phase-1'],
  },
  {
    id: 'hailuo-v2-3',
    name: 'MiniMax Hailuo 2.3',
    vendor: 'MiniMax',
    modality: 'video',
    status: 'coming_soon',
    tier: 'budget',
    pricingLabel: '~¥0.006/秒（国内最便宜）',
    unitPriceUsd: 0.001,
    unit: 'second',
    strength: '极致性价比、多语言、动态强',
    capability: '6s @ 1080p, text + image',
    inputs: ['text', 'image'],
    freeTier: '限免',
    chinaAvailable: true,
    latencyHint: '1-3 min',
    iconKey: 'minimax',
    tags: ['china', 'cheap', 'phase-1'],
  },
  {
    id: 'wan-v2-5',
    name: 'Wan 2.5',
    vendor: 'Alibaba / OSS',
    modality: 'video',
    status: 'coming_soon',
    tier: 'budget',
    pricingLabel: '$0.05–0.25/秒（fal.ai）',
    unitPriceUsd: 0.05,
    unit: 'second',
    strength: '开源、高性价比',
    capability: '20s @ 720p, text + image',
    inputs: ['text', 'image'],
    freeTier: 'HuggingFace Space',
    chinaAvailable: true,
    latencyHint: '2-5 min',
    iconKey: 'wan',
    tags: ['open-source', 'phase-1'],
  },
  {
    id: 'seedance-v2-0',
    name: 'Seedance 2.0',
    vendor: 'ByteDance',
    modality: 'video',
    status: 'coming_soon',
    tier: 'standard',
    pricingLabel: '$0.03–0.08/秒',
    unitPriceUsd: 0.06,
    unit: 'second',
    strength: '多模态、社交媒体优化',
    capability: '5-10s @ 1080p',
    inputs: ['text', 'image', 'multimodal'],
    freeTier: 'Replicate 试用',
    chinaAvailable: true,
    latencyHint: '1-3 min',
    iconKey: 'bytedance',
    tags: ['china'],
  },
  {
    id: 'runway-gen4',
    name: 'Runway Gen-4',
    vendor: 'Runway',
    modality: 'video',
    status: 'coming_soon',
    tier: 'standard',
    pricingLabel: '~$0.10/秒',
    unitPriceUsd: 0.10,
    unit: 'second',
    strength: '物理精确、电影级相机控制',
    capability: '4–10s @ 1080p, text + image',
    inputs: ['text', 'image'],
    freeTier: '有限免',
    chinaAvailable: false,
    latencyHint: '5-15 min（高峰）',
    iconKey: 'runway',
    tags: ['premium-quality'],
  },
  {
    id: 'pika-v2-5',
    name: 'Pika 2.5',
    vendor: 'Pika Labs',
    modality: 'video',
    status: 'coming_soon',
    tier: 'standard',
    pricingLabel: '$8–76/月（订阅）',
    unitPriceUsd: 8,
    unit: 'month',
    strength: '动漫友好、可编辑',
    capability: '5–25s, text + image + video edit',
    inputs: ['text', 'image', 'video'],
    freeTier: '80 credit/月',
    chinaAvailable: false,
    latencyHint: '2-5 min',
    iconKey: 'pika',
    tags: ['anime', 'subscription'],
  },
  {
    id: 'luma-dream-machine',
    name: 'Luma Dream Machine',
    vendor: 'Luma Labs',
    modality: 'video',
    status: 'coming_soon',
    tier: 'premium',
    pricingLabel: '$30–90/月',
    unitPriceUsd: 30,
    unit: 'month',
    strength: '真实光影、电影质感',
    capability: '5s @ 1080p, text + image',
    inputs: ['text', 'image'],
    freeTier: null,
    chinaAvailable: false,
    latencyHint: '3-10 min',
    iconKey: 'luma',
    tags: ['premium', 'cinematic'],
  },
  {
    id: 'veo-3',
    name: 'Google Veo 3',
    vendor: 'Google',
    modality: 'video',
    status: 'coming_soon',
    tier: 'premium',
    pricingLabel: '$0.40/秒',
    unitPriceUsd: 0.40,
    unit: 'second',
    strength: '影视级质量、4K、最强画质',
    capability: '3s @ 720p (扩展中), text-only',
    inputs: ['text'],
    freeTier: null,
    chinaAvailable: false,
    latencyHint: '3-10 min',
    iconKey: 'google',
    tags: ['premium', 'flagship'],
  },
  {
    id: 'cogvideox',
    name: 'CogVideoX',
    vendor: 'Zhipu AI / Tsinghua',
    modality: 'video',
    status: 'coming_soon',
    tier: 'free',
    pricingLabel: '开源（自部署）',
    unitPriceUsd: 0,
    unit: 'free',
    strength: '完全开源、可微调',
    capability: '可变, text-to-video',
    inputs: ['text'],
    freeTier: 'GitHub / HuggingFace',
    chinaAvailable: true,
    latencyHint: '需 GPU 集群',
    iconKey: 'zhipu',
    tags: ['open-source', 'self-hosted'],
  },
  {
    id: 'ltx-video',
    name: 'LTX Video',
    vendor: 'LTX Studio',
    modality: 'video',
    status: 'coming_soon',
    tier: 'free',
    pricingLabel: '开源（自部署）',
    unitPriceUsd: 0,
    unit: 'free',
    strength: '长视频生成、开源',
    capability: '可变 @ 768p',
    inputs: ['text'],
    freeTier: 'HuggingFace',
    chinaAvailable: true,
    iconKey: 'ltx',
    tags: ['open-source', 'long-video'],
  },
  {
    id: 'mochi-v1',
    name: 'Mochi 1',
    vendor: 'Genmo',
    modality: 'video',
    status: 'coming_soon',
    tier: 'budget',
    pricingLabel: '~$0.05/秒（fal.ai）',
    unitPriceUsd: 0.05,
    unit: 'second',
    strength: '开源、多格式',
    capability: '可变, text + image',
    inputs: ['text', 'image'],
    freeTier: 'GitHub OSS',
    chinaAvailable: true,
    iconKey: 'genmo',
    tags: ['open-source'],
  },
];

// ---------------------------------------------------------------------------
// 3D providers
// ---------------------------------------------------------------------------

export const THREE_D_PROVIDERS: GenerationProvider[] = [
  // Live ✅
  {
    id: 'hunyuan3d',
    name: '腾讯混元 3D',
    vendor: 'Tencent',
    modality: '3d',
    status: 'live',
    tier: 'standard',
    pricingLabel: '按次计费 (Tencent ai3d)',
    unitPriceUsd: 0.10,
    unit: 'model',
    strength: '中文优化、质量稳定、官方 API',
    capability: 'GLB / OBJ, image-to-3D',
    inputs: ['image'],
    freeTier: '试用额度',
    chinaAvailable: true,
    latencyHint: '30-90s',
    iconKey: 'tencent',
    tags: ['china', 'official-api'],
  },
  {
    id: 'meshy',
    name: 'Meshy 5',
    vendor: 'Meshy',
    modality: '3d',
    status: 'live',
    tier: 'budget',
    pricingLabel: '$0.05–0.15/模型',
    unitPriceUsd: 0.10,
    unit: 'model',
    strength: '纹理细节、易用',
    capability: 'GLB / OBJ / FBX, text + image',
    inputs: ['text', 'image'],
    freeTier: '有限免',
    chinaAvailable: true,
    latencyHint: '60-120s',
    iconKey: 'meshy',
    tags: ['textured'],
  },

  // Coming soon
  {
    id: 'tripo3d-v3',
    name: 'Tripo3D v3 Ultra',
    vendor: 'Tripo AI',
    modality: '3d',
    status: 'coming_soon',
    tier: 'standard',
    pricingLabel: '$11.94–139.9/月（credit）',
    unitPriceUsd: 0.05,
    unit: 'credit',
    strength: '高质量、快速生成、行业领先',
    capability: 'GLB / OBJ + texture, text + image',
    inputs: ['text', 'image'],
    freeTier: '免费额度',
    chinaAvailable: true,
    latencyHint: '30-60s',
    iconKey: 'tripo',
    tags: ['phase-2', 'high-quality'],
  },
  {
    id: 'rodin-gen2',
    name: 'Rodin Gen2',
    vendor: 'Hyper3D',
    modality: '3d',
    status: 'coming_soon',
    tier: 'standard',
    pricingLabel: '需商务咨询',
    unitPriceUsd: 0.20,
    unit: 'model',
    strength: '实时预览、高质量',
    capability: 'GLB / OBJ',
    inputs: ['text', 'image'],
    freeTier: '需咨询',
    chinaAvailable: true,
    latencyHint: '30-60s',
    iconKey: 'rodin',
    tags: ['realtime-preview'],
  },
  {
    id: 'csm-pro',
    name: 'Common Sense Machines',
    vendor: 'CSM',
    modality: '3d',
    status: 'coming_soon',
    tier: 'premium',
    pricingLabel: '需商务咨询',
    unitPriceUsd: 1.0,
    unit: 'model',
    strength: '光学精准、工业级、USD/FBX',
    capability: 'GLB / USD / FBX',
    inputs: ['text', 'image'],
    freeTier: null,
    chinaAvailable: true,
    latencyHint: '1-3 min',
    iconKey: 'csm',
    tags: ['enterprise', 'industrial'],
  },
  {
    id: 'trellis-image-large',
    name: 'Trellis (Microsoft)',
    vendor: 'Microsoft',
    modality: '3d',
    status: 'coming_soon',
    tier: 'free',
    pricingLabel: '开源（自部署）',
    unitPriceUsd: 0,
    unit: 'free',
    strength: '多格式（Gaussian / Mesh）、可编辑',
    capability: 'Gaussian / Mesh / Radiance Field',
    inputs: ['text', 'image'],
    freeTier: 'GitHub OSS',
    chinaAvailable: true,
    latencyHint: '需 GPU',
    iconKey: 'microsoft',
    tags: ['open-source', 'gaussian-splat'],
  },
  {
    id: 'triposr',
    name: 'TripoSR',
    vendor: 'Stability AI + Tripo',
    modality: '3d',
    status: 'coming_soon',
    tier: 'free',
    pricingLabel: '开源（自部署）',
    unitPriceUsd: 0,
    unit: 'free',
    strength: '快速、准确、开源',
    capability: 'GLB / OBJ / PLY, image-to-3D',
    inputs: ['image'],
    freeTier: 'HuggingFace Space',
    chinaAvailable: true,
    latencyHint: '需 GPU',
    iconKey: 'stability',
    tags: ['open-source'],
  },
  {
    id: 'instantmesh',
    name: 'InstantMesh',
    vendor: 'Alibaba',
    modality: '3d',
    status: 'coming_soon',
    tier: 'free',
    pricingLabel: '开源（自部署）',
    unitPriceUsd: 0,
    unit: 'free',
    strength: '多视图快速生成',
    capability: 'OBJ / GLB',
    inputs: ['image'],
    freeTier: 'HuggingFace',
    chinaAvailable: true,
    latencyHint: '需 GPU',
    iconKey: 'alibaba',
    tags: ['open-source', 'china'],
  },
];

export const ALL_PROVIDERS: GenerationProvider[] = [
  ...VIDEO_PROVIDERS,
  ...THREE_D_PROVIDERS,
];

export function listProviders(modality: ProviderModality): GenerationProvider[] {
  return ALL_PROVIDERS.filter((p) => p.modality === modality);
}

export function findProvider(id: string): GenerationProvider | undefined {
  return ALL_PROVIDERS.find((p) => p.id === id);
}
