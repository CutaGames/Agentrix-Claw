/**
 * shopQuickOrder 纯逻辑单测(World Creation & Feed · task 3.5)。
 *
 * spec: .kiro/specs/world-creation-feed/{requirements,design}.md
 *   - 需求 5.7(流内快捷下单)、7.1(展示价仅提示,权威金额服务端计算)、
 *     7.2(失败余额不变,返回结构化原因 ECONOMY_REJECTED)。
 *
 * 仅覆盖无 RN 依赖的纯逻辑(组件渲染测试在 jest-expo 落地后补,见 jest.config.js)。
 */
import {
  ORDER_VERB,
  MIN_QUANTITY,
  selectOrderableOfferings,
  pickDefaultOffering,
  offeringMaxQuantity,
  clampQuantity,
  canDecrement,
  canIncrement,
  isSoldOut,
  offeringUnitDisplayPrice,
  displayLineTotal,
  formatDisplayPrice,
  buildOrderInvokeRequest,
  interpretInvokeResponse,
} from '../shopQuickOrder';
import type { ShopOrderResult } from '../shopQuickOrder';
import type { CreationDiscoveryItem, Offering } from '../../../shared/types/creation';
import type { InvokeCreationResponse } from '../../../shared/types/creation-api';

/** 失败分支取值(规避 ts-jest strict:false 下的负分支收窄缺陷)。 */
type FailResult = Extract<ShopOrderResult, { ok: false }>;

function offering(over: Partial<Offering> = {}): Offering {
  return {
    id: 'off-1',
    kind: 'product',
    name: '美式咖啡',
    verbs: ['order'],
    price: { axp: 18 },
    ...over,
  };
}

function feedItem(offerings: Offering[]): CreationDiscoveryItem {
  return {
    id: 'creation-1',
    type: 'shop',
    title: '深夜手冲咖啡馆',
    preview: { kind: 'cover', url: '' },
    creator: { accountId: 'owner-1', name: '豆豆' },
    metrics: { views: 0, likes: 0, sales: 0, comments: 0 },
    canEnter: true,
    offerings,
  };
}

describe('selectOrderableOfferings', () => {
  it('keeps only offerings that support the order verb', () => {
    const item = feedItem([
      offering({ id: 'a', verbs: ['order'] }),
      offering({ id: 'b', verbs: ['query'] }),
      offering({ id: 'c', verbs: ['book', 'order'] }),
    ]);
    expect(selectOrderableOfferings(item).map((o) => o.id)).toEqual(['a', 'c']);
  });

  it('returns empty when item has no offerings', () => {
    const item = feedItem([]);
    expect(selectOrderableOfferings(item)).toEqual([]);
  });
});

describe('pickDefaultOffering', () => {
  it('returns first offering or null', () => {
    expect(pickDefaultOffering([offering({ id: 'x' })])?.id).toBe('x');
    expect(pickDefaultOffering([])).toBeNull();
  });
});

describe('quantity stepping + stock clamping', () => {
  it('clamps below minimum up to 1', () => {
    expect(clampQuantity(0)).toBe(MIN_QUANTITY);
    expect(clampQuantity(-5)).toBe(MIN_QUANTITY);
  });

  it('floors fractional quantities', () => {
    expect(clampQuantity(3.9)).toBe(3);
  });

  it('clamps to stock ceiling', () => {
    expect(clampQuantity(10, 4)).toBe(4);
  });

  it('handles sold-out (stock 0) by clamping to 0', () => {
    expect(clampQuantity(3, 0)).toBe(0);
  });

  it('falls back to minimum on non-finite input', () => {
    expect(clampQuantity(NaN)).toBe(MIN_QUANTITY);
    expect(clampQuantity(Infinity, undefined)).toBe(MIN_QUANTITY);
  });

  it('decrement allowed only above minimum', () => {
    expect(canDecrement(1)).toBe(false);
    expect(canDecrement(2)).toBe(true);
  });

  it('increment respects stock ceiling, unbounded when no stock', () => {
    expect(canIncrement(3, 4)).toBe(true);
    expect(canIncrement(4, 4)).toBe(false);
    expect(canIncrement(999)).toBe(true);
  });

  it('reads stock from availability', () => {
    expect(offeringMaxQuantity(offering({ availability: { stock: 7 } }))).toBe(7);
    expect(offeringMaxQuantity(offering())).toBeUndefined();
    expect(offeringMaxQuantity(null)).toBeUndefined();
  });

  it('detects sold-out', () => {
    expect(isSoldOut(offering({ availability: { stock: 0 } }))).toBe(true);
    expect(isSoldOut(offering({ availability: { stock: 2 } }))).toBe(false);
    expect(isSoldOut(offering())).toBe(false);
  });
});

