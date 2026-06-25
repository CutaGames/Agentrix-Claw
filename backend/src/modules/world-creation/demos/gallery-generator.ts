/**
 * Gallery_Generator — Tier_A ECS_World generation for the personal gallery /
 * palace demo (design §11.3, R14.1/R14.2).
 *
 * The A-tier gallery is the "showcase your scanned collection" demo (design
 * §11.3 / §15 Phase 2): a Mobile creator prompts for a gallery or palace and
 * gets a **pure declarative scene-graph** — exhibits, lights, pedestals, and UI
 * placards — with **near-100% reliability** because the substrate is structurally
 * safe (safe by construction). There is no behavior to get wrong: no DSL rules,
 * no executable logic.
 *
 * This module exports a PURE function {@link generateGallery} that an
 * AgentBuilderService prompt flow calls to produce the gallery's canonical
 * ECS_World. The result is a strict **Tier_A** world:
 *
 *   - declarative scene-graph layout only — room/floor + lights + pedestals,
 *   - exhibit entities referencing World_Asset / preset meshes,
 *   - optional UI placards (`ui.text`) labelling each exhibit,
 *   - NO `rules` (Substrate_DSL), NO `logicModules`, and NO `logicModuleRef`
 *     component anywhere.
 *
 * Because it emits only declarative components, the world is Tier_A-compliant
 * **by construction** and passes {@link validateTier} (R14.2). When published it
 * is instantiated at isolation level **L0** for visitors (declarative R3F
 * rendering, no code execution — R14.4).
 *
 * Editing (NL or direct manipulation) reuses the same EcsWorldService diff/version
 * channel writing into this same Tier_A ECS_World (R14.3) — this generator only
 * produces the initial draft; subsequent edits flow through the shared channel.
 *
 * @see .kiro/specs/ai-world-creation-platform/design.md — §11.3 A 级展厅 / B 级超市
 */

import {
  ECS_VERSION,
  EcsEntity,
  EcsWorld,
  Vec3,
} from '../../../../shared/types/world-creation';
import type { ReadonlyAssetHandle } from '../../../../shared/types/world-creation-api';

// ============================================================
// Generation options
// ============================================================

/**
 * Declaration of a single exhibit displayed in the gallery. Kept declarative —
 * an exhibit is just data: a mesh to render plus optional placard text. No
 * behavior is attached.
 */
export interface GalleryExhibitSpec {
  /** Unique exhibit id within the gallery (e.g., "exhibit_1"). */
  id: string;
  /** Human-readable display name shown on the placard (e.g., "青花瓷"). */
  displayName?: string;
  /**
   * World_Asset id rendered for this exhibit (e.g., a scanned figurine).
   * Display-only reference; never an ownership proof.
   */
  assetRef?: string;
  /**
   * Built-in preset mesh to render when no `assetRef` is supplied
   * (defaults to "exhibit_placeholder").
   */
  meshPreset?: string;
  /** Explicit floor position [x, y, z]; auto-laid-out along a row when omitted. */
  position?: Vec3;
  /** When false, no placard UI entity is emitted for this exhibit (defaults true). */
  showPlacard?: boolean;
}

/** Options driving {@link generateGallery}. */
export interface GalleryGeneratorOptions {
  /** Owning Plot id (becomes {@link EcsWorld.plotId}). */
  plotId: string;
  /** Human-readable gallery title (defaults to "个人展厅"). */
  title?: string;
  /** Room/floor mesh preset (defaults to "gallery_hall"). */
  roomPreset?: string;
  /** Pedestal mesh preset placed under each exhibit (defaults to "pedestal_marble"). */
  pedestalPreset?: string;
  /**
   * Exhibits to lay out. When omitted, a single placeholder exhibit is generated
   * so the gallery is renderable out of the box.
   */
  exhibits?: GalleryExhibitSpec[];
  /** Spacing (world units) between auto-laid-out exhibits (defaults to 3). */
  exhibitSpacing?: number;
  /** When false, no pedestal entity is placed under exhibits (defaults true). */
  withPedestals?: boolean;
}

// ============================================================
// Selectable exhibits (resolved per-creator from owned assets)
// ============================================================

/**
 * Build gallery exhibit specs from a creator's read-only asset handles — a
 * convenience for "showcase everything I own". Only `worldAsset`-kind handles
 * become exhibits; souls/pets are excluded. Pure function — no I/O, no ownership
 * resolution (that already happened server-side when the handles were produced).
 *
 * The resulting specs can be passed straight to {@link generateGallery}.
 */
export function buildExhibitsFromHandles(
  handles: ReadonlyAssetHandle[],
): GalleryExhibitSpec[] {
  if (!handles || handles.length === 0) {
    return [];
  }
  return handles
    .filter((h) => h.kind === 'worldAsset')
    .map((h, i) => ({
      id: `exhibit_${i + 1}`,
      displayName: h.name,
      assetRef: h.assetId,
    }));
}

// ============================================================
// Generator
// ============================================================

const DEFAULT_TITLE = '个人展厅';
const DEFAULT_ROOM_PRESET = 'gallery_hall';
const DEFAULT_PEDESTAL_PRESET = 'pedestal_marble';
const DEFAULT_EXHIBIT_PRESET = 'exhibit_placeholder';
const DEFAULT_SPACING = 3;
const PEDESTAL_HEIGHT = 1;

/** The single placeholder exhibit generated when no roster is supplied. */
function defaultExhibits(): GalleryExhibitSpec[] {
  return [
    {
      id: 'exhibit_1',
      displayName: '展品',
      meshPreset: DEFAULT_EXHIBIT_PRESET,
    },
  ];
}

