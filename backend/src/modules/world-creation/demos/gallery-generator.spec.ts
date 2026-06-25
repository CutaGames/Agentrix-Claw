/**
 * Unit tests for the Tier_A personal gallery / palace demo (task 17.2, R14.2/R14.4).
 *
 * Verifies the generator emits a pure declarative scene-graph with:
 *   - substrateTier === 'A' and validateTier() === null,
 *   - NO `rules` and NO `logicModules`, and no entity carrying a
 *     `logicModuleRef` component (no executable logic — R14.2),
 *   - an exhibit layout with lighting, pedestals and UI placards,
 * and that {@link buildExhibitsFromHandles} only turns `worldAsset` handles into
 * exhibits. It also confirms the published gallery instantiates at isolation
 * level L0 via {@link SandboxService.renderTierA} (R14.4).
 */

import {
  GalleryExhibitSpec,
  buildExhibitsFromHandles,
  generateGallery,
} from './gallery-generator';
import { validateTier } from '../ecs/tier-validator';
import { SandboxService } from '../services/sandbox.service';
import type { ReadonlyAssetHandle } from '../../../../shared/types/world-creation-api';

describe('generateGallery (Tier_A gallery demo)', () => {
  // ── R14.2: declarative-only Tier_A, no executable logic ──────────────────
  describe('Tier_A compliance — no rules / logicModules (R14.2)', () => {
    it('produces a Tier_A ECS_World that passes validateTier', () => {
      const world = generateGallery({ plotId: 'plot_gallery' });
      expect(world.substrateTier).toBe('A');
      expect(validateTier(world)).toBeNull();
    });

    it('emits no Substrate_DSL rules and no Tier_C logic modules', () => {
      const world = generateGallery({
        plotId: 'plot_gallery',
        exhibits: [
          { id: 'exhibit_1', displayName: '青花瓷', assetRef: 'asset_a' },
          { id: 'exhibit_2', displayName: '玉器', assetRef: 'asset_b' },
        ],
      });
      expect(world.rules ?? []).toHaveLength(0);
      expect(world.logicModules ?? []).toHaveLength(0);
    });

    it('emits no entity carrying a logicModuleRef component', () => {
      const world = generateGallery({
        plotId: 'plot_gallery',
        exhibits: [
          { id: 'exhibit_1', displayName: '展品A', assetRef: 'asset_a' },
          { id: 'exhibit_2', displayName: '展品B', meshPreset: 'vase' },
        ],
      });
      for (const entity of world.entities) {
        expect(entity.components.logicModuleRef).toBeUndefined();
      }
      // The serialized world never mentions executable-logic carriers.
      expect(JSON.stringify(world)).not.toMatch(/logicModule/i);
    });

    it('still passes validateTier even with an explicit empty exhibit roster (default fallback)', () => {
      const world = generateGallery({ plotId: 'plot_gallery', exhibits: [] });
      expect(world.substrateTier).toBe('A');
      expect(validateTier(world)).toBeNull();
      // A default placeholder exhibit keeps the gallery renderable.
      expect(world.entities.some((e) => e.id === 'exhibit_1')).toBe(true);
    });
  });

  // ── Declarative scene-graph content: layout / lighting / placards ────────
  describe('declarative scene-graph content', () => {
    it('includes the room shell plus gallery lighting entities', () => {
      const world = generateGallery({ plotId: 'plot_gallery' });
      const ids = world.entities.map((e) => e.id);
      expect(ids).toContain('gallery_room');
      expect(ids).toContain('gallery_ambient_light');
      expect(ids).toContain('gallery_key_light');

      const ambient = world.entities.find((e) => e.id === 'gallery_ambient_light');
      expect(ambient?.components.light?.type).toBe('ambient');
      const key = world.entities.find((e) => e.id === 'gallery_key_light');
      expect(key?.components.light?.type).toBe('directional');
    });

    it('places a pedestal under each exhibit and lays out exhibits along a row', () => {
      const exhibits: GalleryExhibitSpec[] = [
        { id: 'exhibit_1', displayName: 'A', assetRef: 'asset_a' },
        { id: 'exhibit_2', displayName: 'B', assetRef: 'asset_b' },
      ];
      const world = generateGallery({ plotId: 'plot_gallery', exhibits, exhibitSpacing: 3 });

      // A pedestal entity per exhibit.
      expect(world.entities.some((e) => e.id === 'pedestal_exhibit_1')).toBe(true);
      expect(world.entities.some((e) => e.id === 'pedestal_exhibit_2')).toBe(true);

      // Exhibits laid out along the X axis with the configured spacing.
      const e1 = world.entities.find((e) => e.id === 'exhibit_1');
      const e2 = world.entities.find((e) => e.id === 'exhibit_2');
      expect(e1?.components.transform?.pos?.[0]).toBe(0);
      expect(e2?.components.transform?.pos?.[0]).toBe(3);
      // Exhibit references its World_Asset (display-only, no ownership proof).
      expect(e1?.components.mesh?.assetRef).toBe('asset_a');
      expect(e1?.components.affordance?.tags).toContain('exhibit');
    });

    it('emits a UI placard for each named exhibit', () => {
      const world = generateGallery({
        plotId: 'plot_gallery',
        exhibits: [{ id: 'exhibit_1', displayName: '青花瓷', assetRef: 'asset_a' }],
      });
      const placard = world.entities.find((e) => e.id === 'placard_exhibit_1');
      expect(placard?.components.ui?.panel).toBe('placard');
      expect(placard?.components.ui?.text).toBe('青花瓷');
    });

    it('omits pedestals and placards when disabled', () => {
      const world = generateGallery({
        plotId: 'plot_gallery',
        withPedestals: false,
        exhibits: [{ id: 'exhibit_1', showPlacard: false, meshPreset: 'vase' }],
      });
      expect(world.entities.some((e) => e.id.startsWith('pedestal_'))).toBe(false);
      expect(world.entities.some((e) => e.id.startsWith('placard_'))).toBe(false);
    });

    it('records a declarative exhibits manifest in defs', () => {
      const world = generateGallery({
        plotId: 'plot_gallery',
        exhibits: [{ id: 'exhibit_1', displayName: '青花瓷', assetRef: 'asset_a' }],
      });
      const defExhibits = (world.defs?.exhibits ?? []) as Array<Record<string, unknown>>;
      expect(defExhibits).toEqual([
        { id: 'exhibit_1', displayName: '青花瓷', assetRef: 'asset_a' },
      ]);
    });
  });

  // ── buildExhibitsFromHandles: only worldAsset handles become exhibits ────
  describe('buildExhibitsFromHandles', () => {
    it('turns only worldAsset handles into exhibits (souls/pets excluded)', () => {
      const handles: ReadonlyAssetHandle[] = [
        { assetId: 'wa_1', kind: 'worldAsset', name: '青花瓷' },
        { assetId: 'soul_1', kind: 'soul', name: '灵魂' },
        { assetId: 'pet_1', kind: 'pet', name: '宠物' },
        { assetId: 'wa_2', kind: 'worldAsset', name: '玉器' },
      ];
      const specs = buildExhibitsFromHandles(handles);
      expect(specs).toEqual([
        { id: 'exhibit_1', displayName: '青花瓷', assetRef: 'wa_1' },
        { id: 'exhibit_2', displayName: '玉器', assetRef: 'wa_2' },
      ]);
    });

    it('returns an empty roster for empty / nullish input', () => {
      expect(buildExhibitsFromHandles([])).toEqual([]);
      expect(buildExhibitsFromHandles(undefined as unknown as ReadonlyAssetHandle[])).toEqual([]);
    });

    it('feeds straight into generateGallery to produce a compliant Tier_A world', () => {
      const handles: ReadonlyAssetHandle[] = [
        { assetId: 'wa_1', kind: 'worldAsset', name: '展品一' },
        { assetId: 'soul_1', kind: 'soul', name: '灵魂' },
      ];
      const world = generateGallery({
        plotId: 'plot_gallery',
        exhibits: buildExhibitsFromHandles(handles),
      });
      expect(validateTier(world)).toBeNull();
      // Only the worldAsset handle produced an exhibit entity.
      expect(world.entities.some((e) => e.id === 'exhibit_1')).toBe(true);
      expect(world.entities.some((e) => e.id === 'exhibit_2')).toBe(false);
    });
  });

  // ── Determinism ──────────────────────────────────────────────────────────
  it('is deterministic for identical options', () => {
    const opts = {
      plotId: 'plot_gallery',
      title: '我的展厅',
      exhibits: [
        { id: 'exhibit_1', displayName: 'A', assetRef: 'asset_a' },
        { id: 'exhibit_2', displayName: 'B', meshPreset: 'vase' },
      ],
    };
    const a = generateGallery(opts);
    const b = generateGallery(opts);
    expect(JSON.stringify(a)).toEqual(JSON.stringify(b));
  });

  // ── R14.4: published gallery instantiates at isolation level L0 ──────────
  describe('SandboxService.renderTierA — L0 instantiation (R14.4)', () => {
    it('renders the gallery as an L0 declarative render description', () => {
      const sandbox = new SandboxService();
      const world = generateGallery({
        plotId: 'plot_gallery',
        exhibits: [{ id: 'exhibit_1', displayName: '青花瓷', assetRef: 'asset_a' }],
      });

      const desc = sandbox.renderTierA(world);

      expect(desc.isolationLevel).toBe('L0');
      expect(desc.substrateTier).toBe('A');
      expect(desc.plotId).toBe('plot_gallery');

      // The declarative scene-graph maps 1:1 to render nodes (no code execution).
      const nodeIds = desc.nodes.map((n) => n.id);
      expect(nodeIds).toContain('gallery_room');
      expect(nodeIds).toContain('gallery_ambient_light');
      expect(nodeIds).toContain('exhibit_1');

      // The placard UI is hoisted out for the HUD.
      const placardUi = desc.ui.find((u) => u.entityId === 'placard_exhibit_1');
      expect(placardUi?.panel).toBe('placard');
      expect(placardUi?.text).toBe('青花瓷');
    });
  });
});