describe('display price (NON-AUTHORITATIVE)', () => {
  it('reads unit price from offering', () => {
    expect(offeringUnitDisplayPrice(offering({ price: { axp: 18 } }))).toEqual({
      axp: 18,
      usd: undefined,
      hasPrice: true,
    });
  });

  it('marks no price', () => {
    const dp = offeringUnitDisplayPrice(offering({ price: undefined }));
    expect(dp.hasPrice).toBe(false);
    expect(formatDisplayPrice(dp)).toBe('—');
  });

  it('multiplies unit by quantity for a display-only line total', () => {
    const dp = displayLineTotal(offering({ price: { axp: 18, usd: 2.5 } }), 3);
    expect(dp.axp).toBe(54);
    expect(dp.usd).toBe(7.5);
  });

  it('formats axp before usd, trims trailing zeros', () => {
    expect(formatDisplayPrice({ axp: 18, hasPrice: true })).toBe('18 AXP');
    expect(formatDisplayPrice({ usd: 2.5, hasPrice: true })).toBe('$2.5');
    expect(formatDisplayPrice({ usd: 3.0, hasPrice: true })).toBe('$3');
  });
});

describe('buildOrderInvokeRequest', () => {
  it('builds an authoritative invoke(order) request', () => {
    const req = buildOrderInvokeRequest({
      offeringId: 'off-1',
      quantity: 2,
      onBehalfOfAccountId: 'user-9',
    });
    expect(req.verb).toBe(ORDER_VERB);
    expect(req.toolName).toBe('order');
    expect(req.offeringId).toBe('off-1');
    expect(req.args).toEqual({ offeringId: 'off-1', qty: 2 });
    expect(req.onBehalfOfAccountId).toBe('user-9');
  });
});

describe('interpretInvokeResponse', () => {
  it('maps ok outcome to success with authoritative amount', () => {
    const res: InvokeCreationResponse = {
      outcome: 'ok',
      verb: 'order',
      invocationId: 'inv-1',
      authoritativeAmount: 36,
      platformCut: 3,
      result: { receiptId: 'r-1' },
    };
    const r = interpretInvokeResponse(res);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.authoritativeAmount).toBe(36);
      expect(r.platformCut).toBe(3);
      expect(r.invocationId).toBe('inv-1');
    }
  });

  it('maps rejected outcome to structured failure (ECONOMY_REJECTED)', () => {
    const res: InvokeCreationResponse = {
      outcome: 'rejected',
      verb: 'order',
      invocationId: 'inv-2',
      error: { error: 'ECONOMY_REJECTED', detail: '余额不足' },
    };
    const r = interpretInvokeResponse(res);
    expect(r.ok).toBe(false);
    const f = r as FailResult;
    expect(f.code).toBe('ECONOMY_REJECTED');
    expect(f.detail).toBe('余额不足');
  });

  it('treats ok outcome carrying an error as failure (never fakes success)', () => {
    const res: InvokeCreationResponse = {
      outcome: 'ok',
      verb: 'order',
      invocationId: 'inv-3',
      error: { error: 'QUOTA_EXCEEDED', detail: '超额' },
    };
    const r = interpretInvokeResponse(res);
    expect(r.ok).toBe(false);
    expect((r as FailResult).code).toBe('QUOTA_EXCEEDED');
  });

  it('defaults missing error code to ECONOMY_REJECTED', () => {
    const res = {
      outcome: 'rejected',
      verb: 'order',
      invocationId: 'inv-4',
    } as InvokeCreationResponse;
    const r = interpretInvokeResponse(res);
    expect(r.ok).toBe(false);
    expect((r as FailResult).code).toBe('ECONOMY_REJECTED');
  });
});
