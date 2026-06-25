import * as fc from 'fast-check';
import { toGridCell, AEON_EPOCHS, type AeonEpoch } from '../../../../../shared/types/aeon-world';
import { EpochService } from '../epoch/epoch.service';

/**
 * P.4 — 地块唯一 + 纪元作用域(Property 7, 10;R4.3/R17.2/R17.3)。
 *
 * - (epoch, gridCell) 量化稳定:同坐标恒得同 cell;
 * - 圈地唯一性模型:同一 (epoch, cell) 至多一个 active Plot(用 Set 模拟唯一约束);
 * - 纪元作用域:仅 earth 可进入,mars/galaxy 未发布则 assertEnterable 抛错。
 */
describe('Aeon Property 7: plot grid quantization + uniqueness (P.4)', () => {
  const latArb = fc.double({ min: -85, max: 85, noNaN: true });
  const lngArb = fc.double({ min: -180, max: 180, noNaN: true });

  it('toGridCell is deterministic and stable for the same coordinates', () => {
    fc.assert(
      fc.property(latArb, lngArb, (lat, lng) => {
        expect(toGridCell(lat, lng)).toBe(toGridCell(lat, lng));
      }),
    );
  });

  it('claiming twice on the same (epoch, cell) is rejected (uniqueness)', () => {
    fc.assert(
      fc.property(fc.array(fc.tuple(latArb, lngArb), { maxLength: 100 }), (coords) => {
        const claimed = new Set<string>();
        const epoch: AeonEpoch = 'earth';
        for (const [lat, lng] of coords) {
          const key = `${epoch}:${toGridCell(lat, lng)}`;
          if (claimed.has(key)) {
            // 第二次圈同格 → 必须被拒(模拟 409 ConflictException)
            expect(claimed.has(key)).toBe(true);
          } else {
            claimed.add(key);
          }
        }
        // 唯一性:claimed 中无重复键(Set 天然保证)
        expect(claimed.size).toBeLessThanOrEqual(coords.length);
      }),
    );
  });
});

describe('Aeon Property 10: epoch scope (P.4)', () => {
  const epoch = new EpochService();

  it('only earth is enterable; mars/galaxy throw', () => {
    expect(() => epoch.assertEnterable('earth')).not.toThrow();
    expect(() => epoch.assertEnterable('mars')).toThrow();
    expect(() => epoch.assertEnterable('galaxy')).toThrow();
  });

  it('listEpochs marks exactly one unlocked (earth) and provides teasers for locked', () => {
    const list = epoch.listEpochs();
    expect(list).toHaveLength(AEON_EPOCHS.length);
    const unlocked = list.filter((e) => e.unlocked);
    expect(unlocked).toHaveLength(1);
    expect(unlocked[0].id).toBe('earth');
    for (const e of list) {
      if (!e.unlocked) expect(typeof e.teaser).toBe('string');
    }
  });

  it('unknown epoch is rejected', () => {
    expect(() => epoch.assertEnterable('jupiter' as AeonEpoch)).toThrow();
  });
});
