import { OfferingDeriverService } from './offering-deriver.service';
import type { EcsEntity, EcsWorld } from '../../../shared/types/world-creation';
import type { Offering } from '../../../shared/types/creation';

/**
 * Unit tests for the Offering deriver (world-creation-feed task 2.1).
 *
 * Validates:
 *  - 需求 1.10:从 ECS_World 派生 0..N 个 Offering(名称/类型/价格/标准动词)。
 *  - 需求 2.10:创作者「标价/标明提供什么」→ 同时供人端与机器端复用;显式标注被尊重。
 *
 * 覆盖:
 *  - 带 price 组件的实体 → product offering(含价格 + order/query 动词 + 溯源 id);
 *  - 商业 affordance 标签 → 对应 kind/verb(service/ticket/subscription/tip);
 *  - 显式标注被尊重(覆盖同 id 派生项 + 追加新项);
 *  - 无供给相关组件的实体 → 不产生 offering。
 *
 * 纯逻辑 —— 无 DB / 无 Nest TestingModule。
 */

function entity(id: string, components: EcsEntity['components']): EcsEntity {
  return { id, components };
}

function world(entities: EcsEntity[]): EcsWorld {
  return {
    ecsVersion: '1.0',
    plotId: 'plot_1',
    substrateTier: 'A',
    entities,
  };
}

