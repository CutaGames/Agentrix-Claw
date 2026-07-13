/**
 * riveAssetConfig — Rive Animation Asset Configuration
 *
 * Maps clan + emotion combinations to .riv animation files.
 * Currently no .riv files exist — the PetRiveRenderer falls back to
 * gradient + emoji automatically when getRiveAssetPath returns null.
 *
 * When designers deliver real .riv files, add them to this directory
 * following the naming convention: pet_clan_{CLAN}_{EMOTION}.riv
 * and register them in RIVE_ASSET_REGISTRY below.
 */

import type { PetClan, PetEmotion } from '../../components/pet/PetRiveRenderer';

// ── Types ──────────────────────────────────────────────────────────────────

export interface RiveAssetEntry {
  /** Relative path from this directory (e.g. './pet_clan_A_happy.riv') */
  path: string;
  /** State machine name inside the .riv file */
  stateMachine: string;
  /** Artboard name (defaults to emotion name) */
  artboard?: string;
}

// ── Registry ───────────────────────────────────────────────────────────────

/**
 * Registry of available .riv files.
 * Key format: `${clan}_${emotion}` (e.g. 'A_happy', 'B_sleepy')
 *
 * Currently empty — add entries as .riv files are created/downloaded.
 */
const RIVE_ASSET_REGISTRY: Record<string, RiveAssetEntry> = {
  // Example (uncomment when file is available):
  // 'A_happy': {
  //   path: './pet_clan_A_happy.riv',
  //   stateMachine: 'emotion',
  //   artboard: 'happy',
  // },
};

// ── Public API ─────────────────────────────────────────────────────────────

/**
 * Get the Rive asset path for a given clan + emotion combination.
 * Returns null when no .riv file exists (triggering the gradient fallback).
 *
 * @param clan - Pet clan identifier (A-F)
 * @param emotion - Current pet emotion state
 * @returns RiveAssetEntry or null if no asset is available
 */
export function getRiveAssetPath(
  clan: PetClan,
  emotion: PetEmotion | string,
): RiveAssetEntry | null {
  const key = `${clan}_${emotion}`;
  return RIVE_ASSET_REGISTRY[key] ?? null;
}

/**
 * Check if any .riv files are registered for a given clan.
 * Useful for UI to decide whether to show "Rive" quality option.
 */
export function hasClanRiveAssets(clan: PetClan): boolean {
  return Object.keys(RIVE_ASSET_REGISTRY).some((key) => key.startsWith(`${clan}_`));
}

/**
 * Get all registered .riv asset keys.
 */
export function getRegisteredRiveAssets(): string[] {
  return Object.keys(RIVE_ASSET_REGISTRY);
}

// ── File Placement Guide ───────────────────────────────────────────────────

/**
 * WHERE TO PLACE .riv FILES:
 *
 * 1. Download or create .riv files following the spec in README.md
 * 2. Place them in: src/assets/rive/
 * 3. Naming convention: pet_clan_{CLAN}_{EMOTION}.riv
 *    Examples:
 *      - pet_clan_A_happy.riv
 *      - pet_clan_B_excited.riv
 *      - pet_clan_F_sleepy.riv
 *
 * 4. Register in RIVE_ASSET_REGISTRY above
 * 5. The PetRiveRenderer will automatically pick them up
 *
 * DESIGN SPEC:
 *   - Canvas: 512×512 px
 *   - Frame rate: 60fps
 *   - Loop: infinite
 *   - State Machine: named 'emotion' with input 'emotion_intensity' (0-3)
 *   - Export: Rive format v7+ (rive-react-native 8.x compatible)
 */

// ── Free Rive Community Resources ──────────────────────────────────────────

/**
 * FREE RIVE ASSETS — Community resources for each clan:
 *
 * General search pages:
 *   - https://rive.app/community/files/tag/animal
 *   - https://rive.app/community/files/tag/character
 *
 * Clan-specific recommendations:
 *
 * Clan A (Office) — Professional / business characters:
 *   - Search: "robot assistant", "office character", "business"
 *   - Style: clean lines, blue/cyan palette, minimal animation
 *   - https://rive.app/community/files/tag/robot
 *
 * Clan B (Life) — Nature / organic creatures:
 *   - Search: "plant", "nature", "garden", "butterfly"
 *   - Style: organic shapes, green palette, flowing motion
 *   - https://rive.app/community/files/tag/nature
 *
 * Clan C (Learn) — Academic / knowledge creatures:
 *   - Search: "book", "wizard", "owl", "magic"
 *   - Style: mystical, purple palette, floating particles
 *   - https://rive.app/community/files/tag/magic
 *
 * Clan D (Play) — Gaming / retro characters:
 *   - Search: "game character", "pixel", "arcade", "hero"
 *   - Style: bouncy, orange/yellow palette, energetic
 *   - https://rive.app/community/files/tag/game
 *
 * Clan E (Web3) — Crypto / digital creatures:
 *   - Search: "phoenix", "fire", "digital", "cyber"
 *   - Style: glowing, pink/rose palette, particle effects
 *   - https://rive.app/community/files/tag/fire
 *
 * Clan F (Family) — Warm / cozy characters:
 *   - Search: "bear", "cat", "cute animal", "pet"
 *   - Style: soft, teal/sky palette, gentle breathing
 *   - https://rive.app/community/files/tag/cute
 *
 * IMPORTANT: Check each file's license before using in production.
 * Most community files are CC-BY or free for personal use.
 * For commercial use, verify the specific license on each file's page.
 */