/** Build the declarative room shell + gallery lighting entities. */
function buildRoomEntities(roomPreset: string): EcsEntity[] {
  return [
    {
      id: 'gallery_room',
      components: {
        transform: { pos: [0, 0, 0] },
        mesh: { preset: roomPreset },
        collider: { shape: 'box', walkable: true },
      },
    },
    {
      id: 'gallery_ambient_light',
      components: {
        light: { type: 'ambient', color: '#ffffff', intensity: 0.6 },
      },
    },
    {
      id: 'gallery_key_light',
      components: {
        transform: { pos: [0, 6, 0] },
        light: { type: 'directional', color: '#fff5e1', intensity: 1.0 },
      },
    },
  ];
}

/** Resolve the floor position of the i-th exhibit (explicit or auto-laid-out row). */
function resolveExhibitPosition(
  exhibit: GalleryExhibitSpec,
  index: number,
  spacing: number,
): Vec3 {
  if (exhibit.position) {
    return [exhibit.position[0], exhibit.position[1], exhibit.position[2]];
  }
  // Lay exhibits out along the X axis, centered around the origin.
  return [index * spacing, 0, 0];
}

/**
 * Build the declarative entities for a single exhibit: an optional pedestal, the
 * exhibit mesh, and an optional UI placard. All declarative — no behavior.
 */
function buildExhibitEntities(
  exhibit: GalleryExhibitSpec,
  index: number,
  spacing: number,
  withPedestals: boolean,
  pedestalPreset: string,
): EcsEntity[] {
  const entities: EcsEntity[] = [];
  const [x, y, z] = resolveExhibitPosition(exhibit, index, spacing);

  let exhibitY = y;
  if (withPedestals) {
    entities.push({
      id: `pedestal_${exhibit.id}`,
      components: {
        transform: { pos: [x, y, z] },
        mesh: { preset: pedestalPreset },
        collider: { shape: 'box', walkable: false },
      },
    });
    // Sit the exhibit on top of the pedestal.
    exhibitY = y + PEDESTAL_HEIGHT;
  }

  // The exhibit itself — render a World_Asset when referenced, else a preset.
  entities.push({
    id: exhibit.id,
    components: {
      transform: { pos: [x, exhibitY, z] },
      mesh: exhibit.assetRef
        ? { assetRef: exhibit.assetRef }
        : { preset: exhibit.meshPreset ?? DEFAULT_EXHIBIT_PRESET },
      affordance: { tags: ['exhibit'] },
    },
  });

  // Optional declarative placard labelling the exhibit (display-only UI).
  const showPlacard = exhibit.showPlacard !== false;
  if (showPlacard && exhibit.displayName) {
    entities.push({
      id: `placard_${exhibit.id}`,
      components: {
        transform: { pos: [x, exhibitY + 0.5, z] },
        ui: { panel: 'placard', text: exhibit.displayName },
      },
    });
  }

  return entities;
}

/**
 * Generate the Tier_A ECS_World for a personal gallery / palace (R14.1/R14.2).
 *
 * Pure function — deterministic given its options, no I/O and no mutation of
 * inputs. The returned world is Tier_A-compliant by construction: it contains
 * ONLY declarative scene-graph data (room + lights + pedestals + exhibit meshes
 * + UI placards) and emits NO `rules`, NO `logicModules`, and NO `logicModuleRef`
 * component — so it passes {@link validateTier} and has no executable logic
 * (R14.2). Published galleries are instantiated at isolation level L0 (R14.4).
 *
 * Editing the gallery (NL or direct manipulation) does not go through this
 * generator — it reuses the shared EcsWorldService diff/version channel writing
 * into this same Tier_A ECS_World (R14.3).
 *
 * @param opts gallery generation options (plot id, exhibits, layout)
 * @returns a Tier_A {@link EcsWorld} ready for diff/version persistence
 */
export function generateGallery(opts: GalleryGeneratorOptions): EcsWorld {
  const plotId = opts.plotId;
  const title = opts.title ?? DEFAULT_TITLE;
  const roomPreset = opts.roomPreset ?? DEFAULT_ROOM_PRESET;
  const pedestalPreset = opts.pedestalPreset ?? DEFAULT_PEDESTAL_PRESET;
  const spacing = opts.exhibitSpacing && opts.exhibitSpacing > 0 ? opts.exhibitSpacing : DEFAULT_SPACING;
  const withPedestals = opts.withPedestals !== false;
  const exhibits =
    opts.exhibits && opts.exhibits.length > 0 ? opts.exhibits : defaultExhibits();

  const exhibitEntities = exhibits.flatMap((exhibit, index) =>
    buildExhibitEntities(exhibit, index, spacing, withPedestals, pedestalPreset),
  );

  const entities: EcsEntity[] = [
    ...buildRoomEntities(roomPreset),
    ...exhibitEntities,
  ];

  // Tier_A — declarative scene-graph ONLY. No `rules`, no `logicModules`.
  return {
    ecsVersion: ECS_VERSION,
    plotId,
    substrateTier: 'A',
    entities,
    // Declarative-only manifest describing the layout (no executable logic).
    defs: {
      exhibits: exhibits.map((exhibit) => ({
        id: exhibit.id,
        ...(exhibit.displayName ? { displayName: exhibit.displayName } : {}),
        ...(exhibit.assetRef ? { assetRef: exhibit.assetRef } : {}),
      })),
      withPedestals,
    },
    meta: {
      createdBy: 'agent',
      title,
      kind: 'gallery',
    },
  };
}
