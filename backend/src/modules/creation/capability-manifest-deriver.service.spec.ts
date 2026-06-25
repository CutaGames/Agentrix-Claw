import {
  CapabilityManifestDeriverService,
  type CapabilityManifestDerivationInput,
  type CustomToolDeclaration,
} from './capability-manifest-deriver.service';
import type { Offering } from '../../../shared/types/creation';
import type { CreationMcpToolDescriptor } from '../../../shared/types/creation-api';

/**
 * Unit tests for the capability-manifest deriver (world-creation-feed task 2.2).
 *
 * Validates:
 *  - 需求 1.11:从 offerings **自动派生** MCP 风格能力清单(创作者不手写 schema)。
 *  - 需求 13.2:标准动词 query/order/book/message/subscribe/donate 映射为工具。
 *  - 需求 13.3:每个 (offering, verb) → 一个标准化 MCP 工具描述符。
 *  - 需求 13.6:Tier_C opt-in customTools —— 仅 tier C 纳入。
 *  - Property 5:manifestVersion 单调递增。
 *
 * 纯逻辑 —— 无 DB / 无 Nest TestingModule。
 */

function offering(partial: Partial<Offering> & Pick<Offering, 'id' | 'kind' | 'verbs'>): Offering {
  return { name: partial.id, ...partial } as Offering;
}

function baseInput(
  offerings: Offering[],
  overrides: Partial<CapabilityManifestDerivationInput> = {},
): CapabilityManifestDerivationInput {
  return {
    creationId: 'creation_1',
    ecsVersionId: 'ecs_v1',
    substrateTier: 'A',
    offerings,
    ...overrides,
  };
}

function toolByName(
  tools: CreationMcpToolDescriptor[],
  name: string,
): CreationMcpToolDescriptor | undefined {
  return tools.find((t) => t.name === name);
}

