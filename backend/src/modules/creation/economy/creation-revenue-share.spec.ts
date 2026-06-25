import {
  resolveSaleType,
  revenueShareRate,
  platformCutOf,
} from './creation-revenue-share';
import {
  REVENUE_SHARE_FIRST_SALE,
  REVENUE_SHARE_SECONDARY_SALE,
} from '../../../../shared/types/world-creation';

/**
 * Unit tests for unified revenue share (task 12.3 / 10.1).
 * 校验:owner===originalCreator → 一级(5%);否则二级(30%);金额计算定点。
 */
describe('creation-revenue-share (task 12.3)', () => {
  it('owner===originalCreator → first sale', () => {
    expect(resolveSaleType('a', 'a')).toBe('first');
    expect(revenueShareRate('first')).toBe(REVENUE_SHARE_FIRST_SALE);
  });

  it('owner!==originalCreator → secondary sale', () => {
    expect(resolveSaleType('buyer', 'creator')).toBe('secondary');
    expect(revenueShareRate('secondary')).toBe(REVENUE_SHARE_SECONDARY_SALE);
  });

  it('platformCutOf:一级 5%', () => {
    expect(platformCutOf(100, 'a', 'a')).toBe(100 * REVENUE_SHARE_FIRST_SALE);
  });

  it('platformCutOf:二级 30%', () => {
    expect(platformCutOf(100, 'buyer', 'creator')).toBe(100 * REVENUE_SHARE_SECONDARY_SALE);
  });

  it('platformCutOf:非正金额 → 0', () => {
    expect(platformCutOf(0, 'a', 'b')).toBe(0);
    expect(platformCutOf(-5, 'a', 'b')).toBe(0);
  });
});