describe('OfferingDeriverService (task 2.1)', () => {
  let deriver: OfferingDeriverService;

  beforeEach(() => {
    deriver = new OfferingDeriverService();
  });

  // ============================================================
  // 带 price 组件 → product offering(需求 1.10)
  // ============================================================

  describe('price-bearing entities → product offerings', () => {
    it('derives a product offering from an entity with a price component', () => {
      const w = world([
        entity('coffee', {
          price: { axp: 50, usd: 1.5 },
          ui: { button: '美式咖啡' },
        }),
      ]);

      const offerings = deriver.derive(w);

      expect(offerings).toHaveLength(1);
      expect(offerings[0]).toMatchObject<Partial<Offering>>({
        id: 'coffee',
        kind: 'product',
        name: '美式咖啡',
        price: { axp: 50, usd: 1.5 },
        derivedFromEntityId: 'coffee',
      });
      // 始终含只读 query + 主消费动词 order。
      expect(offerings[0].verbs).toEqual(['query', 'order']);
    });

    it('includes only defined price fields (axp-only)', () => {
      const w = world([entity('item', { price: { axp: 100 } })]);

      const [offering] = deriver.derive(w);

      expect(offering.price).toEqual({ axp: 100 });
      expect(offering.price).not.toHaveProperty('usd');
    });

    it('falls back to a humanized entity id when no ui label exists', () => {
      const w = world([entity('shelf_wood_1', { price: { axp: 5 } })]);

      const [offering] = deriver.derive(w);

      expect(offering.name).toBe('Shelf Wood 1');
    });

    it('omits price when the price component carries no numeric values', () => {
      const w = world([entity('freebie', { price: {} })]);

      const [offering] = deriver.derive(w);

      expect(offering).not.toHaveProperty('price');
      expect(offering.kind).toBe('product');
    });

    it('derives multiple offerings preserving entity order', () => {
      const w = world([
        entity('a', { price: { axp: 1 } }),
        entity('decor', { mesh: { preset: 'plant' } }), // 非供给项
        entity('b', { price: { axp: 2 } }),
      ]);

      const offerings = deriver.derive(w);

      expect(offerings.map((o) => o.id)).toEqual(['a', 'b']);
    });
  });

  // ============================================================
  // 商业 affordance → kind/verb 派生(需求 1.10)
  // ============================================================

  describe('commerce affordance tags → kind & verbs', () => {
    it('maps a bookable affordance to a service offering with book verb', () => {
      const w = world([
        entity('massage', { affordance: { tags: ['bookable'] }, ui: { text: '按摩服务' } }),
      ]);

      const [offering] = deriver.derive(w);

      expect(offering.kind).toBe('service');
      expect(offering.verbs).toEqual(['query', 'book']);
      expect(offering.name).toBe('按摩服务');
    });

    it('maps a ticket affordance to a ticket offering with book verb', () => {
      const w = world([entity('seat_a1', { affordance: { tags: ['ticket'] } })]);

      const [offering] = deriver.derive(w);

      expect(offering.kind).toBe('ticket');
      expect(offering.verbs).toEqual(['query', 'book']);
    });

    it('maps a subscription affordance to subscribe verb', () => {
      const w = world([entity('vip', { affordance: { tags: ['membership'] } })]);

      const [offering] = deriver.derive(w);

      expect(offering.kind).toBe('subscription');
      expect(offering.verbs).toEqual(['query', 'subscribe']);
    });

    it('maps a donation affordance to a tip offering with donate verb', () => {
      const w = world([entity('jar', { affordance: { tags: ['donatable'] } })]);

      const [offering] = deriver.derive(w);

      expect(offering.kind).toBe('tip');
      expect(offering.verbs).toEqual(['query', 'donate']);
    });

    it('prioritizes a commerce affordance tag over the default product kind', () => {
      const w = world([
        entity('ticketed', {
          price: { usd: 20 },
          affordance: { tags: ['walkable', 'ticket'] },
        }),
      ]);

      const [offering] = deriver.derive(w);

      expect(offering.kind).toBe('ticket');
      expect(offering.price).toEqual({ usd: 20 });
    });
  });

  // ============================================================
  // 显式标注被尊重(需求 2.10)
  // ============================================================

  describe('explicit annotations honored', () => {
    it('overrides a derived offering when ids match (shallow merge, explicit wins)', () => {
      const w = world([entity('coffee', { price: { axp: 50 } })]);
      const explicit: Offering = {
        id: 'coffee',
        kind: 'product',
        name: '手冲咖啡(精品)',
        price: { axp: 80 },
        verbs: ['query', 'order', 'subscribe'],
      };

      const offerings = deriver.derive(w, [explicit]);

      expect(offerings).toHaveLength(1);
      expect(offerings[0].name).toBe('手冲咖啡(精品)');
      expect(offerings[0].price).toEqual({ axp: 80 });
      expect(offerings[0].verbs).toEqual(['query', 'order', 'subscribe']);
      // 溯源 id 在显式未指定时由派生项保留。
      expect(offerings[0].derivedFromEntityId).toBe('coffee');
    });

    it('appends explicit offerings that do not match any derived entity', () => {
      const w = world([entity('coffee', { price: { axp: 50 } })]);
      const explicit: Offering = {
        id: 'gift_card',
        kind: 'product',
        name: '礼品卡',
        verbs: ['query', 'order'],
      };

      const offerings = deriver.derive(w, [explicit]);

      expect(offerings.map((o) => o.id)).toEqual(['coffee', 'gift_card']);
    });

    it('returns only explicit offerings when the world is null', () => {
      const explicit: Offering = {
        id: 'service_x',
        kind: 'service',
        name: '上门服务',
        verbs: ['query', 'book'],
      };

      const offerings = deriver.derive(null, [explicit]);

      expect(offerings).toEqual([explicit]);
    });
  });

  // ============================================================
  // 无供给相关组件 → 不产生 offering(需求 1.10:0..N)
  // ============================================================

  describe('entities without offering-relevant components produce none', () => {
    it('produces no offering for a pure ui panel entity', () => {
      const w = world([entity('leaderboard', { ui: { panel: 'leaderboard', kvKey: 'ranks' } })]);

      expect(deriver.derive(w)).toEqual([]);
    });

    it('produces no offering for non-commerce affordance tags', () => {
      const w = world([
        entity('floor', { affordance: { tags: ['walkable'] } }),
        entity('chair', { affordance: { tags: ['sittable', 'pickable'] } }),
      ]);

      expect(deriver.derive(w)).toEqual([]);
    });

    it('produces no offering for purely decorative entities', () => {
      const w = world([
        entity('wall', { mesh: { preset: 'wall' }, collider: { shape: 'box' } }),
      ]);

      expect(deriver.derive(w)).toEqual([]);
    });

    it('returns an empty array for an empty world and no explicit offerings', () => {
      expect(deriver.derive(world([]))).toEqual([]);
      expect(deriver.derive(null)).toEqual([]);
      expect(deriver.derive(undefined)).toEqual([]);
    });
  });
});
