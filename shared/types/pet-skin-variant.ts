/**
 * Pet Skin Variant — Multi-Form Architecture (Creator Studio MVP)
 *
 * Extends the base PetSkinRef with variant support. A single skin can have
 * up to 3 form variants that auto-switch based on the app's current mode:
 *
 *   - living: 萌态 (default idle, compact chat, floating ball)
 *   - pro:    专家态 (Pro Mode, coding, deep work)
 *   - economy: 商人态 (Agent Economy panel, marketplace, earnings)
 *
 * Each variant is a separate 3D model (.glb/.vrm) generated from the same
 * base prompt with mode-specific modifiers.
 *
 * Data flow:
 *   PetCreator → submitVariant() → backend generates N models in parallel
 *   → variants stored in pet_skin_variants table → linked to parent skin
 *   → desktop petSdk reads active variant based on appMode
 *
 * @see .kiro/specs/creator-studio-mvp/design.md
 */

import type { PetSkinFormat } from './pet';

// ============================================================
// §1 Variant Mode (maps to desktop app modes)
// ============================================================

/** The three form modes a pet can switch between */
export type PetVariantMode = 'living' | 'pro' | 'economy';

export const PET_VARIANT_MODES: PetVariantMode[] = ['living', 'pro', 'economy'];

export const PET_VARIANT_MODE_LABELS: Record<PetVariantMode, { zh: string; en: string; emoji: string }> = {
  living:  { zh: '萌态', en: 'Living Mode',  emoji: '🐾' },
  pro:     { zh: '专家态', en: 'Pro Mode',    emoji: '⚡' },
  economy: { zh: '商人态', en: 'Economy Mode', emoji: '💰' },
};

/**
 * Default prompt modifiers appended to the base prompt when generating variants.
 * Users can customize these, but these serve as sensible defaults.
 */
export const DEFAULT_VARIANT_PROMPT_MODIFIERS: Record<PetVariantMode, string> = {
  living: 'cute, round, chibi proportions, big eyes, curled up, soft glow, relaxed pose, kawaii style',
  pro: 'standing tall, sleek proportions, glowing data streams around body, focused expression, holographic UI elements floating nearby, professional aura',
  economy: 'slightly plump, wearing a tiny top hat, holding a glowing coin or gem, satisfied smirk, golden accents, merchant style',
};

// ============================================================
// §2 Variant Data Model
// ============================================================

/** A single form variant of a pet skin */
export interface PetSkinVariant {
  /** Variant UUID */
  id: string;
  /** Parent skin ID this variant belongs to */
  skinId: string;
  /** Which form mode this variant represents */
  mode: PetVariantMode;
  /** CDN URL for the .glb model */
  modelUrl: string;
  /** CDN URL for the .vrm model (auto-rigged from .glb) */
  vrmUrl?: string;
  /** Preview thumbnail URL */
  thumbnailUrl?: string;
  /** The full prompt used to generate this variant */
  prompt: string;
  /** The modifier portion that was appended to the base prompt */
  promptModifier: string;
  /** Provider used for generation */
  provider: string;
  /** Generation task ID (links to pet_generation_tasks) */
  generationTaskId?: string;
  /** Format of the primary model */
  format: PetSkinFormat;
  /** Creation timestamp (unix ms) */
  createdAt: number;
}

/** Extended skin reference with variant support */
export interface PetSkinWithVariants {
  /** Base skin ID */
  skinId: string;
  /** Whether this skin has multi-form variants */
  hasMultiForm: boolean;
  /** Available variants (0-3) */
  variants: PetSkinVariant[];
  /** The base/default model URL (used when no variant matches current mode) */
  baseModelUrl: string;
  /** Base thumbnail */
  baseThumbnailUrl?: string;
}

// ============================================================
// §3 API DTOs
// ============================================================

/** Request to generate a variant for an existing skin */
export interface SubmitVariantRequest {
  /** Parent skin ID to generate a variant for */
  parentSkinId: string;
  /** Which form mode to generate */
  mode: PetVariantMode;
  /** Custom prompt modifier (overrides default) */
  promptModifier?: string;
  /** Provider preference */
  provider?: 'meshy' | 'hunyuan3d';
  /** Style preference */
  style?: string;
}

/** Request to generate all variants at once */
export interface SubmitAllVariantsRequest {
  /** Parent skin ID */
  parentSkinId: string;
  /** Which modes to generate (defaults to all 3) */
  modes?: PetVariantMode[];
  /** Custom prompt modifiers per mode */
  promptModifiers?: Partial<Record<PetVariantMode, string>>;
  /** Provider preference */
  provider?: 'meshy' | 'hunyuan3d';
  /** Style preference */
  style?: string;
}

/** Response from variant generation submission */
export interface SubmitVariantResponse {
  /** Task IDs for each submitted variant (mode → taskId) */
  tasks: Record<PetVariantMode, string>;
  /** Estimated total time in seconds */
  estimatedSeconds: number;
}

// ============================================================
// §4 Marketplace Listing DTO
// ============================================================

/** Request to list a skin on the marketplace */
export interface MarketplaceListingRequest {
  /** Skin ID to list */
  skinId: string;
  /** Listing title */
  title: string;
  /** Description (supports markdown) */
  description: string;
  /** Price amount */
  price: number;
  /** Price currency */
  priceCurrency: 'AXP' | 'USD';
  /** Clan classification */
  clan?: string;
  /** Tags for discovery */
  tags?: string[];
  /** Whether to include all variants in the listing */
  includeVariants: boolean;
}

/** Response from marketplace listing */
export interface MarketplaceListingResponse {
  /** Listing ID */
  listingId: string;
  /** Review status */
  status: 'pending_review' | 'approved' | 'rejected';
  /** Web marketplace URL */
  marketUrl: string;
  /** Estimated review time */
  estimatedReviewHours?: number;
}

// ============================================================
// §5 App Mode → Variant Resolution
// ============================================================

/**
 * Desktop app modes that map to variant modes.
 * Used by petSdk to determine which variant to display.
 */
export type DesktopAppMode =
  | 'living-agent'      // Floating ball, compact chat
  | 'pro-mode'          // Pro Mode (full window, coding)
  | 'economy-panel';    // Agent Economy panel open

/** Map desktop app mode to variant mode */
export const APP_MODE_TO_VARIANT: Record<DesktopAppMode, PetVariantMode> = {
  'living-agent': 'living',
  'pro-mode': 'pro',
  'economy-panel': 'economy',
};

/**
 * Resolve which model URL to use based on current app mode and available variants.
 * Falls back to base model if no matching variant exists.
 */
export function resolveVariantModelUrl(
  skin: PetSkinWithVariants,
  appMode: DesktopAppMode,
): string {
  if (!skin.hasMultiForm || skin.variants.length === 0) {
    return skin.baseModelUrl;
  }
  const targetMode = APP_MODE_TO_VARIANT[appMode];
  const variant = skin.variants.find(v => v.mode === targetMode);
  return variant?.vrmUrl || variant?.modelUrl || skin.baseModelUrl;
}