describe('CapabilityManifestDeriverService (task 2.2)', () => {
  let deriver: CapabilityManifestDeriverService;

  beforeEach(() => {
    deriver = new CapabilityManifestDeriverService();
  });

  // ============================================================
  // (offering, verb) → 标准化工具(需求 13.2 / 13.3)
  // ============================================================

  describe('verb → tool mapping', () => {
    it('generates one tool per (offering, verb) with unique names', () => {
      const manifest = deriver.derive(
        baseInput([
          offering({ id: 'coffee', kind: 'product', name: '美式咖啡', verbs: ['query', 'order'] }),
        ]),
      );

      expect(manifest.tools).toHaveLength(2);
      expect(manifest.tools.map((t) => t.name)).toEqual(['query_coffee', 'order_coffee']);
      expect(manifest.creationId).toBe('creation_1');
      expect(manifest.ecsVersionId).toBe('ecs_v1');
    });

    it('derives an order tool with qty schema and consume/budget flags', () => {
      const manifest = deriver.derive(
        baseInput([
          offering({
            id: 'coffee',
            kind: 'product',
            name: '美式咖啡',
            verbs: ['order'],
            price: { axp: 50 },
          }),
        ]),
      );

      const order = toolByName(manifest.tools, 'order_coffee');
      expect(order).toBeDefined();
      expect(order!.verb).toBe('order');
      expect(order!.offeringId).toBe('coffee');
      expect(order!.consumes).toBe(true);
      expect(order!.budgetGated).toBe(true);
      expect(order!.currency).toBe('AXP');
      const schema = order!.inputSchema as Record<string, any>;
      expect(schema.required).toEqual(['offeringId', 'qty']);
      expect(schema.properties.qty.type).toBe('integer');
      expect(schema.properties.qty.minimum).toBe(1);
    });

    it('derives a book tool with slot schema for service/ticket offerings', () => {
      const manifest = deriver.derive(
        baseInput([
          offering({ id: 'massage', kind: 'service', name: '按摩', verbs: ['book'] }),
        ]),
      );

      const book = toolByName(manifest.tools, 'book_massage');
      expect(book).toBeDefined();
      expect(book!.verb).toBe('book');
      expect(book!.consumes).toBe(true);
      const schema = book!.inputSchema as Record<string, any>;
      expect(schema.required).toEqual(['offeringId', 'slot']);
      expect(schema.properties.slot.type).toBe('string');
    });

    it('derives query/message tools as non-consuming with no budget gate', () => {
      const manifest = deriver.derive(
        baseInput([
          offering({ id: 'info', kind: 'product', name: '咨询', verbs: ['query', 'message'] }),
        ]),
      );

      const query = toolByName(manifest.tools, 'query_info')!;
      const message = toolByName(manifest.tools, 'message_info')!;
      expect(query.consumes).toBe(false);
      expect(query.budgetGated).toBe(false);
      expect(query.requiredTrustLevel).toBe(0);
      expect(message.consumes).toBe(false);
      // message 的 text 必填、offeringId 可空。
      const schema = message.inputSchema as Record<string, any>;
      expect(schema.required).toEqual(['text']);
    });

    it('derives subscribe and donate tools with budget gating', () => {
      const manifest = deriver.derive(
        baseInput([
          offering({ id: 'vip', kind: 'subscription', name: '会员', verbs: ['subscribe'] }),
          offering({ id: 'jar', kind: 'tip', name: '打赏罐', verbs: ['donate'] }),
        ]),
      );

      const sub = toolByName(manifest.tools, 'subscribe_vip')!;
      const donate = toolByName(manifest.tools, 'donate_jar')!;
      expect(sub.consumes).toBe(true);
      expect(sub.budgetGated).toBe(true);
      expect((sub.inputSchema as any).required).toEqual(['offeringId', 'period']);
      expect(donate.consumes).toBe(true);
      expect(donate.budgetGated).toBe(true);
      expect((donate.inputSchema as any).required).toEqual(['offeringId', 'amount']);
    });

    it('constrains order qty maximum from offering stock', () => {
      const manifest = deriver.derive(
        baseInput([
          offering({
            id: 'limited',
            kind: 'product',
            name: '限量品',
            verbs: ['order'],
            availability: { stock: 3 },
          }),
        ]),
      );

      const schema = toolByName(manifest.tools, 'order_limited')!.inputSchema as Record<string, any>;
      expect(schema.properties.qty.maximum).toBe(3);
    });

    it('derives a book slot enum from the availability schedule', () => {
      const manifest = deriver.derive(
        baseInput([
          offering({
            id: 'clinic',
            kind: 'service',
            name: '门诊',
            verbs: ['book'],
            availability: { schedule: [{ startsAt: 1000 }, { startsAt: 2000 }] },
          }),
        ]),
      );

      const schema = toolByName(manifest.tools, 'book_clinic')!.inputSchema as Record<string, any>;
      expect(schema.properties.slot.enum).toEqual(['1000', '2000']);
    });

    it('requires trust level 3 for real-currency (USD) consuming verbs', () => {
      const manifest = deriver.derive(
        baseInput([
          offering({
            id: 'premium',
            kind: 'product',
            name: '高级商品',
            verbs: ['order'],
            price: { usd: 9.99 },
          }),
        ]),
      );

      const order = toolByName(manifest.tools, 'order_premium')!;
      expect(order.requiredTrustLevel).toBe(3);
      expect(order.currency).toBe('USD');
    });

    it('deduplicates repeated verbs within a single offering', () => {
      const manifest = deriver.derive(
        baseInput([
          offering({ id: 'x', kind: 'product', name: 'X', verbs: ['query', 'order', 'query'] }),
        ]),
      );

      expect(manifest.tools.map((t) => t.name)).toEqual(['query_x', 'order_x']);
    });

    it('returns an empty tool list when there are no offerings', () => {
      const manifest = deriver.derive(baseInput([]));
      expect(manifest.tools).toEqual([]);
      expect(manifest.customTools).toBeUndefined();
    });
  });

  // ============================================================
  // Tier_C opt-in customTools(需求 13.6)
  // ============================================================

  describe('Tier_C opt-in customTools', () => {
    const customDecl: CustomToolDeclaration = {
      name: 'simulate_battle',
      verb: 'order',
      description: 'run a custom turing-complete simulation',
      zhDescription: '运行自定义模拟',
      inputSchema: { type: 'object', properties: { seed: { type: 'number' } } },
    };

    it('includes customTools only when substrateTier is C', () => {
      const manifest = deriver.derive(
        baseInput([offering({ id: 'a', kind: 'product', name: 'A', verbs: ['order'] })], {
          substrateTier: 'C',
          customTools: [customDecl],
        }),
      );

      expect(manifest.customTools).toHaveLength(1);
      const custom = manifest.customTools![0];
      expect(custom.name).toBe('simulate_battle');
      expect(custom.isCustomTool).toBe(true);
      expect(custom.consumes).toBe(true);
      expect(custom.budgetGated).toBe(true);
    });

    it('ignores customTools for non-C tiers even when opted in', () => {
      for (const tier of ['A', 'B'] as const) {
        const manifest = deriver.derive(
          baseInput([offering({ id: 'a', kind: 'product', name: 'A', verbs: ['order'] })], {
            substrateTier: tier,
            customTools: [customDecl],
          }),
        );
        expect(manifest.customTools).toBeUndefined();
      }
    });

    it('does not add customTools key when tier C but none opted in', () => {
      const manifest = deriver.derive(
        baseInput([offering({ id: 'a', kind: 'product', name: 'A', verbs: ['order'] })], {
          substrateTier: 'C',
        }),
      );
      expect(manifest.customTools).toBeUndefined();
    });
  });

  // ============================================================
  // manifestVersion 单调递增(Property 5)
  // ============================================================

  describe('manifestVersion monotonic handling', () => {
    it('starts at version 1 when no previous version is provided', () => {
      const manifest = deriver.derive(baseInput([]));
      expect(manifest.version).toBe(1);
    });

    it('increments monotonically from the previous version', () => {
      const manifest = deriver.derive(baseInput([], { previousManifestVersion: 5 }));
      expect(manifest.version).toBe(6);
    });

    it('treats negative/invalid previous versions as 0', () => {
      const manifest = deriver.derive(baseInput([], { previousManifestVersion: -3 }));
      expect(manifest.version).toBe(1);
    });

    it('exposes nextVersion helper for explicit version bumping', () => {
      expect(deriver.nextVersion()).toBe(1);
      expect(deriver.nextVersion(0)).toBe(1);
      expect(deriver.nextVersion(7)).toBe(8);
    });
  });
});
